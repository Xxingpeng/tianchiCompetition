# NOTICE · 资产来源、生成方式与许可判定

> 本文件是作品的合规留痕。任何进入公开演示页面的第三方内容，都必须在此列出来源与许可依据。
> 状态：**已生成（2026-11-24，BP3D 正式路线）**。`public/assets/` 现由 `assets_raw/bp3d_manifest.json` 绑定的 BodyParts3D Release 4.0 OBJ 生成，`provenance_mode = bp3d`；左心耳为自制几何，逐条来源见 `structures.json` 的 `provenance` 字段。

## 1. 演示资产总览

| 资产 | 路径 | 当前来源 | 许可 | 状态 |
|---|---|---|---|---|
| 结构目录 | `public/assets/structures.json` | 本项目 `tools/asset_pipeline` 生成（9 结构） | 本项目原创 | 已生成，`provenance_mode = bp3d` |
| 三视图示意底图 | `public/assets/slices/*_base.png`（27 张 = 9 结构 × 3 视图） | 由 BP3D 派生的统一标注体素渲染 | 本项目演绎作品（BP3D 派生） | 已生成 |
| 高亮 overlay | `public/assets/slices/*_overlay.png`（27 张） | 由同一份体素渲染 | 同上 | 已生成 |
| 3D 网格 | `public/assets/meshes/*.glb`（9 个，合计 3925.9 KiB） | 8 个由 BP3D OBJ 体素化后重提取表面；`lxa.glb` 为自制 | 见 §2 | 已生成 |
| 左心耳网格 | `public/assets/meshes/lxa.glb`（47.5 KiB） | 本项目自制几何（BP3D 未收录该部件），按 BP3D 左心房体素包围盒贴附 | 本项目原创 | 已生成 |

体积实测（构建期校验门禁，阈值：单文件 2 MB / 网格合计 8 MB）：切面 64.8 KiB + GLB 3925.9 KiB + JSON 13.2 KiB ≈ **3.91 MB**。最大单文件 `myo.glb` 1816.4 KiB，占单文件阈值 91%——心室壁是唯一的厚壳部件，改大 `--grid` 或改小 `--spacing` 会先撞这条线，届时用 `--mesh-step` 抽稀而不是抬阈值。

BP3D 部件与文件名的对应（`verified: true` 表示已与下载包实际文件名逐个核对）见 `assets_raw/bp3d_manifest.json`，其中 `myo` 取 BP3D 的 *wall of ventricle*（FMA13884 / BP7815）——BP3D 没有 myocardium 独立词条，页面文案已按此说明。

## 2. BodyParts3D（主要三维几何来源）

- **项目**：BodyParts3D，由 Database Center for Life Science（DBCLS）/ NBDC 维护
- **版本 / 包**：Release 4.0，`isa_BP3D_4.0_obj_99.zip`，142,903,898 字节，**下载日期 2026-11-24**
  来源 `https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip`
- **许可判定**：在**权利主体**存档（DBCLS / LSDB Archive）随包 `README_e.html` §3 License（页面记载 2025-02-25 更新）核实为 **CC BY 4.0 International**，明确允许再分发与演绎作品。本项目的切片与 GLB 属演绎作品。
- **署名原文（必须随页面可见）**：
  > BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International
- **坐标核对**：实测 BP3D 轴向与本项目 `[左右, 前后, 上下]` 同号（+左 / +后 / +上），单位 mm，**无需轴翻转**；全部部件共用一次均匀缩放 + 平移，因此相对解剖位置完整保留（本次变换 `scale=1.1556`，`offset=[52.9, 219.9, -1350.5]`）。
- **网格完整性**：BP3D 发布网格自带个位数针孔（`myo_FJ2428.obj` 实测 7 条边界边），远小于 1.6 mm 体素尺度，不会让奇偶填充漏出实体；构建器对边界边的上限是 64 条，用来拦下载截断/整片面缺失这种成百上千条的量级，而不是要求为 0。
- **本地处理**：原始解压包约 480 MB（整包 3.6 GB 只取筛选后的 8 个 OBJ），全部放在 `assets_raw/` 下并被 `.gitignore` 排除，**不进入 Git**；入库的只有 `assets_raw/README.md` 与 `bp3d_manifest.json`。

## 3. 已排除的数据集与原因

| 数据集 | 排除原因 |
|---|---|
| MM-WHS 2017（研究用真实心脏 CT） | 原始病例数据授权范围无法确认；作品需公开发布，隐私风险不可接受 |
| Medical Segmentation Decathlon | 许可实为 **CC-BY-SA 4.0**（社区常误记为 CC-BY），copyleft 传染面更大 |
| KiTS | **CC BY-NC-SA**，禁止商业使用，不适合作为公开参赛作品资产底座 |
| Z-Anatomy | 含真人影像，同上 |
| FMA（Foundational Model of Anatomy） | **许可无法核实**：`fma.org` 不可达、OCLC 镜像下载返回 402。因此页面**不转载 FMA 的别名表与父子关系表**，也不声称数据来自 FMA。`bp3d_manifest.json` 里逐条的 `fma`/`bp` 编号是**出处引用**，其取值直接抄自 BP3D 随包发布的 `isa_parts_list_e.txt` / `isa_element_parts.txt`（CC BY 4.0），不构成对 FMA 数据集的再分发；页面本身不展示这些编号 |

## 4. 生成方式（可复现）

```bash
# 所有 Python 执行都在 conda env `tianchi`（Python 3.11.18），不碰研究环境 FMA
# 命令一律用该环境的可执行文件；`conda run` 会重编码 stdout，中文报告在控制台变乱码
PY=/d/Anaconda_envs/envs/tianchi/python.exe
RUFF=/d/Anaconda_envs/envs/tianchi/Scripts/ruff.exe

# 正式路线：assets_raw/bodyparts3d/ 里放好筛选后的 BP3D OBJ，文件名已写进 assets_raw/bp3d_manifest.json
PYTHONIOENCODING=utf-8 "$PY" -m tools.asset_pipeline.build \
    --source bp3d --grid 96 --spacing 1.6 --out public/assets --force

# 兜底路线：干净 runner 上没有原始包时用它跑通全链路；产物会在 structures.json 里
# 标 provenance_mode = procedural_fallback，页面如实显示来源，绝不冒充 BP3D
PYTHONIOENCODING=utf-8 "$PY" -m tools.asset_pipeline.build \
    --source procedural --grid 96 --spacing 1.6 --out public/assets

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

- [x] 复核许可表述差异：以权利主体存档（DBCLS/LSDB Archive）随包 `README_e.html` 为准，**CC BY 4.0**；`openanatomy.jp` 历史页面的 CC-BY-SA 2.1 JP 是旧版表述，不再作为依据
- [x] 补齐 §2 的版本、下载日期、包大小与文件名核对结论（`assets_raw/bp3d_manifest.json`）
- [x] 页面可见区域确认出现 BP3D 署名原文与用途声明（2026-11-24 `vite preview` 浏览器实测：页脚两行均在，控制台无报错）
- [x] `NOTICE.md` 与页面署名文本一致（`structures.json` 的 notice 行与本文件 §2 署名原文逐字符相等）
- [ ] 抽查公开页面源码，确认不含 FMA ID、真实病例编号、个人材料
- [ ] `git ls-files` 抽查，确认无影像/权重/原始包入库
