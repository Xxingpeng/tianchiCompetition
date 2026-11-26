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
  it("展开目录后列出结构名与逐条来源", async () => {
    mockFetch(catalog());
    render(<App />);
    const section = await screen.findByRole("region", { name: /已收录 2 个结构/ });
    fireEvent.click(within(section).getByRole("button", { name: "展开目录" }));
    expect(within(section).getByText("左心室")).toBeInTheDocument();
    expect(within(section).getByText("BP3D / lv_FJ2422.obj")).toBeInTheDocument();
    expect(within(section).getByText("BP3D / myo_FJ2428.obj")).toBeInTheDocument();
  });

  it("一进站只有心脏，点选结构后才弹出说明卡（US-12）", async () => {
    mockFetch(catalog());
    render(<App />);
    expect(await screen.findByRole("heading", { name: "心脏整体形态" })).toBeInTheDocument();
    expect(screen.getByText(/点击心脏上的任一结构/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "心肌" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "三视图示意切面" })).toBeNull();

    const section = screen.getByRole("region", { name: /已收录 2 个结构/ });
    fireEvent.click(within(section).getByRole("button", { name: "展开目录" }));
    fireEvent.click(within(section).getByRole("button", { name: /心肌/ }));

    expect(await screen.findByRole("heading", { name: "心肌" })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: /心肌/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // 三视图默认收进说明卡，展开后才出现三张示意图
    expect(screen.queryByRole("heading", { name: "三视图示意切面" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /三视图示意切面/ }));
    expect(screen.getByRole("heading", { name: "三视图示意切面" })).toBeInTheDocument();
    expect(screen.getAllByRole("figure")).toHaveLength(3);
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

  it("用途声明出现在页面上", async () => {
    mockFetch(catalog());
    render(<App />);
    expect(await screen.findByText(/示意结构模型，非真实病例影像/)).toBeInTheDocument();
  });

  it("目录载入失败时给出可读错误，而不是空白页", async () => {
    mockFetch({}, 500);
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 500");
  });

  it("未纳入的结构如实显示原因", async () => {
    mockFetch(catalog({ excluded: [{ id: "pv", reason: "OBJ 缺失" }] }));
    render(<App />);
    const section = await screen.findByRole("region", { name: /已收录 2 个结构/ });
    fireEvent.click(within(section).getByRole("button", { name: "展开目录" }));
    expect(screen.getByText(/未纳入：pv（OBJ 缺失）/)).toBeInTheDocument();
  });
});
