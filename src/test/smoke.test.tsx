import { cleanup, render, screen } from "@testing-library/react";
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
  it("载入完成后列出结构名与逐条来源", async () => {
    mockFetch(catalog());
    render(<App />);
    expect(await screen.findByRole("heading", { name: /已收录 2 个结构/ })).toBeInTheDocument();
    expect(screen.getByText("左心室")).toBeInTheDocument();
    expect(screen.getByText("BP3D / lv_FJ2422.obj")).toBeInTheDocument();
    expect(screen.getByText("BP3D / myo_FJ2428.obj")).toBeInTheDocument();
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
    expect(await screen.findByText(/未纳入：pv（OBJ 缺失）/)).toBeInTheDocument();
  });
});
