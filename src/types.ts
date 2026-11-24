/** `public/assets/structures.json` 的运行时类型，与 Python 侧 catalog.py 的 schema_version 对齐。 */

export const SCHEMA_VERSION = 1;

export const VIEW_NAMES = ["axial", "coronal", "sagittal"] as const;

export type ViewName = (typeof VIEW_NAMES)[number];

export interface ViewEntry {
  view_name: string;
  /** 站点相对路径，如 assets/slices/lv_axial_base.png */
  base: string;
  overlay: string;
  slice_index: number;
  slice_voxels: number;
}

export interface StructureRecord {
  id: string;
  /** 本项目冻结的整数标签：1 心肌 / 2 左心房 / 3 左心室 / 4 右心房 / 5 右心室 / 6 升主动脉 / 7 肺动脉 / 8 肺静脉 / 9 左心耳 */
  label: number;
  name: string;
  en_name: string;
  aliases: string[];
  description: string;
  parent: string;
  color: string;
  mesh: string;
  views: Record<ViewName, ViewEntry>;
  /** 资产来源，如 "BP3D / lv_FJ2422.obj" 或 "自制几何（BP3D 未收录 lxa）…"，页面必须如实显示 */
  provenance: string;
  stats: { voxels: number; centroid_slice_index: number[] };
}

export interface ExcludedRecord {
  id: string;
  reason: string;
}

export type ProvenanceMode = "bp3d" | "procedural_fallback" | "mixed";

export interface Catalog {
  schema_version: number;
  provenance_mode: ProvenanceMode;
  grid: {
    shape: number[];
    spacing_mm: number[];
    origin_mm: number[];
    axis_order: string[];
    axis_note: string;
  };
  notices: string[];
  structures: StructureRecord[];
  excluded: ExcludedRecord[];
}
