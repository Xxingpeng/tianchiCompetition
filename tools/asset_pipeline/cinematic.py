"""3D 心脏循环演示的平滑网格导出。

与 `build.py` 的体素路线不同，这里直接把 BP3D 原始 OBJ 三角面写成 GLB：
演示需要近看心腔与瓣膜，96³ 体素的台阶感在放大的剖面里不可接受。
所有部件仍是同一套世界毫米坐标，前端只做一次统一缩放。

同时从 BP3D 的瓣膜叶片网格算出四个瓣环的中心、朝向与半径，写进 manifest，
前端据此摆放程序化瓣膜并让叶片随心动周期开合。
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import numpy as np

from .geom import Mesh, load_obj
from .glb import write_glb
from .polish import polish_part

ROOT = Path(__file__).resolve().parents[2]
OBJ_DIR = ROOT / "assets_raw" / "bodyparts3d"
ZIP_PATH = ROOT / "assets_raw" / "isa_BP3D_4.0_obj_99.zip"
OUT_DIR = ROOT / "public" / "assets" / "circulation"
ZIP_PREFIX = "isa_BP3D_4.0_obj_99/"
MAX_FILE_BYTES = 2_000_000
MAX_TOTAL_BYTES = 4_000_000

SOURCE = (
    "BodyParts3D, © The Database Center for Life Science licensed under "
    "CC Attribution 4.0 International"
)

# id -> (group, 颜色, BP3D 元素文件)
PARTS: list[tuple[str, str, str, tuple[str, ...]]] = [
    ("ventricle-wall", "ventricle", "#c47474", ("FJ2428",)),
    ("atrium-wall-left", "left-atrium", "#c47474", ("FJ2438",)),
    ("atrium-wall-right", "right-atrium", "#c47474", ("FJ2439",)),
    ("lv", "left-ventricle", "#7e3a40", ("FJ2422",)),
    ("rv", "right-ventricle", "#7e3a40", ("FJ2423",)),
    ("la", "left-atrium", "#7e3a40", ("FJ2425",)),
    ("ra", "right-atrium", "#7e3a40", ("FJ2424",)),
    ("papillary-left", "left-ventricle", "#c47474", ("FJ2429",)),
    ("papillary-right", "right-ventricle", "#c47474", ("FJ2419", "FJ2430", "FJ2437")),
    ("aorta", "vessel", "#cf6a5c", ("FJ3413",)),
    ("pulmonary-trunk", "vessel", "#7d94c4", ("FJ2966",)),
    ("svc", "vessel", "#7d94c4", ("FJ3645",)),
    ("ivc", "vessel", "#7d94c4", ("FJ3441", "FJ3659")),
    ("pv-left-superior", "vessel", "#cf6a5c", ("FJ2925",)),
    ("pv-right-superior", "vessel", "#cf6a5c", ("FJ3020",)),
    ("pv-left-inferior", "vessel", "#cf6a5c", ("FJ2944",)),
    ("pv-right-inferior", "vessel", "#cf6a5c", ("FJ3040",)),
    (
        "coronary-arteries",
        "coronary",
        "#a34a4e",
        ("FJ2723", "FJ2737", "FJ2631", "FJ2649", "FJ2692"),
    ),
    ("coronary-sinus", "coronary", "#5f7099", ("FJ2655",)),
]

CHAMBERS = {
    "lv": "FJ2422",
    "rv": "FJ2423",
    "la": "FJ2425",
    "ra": "FJ2424",
}

VALVE_SOURCES = {
    "mitral": ("二尖瓣", "av", "left", ("FJ2420", "FJ2432"), 16.0),
    "tricuspid": ("三尖瓣", "av", "right", ("FJ2421", "FJ2433", "FJ2436"), 18.0),
    "aortic": ("主动脉瓣", "semilunar", "left", ("FJ2426", "FJ2431", "FJ2435"), 10.0),
    "pulmonary": ("肺动脉瓣", "semilunar", "right", ("FJ2417",), 11.0),
}
VALVE_DIRECTIONS = {
    "mitral": ("la", "lv"),
    "tricuspid": ("ra", "rv"),
    "aortic": ("lv", "aorta"),
    "pulmonary": ("rv", "pulmonary-trunk"),
}

PORTS = {
    "svc": "svc",
    "ivc": "ivc",
    "aorta": "aorta",
    "pa": "pulmonary-trunk",
    "pv-left-superior": "pv-left-superior",
    "pv-right-superior": "pv-right-superior",
    "pv-left-inferior": "pv-left-inferior",
    "pv-right-inferior": "pv-right-inferior",
}

# 可见断口：主动脉弓顶、肺动脉干顶、上腔静脉顶、下腔静脉腹腔端。
STUMP_ENDS = {
    "aorta": "top",
    "pulmonary-trunk": "top",
    "svc": "top",
    "ivc": "bottom",
}


def ensure_obj(fid: str) -> Path:
    path = OBJ_DIR / f"{fid}.obj"
    if path.exists():
        return path
    with zipfile.ZipFile(ZIP_PATH) as archive:
        data = archive.read(f"{ZIP_PREFIX}{fid}.obj")
    OBJ_DIR.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


def load(fid: str) -> Mesh:
    return load_obj(ensure_obj(fid))


def merge(meshes: list[Mesh]) -> Mesh:
    verts: list[np.ndarray] = []
    faces: list[np.ndarray] = []
    offset = 0
    for mesh in meshes:
        verts.append(mesh.vertices)
        faces.append(mesh.faces.astype(np.int64) + offset)
        offset += len(mesh.vertices)
    return Mesh(np.vstack(verts), np.vstack(faces).astype(np.int32))


def compact(mesh: Mesh) -> Mesh:
    """丢掉没有三角面引用的顶点，避免孤立点在 Taubin 里被拉向原点。"""
    if not len(mesh.faces):
        return mesh
    used = np.unique(mesh.faces)
    remap = np.full(len(mesh.vertices), -1, dtype=np.int64)
    remap[used] = np.arange(len(used), dtype=np.int64)
    return Mesh(mesh.vertices[used], remap[mesh.faces.astype(np.int64)].astype(np.int32))


def cut_plane_z(mesh: Mesh, z_cut: float, keep_above: bool = True) -> Mesh:
    """在 z=z_cut 处截断并补齐切边，留下整齐的开口环。

    逐面丢弃会让断口呈锯齿状；这里对跨平面的三角面补交点，断口才能
    与前端程序化的管壁、暗腔对齐。
    """
    if not len(mesh.faces):
        return mesh
    v = mesh.vertices.astype(float)
    faces = mesh.faces.astype(np.int64)
    inside = v[:, 2] >= z_cut if keep_above else v[:, 2] <= z_cut
    extra: list[np.ndarray] = []
    cache: dict[tuple[int, int], int] = {}

    def edge_point(a: int, b: int) -> int:
        key = (a, b) if a < b else (b, a)
        found = cache.get(key)
        if found is not None:
            return found
        t = (z_cut - v[a, 2]) / (v[b, 2] - v[a, 2])
        point = v[a] + t * (v[b] - v[a])
        point[2] = z_cut
        index = len(v) + len(extra)
        extra.append(point)
        cache[key] = index
        return index

    out: list[list[int]] = []
    for tri in faces:
        flags = inside[tri]
        if flags.all():
            out.append(tri.tolist())
            continue
        if not flags.any():
            continue
        polygon: list[int] = []
        for k in range(3):
            a, b = int(tri[k]), int(tri[(k + 1) % 3])
            if inside[a]:
                polygon.append(a)
            if inside[a] != inside[b]:
                polygon.append(edge_point(a, b))
        for k in range(1, len(polygon) - 1):
            out.append([polygon[0], polygon[k], polygon[k + 1]])
    vertices = np.vstack([v, np.asarray(extra)]) if extra else v
    return compact(Mesh(vertices, np.asarray(out, dtype=np.int32)))


def remove_end_cap(mesh: Mesh, top: bool = True, margin: float = 1.0) -> Mesh:
    """删掉血管末端的封盖三角面，留下真正的开口。

    BP3D 的大血管在水密化后是带平盖的封闭网格；不开口就没有管壁和暗腔，
    断口看起来像实心圆柱。只删贴近端面且朝向端面的面，侧面不受影响。
    """
    if not len(mesh.faces):
        return mesh
    tri = mesh.vertices[mesh.faces]
    lo, hi = mesh.bounds
    plane = hi[2] if top else lo[2]
    normals = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    length = np.linalg.norm(normals, axis=1)
    length[length == 0] = 1.0
    nz = normals[:, 2] / length
    if top:
        planar = tri[:, :, 2].min(axis=1) >= plane - margin
        facing = nz > 0.3
    else:
        planar = tri[:, :, 2].max(axis=1) <= plane + margin
        facing = nz < -0.3
    drop = planar & facing
    return compact(Mesh(mesh.vertices, mesh.faces[~drop]))


def build_part(pid: str, files: tuple[str, ...]) -> Mesh:
    mesh = merge([load(fid) for fid in files])
    if pid == "ivc":
        # 腹腔段太长会把心脏衬成一根直管；截到心脏下方约 1 cm。
        return cut_plane_z(mesh, 1165.0)
    if pid == "svc":
        # 头颈段同理，只留可辨认的短残端。
        return cut_plane_z(mesh, 1289.0, keep_above=False)
    if pid in {"aorta", "pulmonary-trunk"}:
        return remove_end_cap(mesh, top=True)
    return mesh


def center_of(mesh: Mesh) -> np.ndarray:
    lo, hi = mesh.bounds
    return (lo + hi) / 2.0


def round_list(values: np.ndarray | list[float], digits: int = 2) -> list[float]:
    return [round(float(v), digits) for v in values]


def port_point(mesh: Mesh, key: str) -> list[float]:
    lo, hi = mesh.bounds
    if key == "svc":
        return round_list([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, hi[2]])
    if key == "ivc":
        return round_list([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]])
    if key in {"aorta", "pa"}:
        return round_list([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, hi[2]])
    # 肺静脉取离心脏最远的一端：左侧取 +x 极值，右侧取 -x 极值。
    far_x = hi[0] if key.startswith("pv-left") else lo[0]
    idx = int(np.argmin(np.abs(mesh.vertices[:, 0] - far_x)))
    return round_list(mesh.vertices[idx])


def valve_anchor(
    center: np.ndarray,
    direction_from: np.ndarray,
    direction_to: np.ndarray,
    radius: float,
) -> dict[str, object]:
    # 叶片网格本身伸进心室，质心比瓣环低；瓣环取两腔中心连线上的 55% 处。
    normal = np.asarray(direction_to) - np.asarray(direction_from)
    length = np.linalg.norm(normal)
    if length < 1e-9:
        raise ValueError("瓣膜方向退化")
    normal = normal / length
    return {"center": round_list(center), "normal": round_list(normal), "radius": radius}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    parts: list[dict[str, object]] = []
    meshes: dict[str, Mesh] = {}
    for pid, group, color, files in PARTS:
        mesh, note = polish_part(pid, build_part(pid, files))
        meshes[pid] = mesh
        if note:
            print(f"   {pid:22s} {note}")
        data = write_glb(mesh, color)
        if len(data) > MAX_FILE_BYTES:
            raise ValueError(f"{pid}.glb 超过单文件预算：{len(data)} B")
        total += len(data)
        (OUT_DIR / f"{pid}.glb").write_bytes(data)
        lo, hi = mesh.bounds
        parts.append(
            {
                "id": pid,
                "file": f"circulation/{pid}.glb",
                "group": group,
                "color": color,
                "bounds": [round_list(lo), round_list(hi)],
                "vertices": len(mesh.vertices),
                "faces": len(mesh.faces),
            }
        )
    if total > MAX_TOTAL_BYTES:
        raise ValueError(f"循环演示资产超过总预算：{total} B")

    chamber_centers = {name: center_of(meshes[name]) for name in CHAMBERS}
    vessel_centers = {
        "aorta": center_of(meshes["aorta"]),
        "pulmonary-trunk": center_of(meshes["pulmonary-trunk"]),
    }

    valves: list[dict[str, object]] = []
    for vid, (name, kind, side, files, radius) in VALVE_SOURCES.items():
        from_key, to_key = VALVE_DIRECTIONS[vid]
        start = (
            vessel_centers.get(from_key)
            if from_key in vessel_centers
            else chamber_centers[from_key]
        )
        end = vessel_centers.get(to_key) if to_key in vessel_centers else chamber_centers[to_key]
        anchor = valve_anchor(start + 0.55 * (end - start), start, end, radius)
        valves.append(
            {
                "id": vid,
                "name": name,
                "kind": kind,
                "side": side,
                **anchor,
                "leaflets": len(files),
            }
        )

    ports = {key: port_point(meshes[pid], key) for key, pid in PORTS.items()}

    stumps: list[dict[str, object]] = []
    for pid, end in STUMP_ENDS.items():
        mesh = meshes[pid]
        f = mesh.faces.astype(np.int64)
        edges = np.sort(np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]), axis=1)
        unique, counts = np.unique(edges, axis=0, return_counts=True)
        ring = unique[counts == 1].ravel()
        if len(ring) < 3:
            raise ValueError(f"{pid} 的 {end} 端没有形成开口环")
        points = mesh.vertices[ring]
        center = points.mean(axis=0)
        radius = np.linalg.norm(points[:, :2] - center[:2], axis=1)
        stumps.append(
            {
                "part": pid,
                "center": round_list(center),
                "normal": [0.0, 0.0, 1.0 if end == "top" else -1.0],
                "radius": round(float(np.percentile(radius, 90)), 2),
            }
        )

    lo, hi = (
        np.min([p["bounds"][0] for p in parts], axis=0),
        np.max([p["bounds"][1] for p in parts], axis=0),
    )
    manifest = {
        "schemaVersion": 1,
        "note": "BP3D 平滑网格，世界毫米坐标；仅用于解剖示意教学，不是真实病例影像。",
        "source": SOURCE,
        "bounds": [round_list(lo), round_list(hi)],
        "parts": parts,
        "chambers": {k: round_list(v) for k, v in chamber_centers.items()},
        "valves": valves,
        "ports": ports,
        "stumps": stumps,
        "totalBytes": total,
    }
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"写出 {len(parts)} 个 GLB，合计 {total} B；manifest 就绪。")


if __name__ == "__main__":
    main()
