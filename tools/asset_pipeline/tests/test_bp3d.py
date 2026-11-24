"""BP3D 路线：manifest 校验、共用变换、体素装配。"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from tools.asset_pipeline.bp3d import (
    Bp3dManifest,
    ObjBinding,
    build_label_volume,
    load_manifest,
    load_meshes,
    obj_path,
    resolve_bindings,
)
from tools.asset_pipeline.geom import write_obj
from tools.asset_pipeline.tests.test_voxel import box_mesh


def make_obj(dir_path, name: str, lo, hi) -> str:
    dir_path.mkdir(parents=True, exist_ok=True)
    path = dir_path / name
    write_obj(path, box_mesh(lo=lo, hi=hi), name=Path(name).stem)
    return name


def write_manifest(root, entries, obj_dir="bodyparts3d"):
    path = root / "bp3d_manifest.json"
    path.write_text(
        json.dumps({"obj_dir": obj_dir, "structures": entries}, ensure_ascii=False),
        encoding="utf-8",
    )
    return path


def test_load_meshes_rejects_degenerate_obj(tmp_path):
    """只有 3 个顶点 1 个面的 OBJ 不是可用部件，必须报错而不是产出一张碎片网格。"""
    (tmp_path / "bodyparts3d").mkdir(parents=True, exist_ok=True)
    (tmp_path / "bodyparts3d" / "tiny.obj").write_text(
        "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n", encoding="utf-8"
    )
    manifest = Bp3dManifest(
        path=tmp_path, obj_dir="bodyparts3d", bindings=[ObjBinding(id="lv", obj="tiny.obj")]
    )
    with pytest.raises(ValueError, match="顶点/面数过少"):
        load_meshes(manifest, tmp_path)


def test_load_meshes_rejects_open_obj(tmp_path):
    """开口 OBJ（下载不完整或部件本身是面片）一旦体素化会凭空围出实体，必须在入口就拦下。"""
    (tmp_path / "bodyparts3d").mkdir(parents=True, exist_ok=True)
    verts = "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\n"
    # 只写 1 个三角面 -> 4 条边界边，明显不是封闭部件
    (tmp_path / "bodyparts3d" / "open.obj").write_text(verts + "f 1 2 3\n", encoding="utf-8")
    manifest = Bp3dManifest(
        path=tmp_path, obj_dir="bodyparts3d", bindings=[ObjBinding(id="lv", obj="open.obj")]
    )
    with pytest.raises(ValueError, match="边界边"):
        load_meshes(manifest, tmp_path)


def test_load_meshes_accepts_obj_with_duplicated_vertices(tmp_path):
    """BP3D 一类 OBJ 会为分面法线重复写同一顶点；去重必须发生在封闭性检查之前。"""
    (tmp_path / "bodyparts3d").mkdir(parents=True, exist_ok=True)
    src = tmp_path / "bodyparts3d" / "dup.obj"
    mesh = box_mesh()
    lines = [f"v {x:.6f} {y:.6f} {z:.6f}" for x, y, z in np.repeat(mesh.vertices, 2, axis=0)]
    # 原 1 基索引 i 现在对应 2i-1 / 2i 两行；取 2i 即可复原同一几何
    lines += ["f {} {} {}".format(*(2 * (int(i) + 1) for i in face)) for face in mesh.faces]
    src.write_text("\n".join(lines) + "\n", encoding="utf-8")
    manifest = Bp3dManifest(
        path=tmp_path, obj_dir="bodyparts3d", bindings=[ObjBinding(id="lv", obj="dup.obj")]
    )
    meshes = load_meshes(manifest, tmp_path)
    assert len(meshes["lv"].vertices) == 8


def test_obj_path_joins_manifest_obj_dir():
    manifest = Bp3dManifest(path=pytest.__file__, obj_dir="parts", bindings=[])
    p = obj_path(manifest, ObjBinding(id="lv", obj="a.obj"), "/data/raw")
    assert str(p).replace("\\", "/").endswith("parts/a.obj")


def test_resolve_bindings_splits_present_and_absent(tmp_path):
    made = make_obj(tmp_path / "bodyparts3d", "lv.obj", (0, 0, 0), (10, 10, 10))
    manifest = write_manifest(
        tmp_path,
        [
            {"id": "lv", "obj": str(made), "verified": True},
            {"id": "la", "obj": "not_here.obj"},
            {"id": "myo", "obj": ""},
        ],
    )
    m = load_manifest(manifest)
    present, absent = resolve_bindings(m, tmp_path)
    assert [b.id for b in present] == ["lv"]
    assert [b.id for b in absent] == ["la", "myo"]
    assert m.unverified == ["la", "myo"]


def test_load_manifest_rejects_unknown_id_duplicate_and_bad_label(tmp_path):
    p = write_manifest(tmp_path, [{"id": "not_a_structure", "obj": "x.obj"}])
    with pytest.raises(ValueError, match=r"不在 meta\.STRUCTURES"):
        load_manifest(p)
    p = write_manifest(tmp_path, [{"id": "lv", "obj": "a.obj"}, {"id": "lv", "obj": "b.obj"}])
    with pytest.raises(ValueError, match="重复"):
        load_manifest(p)


def test_load_manifest_accepts_aliases_and_cast_axis(tmp_path):
    p = write_manifest(tmp_path, [{"id": "rv", "obj": "rv.obj", "verified": True, "cast_axis": 2}])
    m = load_manifest(p)
    assert m.bindings[0].cast_axis == 2
    assert m.bindings[0].meta.id == "rv"
    assert m.ids == ["rv"]


def test_build_label_volume_keeps_relative_positions(tmp_path):
    """两个部件共用一个变换：装配后它们的相对位置关系必须与原始 OBJ 一致。"""
    a = make_obj(tmp_path / "bodyparts3d", "a.obj", (0, 0, 0), (10, 10, 10))
    b = make_obj(tmp_path / "bodyparts3d", "b.obj", (30, 0, 0), (40, 10, 10))
    manifest = load_manifest(
        write_manifest(tmp_path, [{"id": "lv", "obj": a}, {"id": "la", "obj": b}])
    )
    present, _ = resolve_bindings(manifest, tmp_path)
    meshes = load_meshes(manifest, tmp_path, present)
    volume, kept, (scale, offset) = build_label_volume(
        meshes, {"lv": 3, "la": 2}, (40, 40, 40), spacing=1.0, margin_voxels=3
    )
    assert kept["lv"] > 500 and kept["la"] > 500
    assert set(np.unique(volume)) == {0, 2, 3}
    # a 在原始坐标里整体偏 -x0，b 偏 +x0，共用变换后仍应保持这个先后关系
    centre_lv = np.nonzero(volume == 3)[0].mean()
    centre_la = np.nonzero(volume == 2)[0].mean()
    assert centre_lv < centre_la
    assert scale > 0 and len(offset) == 3


def test_build_label_volume_raises_on_unreasonable_overlap():
    lo = np.array([0.0, 0.0, 0.0])
    hi = np.array([10.0, 10.0, 10.0])
    mesh = box_mesh(lo, hi)
    with pytest.raises(ValueError, match="冲突"):
        build_label_volume(
            {"lv": mesh, "la": mesh}, {"lv": 3, "la": 2}, (40, 40, 40), conflict_budget=10
        )


def test_build_label_volume_needs_at_least_two_parts():
    with pytest.raises(ValueError, match="只有 1 个"):
        build_label_volume({"lv": box_mesh()}, {"lv": 3}, (20, 20, 20))
