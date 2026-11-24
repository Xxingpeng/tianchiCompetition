"""端到端：build CLI 产出的资产必须自己通过校验闸。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.asset_pipeline import bp3d as bp3d_mod
from tools.asset_pipeline import build as b
from tools.asset_pipeline.meta import BP3D_NOTICE, BY_ID
from tools.asset_pipeline.tests.test_bp3d import make_obj, write_manifest

BASE = ["--grid", "40", "--spacing", "3.5", "--upscale", "1", "--force"]


def load_catalog(out_dir: Path) -> dict:
    return json.loads((out_dir / "structures.json").read_text(encoding="utf-8"))


def test_procedural_build_passes_its_own_validation(tmp_path):
    out = tmp_path / "assets"
    assert b.main([*BASE, "--source", "procedural", "--out", str(out)]) == 0
    cat = load_catalog(out)
    assert cat["provenance_mode"] == "procedural_fallback"
    assert len(cat["structures"]) >= 7
    for s in cat["structures"]:
        assert s["provenance"] == "procedural_fallback"
        assert (out.parent / s["mesh"]).is_file()
        for view in ("axial", "coronal", "sagittal"):
            assert (out.parent / s["views"][view]["base"]).is_file()
            assert (out.parent / s["views"][view]["overlay"]).is_file()
    assert any("示意" in n for n in cat["notices"])


def test_auto_falls_back_when_obj_dir_is_empty(tmp_path):
    out = tmp_path / "assets"
    rc = b.main(
        [*BASE, "--source", "auto", "--out", str(out), "--assets-raw", str(tmp_path / "raw")]
    )
    assert rc == 0
    assert load_catalog(out)["provenance_mode"] == "procedural_fallback"


def test_auto_uses_bp3d_when_obj_files_exist(tmp_path):
    raw = tmp_path / "raw"
    lv = make_obj(raw / "parts", "lv.obj", (0, 0, 0), (20, 20, 30))
    la = make_obj(raw / "parts", "la.obj", (30, 5, 5), (45, 20, 20))
    manifest = write_manifest(
        tmp_path,
        [
            {"id": "lv", "obj": lv, "verified": True},
            {"id": "la", "obj": la, "verified": True},
        ],
        obj_dir="parts",
    )
    out = tmp_path / "assets"
    rc = b.main([*BASE, "--out", str(out), "--manifest", str(manifest), "--assets-raw", str(raw)])
    assert rc == 0
    cat = load_catalog(out)
    assert cat["provenance_mode"] == "bp3d"
    assert BP3D_NOTICE in cat["notices"]
    ids = {s["id"] for s in cat["structures"]}
    assert {"lv", "la"} <= ids
    for s in cat["structures"]:
        assert s["provenance"].startswith("BP3D / ")
    # 没给 OBJ 的结构必须被如实排除，而不是被兜底几何偷偷顶替
    excluded = {e["id"] for e in cat["excluded"]}
    assert set(BY_ID) - ids <= excluded


def test_explicit_bp3d_without_obj_files_fails_loudly(tmp_path):
    manifest = write_manifest(tmp_path, [{"id": "lv", "obj": "missing.obj"}])
    with pytest.raises(SystemExit, match="BP3D OBJ 只找到"):
        b.main(
            [
                *BASE,
                "--source",
                "bp3d",
                "--out",
                str(tmp_path / "assets"),
                "--manifest",
                str(manifest),
                "--assets-raw",
                str(tmp_path),
            ]
        )


def test_grid_guard_rejects_absurd_sizes():
    with pytest.raises(SystemExit, match=r"32\.\.256"):
        b.main(["--grid", "8"])


def test_shipped_manifest_matches_meta_ids():
    """仓库自带的 BP3D 清单必须能被解析，且结构 id 与 meta 完全对齐。"""
    manifest = bp3d_mod.load_manifest(Path(b.ROOT) / "assets_raw" / "bp3d_manifest.json")
    assert set(manifest.ids) == set(BY_ID)
    # 原始包没下载前，9 个条目的文件名都还没核对过
    assert len(manifest.unverified) == len(BY_ID)
