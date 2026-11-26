import { act, render, screen } from "@testing-library/react";
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
      'event: meta\ndata: {"mode":"cot","sources":[{"n":1,"title":"心肌厚度","url":"https://openstax.org/books/x","sourceName":"OpenStax","license":"CC BY 4.0","snippet":"左心室心肌明显厚于右心室。"}]}\n\n',
      'event: delta\ndata: {"text":"左心室要克服更高的"}\n\n',
      'event: delta\ndata: {"text":"阻力，所以壁更厚。[1]"}\n\n',
      'event: done\ndata: {"degraded":false}\n\n',
    ].join("");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(frames)));

    const user = userEvent.setup();
    render(<AssistantPanel focus={null} />);
    await user.click(screen.getByRole("button", { name: "问问小医" }));
    await user.click(screen.getByRole("button", { name: "左心室为什么比右心室壁厚？" }));

    expect(screen.getByRole("heading", { name: "小医" })).toBeInTheDocument();
    expect(await screen.findByText("左心室要克服更高的阻力，所以壁更厚。[1]")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /心肌厚度/ })).toHaveAttribute(
      "href",
      "https://openstax.org/books/x",
    );
    expect(screen.getByText(/CC BY 4\.0/)).toBeInTheDocument();
  });

  it("来源等答案首字出现后再显示", async () => {
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
    await user.click(screen.getByRole("button", { name: "问问小医" }));
    await user.click(screen.getByRole("button", { name: "左心室为什么比右心室壁厚？" }));
    if (!controller) throw new Error("流未建立");
    const stream: ReadableStreamDefaultController<Uint8Array> = controller;

    act(() => {
      stream.enqueue(
        encoder.encode(
          'event: meta\ndata: {"mode":"cot","sources":[{"n":1,"title":"心肌厚度","url":"https://openstax.org/books/x","sourceName":"OpenStax","license":"CC BY 4.0","snippet":"左心室心肌明显厚于右心室。"}]}\n\n',
        ),
      );
    });
    expect(await screen.findByText("已找到 1 条资料，正在作答…")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /心肌厚度/ })).toBeNull();

    act(() => {
      stream.enqueue(encoder.encode('event: delta\ndata: {"text":"左心室先出场。"}\n\n'));
      stream.enqueue(encoder.encode('event: done\ndata: {"degraded":false}\n\n'));
      stream.close();
    });
    expect(await screen.findByRole("link", { name: /心肌厚度/ })).toBeInTheDocument();
  });

  it("把当前 CT 层真值随问题发给小医", async () => {
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
    await user.click(screen.getByRole("button", { name: "问问小医" }));
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
    await user.click(screen.getByRole("button", { name: "问问小医" }));
    await user.click(screen.getByRole("button", { name: "窗宽窗位是什么？" }));

    expect(await screen.findByText("这个问题超出了我的范围。")).toBeInTheDocument();
    expect(screen.getByText("本次未使用外部资料")).toBeInTheDocument();
  });

  it("降级直答展示不可用标记", async () => {
    const frames = [
      'event: meta\ndata: {"mode":"cot","sources":[{"n":1,"title":"心肌厚度","url":"https://openstax.org/books/x","sourceName":"OpenStax","license":"CC BY 4.0","snippet":"左心室心肌明显厚于右心室。"}]}\n\n',
      'event: delta\ndata: {"text":"AI 通道当前不可用，先给出知识库中的相关条目原文。"}\n\n',
      'event: done\ndata: {"degraded":true}\n\n',
    ].join("");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(frames)));

    const user = userEvent.setup();
    render(<AssistantPanel focus={null} />);
    await user.click(screen.getByRole("button", { name: "问问小医" }));
    await user.click(screen.getByRole("button", { name: "左心室为什么比右心室壁厚？" }));

    expect(await screen.findByText("知识库直答 · AI 通道暂不可用")).toBeInTheDocument();
  });
});
