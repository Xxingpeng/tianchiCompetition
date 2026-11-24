"""解剖智绘 · 示意资产管线。

把「一组解剖结构的几何」编译成前端可直接发布的静态资产：
统一的标注体素网格 -> 轴/冠/矢三视图底图与高亮 overlay（PNG）
+ 每个结构的 GLB 网格 + structures.json。

设计约束（详见 standards/00-project-context.md）：
- 只用 numpy / scipy / scikit-image / Pillow，不依赖 trimesh。
- 三视图与 3D 网格必须来自同一份几何，否则页面自相矛盾。
- 产出物全部是示意模型，不含任何真实病例影像像素。
"""

__all__ = [
    "bp3d",
    "build",
    "catalog",
    "fallback",
    "geom",
    "glb",
    "meta",
    "render",
    "surface",
    "voxel",
]
