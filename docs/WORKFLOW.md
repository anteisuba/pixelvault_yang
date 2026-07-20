# PixelVault 工作流 — WORKFLOW.md

> 核心逻辑：**用流程和品质底线保证质量，不用统一视觉答案限制业务域**。三层控制：**流程**（本文件 + scenes/）→ **规范**（forbidden.md / references/ / 当前 active plan）→ **起点**（templates/）。Agent 先问、再读业务与工程约束、复用成熟行为、按 checklist 自检、交付带证据的报告；视觉方向按业务域确认。

> **UI 现行治理（2026-07-19）**：`brand-dna.md` 只定义薄品牌脊柱、设计权力分层与品质底线，不提供全站皮肤。新 UI 不得从旧 `direction.md`、archive、当前页面或既有组件外观中选择造型答案；视觉方向必须按业务域完成三方向与关键切片并经 owner 确认。历史迁移记录已归档，不进入默认阅读链。

## 七步总骨架（所有场景共享的不变量）

| #   | 动作                                                | 目的             |
| --- | --------------------------------------------------- | ---------------- |
| 1   | 问 5 个问题（通用 5 问 + scene 专属 5 问）          | 不自作主张       |
| 2   | 读 active plan + forbidden + 对应 scene 文件        | 先确认边界再动手 |
| 3   | 从 templates/ 骨架起步                              | 从半成品开始     |
| 4   | 从 references/ 核对业务事实与成熟交互模式           | 不重复踩坑       |
| 5   | 复用既有行为/API/工具（先 grep exports 和调用方）   | 外观可由域覆盖   |
| 6   | 对照 checklists/ 自检                               | P0 不过打回      |
| 7   | 交付报告：改动清单 + 验证结果 + 手动验证步骤 + 图示 | 完成必须可核对   |

步骤 3–5 的具体形态因场景而异：**前端、后端、测试三类工作各有独立工作流**，定义在各 scene 文件的「本场景工作流」节（批 3 填充；填充前按本骨架 + 通用 5 问执行）。

## 第 1 步 · 5 问硬门

通用 5 问——任何非 trivial 任务开工前必须有答案，没有答案就停下来问用户：

1. 目标是什么？（一句话、可验证）
2. 影响哪些用户 / 路由 / 模块？
3. 成功标准是什么？
4. 禁止改动的范围是什么？
5. 用什么证据验证？

每个 scene 另带专属 5 问（例：db-migration 会问「可回滚吗 / 存量数据怎么迁」；ui-page 会问「参考集或设计稿在哪 / 走哪级确认阶梯」）。trivial 修改（约 10 行以内的机械改动）可跳过，但完成报告里必须说明跳过了什么、为什么。

## 路由矩阵（任务类型 × 业务域）

**第一维：任务类型 → 决定 scene（工作流 + 模板 + checklist）**

| 任务类型                             | scene（批 3 填充）       | checklist              |
| ------------------------------------ | ------------------------ | ---------------------- |
| 产品内页 UI（Studio / 画布 / LoRA…） | scenes/ui-page.md        | checklists/ui.md       |
| 营销页（首页 / Landing）             | scenes/ui-marketing.md   | checklists/ui.md       |
| API route 新增/修改                  | scenes/api-endpoint.md   | checklists/backend.md  |
| Service / 业务逻辑                   | scenes/service-change.md | checklists/backend.md  |
| 接入新模型 / provider                | scenes/new-model.md      | checklists/backend.md  |
| Prisma schema / 迁移                 | scenes/db-migration.md   | checklists/database.md |
| 测试补齐 / 测试策略                  | scenes/testing.md        | checklists/release.md  |
| Bug 诊断修复                         | scenes/bugfix.md         | 对应域 checklist       |
| 调查 / 可行性 / 技术选型             | scenes/research.md       | —（产出=可拍板结论）   |
| Ship / 部署 / 发布                   | scenes/deploy-release.md | checklists/release.md  |

**第二维：业务域 → 决定额外必读**

| 业务域                                                           | 额外必读                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| studio / gallery / assets / prompts / cards / arena / profile 等 | references/domains/<域>.md（批 2 填充前以代码为事实源）                                                 |
| 画布 node-workflow                                               | 当前业务收口读 plans/canvas-baseline.md；未来视觉改版重走 ui-page scene                                 |
| LoRA                                                             | 先读 references/domains/lora.md；当前业务收口再读 references/pages/lora-workbench.md 与对应 active plan |
| 音频                                                             | 业务与功能事实读 plans/audio-domain-design-2026-07.md；未来视觉方向独立确认                             |
| Comfy runner                                                     | plans/comfy-runner-HANDOFF-2026-07.md + deployment-research                                             |

**在飞任务包（plans/）的优先级高于长期文档，但只在自身已授权任务范围内生效。** 功能收口任务包不能覆盖现行 UI 治理，也不能把历史视觉描述恢复为下一版页面规范。

## 不确定即停止

不能猜：产品方向、API 契约、provider 能力、模型参数、计费规则、权限边界、数据持久化策略。出现多个合理方向 / 代码与文档冲突 / 要改认证·积分·存储·DB·外部契约时 → 停止，给出：已确认事实 / 不确定点 / 可选方向 / 推荐方向和理由。

## 联网核验

改 provider / model / API / 价格 / SDK / 平台行为前必须查官方一手资料。优先级：官方 API 文档 > SDK 文档与 changelog > model card > 官方公告 > 代码现状。官方资料与代码冲突时不许直接改代码迎合，先暴露冲突等确认。

## Commit / Push 规则

**分支**：默认直接在 main 上做（owner 拍板，不自动开 feature 分支）；要开分支先问 owner。

**Commit**：

- 时机：一个可验证的完整切片（功能 / 修复 / 文档批次）+ 对应 checklist 过了才 commit，不 commit 半成品。Agent 默认先给 owner 核对，owner 确认或明确授权后才 commit；唯一例外是删除类操作前的保险快照（也要先说明再做）。
- 信息格式：conventional commits（`feat / fix / docs / refactor / test / chore: 简短英文摘要`，正文可中文）；AI 参与的提交结尾带 Co-Authored-By 行。
- pre-commit 自动跑 lint-staged（prettier / eslint --fix 会改暂存文件，属正常）。
- **严禁**：secret / `.env` / 测试 key 入库；`--no-verify` 跳钩子。

**Push**：

- **push main = 触发 CI + Vercel 生产部署**——push 前必须过 `checklists/release.md` P0（全量 vitest + 全量 tsc + lint/build 全绿）。
- pre-push 钩子三关（tsc + lint + 全量 vitest，约 8–9 分钟）是成本也是底线，不许跳过；定向子集不算绿。
- push 后确认 `ci.yml` 绿；Production 部署后 `deploy-check` 冒烟通过才算落地。

## 文档同步

任务完成时：`status.md` 覆盖更新；完成的 plans/ 任务包必须删除、归档到 archive/ 或沉淀进 references/；能更新现有文档就不新建。
