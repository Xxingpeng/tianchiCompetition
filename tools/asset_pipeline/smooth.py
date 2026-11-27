"""Taubin 平滑：抹掉体素台阶，又不让模型整体缩水。

marching cubes 直接跑在 1.6mm 二值掩码上，斜面会留下半个体素的台阶，放大看像
3D 打印半成品。Taubin 的 λ/μ 交替（先正 λ 收缩、再负 μ 回弹）能在不整体收缩的
前提下把台阶磨圆。

9 个结构是逐个独立提面的：逐个平滑会在贴合面处各走各的，磨出亚体素级的缝隙。
因此这里写死两条验收线，超出就回退到上一轮：
  - 顶点最大位移 ≤ 0.8 个体素（约 1.3 mm，仍不到一个体素）；
  - 网格体积相对变化 ≤ 2%。
clamp_displacement=True 时改为逐顶点钳制位移：个别离群毛刺先被拉回上限，
其余顶点继续磨，适合本来就不是水密体的 BP3D 血管。
肺静脉、左心耳这类细结构会先撞到位移上限而自动少平滑几轮，不会被抹平；
40 轮能把心肌上肉眼可见的宽环一起磨掉，而不是只磨掉半个体素的小台阶。
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import sparse

from .geom import Mesh

LAMBDA = 0.5
MU = -0.53
DEFAULT_ITERATIONS = 40
MAX_DISPLACEMENT_VOXELS = 0.8
MAX_VOLUME_DELTA = 0.02


@dataclass(frozen=True)
class SmoothingReport:
    iterations: int
    max_displacement_mm: float
    volume_delta: float


def mesh_volume(mesh: Mesh) -> float:
    """封闭三角网格的体积（散度定理）。朝外的三角面给正值，返回绝对值。"""
    if len(mesh.faces) == 0:
        return 0.0
    tri = mesh.vertices[mesh.faces]
    signed = np.einsum("ij,ij->i", tri[:, 0], np.cross(tri[:, 1], tri[:, 2])).sum() / 6.0
    return float(abs(signed))


def _laplacian(faces: np.ndarray, vertex_count: int) -> tuple[sparse.csr_matrix, np.ndarray]:
    """均匀权重邻接与度数。每个三角面贡献三条无向边。"""
    f = faces.astype(np.int64)
    rows = np.concatenate([f[:, 0], f[:, 1], f[:, 2], f[:, 1], f[:, 2], f[:, 0]])
    cols = np.concatenate([f[:, 1], f[:, 2], f[:, 0], f[:, 0], f[:, 1], f[:, 2]])
    graph = sparse.csr_matrix(
        (np.ones(len(rows), dtype=float), (rows, cols)), shape=(vertex_count, vertex_count)
    )
    degree = np.asarray(graph.sum(axis=1)).ravel()
    degree[degree == 0] = 1.0
    return graph, degree


def _relax(vertices: np.ndarray, graph: sparse.csr_matrix, degree: np.ndarray, factor: float):
    mean = graph @ vertices / degree[:, None]
    return vertices + factor * (mean - vertices)


def roughness(mesh: Mesh) -> float:
    """邻域均值的均方位移：台阶越硬，这个数越大。仅用于校验平滑确实起了作用。"""
    if len(mesh.faces) == 0:
        return 0.0
    graph, degree = _laplacian(mesh.faces, len(mesh.vertices))
    delta = graph @ mesh.vertices / degree[:, None] - mesh.vertices
    return float(np.mean(np.sum(delta * delta, axis=1)))


def unify_winding(mesh: Mesh) -> Mesh:
    """统一相邻三角面的绕行方向，让法线真正朝外。

    BP3D 的 OBJ 按面记录法线，导出后常残留少量反向绕行的面；去重焊接后
    这些面不会被发现，正反面材质沿用错误法线，切面内壁会出现一块块亮斑。
    这里沿共享边做 BFS：相邻面必须反向绕行；闭合连通块再按有向体积统一
    朝外，开口网格保持 BFS 结果，不猜体积符号。
    """
    if len(mesh.faces) == 0:
        return mesh
    faces = mesh.faces.astype(np.int64).copy()
    edge_faces: dict[tuple[int, int], list[tuple[int, bool]]] = {}
    for index, (a, b, c) in enumerate(faces.tolist()):
        for u, v in ((a, b), (b, c), (c, a)):
            key = (u, v) if u < v else (v, u)
            edge_faces.setdefault(key, []).append((index, u < v))
    flip = np.zeros(len(faces), dtype=bool)
    visited = np.zeros(len(faces), dtype=bool)
    component = np.full(len(faces), -1, dtype=np.int64)
    comp_count = 0
    for seed in range(len(faces)):
        if visited[seed]:
            continue
        visited[seed] = True
        component[seed] = comp_count
        stack = [seed]
        while stack:
            index = stack.pop()
            a, b, c = faces[index]
            for u, v in ((int(a), int(b)), (int(b), int(c)), (int(c), int(a))):
                key = (u, v) if u < v else (v, u)
                current_forward = u < v
                for other, forward in edge_faces[key]:
                    if visited[other]:
                        continue
                    actual_here = current_forward ^ bool(flip[index])
                    flip[other] = forward == actual_here
                    visited[other] = True
                    component[other] = comp_count
                    stack.append(other)
        comp_count += 1
    faces[flip] = faces[flip][:, [0, 2, 1]]
    for comp in range(comp_count):
        mask = component == comp
        if int(mask.sum()) < 4:
            continue
        tri = mesh.vertices[faces[mask]]
        volume = float(np.einsum("ij,ij->i", tri[:, 0], np.cross(tri[:, 1], tri[:, 2])).sum() / 6.0)
        edges = np.sort(
            np.vstack([faces[mask][:, [0, 1]], faces[mask][:, [1, 2]], faces[mask][:, [2, 0]]]),
            axis=1,
        )
        _unique, counts = np.unique(edges, axis=0, return_counts=True)
        if np.all(counts == 2) and volume < 0:
            faces[mask] = faces[mask][:, [0, 2, 1]]
    return Mesh(mesh.vertices, faces.astype(np.int32))


def boundary_vertex_mask(faces: np.ndarray, vertex_count: int) -> np.ndarray:
    if len(faces) == 0:
        return np.zeros(vertex_count, dtype=bool)
    f = faces.astype(np.int64)
    edges = np.sort(np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]), axis=1)
    unique, counts = np.unique(edges, axis=0, return_counts=True)
    mask = np.zeros(vertex_count, dtype=bool)
    boundary = unique[counts == 1]
    if len(boundary):
        mask[boundary.ravel()] = True
    return mask


def midpoint_subdivide(mesh: Mesh, levels: int = 1) -> Mesh:
    """每个三角面一分为四，共享边只生成一个中点，避免新增裂缝。

    BP3D 的大血管只有几百个面，直接放大看得出多边形轮廓；先细分再 Taubin，
    才能把断口和弓部磨成连续曲面，而不是单纯把低模顶点推来推去。
    """
    vertices = mesh.vertices
    faces = mesh.faces.astype(np.int64)
    for _ in range(max(0, int(levels))):
        if len(faces) == 0:
            break
        offset = len(vertices)
        edges = np.sort(np.vstack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1)
        unique, inverse = np.unique(edges, axis=0, return_inverse=True)
        midpoints = 0.5 * (vertices[unique[:, 0]] + vertices[unique[:, 1]])
        vertices = np.vstack([vertices, midpoints])
        index = inverse.reshape(3, -1) + offset
        ab, bc, ca = index[0], index[1], index[2]
        a, b, c = faces[:, 0], faces[:, 1], faces[:, 2]
        faces = np.vstack(
            [
                np.stack([a, ab, ca], axis=1),
                np.stack([ab, b, bc], axis=1),
                np.stack([ca, bc, c], axis=1),
                np.stack([ab, bc, ca], axis=1),
            ]
        ).astype(np.int32)
    return Mesh(vertices, faces)


def taubin_smooth(
    mesh: Mesh,
    spacing: float = 1.6,
    iterations: int = DEFAULT_ITERATIONS,
    max_displacement_voxels: float = MAX_DISPLACEMENT_VOXELS,
    max_volume_delta: float = MAX_VOLUME_DELTA,
    keep_boundary: bool = False,
    check_volume: bool = True,
    clamp_displacement: bool = False,
) -> tuple[Mesh, SmoothingReport]:
    """逐轮做 λ+μ 一对平滑，超限即停在上一轮；返回（平滑后网格, 报告）。

    开放网格（BP3D 血管）没有可靠体积，可关掉体积线；保留边界顶点避免断口缩口。
    """
    if len(mesh.vertices) == 0 or iterations <= 0:
        return mesh, SmoothingReport(0, 0.0, 0.0)
    graph, degree = _laplacian(mesh.faces, len(mesh.vertices))
    original = mesh.vertices
    boundary = boundary_vertex_mask(mesh.faces, len(mesh.vertices)) if keep_boundary else None
    volume0 = mesh_volume(mesh)
    max_displacement = float(max_displacement_voxels) * float(spacing)

    vertices = original.copy()
    best = mesh
    executed = 0
    last_displacement = 0.0
    last_delta = 0.0
    for step_index in range(int(iterations)):
        vertices = _relax(vertices, graph, degree, LAMBDA)
        vertices = _relax(vertices, graph, degree, MU)
        if boundary is not None:
            vertices[boundary] = original[boundary]
        if clamp_displacement:
            offset = vertices - original
            lengths = np.linalg.norm(offset, axis=1)
            scale = np.minimum(1.0, max_displacement / np.maximum(lengths, 1e-12))
            vertices = original + offset * scale[:, None]
        displacement = float(np.linalg.norm(vertices - original, axis=1).max())
        if not clamp_displacement and displacement > max_displacement:
            break
        candidate = Mesh(vertices, mesh.faces)
        delta = (
            0.0
            if not check_volume or volume0 <= 0
            else abs(mesh_volume(candidate) - volume0) / volume0
        )
        if check_volume and delta > max_volume_delta:
            break
        best = candidate
        executed = step_index + 1
        last_displacement = displacement
        last_delta = delta
    return best, SmoothingReport(executed, last_displacement, last_delta)
