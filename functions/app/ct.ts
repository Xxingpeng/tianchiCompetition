import { focusDetail } from "./focus.ts";
import { normalize } from "./text.ts";

export const CT_WINDOWS: Record<string, string> = {
  mediastinal: "纵隔窗",
  lung: "肺窗",
};

const MAX_CT_LAYERS = 512;
const MAX_STRUCTURES = 9;
const MAX_VOXELS = 50_000_000;

export interface CtSliceFact {
  index: number;
  total: number;
  window: string;
  windowName: string;
  structures: { id: string; name: string; voxels: number }[];
  selected?: { id: string; name: string; voxels: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function voxelCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_VOXELS
    ? value
    : undefined;
}

/**
 * 浏览器带来的 CT 状态只保留"层号 + 窗 + 已知结构 + 体素数"。
 * 结构名一律回查服务端冻结表，客户端送来的文案不进入提示词。
 */
export function parseCt(raw: unknown): CtSliceFact | undefined {
  if (!isRecord(raw)) return undefined;
  const index = raw.index;
  const total = raw.total;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= MAX_CT_LAYERS)
    return undefined;
  if (
    typeof total !== "number" ||
    !Number.isInteger(total) ||
    total <= 0 ||
    total > MAX_CT_LAYERS ||
    index >= total
  )
    return undefined;
  const window = typeof raw.window === "string" ? raw.window : "";
  const windowName = CT_WINDOWS[window];
  if (!windowName) return undefined;

  const structures: CtSliceFact["structures"] = [];
  const seen = new Set<string>();
  const rows = Array.isArray(raw.structures) ? raw.structures.slice(0, MAX_STRUCTURES) : [];
  for (const item of rows) {
    if (!isRecord(item) || typeof item.id !== "string") continue;
    const detail = focusDetail(item.id);
    if (!detail || seen.has(item.id)) continue;
    const voxels = voxelCount(item.voxels);
    if (voxels === undefined || voxels === 0) continue;
    seen.add(item.id);
    structures.push({ id: item.id, name: detail.title, voxels });
  }

  let selected: CtSliceFact["selected"];
  if (isRecord(raw.selected) && typeof raw.selected.id === "string") {
    const detail = focusDetail(raw.selected.id);
    const voxels = voxelCount(raw.selected.voxels);
    if (detail && voxels !== undefined) {
      selected = { id: raw.selected.id, name: detail.title, voxels };
    }
  }

  return {
    index,
    total,
    window,
    windowName,
    structures,
    ...(selected ? { selected } : {}),
  };
}

const CT_SLICE_REFERENCE =
  /(这层|这一层|当前层|本层|此层|这一?层面|当前层面|轴位层|当前轴位|当前\s*ct|这张\s*ct|ct\s*(图|层|上|里|中))/;

export function wantsCtSlice(question: string): boolean {
  return CT_SLICE_REFERENCE.test(normalize(question));
}

export function describeCtSlice(ct: CtSliceFact): string {
  const visible =
    ct.structures.length > 0
      ? ct.structures.map((entry) => `${entry.name} ${entry.voxels} 体素`).join("、")
      : "无（该层没有标注结构）";
  const parts = [
    `轴位第 ${ct.index + 1}/${ct.total} 层（${ct.windowName}）`,
    `本层可见：${visible}`,
  ];
  if (ct.selected) {
    parts.push(
      ct.selected.voxels > 0
        ? `当前选中 ${ct.selected.name}，本层 ${ct.selected.voxels} 体素`
        : `当前选中 ${ct.selected.name}，本层未见标注`,
    );
  }
  parts.push("逐层体素数为本站构建期真值，不是临床测量");
  return parts.join("；");
}
