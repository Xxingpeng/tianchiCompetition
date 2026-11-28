import { describe, expect, it } from "vitest";
import {
  CHAMBER_CYCLE_MS,
  CHAMBER_PHASES,
  CHAMBER_PHASE_TEXT,
  atrialContraction,
  avOpenness,
  chamberCycle,
  chamberPhaseAt,
  semilunarOpenness,
  ventricularContraction,
} from "../data/chambers";

describe("chamberCycle", () => {
  it("把毫秒折进一个心动周期", () => {
    expect(chamberCycle(0)).toBe(0);
    expect(chamberCycle(CHAMBER_CYCLE_MS / 2)).toBeCloseTo(0.5, 8);
    expect(chamberCycle(CHAMBER_CYCLE_MS)).toBe(0);
    expect(chamberCycle(CHAMBER_CYCLE_MS * 2.25)).toBeCloseTo(0.25, 8);
  });

  it("负数与非数按 0 处理", () => {
    expect(chamberCycle(-120)).toBe(0);
    expect(chamberCycle(Number.NaN)).toBe(0);
    expect(chamberCycle(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("avOpenness", () => {
  it("舒张期全开、收缩期关闭", () => {
    expect(avOpenness(0)).toBe(1);
    expect(avOpenness(0.42)).toBe(1);
    expect(avOpenness(0.5)).toBe(1);
    expect(avOpenness(0.57)).toBe(0);
    expect(avOpenness(0.8)).toBe(0);
    expect(avOpenness(0.94)).toBe(0);
  });

  it("关闭与再开放是平滑过渡", () => {
    const closing = avOpenness(0.535);
    expect(closing).toBeGreaterThan(0);
    expect(closing).toBeLessThan(1);
    const reopening = avOpenness(0.97);
    expect(reopening).toBeGreaterThan(0);
    expect(reopening).toBeLessThan(1);
    expect(avOpenness(0.99)).toBeGreaterThan(reopening);
  });

  it("相位越界会回卷", () => {
    expect(avOpenness(-0.1)).toBe(avOpenness(0.9));
    expect(avOpenness(1)).toBe(1);
    expect(avOpenness(1.25)).toBe(avOpenness(0.25));
  });
});

describe("semilunarOpenness", () => {
  it("只在射血期开放", () => {
    expect(semilunarOpenness(0)).toBe(0);
    expect(semilunarOpenness(0.5)).toBe(0);
    expect(semilunarOpenness(0.56)).toBe(0);
    expect(semilunarOpenness(0.62)).toBe(1);
    expect(semilunarOpenness(0.8)).toBe(1);
    expect(semilunarOpenness(0.96)).toBe(0);
    expect(semilunarOpenness(0.99)).toBe(0);
  });

  it("开放与关闭是平滑过渡", () => {
    const opening = semilunarOpenness(0.59);
    expect(opening).toBeGreaterThan(0);
    expect(opening).toBeLessThan(1);
    const closing = semilunarOpenness(0.93);
    expect(closing).toBeGreaterThan(0);
    expect(closing).toBeLessThan(1);
  });
});

describe("收缩包络", () => {
  it("心房在 0.42–0.52 的窗口内收缩", () => {
    expect(atrialContraction(0.42)).toBe(0);
    expect(atrialContraction(0.47)).toBeCloseTo(1, 6);
    expect(atrialContraction(0.52)).toBe(0);
    expect(atrialContraction(0.7)).toBe(0);
  });

  it("心室在 0.5–0.95 的窗口内收缩", () => {
    expect(ventricularContraction(0.5)).toBe(0);
    expect(ventricularContraction(0.725)).toBeCloseTo(1, 6);
    expect(ventricularContraction(0.95)).toBe(0);
  });
});

describe("chamberPhaseAt", () => {
  it("五个阶段首尾相接且覆盖整个周期", () => {
    expect(CHAMBER_PHASES[0]?.start).toBe(0);
    expect(CHAMBER_PHASES.at(-1)?.end).toBe(1);
    CHAMBER_PHASES.forEach((phase, index) => {
      if (index > 0) expect(phase.start).toBe(CHAMBER_PHASES[index - 1]?.end);
    });
  });

  it("边界值落在正确的阶段", () => {
    expect(chamberPhaseAt(0).id).toBe("fill");
    expect(chamberPhaseAt(0.42).id).toBe("atrial");
    expect(chamberPhaseAt(0.5).id).toBe("closing");
    expect(chamberPhaseAt(0.57).id).toBe("eject");
    expect(chamberPhaseAt(0.9).id).toBe("relax");
    expect(chamberPhaseAt(0.999).id).toBe("relax");
    expect(chamberPhaseAt(1).id).toBe("fill");
  });

  it("阶段文案覆盖五步且都带标题与说明", () => {
    for (const phase of CHAMBER_PHASES) {
      const copy = CHAMBER_PHASE_TEXT[phase.id];
      expect(copy.label.length).toBeGreaterThan(0);
      expect(copy.heading.length).toBeGreaterThan(4);
      expect(copy.detail.length).toBeGreaterThan(12);
    }
  });
});
