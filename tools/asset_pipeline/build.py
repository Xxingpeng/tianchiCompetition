"""CLI：把解剖几何编成前端可直接发布的静态资产。

    conda run -n tianchi python -m tools.asset_pipeline.build --out public/assets

默认 `--source auto`：能读到 BP3D OBJ 就走 BP3D（本项目的正式几何来源），
读不到才退回程序化兜底，并在 structures.json 里**如实标注** provenance——
绝不假装兜底资产是 BP3D 派生的。
"""

from __future__ import annotations

import argparse
import contextlib
import shutil
import sys
from pathlib import Path
from typing import Any

import numpy as np

from . import bp3d as bp3d_mod
from . import catalog as catalog_mod
from . import ct as ct_mod
from . import fallback
from . import render as render_mod
from . import surface as surface_mod
from .glb import write_glb
from .meta import BP3D_NOTICE, BY_ID, DISCLAIMER, VIEW_NAMES, VIEWS
from .voxel import assign_labels

ROOT = Path(__file__).resolve().parents[2]

# BP3D 确实没有独立部件、由本项目自制并按正式几何贴附的结构 -> 锚点结构 id。
# 左心耳（auricle of left atrium）在 isa_parts_list_e.txt 里没有词条，只能自作。
SELF_MADE = {"lxa": "la"}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="生成解剖智绘的演示资产")
    p.add_argument(
        "--out",
        default=str(ROOT / "public" / "assets"),
        help="资产输出目录（仓库内的 public/assets）",
    )
    p.add_argument("--source", choices=("auto", "bp3d", "procedural"), default="auto")
    p.add_argument("--manifest", default=str(ROOT / "assets_raw" / "bp3d_manifest.json"))
    p.add_argument("--assets-raw", default=str(ROOT / "assets_raw"))
    p.add_argument("--grid", type=int, default=96, help="各向同性体素边长")
    p.add_argument("--spacing", type=float, default=1.6, help="体素间距 mm")
    p.add_argument("--margin", type=int, default=4, help="模型与体素盒边界的留白体素数")
    p.add_argument(
        "--cast-axis",
        dest="cast_axis",
        type=int,
        default=0,
        choices=(0, 1, 2),
        help="网格体素化投射轴",
    )
    p.add_argument("--upscale", type=int, default=3, help="切片 PNG 最近邻放大倍数")
    p.add_argument(
        "--ct-upscale", dest="ct_upscale", type=int, default=2, help="伪 CT PNG 放大倍数"
    )
    p.add_argument(
        "--mesh-step", dest="mesh_step", type=int, default=1, help="GLB 抽稀步长，用于压体积"
    )
    p.add_argument("--force", action="store_true", help="清空 slices/、meshes/ 与 ct/ 后重写")
    return p.parse_args(argv)


def _labels() -> dict[str, int]:
    return {s.id: s.label for s in BY_ID.values()}


def _notices(source_mode: str) -> list[str]:
    notices = [DISCLAIMER]
    if source_mode == "bp3d":
        notices.append(BP3D_NOTICE)
    else:
        notices.append("几何为本项目程序化兜底模型，未使用第三方解剖网格；不用于诊断。")
    return notices


def _resolve_source(args: argparse.Namespace) -> str:
    if args.source != "auto":
        return args.source
    manifest = Path(args.manifest)
    if not manifest.is_file():
        return "procedural"
    try:
        m = bp3d_mod.load_manifest(manifest)
        present, _ = bp3d_mod.resolve_bindings(m, Path(args.assets_raw))
    except Exception as exc:
        print(f"!! 读取 BP3D 清单失败（{exc}），退回程序化兜底", file=sys.stderr)
        return "procedural"
    return "bp3d" if len(present) >= 2 else "procedural"


def _make_volume(args: argparse.Namespace, shape: tuple[int, int, int], origin: tuple[float, ...]):
    """返回 (volume, provenance, excluded, mode)。"""
    labels = _labels()
    if _resolve_source(args) == "procedural":
        print("!! 使用程序化兜底几何（没有可用的 BP3D OBJ）。", file=sys.stderr)
        masks = fallback.build_masks(shape, spacing=args.spacing, origin=origin)
        volume, _kept = assign_labels(masks, labels, shape, conflict_budget=0)
        provenance = dict.fromkeys(masks, "procedural_fallback")
        return volume, provenance, [], "procedural_fallback"

    manifest = bp3d_mod.load_manifest(Path(args.manifest))
    present, absent = bp3d_mod.resolve_bindings(manifest, Path(args.assets_raw))
    if len(present) < 2:
        raise SystemExit(
            f"BP3D OBJ 只找到 {len(present)} 个（清单 {args.manifest}）；"
            "请按 assets_raw/README.md 放置原始包"
        )
    excluded = [
        {"id": b.id, "reason": f"OBJ 缺失：{b.obj or 'manifest 里还没填文件名'}"}
        for b in absent
        if b.id not in SELF_MADE
    ]
    excluded += [
        {"id": b.id, "reason": f"已载入，但文件名未与下载包核对：{b.obj}"}
        for b in present
        if not b.verified
    ]
    meshes = bp3d_mod.load_meshes(manifest, Path(args.assets_raw), present)
    for b in present:
        a = bp3d_mod.audit_mesh(meshes[b.id])
        flag = (
            f"（边界边 {a['open_edges']}，在 {bp3d_mod.MAX_OPEN_EDGES} 条上限内）"
            if a["open_edges"]
            else ""
        )
        print(f"   {b.id:6s} {b.obj:18s} v={a['vertices']:6d} f={a['faces']:6d} {flag}")
    volume, _kept, (scale, offset) = bp3d_mod.build_label_volume(
        meshes,
        labels,
        shape,
        spacing=args.spacing,
        margin_voxels=args.margin,
        cast_axis=args.cast_axis,
        cast_axes={b.id: b.cast_axis for b in present},
    )
    print(
        f">> BP3D 路线：{len(present)} 个部件共用变换 "
        f"scale={scale:.4f} offset={np.round(offset, 1).tolist()}"
    )
    provenance = {b.id: f"BP3D / {b.obj}" for b in present}
    self_made = [b for b in absent if b.id in labels and b.id in SELF_MADE]
    for b in self_made:
        anchor = BY_ID[SELF_MADE[b.id]]
        la_mask = volume == int(anchor.label)
        mask = fallback.auricle_from_la(la_mask, args.spacing, origin)
        mask &= volume == 0  # 自制部件绝不覆盖 BP3D 体素，宁可小
        volume[mask] = int(b.meta.label)
        provenance[b.id] = f"自制几何（BP3D 未收录 {b.id}），按 BP3D {anchor.id} 体素包围盒贴附"
        print(f"   {b.id:6s} 自制贴附：{int(mask.sum())} 体素（锚点 {anchor.id}）")
    return volume, provenance, excluded, "bp3d"


def build(args: argparse.Namespace) -> int:
    out = Path(args.out)
    shape = (args.grid,) * 3
    spacing = float(args.spacing)
    origin = tuple(-np.asarray(shape, float) * spacing / 2.0)

    volume, provenance, excluded, mode = _make_volume(args, shape, origin)

    slices_dir = out / "slices"
    meshes_dir = out / "meshes"
    ct_dir = out / "ct"
    if args.force:
        # CT 下还有 base/ 与逐结构 overlay/ 两层目录，必须整树清掉，否则退场结构会留下孤儿图。
        if ct_dir.is_dir():
            shutil.rmtree(ct_dir)
        for d in (slices_dir, meshes_dir):
            if d.is_dir():
                for stale in d.glob("*"):
                    stale.unlink(missing_ok=True)
    slices_dir.mkdir(parents=True, exist_ok=True)
    meshes_dir.mkdir(parents=True, exist_ok=True)

    structures: list[dict[str, Any]] = []
    mesh_sizes: dict[str, int] = {}
    for sid, label in _labels().items():
        meta = BY_ID[sid]
        mask = volume == label
        voxels = int(mask.sum())
        if voxels < surface_mod.MIN_VOXELS:
            excluded.append({"id": sid, "reason": f"体素数 {voxels} 太少，跳过而不是产出空资产"})
            continue

        views: dict[str, dict[str, Any]] = {}
        centroids: list[int] = []
        for view in VIEWS:
            k = render_mod.centroid_index(mask, view)
            centroids.append(k)
            base, overlay, _ = render_mod.render_pair(volume, meta, view, k, upscale=args.upscale)
            bname, oname = f"{sid}_{view}_base.png", f"{sid}_{view}_overlay.png"
            (slices_dir / bname).write_bytes(base)
            (slices_dir / oname).write_bytes(overlay)
            views[view] = {
                "view_name": VIEW_NAMES[view],
                "base": f"assets/slices/{bname}",
                "overlay": f"assets/slices/{oname}",
                "slice_index": k,
                "slice_voxels": int(render_mod.slice_plane(mask, view, k).sum()),
            }

        mesh = surface_mod.mesh_from_mask(
            mask, spacing=spacing, origin=origin, step_size=args.mesh_step
        )
        glb = write_glb(mesh, meta.color)
        # 清单里存的是站点相对路径 assets/...；磁盘上就在 out（public/assets）之下
        rel = f"assets/meshes/{sid}.glb"
        (meshes_dir / f"{sid}.glb").write_bytes(glb)
        mesh_sizes[rel] = len(glb)

        structures.append(
            catalog_mod.build_structure(
                meta=meta,
                views=views,
                mesh=rel,
                provenance=provenance.get(sid, mode),
                voxels=voxels,
                centroid=centroids,
            )
        )

    included = [s["id"] for s in structures]
    ct_manifest = ct_mod.build_ct_assets(
        out,
        volume,
        included=included,
        spacing=spacing,
        upscale=args.ct_upscale,
    )
    print(
        f">> 伪 CT：{ct_manifest['slice_count']} 层 × "
        f"{len(ct_manifest['windows'])} 窗，{len(ct_manifest['best_slice'])} 个结构有逐层真值"
    )

    notices = _notices(mode)
    catalog = catalog_mod.build_catalog(
        structures=structures,
        shape=shape,
        spacing=spacing,
        origin=list(origin),
        provenance_mode=mode,
        notices=notices,
        excluded=excluded,
        ct=ct_manifest,
    )
    # 校验按相对路径 `assets/...` 解析，所以 root 是 out 的父目录
    root = out.parent
    catalog_mod.write_catalog(catalog, out / "structures.json")
    problems = catalog_mod.validate_catalog(catalog, structures, mesh_sizes, notices, root=root)
    _report(out, structures, mesh_sizes, excluded, problems)
    return 1 if problems else 0


def _report(out, structures, mesh_sizes, excluded, problems) -> None:
    print(f"输出目录 : {out}")
    print(f"结构数量 : {len(structures)} 可用 / {len(excluded)} 排除或未核对")
    for rel, size in sorted(mesh_sizes.items()):
        print(f"  {rel:34s} {size / 1024:8.1f} KiB")
    print(f"  GLB 合计 {sum(mesh_sizes.values()) / 1024:8.1f} KiB")
    for item in excluded:
        print(f"  ! {item['id']}: {item['reason']}")
    if problems:
        print(f"!! 校验失败 {len(problems)} 项：", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
    else:
        print("校验通过：文案、同义词、三视图、GLB、体素数与伪 CT 逐层真值全部齐备")


def main(argv: list[str] | None = None) -> int:
    # Windows 控制台默认 GBK，中文报告会变乱码（standards/05 §7 记过这个坑）
    for stream in (sys.stdout, sys.stderr):
        with contextlib.suppress(Exception):
            stream.reconfigure(encoding="utf-8", errors="replace")
    args = parse_args(argv)
    if args.grid < 32 or args.grid > 256:
        raise SystemExit("--grid 需在 32..256 之间：太小几何失真，太大白屏")
    if args.ct_upscale < 1 or args.ct_upscale > 6:
        raise SystemExit("--ct-upscale 需在 1..6 之间：再大只会让 PNG 白白变重")
    out = Path(args.out)
    if out.name != "assets":
        # 清单里存的是站点相对路径 assets/...，校验必须从其父目录解析；
        # --out 指到别处（例如临时目录）会让每一项都报"未落盘"，是假信号。
        raise SystemExit(
            f"--out 需指向站点根下的 assets 目录（如 public/assets），当前是 {args.out}"
        )
    return build(args)


if __name__ == "__main__":
    raise SystemExit(main())
