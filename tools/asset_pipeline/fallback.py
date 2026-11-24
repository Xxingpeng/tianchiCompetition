"""程序化兜底几何 —— 仅在 BP3D OBJ 缺失、需要离线跑通链路时使用。

定位说明：本项目的正式几何来源是 BP3D（见 bp3d.py）。本模块**不是**"等 BP3D 到手后要替换掉的
临时占位"，而是为下面两种场景准备的：
  1. CI 与本地自检：干净 runner 上没有 3.6 GB 原始包时，仍能验证体素化→渲染→导出→校验全链路；
  2. 某个 BP3D 部件确实没有独立网格（例如左心耳）时，用自作几何补齐该结构。
用本模块产出的资产会在 structures.json 里标 `source="procedural_fallback"`，页面如实显示来源，
不与 BP3D 派生资产混为一谈。

坐标与全项目一致：分量顺序 [左右, 前后, 上下]，单位 mm，+左 / +后 / +上。
"""

from __future__ import annotations

from collections.abc import Callable, Sequence

import numpy as np

from .voxel import sample_implicit

Fn = Callable[[np.ndarray, np.ndarray, np.ndarray], np.ndarray]

# 兜底心脏模型的几何参数（mm，相对模型中心）。故意错开，保证结构之间不嵌套。
_LV = np.array([10.0, 14.0, -14.0])
_RV = np.array([-12.0, -12.0, -10.0])
_LA = np.array([16.0, 22.0, 20.0])
_RA = np.array([-18.0, 12.0, 18.0])
_AO = np.array([4.0, 2.0, 30.0])
_PA = np.array([-8.0, -8.0, 26.0])

# 2026-11-20 纠正后的冻结映射：1 心肌 / 2 左心房 / 3 左心室 / 4 右心房 / 5 右心室
# / 6 升主动脉 / 7 肺动脉 / 8 肺静脉 / 9 左心耳
FALLBACK_LABELS: dict[str, int] = {
    "myo": 1,
    "la": 2,
    "lv": 3,
    "ra": 4,
    "rv": 5,
    "aorta": 6,
    "pa": 7,
    "pv": 8,
    "lxa": 9,
}


def _as3(name: str, v: Sequence[float]) -> np.ndarray:
    """几何参数必须是 3 个分量：多写一位就会静默错位，所以在这里硬拦。"""
    arr = np.asarray(v, float)
    if arr.shape != (3,):
        raise ValueError(f"{name} 需要 3 个分量，实得 shape={arr.shape}：{v}")
    return arr


def _sq(x0, x1, x2, c: Sequence[float], r: Sequence[float]) -> np.ndarray:
    cc = _as3("椭球中心", c)
    rr = _as3("椭球半径", r)
    return ((x0 - cc[0]) / rr[0]) ** 2 + ((x1 - cc[1]) / rr[1]) ** 2 + ((x2 - cc[2]) / rr[2]) ** 2


def _pt(base: Sequence[float], dx: float, dy: float, dz: float) -> tuple[float, float, float]:
    """以某个结构中心为原点写相对坐标。

    容器中心表是 3 元组，绝不能用 `[*base, dx, dy, dz]` 拼接：那会变成 6 元组，
    capsule 会直接报形状错，而旧的 ellipsoid 只读前三个分量，偏移默失效。
    """
    arr = _as3("基准点", base) + np.asarray((dx, dy, dz), float)
    return (float(arr[0]), float(arr[1]), float(arr[2]))


def ellipsoid(center: Sequence[float], radii: Sequence[float]) -> Fn:
    c = _as3("椭球中心", center)
    r = _as3("椭球半径", radii)
    return lambda x0, x1, x2: (
        ((x0 - c[0]) / r[0]) ** 2 + ((x1 - c[1]) / r[1]) ** 2 + ((x2 - c[2]) / r[2]) ** 2 <= 1.0
    )


def shell(center: Sequence[float], radii: Sequence[float], thickness: float) -> Fn:
    """闭壳：外椭球减内椭球。心肌壁用得起，因为它天然包住心腔。"""
    c = _as3("壳中心", center)
    r = _as3("壳半径", radii)
    inner = [max(float(v) - thickness, 0.5) for v in r]
    return lambda x0, x1, x2: (_sq(x0, x1, x2, c, r) <= 1.0) & (_sq(x0, x1, x2, c, inner) > 1.0)


def capsule(p0: Sequence[float], p1: Sequence[float], radius: float) -> Fn:
    a = _as3("capsule 端点", p0)
    b = _as3("capsule 端点", p1)
    ab = b - a
    len2 = float(ab @ ab) or 1.0

    def fn(x0, x1, x2):
        pts = np.stack([x0, x1, x2], axis=-1)
        t = np.clip(((pts - a) @ ab) / len2, 0.0, 1.0)
        return np.sqrt(((pts - (a + t[..., None] * ab)) ** 2).sum(-1)) <= radius

    return fn


def union(*fns: Fn) -> Fn:
    return lambda x0, x1, x2: np.logical_or.reduce([f(x0, x1, x2) for f in fns])


def minus(base: Fn, other: Fn) -> Fn:
    return lambda x0, x1, x2: base(x0, x1, x2) & ~other(x0, x1, x2)


def _apex_trim():
    """切掉心尖以下，免得左心室腔顶穿心肌尖。"""
    return lambda x0, x1, x2: (x2 - _LV[2]) >= -26.0


def raw_masks(
    voxel_shape: Sequence[int], spacing: float, origin: Sequence[float]
) -> dict[str, np.ndarray]:
    """按解剖意图先算各自的占据，尚未排除互相重叠的部分。"""
    occ = lambda fn: sample_implicit(fn, voxel_shape, spacing, origin)  # noqa: E731

    lv_outer = shell(_LV, (28, 24, 38), 9.0)
    lv_cav = minus(ellipsoid(_LV, (19, 15, 29)), _apex_trim())
    return {
        # 心肌 = 左心室壁壳层，心腔部分后面被 lv 抢走，留下的正是环形壁厚
        "myo": occ(lv_outer),
        "lv": occ(lv_cav),
        "rv": occ(
            union(
                ellipsoid(_RV, (14, 12, 24)),
                capsule(_pt(_RV, 0, -8, 20), _pt(_RV, -4, -2, 30), 7.0),
            )
        ),
        "la": occ(ellipsoid(_LA, (14, 12, 13))),
        "ra": occ(ellipsoid(_RA, (15, 13, 14))),
        "aorta": occ(
            union(
                capsule(tuple(_AO), _pt(_AO, 1, -8, 22), 10.0),
                capsule(_pt(_AO, 1, -8, 22), _pt(_AO, 8, -18, 34), 9.0),
            )
        ),
        "pa": occ(
            union(
                capsule(tuple(_PA), _pt(_PA, -2, 6, 20), 9.5),
                capsule(_pt(_PA, -2, 6, 20), _pt(_PA, -14, 10, 26), 8.0),
            )
        ),
        "pv": occ(
            union(
                capsule((12.0, 30.0, 26.0), (26.0, 40.0, 32.0), 4.0),
                capsule((24.0, 30.0, 16.0), (36.0, 40.0, 12.0), 4.0),
                capsule((10.0, 30.0, 30.0), (-4.0, 40.0, 34.0), 4.0),
            )
        ),
        "lxa": occ(
            union(
                ellipsoid(_pt(_LA, 12.0, -10.0, 0.0), (9.0, 8.0, 9.0)),
                capsule(_pt(_LA, 11.0, -8.0, 2.0), _pt(_LA, 22.0, -20.0, 12.0), 5.0),
                capsule(_pt(_LA, 13.0, -6.0, 4.0), _pt(_LA, 24.0, -14.0, 16.0), 4.5),
                capsule(_pt(_LA, 14.0, -11.0, 0.0), _pt(_LA, 26.0, -24.0, 6.0), 3.5),
            )
        ),
    }


def auricle_from_la(
    la_mask: np.ndarray,
    spacing: float,
    origin: Sequence[float],
    radii_mm: Sequence[float] = (13.0, 11.0, 11.0),
    shift_mm: Sequence[float] = (-2.0, -16.0, 6.0),
) -> np.ndarray:
    """自制左心耳：贴在 BP3D 左心房腔的前上角。

    BP3D 没有 auricle of left atrium 词条，所以这个部件只能自作。做法不是再抄一遍
    兜底心脏模型，而是**以 BP3D 左心房体素的实际包围盒为锚**，因此它跟着正式几何走，
    不会因为兜底模型与 BP3D 位置不同而飘到别处。产出随后会被"不得覆盖已标注体素"
    的规则裁掉，宁可小也不冒充 BP3D。

    shift_mm 的方向按解剖意图取：略偏右、明显偏前、偏上（耳部向前上方包绕主动脉根）。
    """
    idx = np.argwhere(la_mask)
    if not len(idx):
        return np.zeros(la_mask.shape, dtype=bool)
    lo = idx.min(0).astype(float)
    hi = idx.max(0).astype(float)
    origin_a = np.asarray(origin, float)
    corner = origin_a + (hi + 0.5) * spacing  # 左、后、上三个正方向的角
    center = corner + np.asarray(shift_mm, float)
    center[0] = origin_a[0] + (lo[0] + hi[0] + 1.0) / 2.0 * spacing + shift_mm[0]
    return sample_implicit(
        ellipsoid(center, radii_mm), tuple(int(s) for s in la_mask.shape), spacing, origin
    )


def build_masks(
    voxel_shape: Sequence[int],
    spacing: float = 1.0,
    origin: Sequence[float] = (0.0, 0.0, 0.0),
) -> dict[str, np.ndarray]:
    """返回互不重叠的兜底占据掩码。

    顺序即优先级：先登记者保留体素，后者从剩余空间里取。心肌排第一，因此左心室腔
    只会拿走壁内的空间，壁厚保持完整。
    """
    order = ("myo", "lv", "rv", "la", "ra", "aorta", "pa", "pv", "lxa")
    raw = raw_masks(voxel_shape, spacing, origin)
    taken = np.zeros(tuple(int(s) for s in voxel_shape), dtype=bool)
    masks: dict[str, np.ndarray] = {}
    for sid in order:
        mine = raw[sid] & ~taken
        taken |= mine
        masks[sid] = mine
    return masks
