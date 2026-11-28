import { describe, expect, it } from "vitest";
import rawManifest from "../../public/assets/circulation/manifest.json";
import {
  DEOXY_BLOOD,
  FOCUS_COPY,
  OXY_BLOOD,
  PLAYBACK_SPEEDS,
  assertHeartManifest,
} from "../data/heartScene";

assertHeartManifest(rawManifest);
const manifest = rawManifest;

function cloneManifest(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(rawManifest)) as Record<string, unknown>;
}

describe("3D 循环资产清单", () => {
  it("19 个部件都在预算内、文件唯一", () => {
    expect(manifest.parts).toHaveLength(19);
    expect(new Set(manifest.parts.map((part) => part.id)).size).toBe(19);
    for (const part of manifest.parts) {
      expect(part.file).toBe(`circulation/${part.id}.glb`);
      expect(part.faces).toBeGreaterThan(0);
      expect(part.vertices).toBeGreaterThan(0);
      expect(part.bounds[1][0]).toBeGreaterThan(part.bounds[0][0]);
      expect(part.bounds[1][1]).toBeGreaterThan(part.bounds[0][1]);
      expect(part.bounds[1][2]).toBeGreaterThan(part.bounds[0][2]);
    }
    expect(manifest.totalBytes).toBeLessThan(4_000_000);
    expect(manifest.totalBytes).toBeGreaterThan(1_000_000);
  });

  it("四个瓣环方向都是单位向量，且左右房室瓣齐全", () => {
    const ids = manifest.valves.map((valve) => valve.id).sort();
    expect(ids).toEqual(["aortic", "mitral", "pulmonary", "tricuspid"]);
    for (const valve of manifest.valves) {
      const length = Math.hypot(...valve.normal);
      expect(length).toBeGreaterThan(0.99);
      expect(length).toBeLessThan(1.01);
      expect(valve.radius).toBeGreaterThan(0);
      expect(valve.center[2]).toBeGreaterThan(1150);
    }
    expect(manifest.valves.find((valve) => valve.id === "mitral")?.side).toBe("left");
    expect(manifest.valves.find((valve) => valve.id === "tricuspid")?.side).toBe("right");
  });

  it("八个血管端口齐全，下腔静脉已截短以免把心脏缩小", () => {
    expect(Object.keys(manifest.ports)).toHaveLength(8);
    expect(manifest.ports.ivc[2]).toBeGreaterThan(1100);
    expect(manifest.ports.svc[2]).toBeGreaterThan(manifest.ports.ivc[2]);
    expect(manifest.ports.aorta[2]).toBeGreaterThan(manifest.ports.ivc[2]);
  });

  it("署名与「不是真实病例」声明不可缺", () => {
    const noNote = cloneManifest();
    noNote.note = "仅是示意";
    expect(() => assertHeartManifest(noNote)).toThrow(/不是真实病例/);

    const noSource = cloneManifest();
    noSource.source = "自制解剖模型";
    expect(() => assertHeartManifest(noSource)).toThrow(/BodyParts3D/);
  });

  it("瓣膜缺 kind 或半径非法会被拒绝", () => {
    const badKind = cloneManifest();
    const valves = badKind.valves as Record<string, unknown>[];
    if (valves[0]) valves[0].kind = "door";
    expect(() => assertHeartManifest(badKind)).toThrow(/kind/);

    const badRadius = cloneManifest();
    const radiusValves = badRadius.valves as Record<string, unknown>[];
    if (radiusValves[0]) radiusValves[0].radius = 0;
    expect(() => assertHeartManifest(badRadius)).toThrow(/radius/);
  });
});

describe("演示文案与颜色", () => {
  it("两条循环路径覆盖肺循环与体循环", () => {
    expect(FOCUS_COPY.left.path).toContain("肺静脉");
    expect(FOCUS_COPY.left.path).toContain("二尖瓣");
    expect(FOCUS_COPY.left.path).toContain("主动脉瓣");
    expect(FOCUS_COPY.right.path).toContain("上、下腔静脉");
    expect(FOCUS_COPY.right.path).toContain("三尖瓣");
    expect(FOCUS_COPY.right.path).toContain("肺动脉瓣");
    expect(FOCUS_COPY.overview.path).toContain("肺循环");
    expect(FOCUS_COPY.overview.path).toContain("体循环");
  });

  it("颜色与倍速是界面允许的取值", () => {
    expect(OXY_BLOOD).toMatch(/^#[0-9a-f]{6}$/i);
    expect(DEOXY_BLOOD).toMatch(/^#[0-9a-f]{6}$/i);
    expect(OXY_BLOOD).not.toBe(DEOXY_BLOOD);
    expect(PLAYBACK_SPEEDS).toEqual([0.5, 1, 1.5]);
  });
});
