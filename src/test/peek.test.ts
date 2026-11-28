import { describe, expect, it } from "vitest";
import { peekFor } from "../data/peek";

const viewport = { width: 1000, height: 800 };

describe("peekFor", () => {
  it("靠近底边时向下缩，只留 36% 高度（至少 28px）", () => {
    expect(peekFor({ top: 630, left: 450, width: 100, height: 150 }, viewport)).toEqual({
      side: "bottom",
      x: 0,
      y: 116,
    });
  });

  it("靠近上边时向上缩", () => {
    expect(peekFor({ top: 20, left: 450, width: 100, height: 150 }, viewport)).toEqual({
      side: "top",
      x: 0,
      y: -116,
    });
  });

  it("靠近左边时向左缩", () => {
    expect(peekFor({ top: 325, left: 20, width: 100, height: 150 }, viewport)).toEqual({
      side: "left",
      x: -84,
      y: 0,
    });
  });

  it("靠近右边时向右缩", () => {
    expect(peekFor({ top: 325, left: 880, width: 100, height: 150 }, viewport)).toEqual({
      side: "right",
      x: 84,
      y: 0,
    });
  });

  it("横向可见量同样保底 28px", () => {
    expect(peekFor({ top: 380, left: 950, width: 40, height: 40 }, viewport)).toEqual({
      side: "right",
      x: 22,
      y: 0,
    });
  });

  it("已经缩在视口外或尺寸无效时不动", () => {
    expect(peekFor({ top: -100, left: 450, width: 100, height: 150 }, viewport)).toBeNull();
    expect(peekFor({ top: 100, left: 100, width: 0, height: 150 }, viewport)).toBeNull();
  });
});
