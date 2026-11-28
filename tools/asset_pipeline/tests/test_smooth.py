"""Taubin 平滑的验收线：去台阶、体积变化 <2%、最大位移 <0.8 体素。"""

from __future__ import annotations

import numpy as np

from ..geom import Mesh
from ..smooth import (
    MAX_DISPLACEMENT_VOXELS,
    MAX_VOLUME_DELTA,
    mesh_volume,
    midpoint_subdivide,
    roughness,
    taubin_smooth,
    unify_winding,
)
from ..surface import mesh_from_mask

SPACING = 1.6


def _bumpy_sphere(size: int = 30) -> np.ndarray:
    """一个带细长突起的球：既有台阶，也有需要保护的细结构。"""
    grid = np.indices((size, size, size), dtype=float)
    center = (size - 1) / 2.0
    radius = np.sqrt(((grid - center) ** 2).sum(axis=0))
    mask = radius <= 8.5
    stalk = (
        (np.abs(grid[0] - center) <= 1)
        & (np.abs(grid[1] - center) <= 1)
        & (grid[2] >= center)
        & (grid[2] <= center + 9)
    )
    return mask | stalk


def _thin_plate(size: int = 24) -> np.ndarray:
    mask = np.zeros((size, size, size), dtype=bool)
    mask[6:18, 6:18, 10:12] = True
    return mask


def test_smoothing_lowers_roughness_and_stays_within_acceptance():
    mesh = mesh_from_mask(_bumpy_sphere(), spacing=SPACING)
    before = roughness(mesh)

    smoothed, report = taubin_smooth(mesh, spacing=SPACING)

    assert report.iterations > 0
    assert report.max_displacement_mm <= MAX_DISPLACEMENT_VOXELS * SPACING + 1e-9
    assert report.volume_delta <= MAX_VOLUME_DELTA + 1e-9
    assert roughness(smoothed) < before
    assert np.allclose(smoothed.faces, mesh.faces)


def test_thin_walls_are_protected_by_volume_and_displacement_limits():
    mesh = mesh_from_mask(_thin_plate(), spacing=SPACING)
    before = mesh_volume(mesh)

    smoothed, report = taubin_smooth(mesh, spacing=SPACING)

    assert report.iterations > 0
    assert report.volume_delta <= MAX_VOLUME_DELTA + 1e-9
    assert abs(mesh_volume(smoothed) - before) / before <= MAX_VOLUME_DELTA + 1e-9
    assert report.max_displacement_mm <= MAX_DISPLACEMENT_VOXELS * SPACING + 1e-9


def test_a_tight_displacement_budget_leaves_the_mesh_untouched():
    mesh = mesh_from_mask(_bumpy_sphere(), spacing=SPACING)
    smoothed, report = taubin_smooth(mesh, spacing=SPACING, max_displacement_voxels=0.01)
    assert report.iterations == 0
    assert np.array_equal(smoothed.vertices, mesh.vertices)


def _unit_tetrahedron() -> Mesh:
    vertices = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], dtype=float)
    faces = np.array([[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]], dtype=np.int32)
    return Mesh(vertices, faces)


def test_midpoint_subdivision_quadruples_faces_without_moving_the_surface():
    mesh = _unit_tetrahedron()
    once = midpoint_subdivide(mesh)
    twice = midpoint_subdivide(mesh, levels=2)

    assert len(once.faces) == len(mesh.faces) * 4
    assert len(twice.faces) == len(mesh.faces) * 16
    assert np.isclose(mesh_volume(once), mesh_volume(mesh))
    assert np.isclose(mesh_volume(twice), mesh_volume(mesh))


def test_open_mesh_smoothing_can_pin_its_boundary():
    vertices = np.array([[0, 0, 0], [2, 0, 0.4], [2, 2, -0.3], [0, 2, 0.2]], dtype=float)
    faces = np.array([[0, 1, 2], [0, 2, 3]], dtype=np.int32)
    mesh = midpoint_subdivide(Mesh(vertices, faces), levels=2)
    smoothed, report = taubin_smooth(
        mesh,
        spacing=1.0,
        iterations=8,
        max_displacement_voxels=2.0,
        check_volume=False,
        keep_boundary=True,
    )

    assert report.iterations > 0
    assert np.allclose(smoothed.vertices[:4], vertices)


def test_unify_winding_fixes_flipped_faces_on_closed_mesh():
    vertices = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], dtype=float)
    faces = np.array([[0, 2, 1], [0, 1, 3], [1, 2, 3], [2, 0, 3]], dtype=np.int32)
    broken = faces.copy()
    broken[[0, 2]] = broken[[0, 2]][:, [0, 2, 1]]

    fixed = unify_winding(Mesh(vertices, broken))

    signed = (
        np.einsum(
            "ij,ij->i",
            fixed.vertices[fixed.faces][:, 0],
            np.cross(fixed.vertices[fixed.faces][:, 1], fixed.vertices[fixed.faces][:, 2]),
        ).sum()
        / 6.0
    )
    assert signed > 0
    assert np.isclose(mesh_volume(fixed), 1.0 / 6.0)


def test_unify_winding_makes_shared_edges_run_opposite():
    vertices = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]], dtype=float)
    faces = np.array([[0, 1, 2], [1, 2, 3]], dtype=np.int32)

    fixed = unify_winding(Mesh(vertices, faces))

    def edge_dir(tri: np.ndarray, edge: tuple[int, int]) -> bool:
        loop = [(int(tri[0]), int(tri[1])), (int(tri[1]), int(tri[2])), (int(tri[2]), int(tri[0]))]
        for u, v in loop:
            if {u, v} == set(edge):
                return u < v
        raise AssertionError("边不存在")

    first, second = fixed.faces[0], fixed.faces[1]
    assert edge_dir(first, (1, 2)) != edge_dir(second, (1, 2))
