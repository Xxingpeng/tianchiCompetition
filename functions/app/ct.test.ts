import { describe, expect, it } from "vitest";
import { describeCtSlice, parseCt, wantsCtSlice } from "./ct.ts";

const valid = {
  index: 48,
  total: 96,
  window: "mediastinal",
  structures: [
    { id: "lv", name: "伪造名", voxels: 320 },
    { id: "myo", name: "心肌", voxels: 280 },
    { id: "__proto__", name: "越界", voxels: 1 },
    { id: "lv", name: "重复", voxels: 10 },
  ],
  selected: { id: "lv", name: "伪造名", voxels: 320 },
};

describe("parseCt", () => {
  it("只保留服务端的结构名、去掉越界与重复项", () => {
    const ct = parseCt(valid);
    expect(ct).toBeDefined();
    expect(ct?.windowName).toBe("纵隔窗");
    expect(ct?.structures).toEqual([
      { id: "lv", name: "左心室", voxels: 320 },
      { id: "myo", name: "心肌", voxels: 280 },
    ]);
    expect(ct?.selected).toEqual({ id: "lv", name: "左心室", voxels: 320 });
  });

  it("拒绝越界层号、未知窗和非整数体素", () => {
    expect(parseCt({ ...valid, index: 96 })).toBeUndefined();
    expect(parseCt({ ...valid, index: -1 })).toBeUndefined();
    expect(parseCt({ ...valid, total: 0 })).toBeUndefined();
    expect(parseCt({ ...valid, window: "bone" })).toBeUndefined();
    expect(parseCt(null)).toBeUndefined();
    expect(parseCt({ ...valid, structures: [{ id: "lv", voxels: 1.5 }] })?.structures).toEqual([]);
  });

  it("所选结构不在本层时保留 0 体素，供回答说明未见标注", () => {
    const ct = parseCt({ ...valid, structures: [], selected: { id: "lv", voxels: 0 } });
    expect(ct?.selected).toEqual({ id: "lv", name: "左心室", voxels: 0 });
  });
});

describe("wantsCtSlice", () => {
  it("认这层、当前层与显式 CT 层说法", () => {
    for (const question of [
      "这一层有哪些结构",
      "当前层能看到什么",
      "这张 CT 图上高亮的是谁",
      "当前轴位第 30 层显示什么",
      "这层左心室有多少体素",
    ])
      expect(wantsCtSlice(question), question).toBe(true);
  });

  it("不劫持三视图的普通切面问题和泛问", () => {
    for (const question of [
      "轴位切面在第几层",
      "这个高亮是什么",
      "三视图用的是什么切面",
      "心脏有哪些结构",
    ])
      expect(wantsCtSlice(question), question).toBe(false);
  });
});

describe("describeCtSlice", () => {
  it("把层号、窗、可见结构与真值边界说清楚", () => {
    const text = describeCtSlice({
      index: 48,
      total: 96,
      window: "mediastinal",
      windowName: "纵隔窗",
      structures: [
        { id: "lv", name: "左心室", voxels: 320 },
        { id: "myo", name: "心肌", voxels: 280 },
      ],
      selected: { id: "lv", name: "左心室", voxels: 320 },
    });
    expect(text).toContain("第 49/96 层");
    expect(text).toContain("纵隔窗");
    expect(text).toContain("左心室 320 体素");
    expect(text).toContain("构建期真值");
    expect(text).toContain("不是临床测量");
  });

  it("空层与所选结构缺席都如实说明", () => {
    const text = describeCtSlice({
      index: 0,
      total: 96,
      window: "lung",
      windowName: "肺窗",
      structures: [],
      selected: { id: "lv", name: "左心室", voxels: 0 },
    });
    expect(text).toContain("没有标注结构");
    expect(text).toContain("未见标注");
  });
});
