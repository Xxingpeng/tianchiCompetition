"""极简 glTF 2.0 二进制容器（GLB）写出，纯 struct + numpy，不依赖 trimesh。

演示只需要「带法线和颜色的一张静态网格」，所以只写到这个程度：
一个 buffer、两个 bufferView（POSITION / NORMAL）、一个 accessor 组、一个 mesh、一个 material。
Three.js 的 GLTFLoader 能直接吃。
"""

from __future__ import annotations

import json
import struct

import numpy as np

from .geom import Mesh

_MAGIC = 0x46_54_6C_67  # 'glTF'
_VERSION = 2
_CHUNK_JSON = 0x4E_4F_53_4A  # 'JSON'
_CHUNK_BIN = 0x00_4E_49_42  # 'BIN\x00'
_FLOAT = 5126
_UNSIGNED_INT = 5125
_TRIANGLES = 4


def _pad(data: bytes, align: int = 4, fill: bytes = b"\x00") -> bytes:
    rem = len(data) % align
    return data if rem == 0 else data + fill * (align - rem)


def face_normals(mesh: Mesh) -> np.ndarray:
    """每个顶点取其相邻面法线的平均并归一化，得到平滑着色需要的顶点法线。"""
    tri = mesh.vertices[mesh.faces]
    cross = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    acc = np.zeros_like(mesh.vertices, dtype=float)
    for k in range(3):
        np.add.at(acc, mesh.faces[:, k], cross)
    norm = np.linalg.norm(acc, axis=1)
    acc[norm > 0] /= norm[norm > 0, None]
    # 退化顶点（零面积邻域）给一个朝上的默认法线，避免 GLB 里出现 NaN
    acc[norm == 0] = (0.0, 0.0, 1.0)
    return acc


def _hex_to_factor(color_hex: str) -> list[float]:
    h = color_hex.lstrip("#")
    return [round(int(h[i : i + 2], 16) / 255, 4) for i in (0, 2, 4)] + [1.0]


def write_glb(mesh: Mesh, color_hex: str = "#888888") -> bytes:
    pos = np.ascontiguousarray(mesh.vertices, dtype=np.float32)
    nrm = np.ascontiguousarray(face_normals(mesh), dtype=np.float32)
    idx = np.ascontiguousarray(mesh.faces, dtype=np.uint32).ravel()
    if len(pos) == 0 or len(idx) == 0:
        raise ValueError("空网格不能导出 GLB")

    pos_bytes = pos.tobytes()
    nrm_bytes = nrm.tobytes()
    idx_bytes = idx.tobytes()
    off0 = 0
    off1 = _align(off0 + len(pos_bytes))
    off2 = _align(off1 + len(nrm_bytes))
    off3 = _align(off2 + len(idx_bytes))
    bin_chunk = (
        pos_bytes
        + b"\x00" * (off1 - len(pos_bytes))
        + nrm_bytes
        + b"\x00" * (off2 - off1 - len(nrm_bytes))
        + idx_bytes
        + b"\x00" * (off3 - off2 - len(idx_bytes))
    )

    gltf = {
        "asset": {"version": "2.0", "generator": "anatomy-sketch asset pipeline"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "structure"}],
        "meshes": [
            {
                "name": "structure",
                "primitives": [
                    {"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 0}
                ],
            }
        ],
        "materials": [
            {
                "name": "structure",
                "doubleSided": True,
                "pbrMetallicRoughness": {
                    "baseColorFactor": _hex_to_factor(color_hex),
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.75,
                },
            }
        ],
        "buffers": [{"byteLength": len(bin_chunk)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": off0, "byteLength": len(pos_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": off1, "byteLength": len(nrm_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": off2, "byteLength": len(idx_bytes), "target": 34963},
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": _FLOAT,
                "count": len(pos),
                "type": "VEC3",
                "min": pos.min(0).tolist(),
                "max": pos.max(0).tolist(),
            },
            {"bufferView": 1, "componentType": _FLOAT, "count": len(nrm), "type": "VEC3"},
            {"bufferView": 2, "componentType": _UNSIGNED_INT, "count": len(idx), "type": "SCALAR"},
        ],
    }

    json_bytes = _pad(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), 4, b" ")
    bin_padded = _pad(bin_chunk, 4, b"\x00")
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_padded)
    header = struct.pack("<III", _MAGIC, _VERSION, total)
    return (
        header
        + struct.pack("<II", len(json_bytes), _CHUNK_JSON)
        + json_bytes
        + struct.pack("<II", len(bin_padded), _CHUNK_BIN)
        + bin_padded
    )


def _align(n: int, a: int = 4) -> int:
    return (n + a - 1) // a * a


def read_glb(data: bytes) -> dict:
    """回读 GLB 的 JSON 块与 buffer，用于测试与自检。"""
    magic, version, total = struct.unpack("<III", data[:12])
    if magic != _MAGIC or version != _VERSION:
        raise ValueError("不是 GLB 2.0 文件")
    if total != len(data):
        raise ValueError(f"头部声明长度 {total} 与实际 {len(data)} 不符")
    jlen, jtype = struct.unpack("<II", data[12:20])
    if jtype != _CHUNK_JSON:
        raise ValueError("第一个 chunk 不是 JSON")
    gltf = json.loads(data[20 : 20 + jlen].rstrip(b" ").decode("utf-8"))
    off = 20 + _align(jlen)
    blen, btype = struct.unpack("<II", data[off : off + 8])
    if btype != _CHUNK_BIN:
        raise ValueError("第二个 chunk 不是 BIN")
    gltf["_bin"] = data[off + 8 : off + 8 + blen]
    return gltf


def positions_from_glb(data: bytes) -> np.ndarray:
    gltf = read_glb(data)
    acc = gltf["accessors"][0]
    view = gltf["bufferViews"][acc["bufferView"]]
    start = int(view["byteOffset"]) + int(acc.get("byteOffset", 0))
    raw = gltf["_bin"][start : start + int(view["byteLength"])]
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 3)
