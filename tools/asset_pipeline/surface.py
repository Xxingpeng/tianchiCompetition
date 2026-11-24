"""从标注体素提取表面网格（marching cubes），供 GLB 导出使用。

关键点：体素与网格必须处在同一套世界坐标里，否则 3D 模型和三视图会互相错位。
体素 V[i0,i1,i2] 的中心位于 world = origin + (i + 0.5) * spacing，
而 marching_cubes 返回的是「索引 × spacing」，因此要补 0.5 * spacing。
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from skimage.measure import marching_cubes

from .geom import Mesh

MIN_VOXELS = 12


def voxel_to_world(verts_idx: np.ndarray, spacing: float, origin: Sequence[float]) -> np.ndarray:
    return verts_idx * spacing + np.asarray(origin, float) + 0.5 * spacing


def mesh_from_mask(
    mask: np.ndarray,
    spacing: float = 1.0,
    origin: Sequence[float] = (0.0, 0.0, 0.0),
    step_size: int = 1,
) -> Mesh:
    """把单个结构的占据掩码变成封闭三角网格。

    `step_size` > 1 时按倍抽稀，用于把 GLB 体积压到预算内；抽稀会削掉细小突起，
    所以只在体积超标时才调大，而不是默认开。
    """
    if mask.dtype != bool:
        mask = mask.astype(bool)
    if int(mask.sum()) < MIN_VOXELS:
        raise ValueError(f"体素数 {int(mask.sum())} 少于 {MIN_VOXELS}，提不出稳定表面")
    step = max(1, int(step_size))
    work = mask[::step, ::step, ::step] if step > 1 else mask
    if int(work.sum()) < MIN_VOXELS:
        work = mask  # 抽稀后塌掉了，退回原分辨率
        step = 1
    verts, faces = marching_cubes(work, level=0.5, spacing=(spacing * step,) * 3)[:2]
    # marching_cubes 给的是「抽稀后索引 × 抽稀后 spacing」，仍是原网格的物理坐标；
    # 体素中心比索引多半个体素，故补 0.5 * spacing * step。
    world = np.asarray(verts, float) + np.asarray(origin, float) + 0.5 * spacing * step
    return Mesh(world, np.asarray(faces, np.int32))
