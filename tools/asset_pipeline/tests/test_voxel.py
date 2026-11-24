"""几何容器、OBJ 读写、网格体素化、标签仲裁。"""

from __future__ import annotations

import numpy as np
import pytest

from tools.asset_pipeline.geom import (
    Mesh,
    boundary_edges,
    dedupe_vertices,
    fit_transform,
    load_obj,
    merge_bounds,
    transform,
    write_obj,
)
from tools.asset_pipeline.voxel import assign_labels, crop_to, sample_implicit, voxelize_mesh


def box_mesh(lo=(0.0, 0.0, 0.0), hi=(10.0, 10.0, 10.0)) -> Mesh:
    """轴对齐长方体的封闭网格。体素化结果应与解析解逐体素相等。"""
    lo = np.asarray(lo, float)
    hi = np.asarray(hi, float)
    verts = np.array(
        [
            [lo[0], lo[1], lo[2]],
            [hi[0], lo[1], lo[2]],
            [hi[0], hi[1], lo[2]],
            [lo[0], hi[1], lo[2]],
            [lo[0], lo[1], hi[2]],
            [hi[0], lo[1], hi[2]],
            [hi[0], hi[1], hi[2]],
            [lo[0], hi[1], hi[2]],
        ]
    )
    faces = [
        (0, 1, 2),
        (0, 2, 3),
        (4, 6, 5),
        (4, 7, 6),
        (0, 4, 5),
        (0, 5, 1),
        (1, 5, 6),
        (1, 6, 2),
        (2, 6, 7),
        (2, 7, 3),
        (3, 7, 4),
        (3, 4, 0),
    ]
    return Mesh(verts, np.array(faces, np.int32))


def test_mesh_rejects_non_triangle_and_out_of_range_faces():
    verts = np.zeros((4, 3))
    with pytest.raises(ValueError, match="三角面"):
        Mesh(verts, np.array([[0, 1, 2, 3]]))
    with pytest.raises(ValueError, match="越界"):
        Mesh(verts, np.array([[0, 1, 9]]))


def test_mesh_bounds_and_empty_guard():
    lo, hi = Mesh(np.array([[1.0, 2.0, 3.0]]), np.array([[0, 0, 0]])).bounds
    assert lo.tolist() == hi.tolist() == [1.0, 2.0, 3.0]
    assert not np.isfinite(Mesh(np.zeros((0, 3)), np.zeros((0, 3), np.int32)).bounds[0]).any()


def test_transform_rejects_bad_scale():
    with pytest.raises(ValueError, match="scale"):
        transform(box_mesh(), scale=0.0)


def test_obj_roundtrip(tmp_path):
    mesh = box_mesh()
    path = tmp_path / "box.obj"
    write_obj(path, mesh, name="box")
    back = load_obj(path)
    assert np.allclose(back.vertices, mesh.vertices, atol=1e-3)
    assert len(back.faces) == len(mesh.faces)


def test_obj_parse_handles_negative_and_slash_and_ngon_indices(tmp_path):
    text = "# comment\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nf 1/2/3 2 3\nf -5 -4 -1\n"
    path = tmp_path / "t.obj"
    path.write_text(text, encoding="utf-8")
    mesh = load_obj(path)
    assert len(mesh.vertices) == 5
    assert mesh.faces.tolist() == [[0, 1, 2], [0, 1, 4]]


def test_obj_parse_skips_texture_only_lines_and_raises_when_no_vertices(tmp_path):
    (tmp_path / "empty.obj").write_text("vt 0.5 0.5\nvn 0 0 1\n", encoding="utf-8")
    with pytest.raises(ValueError, match="没有顶点"):
        load_obj(tmp_path / "empty.obj")


def test_voxelize_box_matches_analytic_fill():
    volume = voxelize_mesh(box_mesh(), (20, 20, 20), spacing=1.0, origin=(0.0, 0.0, 0.0))
    expected = np.zeros((20, 20, 20), bool)
    expected[:10, :10, :10] = True
    assert volume.dtype == bool
    assert np.array_equal(volume, expected), f"实际占据 {volume.sum()}，应为 1000"


@pytest.mark.parametrize("axis", [0, 1, 2])
def test_voxelize_is_axis_invariant_for_a_box(axis):
    volume = voxelize_mesh(box_mesh(), (20, 20, 20), 1.0, (0.0, 0.0, 0.0), cast_axis=axis)
    assert int(volume.sum()) == 1000


def test_voxelize_respects_nonzero_origin_and_fractional_edges():
    mesh = box_mesh(lo=(3.0, 4.0, 5.0), hi=(6.0, 7.0, 8.0))
    volume = voxelize_mesh(mesh, (12, 12, 12), 1.0, (0.5, 0.5, 0.5))
    # 体素中心 = origin + (i+0.5)*1 -> 落在 [3,6]x[4,7]x[5,8] 内的中心有 27 个
    assert int(volume.sum()) == 27


def test_boundary_edges_detect_open_mesh():
    """开口网格会被奇偶填充凭空围出实体，所以封闭性必须能被查出来。"""
    closed = box_mesh()
    assert boundary_edges(closed) == 0
    open_mesh = Mesh(closed.vertices, closed.faces[:4])
    assert boundary_edges(open_mesh) > 0


def test_dedupe_vertices_merges_repeated_positions():
    """OBJ 常把同一顶点重复写多次，不去重会把封闭网格误判成开口。"""
    m = box_mesh()
    dup = np.repeat(m.vertices, 2, axis=0)
    faces = m.faces * 2
    merged = dedupe_vertices(Mesh(dup, faces.astype(np.int32)))
    assert len(merged.vertices) == 8
    assert boundary_edges(merged) == 0


def test_voxelize_mesh_still_runs_on_open_mesh_but_result_is_untrusted():
    mesh = Mesh(box_mesh().vertices, box_mesh().faces[:4])
    volume = voxelize_mesh(mesh, (16, 16, 16), 1.0, (0.0, 0.0, 0.0))
    assert volume.ndim == 3
    # 奇偶填充会把两块面片之间当成封闭截面，这正是必须先查边界边的原因
    assert int(volume.sum()) > 0


def test_sample_implicit_uses_voxel_centers():
    fn = lambda x0, x1, x2: x0 < 5.0  # noqa: E731
    out = sample_implicit(fn, (10, 4, 4), 1.0, (0.0, 0.0, 0.0))
    assert out[:5].all() and not out[5:].any()


def test_crop_to_bounds_and_empty_case():
    mask = np.zeros((10, 10, 10), bool)
    assert crop_to(mask)[0] == slice(0, 10)
    mask[2:5, 3:7, 1:2] = True
    sl = crop_to(mask, pad=1)
    assert (sl[0].start, sl[0].stop) == (1, 6)
    assert (sl[2].start, sl[2].stop) == (0, 3)


def test_merge_bounds_over_empty_meshes():
    lo, hi = merge_bounds([Mesh(np.zeros((0, 3)), np.zeros((0, 3), np.int32))])
    assert not np.isfinite(lo).any()


def test_fit_transform_centers_and_respects_margin():
    meshes = [box_mesh(lo=(-5, -5, -5), hi=(5, 5, 5)), box_mesh(lo=(0, 0, 0), hi=(10, 20, 30))]
    scale, offset = fit_transform(meshes, (60, 60, 60), spacing=1.0, margin_voxels=5)
    assert scale == pytest.approx(50.0 / 35.0)
    placed = [transform(m, scale, offset) for m in meshes]
    lo, hi = merge_bounds(placed)
    assert np.all(lo >= 5.0 - 1e-9) and np.all(hi <= 55.0 + 1e-9)
    assert np.allclose((lo + hi) / 2.0, 30.0)  # 三根轴都以体素盒中心为准，否则部件会整体偏心


def test_fit_transform_rejects_degenerate_bbox_and_tiny_grid():
    flat = Mesh(np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 2.0]]), np.array([[0, 1, 0]]))
    with pytest.raises(ValueError, match="退化"):
        fit_transform([flat], (20, 20, 20))
    with pytest.raises(ValueError, match="太小"):
        fit_transform([box_mesh()], (4, 4, 4), spacing=1.0, margin_voxels=3)
    with pytest.raises(ValueError, match="没有可用顶点"):
        fit_transform([], (20, 20, 20))


def test_assign_labels_priority_and_conflict_budget():
    a = np.zeros((6, 6, 6), bool)
    b = np.zeros_like(a)
    a[1:4, 1:4, 1:4] = True
    b[2:5, 2:5, 2:5] = True
    volume, kept = assign_labels({"a": a, "b": b}, {"a": 1, "b": 2}, (6, 6, 6), conflict_budget=100)
    assert kept["a"] + kept["b"] == int((a | b).sum())
    assert volume[4, 4, 4] == 2  # 高 priority 抢到重叠体素
    with pytest.raises(ValueError, match="冲突"):
        assign_labels({"a": a, "b": b}, {"a": 1, "b": 2}, (6, 6, 6), conflict_budget=0)


def test_assign_labels_reports_swallowed_parts_by_ratio():
    """判据是"该部件自身被占掉的比例"，而不是体素盒总体积。

    真实解剖里主动脉穿出左心室腔口只吃掉薄薄一层；而某个部件整块被吞掉，
    几乎一定是坐标没对齐或缩放错。比例闸先报错，预算闸负责"整体糊在一起"。
    """
    big = np.zeros((24, 24, 24), bool)
    big[:12, :, :] = True
    small = np.zeros_like(big)
    small[4:12, :, :] = True  # 落在 big 内部，抢掉它 2/3 的体素
    with pytest.raises(ValueError, match="被吞掉"):
        assign_labels({"big": big, "small": small}, {"big": 1, "small": 2}, (24, 24, 24))
    # 同一对掩码，把比例上限放到最松后就只剩预算判据，两道闸互不取代
    volume, kept = assign_labels(
        {"big": big, "small": small},
        {"big": 1, "small": 2},
        (24, 24, 24),
        max_loss_ratio=0.99,
        conflict_budget=10**6,
    )
    assert kept["small"] == int(small.sum())  # 高优先级不被抢占
    assert kept["big"] == int(big.sum()) - int((big & small).sum())
    assert np.all(volume[4] == 2) and np.all(volume[3] == 1)
