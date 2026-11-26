import { CT_SCHEMA_VERSION, SCHEMA_VERSION } from "../types";
import type { Catalog, CtManifest, CtSlice, StructureRecord, ViewName, ViewEntry } from "../types";

function views(prefix: string): Record<ViewName, ViewEntry> {
  const make = (view: ViewName, name: string): ViewEntry => ({
    view_name: name,
    base: `assets/slices/${prefix}_${view}_base.png`,
    overlay: `assets/slices/${prefix}_${view}_overlay.png`,
    slice_index: 48,
    slice_voxels: 320,
  });
  return {
    axial: make("axial", "轴位"),
    coronal: make("coronal", "冠状位"),
    sagittal: make("sagittal", "矢状位"),
  };
}

export function structure(overrides: Partial<StructureRecord> = {}): StructureRecord {
  return {
    id: "lv",
    label: 3,
    name: "左心室",
    en_name: "Left ventricle",
    // 注意：overrides 不会重置 aliases。造第二条结构时必须自带别名，
    // 否则两条结构共用 "LV"，检索测试会在毫无察觉的情况下出现两个候选。
    aliases: ["左室", "left ventricle", "LV"],
    description: "位于左心房下方的心腔，壁最厚。",
    parent: "心腔",
    color: "#c0392b",
    mesh: "assets/meshes/lv.glb",
    views: views("lv"),
    provenance: "BP3D / lv_FJ2422.obj",
    stats: { voxels: 35662, centroid_slice_index: [52, 60, 40] },
    ...overrides,
  };
}

export function ctManifest(overrides: Partial<CtManifest> = {}): CtManifest {
  const slices: CtSlice[] = Array.from({ length: 96 }, (_, index) => ({
    index,
    voxels: 0,
    structures: [],
  }));
  slices[48] = {
    index: 48,
    voxels: 600,
    structures: [
      { id: "lv", name: "左心室", voxels: 320 },
      { id: "myo", name: "心肌", voxels: 280 },
    ],
  };
  return {
    schema_version: CT_SCHEMA_VERSION,
    note: "伪 CT：由教学标注体素合成，不是真实病例影像，也不能用于诊断。",
    slice_count: 96,
    slice_spacing_mm: 1.6,
    upscale: 2,
    image_size: [192, 192],
    base_pattern: "assets/ct/base/{index:03d}_{window}.png",
    overlay_pattern: "assets/ct/overlay/{id}/{index:03d}.png",
    default_window: "mediastinal",
    windows: [
      { id: "mediastinal", name: "纵隔窗", width: 350, level: 40 },
      { id: "lung", name: "肺窗", width: 1500, level: -600 },
    ],
    best_slice: { lv: 48, myo: 48 },
    slices,
    ...overrides,
  };
}

export function catalog(overrides: Partial<Catalog> = {}): Catalog {
  return {
    schema_version: SCHEMA_VERSION,
    provenance_mode: "bp3d",
    grid: {
      shape: [96, 96, 96],
      spacing_mm: [1.6, 1.6, 1.6],
      origin_mm: [-76.8, -76.8, -76.8],
      axis_order: ["左右", "前后", "上下"],
      axis_note: "V[i0,i1,i2]：i0 右→左，i1 前→后，i2 下→上",
    },
    notices: ["示意结构模型，非真实病例影像，亦非分割模型推理结果。"],
    structures: [
      structure(),
      structure({
        id: "myo",
        label: 1,
        name: "心肌",
        en_name: "Myocardium",
        aliases: ["心肌壁", "myocardium"],
        provenance: "BP3D / myo_FJ2428.obj",
      }),
    ],
    excluded: [],
    ct: ctManifest(),
    ...overrides,
  };
}

/** 用真实资产目录跑测试：Python 侧一改 schema，这里立刻红。 */
export { default as shippedCatalog } from "../../public/assets/structures.json";
