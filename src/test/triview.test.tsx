import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TriView } from "../components/TriView";
import { structure } from "./fixtures";

function overlaySources(): string[] {
  return Array.from(document.querySelectorAll<HTMLImageElement>(".slice-overlay")).map(
    (img) => img.getAttribute("src") ?? "",
  );
}

describe("三视图切面", () => {
  it("三个视图各有底图 + 高亮层，并标注视图名与层号", () => {
    render(<TriView structure={structure()} />);
    expect(screen.getAllByRole("figure")).toHaveLength(3);
    expect(overlaySources().sort()).toEqual([
      "/assets/slices/lv_axial_overlay.png",
      "/assets/slices/lv_coronal_overlay.png",
      "/assets/slices/lv_sagittal_overlay.png",
    ]);
    for (const name of ["轴位", "冠状位", "矢状位"]) {
      expect(
        screen.getByText(new RegExp(`${name} · 第 48 层 · 该层占 320 体素`)),
      ).toBeInTheDocument();
    }
    expect(screen.getByAltText("左心室的轴位示意切面底图")).toHaveAttribute(
      "src",
      "/assets/slices/lv_axial_base.png",
    );
  });

  it("图例说明色块代表哪个结构，色盲用户靠文字也能区分（US-8 AC3）", () => {
    render(<TriView structure={structure()} />);
    expect(screen.getByText(/半透明色块表示 左心室（Left ventricle）/)).toBeInTheDocument();
  });

  it("关掉高亮只剩灰度底图，图例同步改口", async () => {
    const user = userEvent.setup();
    render(<TriView structure={structure()} />);

    await user.click(screen.getByRole("checkbox", { name: /高亮 左心室/ }));
    expect(overlaySources()).toHaveLength(0);
    expect(screen.getByText(/当前未叠加高亮层/)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /高亮 左心室/ }));
    expect(overlaySources()).toHaveLength(3);
  });

  it("底图与高亮层同尺寸同位置，靠叠加对齐而不是各画各的", () => {
    render(<TriView structure={structure()} />);
    const base = screen.getByAltText<HTMLImageElement>("左心室的轴位示意切面底图");
    const overlay = document.querySelector<HTMLImageElement>(".slice-overlay")!;
    expect([overlay.width, overlay.height]).toEqual([base.width, base.height]);
    expect(overlay.getAttribute("alt")).toBe("");
  });
});
