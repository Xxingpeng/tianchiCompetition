/** 心动周期的纯函数与讲解文案：瓣膜开合、心房/心室收缩包络。动画在 3D 场景里逐帧取用。 */

export type ChamberPhaseId = "fill" | "atrial" | "closing" | "eject" | "relax";

export interface ChamberPhase {
  id: ChamberPhaseId;
  label: string;
  heading: string;
  detail: string;
  start: number;
  end: number;
}

/** 教学用的慢速心动周期；真实静息心率约 0.8 s，这里放慢到 6.4 s 便于观察瓣膜。 */
export const CHAMBER_CYCLE_MS = 6400;

export const CHAMBER_PHASES = [
  { id: "fill", start: 0, end: 0.42 },
  { id: "atrial", start: 0.42, end: 0.5 },
  { id: "closing", start: 0.5, end: 0.57 },
  { id: "eject", start: 0.57, end: 0.9 },
  { id: "relax", start: 0.9, end: 1 },
] as const satisfies readonly { id: ChamberPhaseId; start: number; end: number }[];

export const CHAMBER_PHASE_TEXT: Record<
  ChamberPhaseId,
  { label: string; heading: string; detail: string }
> = {
  fill: {
    label: "充盈",
    heading: "心室充盈 · 房室瓣开放",
    detail: "心室舒张、压力低于心房，二尖瓣与三尖瓣打开，静脉血从心房流入心室，完成约七成充盈。",
  },
  atrial: {
    label: "心房收缩",
    heading: "心房收缩 · 补足最后三成",
    detail: "左右心房一起收缩，把剩余血液挤进心室；此时半月瓣仍然关闭。",
  },
  closing: {
    label: "瓣膜关闭",
    heading: "等容收缩 · 房室瓣关闭",
    detail: "心室开始收缩、压力升高，二尖瓣和三尖瓣先关闭，防止血液倒流回心房；半月瓣还没打开。",
  },
  eject: {
    label: "射血",
    heading: "射血 · 半月瓣开放",
    detail: "心室压力超过主动脉和肺动脉，主动脉瓣与肺动脉瓣打开：含氧血进主动脉，缺氧血进肺动脉。",
  },
  relax: {
    label: "舒张",
    heading: "等容舒张 · 半月瓣关闭",
    detail: "心室放松、压力下降，半月瓣关闭防止血液倒流；房室瓣即将再次打开，进入下一轮充盈。",
  },
};

function normalizePhase(phase: number): number {
  if (!Number.isFinite(phase)) return 0;
  if (phase >= 0 && phase < 1) return phase;
  return ((phase % 1) + 1) % 1;
}

function smoothstep(value: number): number {
  const x = Math.min(1, Math.max(0, value));
  return x * x * (3 - 2 * x);
}

/** 把毫秒数折进一个心动周期，返回 0 ≤ t < 1。 */
export function chamberCycle(elapsedMs: number): number {
  const safe = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  return (safe % CHAMBER_CYCLE_MS) / CHAMBER_CYCLE_MS;
}

/** 房室瓣（二尖瓣/三尖瓣）开度：1 全开、0 关闭。舒张期开放，收缩期关闭。 */
export function avOpenness(phase: number): number {
  const t = normalizePhase(phase);
  if (t < 0.5) return 1;
  if (t < 0.57) return 1 - smoothstep((t - 0.5) / 0.07);
  if (t < 0.94) return 0;
  return smoothstep((t - 0.94) / 0.06);
}

/** 半月瓣（主动脉瓣/肺动脉瓣）开度：只在心室射血期开放。 */
export function semilunarOpenness(phase: number): number {
  const t = normalizePhase(phase);
  if (t < 0.56) return 0;
  if (t < 0.62) return smoothstep((t - 0.56) / 0.06);
  if (t < 0.9) return 1;
  if (t < 0.96) return 1 - smoothstep((t - 0.9) / 0.06);
  return 0;
}

/** 区间内的平滑脉冲：区间两端为 0、中点为 1，用来驱动心房/心室的收缩包络。 */
export function phasePulse(phase: number, start: number, end: number): number {
  const t = normalizePhase(phase);
  if (end <= start || t < start || t >= end) return 0;
  const x = (t - start) / (end - start);
  return Math.sin(Math.PI * x) ** 2;
}

export function atrialContraction(phase: number): number {
  return phasePulse(phase, 0.42, 0.52);
}

export function ventricularContraction(phase: number): number {
  return phasePulse(phase, 0.5, 0.95);
}

export function chamberPhaseAt(phase: number): ChamberPhase {
  const t = normalizePhase(phase);
  const window =
    CHAMBER_PHASES.find((item) => t >= item.start && t < item.end) ?? CHAMBER_PHASES[0];
  return { ...CHAMBER_PHASE_TEXT[window.id], ...window };
}
