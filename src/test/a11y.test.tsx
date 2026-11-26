import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { shippedCatalog } from "./fixtures";

function fetchShippedCatalog(): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(shippedCatalog), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

afterEach(() => {
  cleanup();
});

describe("可访问性", () => {
  it("真实目录 + 说明卡 + 三视图渲染后没有 axe 违规", async () => {
    fetchShippedCatalog();
    const { container } = render(<App />);
    await screen.findByRole("heading", { name: /已收录 9 个结构/ });
    fireEvent.click(screen.getByRole("button", { name: "展开目录" }));
    fireEvent.click(screen.getByRole("button", { name: /心肌/ }));
    await screen.findByRole("heading", { name: "心肌" });
    fireEvent.click(screen.getByRole("button", { name: /三视图示意切面/ }));
    const results = await axe.run(container, {
      // jsdom 没有排版引擎，对比度只能靠人工核对（styles.css 的正文色已按 AA 取值）
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  }, 20_000);

  it("结构名是可被辅助技术读到的列表，而不是散落的文本", async () => {
    fetchShippedCatalog();
    render(<App />);
    await screen.findByRole("heading", { name: /已收录 9 个结构/ });
    fireEvent.click(screen.getByRole("button", { name: "展开目录" }));
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(9);
  });
});
