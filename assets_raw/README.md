# assets_raw/ · 第三方原始资产（不入库）

本目录存放 BodyParts3D 等第三方原始包。**整个目录被 `.gitignore` 排除**（除本说明文件），原因：解压后约 3.6 GB，且属于可重新下载的原始物料。

## 下载

- 来源：BodyParts3D（DBCLS / NBDC 维护）Release 4.0 的 OBJ 打包下载
- 放置：解压到 `assets_raw/bodyparts3d/`，保留原始目录结构
- 记录：下载完成后，把**版本号、下载日期、包校验值**写进仓库根 `NOTICE.md` §2

## 候选结构清单

用于确定需要哪些 OBJ 文件。`许可` 列指派生资产的标注口径，详见 `NOTICE.md`。

| # | 结构（页面显示名） | 英文名 | BP3D 源文件（待填写） | 状态 |
|---|---|---|---|---|
| 1 | 左心室 | Left ventricle (cavity) | 待确认 | 候选 |
| 2 | 右心室 | Right ventricle (cavity) | 待确认 | 候选 |
| 3 | 左心房 | Left atrium (cavity) | 待确认 | 候选 |
| 4 | 右心房 | Right atrium (cavity) | 待确认 | 候选 |
| 5 | 心肌 | Myocardium | 待确认 | 候选 |
| 6 | 升主动脉 | Ascending aorta | 待确认 | 候选 |
| 7 | 肺动脉干 | Pulmonary trunk | 待确认 | 候选 |
| 8 | 肺静脉 | Pulmonary veins | 待确认 | 候选，BP3D 可能无独立网格 |
| 9 | 左心耳 | Left auricle | — | **本项目自制几何**（BP3D 未收录） |

> 命名注意：研究仓库 2026-11-20 的标签纠正声明把 `3` 定义为左心室，而旧代码 `target_labels.py` 把 `1` 定义为 LV。本清单使用**解剖学名称本身**作为唯一标识，不使用任何整数标签，避免继承该冲突。

## 从原始包到发布资产

```text
assets_raw/bodyparts3d/*.obj
  → 挑选并记录 9 个源文件（本表填全）
  → 统一坐标系与比例、体素化进同一个标签体积
  → 渲染三视图底图 + 单结构 overlay（WebP/PNG）
  → marching_cubes + 减面 → GLB
  → 生成 public/assets/structures.json
```

由 `tools/asset_pipeline/` 实现，完成后把每条命令回填到 `NOTICE.md` §4。
