import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantPanel } from "../components/AssistantPanel";
import { createSseParser } from "../data/assistant";
import { structure } from "./fixtures";

function sseResponse(frames: string): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(frames));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("createSseParser", () => {
  it("跨 chunk 切分仍能还原完整帧", () => {
    const frames: { event: string; data: string }[] = [];
    const feed = createSseParser((frame) => frames.push(frame));
    feed('event: meta\ndata: {"mode":"cot"}\n\nevent: del');
    feed('ta\ndata: {"text":"心"}\n\n');
    expect(frames).toEqual([
      { event: "meta", data: '{"mode":"cot"}' },
      { event: "delta", data: '{"text":"心"}' },
    ]);
  });

  it("忽略注释行并支持 CRLF", () => {
    const frames: { event: string; data: string }[] = [];
    const feed = createSseParser((frame) => frames.push(frame));
    feed(': ping\r\n\r\nevent: done\r\ndata: {"degraded":false}\r\n\r\n');
    expect(frames).toEqual([{ event: "done", data: '{"degraded":false}' }]);
  });
});

describe("AssistantPanel", () => {
  it("发送示例问题后流式拼接回答并常显来源", async () => {
    const frames = [
      'event: meta\ndata: {"mode":"cot","sources":[{"n":1,"title":"心肌厚度","url":"https://www.pmph.com","sourceName":"人民卫生出版社《系统解剖学》","license":"版权保留 · 仅作事实引用","snippet":"左心室心肌明显厚于右心室。"}]}\n\n',
      'event: delta\ndata: {"text":"左心室要克服更高的"}\n\n',
      'event: delta\ndata: {"text":"阻力，所以壁更厚。[1]"}\n\n',
      'event: done\ndata: {"degraded":false}\n\n',
    ].join("");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(frames)));

    const user = userEvent.setup();
    render(<AssistantPanel focus={null} />);
    await user.click(screen.getByRole("button", { name: "问问小心" }));
    await user.click(screen.getByRole("button", { name: "左心室为什么比右心室壁厚？" }));

    expect(screen.getByRole("heading", { name: "小心" })).toBeInTheDocument();
    expect(
      await screen.findByText("左心室要克服更高的阻力，所以壁更厚。[1]", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /心肌厚度/ })).toHaveAttribute(
      "href",
      "https://www.pmph.com",
    );
    expect(screen.getByText(/版权保留/)).toBeInTheDocument();
  }, 10000);

  it("整段 SSE 一次到达时仍逐字放出，不瞬间铺满", async () => {
    const long = "左心室壁最厚，因为它要把血射入体循环。".repeat(20);
    const frames = [
      'event: meta\ndata: {"mode":"cot","sources":[]}\n\n',
      `event: delta\ndata: ${JSON.stringify({ text: long })}\n\n`,
      'event: done\ndata: {"degraded":false}\n\n',
    ].join("");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(frames)));

    const user = userEvent.setup();
    render(<AssistantPanel focus={null} />);
    await user.click(screen.getByRole("button", { name: "问问小心" }));
    await user.click(screen.getByRole("button", { name: "左心室为什么比右心室壁厚？" }));

    expect(await screen.findByText(/左心室壁最厚/)).toBeInTheDocument();
    expect(screen.queryByText(long)).toBeNull();
    expect(await screen.findByText(long, {}, { timeout: 4000 })).toBeInTheDocument();
  }, 10000);

  it("页面不可见时直接铺好全文，避免后台节流拖慢", async () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    try {
      const long = "右心室把血泵入肺动脉干。".repeat(10);
      const frames = [
        'event: meta\ndata: {"mode":"cot","sources":[]}\n\n',
        `event: delta\ndata: ${JSON.stringify({ text: long })}\n\n`,
        'event: done\ndata: {"degraded":false}\n\n',
      ].join("");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(frames)));

      const user = userEvent.setup();
      render(<AssistantPanel focus={null} />);
      await user.click(screen.getByRole("button", { name: "问问小心" }));
      await user.click(screen.getByRole("button", { name: "左心室为什么比右心室壁厚？" }));

      expect(await screen.findByText(long, {}, { timeout: 3000 })).toBeInTheDocument();
    } finally {
      hidden.mockRestore();
    }
  }, 10000);

  it("来源等整段回答流完后再逐条出现", async () => {
    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );

    const user = userEvent.setup();
    render(<AssistantPanel focus={null} />);
    await user.click(screen.getByRole("button", { name: "问问小心" }));
    await user.click(screen.getByRole("button", { name: "左心室为什么比右心室壁厚？" }));
    if (!controller) throw new Error("流未建立");
    const stream: ReadableStreamDefaultController<Uint8Array> = controller;

    act(() => {
      stream.enqueue(
        encoder.encode(
          'event: meta\ndata: {"mode":"cot","sources":[{"n":1,"title":"心肌厚度","url":"https://www.pmph.com","sourceName":"人民卫生出版社《系统解剖学》","license":"版权保留 · 仅作事实引用","snippet":"左心室心肌明显厚于右心室。"}]}\n\n',
        ),
      );
    });
    expect(await screen.findByText("已找到 1 条资料，正在作答…")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /心肌厚度/ })).toBeNull();

    act(() => {
      stream.enqueue(encoder.encode('event: delta\ndata: {"text":"左心室先出场。"}\n\n'));
    });
    expect(await screen.findByText("左心室先出场。")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /心肌厚度/ })).toBeNull();

    act(() => {
      stream.enqueue(encoder.encode('event: done\ndata: {"degraded":false}\n\n'));
      stream.close();
    });
    expect(await screen.findByRole("link", { name: /心肌厚度/ })).toBeInTheDocument();
  });

  it("入场气泡先出现，点击小心后收起并打开面板", async () => {
    const user = userEvent.setup();
    render(<AssistantPanel focus={null} />);
    expect(screen.getByText("让我们一起保护我们的心脏，无聊可以点点我")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "问问小心" }));

    expect(screen.queryByText("让我们一起保护我们的心脏，无聊可以点点我")).toBeNull();
    expect(screen.getByRole("region", { name: "小心 · 心脏学习助手" })).toBeInTheDocument();
  });

  it("入场气泡过一会儿自动消失", () => {
    vi.useFakeTimers();
    try {
      render(<AssistantPanel focus={null} />);
      expect(screen.getByText("让我们一起保护我们的心脏，无聊可以点点我")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(7200);
      });
      expect(screen.queryByText("让我们一起保护我们的心脏，无聊可以点点我")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("入场气泡可以点叉提前关掉，不会打开面板", async () => {
    const user = userEvent.setup();
    render(<AssistantPanel focus={null} />);
    await user.click(screen.getByRole("button", { name: "关掉这条提示" }));
    expect(screen.queryByText("让我们一起保护我们的心脏，无聊可以点点我")).toBeNull();
    expect(screen.queryByRole("region", { name: "小心 · 心脏学习助手" })).toBeNull();
  });

  it("可以拖动小心并记住位置，拖动不会误开面板", () => {
    const { unmount } = render(<AssistantPanel focus={null} />);
    const button = screen.getByRole("button", { name: "问问小心" });
    fireEvent.pointerDown(button, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 160, clientY: 60 });
    expect(button).toHaveClass("is-dragging");
    expect(button.style.getPropertyValue("--assistant-lean")).not.toBe("");
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 160, clientY: 60 });
    expect(button).not.toHaveClass("is-dragging");

    const host = button.parentElement!;
    expect(host.style.transform).toBe("translate(60px, -40px)");
    expect(localStorage.getItem("anatomy-sketch-assistant-offset")).toBe(
      JSON.stringify({ dx: 60, dy: -40 }),
    );

    fireEvent.click(button);
    expect(screen.queryByRole("region", { name: "小心 · 心脏学习助手" })).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole("region", { name: "小心 · 心脏学习助手" })).toBeInTheDocument();

    unmount();
    render(<AssistantPanel focus={null} />);
    const again = screen.getByRole("button", { name: "问问小心" });
    expect(again.parentElement!.style.transform).toBe("translate(60px, -40px)");
  });

  it("点击打开面板时小心点头回应，随后恢复待机", () => {
    vi.useFakeTimers();
    try {
      render(<AssistantPanel focus={null} />);
      const button = screen.getByRole("button", { name: "问问小心" });
      fireEvent.click(button);
      expect(button).toHaveClass("is-nodding");
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(button).not.toHaveClass("is-nodding");
    } finally {
      vi.useRealTimers();
    }
  });

  it("久置后滑到屏幕下缘只露头，点击先还原再打开面板", () => {
    vi.useFakeTimers();
    try {
      render(<AssistantPanel focus={null} />);
      const button = screen.getByRole("button", { name: "问问小心" });
      expect(button).not.toHaveClass("is-peeking");
      act(() => {
        vi.advanceTimersByTime(45000);
      });
      expect(button).toHaveClass("is-peeking");
      expect(button.style.getPropertyValue("--assistant-peek")).not.toBe("");

      fireEvent.click(button);
      expect(button).not.toHaveClass("is-peeking");
      expect(screen.queryByRole("region", { name: "小心 · 心脏学习助手" })).toBeNull();

      act(() => {
        vi.advanceTimersByTime(520);
      });
      expect(screen.getByRole("region", { name: "小心 · 心脏学习助手" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("把当前 CT 层真值随问题发给小心", async () => {
    const frames = [
      'event: meta\ndata: {"mode":"cot","sources":[]}\n\n',
      'event: delta\ndata: {"text":"本层可见左心室与心肌。"}\n\n',
      'event: done\ndata: {"degraded":false}\n\n',
    ].join("");
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(frames));
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <AssistantPanel
        focus={structure()}
        ct={{
          index: 48,
          total: 96,
          window: "mediastinal",
          windowName: "纵隔窗",
          structures: [
            { id: "lv", name: "左心室", voxels: 320 },
            { id: "myo", name: "心肌", voxels: 280 },
          ],
          selected: { id: "lv", name: "左心室", voxels: 320 },
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "问问小心" }));
    await user.click(screen.getByRole("button", { name: "当前 CT 这一层有哪些结构？" }));
    expect(await screen.findByText("本层可见左心室与心肌。")).toBeInTheDocument();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    // 线上网关会破坏请求体里的原始中文，必须只发 ASCII 转义。
    expect(init?.body).toMatch(/^[\x20-\x7e]*$/);
    const body = JSON.parse((init?.body as string | undefined) ?? "{}") as {
      ct?: Record<string, unknown>;
      focus?: string;
    };
    expect(body.ct).toMatchObject({
      index: 48,
      total: 96,
      window: "mediastinal",
      selected: { id: "lv", voxels: 320 },
    });
    expect(body.focus).toBe("lv");
  });

  it("静态回复明确标注未使用外部资料", async () => {
    const frames = [
      'event: meta\ndata: {"mode":"static","sources":[]}\n\n',
      'event: delta\ndata: {"text":"这个问题超出了我的范围。"}\n\n',
      'event: done\ndata: {"degraded":false}\n\n',
    ].join("");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(frames)));

    const user = userEvent.setup();
    render(<AssistantPanel focus={null} />);
    await user.click(screen.getByRole("button", { name: "问问小心" }));
    await user.click(screen.getByRole("button", { name: "窗宽窗位是什么？" }));

    expect(await screen.findByText("这个问题超出了我的范围。")).toBeInTheDocument();
    expect(screen.getByText("本次未使用外部资料")).toBeInTheDocument();
  });

  it("降级直答展示不可用标记", async () => {
    const frames = [
      'event: meta\ndata: {"mode":"cot","sources":[{"n":1,"title":"心肌厚度","url":"https://www.pmph.com","sourceName":"人民卫生出版社《系统解剖学》","license":"版权保留 · 仅作事实引用","snippet":"左心室心肌明显厚于右心室。"}]}\n\n',
      'event: delta\ndata: {"text":"AI 通道当前不可用，先给出站内资料的相关条目原文。"}\n\n',
      'event: done\ndata: {"degraded":true}\n\n',
    ].join("");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(frames)));

    const user = userEvent.setup();
    render(<AssistantPanel focus={null} />);
    await user.click(screen.getByRole("button", { name: "问问小心" }));
    await user.click(screen.getByRole("button", { name: "左心室为什么比右心室壁厚？" }));

    expect(await screen.findByText("资料摘录 · AI 暂不可用")).toBeInTheDocument();
  });

  it("面板宽度可用键盘调整并在重开后保持", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AssistantPanel focus={null} />);
    await user.click(screen.getByRole("button", { name: "问问小心" }));
    const handle = screen.getByRole("separator", { name: /调整小心面板宽度/ });
    expect(handle).toHaveAttribute("aria-valuenow", "480");

    act(() => {
      handle.focus();
    });
    await user.keyboard("{ArrowLeft}");
    expect(handle).toHaveAttribute("aria-valuenow", "512");
    expect(localStorage.getItem("anatomy-sketch-assistant-width")).toBe("512");

    unmount();
    render(<AssistantPanel focus={null} />);
    await user.click(screen.getByRole("button", { name: "问问小心" }));
    expect(screen.getByRole("separator", { name: /调整小心面板宽度/ })).toHaveAttribute(
      "aria-valuenow",
      "512",
    );
    expect(
      document.getElementById("assistant-panel")?.style.getPropertyValue("--assistant-width"),
    ).toBe("512px");
  });

  it("面板高度可用键盘调整并在重开后保持", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AssistantPanel focus={null} />);
    await user.click(screen.getByRole("button", { name: "问问小心" }));
    const handle = screen.getByRole("separator", { name: /调整小心面板高度/ });
    expect(handle).toHaveAttribute("aria-orientation", "horizontal");
    expect(handle).toHaveAttribute("aria-valuenow", "544");

    act(() => {
      handle.focus();
    });
    await user.keyboard("{ArrowDown}");
    expect(handle).toHaveAttribute("aria-valuenow", "520");
    expect(localStorage.getItem("anatomy-sketch-assistant-height")).toBe("520");

    unmount();
    render(<AssistantPanel focus={null} />);
    await user.click(screen.getByRole("button", { name: "问问小心" }));
    expect(screen.getByRole("separator", { name: /调整小心面板高度/ })).toHaveAttribute(
      "aria-valuenow",
      "520",
    );
    expect(
      document.getElementById("assistant-panel")?.style.getPropertyValue("--assistant-height"),
    ).toBe("520px");
  });

  it("多条来源在回答完成时全部列出", async () => {
    const frames = [
      'event: meta\ndata: {"mode":"cot","sources":[{"n":1,"title":"心肌厚度","url":"https://www.pmph.com","sourceName":"人民卫生出版社《系统解剖学》","license":"版权保留 · 仅作事实引用","snippet":"左心室心肌明显厚于右心室。"},{"n":2,"title":"心动周期","url":"https://www.pmph.com","sourceName":"人民卫生出版社《生理学》","license":"版权保留 · 仅作事实引用","snippet":"心动周期分为收缩期与舒张期。"}]}\n\n',
      'event: delta\ndata: {"text":"左心室壁更厚。"}\n\n',
      'event: done\ndata: {"degraded":false}\n\n',
    ].join("");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(frames)));

    const user = userEvent.setup();
    render(<AssistantPanel focus={null} />);
    await user.click(screen.getByRole("button", { name: "问问小心" }));
    await user.click(screen.getByRole("button", { name: "左心室为什么比右心室壁厚？" }));

    expect(await screen.findByRole("link", { name: /心肌厚度/ })).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /心动周期/ }, { timeout: 3000 }),
    ).toBeInTheDocument();
  });
});
