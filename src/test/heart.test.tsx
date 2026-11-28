import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeartModel } from "../components/HeartModel";
import { dimmedColor, faceTurnAngle, focusedColor, isTap, partColor } from "../data/heart";
import { structure } from "./fixtures";

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturation(hex: string): number {
  const values = channels(hex);
  return Math.max(...values) - Math.min(...values);
}

describe("整颗心脏的纯判据", () => {
  it("没有选中项时全部按本色显示，一进站不是一片半透明", () => {
    expect(partColor(null, "lv", "#bf4d5c")).toBe("#bf4d5c");
    expect(partColor(null, "myo", "#a06a42")).toBe("#a06a42");
  });

  it("未选中件保持不透明，改为降饱和 + 压暗往灰褐靠", () => {
    const base = "#a06a42";
    const dim = dimmedColor(base);
    expect(luminance(dim)).toBeLessThan(luminance(base));
    expect(saturation(dim)).toBeLessThan(saturation(base));
    expect(partColor("lv", "myo", base)).toBe(dim);
  });

  it("选中件保持本色相只轻微提亮", () => {
    const base = "#bf4d5c";
    expect(luminance(focusedColor(base))).toBeGreaterThan(luminance(base));
    expect(partColor("lv", "lv", base)).toBe(focusedColor(base));
  });

  it("位移在阈值内算点击，超出算拖拽旋转", () => {
    expect(isTap(0, 0)).toBe(true);
    expect(isTap(4, -3)).toBe(true);
    expect(isTap(5, 0)).toBe(false);
    expect(isTap(0, -9)).toBe(false);
  });

  it("把选中部件转到正面：方位对准相机，取最近的一圈", () => {
    const front = { x: 0, y: -1 };
    expect(faceTurnAngle({ x: 0, y: -1 }, front, 0)).toBeCloseTo(0, 6);
    // 患者左侧（+x）的部件要顺时针转 90° 才到胸前（−y）
    expect(faceTurnAngle({ x: 1, y: 0 }, front, 0)).toBeCloseTo(-Math.PI / 2, 6);
    // 患者右侧（−x）反向 90°
    expect(faceTurnAngle({ x: -1, y: 0 }, front, 0)).toBeCloseTo(Math.PI / 2, 6);
    // 正后方转半圈；等价角里选离 current 最近的那一圈
    expect(Math.abs(faceTurnAngle({ x: 0, y: 1 }, front, 0) ?? 0)).toBeCloseTo(Math.PI, 3);
    expect(faceTurnAngle({ x: 1, y: 0 }, front, 3)).toBeCloseTo((3 * Math.PI) / 2, 6);
    // 部件或相机落在轴线上时没有确定方位，不转
    expect(faceTurnAngle({ x: 0, y: 0 }, front, 0)).toBeNull();
    expect(faceTurnAngle({ x: 1, y: 0 }, { x: 0, y: 0 }, 0)).toBeNull();
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
