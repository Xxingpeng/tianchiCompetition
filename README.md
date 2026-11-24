# 解剖智绘 · Anatomy Sketch

> 2026 Qoder 高校创造力大赛参赛作品 · 赛道：Hack4Good 技术向善

把"解剖结构名称—切面位置—三维形态"三件事放在同一个页面里，供医学学习者建立空间对应。

**演示地址**：待发布后填写（Qoder Sites 公开 URL，无需登录）

## 请注意本作品的边界

- 页面中的切面与高亮是**示意模型的渲染结果**，不是真实病例影像，也不是任何分割模型的推理输出。
- 内容仅用于学习展示，**不含诊断、治疗或用药建议**。
- 三维几何主要来自 [BodyParts3D](http://www.openanatomy.jp/)：`BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International`。完整来源与许可判定见 [NOTICE.md](NOTICE.md)。

## 目录

```text
src/                 前端源码（React + TypeScript + Vite + Three.js）
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

准备资产输入（仅重建演示资产时需要）：把 BodyParts3D Release 4.0 的 OBJ 文件按 `assets_raw/README.md` 的清单放入目录，再运行 `tools/asset_pipeline` 的生成脚本。

## 开发约定

新会话或新工具接手本项目，先按顺序读 `standards/README.md`、`standards/00-project-context.md`、`standards/01-requirements.md`、`standards/PROGRESS.md`，再按 `standards/06-ai-collab-protocol.md` 的六步流程与确认门推进。

几条不可违反的边界：原始病例影像、模型权重、第三方原始数据包一律不入库；密钥只进 GitHub Secrets；`main` 只能通过 PR 合并且 CI 必须全绿；PR 由人审核、由人合并。
