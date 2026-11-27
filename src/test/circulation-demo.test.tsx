import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { CirculationDemo } from "../components/CirculationDemo";
import { shippedCatalog } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CirculationDemo", () => {
  it("打开后默认播放，可暂停、重播并用 Esc 关闭", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CirculationDemo onClose={onClose} />);

    expect(screen.getByRole("heading", { name: "心脏怎样把血泵向全身" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /关闭演示/ })).toHaveFocus());
    // 3D 场景是懒加载模块，首次解析要等一秒以上；并行跑测试时放宽等待。
    expect(
      await screen.findByText(/当前浏览器不支持 WebGL/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "暂停" }));
    expect(screen.getByRole("button", { name: "播放" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "播放" }));
    expect(screen.getByRole("button", { name: "暂停" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重播" }));
    expect(screen.getByText(/心动周期 1 \/ 5 · 充盈/)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  }, 20_000);

  it("阶段按钮跳到对应文案，并同步瓣膜状态", async () => {
    const user = userEvent.setup();
    render(<CirculationDemo onClose={() => undefined} />);

    await user.click(screen.getByRole("button", { name: /瓣膜关闭/ }));
    expect(screen.getByText(/心动周期 3 \/ 5/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "等容收缩 · 房室瓣关闭" })).toBeInTheDocument();
    expect(screen.getByText("房室瓣 关闭")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /射血/ }));
    expect(screen.getByRole("heading", { name: "射血 · 半月瓣开放" })).toBeInTheDocument();
    expect(screen.getByText("半月瓣 开放")).toBeInTheDocument();
    expect(screen.getByText("房室瓣 关闭")).toBeInTheDocument();
  });

  it("剖面刀与视角切换会更新说明，查看左心时自动打开剖面", async () => {
    const user = userEvent.setup();
    render(<CirculationDemo onClose={() => undefined} />);

    const knife = screen.getByRole("slider", { name: /剖面刀/ });
    fireEvent.change(knife, { target: { value: "70" } });
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.queryByText(/拖动「剖面刀」/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "合上心脏" }));
    expect(screen.getByText("合上", { selector: ".hc-knife-value" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "左心" }));
    expect(screen.getByRole("button", { name: "左心" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/肺静脉 → 左心房 → 二尖瓣/)).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
  });

  it("系统偏好减动效时默认停在暂停状态", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }));
    render(<CirculationDemo onClose={() => undefined} />);
    expect(screen.getByRole("button", { name: "播放" })).toBeInTheDocument();
  });
});

describe("App 的血液循环入口", () => {
  it("底部按钮打开全屏演示，关闭后回到页面", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(shippedCatalog), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: /结构索引/ });

    await user.click(screen.getByRole("button", { name: /看血液循环/ }));
    expect(screen.getByRole("dialog", { name: "心脏怎样把血泵向全身" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /关闭演示/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /结构索引/ })).toBeInTheDocument();
  }, 20_000);
});
