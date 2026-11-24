"""程序化兜底几何：参数校验、图元形状、互不重叠的装配顺序。

兜底路线只在 BP3D OBJ 不可用时用于离线跑通链路，因此它的产出必须"像解剖"：
掩码两两不重叠、每个结构都有体素、标签与 meta 的冻结映射一致。
"""

from __future__ import annotations

import numpy as np
import pytest

from tools.asset_pipeline import fallback as fb
from tools.asset_pipeline.meta import BY_ID

SHAPE = (40, 40, 40)
SPACING = 3.0
ORIGIN = (-60.0, -60.0, -60.0)


def test_as3_rejects_wrong_component_count():
    """[*center, dx, dy, dz] 这类拼接会生成 6 元组，必须报错而不是静默丢弃后三位。"""
    with pytest.raises(ValueError, match="需要 3 个分量"):
        fb.capsule((0, 0, 0, 1, 2, 3), (4, 5, 6), 2.0)
    with pytest.raises(ValueError, match="需要 3 个分量"):
        fb.ellipsoid([0, 0, 0, 9, 9, 9], (4, 4, 4))


def test_pt_adds_offset_to_base():
    assert fb._pt((10.0, 20.0, 30.0), 1.0, -2.0, 3.0) == (11.0, 18.0, 33.0)


def _grid(shape=SHAPE):
    return np.stack(np.meshgrid(*[np.arange(s) for s in shape], indexing="ij"), -1).astype(float)


def test_ellipsoid_is_analytic_and_shell_is_a_wall():
    g = _grid()
    x0, x1, x2 = g[..., 0], g[..., 1], g[..., 2]
    c = (20.0, 20, 20)
    solid = fb.ellipsoid(c, (8, 8, 8))(x0, x1, x2)
    analytic = ((x0 - 20) ** 2 + (x1 - 20) ** 2 + (x2 - 20) ** 2) <= 8**2
    assert np.array_equal(solid, analytic)  # 半径为 8 的球：与解析解逐体素相等

    wall = fb.shell(c, (10, 10, 10), 3.0)(x0, x1, x2)
    assert not wall[20, 20, 20]  # 内腔不算壁
    assert wall[20, 20, 28]  # 半径 7..10 之间才是壁厚
    assert not wall[20, 20, 35]


def test_capsule_radius_controls_thickness():
    g = _grid()
    x0, x1, x2 = g[..., 0], g[..., 1], g[..., 2]
    thin = fb.capsule((20, 20, 10), (20, 20, 30), 1.5)(x0, x1, x2)
    thick = fb.capsule((20, 20, 10), (20, 20, 30), 4.0)(x0, x1, x2)
    assert thin.sum() < thick.sum()
    assert thin[20, 21, 20] and not thin[20, 25, 20]
    assert not thin[20, 20, 5]  # 线段端点之外不延伸


def test_union_and_minus_compose_masks():
    g = _grid()
    x0, x1, x2 = g[..., 0], g[..., 1], g[..., 2]
    a = fb.ellipsoid((20, 20, 20), (10, 10, 10))
    b = fb.ellipsoid((26, 20, 20), (10, 10, 10))
    assert fb.union(a, b)(x0, x1, x2).sum() > a(x0, x1, x2).sum()
    assert fb.minus(a, b)(x0, x1, x2).sum() < a(x0, x1, x2).sum()
    assert not fb.minus(a, b)(x0, x1, x2)[30, 20, 20]  # 被 b 覆盖的一侧应当挖空


def test_build_masks_are_disjoint_and_every_structure_has_volume():
    masks = fb.build_masks(SHAPE, spacing=SPACING, origin=ORIGIN)
    assert set(masks) == set(BY_ID)
    stack = np.stack([masks[sid] for sid in masks])
    assert int(stack.sum(0).max()) == 1  # 两两不重叠，否则三视图会互相染色

    for sid, mask in masks.items():
        assert mask.shape == SHAPE
        assert int(mask.sum()) > 0, f"{sid} 在兜底模型里没有体素"


def test_build_masks_respects_priority_order():
    """心肌先登记，左心室腔只能取壁内空间，不能把整个心肌吞掉。"""
    masks = fb.build_masks(SHAPE, spacing=SPACING, origin=ORIGIN)
    assert int(masks["myo"].sum()) > int(masks["lv"].sum())
    assert not (masks["myo"] & masks["lv"]).any()


def test_fallback_labels_match_frozen_meta_labels():
    assert {sid: meta.label for sid, meta in BY_ID.items()} == fb.FALLBACK_LABELS


def test_auricle_is_anchored_to_the_la_mask_not_to_hardcoded_numbers():
    """自制左心耳以左心房体素的包围盒为锚：平移 la 掩码，耳必须同步平移。

    这条是"跟着正式几何走"的唯一保证——BP3D 的心脏位置与兜底模型不同，
    写死坐标会让耳飘到别处去。
    """
    la = np.zeros(SHAPE, bool)
    la[20:28, 24:32, 20:28] = True
    first = fb.auricle_from_la(la, SPACING, ORIGIN)
    assert int(first.sum()) > 0
    assert first.shape == SHAPE

    shifted = np.zeros(SHAPE, bool)
    shifted[22:30, 24:32, 20:28] = True
    second = fb.auricle_from_la(shifted, SPACING, ORIGIN)
    assert np.array_equal(second[2:], first[:-2])


def test_auricle_of_empty_la_is_empty():
    """左心房一个体素都没有时（OBJ 缺件）返回全 False，而不是拿包围盒的极值去算。"""
    out = fb.auricle_from_la(np.zeros(SHAPE, bool), SPACING, ORIGIN)
    assert out.shape == SHAPE and not out.any()
