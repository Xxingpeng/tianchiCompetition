"""structures.json 校验闸：把"页面会自相矛盾"的情况一条条挡住。"""

from __future__ import annotations

import io
import json

import numpy as np
import pytest
from PIL import Image

from tools.asset_pipeline import catalog as c
from tools.asset_pipeline.meta import BY_ID

LV = BY_ID["lv"]
MYO = BY_ID["myo"]


def touch_assets(root, ids=("lv", "myo"), mesh_bytes=b"GLB"):
    slices = root / "assets" / "slices"
    meshes = root / "assets" / "meshes"
    slices.mkdir(parents=True, exist_ok=True)
    meshes.mkdir(parents=True, exist_ok=True)
    img = Image.fromarray(np.zeros((2, 2), np.uint8))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    for sid in ids:
        for view in c.VIEWS:
            (slices / f"{sid}_{view}_base.png").write_bytes(buf.getvalue())
            (slices / f"{sid}_{view}_overlay.png").write_bytes(buf.getvalue())
        (meshes / f"{sid}.glb").write_bytes(mesh_bytes)


def views_for(sid):
    return {
        v: {
            "base": f"assets/slices/{sid}_{v}_base.png",
            "overlay": f"assets/slices/{sid}_{v}_overlay.png",
            "slice_index": 3,
            "slice_voxels": 42,
        }
        for v in c.VIEWS
    }


def mesh_map(ids=("lv", "myo"), size=3):
    return {f"assets/meshes/{sid}.glb": size for sid in ids}


def good_structures():
    return [
        c.build_structure(
            meta=LV,
            views=views_for("lv"),
            mesh="assets/meshes/lv.glb",
            provenance="BP3D/heart_lv.obj",
            voxels=900,
            centroid=[3, 4, 5],
        ),
        c.build_structure(
            meta=MYO,
            views=views_for("myo"),
            mesh="assets/meshes/myo.glb",
            provenance="procedural_fallback",
            voxels=1200,
            centroid=[3, 4, 5],
        ),
    ]


def catalog_of(structures):
    return c.build_catalog(
        structures=structures,
        shape=(96, 96, 96),
        spacing=1.6,
        origin=[-76.8] * 3,
        provenance_mode="mixed",
        notices=["示意结构模型，非真实病例影像。", "BodyParts3D, © DBCLS"],
        excluded=[],
    )


def run_check(structures, root, mesh_sizes=None, notices=None):
    cat = catalog_of(structures)
    return c.validate_catalog(
        cat,
        structures,
        mesh_sizes or mesh_map(),
        notices if notices is not None else cat["notices"],
        root,
    )


def test_valid_catalog_passes(tmp_path):
    touch_assets(tmp_path)
    assert run_check(good_structures(), tmp_path) == []


def test_build_catalog_rejects_unknown_provenance_mode():
    with pytest.raises(ValueError, match="provenance_mode"):
        c.build_catalog([], (10, 10, 10), 1.0, [0, 0, 0], "magic", [], [])


def test_grid_metadata_records_axis_convention():
    cat = catalog_of(good_structures())
    assert cat["grid"]["shape"] == [96, 96, 96]
    assert cat["grid"]["axis_order"] == ["左右", "前后", "上下"]
    assert cat["grid"]["spacing_mm"] == [1.6, 1.6, 1.6]


def test_missing_assets_are_reported(tmp_path):
    touch_assets(tmp_path, ids=("lv",))
    problems = run_check(good_structures(), tmp_path)
    assert any("myo" in p and "未落盘" in p for p in problems)


def test_empty_notice_list_blocks_release(tmp_path):
    touch_assets(tmp_path)
    problems = run_check(good_structures(), tmp_path, notices=[])
    assert any("notices 为空" in p for p in problems)


def test_notice_without_disclaimer_blocks_release(tmp_path):
    touch_assets(tmp_path)
    problems = run_check(good_structures(), tmp_path, notices=["BodyParts3D, © DBCLS"])
    assert any("用途声明" in p for p in problems)


def test_single_structure_is_not_a_demo(tmp_path):
    touch_assets(tmp_path, ids=("lv",))
    problems = run_check(good_structures()[:1], tmp_path, mesh_sizes=mesh_map(("lv",)))
    assert any("不构成对照演示" in p for p in problems)


def test_duplicate_label_violates_frozen_map(tmp_path):
    touch_assets(tmp_path)
    dup = good_structures()
    dup[1]["label"] = dup[0]["label"]
    problems = run_check(dup, tmp_path)
    assert any("冻结映射" in p for p in problems)


@pytest.mark.parametrize("bad_label", [0, 10])
def test_label_outside_frozen_range(tmp_path, bad_label):
    touch_assets(tmp_path)
    rows = good_structures()
    rows[0]["label"] = bad_label
    assert any("冻结区间" in p for p in run_check(rows, tmp_path, mesh_sizes=mesh_map(("lv",))))


def test_empty_and_forbidden_copy(tmp_path):
    touch_assets(tmp_path)
    rows = good_structures()
    rows[0]["description"] = ""
    rows[1]["name"] = "ct_train_1015 左心室"
    rows[1]["description"] = "模型推理输出"
    problems = run_check(rows, tmp_path)
    assert any("description 为空" in p for p in problems)
    assert sum("不允许公开的字样" in p for p in problems) >= 2


def test_missing_aliases_and_bad_color_and_blank_provenance(tmp_path):
    touch_assets(tmp_path)
    rows = good_structures()
    rows[0]["aliases"] = []
    rows[0]["color"] = "red"
    rows[1]["provenance"] = ""
    problems = run_check(rows, tmp_path)
    assert any("aliases 为空" in p for p in problems)
    assert any("不是 #rrggbb" in p for p in problems)
    assert any("provenance 为空" in p for p in problems)


def test_zero_voxels_and_missing_mesh_path(tmp_path):
    touch_assets(tmp_path)
    rows = good_structures()
    rows[0]["stats"]["voxels"] = 0
    rows[1]["mesh"] = ""
    problems = run_check(rows, tmp_path)
    assert any("体素数为 0" in p for p in problems)
    assert any("缺少 mesh 路径" in p for p in problems)


def test_oversize_mesh_and_size_bookkeeping(tmp_path):
    touch_assets(tmp_path, mesh_bytes=b"x" * (c.MAX_MESH_BYTES + 1))
    problems = run_check(good_structures(), tmp_path)
    assert any("超过单文件上限" in p for p in problems)
    assert any("不符" in p for p in problems)


def test_total_mesh_budget_is_enforced(tmp_path, monkeypatch):
    touch_assets(tmp_path)
    monkeypatch.setattr(c, "MAX_TOTAL_MESH_BYTES", 5)
    assert any("合计" in p for p in run_check(good_structures(), tmp_path))


def test_wrong_view_set_and_empty_overlay(tmp_path):
    touch_assets(tmp_path)
    rows = good_structures()
    rows[0]["views"].pop("sagittal")
    rows[1]["views"]["axial"]["slice_voxels"] = 0
    problems = run_check(rows, tmp_path)
    assert any("视图应恰好是" in p for p in problems)
    assert any("overlay 会是空的" in p for p in problems)


def test_write_catalog_is_utf8_json(tmp_path):
    path = tmp_path / "structures.json"
    cat = catalog_of(good_structures())
    c.write_catalog(cat, path)
    loaded = json.loads(path.read_text(encoding="utf-8"))
    assert loaded["structures"][0]["name"] == "左心室"


def test_summarize_sizes_groups_by_extension(tmp_path):
    touch_assets(tmp_path)
    sizes = c.summarize_sizes(tmp_path)
    assert sizes["png"] > 0 and sizes["glb"] == 6
