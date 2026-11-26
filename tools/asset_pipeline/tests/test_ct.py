"""伪 CT：窗映射、HU 合成、逐层真值与文件落盘。"""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image

from tools.asset_pipeline import ct


def heart_volume(shape: tuple[int, int, int] = (12, 12, 12)) -> np.ndarray:
    volume = np.zeros(shape, dtype=np.int16)
    x, y = shape[0] // 2, shape[1] // 2
    volume[x - 2 : x + 2, y - 2 : y + 2, 2:10] = 3  # 左心室
    volume[x - 3 : x - 2, y - 2 : y + 2, 2:10] = 1  # 心肌
    return volume


def test_window_maps_hu_to_uint8_and_rejects_nonpositive_width():
    hu = np.array([-1000.0, 40.0, 600.0], dtype=np.float32)
    out = ct.window_u8(hu, width=350, level=40)
    assert out.dtype == np.uint8
    assert out[0] == 0
    assert 120 <= out[1] <= 135
    assert out[2] == 255
    with pytest.raises(ValueError, match="窗宽"):
        ct.window_u8(hu, width=0, level=40)


def test_build_hu_tags_heart_soft_tissue_lung_and_air():
    volume = heart_volume()
    hu = ct.build_hu(volume, seed=1)
    assert hu.shape == volume.shape
    assert hu[volume == 3].min() == ct.LABEL_HU[3]
    assert hu[0, 0, 0] == ct.AIR_HU
    assert (hu <= ct.LUNG_HU + ct.NOISE_HU * 4).any(), "肺部应接近空气密度"
    assert (hu > 100).any(), "增强后的心腔应明显高于软组织"
    again = ct.build_hu(volume, seed=1)
    assert np.array_equal(hu, again), "同一 seed 必须可复现"


def test_empty_volume_stays_air():
    volume = np.zeros((8, 8, 8), dtype=np.int16)
    assert np.all(ct.build_hu(volume) == ct.AIR_HU)


def test_build_assets_writes_base_overlay_truth_and_best_slices(tmp_path):
    out = tmp_path / "assets"
    volume = heart_volume()
    manifest = ct.build_ct_assets(
        out, volume, included=("lv", "myo"), spacing=3.5, upscale=2, seed=3
    )

    assert manifest["schema_version"] == ct.CT_SCHEMA_VERSION
    assert manifest["slice_count"] == 12
    assert manifest["image_size"] == [24, 24]
    assert manifest["default_window"] in {w["id"] for w in manifest["windows"]}
    assert "不是真实病例" in manifest["note"]
    assert not ct.manifest_has_forbidden_text(manifest)
    assert manifest["best_slice"] == {
        "lv": int(np.argmax((volume == 3).sum(axis=(0, 1)))),
        "myo": int(np.argmax((volume == 1).sum(axis=(0, 1)))),
    }

    base_dir = out / "ct" / "base"
    assert len(list(base_dir.glob("*.png"))) == 12 * len(ct.WINDOW_PRESETS)
    for k in range(12):
        for window in manifest["windows"]:
            path = base_dir / f"{k:03d}_{window['id']}.png"
            assert path.is_file()
            with Image.open(path) as image:
                assert image.size == (24, 24)
                assert image.mode == "L"

    slices = manifest["slices"]
    assert len(slices) == 12
    assert [row["index"] for row in slices] == list(range(12))
    present = {row["index"]: {entry["id"] for entry in row["structures"]} for row in slices}
    assert present[5] == {"lv", "myo"}
    assert present[0] == set()

    for row in slices:
        for entry in row["structures"]:
            path = out / "ct" / "overlay" / entry["id"] / f"{row['index']:03d}.png"
            assert path.is_file()
            with Image.open(path) as image:
                assert image.size == (24, 24)
                assert image.mode == "RGBA"
                assert np.asarray(image)[..., 3].max() > 0
    assert not (out / "ct" / "overlay" / "lv" / "000.png").exists()
    assert sum(entry["voxels"] for entry in slices[5]["structures"]) == slices[5]["voxels"]


def test_included_filter_keeps_other_structures_out(tmp_path):
    manifest = ct.build_ct_assets(tmp_path / "assets", heart_volume(), included=("lv",), upscale=1)
    assert set(manifest["best_slice"]) == {"lv"}
    assert not (tmp_path / "assets" / "ct" / "overlay" / "myo").exists()
    assert all(entry["id"] == "lv" for row in manifest["slices"] for entry in row["structures"])


def test_bad_upscale_and_dimension_are_rejected(tmp_path):
    with pytest.raises(ValueError, match="upscale"):
        ct.build_ct_assets(tmp_path / "assets", heart_volume(), upscale=0)
    with pytest.raises(ValueError, match="3D"):
        ct.build_hu(np.zeros((12, 12), dtype=np.int16))


def test_manifest_forbidden_text_detection():
    assert ct.manifest_has_forbidden_text({"note": "模型预测结果"})
    assert not ct.manifest_has_forbidden_text({"note": "教学示意"})


def test_png_helpers_keep_alpha_and_size():
    gray = np.zeros((4, 4), dtype=np.uint8)
    rgba = np.zeros((4, 4, 4), dtype=np.uint8)
    rgba[..., 3] = 150
    for blob, mode, size in (
        (ct._png_gray(gray), "L", (4, 4)),
        (ct._png_rgba(rgba), "RGBA", (4, 4)),
        (ct._png_gray(ct._resize(gray, 2)), "L", (8, 8)),
    ):
        with Image.open(io.BytesIO(blob)) as image:
            assert image.mode == mode
            assert image.size == size
