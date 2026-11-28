"""structures.json 的构造与发布前一致性校验。

这里是"页面会不会自相矛盾"的最后一道闸：文案、三视图底图、overlay、GLB、体素数五项
必须同时存在且真实落盘，任何一项不合格就直接失败并列出全部问题，而不是把缺资产的结构
留到运行时再报错。
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from . import ct as ct_mod

SCHEMA_VERSION = 1
VIEWS = ("axial", "coronal", "sagittal")
PROVENANCE_MODES = ("bp3d", "procedural_fallback", "mixed")
MAX_MESH_BYTES = 2_000_000
MAX_TOTAL_MESH_BYTES = 8_000_000

# 公开目录里绝不允许出现的字样：真实病例编号、研究数据集名、模型推理措辞。
FORBIDDEN_TEXT = re.compile(r"(ct_train_|ct_test_|mmwhs|patient|分割结果|推理输出|模型预测)", re.I)
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def build_structure(
    meta,
    views: dict[str, dict[str, Any]],
    mesh: str,
    provenance: str,
    voxels: int,
    centroid: list[int],
) -> dict[str, Any]:
    """一条结构记录。文案取自 meta，几何事实取自本次生成结果。"""
    return {
        "id": meta.id,
        "label": meta.label,
        "name": meta.name,
        "en_name": meta.en_name,
        "aliases": list(meta.aliases),
        "description": meta.description,
        "parent": meta.parent,
        "color": meta.color,
        "mesh": mesh,
        "views": views,
        "provenance": provenance,
        "stats": {"voxels": int(voxels), "centroid_slice_index": [int(c) for c in centroid]},
    }


def build_catalog(
    structures: list[dict[str, Any]],
    shape: tuple[int, int, int],
    spacing: float,
    origin: list[float],
    provenance_mode: str,
    notices: list[str],
    excluded: list[dict[str, str]],
    ct: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if provenance_mode not in PROVENANCE_MODES:
        raise ValueError(f"provenance_mode {provenance_mode!r} 非法")
    catalog: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "provenance_mode": provenance_mode,
        "grid": {
            "shape": [int(s) for s in shape],
            "spacing_mm": [float(spacing)] * 3,
            "origin_mm": [float(v) for v in origin],
            "axis_order": ["左右", "前后", "上下"],
            "axis_note": "V[i0,i1,i2]：i0 右→左，i1 前→后，i2 下→上",
        },
        "notices": list(notices),
        "structures": structures,
        "excluded": excluded,
    }
    if ct is not None:
        catalog["ct"] = ct
    return catalog


def _pattern_path(pattern: Any, **values: object) -> str:
    if not isinstance(pattern, str) or not pattern:
        return ""
    try:
        return pattern.format(**values)
    except (KeyError, IndexError, ValueError):
        return ""


def validate_ct(
    catalog: dict[str, Any],
    structures: list[dict[str, Any]],
    root: Path,
) -> list[str]:
    """伪 CT 清单与逐层真值的一致性检查；返回问题清单。"""
    ct = catalog.get("ct")
    if not isinstance(ct, dict):
        return ["ct 清单缺失或不是对象"]
    problems: list[str] = []
    if ct.get("schema_version") != ct_mod.CT_SCHEMA_VERSION:
        problems.append(f"ct.schema_version 应为 {ct_mod.CT_SCHEMA_VERSION}")

    note = str(ct.get("note", ""))
    if not note:
        problems.append("ct.note 为空：必须声明伪 CT 的用途边界")
    elif "非真实病例" not in note and "不是真实病例" not in note:
        problems.append("ct.note 缺少「非真实病例」声明")

    grid = catalog.get("grid") or {}
    shape = grid.get("shape") if isinstance(grid, dict) else None
    if (
        not isinstance(shape, list)
        or len(shape) != 3
        or not all(isinstance(v, int) and v > 0 for v in shape)
    ):
        return [*problems, "grid.shape 非法，无法核对 CT 切面数"]
    depth = int(shape[2])
    if int(ct.get("slice_count", 0)) != depth:
        problems.append(f"ct.slice_count {ct.get('slice_count')!r} 与体素深度 {depth} 不符")
    upscale = ct.get("upscale")
    if not isinstance(upscale, int) or upscale < 1:
        problems.append(f"ct.upscale {upscale!r} 应为 >=1 的整数")
        upscale = 1
    size = ct.get("image_size")
    expected_size = [int(shape[0]) * upscale, int(shape[1]) * upscale]
    if size != expected_size:
        problems.append(f"ct.image_size {size!r} 应为 {expected_size}")

    windows = ct.get("windows")
    window_ids: list[str] = []
    if not isinstance(windows, list) or not windows:
        problems.append("ct.windows 为空，至少需要一个窗预设")
    else:
        for i, window in enumerate(windows):
            if not isinstance(window, dict):
                problems.append(f"ct.windows[{i}] 不是对象")
                continue
            wid = str(window.get("id", ""))
            if not wid:
                problems.append(f"ct.windows[{i}] 缺少 id")
            elif wid in window_ids:
                problems.append(f"ct.windows[{i}] id {wid} 重复")
            else:
                window_ids.append(wid)
            if not str(window.get("name", "")).strip():
                problems.append(f"ct.windows[{i}] 缺少 name")
            for key in ("width", "level"):
                value = window.get(key)
                if not isinstance(value, (int, float)) or isinstance(value, bool):
                    problems.append(f"ct.windows[{i}].{key} 不是数字")
                elif key == "width" and float(value) <= 0:
                    problems.append(f"ct.windows[{i}].width 必须为正")
    default_window = str(ct.get("default_window", ""))
    if window_ids and default_window not in window_ids:
        problems.append(f"ct.default_window {default_window!r} 不在 windows 里")

    base_pattern = ct.get("base_pattern")
    overlay_pattern = ct.get("overlay_pattern")
    for key, pattern, needed in (
        ("base_pattern", base_pattern, ("{index", "{window}")),
        ("overlay_pattern", overlay_pattern, ("{index", "{id}")),
    ):
        if not isinstance(pattern, str) or not all(token in pattern for token in needed):
            problems.append(f"ct.{key} 必须同时包含占位符 {list(needed)}")

    by_id = {str(s.get("id")): s for s in structures}
    best = ct.get("best_slice")
    if not isinstance(best, dict):
        problems.append("ct.best_slice 不是对象")
        best = {}
    for sid in by_id:
        k = best.get(sid)
        if not isinstance(k, int) or not 0 <= k < depth:
            problems.append(f"结构 {sid}：ct.best_slice 缺失或越界 {k!r}")

    slices = ct.get("slices")
    if not isinstance(slices, list) or len(slices) != depth:
        problems.append(f"ct.slices 应有 {depth} 层，实际 {len(slices or [])}")
        slices = []
    counts: dict[str, dict[int, int]] = {sid: {} for sid in by_id}
    for i, row in enumerate(slices):
        if not isinstance(row, dict):
            problems.append(f"ct.slices[{i}] 不是对象")
            continue
        if row.get("index") != i:
            problems.append(f"ct.slices[{i}].index 应为 {i}，实际 {row.get('index')!r}")
        voxels = row.get("voxels")
        if not isinstance(voxels, int) or voxels < 0:
            problems.append(f"ct.slices[{i}].voxels 应为非负整数")
        for window in window_ids:
            rel = _pattern_path(base_pattern, index=i, window=window)
            if not rel:
                problems.append(f"ct.slices[{i}] 无法生成 {window} 底图路径")
            elif not (root / rel).is_file():
                problems.append(f"ct 底图未落盘 {rel}")
        entries = row.get("structures")
        if not isinstance(entries, list):
            problems.append(f"ct.slices[{i}].structures 不是数组")
            continue
        seen: set[str] = set()
        for entry in entries:
            if not isinstance(entry, dict):
                problems.append(f"ct.slices[{i}] 含非对象结构记录")
                continue
            sid = str(entry.get("id", ""))
            if sid not in by_id:
                problems.append(f"ct.slices[{i}] 含目录外结构 {sid!r}")
                continue
            if sid in seen:
                problems.append(f"ct.slices[{i}] 结构 {sid} 重复")
            seen.add(sid)
            name = entry.get("name")
            if name != by_id[sid].get("name"):
                problems.append(f"ct.slices[{i}]/{sid} 名称与目录不一致")
            count = entry.get("voxels")
            if not isinstance(count, int) or count <= 0:
                problems.append(f"ct.slices[{i}]/{sid} 体素数应为正整数")
                continue
            counts[sid][i] = count
            rel = _pattern_path(overlay_pattern, id=sid, index=i)
            if not rel:
                problems.append(f"ct.slices[{i}]/{sid} 无法生成 overlay 路径")
            elif not (root / rel).is_file():
                problems.append(f"ct overlay 未落盘 {rel}")

    for sid, per_slice in counts.items():
        if not per_slice:
            problems.append(f"结构 {sid}：ct 逐层真值从未出现，overlay 全空")
            continue
        k = best.get(sid)
        if isinstance(k, int) and k in per_slice:
            peak = max(per_slice.values())
            if per_slice[k] != peak:
                problems.append(
                    f"结构 {sid}：ct.best_slice {k} 不是最密层（该层 {per_slice[k]}，峰值 {peak}）"
                )

    if ct_mod.manifest_has_forbidden_text(ct):
        problems.append("ct 清单含不允许公开的字样（真实病例/模型推理）")
    return problems


def validate_catalog(
    catalog: dict[str, Any],
    structures: list[dict[str, Any]],
    mesh_sizes: dict[str, int],
    notices: list[str],
    root: Path,
) -> list[str]:
    """返回问题清单，空列表代表通过。一次性收全，方便一轮修完。"""
    problems: list[str] = []
    if catalog.get("schema_version") != SCHEMA_VERSION:
        problems.append(f"schema_version 应为 {SCHEMA_VERSION}")
    if catalog.get("provenance_mode") not in PROVENANCE_MODES:
        problems.append(f"provenance_mode {catalog.get('provenance_mode')!r} 非法")
    if not notices:
        problems.append("notices 为空：页面必须携带用途声明与许可署名")
    if not any("示意" in n or "非真实病例" in n for n in notices):
        problems.append("notices 缺少「示意模型、非真实病例」用途声明")
    if len(structures) < 2:
        problems.append(f"可用结构只有 {len(structures)} 个，不构成对照演示")

    seen_ids: set[str] = set()
    seen_labels: set[int] = set()
    for s in structures:
        sid = str(s.get("id", "?"))
        where = f"结构 {sid}"
        if sid in seen_ids:
            problems.append(f"{where}：id 重复")
        seen_ids.add(sid)

        label = s.get("label")
        if not isinstance(label, int) or not 1 <= label <= 9:
            problems.append(f"{where}：label {label!r} 不在本项目冻结区间 1..9")
        elif label in seen_labels:
            problems.append(f"{where}：label {label} 与其他结构重复，违反冻结映射")
        else:
            seen_labels.add(label)

        for key in ("name", "en_name", "description", "parent"):
            text = str(s.get(key, "")).strip()
            if not text:
                problems.append(f"{where}：必填文案 {key} 为空")
            if FORBIDDEN_TEXT.search(text):
                problems.append(f"{where}：{key} 含不允许公开的字样（真实病例/模型推理）")
        if not s.get("aliases"):
            problems.append(f"{where}：aliases 为空，检索无从命中")
        if not HEX_COLOR.match(str(s.get("color", ""))):
            problems.append(f"{where}：color {s.get('color')!r} 不是 #rrggbb")
        if not str(s.get("provenance", "")):
            problems.append(f"{where}：provenance 为空，资产来源必须如实标注")
        if int(s.get("stats", {}).get("voxels", 0)) <= 0:
            problems.append(f"{where}：体素数为 0，几何没有真正生成")

        mesh = str(s.get("mesh", ""))
        if not mesh:
            problems.append(f"{where}：缺少 mesh 路径")
        elif not (root / mesh).is_file():
            problems.append(f"{where}：GLB 未落盘 {mesh}")
        else:
            size = (root / mesh).stat().st_size
            if size != mesh_sizes.get(mesh):
                problems.append(f"{where}：GLB 实际 {size} 字节与记录 {mesh_sizes.get(mesh)} 不符")
            if size > MAX_MESH_BYTES:
                problems.append(f"{where}：GLB {size} 字节超过单文件上限 {MAX_MESH_BYTES}")

        views = s.get("views") or {}
        if tuple(views) != VIEWS:
            problems.append(f"{where}：视图应恰好是 {list(VIEWS)}，实际 {list(views)}")
        for view in VIEWS:
            entry = views.get(view) or {}
            for kind in ("base", "overlay"):
                rel = str(entry.get(kind, ""))
                if not rel:
                    problems.append(f"{where}/{view}：缺少 {kind} 路径")
                elif not (root / rel).is_file():
                    problems.append(f"{where}/{view}：{kind} 未落盘 {rel}")
            if int(entry.get("slice_voxels", 0)) <= 0:
                problems.append(f"{where}/{view}：该层面目标体素数为 0，overlay 会是空的")

    if "ct" in catalog:
        problems.extend(validate_ct(catalog, structures, root))

    total = sum(mesh_sizes.values())
    if total > MAX_TOTAL_MESH_BYTES:
        problems.append(f"GLB 合计 {total} 字节超过上限 {MAX_TOTAL_MESH_BYTES}")
    return problems


def write_catalog(catalog: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def summarize_sizes(root: Path) -> dict[str, int]:
    """按扩展名统计发布资产体积，对齐 standards/00 §4 的上限。"""
    out: dict[str, int] = {}
    for p in Path(root).rglob("*"):
        if p.is_file():
            key = p.suffix.lstrip(".").lower() or "other"
            out[key] = out.get(key, 0) + p.stat().st_size
    return out
