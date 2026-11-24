/** 整颗心脏视图里两个与 Three.js 无关的纯判据，单独拿出来才能在没有 WebGL 的环境里测。 */

/**
 * 非选中部件的不透明度。0.3 时 8 个部件的双面壳会叠出三四层，混成一片马卡龙色、
 * 把选中件的本色也冲淡；降到 0.18 后毗邻关系还在，但层与层之间不再互相糊色。
 */
export const DIMMED_OPACITY = 0.18;

/** 没有选中项时全部按原样显示，否则一进站就是一片半透明。 */
export function partOpacity(selectedId: string | null, structureId: string): number {
  return selectedId === null || selectedId === structureId ? 1 : DIMMED_OPACITY;
}

/** 位移不超过这个像素数才算"点击部件"，否则算拖拽旋转。 */
export const TAP_SLOP_PX = 4;

export function isTap(dx: number, dy: number): boolean {
  return Math.abs(dx) <= TAP_SLOP_PX && Math.abs(dy) <= TAP_SLOP_PX;
}
