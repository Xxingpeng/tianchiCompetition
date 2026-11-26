# PROGRESS · 解剖智绘 〔本项目活记忆 · 状态机〕

> **作用**:这是项目的"存档点"。任意 AI、任意重启会话,读它即可知道当前做到哪、下一步做什么、踩过什么坑。
> **更新时机**:每完成一个有意义步骤、每次会话结束前。
> **格式要求**:时间倒序,最新在上;短、准、可接力。

---

## 当前状态 (最后更新: 2026-11-26 · by Qoder)

- **阶段**:`开发` —— 六步交付流程**第④步（评审与合并）等待人工**,M1–M8 已推送,`pull/1` 仍待人工 merge。**M7a 伪 CT + M8 沉浸式主页 + 小医线上排障已提交推送**（`1961022` 功能 / `cb4cdb5` 去掉 Function 自比 host / `b9282b1` 请求体 ASCII 转义）:M7a 用 96 层 × 2 窗伪 CT 与逐层体素真值支撑"看 CT"和小医层问答;M8 为黑底全屏心脏 + 右侧浮层说明卡 + 看 CT 侧滑抽屉;小医真模型问答依赖 DashScope 兼容接口。**线上现状**:https://anatomy-sketch-ip6pfjkttvk.qoder.zone 已发布含 Function 的 `c9cef587-…` 版——`/health` 返回 `aiConfigured:true` / `knowledgeChunks:23`,CT 资产与三视图/3D 全 200;中文提问曾被网关请求体编码破坏,前端 ASCII 转义修复在 `b9282b1`,其草稿 `f774ce64-3582-4221-a795-560031d86450` **卡在缺失 Secret `DASHSCOPE_BASE_URL`**（`sites_secret_not_ready` / `missing`）,`DASHSCOPE_API_KEY` 已同步;用户正在站点设置补录专属 MaaS 端点值（只看名称,值不进仓库/聊天）,补齐并同步后**复用同一 action** 重新 `prepare_site` 再发布,随后线上复测中文问答是否走真模型。本地门禁:前端 **116 用例 / 15 文件**、Python **106 用例 / 96.58%**、`deno check`、`vite build` 全绿。页面与资料均标注**不是真实病例影像、不能用于诊断**,仍不接受任何影像上传。
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
  - **M4 前端单页功能与可访问性**（US-2/3/4/5/7/8）:
    - 组件:`src/data/search.ts`（精确/前缀/包含三档排名、结果上限 8 条）、`StructurePicker`（`role=combobox` + `aria-activedescendant`,方向键/回车/Esc 全程可用）、`InfoCard`、`TriView`（高亮开关 + 纯文字图例）、`MeshViewer`（GLTFLoader + OrbitControls,无 WebGL 只降级这一块）、`App`（`React.lazy` + `Suspense` 把 Three.js 拆成懒加载 chunk）。
    - 门禁实测:`prettier --check` / `eslint .` / `tsc --noEmit` 全绿,`vitest run` **36 passed / 7 files**,`vite build` 入口 232.32 kB（gzip 73.73）+ 懒加载 `MeshViewer` 639.88 kB（gzip 159.69）,首屏远低于 3 MB 闸。
    - 浏览器实测（dev server 5173 + 真实 `public/assets`）:输入别名 `LV` → 2 条候选且"左心室 经别名「LV」命中"排首;选中后三视图 URL 换 `lv_*`、来源与 GLB 同步;`左心耳` 显示"自制几何（BP3D 未收录 lxa）…"、体素数 1,616;`股四头肌` → "未收录"空态且页面不崩;单字符 `e` → 7 条候选、无溢出提示误报;高亮开关联动图层与图例文字;63 个资产 URL（9 GLB + 54 PNG）全部 200 且非空,合计 4.09 MB。
    - 3D 交互证据:拖拽后 canvas 像素哈希变化,"放大"改变画面、"复位视角"回到与初始**同一帧**（哈希相等）;canvas 绘制缓冲 600×600（dpr 1.25）、36% 像素被着色、平均色 (118,65,23) 与心肌色 `#d33d51` 的光照结果一致 → 网格确实渲染而非空白。
    - axe-core 在交互末态（已检索、已切结构、已开关高亮、已操作 3D）**0 违规**。
    - 修掉的缺陷:宽屏下 3D 画布被拉满整栏（1280 CSS px,把 480 的缓冲拉伸到发糊）→ 给 canvas 加 `max-width: 480px` + `height: auto`,窄屏仍自适应（380px 容器实测 303×303）。
    - US-2 AC4:`excluded` 非空时页面输出"未纳入：id（原因）"并 `console.warn`（当前 BP3D 产物 `excluded` 为空,由 `smoke.test.tsx` 用例覆盖）。
    - **未做的验证**:整页截图（内置浏览器面板未打开时 `take_screenshot` 直接报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`）;US-8 AC1 的窄屏检查是把 `#root` 约束到 380px **内容宽**做的,不是真实视口模拟——布局为纯流式,媒体查询只用于 `prefers-reduced-motion`。
  - **M5 本地 CI 自检 + PR**:
    - 门禁全集本地跑通:前端六道闸（`vitest` 36 passed、`vite build` 首屏 232.32 kB）+ 资产 `ruff format --check` / `ruff check` / `pytest --cov`（98.48%）。
    - Actions 首跑（US-1 AC2）:`pull_request` run `45397236128` 与 `push` run `45397174177` 的两个 job 全 success,`gh pr checks 1` 四项 pass——按 job 的 `conclusion` 逐条核对,不看 run 表面状态。
    - **[pull/1](https://github.com/Xxingpeng/tianchiCompetition/pull/1)** `feature/1-anatomy-sketch-demo` → `main`:OPEN、`MERGEABLE`、非 draft,正文按"改了什么/为什么/如何验证/风险与边界/未做"五段写全。**AI 不合并**,等人工审核。
    - 顺手做了发布前的产物自检:`dist/` 经 `vite preview` 起服务,`index`/`structures.json`/GLB/PNG 全 200,生产包实测切结构（肺动脉干→`pa_*`）与英文检索（`pulmonary` → 2 条候选）都正常、控制台零消息、axe 0 违规。**这是 M6 发布物可以直接给 Qoder Sites 的证据**。
  - **M4b 整颗心脏 3D + 两栏布局**（2026-11-24,由用户看截图后追加:"左列太长,收窄;右半放心脏解剖 3D",参考站 `d-d-d.cn/web3d/heart`。三项确认:用我们自己的 9 个 GLB 合成整颗心脏 / 点击部件选结构 + 悬停显示名 / 移除单结构"三维形态"面板）:
    - 改动:新增 `src/data/heart.ts`（`partOpacity`、`isTap` 两个纯函数,不碰 WebGL 就能测）与 `src/components/HeartModel.tsx`（`VIEW_SIZE=640`,9 个部件塞进同一个 `THREE.Group`,按并包围盒把最长边归一到 2 个世界单位、相机 3.2 起）;删除 `MeshViewer.tsx` 与 `mesh.test.tsx`;`App.tsx` 改成 `.layout` 两栏（`minmax(13rem,20rem)` + `minmax(0,1fr)`,`max-width: 48rem` 退回单栏）,`styles.css` 的 `.mesh-*` 全部改名 `.heart-*`。
    - 门禁实测:`prettier --check` / `eslint .` / `tsc --noEmit` 全绿,`vitest` **39 passed / 7 files**,`vite build` 首屏 **232.47 kB**（gzip 73.77）+ 懒加载 `HeartModel` **642.89 kB**（gzip 160.80）——Three.js 仍全部留在懒加载 chunk,首屏没被这次改动顶上去。
    - 浏览器实测（`vite preview` 4173 + 真实 `public/assets`,控制台**零消息**）:9 个 GLB 合成成功,状态行"已高亮 心肌,其余部件半透明。";canvas 绘制缓冲 800×800（dpr 1.25）而 CSS 盒 323×323 随栏宽收缩,**未被拉伸**;`toDataURL` 像素统计 22% 有光、颜色簇出现 ≥8 个色系（红橙/青/紫…）→ 画面上确实是多个不同色的部件同场景,不是一整块。
    - 交互证据:悬停四个取样点分别报"肺动脉干（Pulmonary trunk）""左心房（Left atrium）";点选后 `.info-card h3` 与列表 `aria-pressed` 同步成"左心房"（三维—色块—信息卡三者同一结构）;按下-抬起位移超阈值不触发选中;连续两次"放大"改变像素哈希,随后"复位视角"回到**同一帧**（`288af2e6` 相等）。
    - 修掉的两处工具反馈:`react-hooks/refs` 报渲染期写 ref → `onSelectRef` 挪进 `useEffect`;`noUncheckedIndexedAccess` 报 `scenes[index]` 可能 undefined → 加载任务直接返回 `{ structure, part }`,顺带把 `selectedId` 从加载 effect 里摘干净（透明度只由 `[selectedId, status]` effect 应用,否则每次选中都要重载 9 个 GLB）。
  - **M4c 整颗心脏配色校正（已提交并推送:`eb8cc34` feat(web) + `590ea15` docs(standards),CI 两条 run 的 4 个 job 全 pass）**（2026-11-24,用户看截图后反馈"颜色太浅了影响观感",并选择"A：保留层次"= 非选中部件仍半透明）:
    - 定位:发白**不是灯太亮**,是两处混色——① 8 个 `DoubleSide` 半透明壳层层相叠（0.3 不透明度下能叠到三四层）,② `metalness 0.05 + roughness 0.6` 在整个表面铺一层白色高光。选中件还留在半透明队列里,会被自己和背后的部件混成灰。
    - 改动 4 处（`HeartModel.tsx` + `data/heart.ts`,页面结构与布局未动）:灯光改半球 1.6 + 主光 1.4（方向 0.6/0.8/1）+ 补光 0.3;材质 `metalness 0 / roughness 0.85`;`applyOpacities` 里 `transparent = opacity < 1` 且置 `needsUpdate`,让选中件走不透明通道;`DIMMED_OPACITY` 0.3 → **0.18**。
    - 量化验证（同一探针,选中心肌,canvas 缓冲 800²,按色卡距离分类）:与心肌色卡 `rgb(181,101,29)` 距离 ≤40 的像素 **0 → 21,644**,受光面亮度/色卡亮度 **1.05**（等于色卡本色,不再发白也不再发暗）。
    - 反例记录:中途把灯光压到 0.35/0.7/0.15,受光面只剩色卡的 **0.61** 倍——颜色发暗,又调回 1.6/1.4/0.3。判据必须落到像素比值,不能靠"看着差不多"。
    - **法线平滑被证伪并撤销**:用户批准"加"之后实测是**空操作**——`mergeVertices` 对 83,496 个顶点合并掉 **0 个**（耗时 188.4 ms）,GLB 本来就是**带平均法线索引**几何（myo `posCount 38,674 / idxCount 232,692`,36% 顶点法线等于其面法线）,`computeVertexNormals` 再算一遍结果相同;浏览器端纹理指标前后**逐字节一致**（meanGrad 3.75 / meanLum 92 / px 9,475）。台阶感来自 96³ 体素的真实几何,抬高 `--grid` 会先撞单文件 2 MB 闸（myo 已 1,816.4 KiB / 91%）,故撤销该改动、只保留配色修复。
    - 门禁:`npm run check` 全绿（**39 passed**）,`vite build` 首屏 232.49 kB（gzip 73.80）+ 懒加载 `HeartModel` **642.99 kB**（撤销平滑后回到未增体积,比平滑版本小 1.3 kB）。
    - **未做的验证（M4b 提出,M4c 复核仍未解除）**:①≥1280px 真实视口的整页观感——内置浏览器面板固定 415px,`take_screenshot` 仍报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`,宽屏只验到编译后 CSS 里的 `.layout` 规则与 `@media (width <= 48rem)` 存在,以及列宽算术（728 内容宽 = 320 + 24 + 384）不溢出;②OrbitControls 的**拖拽旋转**无法用合成 PointerEvent 证明（`setPointerCapture` 对不存在的 `pointerId` 抛错,画面哈希纹丝不动）,缩放/复位走的是按钮路径、已有像素证据,旋转仍由真人手测覆盖。
  - **M7 小医 · 心脏学习助手（问答 + 示意切面讲解）已提交推送,含焦点/元问题修正与口语泛问/来源时序修正**（2026-11-26;用户要求:普及心脏知识/帮助看 CT、无幻觉、轻量 RAG、意图识别、严格限制话题、优化 system prompt、省 token 的历史记忆、常规 CoT / 高难度 ToT、高权威来源、**必须展示检索来源**;范围经确认"问答 + 示意切面讲解",不做真实 CT 上传/诊断;追加要求:用指定图片作头像、助手名 **小医**、打通 DashScope、**逐段流式输出**、**不要主动播报当前选中结构**、**能回答的元问题不要推给越界话术**）:
    - **知识层**（`functions/knowledge/heart-knowledge.ts`,原 JSON 已删）:23 条中文资料,只收 OpenStax A&P 2e §19.1/§19.3（CC BY 4.0）、Radiopaedia CT 条目（CC BY-NC-SA 3.0,非商业教学引用）与本站自述;检索器跳过未登记来源,保证每条引用都能展示出版方与许可。
    - **意图与安全**（`app/intent.ts`）:顺序为 空 → 急症 → 症状/用药/手术 → 问候 → 自我介绍 → CT → 切面 → 解剖 → **对话元问题** → 站内帮助 → 越界;越界、症状、急症、问候、站内用法全部零 token 静态回复;"它/这个"单独出现且已选中结构时按解剖追问处理。**对话元问题**（"我刚才问了你哪些问题/我们刚才聊了什么"）由浏览器带来的最近 6 条消息直接生成问题清单,不调模型、不占配额,并明确说明刷新后记录清空;带具体解剖对象的句子（如"你刚才说的左心室为什么厚"）仍走解剖题。常见心脏疾病词（心衰、房颤、冠心病等）归入解剖范围,资料不足时走"知识库暂无"而不是"超出范围"。
    - **检索**（`app/retrieval.ts`）:BM25 + 中文 2-gram,索引与查询都丢弃单字中文与单字母拉丁词元,并过滤疑问/客套词;标题 ×3、关键词 ×2、主题 ×1.15,`minScore 2.1`、`k=4`;判出主题后收窄候选（解剖题只取 anatomy,CT 题保留 anatomy 作看图基础）;结果为空直接走"知识库暂无"静态回复。
    - **提示与记忆**（`app/prompt.ts` + `app/llm.ts`）:每轮注入 `[思考模式] 常规/深入`（常规内部逐步核对;深入内部列 2–3 种解释逐一用资料检验,都只输出结论与 `[n]`）;历史由浏览器携带最近 6 条消息（服务端每条截断 300 字）直接作为 `messages` 发送,服务端不保存会话、不落数据库;原冷启动摘要路径已删除。系统提示明确:页面焦点只在用户问到当前结构/切面/高亮时使用,泛指问题不得主动播报选中项;资料能支持总体分类时先给分类,不把可回答的部分说成"知识库暂无"。
    - **切面讲解与焦点**（`app/focus.ts` + `app/turn.ts`）:9 个结构的三视图 0 起切层索引冻结在服务端;只有问题出现"它/这个结构/当前查看/切面/高亮"等指代时,才把当前结构名并进检索并以 `[当前切面]` 或 `[当前页面]` 注入;泛指"心脏有哪些结构"不再绑定当前选中结构。`focus.test.ts` 与 `public/assets/structures.json` 做漂移比对,防止两边改不同步。
    - **泛问检索**（`app/turn.ts` + `app/intent.ts`）:泛指"心脏有哪些结构/由哪些部分组成/有什么结构/有什么/的结构是什么"（含截图里的漏字写法"心脏有什结构"）时,统一用"心壁 瓣膜 大血管 传导系统 心腔"做一次上级分类检索,避免单查询只命中"心壁"就把心腔/瓣膜说成没有资料;问到具体瓣膜、血管、心室等仍走普通检索。回归测试已锁截图原话。
    - **模型通道**（`app/llm.ts` + `functions/index.ts`）:**DashScope OpenAI 兼容接口**,默认 `https://dashscope.aliyuncs.com/compatible-mode/v1`、模型 `qwen4-max`,可用 `DASHSCOPE_BASE_URL` / `DASHSCOPE_MODEL` 覆盖,密钥只读 `DASHSCOPE_API_KEY`;流式解析 `choices[0].delta.content`,以 `[DONE]` 结束;上游 45 s 超时、整条流 90 s、答案上限 6000 字;失败只回安全错误码,从不转发上游报文。原 Qoder Cloud Agents 客户端（`cloud-agents.mjs`）与冷启动会话映射已删除。
    - **Function 防护**（`functions/index.ts`）:同源 Origin 校验、12 KB 请求体/400 字问题上限、单 IP 10 次/10 分钟 + 全站 800 次/日 + 3 路并发、单会话互斥;静态分流在建流前完成、不占配额;`/health` 增加 `aiConfigured`;上游失败时 `status` + 知识库原文降级（`degradedAnswer`）。
    - **前端**（`src/components/AssistantPanel.tsx` + `src/data/assistant.ts` + `src/assets/xiaoyi.webp`）:右下角浮动面板（不挤压三视图列）,标题与启动按钮均为 **小医**,头像为用户提供图片中心裁切的 256×256 WebP（12 KB）;**检索结果先到时不铺来源**,只显示"正在检索资料…"→"已找到 N 条资料,正在作答…",答案首字出现后才列出可点击来源并保持到结束;流式文字末尾带闪烁光标（`prefers-reduced-motion` 下关闭）,停止按钮、Esc 收起、Enter 发送兼容输入法、`aria-live` 状态、400 字上限、移动端全宽;静态回复显式标"本次未使用外部资料"。
    - **门禁实测**:`deno check --no-lock --node-modules-dir=none functions/index.ts` 通过;`npm run format` / `lint` / `typecheck` 全绿;`vitest` **94 passed / 13 files**（其中 Function 49 条:意图 16、检索 9、回合 14、focus 3、llm 配置与帧解析 7;前端新增"来源等首字后显示"1 条）;`vite build` 首屏 **240.39 kB**（gzip 76.74）+ 懒加载 `HeartModel` 642.99 kB + CSS 8.41 kB + 头像 11.96 kB。
    - **本地真实模型冒烟（端口 8000,`.env` 注入,经 Vite 5173 同源代理复测）**:`/health` 返回 `aiConfigured:true`;"左心室为什么比右心室壁厚？"增量输出并以 `[1][2]` 引资料、4 条来源正确;"窗宽窗位是什么？"走 CT 主题并给出纵隔窗数值;"最近胸痛该吃什么药？"零 token 静态拦截;换无效 key 后返回 `status: ai_service_unavailable` + 知识库原文降级。**焦点/元问题修正后复测**:选中"心肌"时问"心脏有哪些结构",回答给出心壁/四腔/瓣膜/大血管/传导五类且**未提"你现在看的是心肌"**;"我刚才问了你哪些问题"直接列出最近两问（零来源、`mode=static`）;"它有什么作用"仍能结合选中的左心室;问"心脏有哪些瓣膜"只返回瓣膜资料;问"心衰是怎么回事"落入知识库不足而非越界。**口语泛问修正后**:同一句"心脏有什结构"由只命中心壁 1 条变为 4 条资料,回答覆盖心壁、心腔与瓣膜、大血管、传导系统。
    - **流式实证**:同一中文问题经 Vite 同源代理,`meta` 47 ms 到达,首字 1.84 s,随后 **37 个 `delta` 在 1.24 s 内陆续到达**,3.07 s 完成,`degraded=false`;证明不是攒完整段再一次性返回。
    - **浏览器实测（内置面板 416×554,修复 Vite 依赖缓存 504 后）**:启动按钮"问问小医"、头像 256×256 且加载成功、面板标题"小医"与副标题完整;点示例问题后 **4.1 s** 流式完成 195 字回答、4 条来源（标题/出版方/CC BY 4.0/摘要）与正文 `[n]` 一致,无降级标记。**来源展示时序实测**:用 MutationObserver 记录到"正在检索资料…"（链接 0）→"已找到 4 条资料，正在作答…"（链接 0）→ 首字到达后来源 4 条出现;阶段提示与延迟展示均生效。**截图仍报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`**,头像观感与宽屏版式需用户目测。
    - **未验/边界**:①**线上真实问答未验**——静态发布不含 Function,必须重新发布后在真实站点复测增量输出、来源与 `/health`;②小医头像与面板观感需用户在真实浏览器确认;③限流/并发为 isolate 内存计数,冷启动会归零;④ToT 是**提示词级**多假设检验,不是字面树搜索;⑤CT 仅概念与本站示意切面,不支持上传影像。
  - **M7a 伪 CT 轴位阅读器 + 小医 CT 上下文（2026-11-26,随本批分支提交）**（用户问"给小医加读 CT、是否需要用户上传 CT";确认路线:**不上传真实影像**,用教学标注体素合成伪 CT,先做轴位逐层阅读与提问）:
    - **生成**（`tools/asset_pipeline/ct.py`）:从统一 96³ 标注体素按 `LABEL_HU` 近似 CT 值,输出 96 层 × 纵隔窗/肺窗 = **192 张**底图、9 结构 × 有信号层 = **390 张** overlay、逐层结构体素真值与每个结构的最佳层;清单嵌进 `structures.json` 的 `ct` 字段（数据 `0` 起索引,界面显示 `1` 起）。`--ct-upscale` 默认 2;`--force` 连 `ct/` 一起清。构建期 `catalog.validate_ct` 校验 schema、note 必须含"非真实病例"/"不是真实病例"、文件实际存在、最佳层体素峰值一致、逐层真值。
    - **前端**（`CtViewer` + `src/data/ct.ts`）:`minmax(15rem,22rem)+1fr` 布局,**三视图列宽未动**;窗切换、原生 range 层滑杆、上下层、跳到本结构最佳层、高亮开关、本层可见结构清单（含体素数,可点选）。从左列表/3D 选结构会跳到该结构最佳层;在 CT 清单里选结构**保持当前层**（修掉 ref 残留导致的跳层缺陷）。目录加载时同步校验 `ct` 清单,图像尺寸、层数、最佳层覆盖不一致直接报错。
    - **服务端**（`functions/app/ct.ts` + `turn.ts` + `prompt.ts`）:浏览器只送层号/窗/结构 id/体素数;**结构名与体素数一律回查服务端冻结表**,未知结构丢弃,层数上限 512、结构上限 9、体素上限 5000 万;只有问题明确指代"这层/当前层/本层/当前 CT"才注入 `[当前 CT 轴位]`,泛指问题不带。提示词声明 CT 层号 1 起、`[当前切面]` 仍 0 起,伪 CT 与逐层体素数不是临床测量。
    - **本地门禁**:`npm run check` **115 passed / 15 files**（新增 `src/test/ct.test.tsx`、`functions/app/ct.test.ts`,并补 `assistant`/`smoke`/`a11y` 用例）;`deno check` 通过;`vite build` 首屏 **248.60 kB**（gzip 79.36）+ 懒加载 `HeartModel` 642.99 kB + CSS 10.90 kB;Python `ruff` 全绿、`pytest` **106 passed / 覆盖率 96.58%**。
    - **真实浏览器实测**:初始层 13（显示 14/96）、纵隔窗 2375 体素,可见 左心室 252 / 心肌 1386 / 右心室 512 / 右心房 225;切肺窗后底图变 `013_lung.png` 且层不变;滑到 40 层后在 CT 清单点"左心室"仍是 40 层、1012 体素;回左侧列表点"左心房"跳到最佳层 46、肺窗保留;滑到 10 层后点"跳到最佳层"回 46;`.ct-options` 内高亮开关正确增删 overlay（探针一开始点错到 TriView 的同名复选框）。
    - **助手 CT 问答实测**（重启 Deno 后）:问"当前 CT 这一层有哪些结构？"返回"轴位第 14/96 层（纵隔窗）可见 4 个结构:心肌 1386 体素（当前选中）、右心室 512、左心室 252、右心房 225",带非临床声明与 4 条来源。**踩坑**:端口 8000 的旧 Deno 进程早于 CT 改动,首答说"没有附带当前切面信息",重启才正常——改 Function 后必须重启,并核 `/health` 的 `aiConfigured:true` / `knowledgeChunks:23`。
    - **体积**:CT 资产 **1,067,656 B**;`public/assets/` 合计 **5,222,545 B**（约 4.98 MiB,`du` 6.4 M 为磁盘块）;`dist` 约 7.4 M。
    - **未验/边界**:截图仍 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`,CT 阅读器与助手观感需用户真实浏览器确认;**不接受真实影像上传,也不做读片/诊断**;限流与并发仍是 isolate 内存。
  - **M8 沉浸式主页改版（2026-11-26,随本批分支提交）**（用户原话:"主页一片黑,然后只有心脏这个模型,点哪个结构就展示说明,然后有个按钮是看 CT";四项选择:**全屏心脏 / CT 侧滑大面板 / 三视图收进说明卡 / 右侧浮层卡片**）:
    - **布局**:`App.tsx` 重写为 `.app-shell` + 固定页头页脚 + `.scene-shell`;`selectedId` 初值改为 `null`,进站只有心脏;`.scene-dock` 左上浮层放检索与目录（目录默认折叠,`.catalog-toggle` 控制）;选中后 `.detail-panel` 右侧玻璃卡（窄屏 `≤64rem` 变底部抽屉）,三视图用 `.tri-disclosure` 默认折叠;`.scene-actions` 主舞台「看 CT」在未选结构时从目录第一个开始,说明卡内的 `.detail-cta` 从所选结构最密层开始;`.ct-drawer` 为 `role="dialog"` 侧滑大面板（`94vw`/窄屏全屏）,`.ct-backdrop`、Esc、`收起 CT` 三种关闭,打开时焦点到关闭按钮、关闭后还回触发按钮;小医仍在最上层（z35）,`ct` 上下文改为**仅抽屉打开时**传给 `AssistantPanel`。
    - **样式**:`styles.css` 根变量改深色（`--bg #05070b`、`--ink #f1f5f9`、`--accent #63d7ff`）,原浅色硬编码选中态（`#e6eff8`）在 M8 段落统一改青色半透明;心脏画布 `VIEW_SIZE 640 → 900`,容器 `min(900px, 76vh, 82vw)`,外框去边框透明;`.heart-viewer > h2` 与 `.heart-help` 用 clip 方式只对视觉隐藏,保留给辅助技术;小屏重排:检索面板收紧、目录行保留、`.heart-buttons` 隐藏、页脚限宽到 `100vw - 9.5rem`、看 CT 改左下小胶囊,避免与助手入口/页脚互相压住。
    - **门禁实测**:`prettier` / `eslint` / `tsc --noEmit` 全绿,`vitest` **116 passed / 15 files**（`smoke` 改为验证"进站无说明卡→展开目录选中→说明卡+折叠三视图";`a11y` 在展开目录+选中结构+展开三视图后跑 axe,0 违规）;`deno check` 通过;`vite build` 首屏 **251.54 kB**（gzip 80.01）+ 懒加载 `HeartModel` 643.08 kB + CSS **23.02 kB**。
    - **真实浏览器实测（内置面板 416×554,页面 `visibilityState=hidden`）**:初始无 `.detail-panel`、状态行"点击任一部件…";展开目录 9 条、选心肌后说明卡出现、`aria-pressed` 同步;三视图展开后 3 张底图+overlay 均加载（288×288）;说明卡内看 CT 打开抽屉,层 14/96、底图 `013_mediastinal.png`、overlay `myo/013.png` 加载,切肺窗后 `013_lung.png` 且层不变,焦点在关闭按钮,Esc 关闭后焦点回到说明卡按钮;左心室路径从 31/96 开始且跳到最佳层按钮正确;小医在 CT 抽屉上问"当前 CT 这一层有哪些结构？"返回层号/窗名/5 个结构体素并带来源。布局探针:抽屉外 CTA、页脚、助手入口两两不重叠,页面无横向滚动、控制台零消息。
    - **未验/边界**:截图仍不可用,桌面宽屏观感需用户真实浏览器确认;内置面板固定 416×554,该高度下说明卡内容需滚动才能看到看 CT 按钮（真实手机 844 高可一屏放下）;3D 拖拽旋转仍无法用合成指针验证。

- **下一步 (TODO 第一条)**:补齐 `DASHSCOPE_BASE_URL` 后发布 `f774ce64-…` 并线上验收——Secret 同步后复用同一 action 重试 `prepare_site`（`functionDirectory: "functions"` + `secretNames: ["DASHSCOPE_API_KEY","DASHSCOPE_BASE_URL"]`;漏 `functionDirectory` 只会发静态产物、助手 404）→ `publish_site` → `published: true`,随后线上验收:中文提问流式出真模型回答且来源在首字后出现、CT 底图/overlay 全 200、窗与层切换、"当前 CT 这一层有哪些结构"带本层真值、泛指问题不播报当前结构、`/functions/v1/app/health` 的 `aiConfigured=true` 与 `knowledgeChunks=23`;上游失败时核对降级路径是否给出知识库原文。仍等人工 merge `pull/1` 与开启 `main` 分支保护。
- **阻塞项**:
  1. **需人类动作**:审核并 merge `pull/1`（AI 不合并）;merge 后开启 `main` 分支保护（要求 PR + CI 通过）。
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
- [x] 写 `.github/workflows/ci.yml`（**只有 CI,无 SSH/CD**;`web` + `asset-pipeline` 两个 job,Actions 首跑已于 2026-11-24 在 pull/1 验证通过）
- [x] 实现 `structures.json` schema 与构建期一致性校验（五项缺一即失败,见 `catalog.validate_catalog`）
- [x] `tools/asset_pipeline/` 骨架 + pytest 用例（91 passed / 覆盖率 98.5%）

### P1 · 功能

- [x] US-2 检索 → US-3 信息卡 → US-4 三视图 → US-5 3D → US-8 体验打磨（2026-11-24,M4 完成、M4b 把 US-5 改成整颗心脏合成:本地门禁 + 浏览器实测全绿,已推入 pull/1 等人工合并）
- [x] US-9 发布到 Qoder Sites,回填公开 URL（2026-11-26:https://anatomy-sketch-ip6pfjkttvk.qoder.zone ,现行为含 Function/CT 的 `c9cef587-…` 版;`/health` 200 且 `aiConfigured:true`、`knowledgeChunks:23`,`structures.json` 68,342 B 与 CT 底图/overlay 全 200;黑底全屏心脏、CT 抽屉与小医面板均已在真实浏览器操作通过）
- [x] US-10 小医 · 心脏学习助手（问答 + 示意切面讲解）代码、命名、头像与本地门禁（2026-11-26,已提交推送至 `3fb583a`、CI 四 job 全绿;焦点/元问题修正 `918cb27`、口语泛问/来源时序修正 `19f3abf`;`deno check` + prettier/eslint/tsc 全绿、**94 passed / 13 files**;DashScope 真实流式回答与降级路径本地跑通;线上真实问答待发布）
- [ ] 发布 `f774ce64-…`（ASCII 请求体修复）并线上验一轮中文问答（必须 `functionDirectory: "functions"` + `secretNames: ["DASHSCOPE_API_KEY","DASHSCOPE_BASE_URL"]`;当前阻塞:后者 Secret 未录入。旧草稿 `c2f9f3e1-…` / `e5bd8226-…` / `32cead70-…` / `ec709890-…` / `1b6356ad-…` 均不可复用）
- [x] M7a 伪 CT 轴位切面 + 逐层真值 + 小医 CT 上下文（2026-11-26,代码与本地门禁完成,**随本批提交**;不上传真实影像;详见上方 M7a 条目）
- [x] M8 沉浸式全屏心脏主页（2026-11-26,黑底全屏心脏 + 右侧说明浮层 + 三视图折叠 + 看 CT 抽屉,门禁 **116 passed / 15 files**、真实浏览器交互与布局探针通过,**随本批提交**;详见上方 M8 条目）

### P2 · 收尾

- [ ] **人工**:在桌面宽度（≥1280px）真实浏览器里看一眼**沉浸式主页**——黑底全屏心脏、左上检索浮层、右侧说明卡、看 CT 侧滑抽屉与小医面板的叠放;顺手确认拖拽旋转跟手——内置浏览器面板固定 416px,`take_screenshot` 报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`,合成 PointerEvent 又驱动不了 OrbitControls 的旋转（见 GOTCHAS）。另看一眼 390×844 手机视口下"心脏—说明抽屉—看 CT"是否一屏可用。

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
| 2026-11-24 | 3D 区域从"单结构网格面板"改为**同一场景合成整颗心脏**（9 个部件 GLB）,并移除 `MeshViewer` | `surface.py` 写出的顶点是世界毫米,9 个部件放一起自动成型、零配准,且与切面同源;学习者要的是毗邻关系,单结构孤立旋转看不到;只保留一个场景也避免每次切结构重载网格 |
| 2026-11-24 | 页面改为**左检索/列表 + 右整颗心脏与详情**两栏,`max-width: 48rem` 退回单栏 | 用户反馈"结构列表太长把页面拉长";两栏让 3D 与详情同屏对照,窄屏退回流式不破版 |
| 2026-11-24 | 3D"颜色太浅"按**混色**修:选中件走不透明通道、非选中 0.3 → **0.18**、`metalness 0 / roughness 0.85`、灯 1.6/1.4/0.3;同时**放弃表面法线平滑** | 用户选定"A：保留层次"（非选中仍半透明）。实测发白来自双面半透明壳叠加与高光,不是过曝;色卡距离像素 0 → 21,644、受光面亮度比 1.05 为证。平滑经顶点/法线测量确认是空操作（合并 0 顶点、GLB 本就带平均法线),留着只增 188 ms 首帧与 1.3 kB |
| 2026-11-26 | ~~助手走 **同源 Sites Function → Qoder Cloud Agents**~~（同日被下一条取代） | 第一版方案;后因用户提供 DashScope 密钥与专属端点,改为直连兼容接口,减少一层平台耦合 |
| 2026-11-26 | 模型通道改为 **同源 Sites Function → DashScope OpenAI 兼容接口**;`DASHSCOPE_API_KEY` 作为 Sites 应用 Secret 注入,浏览器零密钥 | 用户指定密钥、模型 `qwen4-max` 与工作空间端点;兼容接口协议简单、可直接本地复现,同源 Function 继续承担限流、输入上限与统一降级。代码默认公共兼容端点,专属端点只通过环境变量覆盖,避免把用户私有地址写进仓库 |
| 2026-11-26 | 无数据库:**历史由浏览器携带最近 6 条消息**,服务端不保存会话;限流与并发计数只在 isolate 内存 | 单轮问答只需最近上下文,浏览器已有完整对话;去掉会话映射后冷启动无状态,失败仍有知识库降级,演示规模足够 |
| 2026-11-26 | 知识库**只收能逐条展示许可的 23 条**:OpenStax（CC BY 4.0）、Radiopaedia（CC BY-NC-SA 3.0,非商业教学引用）、本站自述;不整段复制教科书 | 用户要求高权威来源且必须展示来源;逐条绑定 source 元数据,检索器会跳过未登记来源,从结构上杜绝"引用无出处" |
| 2026-11-26 | CoT/ToT 做**提示词级模式**,按难度启发式选择;只输出结论与 `[n]`,不展示推理草稿 | 真正的 ToT 树搜索会成倍消耗 token/时延;医学问答要的是可核对的事实链而不是思考过程,提示词内多假设检验已能覆盖比较/机制类问题 |
| 2026-11-26 | 检索用 BM25 + 中文双字过滤,`minScore 2.1`、`k=4`,并按主题收窄候选;无命中直接静态回复 | 单字中文（的/学/心）几乎命中全部资料,会把"量子力学"这类越界问句拉过阈值;双字过滤 + 查询停用词 + 主题收窄后既保住召回又让越界问题落空,且完全可单测 |
| 2026-11-26 | "给小医看 CT"定为**离线伪 CT 轴位阅读**,**不接受用户上传真实影像**,不从任何病例数据集取图 | 真实 CT 上传与诊断超出赛题与许可边界,也无法在静态站点里做合规读片;用已有教学标注体素合成伪 CT,能让学习者练"层号—结构—体素"对应,且来源、许可与体素真值全部可审计 |
| 2026-11-26 | 伪 CT 与三视图/GLB **共用同一份 96³ 体素**;底图按近似 HU 渲染,overlay 按结构渲染,逐层体素真值写入 `structures.json` | 一套几何三个出口,天然保证"CT 上看到的"与三视图、3D 指向同一结构;体素真值让助手回答有服务端可核对的事实,不靠模型猜 |
| 2026-11-26 | CT 层号**数据 0 起、界面 1 起**,提示词显式声明;服务端只接受层号/窗/结构 id/体素数,名称回查冻结表 | 与三视图 `[当前切面]` 的 0 起索引区分,避免模型把 13 层说成 14 层或反过来;客户端文案不进提示词,防止借结构名注入 |
| 2026-11-26 | 主页改为**黑底全屏心脏 + 浮层 UI**,初始 `selectedId = null` | 用户明确要"主页一片黑,只有心脏";先看结构再给信息,避免一进站就被文字占满。浮层让 3D 始终是主角,说明卡、检索、CT 都不挤压画布 |
| 2026-11-26 | 说明卡放**右侧浮层**（窄屏底部抽屉）,三视图**收进说明卡默认折叠**,目录默认折叠 | 四个选项由用户选定;说明与切面是同一条学习链,折叠比另开一栏更省视线,也让窄屏只有一个滚动区 |
| 2026-11-26 | CT 改为**侧滑大面板 `role=dialog`**,保留心脏在背景;遮罩/Esc/按钮三关,焦点打开到关闭键、关闭还回触发键 | 用户选"侧滑大面板";抽屉比整页跳转更能对照心脏,但必须补对话框语义与焦点归还,否则键盘用户会掉进背景 |
| 2026-11-26 | 小医**仅在 CT 抽屉打开时**携带本层真值;面板 z-index 高于抽屉 | 抽屉关闭后"当前层"已不可见,再带层信息会答非所见;助手浮在最上层,用户看 CT 时仍能随手问这一层 |

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
- **宽屏会把 3D 画布拉满整栏**:`renderer.setSize(480, 480, false)` 只定绘制缓冲,CSS 再写 `width: 100%` 就让 canvas 在 1280px 栏里长到 1280×1280——把 480 的缓冲拉伸到发糊,还把整页撑成一屏图。实测方式:把 `#root` 依次约束到 380/1280 读 canvas 的 CSS 盒。解决:`style.maxWidth = "480px"` + `height: auto`（canvas 属性本身是正方形,`auto` 会保住比例）,窄屏照常缩小、宽屏封顶。M4b 换成整颗心脏后同一套写法沿用,`VIEW_SIZE` 抬到 **640**（`maxWidth` 同步用 `VIEW_SIZE` 而不是硬编码）,两栏布局下列宽更窄,实测 415px 视口下 CSS 盒 323×323、缓冲仍 800×800（dpr 1.25）。
- **内置浏览器的 `press_key`/`click` 按 uid 打不中时会静默无副作用**:重渲染后旧 uid 失效,回车选择、Esc 关闭、点结构按钮都出现"工具报成功、页面没反应"。这不是应用缺陷——同一批交互用 `evaluate_script` 派发（`element.click()` / PointerEvent）全部生效,且 vitest 已覆盖键盘路径。影响:验证结论必须以 DOM 探针或像素哈希为准,不能拿工具的"Successfully"当证据。
- **`git push` 走 schannel 时 TLS 握手随机失败**：M4 推送连报两次 `schannel: failed to receive handshake, SSL/TLS connection failed`,而同一时刻 `curl https://github.com` 与 `curl https://api.github.com` 都返回 200、`gh auth status` 正常——说明不是网络断了,是 git 的 schannel 后端在这次会话里过不去。解决（不改全局配置）:`git -c http.version=HTTP/1.1 push origin ...` 一次成功。以后碰到同样报错先试这一条,不要盲目重试或改 `http.sslbackend`。
- **合成 PointerEvent 测不出 OrbitControls 的旋转**:`pointerdown → pointermove → pointerup` 全在 canvas 上派发,画面哈希一点没动——OrbitControls 在 `pointerdown` 里要 `domElement.setPointerCapture(event.pointerId)`,而合成事件的 `pointerId` 不是真实活跃指针,这句直接抛错、旋转链根本没接上。影响:验证只能证明**按钮路径**（放大/缩小/复位）和选中/半透明重渲染,旋转必须真人手测,别拿"像素没变"当"旋转坏了"或"旋转验过了"。
- **整颗心脏必须按部件建材质,半透明层要关 `depthWrite`**:9 个部件共用一份材质就没法只高亮其中一个;而选中某结构时其余部件降到 0.3 透明度,若这些半透明层仍写深度,前面的部件会把后面的整块挡掉,画面看着像少了一半。解决:每结构一份 `MeshStandardMaterial`,`material.depthWrite = material.opacity > 0.9`;验证:`src/test/heart.test.tsx` 的 `partOpacity` 用例 + 浏览器点选后像素哈希变化。
- **把 `selectedId` 放进 GLB 加载 effect 的依赖 = 每次选中重载 9 个网格**:透明度只是材质属性,却会让整个 `Promise.all(GLTFLoader)` 重跑。解决:加载 effect 依赖只有 `[structures, supported]`,`selectedId` 走另一个 `useEffect([selectedId, status])` 调 `applyOpacities`;`react-hooks/exhaustive-deps` 之所以不报警,是因为加载 effect 里已经不再读 `selectedId`——**别为了"顺手初始化透明度"把它加回去**,`status` 翻到 `ready` 本身就会触发那个 effect。
- **回调 ref 在渲染期赋值会被 `react-hooks/refs` 拦住**:`onSelectRef.current = onSelect` 写在函数体里 ESLint 直接报 error。解决:放进 `useEffect(() => { onSelectRef.current = onSelect }, [onSelect])`;这个 ref 的存在本身是为了让加载 effect 不把 `onSelect`（每次渲染都是新函数）吃进依赖。
- **`noUncheckedIndexedAccess` 下 `scenes[index]` 判不出成对关系**:`structures.forEach((s, i) => scenes[i].…)` 类型上是 `Group | undefined`,两处报错。解决:让每个加载任务直接 resolve `{ structure, part }`,配关系写进类型而不是靠下标,顺带省掉一次越界可能。
- **3D 颜色"发白"先查混色,别急着调灯**:`MeshStandardMaterial` 受 three 的物理光照,出射 ≈ albedo × irradiance / π,所以灯要凑到辐照 2.5 上下受光面才贴得回色卡本色——但整颗心脏发白的主因不是过曝,而是 8 个 `DoubleSide` 半透明壳叠了三四层互相糊色,加上 `metalness>0 + roughness<1` 铺一层白色高光。解决:选中件 `transparent = opacity < 1` 走不透明通道（配合 `needsUpdate = true`）、非选中降到 0.18、`metalness 0 / roughness 0.85`、灯 1.6/1.4/0.3。**判据**用像素不看眼:选中心肌后与色卡 `rgb(181,101,29)` 距离 ≤40 的像素从 0 涨到 21,644,受光面亮度比 1.05;中途把灯压到 0.35/0.7/0.15 反而只剩 0.61（发暗）,又调回来了。
- **GLB 已经是"带平均法线的索引网格",再做法线平滑是空操作**:`mergeVertices` 对 83,496 个顶点合并掉 **0 个**（还花 188.4 ms）,myo 是 `posCount 38,674 / idxCount 232,692` 的索引几何、36% 顶点法线等于其面法线（说明法线本就平均过）,`computeVertexNormals()` 重算结果一致;浏览器端纹理指标前后逐字节相同。台阶感来自 96³ 体素的真实几何,想靠加密网格消除会先撞单文件 2 MB 闸（myo 已 1,816.4 KiB / 91%）。结论:**这类"看着有棱"的问题先量法线和顶点数,再决定改不改渲染层**。
- **读 WebGL 画布像素必须在同一次任务里 `drawImage`**:renderer 没开 `preserveDrawingBuffer`,帧一提交缓冲区就没了,`await` 之后再抓只剩空白。可用做法:同步点一下"放大"（`apiRef.dolly` 里带 `renderer.render`）,紧接着 `ctx.drawImage(canvas,0,0)`——M4c 的色卡距离统计就是这么测的。
- **中文单字会把检索阈值击穿**:`的/学/心` 这类单字在 23 条资料里几乎处处出现,"量子力学的波函数坍缩"曾因此拿到 4 条引用。解决:索引与查询都只用**双字及以上**中文词元和 ≥2 字母拉丁词（`retrieval.ts` 的 `usable`）,`minScore` 才有意义（现为 2.1）;改分词/阈值必须先跑 `retrieval.test.ts` 的越界用例。
- **检索来源列表本身也在被评委看**:低分条目只命中"心脏"这种通用词,模型可以不引用,但来源区一摊开就显得不专业——"心脏的瓣膜……"曾带出"心脏的位置与朝向","心动周期"带出 CT 时相条目。解决三件套:查询侧丢疑问/客套词与跨词虚词双字;`minScore` 参照 23 条小语料抬到 2.1;`planTurn` 判出主题后**按主题收窄候选**（解剖题只取 anatomy,CT 题保留 anatomy 作看图基础）。验证:`retrieval.test.ts` 9 条含"解剖题不混入 CT/站内目录""CT 题保留解剖条目"两个正反用例。
- **当前选中结构不能无条件塞进每次检索和提示词**:用户选中"心肌"后只问"心脏有哪些结构",回答却以"你现在查看的正是心肌层"收尾——焦点被当成了默认语境。解决:`planTurn` 先用 `asksAboutFocus` 判断问题是否真在指代当前页面（"它/这个结构/当前查看/切面/高亮"）,只有为真才 `anchor` 检索并注入 `[当前页面]`/`[当前切面]`;系统提示同时明确"泛指问题不得主动播报选中项"。验证:`turn.test.ts` 的"泛指心脏结构时不绑定当前选中结构"用例。
- **"我刚才问了什么"不是越界,是对话元问题**:原意图表只有解剖/CT/切面/站内/越界,这类问题落到 `off_topic` 的"超出范围"。解决:加 `meta` 意图,从浏览器带来的最近 6 条消息里抽 user 问题、零 token 生成清单,不调模型也不占配额;带具体解剖对象的追问仍走解剖题。验证:`intent.test.ts` 的元意图正反用例 + `turn.test.ts` 的历史清单用例。
- **Deno 入口不能塞进 Node 工具链**:`functions/index.ts` 用 `Deno.serve`/`Deno.env`,已从 eslint 与 tsc 排除,唯一门禁是 `deno check --no-lock --node-modules-dir=none functions/index.ts`;纯逻辑放 `functions/app/` 由 vitest 覆盖。为了让 Deno 与 tsc 都能解析,函数内导入带 `.ts` 后缀,tsconfig 必须保留 `allowImportingTsExtensions`。
- **别让 Function 在运行时读 JSON**:知识库若用 `Deno.readTextFileSync` 读 JSON,Edge 打包不保证把该文件带上去;已改为 `functions/knowledge/heart-knowledge.ts` 模块。以后加资料继续写 TS,不要改回 JSON。
- **`DASHSCOPE_API_KEY` 是应用 Secret,不进仓库、文档、前端或提示词**:本地只放 `.env`（已 gitignore）,线上只在 Qoder Sites 设置里用 Secret 输入框写入,发布时在 `secretNames` 声明名称;不要让用户把密钥贴进聊天,也不要让任何工具输出密钥。**生产端点已硬编码为官方公开兼容端点 `https://dashscope.aliyuncs.com/compatible-mode/v1`,代码不再读取 `DASHSCOPE_BASE_URL`**——曾因区域/工作空间端点多次 401,把变量留在链路里只会继续误导排障。
- **不要再用 `DASHSCOPE_BASE_URL` Secret 修 401**:该变量已从代码移除,配置它不会生效;2026-11-26 的实测链是:同一把 115 字符 key 对公开端点本地 200,线上仍 401 `invalid_key`,说明问题在 Secret 的**值**,不在端点。排障看 Function 返回的 `status.reason`（如 `http_401_invalid_key_ksk_lt80`,只含 `sk-` 前缀与长度区间,无字符内容）:`ksk_lt80` 就是"存了一把更短的另一把 key"。
- **`prepare_site` 不带 `functionDirectory` 会只发静态产物**:助手请求会 404,而且页面本身看起来完全正常,很容易误判"已发布成功"。发布小医版本必须显式传 `"functions"` 与全部应用的 `secretNames`,并且**新建 actionId**,不能复用 M6 的 `ec709890-…` 或已过期的预览草稿 `1b6356ad-…`。
- **手写 actionId/requestId 必须是合法 UUID variant**:`a05b8c43-…-c8b9-…`、`b16c9d54-…-d9ca-…` 被 `sites_invalid_request` 拒,不是参数内容错,而是第 4 组首字符为 `c/d`,不满足 Zod `.uuid()` 的 variant 位。解决:手写时第 4 组以 `8/9/a/b` 开头（如 `b3e4f5a6-7c8d-4e9f-8a1b-…`）。
- **Secret 输入框常被整行粘贴,清洗只剥包装不猜 key**:`normalizeApiKey` 会去掉 `DASHSCOPE_API_KEY=`、`export`、包裹引号/反引号与 `Bearer ` 前缀,内部换行仍视为配置错误;这能救"整行粘贴",但救不了"贴了另一把旧 key"。
- **Secret 编辑是否落盘不能用"我贴过了"判断**:`DASHSCOPE_BASE_URL` 的 `updated_at` 曾一直停在 10:49:57（用户保存过也不变）,而 `DASHSCOPE_API_KEY` 的更新（11:04:52）确实随发布生效;**删除 Secret 会被 `sites_secret_in_use` 拦住**,即使新发布只声明一个 Secret、旧 Secret 已不在必填列表里,服务器仍注入旧值,删名不如改值。以线上探针的实际分类为准,不看设置页的保存提示。
- **Qoder Sites 网关按单字节转发非 ASCII 请求体**:浏览器直接 POST 原始中文 JSON,Function 里 `request.text()` 拿到的是乱码,意图分类于是把"窗宽窗位是什么"判成越界静态回复（纯 ASCII 的 "CT是什么" 又正常）。解决:前端 `encodeChatBody` 把 U+007F 以上字符全部转成 `\uXXXX` 纯 ASCII 转义,经网关原样到达后再由服务端 `JSON.parse` 还原;`assistant.test.tsx` 用 `expect(body).toMatch(/^[\x20-\x7e]*$/)` 锁死。**排障顺序:先看请求体编码,再改意图词表。**
- **网关转发时后端收到的 URL host 与公开域名不同**:Function 里再拿 `new URL(request.url).host` 对比 `Origin` 会误杀合法同源请求,线上表现为 403 `origin_rejected`。同源写请求已由 Sites Gateway 在转发前校验（无/跨站 Origin 直接 `sites_gateway_origin_forbidden`）,Function 内不要再做 host 比较;验证方式是在线上页面直接提问能到达 `/chat` 且 `meta` 帧正常返回。
- **Deno 的 `--env-file` 不覆盖已存在的系统环境变量**:本机 shell 里已有一个同名 `DASHSCOPE_API_KEY` 时,`deno run --env-file=.env` 仍会使用 shell 的值,坏的测试 key 看起来"能用"。要验证 `.env` 内容必须 `env -u DASHSCOPE_API_KEY deno run --env-file=.env …`。
- **Git Bash 里 `curl -d` 会把中文请求体变成乱码**:服务端收到非 UTF-8 字节后意图分类落到越界静态回复。把 JSON 写成 UTF-8 文件,再用 `--data-binary @file` 发送;看到"左心室为什么壁厚"被判越界,先查编码而不是改意图词表。
- **助手面板的探针要等 React 提交,并按会翻转的文案找元素**:首次探针在点击后立刻读 DOM,`hasPanel:false`;启动按钮文案还会从"问问小医"变成"收起小医"。探针写成 async + `setTimeout` 等待,用包含"问问小医/收起小医"的文本匹配,不要依赖固定 uid。
- **隐藏页里 `setTimeout` 被节流到约 1 秒一次**:内置浏览器面板 `visibilityState=hidden`,需要几百次采样的"扫悬停"探针必然撞 15 s 工具上限。解决:探针改成少量 `await`（每结构一次）或直接读像素分类,别写密集轮询循环。
- **改完 Function 必须重启本地 Deno 进程**:端口 8000 上早于 CT 改动的旧进程仍在服务,首问"当前 CT 这一层有哪些结构"被回"这条消息里没有附带当前切面信息"——页面和请求都正常,是进程里的旧代码不认识 `ct` 字段。解决:杀掉旧 PID 后 `deno run --env-file=.env --allow-net --allow-env functions/index.ts` 重启,先核 `/health` 的 `aiConfigured:true` / `knowledgeChunks:23` 再复测。别把这种首答异常当成分流逻辑坏了。
- **CT 阅读器和三视图各有一个"高亮"复选框**:`.highlight-toggle input` 会先命中 TriView 的那个,探针点了之后只有三视图 overlay 消失,CT overlay 还在,看起来像"CT 高亮开关失效"。解决:CT 的开关必须限定在 `.ct-options .highlight-toggle input`;这是探针选择器问题,不是应用缺陷。
- **伪 CT 是"教学标注体素 → 近似 HU"的合成图,不是任何病例的 CT**:体素值只用于让灰度层次可读,不能反推真实组织密度;页面 note、构建期校验（必须含"非真实病例"/"不是真实病例"）与提示词三处都锁死了这个边界。以后接真实影像必须另立需求、另做许可与隐私评估。
- **折叠控件的 `aria-controls` 指向不存在的 id 会被 axe 判违规**:目录、三视图、CT 抽屉都是条件渲染,M8 初版把 `aria-controls="catalog-list"` 等写死,收起时目标节点不在 DOM。解决:`aria-controls={open ? id : undefined}`,只在展开时声明;验证:`a11y.test.tsx` 在展开目录+说明卡+三视图的末态跑 axe 0 违规。新增折叠区时照这个写。
- **黑底浮层版小屏会出现"按钮叠页脚、助手压 CTA"**:416×554 实测初版看 CT 在底部居中、页脚 58px 高、助手入口右下,三者两两相交。解决:窄屏把看 CT 改为左下小胶囊（隐藏副标题）、页脚限宽 `calc(100vw - 9.5rem)` 给助手让位、看 CT 抬到页脚上方、隐藏心脏缩放按钮、检索面板收紧;验证方法是 `getBoundingClientRect` 逐对求交,不是目测。真机 390×844 与桌面宽屏仍需人工过目。
- **说明卡在 554px 高的视口里要滚动才能看到"看 CT"**:卡内容高约 412px,而窄屏 `max-height: 54vh` 只有 299px;真实手机 844 高可一屏放下,内置浏览器面板太矮属工具限制。若以后要兼容矮屏,优先压缩信息卡行距或把看 CT 提到卡头,别把整个卡改成横向布局。
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
- [x] 2026-11-24 **M4 · 前端单页功能与可访问性**:检索（中/英/别名,三档排名 + 上限 8）、信息卡、三视图 + 可关高亮图层、GLB 3D（拖拽/滚轮/按钮缩放、无 WebGL 局部降级）、来源与许可提示、`h2` 分节 + combobox 键盘语义。门禁:prettier/eslint/tsc/`vitest 36 passed`/`vite build`（首屏 232.32 kB + 懒加载 639.88 kB）全绿;浏览器实测 63 个资产全部可取、3D 交互有像素证据、axe 0 违规。附带修掉宽屏画布被拉满整栏的缺陷（`max-width: 480px`）。
- [x] 2026-11-24 **M4 提交并推送**（人工批准）:`dd672d7` feat(web) / `82fcbcc` test(web) / `ab3b7b4` docs(standards);`git ls-files` 抽查 134 个跟踪文件,无影像/权重/压缩包/证件,最大对象 `myo.glb` 1.86 MB。
- [x] 2026-11-24 **M5 · CI 自检与 PR**（人工批准）:`306f2db` 推送后开 **pull/1** → `main`;Actions `pull_request` 与 `push` 两条 run 的两个 job 全 success、`gh pr checks` 四项 pass,US-1 AC2 落地。发布前另用 `vite preview` 验过 `dist/` 产物:四类路由 200、生产包交互正常、控制台零消息、axe 0 违规。合并留给人工。
- [x] 2026-11-24 **M4b · 整颗心脏 3D 与两栏布局**（用户追加需求,人工批准四个提交 → `f34ea8b` feat(web) / `9d1d4d8` test(web) / `f5d0260` chore(repo) / 本条 docs 提交）:`HeartModel` 用同一场景合成 9 个部件 GLB（世界毫米坐标,零配准）,悬停报名称、单击选结构、非选中半透明 0.3;删除单结构 `MeshViewer`,页面改左检索右展示两栏、48rem 退回单栏。门禁 prettier/eslint/tsc + **39 passed** + `vite build` 首屏 232.49 kB / 懒加载 642.89 kB 全绿;生产包实测合成成功、点选与信息卡同步、复位回到同一帧、控制台零消息。
- [x] 2026-11-24 **M4c · 整颗心脏配色校正**（用户反馈"颜色太浅",确认"A：保留层次";人工批准拆两个提交 → `eb8cc34` feat(web) / `590ea15` docs(standards)）:发白主因是双面半透明壳叠加 + 白色高光,不是过曝——选中件走不透明通道、`DIMMED_OPACITY` 0.3→0.18、`metalness 0 / roughness 0.85`、灯 1.6/1.4/0.3。像素判据:与心肌色卡距离 ≤40 的像素 0 → 21,644,受光面亮度比 1.05。用户批准的"法线平滑"经测量证伪（合并 0/83,496 顶点、GLB 本已带平均法线、纹理指标逐字节一致）后撤销。门禁 `npm run check` 全绿（39 passed）、`vite build` 642.99 kB;Actions `push` 与 `pull_request` 两条 run 的 4 个 job 全 pass。
- [x] 2026-11-26 **M6 · 发布到 Qoder Sites**（用户批准"把新版提交"）:`prepare_site`(actionId `ec709890-984b-4ffd-8b02-54bffe065b8a`,projectRoot `tianchiCompetition`、webDirectory `dist`) → `publish_site` → `get_publish_status` 返回 `published: true`、`committed: true`。线上 https://anatomy-sketch-ip6pfjkttvk.qoder.zone 回到新构建:`GET /` 200 且入口为 `index-B9dAoW10.js` / `index-s7-RRPQw.css`,`assets/HeartModel-BkImm3qP.js`、`assets/structures.json`、`assets/meshes/myo.glb` 全 200;真实页面探针:h2 = 已收录 9 个结构 / **心脏整体形态** / 结构详情,canvas 800×800,状态行"已高亮 心肌，其余部件半透明。",控制台零消息。替换前线上是 M4 时代的 `index-D0sjdlmb.js`（含 `MeshViewer`、"三维形态"）。
- [x] 2026-11-26 **M7b–M7d · 心脏学习助手初版**（用户批准范围"问答 + 示意切面讲解"、确认开启后端与 PAT 创建;初版代码未提交,后由同日定稿取代）:23 条许可可展示资料 + BM25（双字过滤）+ 意图/安全分流 + CoT/ToT 提示 + QCA 流式 Function（限流/并发/超时/降级）+ 右下角可访问面板（来源常显）。初版门禁 78 passed / 12 files,线上真实问答未验。
- [x] 2026-11-26 **M7 定稿 · 小医 + DashScope 真实模型**（用户要求头像、命名与密钥）:QCA 客户端替换为 DashScope OpenAI 兼容流式接口,模型 `qwen4-max`,密钥只来自 `DASHSCOPE_API_KEY`;删除 `cloud-agents.mjs` 与冷启动会话映射,历史改由浏览器携带最近 6 条消息;前端更名 **小医** 并用指定图片生成 256×256 WebP 头像;`/health` 增加 `aiConfigured`。门禁 `deno check` 通过、`npm run check` **84 passed / 13 files**、首屏 240.25 kB（gzip 76.70）。本地真实模型跑通:解剖题流式回答并带 `[1][2]`、CT 题、症状静态拦截、无效 key 降级;经 Vite 同源代理复测通过。已提交推送（`f7cd484` / `53cc91e` / `3fb583a`）,PR `pull/1` 四个 CI job 全绿,未合并。线上待发布后验收。
- [x] 2026-11-26 **M7 焦点/元问题修正**（用户实测反馈:选中"心肌"时问"心脏有哪些结构"被主动播报"你现在看的是心肌";问"我刚才问了你哪些问题"被回"超出范围";并要求继续保证逐段流式输出）:焦点改为**按需注入**（只有"它/这个结构/当前查看/切面/高亮"等指代才带当前结构与 `[当前页面]`）;新增**对话元问题**意图,从浏览器历史零 token 生成问题清单;泛指心脏组成改用上级分类检索,回答覆盖心壁/四腔/瓣膜/大血管/传导,不再误称心腔瓣膜没有资料;常见心脏疾病词归入解剖范围,资料不足才说知识库暂无;系统提示同步收紧"不得主动播报选中项"。门禁 **91 passed / 13 files**、`deno check` 通过、`vite build` 通过;真实模型五类问题复测通过,37 个 `delta` 在 1.24 s 内陆续到达。修正已提交 `918cb27`（7 个文件,+190/−11）,随本条文档一并推送;`Sites` Secret 已同步成功,旧草稿 `e5bd8226-…` 为修正前产物,需新 actionId 重新准备。
- [x] 2026-11-26 **M7a 伪 CT 轴位阅读器 + 小医 CT 上下文**（用户问能否上传 CT 给小医分析;确认**不上传真实影像**,用教学标注体素合成伪 CT）:Python `tools/asset_pipeline/ct.py` 从统一 96³ 体素生成 **192 张**双窗底图、**390 张**非空层结构 overlay、逐层体素真值与最佳层清单（1,067,656 B）;`catalog.validate_ct` 与前端 `assertCt` 双向校验 schema/note/文件/尺寸/层数/最佳层/逐层真值;新增 `CtViewer`（窗、滑杆、上下层、跳到最佳层、高亮开关、本层结构清单）与 `src/data/ct.ts`,三视图列宽未动;左列表选结构跳最佳层、CT 清单内选结构保持当前层;Function 侧 `parseCt` 只收层号/窗/结构 id/体素数,名称回查冻结表,只有明确层指代才注入 `[当前 CT 轴位]`。门禁 **115 passed / 15 files**、`deno check`、`vite build`（首屏 248.60 kB）、`pytest 106 passed / 96.58%`、`ruff` 全绿;真实浏览器 CT 交互与助手 CT 问答已验（详见上方 M7a 条目）。**代码与文档随本批提交,线上仍无 CT。**
- [x] 2026-11-26 **M7e · 含 Function 的公网发布与线上排障**:`1961022` 发布 M7a+M8 到 https://anatomy-sketch-ip6pfjkttvk.qoder.zone ,`/health`、CT 资产、3D 与布局探针全过;随后发现两个线上缺陷并修复——① Function 自比 host 导致合法请求 403（`cb4cdb5`）;② 网关破坏原始中文请求体,改前端 ASCII `\uXXXX` 转义（`b9282b1`）并加测试。`c9cef587-…` 已发布生效。随后线上真模型问答持续 401:Function 输出日志为空 → 在 SSE `status` 帧暴露粗粒度 `reason`（`8118efc`）→ 先抓到 `kbad`（Secret 整行粘贴）,服务端加 `normalizeApiKey`（`d24e54d`）;用户重贴后仍 401,`DASHSCOPE_BASE_URL` 的编辑却一直不落盘,遂把生产端点**硬编码为公开兼容端点**、不再读该变量（`d1ee76c`,actionId `a16b1c84-…`）;仍 401 后给 `reason` 增加 key 形状位（`99fcb09`,门禁 **117 passed / 15 files**）,发布 `b3e4f5a6-7c8d-4e9f-8a1b-2c3d4e5f6a7b`（publish operation `01a2179a-d40c-75d4-9864-2aa76aa2ded6`,`published:true`）。线上实测 `http_401_invalid_key_ksk_lt80`,而本地 `.env` 同一 115 字符 key 对同一公开端点 HTTP 200 → 结症是 **Secret 里存了另一把更短的 key**,待用户按 `.env` 原值重录后复测中文流式回答、来源时序与 CT 层问答。
- [x] 2026-11-26 **M8 沉浸式全屏心脏主页**（用户定下"黑底只有心脏 + 点结构出说明 + 按钮看 CT";四项均选推荐项）:`App.tsx` 重排为黑底全屏心脏舞台,`selectedId` 初值为空,右侧玻璃说明卡（窄屏底部抽屉）、左上检索/目录浮层（目录默认折叠）、三视图收进说明卡默认折叠、看 CT 侧滑 `role=dialog` 抽屉（遮罩/Esc/按钮关闭+焦点归还）,小医只在抽屉打开时携带 CT 本层真值;`HeartModel` 画布 900,`h2`/帮助文字仅视觉隐藏;深色主题覆盖旧浅色选中态,小屏页脚/看 CT/助手入口按矩形求交重排。门禁 `prettier/eslint/tsc` 全绿、**116 passed / 15 files**、`deno check` 通过、`vite build` 首屏 251.54 kB（gzip 80.01）+ 懒加载 643.08 kB + CSS 23.02 kB;真实浏览器验通选结构→说明卡→三视图→CT→切窗→小医带层作答,布局探针无重叠,控制台零消息。**代码与文档随本批提交**;宽屏观感待用户确认真实浏览器。

> 反臃肿:里程碑超过 15 条时,把更早内容合并成一行摘要,保持本文件可快速阅读。
