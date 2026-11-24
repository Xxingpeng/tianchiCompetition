import { describe, expect, it } from "vitest";
import { limitHits, MAX_RESULTS, searchStructures } from "../data/search";
import type { StructureRecord } from "../types";
import { structure } from "./fixtures";

function many(count: number): StructureRecord[] {
  return Array.from({ length: count }, (_, i) =>
    structure({
      id: `s${i}`,
      label: (i % 9) + 1,
      name: `结构${i}`,
      en_name: `structure ${i}`,
      aliases: [`A${i}`],
    }),
  );
}

const list: StructureRecord[] = [
  structure(),
  structure({
    id: "la",
    label: 2,
    name: "左心房",
    en_name: "Left atrium",
    aliases: ["左房", "left atrium", "LA"],
  }),
  structure({
    id: "aorta",
    label: 6,
    name: "升主动脉",
    en_name: "Ascending aorta",
    aliases: ["ascending aorta", "AAo"],
  }),
];

describe("结构检索", () => {
  it("中文名、英文名、别名都能命中同一条记录", () => {
    for (const query of ["左心室", "left ventricle", "LV", "左室"]) {
      const hits = searchStructures(list, query);
      expect(
        hits.map((h) => h.structure.id),
        query,
      ).toEqual(["lv"]);
    }
  });

  it("记下命中字段，页面才能说明「LV」是别名而不是名称", () => {
    expect(searchStructures(list, "LV")[0]).toMatchObject({ field: "alias", matched: "LV" });
    expect(searchStructures(list, "左心室")[0]).toMatchObject({ field: "name" });
    expect(searchStructures(list, "Left ventricle")[0]).toMatchObject({ field: "en_name" });
  });

  it("完全同名排在前，前缀其次，包含最后", () => {
    const ranked = [
      structure({ id: "c", label: 3, name: "左心室", en_name: "x" }),
      structure({ id: "a", label: 1, name: "心室", en_name: "y" }),
      structure({ id: "b", label: 2, name: "心室壁", en_name: "z" }),
    ];
    const hits = searchStructures(ranked, "心室");
    expect(hits.map((h) => [h.structure.id, h.rank])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
  });

  it("大小写与多余空格不影响命中", () => {
    expect(searchStructures(list, "  LEFT   VENTRICLE ").map((h) => h.structure.id)).toEqual([
      "lv",
    ]);
  });

  it("空串与纯空白不返回候选，避免一进来就铺满列表", () => {
    expect(searchStructures(list, "")).toEqual([]);
    expect(searchStructures(list, "   ")).toEqual([]);
  });

  it("搜不到时返回空数组，由页面给出「未收录」空态", () => {
    expect(searchStructures(list, "股四头肌")).toEqual([]);
  });

  it("不匹配说明句，否则搜「左心房」会把提到它的左心室也捞进来", () => {
    const withMention = [structure({ id: "lv", description: "位于左心房下方的心腔。" })];
    expect(searchStructures(withMention, "左心房").map((h) => h.structure.id)).toEqual([]);
  });

  it("候选数量有上限，超出部分交给 limitHits 提示补关键词", () => {
    const hits = searchStructures(many(20), "结构");
    expect(hits.length).toBe(20);
    expect(limitHits(hits)).toHaveLength(MAX_RESULTS);
    expect(limitHits(hits, 3)).toHaveLength(3);
  });
});
