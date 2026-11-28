export type PeekSide = "top" | "bottom" | "left" | "right";

export interface PeekTarget {
  side: PeekSide;
  x: number;
  y: number;
}

export interface PeekRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MIN_VISIBLE = 28;

function visibleSlice(side: PeekSide, rect: PeekRect): number {
  const size = side === "left" || side === "right" ? rect.width : rect.height;
  return Math.max(MIN_VISIBLE, Math.round(size * 0.36));
}

/** 按到四边的距离，选最近的一侧把玩偶推出视口，只留 36%（最少 28px）。 */
export function peekFor(
  rect: PeekRect,
  viewport: { width: number; height: number },
): PeekTarget | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const gaps: { side: PeekSide; gap: number }[] = [
    { side: "bottom", gap: viewport.height - (rect.top + rect.height) },
    { side: "top", gap: rect.top },
    { side: "right", gap: viewport.width - (rect.left + rect.width) },
    { side: "left", gap: rect.left },
  ];
  const nearest = gaps.reduce((best, item) => (item.gap < best.gap ? item : best));
  const visible = visibleSlice(nearest.side, rect);
  switch (nearest.side) {
    case "bottom": {
      const y = Math.round(viewport.height - rect.top - visible);
      return y > 0 ? { side: nearest.side, x: 0, y } : null;
    }
    case "top": {
      const y = Math.round(visible - (rect.top + rect.height));
      return y < 0 ? { side: nearest.side, x: 0, y } : null;
    }
    case "right": {
      const x = Math.round(viewport.width - rect.left - visible);
      return x > 0 ? { side: nearest.side, x, y: 0 } : null;
    }
    case "left": {
      const x = Math.round(visible - (rect.left + rect.width));
      return x < 0 ? { side: nearest.side, x, y: 0 } : null;
    }
  }
  return null;
}
