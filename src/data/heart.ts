/** 整颗心脏视图里两个与 Three.js 无关的纯判据，单独拿出来才能在没有 WebGL 的环境里测。 */

/** 非选中部件的不透明度：够淡能看见它与毗邻的关系，够实能辨认形态。 */
export const DIMMED_OPACITY = 0.3;

/** 没有选中项时全部按原样显示，否则一进站就是一片半透明。 */
export function partOpacity(selectedId: string | null, structureId: string): number {
  return selectedId === null || selectedId === structureId ? 1 : DIMMED_OPACITY;
}

/** 位移不超过这个像素数才算"点击部件"，否则算拖拽旋转。 */
export const TAP_SLOP_PX = 4;

export function isTap(dx: number, dy: number): boolean {
  return Math.abs(dx) <= TAP_SLOP_PX && Math.abs(dy) <= TAP_SLOP_PX;
}
