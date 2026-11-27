"""循环演示网格的细分与 Taubin 抛光。

BP3D 原始 OBJ 的大血管只有几百个面，近看能数出多边形；先做中点细分把轮廓
补密，再做受限 Taubin，把弓部和断口磨圆。冠状动脉这类细网不抛光——几轮
Laplacian 就会把末梢抹平，宁可保留原始走向。
"""

from __future__ import annotations

from dataclasses import dataclass

from .geom import Mesh, dedupe_vertices
from .smooth import midpoint_subdivide, taubin_smooth, unify_winding


@dataclass(frozen=True)
class PolishSpec:
    levels: int
    iterations: int
    max_displacement_mm: float
    keep_boundary: bool = True


# 面数越多越少细分：心室壁已有 3.7 万面，只做轻微 Taubin；大血管补两轮。
# 位移用逐顶点钳制而不是整轮回退，个别毛刺不会拖累整体磨圆。
SPECS: dict[str, PolishSpec] = {
    "ventricle-wall": PolishSpec(0, 4, 1.0),
    "atrium-wall-left": PolishSpec(0, 4, 1.0),
    "atrium-wall-right": PolishSpec(0, 4, 1.0),
    "lv": PolishSpec(1, 6, 1.2),
    "rv": PolishSpec(1, 6, 1.2),
    "la": PolishSpec(1, 6, 1.2),
    "ra": PolishSpec(1, 6, 1.2),
    "papillary-left": PolishSpec(1, 4, 0.8),
    "papillary-right": PolishSpec(1, 4, 0.8),
    "aorta": PolishSpec(2, 14, 2.0),
    "pulmonary-trunk": PolishSpec(2, 12, 1.8),
    "svc": PolishSpec(1, 6, 1.5),
    "ivc": PolishSpec(1, 6, 1.5),
    "pv-left-superior": PolishSpec(1, 3, 0.8),
    "pv-right-superior": PolishSpec(1, 3, 0.8),
    "pv-left-inferior": PolishSpec(1, 3, 0.8),
    "pv-right-inferior": PolishSpec(1, 3, 0.8),
}


def polish_part(part_id: str, mesh: Mesh) -> tuple[Mesh, str | None]:
    spec = SPECS.get(part_id)
    if spec is None:
        return mesh, None
    welded = unify_winding(dedupe_vertices(mesh))
    refined = midpoint_subdivide(welded, levels=spec.levels)
    polished, report = taubin_smooth(
        refined,
        spacing=1.0,
        iterations=spec.iterations,
        max_displacement_voxels=spec.max_displacement_mm,
        keep_boundary=spec.keep_boundary,
        check_volume=False,
        clamp_displacement=True,
    )
    note = (
        f"细分 {spec.levels} 轮 · Taubin {report.iterations} 轮 · "
        f"位移 {report.max_displacement_mm:.2f} mm · "
        f"{len(mesh.faces)}→{len(polished.faces)} 面"
    )
    return polished, note
