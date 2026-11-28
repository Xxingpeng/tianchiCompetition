"""伪 CT 轴位切面与逐层真值。

同一份教学标注体素，按组织近似 HU 合成轴位灰度切面，并逐层写出每个结构的高亮
overlay 与体素计数。它用来演示"影像上找结构"的阅览过程，不是任何真实病例的
影像，也不是分割模型的推理结果；页面与清单都必须把这一点写清楚。
"""

from __future__ import annotations

import io
import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from .meta import STRUCTURES, StructureMeta
from .render import centroid_index, colored_overlay, slice_plane

CT_SCHEMA_VERSION = 1
CT_DIR = "ct"
CT_NOTE = (
    "伪 CT：由本站教学标注体素按组织 HU 近似合成，不是真实病例影像，"
    "也不能用于诊断；逐层结构体素数为构建期真值。"
)
WINDOW_PRESETS: tuple[dict[str, Any], ...] = (
    {"id": "mediastinal", "name": "纵隔窗", "width": 350, "level": 40},
    {"id": "lung", "name": "肺窗", "width": 1500, "level": -600},
)
DEFAULT_WINDOW = "mediastinal"

AIR_HU = -1000.0
FAT_HU = -90.0
SOFT_HU = 40.0
LUNG_HU = -820.0
BONE_HU = 500.0
MARROW_HU = 160.0
NOISE_HU = 6.0

# 增强风格的近似值：心肌与软组织接近等密度，心腔与大血管更亮，便于在纵隔窗对照。
LABEL_HU: dict[int, float] = {
    1: 55.0,  # 心肌
    2: 160.0,  # 左心房
    3: 180.0,  # 左心室
    4: 155.0,  # 右心房
    5: 165.0,  # 右心室
    6: 210.0,  # 升主动脉
    7: 190.0,  # 肺动脉干
    8: 150.0,  # 肺静脉
    9: 165.0,  # 左心耳
}


def window_u8(hu: np.ndarray, width: float, level: float) -> np.ndarray:
    """把 HU 线性映射到 0..255；窗宽必须为正，超出窗范围的像素截断。"""
    width = float(width)
    if width <= 0:
        raise ValueError(f"窗宽必须为正，收到 {width}")
    low = float(level) - width / 2.0
    scaled = (np.asarray(hu, dtype=np.float32) - low) / width * 255.0
    return np.clip(scaled, 0.0, 255.0).astype(np.uint8)


def _ellipse(shape: tuple[int, int], cx: float, cy: float, rx: float, ry: float) -> np.ndarray:
    """在 (x, y) 平面画实心椭圆；半径至少给 1 个体素，避免退化。"""
    x = np.arange(shape[0], dtype=np.float32)
    y = np.arange(shape[1], dtype=np.float32)
    xx, yy = np.meshgrid(x, y, indexing="ij")
    return ((xx - cx) / max(rx, 1.0)) ** 2 + ((yy - cy) / max(ry, 1.0)) ** 2 <= 1.0


def build_hu(volume: np.ndarray, seed: int = 7) -> np.ndarray:
    """从标注体素合成近似 HU 体。无标注时返回全空气，不凭空造出心脏。"""
    volume = np.asarray(volume)
    if volume.ndim != 3:
        raise ValueError(f"体素应为 3D，收到 {volume.ndim}D")
    hu = np.full(volume.shape, AIR_HU, dtype=np.float32)
    heart = volume > 0
    if not heart.any():
        return hu

    xs, ys, zs = np.nonzero(heart)
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    z0, z1 = int(zs.min()), int(zs.max())
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    rx = max((x1 - x0) / 2.0 + 2.0, volume.shape[0] * 0.18)
    ry = max((y1 - y0) / 2.0 + 2.0, volume.shape[1] * 0.18)
    body_rx = min(rx + volume.shape[0] * 0.17, volume.shape[0] * 0.47)
    body_ry = min(ry + volume.shape[1] * 0.15, volume.shape[1] * 0.47)

    body = _ellipse(volume.shape[:2], cx, cy, body_rx, body_ry)
    inner = _ellipse(volume.shape[:2], cx, cy, body_rx * 0.9, body_ry * 0.9)
    lung_l = _ellipse(
        volume.shape[:2],
        cx + body_rx * 0.52,
        cy - body_ry * 0.04,
        body_rx * 0.31,
        body_ry * 0.48,
    )
    lung_r = _ellipse(
        volume.shape[:2],
        cx - body_rx * 0.52,
        cy - body_ry * 0.04,
        body_rx * 0.31,
        body_ry * 0.48,
    )
    spine = _ellipse(volume.shape[:2], cx, cy + body_ry * 0.8, body_rx * 0.1, body_ry * 0.09)
    marrow = _ellipse(volume.shape[:2], cx, cy + body_ry * 0.8, body_rx * 0.05, body_ry * 0.045)

    rng = np.random.default_rng(seed)
    noise = rng.normal(0.0, NOISE_HU, volume.shape).astype(np.float32)
    z_pad = max(2, round(volume.shape[2] * 0.06))
    z_lo, z_hi = max(0, z0 - z_pad), min(volume.shape[2] - 1, z1 + z_pad)
    for k in range(z_lo, z_hi + 1):
        hu[k][body] = (SOFT_HU + noise[k])[body]
        hu[k][body & ~inner] = (FAT_HU + noise[k])[body & ~inner]
        hu[k][body & (lung_l | lung_r)] = (LUNG_HU + noise[k])[body & (lung_l | lung_r)]
        hu[k][body & spine] = BONE_HU
        hu[k][body & marrow] = MARROW_HU

    for label, value in LABEL_HU.items():
        hu[volume == label] = value
    return hu


def _png_gray(plane: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(plane, mode="L").save(buf, format="PNG")
    return buf.getvalue()


def _png_rgba(plane: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(plane, mode="RGBA").save(buf, format="PNG")
    return buf.getvalue()


def _resize(plane: np.ndarray, factor: int) -> np.ndarray:
    if factor <= 1:
        return plane
    size = (plane.shape[1] * factor, plane.shape[0] * factor)
    mode = "RGBA" if plane.ndim == 3 else "L"
    return np.asarray(Image.fromarray(plane, mode=mode).resize(size, Image.NEAREST))


def _active_structures(volume: np.ndarray, included: Sequence[str] | None) -> list[StructureMeta]:
    allowed = set(included) if included is not None else {s.id for s in STRUCTURES}
    return [
        meta for meta in STRUCTURES if meta.id in allowed and bool((volume == meta.label).any())
    ]


def build_ct_assets(
    out: Path,
    volume: np.ndarray,
    included: Sequence[str] | None = None,
    spacing: float = 1.6,
    upscale: int = 2,
    seed: int = 7,
) -> dict[str, Any]:
    """写出 `ct/base`、`ct/overlay` 并返回可直接嵌入 structures.json 的清单。"""
    if upscale < 1:
        raise ValueError(f"upscale 必须 >=1，收到 {upscale}")
    out = Path(out)
    base_dir = out / CT_DIR / "base"
    overlay_root = out / CT_DIR / "overlay"
    base_dir.mkdir(parents=True, exist_ok=True)
    overlay_root.mkdir(parents=True, exist_ok=True)

    hu = build_hu(volume, seed=seed)
    active = _active_structures(volume, included)
    best: dict[str, int] = {
        meta.id: int(centroid_index(volume == meta.label, "axial")) for meta in active
    }
    for meta in active:
        (overlay_root / meta.id).mkdir(parents=True, exist_ok=True)

    slices: list[dict[str, Any]] = []
    for k in range(volume.shape[2]):
        labels = slice_plane(volume, "axial", k)
        for window in WINDOW_PRESETS:
            base = _resize(window_u8(hu[k], window["width"], window["level"]), upscale)
            name = f"{k:03d}_{window['id']}.png"
            (base_dir / name).write_bytes(_png_gray(base))

        present: list[dict[str, Any]] = []
        for meta in active:
            mask = labels == meta.label
            count = int(mask.sum())
            if count == 0:
                continue
            (overlay_root / meta.id / f"{k:03d}.png").write_bytes(
                _png_rgba(_resize(colored_overlay(mask, meta.rgb), upscale))
            )
            present.append({"id": meta.id, "name": meta.name, "voxels": count})
        slices.append({"index": k, "voxels": int((labels > 0).sum()), "structures": present})

    return {
        "schema_version": CT_SCHEMA_VERSION,
        "note": CT_NOTE,
        "slice_count": int(volume.shape[2]),
        "slice_spacing_mm": float(spacing),
        "upscale": int(upscale),
        "image_size": [
            int(volume.shape[0] * upscale),
            int(volume.shape[1] * upscale),
        ],
        "base_pattern": "assets/ct/base/{index:03d}_{window}.png",
        "overlay_pattern": "assets/ct/overlay/{id}/{index:03d}.png",
        "default_window": DEFAULT_WINDOW,
        "windows": [dict(window) for window in WINDOW_PRESETS],
        "best_slice": best,
        "slices": slices,
    }


def manifest_has_forbidden_text(manifest: dict[str, Any]) -> bool:
    """公开清单里不许出现真实病例编号或模型推理措辞。"""
    from .catalog import FORBIDDEN_TEXT

    return bool(FORBIDDEN_TEXT.search(json.dumps(manifest, ensure_ascii=False)))
