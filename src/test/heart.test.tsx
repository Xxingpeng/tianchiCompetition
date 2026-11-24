import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeartModel } from "../components/HeartModel";
import { DIMMED_OPACITY, isTap, partOpacity } from "../data/heart";
import { structure } from "./fixtures";

describe("整颗心脏的纯判据", () => {
  it("选中项保持实心，其余部件半透明", () => {
    expect(partOpacity("lv", "lv")).toBe(1);
    expect(partOpacity("lv", "myo")).toBe(DIMMED_OPACITY);
  });

  it("没有选中项时全部按原样显示，一进站不是一片半透明", () => {
    expect(partOpacity(null, "lv")).toBe(1);
    expect(partOpacity(null, "myo")).toBe(1);
  });

  it("位移在阈值内算点击，超出算拖拽旋转", () => {
    expect(isTap(0, 0)).toBe(true);
    expect(isTap(4, -3)).toBe(true);
    expect(isTap(5, 0)).toBe(false);
    expect(isTap(0, -9)).toBe(false);
  });
});

describe("心脏整体 3D 区域", () => {
  function view(): void {
    render(
      <HeartModel
        structures={[structure(), structure({ id: "myo", label: 1, name: "心肌" })]}
        selectedId="lv"
        onSelect={vi.fn()}
      />,
    );
  }

  it("没有 WebGL 的环境里只降级这一块，页面其余部分不受影响（US-5 AC2）", async () => {
    view();
    expect(await screen.findByRole("status")).toHaveTextContent("不支持 WebGL");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "心脏整体形态" })).toBeInTheDocument();
  });

  it("说明文字讲清交互与数据来源", () => {
    view();
    expect(screen.getByText(/单击部件即选中该结构/)).toBeInTheDocument();
    expect(screen.getByText(/同一份标注体素，颜色与三视图高亮一致/)).toBeInTheDocument();
  });
});
