import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { catalog } from "./fixtures";

function mockFetch(body: unknown, status = 200): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

afterEach(() => {
  cleanup();
});

describe("页面骨架", () => {
  it("索引直接列出结构编号与中英文名", async () => {
    mockFetch(catalog());
    render(<App />);
    const placard = await screen.findByRole("complementary", { name: /结构索引/ });
    expect(within(placard).getByText("左心室")).toBeInTheDocument();
    expect(within(placard).getByText("Left ventricle")).toBeInTheDocument();
    expect(within(placard).getByText("心肌")).toBeInTheDocument();
    expect(within(placard).getByText("Myocardium")).toBeInTheDocument();
    // 编号方块是纯视觉标记，读屏只报「中文名 + 英文名」
    expect(within(placard).getByText("3")).toHaveAttribute("aria-hidden", "true");
    expect(within(placard).getByRole("button", { name: /左心室/ })).toBeInTheDocument();
    expect(
      within(placard).getByRole("searchbox", { name: /按编号或名称查找结构/ }),
    ).toBeInTheDocument();
  });

  it("在顶部横线输入编号即可选中对应结构", async () => {
    mockFetch(catalog());
    render(<App />);
    const placard = await screen.findByRole("complementary", { name: /结构索引/ });
    const searchbox = within(placard).getByRole("searchbox", { name: /按编号或名称查找结构/ });
    fireEvent.change(searchbox, { target: { value: "3" } });
    expect(await screen.findByRole("heading", { name: "左心室" })).toBeInTheDocument();
    expect(within(placard).getByRole("button", { name: /左心室/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(searchbox).toHaveValue("3");
  });

  it("在顶部横线输入中文名或英文名也能选中结构", async () => {
    mockFetch(catalog());
    render(<App />);
    const placard = await screen.findByRole("complementary", { name: /结构索引/ });
    const searchbox = within(placard).getByRole("searchbox", { name: /按编号或名称查找结构/ });
    fireEvent.change(searchbox, { target: { value: "心肌" } });
    expect(await screen.findByRole("heading", { name: "心肌" })).toBeInTheDocument();
    fireEvent.change(searchbox, { target: { value: "left ventricle" } });
    expect(await screen.findByRole("heading", { name: "左心室" })).toBeInTheDocument();
  });

  it("一进站只有心脏，点选结构后才弹出说明卡（US-12）", async () => {
    mockFetch(catalog());
    render(<App />);
    expect(await screen.findByRole("heading", { name: "心脏整体形态" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "解剖智绘" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "心肌" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "最密层切面预览" })).toBeNull();

    const placard = screen.getByRole("complementary", { name: /结构索引/ });
    fireEvent.click(within(placard).getByRole("button", { name: /心肌/ }));

    expect(await screen.findByRole("heading", { name: "心肌" })).toBeInTheDocument();
    expect(within(placard).getByRole("button", { name: /心肌/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // 三视图默认展开，收起后才隐藏三张示意图（只数三视图自己的 figure，3D 兜底图另算）
    expect(screen.getByRole("heading", { name: "最密层切面预览" })).toBeInTheDocument();
    const triView = screen.getByRole("region", { name: "最密层切面预览" });
    expect(within(triView).getAllByRole("figure")).toHaveLength(3);
    const triToggle = screen.getByRole("button", { name: /三视图示意切面/ });
    expect(triToggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(triToggle);
    expect(triToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: "最密层切面预览" })).toBeNull();
  });

  it("看 CT 打开侧滑阅片台，未选结构时从目录第一个开始", async () => {
    mockFetch(catalog());
    render(<App />);
    await screen.findByRole("heading", { name: "心脏整体形态" });
    fireEvent.click(screen.getByRole("button", { name: /看 CT/ }));

    const drawer = await screen.findByRole("dialog", { name: "CT 阅片台" });
    expect(within(drawer).getByRole("heading", { name: /CT 轴位阅片/ })).toBeInTheDocument();
    expect(within(drawer).getByRole("slider", { name: "轴位层" })).toHaveValue("48");

    fireEvent.click(within(drawer).getByRole("button", { name: "收起 CT" }));
    expect(screen.queryByRole("dialog", { name: "CT 阅片台" })).toBeNull();
  });

  it("用途声明留在页脚，授权说明做成展签底部的藏品来源", async () => {
    const attribution =
      "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International";
    mockFetch(
      catalog({
        notices: ["示意结构模型，非真实病例影像，亦非分割模型推理结果。", attribution],
      }),
    );
    render(<App />);
    const placard = await screen.findByRole("complementary", { name: /结构索引/ });
    expect(within(placard).getByText(attribution)).toBeInTheDocument();
    const footer = screen.getByRole("contentinfo");
    expect(footer).not.toHaveTextContent("BodyParts3D");
    expect(footer).toHaveTextContent(/示意结构模型，非真实病例影像/);
  });

  it("目录载入失败时给出可读错误，而不是空白页", async () => {
    mockFetch({}, 500);
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 500");
  });

  it("未纳入的结构如实显示原因", async () => {
    mockFetch(catalog({ excluded: [{ id: "pv", reason: "OBJ 缺失" }] }));
    render(<App />);
    await screen.findByRole("complementary", { name: /结构索引/ });
    expect(screen.getByText(/未纳入：pv（OBJ 缺失）/)).toBeInTheDocument();
  });
});
