import type { StructureRecord } from "../types";

/** 只输一个字符时候选会爆量，这里封顶；超出部分提示用户补关键词（US-2 AC5）。 */
export const MAX_RESULTS = 8;

export type MatchField = "name" | "en_name" | "alias";

export interface SearchHit {
  structure: StructureRecord;
  /** 命中的是哪个字段，用于在候选里如实告诉用户"你搜的 LV 是别名"。 */
  field: MatchField;
  /** 命中的具体文本（别名命中时是别名本身）。 */
  matched: string;
  /** 0 完全同名 / 1 前缀 / 2 包含，越小越靠前。 */
  rank: number;
}

/** 中文没有大小写，英文别名常有 `LV` / `left ventricle` 混写，空格也可能多打。 */
function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function fields(structure: StructureRecord): { field: MatchField; text: string }[] {
  return [
    { field: "name", text: structure.name },
    { field: "en_name", text: structure.en_name },
    ...structure.aliases.map<{ field: MatchField; text: string }>((text) => ({
      field: "alias",
      text,
    })),
  ];
}

function rankOf(query: string, text: string): number | null {
  const needle = normalize(query);
  const hay = normalize(text);
  if (!needle || !hay) return null;
  if (hay === needle) return 0;
  if (hay.startsWith(needle)) return 1;
  if (hay.includes(needle)) return 2;
  return null;
}

/**
 * 检索只覆盖 name / en_name / aliases 三类文本。
 * 刻意不匹配 description：说明句里会出现"位于左心房下方"，
 * 搜"左心房"会把左心室也捞进来，而用户要的是那个结构本身。
 */
export function searchStructures(structures: StructureRecord[], query: string): SearchHit[] {
  if (!normalize(query)) return [];
  const hits: SearchHit[] = [];
  for (const structure of structures) {
    let best: SearchHit | null = null;
    for (const { field, text } of fields(structure)) {
      const rank = rankOf(query, text);
      if (rank !== null && (best === null || rank < best.rank)) {
        best = { structure, field, matched: text, rank };
      }
    }
    if (best) hits.push(best);
  }
  return hits.sort((a, b) => a.rank - b.rank || a.structure.label - b.structure.label);
}

export function limitHits(hits: SearchHit[], limit: number = MAX_RESULTS): SearchHit[] {
  return hits.slice(0, limit);
}

export const FIELD_LABEL: Record<MatchField, string> = {
  name: "名称",
  en_name: "英文名",
  alias: "别名",
};
