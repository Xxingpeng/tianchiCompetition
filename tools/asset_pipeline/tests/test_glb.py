"""表面提取与 GLB 二进制写出。"""

from __future__ import annotations

import struct

import numpy as np
import pytest

from tools.asset_pipeline import surface as s
from tools.asset_pipeline.glb import face_normals, positions_from_glb, read_glb, write_glb
from tools.asset_pipeline.tests.test_voxel import box_mesh


def cube_mask(shape=(20, 20, 20), sl=slice(5, 15)) -> np.ndarray:
    m = np.zeros(shape, bool)
    m[sl, sl, sl] = True
    return m


def test_mesh_from_mask_rejects_too_few_voxels():
    m = np.zeros((10, 10, 10), bool)
    m[0, 0, :10] = True  # 10 个体素，低于阈值
    with pytest.raises(ValueError, match="少于"):
        s.mesh_from_mask(m)


def test_mesh_from_mask_places_vertices_in_world_coords():
    mesh = s.mesh_from_mask(cube_mask(), spacing=2.0, origin=(-20.0, -20.0, -20.0))
    lo, hi = mesh.bounds
    assert len(mesh.vertices) > 10 and len(mesh.faces) > 10
    # 占据 i=5..14，体素中心从 -9 到 9，表面应在其外侧一点点
    assert np.all(lo > -13) and np.all(lo < -8)
    assert np.all(hi > 8) and np.all(hi < 13)


def test_mesh_from_mask_step_size_reduces_complexity():
    m = np.zeros((60, 60, 60), bool)
    m[10:50, 10:50, 10:50] = True
    fine = s.mesh_from_mask(m, spacing=1.0, origin=(0, 0, 0), step_size=1)
    coarse = s.mesh_from_mask(m, spacing=1.0, origin=(0, 0, 0), step_size=4)
    assert len(coarse.vertices) < len(fine.vertices) / 4
    assert len(coarse.faces) > 0


def test_mesh_from_mask_falls_back_when_decimation_collapses():
    """细长结构抽稀后可能整层消失，必须退回原分辨率而不是抛空网格。"""
    m = np.zeros((30, 30, 30), bool)
    m[10:12, 10:12, 4:26] = True
    mesh = s.mesh_from_mask(m, spacing=1.0, origin=(0, 0, 0), step_size=6)
    assert len(mesh.vertices) > 0


def flat_triangle_mesh():
    from tools.asset_pipeline.geom import Mesh

    return Mesh(
        np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]), np.array([[0, 1, 2]])
    )


def test_face_normals_are_unit_length_and_give_degenerate_vertices_a_default():
    normals = face_normals(box_mesh())
    assert normals.shape == (8, 3)
    assert np.allclose(np.linalg.norm(normals, axis=1), 1.0)
    assert np.allclose(face_normals(flat_triangle_mesh())[0], (0.0, 0.0, 1.0))


def test_write_glb_header_and_chunk_layout():
    data = write_glb(box_mesh(), "#d33d51")
    magic, version, total = struct.unpack("<III", data[:12])
    assert (magic, version, total) == (0x46546C67, 2, len(data))
    json_len, json_type = struct.unpack("<II", data[12:20])
    assert json_type == 0x4E4F534A
    assert json_len % 4 == 0
    off = 20 + json_len
    bin_len, bin_type = struct.unpack("<II", data[off : off + 8])
    assert bin_type == 0x004E4942
    assert bin_len % 4 == 0
    assert off + 8 + bin_len == len(data)


def test_glb_roundtrip_positions_and_material():
    mesh = s.mesh_from_mask(cube_mask(), spacing=1.0, origin=(0.0, 0.0, 0.0))
    data = write_glb(mesh, "#2f7ed8")
    gltf = read_glb(data)
    prim = gltf["meshes"][0]["primitives"][0]
    assert prim["attributes"] == {"POSITION": 0, "NORMAL": 1}
    assert prim["indices"] == 2
    assert gltf["materials"][0]["pbrMetallicRoughness"]["baseColorFactor"][:3] == [
        0.1843,
        0.4941,
        0.8471,
    ]
    pos = positions_from_glb(data)
    assert pos.shape == (len(mesh.vertices), 3)
    assert np.allclose(pos, mesh.vertices, atol=1e-4)
    acc = gltf["accessors"][0]
    assert np.allclose(acc["min"], mesh.vertices.min(0), atol=1e-4)
    assert np.allclose(acc["max"], mesh.vertices.max(0), atol=1e-4)
    assert gltf["accessors"][2]["componentType"] == 5125


def test_read_glb_rejects_non_glb_and_truncated_file():
    with pytest.raises(ValueError, match="不是 GLB"):
        read_glb(b"junkjunk" + b"\x00" * 32)
    good = write_glb(box_mesh())
    with pytest.raises(ValueError, match="声明长度"):
        read_glb(good[:-4])


def test_write_glb_rejects_empty_mesh():
    from tools.asset_pipeline.geom import Mesh

    with pytest.raises(ValueError, match="空网格"):
        write_glb(Mesh(np.zeros((0, 3)), np.zeros((0, 3), np.int32)))
