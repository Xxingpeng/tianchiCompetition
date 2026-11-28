"""BP3D（BodyParts3D）路线 —— 本项目的默认几何来源。

`assets_raw/bp3d_manifest.json` 描述「页面结构 id -> BP3D OBJ 文件名」的对应关系。
页面文案（中文名、说明、配色、冻结标签）一律取自 `meta.py`，manifest 只负责几何映射，
这样换一次几何来源不会顺带改掉页面文字。

所有部件共用同一个均匀缩放 + 平移，因此它们之间的相对解剖位置被完整保留——
这是三视图与 3D 网格能互相对上、且相邻部件贴合的前提。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from .geom import Mesh, boundary_edges, dedupe_vertices, fit_transform, load_obj
from .meta import BY_ID, StructureMeta
from .voxel import MAX_LOSS_RATIO, assign_labels, voxelize_mesh


@dataclass
class ObjBinding:
    """一个页面结构与一个 OBJ 文件的绑定。"""

    id: str
    obj: str
    verified: bool = False
    cast_axis: int = 0

    @property
    def meta(self) -> StructureMeta:
        return BY_ID[self.id]


@dataclass
class Bp3dManifest:
    path: Path
    obj_dir: str
    bindings: list[ObjBinding] = field(default_factory=list)

    @property
    def ids(self) -> list[str]:
        return [b.id for b in self.bindings]

    @property
    def unverified(self) -> list[str]:
        """文件名还没和实际下载的 BP3D 包核对过的结构。"""
        return [b.id for b in self.bindings if not b.verified]


def load_manifest(path: str | Path) -> Bp3dManifest:
    raw: dict[str, Any] = json.loads(Path(path).read_text(encoding="utf-8"))
    items = raw.get("structures") or []
    bindings: list[ObjBinding] = []
    for item in items:
        sid = str(item.get("id", ""))
        obj = str(item.get("obj", ""))
        if sid not in BY_ID:
            raise ValueError(f"manifest 中的 {sid!r} 不在 meta.STRUCTURES 里")
        # obj 允许暂时留空：BP3D 原始包到手前，我们要能核对文件名到底叫什么，
        # 留空的条目会被当成"缺失"如实报告，而不是报错卡住整条链路。
        bindings.append(
            ObjBinding(
                id=sid,
                obj=obj,
                verified=bool(item.get("verified", False)),
                cast_axis=int(item.get("cast_axis", 0)),
            )
        )
    dup = sorted({b.id for b in bindings if [x.id for x in bindings].count(b.id) > 1})
    if dup:
        raise ValueError(f"manifest 中结构 id 重复：{dup}")
    return Bp3dManifest(
        path=Path(path), obj_dir=str(raw.get("obj_dir", "bodyparts3d")), bindings=bindings
    )


def obj_path(manifest: Bp3dManifest, binding: ObjBinding, assets_raw_dir: Path) -> Path:
    return Path(assets_raw_dir) / manifest.obj_dir / binding.obj


def resolve_bindings(
    manifest: Bp3dManifest,
    assets_raw_dir: Path,
) -> tuple[list[ObjBinding], list[ObjBinding]]:
    """分成「文件在」和「文件不在」两组，缺失项交给调用方如实报告，绝不静默顶替。"""
    present, absent = [], []
    for b in manifest.bindings:
        (present if obj_path(manifest, b, assets_raw_dir).is_file() else absent).append(b)
    return present, absent


#: 允许的边界边上限。BP3D 发布网格本身带个位数针孔（心肌 FJ2428 实测 7 条），
#: 这类针孔远小于体素尺度，不会让奇偶填充漏体素；而下载截断或整片面片缺失会一次
#: 报出成百上千条。所以判据是"明显截断才失败"，而不是"必须为 0"——后者会把正式
#: 几何全部挡在门外，前者才拦得住真正会产生错误解剖图的情况。
MAX_OPEN_EDGES = 64


def audit_mesh(mesh: Mesh) -> dict[str, int]:
    """网格体检指标，用于构建日志与资产审计。"""
    return {
        "vertices": len(mesh.vertices),
        "faces": len(mesh.faces),
        "open_edges": boundary_edges(mesh),
    }


def load_meshes(
    manifest: Bp3dManifest,
    assets_raw_dir: Path,
    bindings: list[ObjBinding] | None = None,
    max_open_edges: int = MAX_OPEN_EDGES,
) -> dict[str, Mesh]:
    targets = bindings if bindings is not None else manifest.bindings
    out: dict[str, Mesh] = {}
    for b in targets:
        p = obj_path(manifest, b, assets_raw_dir)
        mesh = dedupe_vertices(load_obj(p))
        if len(mesh.vertices) < 4 or not len(mesh.faces):
            raise ValueError(f"{b.id} 的 {p.name} 顶点/面数过少，不是可用的封闭网格")
        open_edges = boundary_edges(mesh)
        if open_edges > max_open_edges:
            raise ValueError(
                f"{b.id} 的 {p.name} 有 {open_edges} 条边界边，超过 {max_open_edges} 条上限。"
                "这种量级说明 OBJ 下载不完整或部件本身是开口面片；"
                "开口网格做奇偶填充会凭空围出实体，必须先修好或换部件，不能直接体素化。"
            )
        out[b.id] = mesh
    return out


def build_label_volume(
    meshes: dict[str, Mesh],
    labels: dict[str, int],
    voxel_shape: tuple[int, int, int],
    spacing: float = 1.0,
    margin_voxels: int = 3,
    cast_axis: int = 0,
    cast_axes: dict[str, int] | None = None,
    conflict_budget: int | None = None,
    max_loss_ratio: float = MAX_LOSS_RATIO,
) -> tuple[np.ndarray, dict[str, int], tuple[float, np.ndarray]]:
    """共用变换 -> 逐个体素化 -> 合成一份标注体素。返回体素、各结构体素数、所用变换。

    `cast_axes` 可为个别部件单独指定投射轴：沿轴方向的薄壁（如主动脉壁）可能漏体素，
    换个轴就能补上。

    相邻部件的表面穿插是正常现象（实测 BP3D 心脏：主动脉穿出左心室腔口会吃掉主动脉
    约 15% 的体素，其余两两穿插都在 0.5% 以下），所以判据是"单个部件被吞掉的比例"；
    一旦比例失控就说明缩放或对位有问题，直接报错而不是悄悄把体素吞掉。
    """
    if len(meshes) < 2:
        raise ValueError(f"可用网格只有 {len(meshes)} 个，不足以构成对照演示")
    scale, offset = fit_transform(list(meshes.values()), voxel_shape, spacing, margin_voxels)

    axes = cast_axes or {}
    masks: dict[str, np.ndarray] = {}
    for sid, mesh in meshes.items():
        placed = Mesh(mesh.vertices * scale + offset, mesh.faces)
        masks[sid] = voxelize_mesh(
            placed, voxel_shape, spacing, (0.0, 0.0, 0.0), axes.get(sid, cast_axis)
        )

    budget = conflict_budget if conflict_budget is not None else _default_budget(voxel_shape)
    volume, kept = assign_labels(
        masks, labels, voxel_shape, conflict_budget=budget, max_loss_ratio=max_loss_ratio
    )
    return volume, kept, (scale, offset)


def _default_budget(voxel_shape: tuple[int, int, int]) -> int:
    """总体积 1.2‰ 的穿插量：只是兜底，真正的判据在 assign_labels 的按部件比例里。"""
    total = int(np.prod(voxel_shape))
    return max(600, int(0.012 * total))
