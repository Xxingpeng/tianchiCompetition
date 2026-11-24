# 01 · 需求 / 活 PRD 〔本项目活记忆 · AI 维护〕

> **作用**:这是本项目唯一的需求文档。所有新功能、缺陷、技术债都追加到这里,不要另起多个 PRD 文件。
> **更新时机**:每次有新需求、需求变更、验收标准变化时更新。
> **最后更新**:2026-11-24 · by Qoder（需求基线来自项目书 §4/§5/§8,并按当日确认的"示意资产 + Qoder Sites"路线改写）

---

## 1. 需求来源

| 类型 | 来源 | 进入方式 |
|---|---|---|
| 功能需求 Feature | 参赛者本人 / 赛题要求 / 评审维度 | 写成用户故事 |
| 缺陷 Bug | 本地自检 / CI / 人工试用 | 写复现步骤和期望结果 |
| 技术债 Tech Debt | 开发 / Review / CI 故障 | 写影响和修复目标 |

上游文档:项目书 `03_Outputs/2026_Qoder_高校创造力大赛_项目书_解剖智绘.md`（§8 为验收基线,§6 为许可与数据边界基线）。

---

## 2. Issue 生命周期

| 阶段 | 状态 | 动作 |
|---|---|---|
| 提出 | Open | 写清场景、目标、验收标准 |
| 排期 | Backlog / Todo | 决定优先级和负责人 |
| 开发 | In Progress | 从 main 开 feature 分支 |
| 评审 | In Review | 提 PR,等待 CI 和 Review |
| 合并 | Done | PR 合并（由人类执行）,自动关闭 Issue |
| 验收 | Verified | 按验收标准在公开 URL 上确认 |

**追踪规则**:分支名带 Issue 号,PR 描述写 `closes #<编号>`。

---

## 3. 用户故事模板

```text
### US-<编号> <一句话标题> · 状态: Backlog
作为 <角色>,
我想要 <能力>,
以便 <价值>。

验收标准:
- AC1: Given <前提>,When <动作>,Then <可验证结果>。
- AC2: <补充标准>

技术备注:
- <可选:约束、边界、风险>
```

---

## 4. 需求清单

### US-1 工程初始化与 CI 门禁 · 优先级 P0 · 状态: 已完成（2026-11-24，`npm ci` 后本地六道门禁全绿；Actions 首跑已在 M5 的 pull/1 验证,两个 job 全 pass）

作为 **项目开发者**,
我想要 仓库具备可复现的前端工程骨架、资产脚本目录与 CI 门禁,
以便 后续每个功能都能自动检查,不靠手动验证。

验收标准:
- AC1: Given 仓库已初始化,When 检查 `main`,Then `main` 上只有引导提交（`.gitignore`、`README.md`、`NOTICE.md` 占位、`standards/`）,真实开发全部走 `feature/*` 分支 + PR。
- AC2: Given 一条 `feature/*` 分支提交 PR,When Actions 运行,Then 依次执行 `npm ci`、`prettier --check`、`eslint`、`tsc --noEmit`、`vitest run`、`vite build`,以及 `ruff format --check tools/`、`ruff check tools/`、`pytest --cov --cov-fail-under=80 tools/asset_pipeline/tests`。
- AC3: Given 本地开发机,When 运行门禁,Then 全部命令可在**没有 Docker** 的前提下执行完成。
- AC4: Given 一次干净 checkout（`git clean -fdx` 后 `npm ci`）,When 运行构建,Then 不依赖仓库外的任何路径即可成功。
- AC5: 完成后更新 `standards/PROGRESS.md`。

技术备注:
- **本仓库的 CD 不走 GitHub Actions**（见 `00` §7 偏离 1）,故本条不含"合并后自动部署 + 健康检查";发布在 US-9 由 Qoder Sites 完成。
- `.gitignore` 必须**先于**首次提交落地;首次提交后立即做泄露抽查（`git ls-files` 中不得出现影像/权重/原始包）。

### US-2 结构目录与检索 · 优先级 P0 · 状态: 已完成（2026-11-24，`src/data/search.ts` + `StructurePicker`,浏览器实测中/英/别名与空态;AC5 上限 8 条）

作为 **医学学习者**,
我想要 输入中文结构名、英文名或常见别名就能定位到结构,
以便 不必记忆系统命名也能找到要看的结构。

验收标准:
- AC1: Given `public/assets/structures.json` 至少含 8 个结构,When 打开页面输入"左心室",Then 候选列表出现该结构并可选中。
- AC2: Given 输入英文 `left ventricle` 或别名,When 检索,Then 命中同一条记录（匹配覆盖 `name`、`en_name`、`aliases`）。
- AC3: Given 输入不存在的字符串,When 检索,Then 显示"未收录"空态而不是空白页或报错。
- AC4: Given 已收录但网格缺失的结构,When 页面加载目录,Then 该结构被标记为不可用并从可选列表剔除,同时构建日志输出缺失清单。
- AC5: Given 只输入一个字符,When 检索,Then 结果数量有上限,列表不滚动卡顿。

技术备注:
- 检索为纯前端内存匹配（数据量 ≤ 几十个结构）,不接后端、不调用模型。
- 结构表由资产管线生成,**不得**从 `target_labels.py` 导入映射。

### US-3 解剖信息卡 · 优先级 P0 · 状态: 已完成（2026-11-24，`InfoCard` 用 `<dl>` 呈现 name/en_name/description/parent + 来源与体素数;构建期与运行期都拒绝空字段）

作为 **医学学习者**,
我想要 看到结构的中文名、英文名、一句学习说明和一条上级关系,
以便 立刻知道"这是什么、在哪个系统里"。

验收标准:
- AC1: Given 选中任一可用结构,When 页面渲染,Then 信息卡显示 `name`、`en_name`、`description`、`parent` 四项且非空。
- AC2: Given `description`/`parent` 缺失,When 构建,Then 构建失败（对应 `00` §4 内容一致性门禁）。
- AC3: Given 卡片文案,When 人工通读,Then 不含诊断、治疗、用药建议,不含"本图来自某某患者"类表述。

技术备注:
- 上级关系只写**一条**通用解剖学表述（如"心腔之一,位于左房下方"）,不转载 FMA 关系表。

### US-4 三视图示意切面 + 高亮 overlay · 优先级 P0 · 状态: 已完成（2026-11-24，`TriView` 三视图 base+overlay 叠放、图例纯文字、可关高亮;切面取最密层由 M2 管线保证）

作为 **医学学习者**,
我想要 同时看到同一结构的轴位、冠状位、矢状位示意切面且目标结构被高亮,
以便 建立"名称—切面位置"的对应。

验收标准:
- AC1: Given 选中结构,When 页面渲染,Then 三个视图各显示一张示意灰度底图 + 一层半透明高亮,且高亮形状与底图结构位置一致。
- AC2: Given 三张视图,When 查看,Then 每张都标注视图名（轴位/冠状位/矢状位）与色块图例,不要求用户猜颜色。
- AC3: Given 切换结构,When 重新渲染,Then 三张图与 3D 网格同时更新为同一结构（同源体素保证一致）。
- AC4: Given 目标结构不在中心层面,When 生成资产,Then 切面取该结构**质心所在层面**,而不是固定体积中心。

技术备注:
- 资产离线生成,前端只做图像合成,不在浏览器里做体素运算。
- 底图为**模板化示意灰度**,不是任何真实 CT/MR 像素。

### US-5 轻量 3D 网格查看 · 优先级 P0 · 状态: 已完成（2026-11-24，`MeshViewer` GLTFLoader + OrbitControls,懒加载 chunk 639.88 kB;无 WebGL 局部降级有用例;单个 GLB 最大 1816.4 KiB、合计 3.91 MB,阈值见 `PROGRESS.md` ADR）

作为 **医学学习者**,
我想要 旋转和缩放目标结构的 3D 网格,
以便 理解它在三维空间里的真实形态与毗邻。

验收标准:
- AC1: Given 选中结构,When 3D 区域加载,Then 对应 GLB 在 2 秒内（本地网络）显示,可拖拽旋转、滚轮/按钮缩放。
- AC2: Given 无 WebGL 或加载失败的环境,When 渲染,Then 显示占位提示与文字说明,页面其余部分仍可正常使用。
- AC3: Given 提交的 GLB 资产,When 检查体积,Then 单个文件 ≤ 2 MB,全部网格合计 ≤ 阈值（阈值记入 `PROGRESS.md`）。

技术备注:
- Three.js 原生 + GLTFLoader;网格来自体素化后 `marching_cubes` + 减面,保证与 US-4 的高亮同源。

### US-6 示意资产生成管线 · 优先级 P0 · 状态: 已完成（2026-11-24，BP3D 路线，本地门禁全绿）

作为 **项目开发者**,
我想要 一条可重跑、可审计的 Python 资产管线,
以便 三视图与 3D 网格来自同一份几何,并且换机器也能重建。

验收标准:
- AC1: Given `assets_raw/` 中已放置筛选后的 BP3D OBJ 文件,When 运行管线,Then 依次产出:标定对齐后的网格、统一标签体素、三视图底图+overlay、GLB、`structures.json`。
- AC2: Given 管线运行完成,When 检查产物,Then 所有结构共用同一体素网格（同 shape、同 affine）,三视图与 GLB 的空间关系一致。
- AC3: Given 单元测试覆盖网格加载、体素化、切面取层、`structures.json` 校验四类纯函数,When `pytest --cov-fail-under=80`,Then 通过。
- AC4: Given 任一结构的 OBJ 缺失或坐标系不匹配,When 运行,Then 明确报出该结构名并跳过,而不是产出错位资产。
- AC5: 管线**不读取** `D:\codex\project002_**` 下任何路径,全部输入路径通过参数或 `assets_raw/` 提供。

技术备注:
- **一律在 conda env `tianchi`（Python 3.11.18）执行**，不碰研究环境 `FMA`。依赖见 `requirements-asset.txt`（numpy 2.4.6 / scipy 1.17.1 / scikit-image 0.26.0 / pillow 13.0.0）与 `requirements-dev.txt`（pytest 9.2.0 / pytest-cov 7.1.0 / ruff 0.17.6）。
- **不引入 trimesh**：OBJ 解析、体素化、`marching_cubes`、GLB 写出全部由 `tools/asset_pipeline` 纯 numpy 自实现，减少外部二进制依赖。
- **几何来源分两层**:**BP3D OBJ 是默认路线**（已接入 Release 4.0,文件名逐个核对,产物 `provenance_mode = bp3d`）;**程序化隐式几何只作离线/CI 兜底**,用于干净 runner 上没有原始包时仍能验证"体素化 → 渲染 → 导出 → 校验"全链。两条路线的产物在 `structures.json` 里逐条标 `provenance`,页面如实显示来源,不互相冒充。
- BP3D 各部件共用一次均匀缩放 + 平移,实测轴向与本项目 `[左右, 前后, 上下]` 同号、无需翻转;仿射对位不再是不确定项。

### US-7 许可、署名与用途提示 · 优先级 P0 · 状态: 已完成（2026-11-24，页脚署名原文 + 用途声明实测可见,逐结构 `provenance` 原样渲染;`NOTICE.md` §6 复核完成;构建产物扫描无 FMA ID/病例编号）

作为 **评审者 / 使用者**,
我想要 在页面上直接看到数据来源、许可与用途边界,
以便 确认作品没有使用真实病例、也没有侵犯第三方权利。

验收标准:
- AC1: Given 打开页面,When 查看,Then 页面可见区域出现 BP3D 署名原文（`BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International`）。
- AC2: Given 页面,When 查看,Then 显著标注"示意模型,非真实病例影像、非模型推理结果"与教育用途声明。
- AC3: Given 仓库根 `NOTICE.md`,When 阅读,Then 含每项资产的来源、生成命令、许可判定、残留风险和 FMA 说明。
- AC4: Given 公开页面源码,When 检索,Then 不出现 FMA 数字 ID、父子关系表、真实病例编号（如 `ct_train_1015`）。

技术备注:
- 发布前必须复核 `openanatomy.jp` 与 DBCLS 的许可表述差异;若仍冲突,按 CC BY-SA 4.0 保守标注并同步改项目书 §6.3。

### US-8 单页展示体验与可访问性 · 优先级 P1 · 状态: 已完成（2026-11-24，单页"搜索—切面—3D";axe 0 违规、键盘路径 5 条用例;窄屏按下限 380px 内容宽实测无溢出,整页截图仍待人工在浏览器里看一次）

作为 **医学学习者**,
我想要 在一屏内完成"搜索—看切面—看 3D",并且界面清晰可读,
以便 不切换页面就能完成一次学习。

验收标准:
- AC1: Given 桌面宽度（≥1280px）与窄屏,When 打开页面,Then 布局不出现重叠、溢出或不可点击控件。
- AC2: Given 键盘操作,When 使用 Tab 进入搜索框并选择结构,Then 全程不依赖鼠标即可完成。
- AC3: Given 检查配色,When 评估高亮与灰度底图对比度,Then 高亮结构在灰度底图上肉眼可辨,且色盲用户可通过图例文字区分。
- AC4: Given 全部文案,When 通读,Then 无占位符文本（如 `<项目名称>`、`TODO`）残留。

### US-9 通过 Qoder Sites 公开发布并验收 · 优先级 P0 · 状态: Backlog

作为 **评审者**,
我想要 不登录、不解压任何文件,直接打开一个公开 URL 就能使用演示,
以便 按赛题要求完成体验。

验收标准:
- AC1: Given 未登录状态,When 用浏览器打开站点 URL,Then 返回 200 且首屏可用（不要求账号、不要求下载）。
- AC2: Given 页面加载完成,When 检查网络请求,Then `structures.json`、切面图、GLB 均 200 且渲染成功。
- AC3: Given 站点内容,When 抽查任意结构,Then 三视图、信息卡、3D 网格指向同一结构。
- AC4: Given 发布完成,When 查看项目书 §1 与 `00` §6,Then 已填写真实公开 URL。
- AC5: Given 参赛资格项,When 核对天池平台,Then 报名 + 组队 + 实名认证 + 阿里云大学生认证全部完成（否则作品可展示但无法评奖）。

技术备注:
- 发布由 Qoder 调用 Qoder Sites 工具链执行,合并 `main` 不会自动发布;这一步需要人类确认后触发。
- 发布后按 §5「故障反哺铁律」把结果写回 `PROGRESS.md`。

---

## 5. 非功能需求

- **安全与隐私**:密钥只进 Secrets,不进 Git。**不发布任何真实病例影像**;页面资产全部为示意几何渲染。个人证件、成绩单、简历等材料不得进入本仓库任何目录。
- **可发布性**:静态产物,评委无需安装依赖、无需登录、无需下载压缩包。
- **可复现**:资产管线在干净 checkout + `assets_raw/` 输入条件下可重跑;`NOTICE.md` 记录每条命令。
- **可维护**:一个需求一小 PR,分支默认保留。
- **可测试**:检索逻辑、`structures.json` 校验、资产管线必须有单测;UI 有冒烟测试。
- **性能**:首屏资源（HTML/JS/CSS/目录 JSON）控制在可接受体积,网格按结构懒加载。
- **合规留痕**:许可判定、无法核实项、保守处置,全部写在 `NOTICE.md` 与项目书 §6,不靠口头说明。
