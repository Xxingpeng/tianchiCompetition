"""端到端：build CLI 产出的资产必须自己通过校验闸。"""

from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
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


def test_self_made_part_is_anchored_and_never_overwrites_bp3d(tmp_path):
    """BP3D 没有左心耳词条：自制几何要贴上去，但绝不冒充 BP3D、也不覆盖正式体素。"""
    raw = tmp_path / "raw"
    lv = make_obj(raw / "parts", "lv.obj", (0, 0, 0), (20, 20, 30))
    la = make_obj(raw / "parts", "la.obj", (30, 5, 5), (45, 20, 20))
    manifest = write_manifest(
        tmp_path,
        [
            {"id": "lv", "obj": lv, "verified": True},
            {"id": "la", "obj": la, "verified": True},
            {"id": "lxa", "obj": "", "verified": False},
        ],
        obj_dir="parts",
    )
    out = tmp_path / "assets"
    rc = b.main([*BASE, "--out", str(out), "--manifest", str(manifest), "--assets-raw", str(raw)])
    assert rc == 0
    cat = load_catalog(out)
    by_id = {s["id"]: s for s in cat["structures"]}
    assert "lxa" in by_id, "自制部件应当出现在页面上，而不是被当成缺件"
    assert by_id["lxa"]["provenance"].startswith("自制几何")
    assert "未收录" in by_id["lxa"]["provenance"]
    assert by_id["lv"]["provenance"].startswith("BP3D / ")
    # 自制部件不得进入"排除/未核对"名单——它是有意的自作，不是没核对
    assert "lxa" not in {e["id"] for e in cat["excluded"]}
    assert by_id["lxa"]["stats"]["voxels"] > 0


def test_self_made_part_never_overwrites_bp3d_voxels(tmp_path):
    """带不带自制左心耳，BP3D 各部件的体素数必须一模一样：自作只能取空格，宁可小。"""
    raw = tmp_path / "raw"
    lv = make_obj(raw / "parts", "lv.obj", (0, 0, 0), (20, 20, 30))
    la = make_obj(raw / "parts", "la.obj", (30, 5, 5), (45, 20, 20))
    base = [
        {"id": "lv", "obj": lv, "verified": True},
        {"id": "la", "obj": la, "verified": True},
    ]

    def run(entries):
        manifest = write_manifest(tmp_path, entries, obj_dir="parts")
        args = b.parse_args(
            [
                "--source",
                "bp3d",
                "--grid",
                "40",
                "--spacing",
                "3.5",
                "--manifest",
                str(manifest),
                "--assets-raw",
                str(raw),
                "--out",
                str(tmp_path / "assets"),
            ]
        )
        shape = (args.grid,) * 3
        origin = tuple(-np.asarray(shape, float) * args.spacing / 2.0)
        return b._make_volume(args, shape, origin)

    plain, _p0, _e0, _m0 = run(base)
    with_lxa, provenance, excluded, mode = run([*base, {"id": "lxa", "obj": "", "verified": False}])
    assert mode == "bp3d"
    la_label, lxa_label = BY_ID["la"].label, BY_ID["lxa"].label
    assert int((with_lxa == lxa_label).sum()) > 0, "自制部件一个体素都没落地"
    for label in (la_label, BY_ID["lv"].label):
        assert int((with_lxa == label).sum()) == int((plain == label).sum())
    assert provenance["lxa"].startswith("自制几何")
    assert provenance["lv"].startswith("BP3D / ")
    assert "lxa" not in {e["id"] for e in excluded}


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


def test_out_guard_requires_an_assets_dir(tmp_path):
    """清单存的是站点相对路径 assets/...，--out 指到别处会让校验把每一项都报"未落盘"。"""
    with pytest.raises(SystemExit, match="需指向站点根下的 assets 目录"):
        b.main([*BASE, "--source", "procedural", "--out", str(tmp_path / "whatever")])


def test_shipped_manifest_matches_meta_ids():
    """仓库自带的 BP3D 清单必须能被解析，且结构 id 与 meta 完全对齐。"""
    manifest = bp3d_mod.load_manifest(Path(b.ROOT) / "assets_raw" / "bp3d_manifest.json")
    assert set(manifest.ids) == set(BY_ID)
    # 原始包已下载并逐个核对过文件名；只有 BP3D 确实没有词条的左心耳还是"未核对"
    assert manifest.unverified == ["lxa"]
    for binding in manifest.bindings:
        if binding.verified:
            # 核对过的条目必须指向真实 OBJ 命名（<结构>_<element file id>.obj）
            assert re.fullmatch(rf"{re.escape(binding.id)}_FJ\d+\.obj", binding.obj), binding.obj
        else:
            assert binding.obj == ""
    src = json.loads((Path(b.ROOT) / "assets_raw" / "bp3d_manifest.json").read_text("utf-8"))
    # 许可与出处是页面 NOTICE 的依据，清单里不能缺
    assert src["source"]["license"].startswith("CC BY")
    assert src["source"]["archive_bytes"] > 0
    assert src["license_notice"] in src["source"]["attribution"]
