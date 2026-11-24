# PROGRESS · 解剖智绘 〔本项目活记忆 · 状态机〕

> **作用**:这是项目的"存档点"。任意 AI、任意重启会话,读它即可知道当前做到哪、下一步做什么、踩过什么坑。
> **更新时机**:每完成一个有意义步骤、每次会话结束前。
> **格式要求**:时间倒序,最新在上;短、准、可接力。

---

## 当前状态 (最后更新: 2026-11-24 · by Qoder)

- **阶段**:`开发` —— 六步交付流程**第③步（本地实现 + 自测）**,M1/M2/M3 均已完成并推送,下一步 M4 前端单页功能
- **上一步完成**:
  - **M1 前端工程骨架**（Vite 8 + React 19 + TS 6 + Vitest 5,Three.js 依赖已就位待 M4 使用）:
    - 门禁实测:`npm ci` → `prettier --check .` → `eslint .` → `tsc --noEmit` → `vitest run`（**16 passed / 3 files**）→ `vite build`（JS 224.12 KiB,gzip 70.92 KiB,远低于首屏 3 MB 闸）全绿。
    - 浏览器实测（`vite preview` + 真实 `public/assets/structures.json`）:渲染出 9 个结构、逐条来源（8 条 `BP3D / *_FJ####.obj` + 1 条"自制几何（BP3D 未收录 lxa）"）、用途声明与 BP3D 署名原文均可见,控制台无报错。
    - `.github/workflows/ci.yml` 只有 CI（`web` + `asset-pipeline` 两个 job),无任何 `SSH_*`、无部署步骤。
    - 干净 checkout 可复现性已验证:删掉 `node_modules` 后 `npm ci` 重装,六道门禁与构建仍全绿（US-1 AC4）。
  - 项目书就地修订完成并备份（见里程碑）。
  - `gh repo clone Xxingpeng/tianchiCompetition` → `F:\天池赛\tianchiCompetition`;`main` 已有引导提交 `7493745`。
  - 开发分支 `feature/1-anatomy-sketch-demo` 已切出并**已推送到 origin**（`871450c` 管线 / `355e429` 兜底资产 / `bbed3c6` standards / `593921e` 管线改 BP3D / `1ec6e36` 资产重生成 / `8374d78` 文档与许可）。
  - **BP3D Release 4.0 已下载并逐个核对**:`isa_BP3D_4.0_obj_99.zip`（142,903,898 B）→ 8 个心脏部件 OBJ 放入 `assets_raw/bodyparts3d/`（gitignored）,`bp3d_manifest.json` 全部 `verified: true`,只有左心耳留空并标"BP3D 未收录"。
  - **许可阻塞项已解除**:权利主体存档随包 `README_e.html` §3（2025-02-25 更新）为 **CC BY 4.0**,允许再分发与演绎;`openanatomy.jp` 的 CC-BY-SA 2.1 JP 是旧版表述,不再作为依据。
  - **M2 Python 示意资产管线**:`tools/asset_pipeline/`（geom / voxel / bp3d / fallback / surface / glb / render / catalog / build 九个模块）+ 7 个测试文件。
    - 门禁实测:`ruff check tools/` 通过、`ruff format --check tools/` 通过、`pytest` **91 passed / 覆盖率 98.5%**（阈值 80%）。
    - 配置落在根 `pyproject.toml`（ruff line-length 100、中文全角标点豁免、pytest `pythonpath`+覆盖率阈值）,本地无需再设 `PYTHONPATH`。
  - **M3 资产已用正式几何重生成**（`--source bp3d --grid 96 --spacing 1.6`）:
    - `provenance_mode = bp3d`;9 结构全部落地（8 个 BP3D + 1 个自制左心耳）,`excluded` 为空。
    - 体积:切面 64.8 KiB + GLB 3925.9 KiB + JSON 13.2 KiB ≈ **3.91 MB**;单文件最大 `myo.glb` 1816.4 KiB（阈值 2 MB,已用 91%,再加密体素会先撞这条线）。
    - 视觉抽查通过:心室壁包住心腔、升主动脉轴位为圆断面、冠/矢状位为竖条带;自制左心耳与左心房之间留有一格空隙（规则"绝不覆盖 BP3D 体素",宁可小）。
- **下一步 (TODO 第一条)**:**M4 前端单页功能**（US-2 检索 → US-3 信息卡 → US-4 三视图 → US-5 GLB 3D → US-7 提示与署名 → US-8 可访问性/响应式）。
- **阻塞项**:
  1. **需人类动作**:M4 完成后批准提交/推送,并由 AI 开 PR（确认门 5）——AI 不 push、不合并。
  2. **需人类动作**:天池报名 + 组队 + 实名认证 + 阿里云大学生认证（截止前必须完成,否则无法评奖）。
  3. ~~BP3D 原始包待下载~~ ✅ 已完成（2026-11-24）。
  4. ~~BP3D 许可表述冲突~~ ✅ 已按权利主体存档定稿为 CC BY 4.0。
  5. **待核实**:FMA 许可无法确认（官网不可达、Bitbucket 下载 402）——已用"页面不展示 FMA ID、manifest 里的编号是从 BP3D 随包文件引用"规避,理由写进 `NOTICE.md` §3。

---

## 待办清单 (TODO,按优先级)

### P0 · 资格与仓库

- [ ] **人工**:天池赛项报名、组队、实名认证、阿里云大学生认证（全员）
- [x] **人工确认**本次 `standards/` + `.gitignore` 内容 → 允许首次提交（2026-11-24 已批准并推送）
- [x] `main` 最小引导提交 + 推送,并对 `git ls-files` 做泄露抽查（引导提交 `7493745`;抽查无影像/权重/原始包）
- [ ] 开启 `main` 分支保护（要求 PR + CI 通过）—— **需人类在 GitHub 设置里操作**

### P0 · 资产与许可

- [x] 下载 BP3D Release 4.0 OBJ 包,把候选结构文件放进 `assets_raw/bodyparts3d/` 并记录版本（2026-11-24,`isa_BP3D_4.0_obj_99.zip` / 142,903,898 B）
- [x] 复核 `openanatomy.jp` 与 DBCLS 的许可表述,定稿署名文本与派生许可:以权利主体随包 `README_e.html` 为权威 → **CC BY 4.0**
- [x] 新建 conda env **`tianchi`**（Python 3.11.18），锁定 `requirements-asset.txt` / `requirements-dev.txt`；**决定不用 trimesh**，几何与 GLB 全部纯 numpy 自实现
- [x] 定稿 9 个候选结构（含"左心耳自制"）；`assets_raw/bp3d_manifest.json` 文件名已逐个核对（8 条 `verified: true`,左心耳如实留空）
- [x] 跑通"几何 → 统一体素 → 三视图 → GLB → structures.json → 构建期校验"全链,**当前产物即 BP3D 路线**;程序化几何退居 CI/离线兜底,产物来源逐条标注
- [x] 完善 `NOTICE.md`:逐资产写来源、生成命令、许可判定（含 BP3D 包版本/下载日期/变换参数/针孔说明）

### P0 · 工程

- [x] 从 `main` 开 `feature/1-anatomy-sketch-demo`:Vite + React + TS + Three.js 骨架（2026-11-24,M1 完成,`npm ci` 后门禁全绿）
- [x] 写 `.github/workflows/ci.yml`（**只有 CI,无 SSH/CD**;`web` + `asset-pipeline` 两个 job,Actions 首跑待 M5 提 PR）
- [x] 实现 `structures.json` schema 与构建期一致性校验（五项缺一即失败,见 `catalog.validate_catalog`）
- [x] `tools/asset_pipeline/` 骨架 + pytest 用例（91 passed / 覆盖率 98.5%）

### P1 · 功能

- [ ] US-2 检索 → US-3 信息卡 → US-4 三视图 → US-5 3D 网格 → US-8 体验打磨
- [ ] US-9 发布到 Qoder Sites,回填公开 URL

### P2 · 收尾

- [ ] 作品帖五段必填内容 + 对帖内每条事实做一次复核
- [ ] 每完成一个模块更新本文件（确认门 3）

---

## 关键决策记录 (ADR)

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-11-24 | 新建 conda env **`tianchi`** 承载本项目全部执行；**不引入 trimesh**，OBJ 解析/体素化/GLB 写出用纯 numpy 自实现 | 用户明确要求项目与研究环境隔离；少一个外部二进制依赖，公开仓库更干净、单测可直接覆盖几何代码 |
| 2026-11-24 | 演示**不使用真实病例影像**，改用公开许可的示意解剖资产，且**先用程序化隐式几何跑通全链** | 原始病例数据授权范围无法确认，赛题要求公开发布；BP3D 下载与对齐是耗时项，先用零许可风险的自作几何让站点当天可用，再按同源替换接入 BP3D 网格 |
| 2026-11-24 | 示意资产来源定为 **BodyParts3D（CC BY 4.0）+ 自建补漏（左心耳）** | BP3D 由 DBCLS/NBDC 管理、许可可在权利主体处核实;KiTS（BY-NC）与 Z-Anatomy（含真人影像）排除;MSD 实际是 **CC-BY-SA 4.0**（常被误记为 CC-BY）,copyleft 传染面更大 |
| 2026-11-24 | **Actions 只做 CI,CD 改走 Qoder Sites**;不配置 `SSH_*` Secrets | 赛题硬性要求评委入口是 Sites 公开 URL,压缩包/本地演示不计分;标准 `05` §3 的 SSH+Docker 部署链不适用（偏离已写入 `00` §7） |
| 2026-11-24 | **BP3D OBJ 是默认几何路线,程序化几何只作离线/CI 兜底**;两条路线的产物在 `structures.json` 里逐条标 `provenance`,页面如实显示来源 | 用户方向修正:不再出现"最终替换 BP3D"的说法。兜底几何的价值是让干净 runner 在没有原始包时仍能验证全链路,而不是冒充正式资产 |
| 2026-11-24 | BP3D 派生资产许可定稿 **CC BY 4.0**,以权利主体存档随包 `README_e.html` §3（2025-02-25 更新）为准 | DBCLS/LSDB Archive 是发布方,`openanatomy.jp` 的 CC-BY-SA 2.1 JP 属旧版页面表述;两处不一致已留证并在 `NOTICE.md` §2 说明 |
| 2026-11-24 | 体素冲突判据从"总体积比例预算"改为**按部件自身的被吞比例**（0.35）+ 预算兜底 | 相邻部件表面穿插是真实解剖（主动脉穿左心室腔口约吃掉主动脉 15%）,按总体积设阈值既误报又漏报;抬阈值会同时放过错位,改判据才两全 |
| 2026-11-24 | 项目书**就地改原文件并保留 `.bak-20261124` 备份** | 保持单一权威文档,避免版本分叉 |
| 2026-11-24 | 前端**不复用** `target_labels.py` 的别名→整数映射,结构表由资产管线独立生成 | 该表与 2026-11-20 标签纠正声明冲突,复用会把"左心室"指向心肌 |
| 2026-11-24 | 三视图与 3D 网格**从同一份统一体素派生** | 保证 UI 与几何完全一致,避免"图与模型对不上" |
| 2026-11-24 | 资产体积门禁:单个 GLB ≤ **2 MB**、全部网格合计 ≤ **8 MB**、首屏非网格资源 ≤ **3 MB** | 静态托管与评委侧网络可接受;超限先减面而不是砍结构 |
| 2026-11-24 | 前端测试环境 jsdom 钉 **`^29.1.1`**,`engines.node` 抬到 **`>=22.13.0`** | jsdom 30+ 的 `engines` 下限 22.22.2 与本机 Node 22.14 冲突,崩在 undici 的 zstd 分支上;钉住次新大版本比升级用户工具链或用 `--force` 更可控,且本地与 CI 用同一份 lockfile |

---

## 已知坑 (GOTCHAS)

- **心脏标签映射三处互相矛盾**:README 的 2026-11-20 纠正声明写 `3=左心室`,而 `src/fma_seg/text/target_labels.py:13-23` 与 `configs/mmwhs_fma_clip_swinunetr.yaml:74` 仍写 `1=LV`。影响:任何复用旧解析器的页面会把"左心室"高亮到心肌。解决:本项目结构表自生成、不导入该模块;验证:页面搜"左心室"高亮的是左心室腔。
- **研究仓库的 `render_labels.py` 硬编码 `D:\codex\project002_ascii_runtime\...`**:换机/换盘即失效。解决:演示资产完全在新仓库的 `tools/` 重写,不引用旧脚本。
- **可视化代码不可直接复用**:`segmentation.py` 用 `affine=np.eye(4)` 丢掉空间信息、只取 `d//2,h//2,w//2` 中心层、输出 1×3 静态 PNG,不满足单结构透明叠加需求;小结构可能不在中心层。解决:切面取结构质心层,资产离线生成。
- **大文件误提交风险极高**:研究目录含约 16 GB MM-WHS、4.7 GB 颅内血管、251 个 `.pt`、2,772 个 `.nii.gz`;BP3D 的 OBJ 包实测 142.9 MB、解压 479.6 MB。仓库是**公开**的,一旦 push 很难彻底清除。解决:`.gitignore` 先落地;原始包与解压件只放 `assets_raw/`（该目录整体排除,只反向放行 `README.md` 与 `bp3d_manifest.json`）;每次提交后 `git ls-files` 抽查。
- **许可易记错**:Medical Segmentation Decathlon 常被写成 CC-BY 4.0,实为 **CC-BY-SA 4.0**。解决:项目书 §6.1 已按权利主体页面更正并留证。
- **FMA 无法核实**:`fma.org` 不可达、OCLC 镜像下载返回 402。解决:公开页只展示解剖术语文本,不转载 FMA ID 与关系表;项目书附录 B 仅作内部记录。
- **天池资格项易漏**:实名认证与阿里云大学生认证是**评奖前置条件**,与作品质量无关。解决:列入 P0 TODO 第一条人工项。
- **`git push` 偶发网络抖动 / Windows GBK 控制台**:`05` §7 已记;脚本输出保持纯 ASCII,必要时 `PYTHONIOENCODING=utf-8`。
- **`conda run -n tianchi python -m ...` 会把中文报告重编码成乱码**（即使已设 `PYTHONIOENCODING=utf-8`,conda 的 stdout 捕获仍按 GBK 转一遍）。脚本本身没问题:直接调用 `D:\Anaconda_envs\envs\tianchi\python.exe` 时输出正常。解决:文档与本地自检一律写"用环境内 `python.exe` / `Scripts\ruff.exe`",与 `00` §4 一致。
- **中文全角标点会让 ruff 红灯成灾**:RUF001/002/003 把注释与报错信息里的 `，；：（）` 判为"易混淆字符",一次报出 379 条。解决:`pyproject.toml` 里 `ignore = ["RUF001","RUF002","RUF003"]` 并注明原因,而不是删中文。
- **兜底几何参数写成 6 元组**:`(*_LA, dx, dy, dz)` 想表达"中心 + 偏移",实际拼出 6 个分量;`capsule` 当场广播报错,而 `ellipsoid` 只读前三个分量,于是**偏移静默失效**、图看起来正常但位置错。解决:`fallback._as3()` 在构造期硬校验分量数,统一用 `_pt(base, dx, dy, dz)` 写相对坐标;验证:`test_as3_rejects_wrong_component_count`。
- **体素化三根轴的边界归属必须同一套规则**:投射轴用半开区间,扫描线填充上界若用 `floor`,整数对齐的盒子会多算一格（4×3×3=36 而不是 27）。解决:上界改 `ceil - 1`;验证:`test_voxelize_is_axis_invariant_for_a_box` 对三根轴逐一比对解析解。
- **开口 OBJ 不能直接体素化**:奇偶填充会把两块面片之间围成实体,产出一张"看着正常但完全错误"的解剖图（4 个面片就填出 1000 体素）。解决:`geom.boundary_edges()` 在 `bp3d.load_meshes` 入口拦下,先去重顶点再查封闭性;**但阈值不能是 0**——BP3D 发布网格自带个位数针孔（心肌 `FJ2428` 实测 7 条,且不是去重造成的）,要求为 0 会把正式几何全挡在门外。定 `MAX_OPEN_EDGES = 64`:针孔放行,下载截断/整片面缺失（成百上千条）报错。验证:`test_load_meshes_tolerates_a_few_pinholes`、`test_load_meshes_rejects_open_obj`、`test_load_meshes_accepts_obj_with_duplicated_vertices`。
- **"按体素盒总体积"的冲突预算没有解剖含义**:BP3D 心脏实测主动脉穿出左心室腔口会吃掉主动脉约 15% 体素,而按总体积 1.2‰ 设的预算当场报"冲突 1543 超预算 1061"。当时的省事做法是抬阈值,但那会同时放过真正的错位。解决:主判据改为**按部件自身的被吞比例**（`MAX_LOSS_RATIO = 0.35`）,预算只作"整体糊在一起"的兜底;两道闸各有用例。验证:`test_assign_labels_reports_swallowed_parts_by_ratio`、`test_build_label_volume_raises_when_total_overlap_is_unreasonable`。
- **自制部件不能写死坐标**:BP3D 没有左心耳词条,自作几何若沿用兜底模型的中心数,接上 BP3D 后会飘到别处。解决:`fallback.auricle_from_la()` 以 BP3D 左心房**体素包围盒角**为锚,并 `mask &= volume == 0` 只取空格,宁可做得更小。验证:`test_auricle_is_anchored_to_the_la_mask_not_to_hardcoded_numbers`（平移 la 掩码,耳同步平移）、`test_self_made_part_never_overwrites_bp3d_voxels`。
- **`--out` 指到非 `assets` 目录会让校验全线假报"未落盘"**:清单存站点相对路径 `assets/...`,校验按 `root = out.parent` 解析;曾把产出指到临时目录,63 项全红,而资产本身没问题。解决:`build.main` 硬约束 `--out` 必须以 `assets` 结尾并给出原因。验证:`test_out_guard_requires_an_assets_dir`。
- **manifest 里的 FMA/BP 编号与"FMA 许可未核实"不矛盾**:编号取自 BP3D 随包 `isa_parts_list_e.txt` / `isa_element_parts.txt`（CC BY 4.0）,属出处引用而非再分发 FMA 数据集;页面不展示这些编号。理由已写进 `NOTICE.md` §3,别在仓库里留成"看起来违规"的悬案。
- **资产清单路径与写盘路径是两个坐标系**:`structures.json` 存站点相对路径 `assets/...`,磁盘上文件在 `public/assets/...`。曾按 `out / rel` 写盘,产出 `public/assets/assets/meshes/*.glb`。解决:写盘用 `out/meshes`,校验用 `root = out.parent`;验证:`test_procedural_build_passes_its_own_validation`、`test_missing_assets_are_reported`。
- **jsdom 30+ 在 Node 22.14 上让 vitest 起不了 worker**:`npx vitest run` 报 3 个 `[vitest-pool]: Failed to start forks worker`,真正原因是 `node_modules/undici/lib/interceptor/decompress.js` 里 `createZstdDecompress.bind(...)` —— 本机 Node 22.14.0 没有 `zlib.createZstdDecompress`,而 jsdom 30/31 的 `engines` 下限是 `^22.22.2`。npm 事先给过 EBADENGINE 警告但照样装上了。解决:**把 jsdom 钉在 `^29.1.1`**（`engines: ^22.13.0`,带的 undici 7.30.2 不走 zstd 分支）,并把 `package.json` 的 `engines.node` 提到 `>=22.13.0`;不改用户本机 Node、不用 `--force`/`--legacy-peer-deps`。CI 用 `node-version: "22"`（≥22.22）同样吃这个版本,本地与 CI 一致。
- **远端 `main` 不见了,默认分支被顶到 feature 分支**:`git ls-remote --heads origin` 只有 `feature/1-anatomy-sketch-demo`,`gh api .../branches/main/protection` 返回 404,仓库 `default_branch` 已是 feature 分支,本地 `main` 显示 `[origin/main: gone]`。影响:GitHub Flow 的 PR 目标缺失,`main` 分支保护也无从谈起。解决（2026-11-24 已按人工批准执行）:`git push origin main`（内容早已随 feature 分支公开,不新增对象）+ `gh repo edit --default-branch main`,现在 `ls-remote` 两条分支都在、`default_branch = main`。**仍未做**:`main` 分支保护（要求 PR + CI 通过）——需人工在 GitHub 设置里开,或用 `gh api` 代开。
- **待确认:git 身份邮箱**:当前提交内嵌 `898328775@qq.com`,仓库公开后可见。是否换成 GitHub noreply 邮箱由本人决定,AI 不改全局 git 配置。

---

## 里程碑 (DONE)

- [x] 2026-11-24 定位研究资产真实位置在 `D:\codex\project002_解剖本体文本引导3D医学分割`（工作区 `F:\天池赛` 原本无资产),并逐项核实:源码目录、33 份配置、109 个 run、指标 JSON、基线对比文件均存在;网格类资产为 **0**。
- [x] 2026-11-24 完成项目书就地修订:429 行 / 35,716 字节,原文件备份为 `.bak-20261124`（15,135 字节）。新增 §0 三处最重要变化、§6.1 许可判定表、§6.5 标签映射冻结、§6.6 公开仓库卫生、§11 对齐官方提交清单、§12 P0 待办、附录 A 证据索引。
- [x] 2026-11-24 规范落地与仓库初始化:读完 `开发规范standards/standards-template` 全部 11 个文件并把六步流程/确认门纳入 TODO;克隆空仓库 `tianchiCompetition` 并复制 `standards/`;填好 `standards/00`（含对 `05`/`03` 的两处已确认偏离）、`standards/01`（US-1~US-9 带 Given/When/Then 验收）、`standards/PROGRESS.md`;落 `.gitignore`、根 `README.md`、`NOTICE.md` 骨架。
- [x] 2026-11-24 **M2 · 资产管线**:`tools/asset_pipeline/` 九个模块（`geom`/`voxel`/`bp3d`/`fallback`/`surface`/`glb`/`render`/`catalog`/`build`）+ 7 个测试文件 82 用例,覆盖率 98.3%。三视图与 GLB 共用一份标注体素;切面取结构最密层;开口 OBJ、坐标错位、超预算冲突全部在构建期硬失败。
- [x] 2026-11-24 **M3 首版 · 资产产出**:程序化兜底路线生成 `public/assets/`（9 结构 × 3 视图 × 底图+overlay = 54 PNG、9 GLB、`structures.json`）,合计 ≈1.25 MB,单文件最大 451.9 KiB,构建期自校验通过,`provenance_mode` 如实标为 `procedural_fallback`。
- [x] 2026-11-24 **BP3D 正式几何接入**:下载 `isa_BP3D_4.0_obj_99.zip`（142,903,898 B）,按 `isa_parts_list_e.txt` / `isa_element_parts.txt` 逐个核对文件名并写进 `bp3d_manifest.json`（8 条 `verified: true`;心肌取 *wall of ventricle* FMA13884/BP7815;肺静脉取 *trunk of pulmonary vein*;左心耳确认 BP3D 无词条）。实测轴向与本项目同号、无需翻转。
- [x] 2026-11-24 **M3 重生成 · BP3D 路线**:`--source bp3d --grid 96 --spacing 1.6` → 8 部件共用变换 `scale=1.1556 offset=[52.9, 219.9, -1350.5]`,自制左心耳 1616 体素,9 结构全部可用、`excluded` 为空,合计 ≈3.91 MB,构建期自校验通过;视觉抽查确认心室壁包心腔、主动脉断面形态正确。
- [x] 2026-11-24 **许可阻塞项解除**:在权利主体存档随包 README 核实 BP3D 为 **CC BY 4.0**（允许再分发与演绎）,`NOTICE.md` §2/§6 与项目书 §6.1 同步定稿署名原文。
- [x] 2026-11-24 **门禁补齐**:pytest 由 82 → **91 用例 / 覆盖率 98.5%**,新增开口面片容忍度、按部件吞没比例、预算兜底、自制部件锚定与不覆盖、`--out` 目录约束等判据用例;`ruff check` / `ruff format --check` 全绿。
- [x] 2026-11-24 **BP3D 工作树提交并推送**（人工批准）:`593921e` 管线改 BP3D 默认源 / `1ec6e36` 资产重生成 / `8374d78` 文档与许可;`feature/1-anatomy-sketch-demo` 已在 origin。
- [x] 2026-11-24 **M1 · 前端工程骨架 + CI**:Vite 8 + React 19 + TS 6 + Vitest 5 + ESLint 10 flat config + Prettier 3。`src/types.ts` 与 `src/data/catalog.ts` 把 `structures.json` 的 schema 变成运行期硬校验（schema 版本、9 个 label 唯一、`#rrggbb`、三视图路径、体积>0、声明必须含"示意"）,一次收集全部问题;`App.tsx` 有 loading/error/ready 三态、skip-link、`role="status"`/`role="alert"`。门禁:`npm ci` → prettier → eslint → tsc → **vitest 16 passed** → `vite build`（JS 224.12 KiB / gzip 70.92 KiB）。浏览器实测真实目录:9 结构 + 逐条来源 + BP3D 署名与用途声明可见,控制台无报错。
- [x] M1 骨架的工作树提交并推送（人工批准 → `2858ff8` 前端骨架 / `b72443c` CI / 本条 docs 提交）
- [x] 远端 `main` 与默认分支修复（人工批准 → `git push origin main` + `gh repo edit --default-branch main`）

> 反臃肿:里程碑超过 15 条时,把更早内容合并成一行摘要,保持本文件可快速阅读。
