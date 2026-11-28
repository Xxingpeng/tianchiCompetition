/** 整颗心脏视图里与 Three.js 无关的纯判据，单独拿出来才能在没有 WebGL 的环境里测。 */

/**
 * 选中某个结构时，未选中件保持不透明，改为降饱和 + 压暗（往灰褐方向收）。
 * 体素台阶的每个折面只有不透明时才读得清，所以不再走 0.18 半透明叠色。
 */
export function dimmedColor(baseHex: string): string {
  const [h, s, l] = toHsl(baseHex);
  return fromHsl(h, s * 0.32, clamp(l * 0.52, 0.1, 0.42));
}

/** 选中件保持本色，只把明度抬一点，不引入第二种色相。 */
export function focusedColor(baseHex: string): string {
  const [h, s, l] = toHsl(baseHex);
  return fromHsl(h, s, clamp(l * 1.1 + 0.03, 0, 1));
}

/** 无选中项时全部本色；否则选中件提亮、其余压暗。 */
export function partColor(selectedId: string | null, structureId: string, baseHex: string): string {
  if (selectedId === null) return baseHex;
  return selectedId === structureId ? focusedColor(baseHex) : dimmedColor(baseHex);
}

/** 位移不超过这个像素数才算"点击部件"，否则算拖拽旋转。 */
export const TAP_SLOP_PX = 4;

export function isTap(dx: number, dy: number): boolean {
  return Math.abs(dx) <= TAP_SLOP_PX && Math.abs(dy) <= TAP_SLOP_PX;
}

/**
 * 把部件转到正对相机所需的绕 z 轴（解剖上下轴）转角。
 * 方位角取 atan2(x, y)：0 指向后方(+y)，π/2 指向患者左侧(+x)；
 * 绕 +z 转 θ 会让方位角减去 θ，所以让部件方位角对准相机方位角即 θ = α部件 − α相机。
 * 返回值取离 current 最近的一圈，避免绕远路；方向退化时返回 null。
 */
export function faceTurnAngle(
  part: { x: number; y: number },
  camera: { x: number; y: number },
  current: number,
): number | null {
  if (Math.hypot(part.x, part.y) < 1e-6 || Math.hypot(camera.x, camera.y) < 1e-6) {
    return null;
  }
  const target = Math.atan2(part.x, part.y) - Math.atan2(camera.x, camera.y);
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toHsl(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  if (s === 0) {
    const v = Math.round(l * 255);
    return `#${[v, v, v].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channels = [h + 1 / 3, h, h - 1 / 3].map((t) => {
    const wrapped = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    let value: number;
    if (wrapped < 1 / 6) value = p + (q - p) * 6 * wrapped;
    else if (wrapped < 1 / 2) value = q;
    else if (wrapped < 2 / 3) value = p + (q - p) * (2 / 3 - wrapped) * 6;
    else value = p;
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}
