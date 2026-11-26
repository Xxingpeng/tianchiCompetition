import { describe, expect, it } from "vitest";
import structuresJson from "../../public/assets/structures.json";
import { describeFocus, FOCUS_DETAILS, focusDetail } from "./focus.ts";

interface Structure {
  id: string;
  name: string;
  en_name: string;
  parent: string;
  description: string;
  views: {
    axial: { slice_index: number };
    coronal: { slice_index: number };
    sagittal: { slice_index: number };
  };
}

const structures = (structuresJson as { structures: Structure[] }).structures;

describe("focus 元数据", () => {
  it("与页面目录逐条一致（名称/英文/上级/说明/取层索引）", () => {
    expect(structures).toHaveLength(Object.keys(FOCUS_DETAILS).length);
    for (const record of structures) {
      const detail = FOCUS_DETAILS[record.id];
      expect(detail, record.id).toBeDefined();
      expect(detail?.title, record.id).toBe(record.name);
      expect(detail?.en, record.id).toBe(record.en_name);
      expect(detail?.parent, record.id).toBe(record.parent);
      expect(detail?.description, record.id).toBe(record.description);
      expect(detail?.slices.axial, record.id).toBe(record.views.axial.slice_index);
      expect(detail?.slices.coronal, record.id).toBe(record.views.coronal.slice_index);
      expect(detail?.slices.sagittal, record.id).toBe(record.views.sagittal.slice_index);
    }
  });

  it("切面说明包含 0 起索引与高亮解释", () => {
    const detail = focusDetail("lv");
    if (!detail) throw new Error("缺少 lv");
    const text = describeFocus(detail);
    expect(text).toContain("左心室");
    expect(text).toContain("轴位 30");
    expect(text).toContain("0 起");
  });

  it("白名单外的 id 不返回元数据", () => {
    expect(focusDetail("__proto__")).toBeUndefined();
    expect(focusDetail("nope")).toBeUndefined();
  });
});
