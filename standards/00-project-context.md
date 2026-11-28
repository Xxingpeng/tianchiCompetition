# 00 · 项目上下文 〔本项目活记忆 · AI 维护〕

> **作用**:这是项目的"身份档案"。AI 接管项目时先读这里,了解项目目标、技术栈、目录、部署取值。
> **更新时机**:架构、技术栈、目录结构、端口、部署目录、重要约束变化时更新。
> **最后更新**:2026-11-27 · by Qoder（血液循环演示改为 Three.js 3D 心脏 + 剖面刀开腔，替换此前被否决的平面 SVG 方案；左栏改为透明帷幕内嵌式展签，结构名取各自解剖色；顶部加回无边框结构搜索（提示语沿用旧搜索「如：左心室 / left ventricle / LV」，支持编号与中英文名），索引/搜索选中会把部件转到正面追光）

---

## 1. 项目是什么

- **项目名称**:解剖智绘（Anatomy Sketch）· 仓库 `tianchiCompetition`
- **一句话目标**:让医学学习者在同一个页面里,把"解剖结构名称—切面位置—三维形态"三件事对上。
- **使用者/受益者**:医学、影像、护理等专业学生;学习基础断层解剖的学习者;需要快速展示结构空间关系的教育者。
- **核心功能**:
  - 帷幕内嵌式展签索引（左栏透明底直接铺在黑色舞台上,顶部无边框结构搜索（提示语「如：左心室 / left ventricle / LV」,输入编号或中英文名即切换,不弹候选列表）,编号 + 中文名 + 斜体英文名,结构名取各自的解剖色,点选或搜索即切换;从索引/搜索选中时 3D 把部件转到正面并追光;目录折叠开关已按用户要求删除）
  - 解剖信息卡（显示名、英文名、简短学习说明、一条上级关系）
  - 轴位/冠状位/矢状位三视图示意切面 + 目标结构高亮 overlay + 文字图例
  - 整颗心脏 3D（9 个部件同场景,悬停报名称、点选结构;体素风不透明黏土材质,未选中压暗,选中件以同色幽灵透出被遮挡部分;7° 右前斜机位,约 72 次/分轻微双搏动,可暂停并尊重减动效偏好）
  - 血液循环动态演示（全屏覆盖层：Three.js 3D 心脏,19 个部件含大血管与心腔,深蓝舞台;蓝/红粒子流沿肺循环与体循环路径流动,肺内蓝→红、组织处红→蓝;5 阶段时间轴自动循环,阶段跳转、暂停、重播、倍速、Esc）
  - 剖面刀开腔（滑杆或「打开心脏」按胸前向后切开前壁,局部裁剪平面露出四腔与瓣膜;「左心/右心」机位聚焦对应一侧并过滤标签;心房/心室按 6.4 s 心动周期缩放搏动,房室瓣与半月瓣按相位开合,粒子流量随瓣门变化）
  - 深蓝发光舞台（`.circulation` 覆盖层深蓝渐变 + 网格 + 暗角,心影高光,血流粒子光晕;全部为 WebGL 实时渲染,但心脏网格为示意几何）
  - 小心 · 心脏学习助手：右下角坐姿体素玩偶入口（进站气泡约 7 秒后消失、右上角 × 可提前关掉;点击打开面板,可拖动换位并记住位置;面板左缘调宽、上缘调高,均支持键盘方向键并记忆;久置约 45 秒朝最近的一侧（上/下/左/右）缩到屏幕外只留一小截,点击先恢复坐姿再开面板;待机跟心跳节律起伏、偶尔小跳,悬停/按压/拖动有反馈,3D 心跳暂停时安静下来）,问答覆盖解剖 + CT 概念 + 本站切面讲解,意图分流、检索来源常显、不提供医疗建议
  - 数据来源、许可与"仅用于学习展示"用途提示
- **输入/数据**:自制的静态示意资产——`structures.json` + WebP/PNG 切面 + GLB 网格。来源为 BodyParts3D（CC BY 4.0）派生几何 + 自制左心耳。
  - 助手知识库是 32 条改写资料（人卫《系统解剖学》《生理学》《诊断学》《医学影像学》《内科学》与国内指南,版权保留、仅事实引用 / 本站自述）,全部来源链接均为国内可访问站点,见 `NOTICE.md` §2a。
  - **不含任何真实病例影像,不含研究模型的推理输出。**
  - 衍生资产**进 Git**（实测合计约 3.9 MB、必须随站点发布）;BP3D 原始包与解压产物（OBJ 包 142.9 MB / 解压 479.6 MB）**不进 Git**,`assets_raw/` 整体排除、只反向放行 `README.md` 与 `bp3d_manifest.json`。
  - 详细许可依据与残留风险见项目书 §6 与本文件 §5。

## 2. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 语言/运行时 | Node.js 22.14.0 / npm 11.14.1（已核实本机版本）；资产管线用 **conda env `tianchi`**（Python 3.11.18，路径 `D:\Anaconda_envs\envs\tianchi`） | **本项目一切执行都在 `tianchi` 环境，不使用也不修改研究环境 `FMA`** |
| 资产管线依赖 | `numpy 2.4.6`、`scipy 1.17.1`、`scikit-image 0.26.0`、`pillow 13.0.0`；检查用 `pytest 9.2.0`、`pytest-cov 7.1.0`、`ruff 0.17.6` | **刻意不引入 trimesh/pyvista**：OBJ 解析、体素化、GLB 写出全部由 `tools/asset_pipeline` 自带纯 numpy 实现，换机可复现且便于单测 |
| Web 框架 | React + TypeScript + Vite | 单页交互 + 静态产物,契合 Qoder Sites |
| 3D 渲染 | Three.js（原生,加载 GLB） | 只有一层 3D 抽象;不同时引入 R3F/Drei |
| 切片叠加 | Canvas 2D / 图像层合成 | 切面与 overlay 由离线资产生成,前端只合成不计算 |
| 样式 | CSS Modules | 组件内聚,不额外引框架;若后续需要再换 Tailwind |
| 测试 | vitest（前端 + 助手纯逻辑）+ pytest（`tools/` 资产脚本） | 与两类代码语言匹配 |
| 格式/静态检查 | ESLint + Prettier（前端）、ruff（Python）、`tsc --noEmit`、`deno check`（Function 入口） | 对应三类代码的可机检门禁;`functions/index.ts` 只由 Deno 检查 |
| 打包/运行 | `vite build` 静态产物 + **Qoder Sites Functions（Deno）** 提供同源 `/functions/v1/app/chat` | 静态托管放不了密钥;Function 调 DashScope OpenAI 兼容接口,`DASHSCOPE_API_KEY` 由平台以应用 Secret 注入、只在服务端读取 |
| CI | GitHub Actions（PR 触发） | 见 §5 偏离说明:**只做 CI** |
| CD | **Qoder Sites**（由 Qoder 的 sites 工具链发布,非 Actions runner） | 赛题硬性要求评委入口必须是 Sites 公开地址;发布含助手版本时 `prepare_site` 必须带 `functionDirectory: "functions"` |

## 3. 目录地图

```text
tianchiCompetition/
├── standards/                 # AI 项目记忆与通用规范（本项目活记忆:00/01/PROGRESS）
├── index.html                 # Vite 入口
├── package.json / tsconfig.json / vite.config.ts
├── src/                       # 前端源码
│   ├── main.tsx / App.tsx
│   ├── components/            # InfoCard / TriView / HeartModel（懒加载）/ AssistantPanel / CtViewer / CirculationDemo（覆盖层与按钮）/ HeartScene（Three.js 3D 心脏,懒加载）;展签索引直接在 App.tsx
│   ├── data/                  # structures.json 加载与校验、助手 SSE 客户端、心动周期与开腔/循环路径（chambers.ts）、3D 场景清单与配色（heartScene.ts）（纯函数,便于测试）
│   ├── circulation.css        # 血液循环演示覆盖层样式（深蓝网格舞台、工具栏、图例、CSS2D 标签、窄屏布局,z-index 60 在助手之上）
│   └── types/
├── functions/                 # Qoder Sites Functions（Deno,仅站点托管时运行）
│   ├── index.ts               # /chat SSE + /health;限流、并发、超时、降级
│   ├── app/                   # 意图/检索/提示词/回合/focus/llm 配置（由 vitest 覆盖）
│   ├── knowledge/             # 32 条资料（TS 模块,来源全部为国内可访问站点）
│   └── sse.mjs                # SSE 读写工具（Function 与浏览器共用约定）
├── public/
│   ├── assets/slices/         # 示意切面与 overlay（WebP/PNG）— 进 Git
│   ├── assets/meshes/         # GLB 网格 — 进 Git
│   └── assets/structures.json # 结构目录 — 进 Git
├── tools/asset_pipeline/      # Python:OBJ 筛选→GLB、体素化、三视图渲染
├── assets_raw/                # BP3D 下载与解压产物 — 被 .gitignore 排除
├── tests/                     # vitest 用例;tools 的 pytest 放 tools/asset_pipeline/tests
├── .github/workflows/ci.yml   # 仅 CI
├── .env.example               # 本地联调模板（DASHSCOPE_*）;真实 .env 被 gitignore
├── NOTICE.md                  # 资产与助手资料来源、生成步骤、许可与署名原文
└── README.md
```

> 新增目录前先更新本节。站点工程放在仓库根而不是 `web/` 子目录,是为了让静态托管平台按默认方式识别构建产物。

## 4. 质量门槛

| 类型 | 本项目标准 |
|---|---|
| 格式检查 | 前端 `prettier --check .`;Python `ruff format --check tools/` |
| 静态检查 | 前端 `eslint .` + `tsc --noEmit`;Python `ruff check tools/` |
| 单元测试 | `vitest run` + env `tianchi` 的 `pytest tools/asset_pipeline/tests`（Python 侧命令一律用 `D:\Anaconda_envs\envs\tianchi\` 下的 `python.exe` / `Scripts\ruff.exe`） |
| 覆盖率 | **仅对 `tools/asset_pipeline`（Python 资产脚本）要求 ≥80%**;前端不设 80% 硬门槛,改以下列门禁替代（依据 `03-testing-standards.md` §5 允许按项目类型定制）:`vite build` 成功、组件冒烟测试通过、构建产物体积阈值检查、可访问性检查（控件与文本标签齐全） |
| 构建 | `vite build` 成功;产物单页首屏资源合计控制在可接受范围（阈值在 `PROGRESS.md` 记录,超限即减面或减结构） |
| 业务/模型指标 | **无。** 比赛版不跑模型、不发布 Dice;页面内容一致性要求见下 |
| 内容一致性门禁 | 每个进入 `structures.json` 的结构必须同时具备:显示名、同义词、切面资产、overlay、GLB——五项缺一即构建期报错 |

## 5. 不变约束

- **所有 Python 执行一律在 conda env `tianchi`**（`D:\Anaconda_envs\envs\tianchi\python.exe`）。**不得使用、修改或向研究环境 `FMA` 安装任何包**——本项目与研究仓库运行时完全隔离。
- 密钥、密码、私钥、Token **绝不写进代码或文档**。本项目 CD 不走 SSH,**因此本仓库不应存在任何部署私钥**;不配置 `SSH_PRIVATE_KEY` / `SSH_HOST` / `SSH_USER`。
- **禁止进入 Git**:原始/派生病人影像（`.nii`、`.nii.gz`）、模型权重（`.pt`）、数值中间产物（`.npz`、`.npy`）、BP3D 原始解压包、训练日志、任何个人证件与简历材料。`.gitignore` 必须先于首次提交落地,并在提交后做一次泄露抽查。
- **不引用研究仓库数据**:任何代码与脚本都不得读取 `D:\codex\project002_解剖本体文本引导3D医学分割\01_Inputs\**`,也不得复用其 `render_labels.py`（该脚本硬编码 `D:\codex\project002_ascii_runtime\...`,换机不可运行）。
- **前端禁止复用 `src/fma_seg/text/target_labels.py` 的别名→整数解析**。该表的 1–5 类解剖名与 2026-11-20 的标签纠正声明冲突（纠正后 3=左心室,代码里 1=LV),且 8/9 类被仓库自标为"假设"。本项目的结构表独立自生成。
- **FMA 许可本次无法核实**（官网不可达、Bitbucket 下载 402）。因此公开页面只使用解剖学名称与通用英文术语,**不转载 FMA 的 ID 与父子关系表**;项目书附录 B 属内部核对记录,不随站点发布。
- **BodyParts3D 署名原文必须随站点可见**,文本为 `BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International`。在复核 `openanatomy.jp`（记载为 CC-BY-SA 2.1 JP）与 DBCLS（CC BY 4.0）表述差异之前,派生资产目录按 **CC BY-SA 4.0** 保守标注。
- 页面必须显著标注:**示意模型,非真实病例影像、非模型推理结果**,并给出教育用途边界、不含诊断与治疗结论。
- `main` 分支受保护,日常开发必须走 feature 分支 + PR;**CI 红灯不合并**;**合并由人类执行,AI 只发 PR 并汇报**。

## 6. 部署/CI 占位符取值

> 本项目 CD 走 Qoder Sites,不使用 SSH + Docker 部署链,故与服务器相关的占位符标为"不适用"。

| 占位符 | 本项目取值 | 说明 |
|---|---|---|
| `<APP>` | `anatomy-sketch` | 站点/项目标识 |
| `<DEPLOY_DIR>` | 不适用 | 无自建服务器 |
| `<PORT>` | 不适用 | 静态托管,无监听端口 |
| `<PYVER>` | `3.11.18`（conda env **`tianchi`**）/ Node `22.14.0` | CI 里 Python 与 Node 版本按此锁定；本地执行一律用 `D:\Anaconda_envs\envs\tianchi\python.exe` |
| `<HEALTHCHECK>` | 改为**公开 URL 可达性检查**:未登录状态下 `GET /` 返回 200 且 `structures.json`、GLB、切面图均加载成功 | 替代 `curl localhost/health` |
| `<SSH_USER>` | 不适用 | 见上 |
| `<SSH_HOST>` | 不适用 | 见上 |
| 部署地址 | **https://anatomy-sketch-ip6pfjkttvk.qoder.zone**（2026-11-26 发布 M4c 产物,公开访问、无需登录） | 已填进项目书 §1 |

## 7. 对通用规范的两处偏离（已确认,2026-11-24）

1. **`05-cicd-standards.md` §3「CD 必须由 GitHub Actions runner 自动触发」不适用。** 本项目的发布动作由 Qoder 调用 Qoder Sites 工具链完成,Actions 只跑 CI。确认门 6 汇报的内容相应改为"公开 URL + 访问策略 + 资源可达性",而非端口与健康检查。原因:赛题要求评委入口必须是 Qoder Sites 公开地址,不接受本地文件或压缩包。
2. **`03-testing-standards.md` §4「核心代码覆盖率 ≥80%」只适用于 Python 资产脚本。** 前端按 `03` §5 的"前端"条目改用构建产物检查 + 组件测试 + 可访问性检查。
