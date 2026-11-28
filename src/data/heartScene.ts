/** 3D 心脏循环演示的数据层：资产清单校验、机位文案与播放常量。 */

export type Vec3 = [number, number, number];

export interface HeartPart {
  id: string;
  file: string;
  group: string;
  color: string;
  bounds: [Vec3, Vec3];
  vertices: number;
  faces: number;
}

export interface HeartValve {
  id: string;
  name: string;
  kind: "av" | "semilunar";
  side: "left" | "right";
  center: Vec3;
  normal: Vec3;
  radius: number;
  leaflets: number;
}

export interface HeartStump {
  part: string;
  center: Vec3;
  normal: Vec3;
  radius: number;
}

export type PortId =
  | "svc"
  | "ivc"
  | "aorta"
  | "pa"
  | "pv-left-superior"
  | "pv-right-superior"
  | "pv-left-inferior"
  | "pv-right-inferior";

export interface HeartManifest {
  schemaVersion: 1;
  note: string;
  source: string;
  bounds: [Vec3, Vec3];
  parts: HeartPart[];
  chambers: Record<"lv" | "rv" | "la" | "ra", Vec3>;
  valves: HeartValve[];
  ports: Record<PortId, Vec3>;
  stumps: HeartStump[];
  totalBytes: number;
}

export type SceneFocus = "overview" | "left" | "right";

export const FOCUS_COPY: Record<SceneFocus, { label: string; path: string }> = {
  overview: {
    label: "全景",
    path: "肺循环：右心 → 肺 → 左心；体循环：左心 → 全身 → 右心",
  },
  left: {
    label: "左心",
    path: "肺静脉 → 左心房 → 二尖瓣 → 左心室 → 主动脉瓣 → 主动脉",
  },
  right: {
    label: "右心",
    path: "上、下腔静脉 → 右心房 → 三尖瓣 → 右心室 → 肺动脉瓣 → 肺动脉",
  },
};

export const PLAYBACK_SPEEDS = [0.5, 1, 1.5] as const;
export const HEART_NOTE = "示意动画 · 非真实病例影像，不用于诊断";
export const HEART_ASSET_NOTE = "几何：BodyParts3D（CC BY 4.0），平滑网格由本项目离线导出";
export const OXY_BLOOD = "#ff5b64";
export const DEOXY_BLOOD = "#4c8dff";

const PORT_IDS: readonly PortId[] = [
  "svc",
  "ivc",
  "aorta",
  "pa",
  "pv-left-superior",
  "pv-right-superior",
  "pv-left-inferior",
  "pv-right-inferior",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function checkBounds(value: unknown, label: string, issues: string[]): void {
  if (!Array.isArray(value) || value.length !== 2 || !isVec3(value[0]) || !isVec3(value[1])) {
    issues.push(`${label} 需要两个三维角点`);
  }
}

/** 清单是构建产物，运行期仍做硬校验：字段缺失时给出一条能定位到部件的错误。 */
export function assertHeartManifest(input: unknown): asserts input is HeartManifest {
  const issues: string[] = [];
  if (!isRecord(input)) throw new Error("3D 心脏资产清单不是对象");
  if (input.schemaVersion !== 1) issues.push("schemaVersion 应为 1");
  if (typeof input.note !== "string" || !input.note.includes("不是真实病例")) {
    issues.push("note 必须声明不是真实病例");
  }
  if (typeof input.source !== "string" || !input.source.includes("BodyParts3D")) {
    issues.push("source 必须署名 BodyParts3D");
  }
  checkBounds(input.bounds, "bounds", issues);

  const parts = input.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    issues.push("parts 不能为空");
  } else {
    const ids = new Set<string>();
    for (const part of parts) {
      if (!isRecord(part)) {
        issues.push("parts 中存在非对象项");
        continue;
      }
      const id = part.id;
      if (typeof id !== "string" || !id) issues.push("part.id 缺失");
      else if (ids.has(id)) issues.push(`part.id 重复：${id}`);
      else ids.add(id);
      if (typeof part.file !== "string" || !part.file.startsWith("circulation/")) {
        issues.push(`${String(id)} 的 file 必须位于 circulation/`);
      }
      if (typeof part.group !== "string" || !part.group) {
        issues.push(`${String(id)} 的 group 缺失`);
      }
      if (typeof part.color !== "string" || !/^#[0-9a-f]{6}$/i.test(part.color)) {
        issues.push(`${String(id)} 的 color 必须是 #rrggbb`);
      }
      checkBounds(part.bounds, `${String(id)} 的 bounds`, issues);
    }
  }

  const chambers = input.chambers;
  if (!isRecord(chambers)) issues.push("chambers 缺失");
  else {
    for (const key of ["lv", "rv", "la", "ra"] as const) {
      if (!isVec3(chambers[key])) issues.push(`chambers.${key} 必须是三维坐标`);
    }
  }

  const valves = input.valves;
  if (!Array.isArray(valves) || valves.length !== 4) {
    issues.push("valves 必须包含四个瓣膜");
  } else {
    const ids = new Set<string>();
    for (const valve of valves) {
      if (!isRecord(valve) || typeof valve.id !== "string") {
        issues.push("valve.id 缺失");
        continue;
      }
      if (ids.has(valve.id)) issues.push(`valve.id 重复：${valve.id}`);
      else ids.add(valve.id);
      if (typeof valve.name !== "string" || !valve.name) issues.push(`${valve.id} 的 name 缺失`);
      if (valve.kind !== "av" && valve.kind !== "semilunar") {
        issues.push(`${valve.id} 的 kind 必须是 av 或 semilunar`);
      }
      if (valve.side !== "left" && valve.side !== "right") {
        issues.push(`${valve.id} 的 side 必须是 left 或 right`);
      }
      if (!isVec3(valve.center)) issues.push(`${valve.id} 的 center 无效`);
      if (!isVec3(valve.normal)) issues.push(`${valve.id} 的 normal 无效`);
      if (typeof valve.radius !== "number" || valve.radius <= 0) {
        issues.push(`${valve.id} 的 radius 必须为正`);
      }
      if (typeof valve.leaflets !== "number" || valve.leaflets <= 0) {
        issues.push(`${valve.id} 的 leaflets 必须为正`);
      }
    }
    for (const id of ["mitral", "tricuspid", "aortic", "pulmonary"]) {
      if (!ids.has(id)) issues.push(`缺少瓣膜：${id}`);
    }
  }

  const ports = input.ports;
  if (!isRecord(ports)) issues.push("ports 缺失");
  else {
    for (const id of PORT_IDS) {
      if (!isVec3(ports[id])) issues.push(`ports.${id} 必须是三维坐标`);
    }
  }

  const stumps = input.stumps;
  if (!Array.isArray(stumps) || stumps.length === 0) {
    issues.push("stumps 不能为空");
  } else {
    for (const stump of stumps) {
      if (!isRecord(stump) || typeof stump.part !== "string") {
        issues.push("stump.part 缺失");
        continue;
      }
      if (!isVec3(stump.center)) issues.push(`${stump.part} 的断口 center 无效`);
      if (!isVec3(stump.normal)) issues.push(`${stump.part} 的断口 normal 无效`);
      if (typeof stump.radius !== "number" || stump.radius <= 0) {
        issues.push(`${stump.part} 的断口 radius 必须为正`);
      }
    }
  }

  if (typeof input.totalBytes !== "number" || input.totalBytes <= 0) {
    issues.push("totalBytes 必须为正");
  }

  if (issues.length > 0) {
    throw new Error(`3D 心脏资产清单无效：${issues.slice(0, 6).join("；")}`);
  }
}

export async function fetchHeartManifest(): Promise<HeartManifest> {
  const response = await fetch("/assets/circulation/manifest.json");
  if (!response.ok) throw new Error(`载入 3D 心脏清单失败：HTTP ${response.status}`);
  const data: unknown = await response.json();
  assertHeartManifest(data);
  return data;
}
