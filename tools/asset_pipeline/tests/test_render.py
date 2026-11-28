"""三视图渲染：朝向、取层、底图与 overlay 的一致性。"""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image

from tools.asset_pipeline import render as r
from tools.asset_pipeline.meta import BY_ID

LV = BY_ID["lv"]


def marker_volume(shape=(12, 14, 16), at=(2, 5, 7), label=3) -> np.ndarray:
    v = np.zeros(shape, np.int32)
    v[at] = label
    return v


def test_rejects_unknown_view():
    with pytest.raises(ValueError, match="未知视图"):
        r.slice_plane(marker_volume(), "oblique", 0)


def test_axial_orientation_rows_front_to_back_cols_right_to_left():
    plane = r.slice_plane(marker_volume(), "axial", 7)
    assert plane.shape == (14, 12)  # 行=前后, 列=左右
    assert plane[5, 2] == 3
    assert int((plane == 3).sum()) == 1


def test_coronal_orientation_superior_at_bottom():
    plane = r.slice_plane(marker_volume(), "coronal", 5)
    assert plane.shape == (16, 12)
    assert plane[16 - 1 - 7, 2] == 3


def test_sagittal_orientation_superior_at_bottom_anterior_at_left():
    plane = r.slice_plane(marker_volume(), "sagittal", 2)
    assert plane.shape == (16, 14)
    assert plane[16 - 1 - 7, 5] == 3


def test_slice_index_is_clipped_not_wrapped():
    """越界取层只能夹到边界层，绝不能回绕——回绕等于把别的层面当成目标层面。"""
    v = marker_volume()
    assert r.slice_plane(v, "axial", 999).shape == (14, 12)
    assert np.array_equal(r.slice_plane(v, "axial", 999), r.slice_plane(v, "axial", 15))
    assert int((r.slice_plane(v, "axial", 999) == 3).sum()) == 0  # 标记在 i2=7，夹到 i2=15 就取不到
    assert np.array_equal(r.slice_plane(v, "coronal", -5), r.slice_plane(v, "coronal", 0))


def test_centroid_index_prefers_densest_plane_not_middle():
    v = np.zeros((8, 8, 20), np.int32)
    v[6:8, 6:8, 2:4] = 3  # 结构只在下端两层面
    assert r.centroid_index(v == 3, "axial") in (2, 3)
    assert r.centroid_index(np.zeros((6, 6, 6), bool), "axial") == 3  # 空占据退回中间层


def test_gray_image_maps_known_labels_and_falls_back_for_unknown():
    labels = np.array([[0, 1, 3, 9]])
    gray = r.gray_image(labels)
    assert gray.tolist()[0] == [r.LABEL_GRAY[0], r.LABEL_GRAY[1], r.LABEL_GRAY[3], r.LABEL_GRAY[9]]
    stray = r.gray_image(np.array([[0, 12, 12]]))  # 12 没登记为任何结构
    assert stray[0, 0] == r.LABEL_GRAY[0]
    assert stray[0, 1] == 128  # 未登记的标签不能静默变黑


def test_colored_overlay_uses_structure_color_and_transparency():
    hi = np.array([[True, False]])
    rgba = r.colored_overlay(hi, (211, 61, 81))
    assert rgba.shape == (1, 2, 4)
    assert rgba[0, 0, :3].tolist() == [211, 61, 81]
    assert rgba[0, 0, 3] > 0 and rgba[0, 1, 3] == 0


def test_render_pair_returns_decodable_pngs_of_upscaled_size():
    v = np.zeros((16, 16, 16), np.int32)
    v[4:10, 5:12, 6:11] = 3
    base, overlay, k = r.render_pair(v, LV, "axial", upscale=2)
    base_img = Image.open(io.BytesIO(base))
    overlay_img = Image.open(io.BytesIO(overlay))
    assert base_img.mode == "L" and base_img.size == (32, 32)
    assert overlay_img.mode == "RGBA"
    assert 6 <= k <= 10  # 取层落在结构实体范围内


def test_overlay_aligns_with_base_gray_blobs():
    """overlay 的非透明像素必须正好落在底图的结构区域上——否则页面就是骗人的。"""
    v = np.zeros((20, 20, 20), np.int32)
    v[3:9, 4:10, 5:12] = 3
    v[12:18, 12:18, 12:18] = 1
    base, overlay, k = r.render_pair(v, LV, "coronal", upscale=1)
    g = np.asarray(Image.open(io.BytesIO(base)))
    a = np.asarray(Image.open(io.BytesIO(overlay)))[..., 3] > 0
    inside_structure = g == r.LABEL_GRAY[3]
    assert a.any()
    assert np.array_equal(a, inside_structure)


def test_render_pair_honours_explicit_index_and_empty_target():
    v = marker_volume()
    base, overlay, k = r.render_pair(v, LV, "sagittal", index=3, upscale=1)
    assert k == 3
    a = np.asarray(Image.open(io.BytesIO(overlay)))[..., 3]
    assert not a.any()  # 指定层上没有左心室，overlay 就应当是空的
