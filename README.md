# 解剖智绘 · Anatomy Sketch

> 2026 Qoder 高校创造力大赛参赛作品 · 赛道：Hack4Good 技术向善

把"解剖结构名称—切面位置—三维形态"三件事放在同一个页面里，供医学学习者建立空间对应。

页面左列是结构检索与已收录清单；右列上半是**整颗心脏 3D**——9 个部件网格来自同一份标注体素、共用世界毫米坐标，放进同一场景自动拼合，把鼠标放到部件上显示名称、单击即选中该结构；下半是该结构的信息卡与轴/冠/矢三视图示意切面。窄屏（≤48rem）退回单列。

右下角的**心脏学习助手**可以回答心脏解剖与 CT 基础知识，并结合当前选中的结构和三视图取层来解释。它只基于 23 条带许可的公开资料检索作答，界面常显来源与许可；越界、症状、用药类问题不会进模型，直接给出范围说明或就医提示。

**演示地址**：https://anatomy-sketch-ip6pfjkttvk.qoder.zone （Qoder Sites 公开 URL，无需登录；含助手的版本待 M7e 重新发布）

## 请注意本作品的边界

- 页面中的切面与高亮是**示意模型的渲染结果**，不是真实病例影像，也不是任何分割模型的推理输出。
- 内容仅用于学习展示，**不含诊断、治疗或用药建议**；助手不接受影像上传，不能用于读片或病情判断。
- 三维几何主要来自 [BodyParts3D](http://www.openanatomy.jp/)：`BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International`。助手资料的来源与许可见 [NOTICE.md](NOTICE.md) §2a。

## 目录

```text
src/                 前端源码（React + TypeScript + Vite + Three.js）
functions/           Qoder Sites Functions（Deno）：/chat 流式问答 + /health；助手纯逻辑在 functions/app
public/assets/       发布用演示资产：structures.json / 切面图 / GLB 网格
tools/asset_pipeline 资产生成脚本（Python：网格→统一体素→三视图→GLB）
assets_raw/          第三方原始解剖资产（约 3.6 GB，被 .gitignore 排除，需自行下载）
standards/           项目上下文、需求 PRD、进度与坑（AI 协作活记忆）
.github/workflows/   CI（本仓库只有 CI，发布走 Qoder Sites）
```

## 快速开始

```bash
npm install
npm run dev        # 本地开发
npm run check      # 格式 + lint + 类型 + 测试
npm run build      # 产出 dist/
```

需要 Node.js ≥ 22.13（`package.json` 的 `engines` 已锁）。测试环境用 jsdom 29：jsdom 30+ 的 engines 下限是 22.22.2，在 22.13–22.21 上会让 vitest 起 worker 时崩在 undici 的 zstd 分支上，因此刻意不跟到最新版。

本地跑 Function 需要 Deno 与一个本地 `.env`（复制 `.env.example` 后填 `QODER_PAT`）；`.env` 已被 gitignore。启动示例：`deno run --env-file=.env --allow-net --allow-env functions/index.ts`（8000），另开 `npm run dev` 后 Vite 会把 `/functions/v1/app` 代理过去。线上站点的 PAT 由 Qoder Sites 平台注入，**不需要**在本地或仓库里保存任何线上密钥。Function 的机检门禁是 `deno check --no-lock --node-modules-dir=none functions/index.ts`。

准备资产输入（仅重建演示资产时需要）：把 BodyParts3D Release 4.0 的 OBJ 文件按 `assets_raw/README.md` 的清单放入目录，再运行 `tools/asset_pipeline` 的生成脚本。

## 开发约定

新会话或新工具接手本项目，先按顺序读 `standards/README.md`、`standards/00-project-context.md`、`standards/01-requirements.md`、`standards/PROGRESS.md`，再按 `standards/06-ai-collab-protocol.md` 的六步流程与确认门推进。

几条不可违反的边界：原始病例影像、模型权重、第三方原始数据包一律不入库；密钥只在平台 Secrets / Function 环境里，`.env` 不进 Git、`QODER_PAT` 不写进任何文档或前端；`main` 只能通过 PR 合并且 CI 必须全绿；PR 由人审核、由人合并。
