"""从标注体素渲染三视图：灰度底图 + 目标结构高亮 overlay。

三张视图的取层与朝向约定（体素轴序 [左右, 前后, 上下]）：
  轴位 axial    法线 = 上下轴，行 = 前→后，列 = 患者右→患者左（放射学惯例）
  冠状位 coronal 法线 = 前后轴，行 = 上→下，列 = 患者右→患者左
  矢状位 sagittal 法线 = 左右轴，行 = 上→下，列 = 前→后

取层用的是**目标结构质心所在层面**，不是体积中心——小结构（心耳、肺静脉）常常根本不在中心层上。
底图与 overlay 取自同一份体素、同一层面，所以高亮不可能和底图对不上。
"""

from __future__ import annotations

import io
from collections.abc import Sequence

import numpy as np
from PIL import Image

VIEW_NORMAL_AXIS = {"axial": 2, "coronal": 1, "sagittal": 0}
# 每个冻结标签在底图里的灰度。相邻结构刻意拉开，避免"一片糊"。
LABEL_GRAY: dict[int, int] = {
    0: 26,
    1: 150,  # 心肌
    2: 96,  # 左心房
    3: 74,  # 左心室
    4: 112,  # 右心房
    5: 88,  # 右心室
    6: 176,  # 升主动脉
    7: 138,  # 肺动脉干
    8: 202,  # 肺静脉
    9: 224,  # 左心耳
}


def _validate_view(view: str) -> int:
    if view not in VIEW_NORMAL_AXIS:
        raise ValueError(f"未知视图 {view!r}，可选 {sorted(VIEW_NORMAL_AXIS)}")
    return VIEW_NORMAL_AXIS[view]


def slice_plane(volume: np.ndarray, view: str, index: int) -> np.ndarray:
    """取出某个层面的显示朝向 2D 数组。"""
    axis = _validate_view(view)
    d = volume.shape[axis]
    k = int(np.clip(index, 0, d - 1))
    plane = np.take(volume, k, axis=axis)
    if view == "axial":
        return np.ascontiguousarray(plane.T)
    return np.ascontiguousarray(np.flipud(plane.T))


def centroid_index(mask: np.ndarray, view: str) -> int:
    """目标结构占据体素最多的那一层（对细长结构比算术质心更稳）。"""
    axis = _validate_view(view)
    if not mask.any():
        return mask.shape[axis] // 2
    counts = mask.sum(axis=tuple(a for a in range(3) if a != axis))
    return int(np.argmax(counts))


def gray_image(labels: np.ndarray) -> np.ndarray:
    """标签平面 -> uint8 灰度平面。未登记的标签按中灰处理而不是静默变黑。"""
    out = np.full(labels.shape, 26, dtype=np.uint8)
    known = False
    for label, value in LABEL_GRAY.items():
        if label == 0:
            continue
        hit = labels == label
        if hit.any():
            known = True
        out[hit] = value
    if not known:
        out[labels > 0] = 128
    return out


def overlay_mask(labels: np.ndarray, target_label: int) -> np.ndarray:
    return labels == int(target_label)


def _upscale(plane: np.ndarray, factor: int) -> np.ndarray:
    if factor <= 1:
        return plane
    return np.asarray(
        Image.fromarray(plane).resize(
            (plane.shape[1] * factor, plane.shape[0] * factor), Image.NEAREST
        )
    )


def render_pair(
    volume: np.ndarray,
    meta,
    view: str,
    index: int | None = None,
    upscale: int = 3,
) -> tuple[bytes, bytes, int]:
    """渲染一对 PNG（灰度底图、结构色 overlay），返回 (base_png, overlay_png, 取层索引)。

    底图与 overlay 取自同一份体素的同一层面，因此高亮不可能和底图对不上。
    """
    mask = volume == int(meta.label)
    k = centroid_index(mask, view) if index is None else int(index)
    labels = slice_plane(volume, view, k)
    hi = overlay_mask(labels, meta.label)
    base_png = _to_png(_upscale(gray_image(labels), upscale))
    overlay_png = _to_png_rgba(_upscale_rgba(colored_overlay(hi, meta.rgb), upscale))
    return base_png, overlay_png, k


def _to_png(arr: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(arr, mode="L").save(buf, format="PNG")
    return buf.getvalue()


def _to_png_rgba(arr: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(arr, mode="RGBA").save(buf, format="PNG")
    return buf.getvalue()


def _upscale_rgba(arr: np.ndarray, factor: int) -> np.ndarray:
    if factor <= 1:
        return arr
    img = Image.fromarray(arr, mode="RGBA")
    img = img.resize((arr.shape[1] * factor, arr.shape[0] * factor), Image.NEAREST)
    return np.asarray(img)


def colored_overlay(hi: np.ndarray, rgb: Sequence[int]) -> np.ndarray:
    """给前端图例/自检用：把高亮掩码涂成结构本色。"""
    rgba = np.zeros((*hi.shape, 4), dtype=np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = rgb
    rgba[..., 3] = np.where(hi, 150, 0).astype(np.uint8)
    return rgba
