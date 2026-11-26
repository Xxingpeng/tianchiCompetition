import { CT_SCHEMA_VERSION, SCHEMA_VERSION, VIEW_NAMES } from "../types";
import type { Catalog, StructureRecord } from "../types";

export const CATALOG_URL = "/assets/structures.json";

/** 目录不合法时抛出的错误；`problems` 是一次收全的问题清单，页面直接列给用户看。 */
export class CatalogError extends Error {
  readonly problems: string[];

  constructor(message: string, problems: string[] = []) {
    super(`${message}${problems.length > 0 ? `：\n- ${problems.join("\n- ")}` : ""}`);
    this.name = "CatalogError";
    this.problems = problems;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * 伪 CT 清单直接决定阅片器显示哪张图、哪些结构算可见。这里不检查文件是否真的存在
 * （浏览器无法列目录），但把层数、真值与最密层的一致性先卡住，避免页面自相矛盾。
 */
function assertCt(
  rawCt: unknown,
  rawGrid: unknown,
  rawStructures: unknown,
  problems: string[],
): void {
  if (!isRecord(rawCt)) {
    problems.push("ct 不是对象");
    return;
  }
  if (rawCt.schema_version !== CT_SCHEMA_VERSION) {
    problems.push(
      `ct.schema_version 为 ${String(rawCt.schema_version)}，页面期望 ${CT_SCHEMA_VERSION}`,
    );
  }
  const note = text(rawCt.note);
  if (!note) problems.push("ct.note 为空：必须声明伪 CT 的用途边界");
  else if (!note.includes("非真实病例") && !note.includes("不是真实病例"))
    problems.push("ct.note 缺少「非真实病例」声明");

  const shape = isRecord(rawGrid) && Array.isArray(rawGrid.shape) ? rawGrid.shape : [];
  if (shape.length !== 3 || !shape.every((value) => isPositiveInt(value))) {
    problems.push("ct 无法核对：grid.shape 非法");
    return;
  }
  const [rows, cols, depth] = shape;
  if (rows === undefined || cols === undefined || depth === undefined) {
    problems.push("ct 无法核对：grid.shape 非法");
    return;
  }
  if (rawCt.slice_count !== depth)
    problems.push(`ct.slice_count ${String(rawCt.slice_count)} 与体素深度 ${depth} 不符`);
  if (!isPositiveInt(rawCt.upscale)) problems.push("ct.upscale 应为 >=1 的整数");
  const upscale = isPositiveInt(rawCt.upscale) ? rawCt.upscale : 1;
  const size = rawCt.image_size;
  if (
    !Array.isArray(size) ||
    size.length !== 2 ||
    size[0] !== rows * upscale ||
    size[1] !== cols * upscale
  )
    problems.push(`ct.image_size 应为 [${rows * upscale}, ${cols * upscale}]`);

  const windows = Array.isArray(rawCt.windows) ? rawCt.windows : [];
  const windowIds: string[] = [];
  if (windows.length === 0) problems.push("ct.windows 为空，至少需要一个窗预设");
  windows.forEach((item, i) => {
    if (!isRecord(item)) {
      problems.push(`ct.windows[${i}] 不是对象`);
      return;
    }
    const id = text(item.id);
    if (!id) problems.push(`ct.windows[${i}] 缺少 id`);
    else if (windowIds.includes(id)) problems.push(`ct.windows[${i}] id ${id} 重复`);
    else windowIds.push(id);
    if (!text(item.name)) problems.push(`ct.windows[${i}] 缺少 name`);
    if (typeof item.width !== "number" || item.width <= 0)
      problems.push(`ct.windows[${i}].width 必须为正`);
    if (typeof item.level !== "number" || !Number.isFinite(item.level))
      problems.push(`ct.windows[${i}].level 不是数字`);
  });
  const defaultWindow = text(rawCt.default_window);
  if (windowIds.length > 0 && !windowIds.includes(defaultWindow))
    problems.push(`ct.default_window ${defaultWindow || "(空)"} 不在 windows 里`);

  const basePattern = text(rawCt.base_pattern);
  const overlayPattern = text(rawCt.overlay_pattern);
  if (!basePattern.includes("{index") || !basePattern.includes("{window}"))
    problems.push("ct.base_pattern 必须包含 {index…} 与 {window} 占位符");
  if (!overlayPattern.includes("{index") || !overlayPattern.includes("{id}"))
    problems.push("ct.overlay_pattern 必须包含 {index…} 与 {id} 占位符");

  const structures = Array.isArray(rawStructures) ? rawStructures.filter(isRecord) : [];
  const structureNames = new Map<string, string>();
  for (const structure of structures) {
    const id = text(structure.id);
    if (id) structureNames.set(id, text(structure.name));
  }

  const best = isRecord(rawCt.best_slice) ? rawCt.best_slice : undefined;
  if (!best) problems.push("ct.best_slice 不是对象");
  const bestSlice = best ?? {};
  for (const sid of structureNames.keys()) {
    const k = bestSlice[sid];
    if (typeof k !== "number" || !Number.isInteger(k) || k < 0 || k >= depth)
      problems.push(`结构 ${sid}：ct.best_slice 缺失或越界`);
  }

  const slices = Array.isArray(rawCt.slices) ? rawCt.slices : [];
  if (slices.length !== depth) problems.push(`ct.slices 应有 ${depth} 层，实际 ${slices.length}`);
  const counts = new Map<string, Map<number, number>>();
  slices.forEach((row, i) => {
    if (!isRecord(row)) {
      problems.push(`ct.slices[${i}] 不是对象`);
      return;
    }
    if (row.index !== i) problems.push(`ct.slices[${i}].index 应为 ${i}`);
    if (typeof row.voxels !== "number" || !Number.isInteger(row.voxels) || row.voxels < 0)
      problems.push(`ct.slices[${i}].voxels 应为非负整数`);
    const entries = Array.isArray(row.structures) ? row.structures : [];
    const seen = new Set<string>();
    for (const entry of entries) {
      if (!isRecord(entry)) {
        problems.push(`ct.slices[${i}] 含非对象结构记录`);
        continue;
      }
      const sid = text(entry.id);
      if (!structureNames.has(sid)) {
        problems.push(`ct.slices[${i}] 含目录外结构 ${sid || "(空)"}`);
        continue;
      }
      if (seen.has(sid)) problems.push(`ct.slices[${i}] 结构 ${sid} 重复`);
      seen.add(sid);
      if (text(entry.name) !== structureNames.get(sid))
        problems.push(`ct.slices[${i}]/${sid} 名称与目录不一致`);
      if (!isPositiveInt(entry.voxels)) {
        problems.push(`ct.slices[${i}]/${sid} 体素数应为正整数`);
        continue;
      }
      const per = counts.get(sid) ?? new Map<number, number>();
      per.set(i, entry.voxels);
      counts.set(sid, per);
    }
  });

  for (const sid of structureNames.keys()) {
    const per = counts.get(sid);
    if (!per || per.size === 0) {
      problems.push(`结构 ${sid}：ct 逐层真值从未出现，overlay 全空`);
      continue;
    }
    const k = bestSlice[sid];
    if (typeof k !== "number" || !per.has(k)) continue;
    const peak = Math.max(...per.values());
    if (per.get(k) !== peak) problems.push(`结构 ${sid}：ct.best_slice ${k} 不是最密层`);
  }
}

/**
 * 浏览器拿到的是外部 JSON，字段缺失或来源标注被清空都会在页面上表现为"看起来正常但内容是错的"，
 * 所以这里按构建期同一套规则再校验一次，并把问题一次报全。
 */
export function assertCatalog(raw: unknown): Catalog {
  if (!isRecord(raw)) throw new CatalogError("目录根节点不是对象");

  if (raw.schema_version !== SCHEMA_VERSION) {
    throw new CatalogError(
      `目录 schema_version 为 ${String(raw.schema_version)}，页面期望 ${SCHEMA_VERSION}`,
    );
  }

  const problems: string[] = [];
  const notices = Array.isArray(raw.notices) ? raw.notices.map(text) : [];
  if (notices.length === 0) problems.push("notices 为空：页面必须携带用途声明与许可署名");
  else if (!notices.some((n) => n.includes("示意") || n.includes("非真实病例")))
    problems.push("notices 缺少「示意模型、非真实病例」用途声明");

  const mode = text(raw.provenance_mode);
  if (mode !== "bp3d" && mode !== "procedural_fallback" && mode !== "mixed")
    problems.push(`provenance_mode ${mode || "(空)"} 非法`);

  const rawList = Array.isArray(raw.structures) ? raw.structures : [];
  if (rawList.length < 2) problems.push(`可用结构 ${rawList.length} 个，不构成对照演示`);

  const seen = new Set<number>();
  rawList.forEach((item, i) => {
    if (!isRecord(item)) {
      problems.push(`第 ${i + 1} 条不是对象`);
      return;
    }
    const where = `结构 ${text(item.id) || `#${i + 1}`}`;
    for (const key of ["name", "en_name", "description", "parent", "provenance", "mesh"]) {
      if (!text(item[key])) problems.push(`${where}：必填字段 ${key} 为空`);
    }
    const aliases = item.aliases;
    if (!Array.isArray(aliases) || aliases.filter((a) => text(a)).length === 0)
      problems.push(`${where}：aliases 为空，检索无从命中`);
    if (!HEX_COLOR.test(text(item.color))) problems.push(`${where}：color 不是 #rrggbb`);

    const label = item.label;
    if (typeof label !== "number" || label < 1 || label > 9)
      problems.push(`${where}：label ${String(label)} 不在冻结区间 1..9`);
    else if (seen.has(label)) problems.push(`${where}：label ${label} 与其他结构重复`);
    else seen.add(label);

    const views = item.views;
    for (const view of VIEW_NAMES) {
      const entry = isRecord(views) ? views[view] : undefined;
      if (!isRecord(entry)) {
        problems.push(`${where}：缺少 ${view} 视图`);
        continue;
      }
      for (const kind of ["base", "overlay"]) {
        if (!text(entry[kind])) problems.push(`${where}/${view}：缺少 ${kind} 路径`);
      }
    }
    const stats = item.stats;
    if (!isRecord(stats) || typeof stats.voxels !== "number" || stats.voxels <= 0)
      problems.push(`${where}：体素数为 0，几何没有真正生成`);
  });

  if (raw.ct !== undefined) assertCt(raw.ct, raw.grid, raw.structures, problems);

  if (problems.length > 0) throw new CatalogError("目录校验未通过", problems);
  return raw as unknown as Catalog;
}

export async function loadCatalog(url: string = CATALOG_URL): Promise<Catalog> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new CatalogError(`目录请求失败（${url}）`, [String(cause)]);
  }
  if (!response.ok) throw new CatalogError(`目录请求失败：HTTP ${response.status}`, [url]);
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (cause) {
    throw new CatalogError("目录不是合法 JSON", [String(cause)]);
  }
  return assertCatalog(parsed);
}

/** 页面可选列表：目录里已经剔除缺件结构，这里只按标签稳定排序。 */
export function selectableStructures(catalog: Catalog): StructureRecord[] {
  return [...catalog.structures].sort((a, b) => a.label - b.label);
}
