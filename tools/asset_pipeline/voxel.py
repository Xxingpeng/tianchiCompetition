"""把几何变成体素：封闭三角网格的光线投射填充，与兜底用的隐式几何采样。

网格体素化算法（不依赖任何第三方库）：
  1. 沿某一根轴，逐个体素平面求网格的截线集合（每个三角面与该平面最多交出两个点，
     用半开区间约定 `(d<0)<=dn` 保证闭合网格恰好成对命中，避免顶点落在平面上时重复计数）。
  2. 截线构成该平面内的一组多边形边界。对平面内每一行做扫描线奇偶填充。
这套做法直接产出「内部被填满」的体素，因此三视图的实心区域与 GLB 表面来自同一份占据判定。
"""

from __future__ import annotations

from collections.abc import Callable, Sequence

import numpy as np

from .geom import Mesh

ImplicitFn = Callable[[np.ndarray, np.ndarray, np.ndarray], np.ndarray]


def _plane_crossings(vertices: np.ndarray, faces: np.ndarray, c: float) -> np.ndarray:
    """平面 x0 = c 与网格的截线，返回 (K,2,2)：端点在 (x1,x2) 平面内的坐标。"""
    tri = vertices[faces]  # (M,3,3)
    d = tri[..., 0] - c
    nxt_tri = np.roll(tri, -1, axis=1)
    d_next = np.roll(d, -1, axis=1)
    straddle = ((d < 0) & (d_next >= 0)) | ((d_next < 0) & (d >= 0))
    denom = d_next - d
    ratio = np.where(straddle, -d / np.where(denom == 0, 1.0, denom), 0.0)
    pts = tri + ratio[..., None] * (nxt_tri - tri)

    count = straddle.sum(1)
    ok = count == 2
    if not ok.any():
        return np.zeros((0, 2, 2))
    rows = np.arange(len(straddle))
    first = np.argmax(straddle, axis=1)
    rest = straddle.copy()
    rest[rows, first] = False
    second = np.argmax(rest, axis=1)
    a = pts[rows, first]
    b = pts[rows, second]
    segs = np.stack([a, b], axis=1)
    return segs[ok][:, :, 1:]


def _scanline_fill(
    segs: np.ndarray, shape2: Sequence[int], origin2: Sequence[float], spacing2: Sequence[float]
) -> np.ndarray:
    """在 (H,W) 平面内用奇偶规则填充多边形。segs 的坐标已是该平面的物理坐标。"""
    out = np.zeros((int(shape2[0]), int(shape2[1])), dtype=bool)
    if segs.size == 0:
        return out
    u0 = segs[:, 0, 0]
    u1 = segs[:, 1, 0]
    lo = np.minimum(u0, u1)
    hi = np.maximum(u0, u1)
    for i in range(out.shape[0]):
        y = origin2[0] + (i + 0.5) * spacing2[0]
        sel = (lo <= y) & (hi > y) & (hi > lo)
        if not sel.any():
            continue
        s = segs[sel]
        au, av = s[:, 0, 0], s[:, 0, 1]
        bu, bv = s[:, 1, 0], s[:, 1, 1]
        t = (y - au) / (bu - au)
        cross = np.sort(av + t * (bv - av))
        idx = (cross - origin2[1]) / spacing2[1] - 0.5
        for k in range(0, cross.size - 1, 2):
            start = int(np.ceil(idx[k]))
            # 上界用 ceil-1 而不是 floor：体素中心正好落在表面上时，
            # floor 会把这一格算两次（投射轴用半开区间、扫描行也用半开区间），
            # 导致同一根轴上边界归属不一致。三根轴必须同一套规则。
            end = int(np.ceil(idx[k + 1])) - 1
            if end < start:
                continue
            out[i, max(start, 0) : min(end + 1, out.shape[1])] = True
    return out


def voxelize_mesh(
    mesh: Mesh,
    voxel_shape: Sequence[int],
    spacing: float = 1.0,
    origin: Sequence[float] = (0.0, 0.0, 0.0),
    cast_axis: int = 0,
) -> np.ndarray:
    """封闭三角网格 -> (D0,D1,D2) 的 bool 占据数组。

    `cast_axis` 指定投射方向。沿该轴的法线方向薄壁可能漏体素；如需更稳可换轴取并集。
    """
    order = [cast_axis] + [a for a in range(3) if a != cast_axis]
    verts = mesh.vertices[:, order]
    shape_p = [int(voxel_shape[order[0]]), int(voxel_shape[order[1]]), int(voxel_shape[order[2]])]
    origin_p = [float(origin[order[0]]), float(origin[order[1]]), float(origin[order[2]])]
    faces = mesh.faces.astype(np.int64, copy=False)

    out_p = np.zeros(shape_p, dtype=bool)
    for i in range(shape_p[0]):
        c = origin_p[0] + (i + 0.5) * spacing
        segs = _plane_crossings(verts, faces, c)
        if segs.size == 0:
            continue
        out_p[i] = _scanline_fill(segs, shape_p[1:], origin_p[1:], (spacing, spacing))

    back = np.argsort(order)
    return np.ascontiguousarray(np.transpose(out_p, back))


def sample_implicit(
    fn: ImplicitFn,
    voxel_shape: Sequence[int],
    spacing: float = 1.0,
    origin: Sequence[float] = (0.0, 0.0, 0.0),
) -> np.ndarray:
    """在体素中心采样隐式函数，返回 bool。仅用于离线兜底几何。"""
    axes = [origin[k] + (np.arange(voxel_shape[k], dtype=float) + 0.5) * spacing for k in range(3)]
    x0, x1, x2 = np.meshgrid(*axes, indexing="ij")
    return np.asarray(fn(x0, x1, x2), dtype=bool)


def crop_to(mask: np.ndarray, pad: int = 1) -> tuple[slice, ...]:
    """占据区域的紧包围盒切片（含 pad 边距）。空占据返回整网格切片。"""
    idx = np.nonzero(mask)
    if idx[0].size == 0:
        return tuple(slice(0, s) for s in mask.shape)
    out = []
    for axis, n in zip(idx, mask.shape, strict=False):
        out.append(slice(max(int(axis.min()) - pad, 0), min(int(axis.max()) + pad + 1, n)))
    return tuple(out)


def assign_labels(
    masks: dict[str, np.ndarray],
    priority: dict[str, int],
    shape: Sequence[int],
    conflict_budget: int = 20,
) -> tuple[np.ndarray, dict[str, int]]:
    """多个结构占据同一体素时按 priority 大者胜，并返回每个结构实际保留的体素数。

    BP3D 相邻部件的表面会有几个体素互相穿插，这是正常的；但一旦冲突量级失控，
    就说明坐标对齐或缩放出了问题，因此超预算直接报错而不是悄悄吞掉。
    """
    volume = np.zeros(tuple(int(s) for s in shape), dtype=np.int32)
    kept: dict[str, int] = {}
    for sid in sorted(masks, key=lambda s: -priority.get(s, 0)):
        mine = masks[sid] & (volume == 0)
        volume[mine] = priority.get(sid, 0)
        kept[sid] = int(mine.sum())
    total_conflict = sum(int(masks[sid].sum()) for sid in masks) - sum(kept.values())
    if total_conflict > conflict_budget:
        occupancy = {s: int(m.sum()) for s, m in masks.items()}
        raise ValueError(
            f"体素冲突 {total_conflict} 超预算 {conflict_budget}，"
            f"疑似坐标未对齐或缩放不当；各结构原始占据：{occupancy}"
        )
    return volume, kept
