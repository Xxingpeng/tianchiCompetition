import { describe, expect, it, vi } from "vitest";
import { CatalogError, assertCatalog, loadCatalog, selectableStructures } from "../data/catalog";
import { catalog, shippedCatalog, structure } from "./fixtures";

/** 取回 CatalogError 的问题清单；没抛错就当作失败。 */
function problemsOf(raw: unknown): string[] {
  try {
    assertCatalog(raw);
  } catch (error) {
    if (error instanceof CatalogError) return error.problems;
    throw error;
  }
  throw new Error("预期校验失败，但它通过了");
}

describe("assertCatalog", () => {
  it("接受合法目录", () => {
    expect(assertCatalog(catalog()).structures).toHaveLength(2);
  });

  it("schema 版本不符时单独报错，而不是混进字段问题里", () => {
    expect(() => assertCatalog(catalog({ schema_version: 99 }))).toThrow(/schema_version/);
  });

  it("一次性收全问题：缺文案、空 aliases、非法 label、缺视图都各报一条", () => {
    const problems = problemsOf({
      ...catalog(),
      structures: [
        {
          ...structure(),
          description: "",
          aliases: [],
          label: 42,
          views: { axial: { view_name: "轴位", base: "b", overlay: "o" } },
        },
      ],
    });
    expect(problems.filter((p) => p.includes("description"))).toHaveLength(1);
    expect(problems.filter((p) => p.includes("aliases"))).toHaveLength(1);
    expect(problems.filter((p) => p.includes("1..9"))).toHaveLength(1);
    expect(problems.filter((p) => p.includes("coronal"))).toHaveLength(1);
    expect(problems.filter((p) => p.includes("sagittal"))).toHaveLength(1);
  });

  it("notices 少了用途声明就失败——页面不能不带「示意模型」就上线", () => {
    expect(problemsOf(catalog({ notices: ["BodyParts3D 署名"] })).join()).toContain("示意");
  });

  it("label 重复违反冻结映射", () => {
    expect(
      problemsOf({
        ...catalog(),
        structures: [structure(), structure({ id: "la", name: "左心房" })],
      }).join(),
    ).toContain("label 3 与其他结构重复");
  });
});

describe("仓库里真正发布的 structures.json", () => {
  it("必须通过前端同一套校验", () => {
    expect(assertCatalog(shippedCatalog).structures.length).toBeGreaterThanOrEqual(8);
  });

  it("每条都带来源标注，页面才能如实区分 BP3D 派生与自制件", () => {
    const ready = assertCatalog(shippedCatalog);
    for (const s of ready.structures) {
      expect(s.provenance.length).toBeGreaterThan(0);
      expect(s.views.axial.base).toMatch(/^assets\/slices\//);
    }
    expect(ready.notices.join("\n")).toContain("BodyParts3D");
  });
});

describe("loadCatalog", () => {
  it("HTTP 非 2xx 时带上状态码失败", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
    await expect(loadCatalog("/assets/structures.json")).rejects.toThrow(/HTTP 404/);
  });

  it("fetch 本身抛错（离线/断网）也归一成 CatalogError", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(loadCatalog("/x.json")).rejects.toBeInstanceOf(CatalogError);
  });
});

describe("selectableStructures", () => {
  it("按冻结标签排序，与 Python 侧标签表同序", () => {
    expect(selectableStructures(catalog()).map((s) => s.label)).toEqual([1, 3]);
  });
});
