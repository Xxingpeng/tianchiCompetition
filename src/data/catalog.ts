import { SCHEMA_VERSION, VIEW_NAMES } from "../types";
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
