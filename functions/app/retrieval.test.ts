import { describe, expect, it } from "vitest";
import { heartKnowledge as kbJson } from "../knowledge/heart-knowledge.ts";
import { createRetriever } from "./retrieval.ts";

const kb = kbJson;
const retrieve = createRetriever(kb);

describe("知识库完整性", () => {
  it("每条资料都有可展示的来源、许可与 https 链接", () => {
    expect(kb.chunks.length).toBeGreaterThanOrEqual(30);
    const ids = new Set<string>();
    for (const chunk of kb.chunks) {
      const meta = kb.sources[chunk.source];
      expect(meta, chunk.id).toBeDefined();
      expect(meta?.url.startsWith("https://"), chunk.id).toBe(true);
      expect(meta?.license.length ?? 0, chunk.id).toBeGreaterThan(3);
      expect(ids.has(chunk.id), `重复 id ${chunk.id}`).toBe(false);
      ids.add(chunk.id);
      expect([...chunk.text].length, chunk.id).toBeGreaterThan(40);
    }
  });

  it("全部来源都指向国内可访问站点", () => {
    const domestic = ["pmph.com", "cmaph.org", "yantai.gov.cn", "qoder.zone"];
    for (const [id, source] of Object.entries(kb.sources)) {
      const host = new URL(source.url).hostname;
      expect(
        domestic.some((domain) => host === domain || host.endsWith(`.${domain}`)),
        `${id} → ${host}`,
      ).toBe(true);
    }
  });
});

describe("createRetriever", () => {
  it("心肌厚度问题能命中左心室壁与心肌条目", () => {
    const { citations } = retrieve("左心室为什么比右心室壁厚");
    const ids = citations.map((citation) => citation.id);
    expect(ids).toContain("anat-myocardium-thickness");
  });

  it("窗宽窗位命中 CT 条目并带来源", () => {
    const { citations } = retrieve("窗宽窗位是什么");
    expect(citations[0]?.id).toBe("ct-window");
    expect(citations[0]?.sourceName).toContain("人民卫生出版社");
    const ids = citations.map((citation) => citation.id);
    expect(ids).not.toContain("anat-auricle");
    expect(ids).not.toContain("anat-myocardium-thickness");
  });

  it("瓣膜问题优先命中瓣膜条目而不是泛泛的心脏条目", () => {
    const { citations } = retrieve("心脏的瓣膜有哪些，各自作用是什么？");
    const ids = citations.map((citation) => citation.id);
    expect(ids).toContain("anat-valves");
    expect(citations[0]?.id).toBe("anat-valves");
  });

  it("解剖题按主题收窄，不混入 CT 与站内目录条目", () => {
    const ids = retrieve("心动周期分几个时相", "anatomy").citations.map((citation) => citation.id);
    expect(ids).toContain("anat-cycle");
    expect(ids).not.toContain("ct-contrast");
    expect(ids).not.toContain("site-structures");
  });

  it("CT 题保留解剖条目作为看图基础", () => {
    const ids = retrieve("CT 上怎么看左心室", "ct").citations.map((citation) => citation.id);
    expect(ids.some((id) => id.startsWith("ct-"))).toBe(true);
    expect(ids).toContain("anat-lv");
  });

  it("左心耳命中解剖条目", () => {
    const { citations } = retrieve("左心耳是什么");
    expect(citations.map((citation) => citation.id)).toContain("anat-auricle");
  });

  it("国内疾病条目能回答高血压、房颤与心衰的概念问题", () => {
    const ids = (query: string) =>
      retrieve(query, "anatomy").citations.map((citation) => citation.id);
    expect(ids("高血压为什么伤心脏")).toContain("disease-hypertension-heart");
    expect(ids("人为什么会得高血压")).toContain("disease-hypertension-causes");
    expect(ids("房颤为什么会导致脑卒中")).toContain("disease-af");
    expect(ids("心衰为什么气短水肿")).toContain("disease-hf");
  });

  it("心音、心电图与轴位方位问题命中国内教材条目", () => {
    expect(
      retrieve("第一心音是哪两个瓣膜关闭", "anatomy").citations.map((item) => item.id),
    ).toContain("anat-heart-sounds");
    expect(retrieve("心电图P波代表什么", "anatomy").citations.map((item) => item.id)).toContain(
      "anat-ecg",
    );
    expect(retrieve("轴位CT图像哪边是患者左侧", "ct").citations.map((item) => item.id)).toContain(
      "ct-axial-orientation",
    );
  });

  it("完全无关的查询不返回资料", () => {
    expect(retrieve("量子力学的波函数坍缩").citations).toHaveLength(0);
  });

  it("返回数量受上限约束且编号连续", () => {
    const { citations } = retrieve("心脏 瓣膜 血液循环 心肌 主动脉");
    expect(citations.length).toBeLessThanOrEqual(4);
    expect(citations.map((citation) => citation.n)).toEqual(citations.map((_, index) => index + 1));
  });
});
