# NOTICE · 资产来源、生成方式与许可判定

> 本文件是作品的合规留痕。任何进入公开演示页面的第三方内容，都必须在此列出来源与许可依据。
> 状态：**已生成首版（2026-11-24）**。当前 `public/assets/` 为**程序化兜底几何**产物；BP3D OBJ 到手后按 §4 同一条命令重跑，届时 §1 的来源列改为 BodyParts3D 派生。

## 1. 演示资产总览

| 资产 | 路径 | 当前来源 | 许可 | 状态 |
|---|---|---|---|---|
| 结构目录 | `public/assets/structures.json` | 本项目 `tools/asset_pipeline` 生成（9 结构） | 本项目原创 | 已生成，`provenance_mode = procedural_fallback` |
| 三视图示意底图 | `public/assets/slices/*_base.png`（27 张） | 由统一体素模板渲染 | 本项目原创（不含真实影像像素） | 已生成 |
| 高亮 overlay | `public/assets/slices/*_overlay.png`（27 张） | 由同一份体素渲染 | 本项目原创 | 已生成 |
| 3D 网格 | `public/assets/meshes/*.glb`（9 个，合计 979 KiB） | 当前为本项目程序化几何；BP3D OBJ 到位后改为 BodyParts3D 派生 | 见 §2 | 已生成 |
| 左心耳网格 | `public/assets/meshes/lxa.glb` | 本项目自制几何（BP3D 未收录该部件） | 本项目原创 | 已生成 |

体积实测（构建期校验门禁）：切面 236 KiB + GLB 979 KiB + JSON 16 KiB ≈ **1.25 MB**；单个 GLB 最大 `myo.glb` 451.9 KiB（阈值 2 MB），全部网格合计阈值 8 MB。

## 2. BodyParts3D（主要三维几何来源）

- **项目**：BodyParts3D，由 Database Center for Life Science（DBCLS）/ NBDC 维护
- **版本**：Release 4.0（**待确认**并在此记录下载日期与文件校验值）
- **许可判定**：在权利主体（DBCLS/NBDC）页面核实为 **CC BY 4.0**
- **署名原文（必须随页面可见）**：
  > BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International
- **⚠ 残留风险**：`openanatomy.jp` 历史页面记载为 **CC-BY-SA 2.1 JP**，与 DBCLS 表述不一致。**发布前必须复核**；在复核完成前，派生资产目录按 **CC BY-SA 4.0** 保守标注。
- **本地处理**：原始解压包约 3.6 GB，只存放于 `assets_raw/`，**不进入 Git**。

## 3. 已排除的数据集与原因

| 数据集 | 排除原因 |
|---|---|
| MM-WHS 2017（研究用真实心脏 CT） | 原始病例数据授权范围无法确认；作品需公开发布，隐私风险不可接受 |
| Medical Segmentation Decathlon | 许可实为 **CC-BY-SA 4.0**（社区常误记为 CC-BY），copyleft 传染面更大 |
| KiTS | **CC BY-NC-SA**，禁止商业使用，不适合作为公开参赛作品资产底座 |
| Z-Anatomy | 含真人影像，同上 |
| FMA（Foundational Model of Anatomy） | **许可无法核实**：`fma.org` 不可达、OCLC 镜像下载返回 402。因此页面**只使用解剖学名与通用英文术语，不转载 FMA 的数字 ID 与父子关系表** |

## 4. 生成方式（可复现）

```bash
# 所有 Python 执行都在 conda env `tianchi`（Python 3.11.18），不碰研究环境 FMA
# 命令一律用该环境的可执行文件；`conda run` 会重编码 stdout，中文报告在控制台变乱码
PY=/d/Anaconda_envs/envs/tianchi/python.exe
RUFF=/d/Anaconda_envs/envs/tianchi/Scripts/ruff.exe

# 正式路线：assets_raw/bodyparts3d/ 里放好筛选后的 BP3D OBJ，并把文件名写进 assets_raw/bp3d_manifest.json
PYTHONIOENCODING=utf-8 "$PY" -m tools.asset_pipeline.build --out public/assets

# 当前产物所用的兜底路线（OBJ 未到手时显式指定，避免误以为已用上 BP3D）
PYTHONIOENCODING=utf-8 "$PY" -m tools.asset_pipeline.build --source procedural \
    --grid 96 --spacing 1.6 --out public/assets

# 检查
PYTHONIOENCODING=utf-8 "$PY" -m pytest    # 用例 + 覆盖率阈值 80%（阈值写在 pyproject.toml）
"$RUFF" check tools/ && "$RUFF" format --check tools/
```

依赖锁定见 `requirements-asset.txt`（numpy 2.4.6 / scipy 1.17.1 / scikit-image 0.26.0 / pillow 13.0.0）与 `requirements-dev.txt`（pytest 9.2.0 / pytest-cov 7.1.0 / ruff 0.17.6）。**不使用 trimesh**：OBJ 解析、体素化、`marching_cubes`、GLB 写出均为本项目自实现的纯 numpy 代码，无外部二进制依赖。

## 5. 内容边界声明

- 页面所有切面与高亮均为**示意模型渲染**，非真实病例影像，非分割模型推理结果。
- 不含诊断、治疗、用药建议。
- 心脏结构的解剖命名遵循研究仓库 2026-11-20 的标签纠正结论；本项目结构表独立生成，**不复用** `target_labels.py` 的别名→整数映射（该映射与纠正声明冲突）。

## 6. 发布前检查清单

- [ ] 复核 `openanatomy.jp` 与 DBCLS 的许可表述差异，定稿派生资产许可
- [ ] 补齐 §2 的下载日期、版本、文件清单
- [ ] 页面可见区域确认出现 BP3D 署名原文与用途声明
- [ ] `NOTICE.md` 与页面署名文本一致
- [ ] 抽查公开页面源码，确认不含 FMA ID、真实病例编号、个人材料
- [ ] `git ls-files` 抽查，确认无影像/权重/原始包入库
