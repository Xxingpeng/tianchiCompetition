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
) -> dict[str, Any]:
    if provenance_mode not in PROVENANCE_MODES:
        raise ValueError(f"provenance_mode {provenance_mode!r} 非法")
    return {
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
