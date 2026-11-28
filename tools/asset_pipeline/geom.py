"""几何数据与 OBJ 读写（纯 numpy，不依赖 trimesh）。

模型空间约定（全项目统一，勿改）：
  坐标分量顺序 [x0, x1, x2] = [左右, 前后, 上下]，单位 mm，+x0 指向人体左侧、
  +x1 指向后方、+x2 指向上方。体素数组索引顺序与坐标分量一致：V[i0, i1, i2]。
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np


@dataclass(frozen=True)
class Mesh:
    """三角网格。vertices (N,3) float64，faces (M,3) int32。"""

    vertices: np.ndarray
    faces: np.ndarray

    def __post_init__(self) -> None:
        if self.vertices.ndim != 2 or self.vertices.shape[1] != 3:
            raise ValueError(f"vertices 形状应为 (N,3)，实际 {self.vertices.shape}")
        if self.faces.ndim != 2 or self.faces.shape[1] != 3:
            raise ValueError(f"faces 应为三角面 (M,3)，实际 {self.faces.shape}")
        if self.faces.size and self.faces.max() >= len(self.vertices):
            raise ValueError("faces 索引越界")

    @property
    def bounds(self) -> tuple[np.ndarray, np.ndarray]:
        """返回 (min, max) 包围盒角点。空网格返回 ±inf。"""
        if len(self.vertices) == 0:
            return np.full(3, np.inf), np.full(3, -np.inf)
        return self.vertices.min(0), self.vertices.max(0)


def load_obj(path: str | Path) -> Mesh:
    """解析 Wavefront OBJ 的 `v` / `f`。

    支持 `1`、`-1`、`1/2/3`（只取顶点序号），多边形扇形三角化。
    """
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    for raw in Path(path).read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if line.startswith("v "):
            parts = line.split()
            if len(parts) < 4:
                continue
            vertices.append((float(parts[1]), float(parts[2]), float(parts[3])))
        elif line.startswith("f "):
            idx = []
            for token in line.split()[1:]:
                ref = int(token.split("/")[0])
                idx.append(ref - 1 if ref > 0 else len(vertices) + ref)
            for k in range(1, len(idx) - 1):
                faces.append((idx[0], idx[k], idx[k + 1]))
    if not vertices:
        raise ValueError(f"{path} 中没有顶点")
    return Mesh(np.asarray(vertices, float), np.asarray(faces, np.int32))


def write_obj(path: str | Path, mesh: Mesh, name: str = "mesh") -> None:
    lines = [f"# {name}", f"o {name}"]
    lines += [f"v {x:.4f} {y:.4f} {z:.4f}" for x, y, z in mesh.vertices]
    lines += [f"f {a + 1} {b + 1} {c + 1}" for a, b, c in mesh.faces]
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")


def transform(
    mesh: Mesh, scale: float = 1.0, offset: tuple[float, float, float] = (0, 0, 0)
) -> Mesh:
    """先均匀缩放再平移。法线朝向不受均匀缩放影响，无需额外处理。"""
    verts = mesh.vertices.astype(float, copy=True)
    if scale <= 0:
        raise ValueError("scale 必须为正")
    verts *= scale
    verts += np.asarray(offset, float)
    return Mesh(verts, mesh.faces.astype(np.int32, copy=True))


def dedupe_vertices(mesh: Mesh, decimals: int = 6) -> Mesh:
    """合并坐标重复的顶点。OBJ 常把同一顶点写多次（分面法线），不去重会误判封闭性。"""
    if not len(mesh.vertices):
        return mesh
    key = np.round(mesh.vertices, decimals)
    uniq, inverse = np.unique(key, axis=0, return_inverse=True)
    if len(uniq) == len(mesh.vertices):
        return mesh
    faces = inverse[mesh.faces.astype(np.int64)]
    keep = (
        (faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])
    )
    return Mesh(uniq.astype(float), faces[keep].astype(np.int32))


def boundary_edges(mesh: Mesh) -> int:
    """只被一个三角面使用的边数。封闭流形体应当为 0。

    用来拦下"OBJ 下载不完整 / 部件本身是开口面片"这类情况：
    开口网格做奇偶填充会凭空围出一块实体，产出一张看起来正常但完全错误的解剖图。
    """
    if not len(mesh.faces):
        return 0
    f = mesh.faces.astype(np.int64)
    edges = np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    edges = np.sort(edges, axis=1)
    _uniq, counts = np.unique(edges, axis=0, return_counts=True)
    return int((counts == 1).sum() + (counts > 2).sum())


def merge_bounds(meshes: list[Mesh]) -> tuple[np.ndarray, np.ndarray]:
    lo = np.full(3, np.inf)
    hi = np.full(3, -np.inf)
    for mesh in meshes:
        if not len(mesh.vertices):
            continue
        a, b = mesh.bounds
        lo = np.minimum(lo, a)
        hi = np.maximum(hi, b)
    return lo, hi


def fit_transform(
    meshes: list[Mesh],
    voxel_shape: tuple[int, int, int],
    spacing: float = 1.0,
    margin_voxels: int = 2,
) -> tuple[float, np.ndarray]:
    """求一个均匀缩放 + 平移，使所有网格的并集包围盒居中放入体素盒内（保持长宽高比例）。

    这是 BP3D 各部件能保持彼此解剖位置关系的前提：所有部件共用同一个变换。
    """
    lo, hi = merge_bounds(meshes)
    if not np.isfinite(lo).all():
        raise ValueError("没有可用顶点，无法计算变换")
    extent = hi - lo
    inner = np.asarray(voxel_shape, float) * spacing - 2.0 * margin_voxels * spacing
    if (inner <= 0).any():
        raise ValueError(f"体素盒太小：{voxel_shape} spacing={spacing} margin={margin_voxels}")
    if (extent <= 0).any():
        raise ValueError(f"包围盒退化：{extent}")
    scale = float(np.min(inner / extent))
    center_model = (lo + hi) / 2.0
    center_grid = np.asarray(voxel_shape, float) * spacing / 2.0
    return scale, center_grid - center_model * scale
