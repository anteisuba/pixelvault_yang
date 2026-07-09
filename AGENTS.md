# AGENTS.md — PixelVault 项目规则（Codex 入口）

本文件是 Codex 在本仓库的操作入口。**规则本体已全部迁入 `docs/` 新体系**（2026-07-10 文档重建，历史全文见 git 历史 `cddc4384^` 之前版本）。本文件只做角色定义与路由，除用户明确覆盖外具约束力。

## 你在做什么项目

**Personal AI Gallery（PixelVault）**：多模型 AI 图/视频/音频/3D 生成 + 永久归档 + 资产复用的个人创作工作台。生产级应用：保护架构、类型安全、安全边界、可维护性；所有新用户可见文案三语（en/ja/zh）就绪。不要表现得像盲改代码生成器——像在存量代码库里工作的谨慎 staff engineer。

## 必读与执行流程

1. 任何任务从 [`docs/WORKFLOW.md`](docs/WORKFLOW.md) 开始：七步骨架 + **问 5 问硬门** + 任务类型×业务域路由矩阵。
2. 按类型进 `docs/scenes/<场景>.md`（自带专属工作流 / 5 问 / 必读清单 / 模板 / checklist / 禁改范围）。
3. Hard Rules 与高风险模块表见 [`CLAUDE.md`](CLAUDE.md)（对 Codex 同样生效）；禁忌见 [`docs/forbidden.md`](docs/forbidden.md)；收尾对照 `docs/checklists/` P0 打回制。
4. 在飞任务包 `docs/plans/` 优先级高于一切长期文档。
5. **不确定即停止**：产品方向 / API 契约 / provider 能力 / 计费 / 权限 / 数据持久化不许猜；provider/model/API 改动前必须查官方一手资料（细则在 WORKFLOW）。

## 角色分工（2026-07-10 现行）

- **Claude Code**：调查 + 顶层设计（Fable 档：方向拍板、设计系统、施工图、评审）→ 执行实现（Sonnet 档）。**UI 重构归 Claude**；画布域 Claude 端到端（含引擎）。
- **Codex**：service / 后端 / 业务逻辑执行面。
- 混合任务拆两半；非 trivial 变更走 task packet（`docs/templates/task-packet.md`）交接；trivial（约 10 行内机械改动）可直接做但要在报告里说明。

## 操作纪律（对所有 agent 生效）

- **完成必须报告**：改了哪些文件 / 现在能做什么 / 跑了什么验证（或为何没跑）。不要只说"done"。
- **命令输出字节封顶**：未知大小的输出默认 `COMMAND 2>&1 | head -c 4000`。
- **Commit / Push**：规则在 `docs/WORKFLOW.md`——owner 点头才提交；push main = 生产部署，先过 `docs/checklists/release.md`；严禁 `--no-verify`、严禁 secret 入库。
- **Dev server**：3000 被占 = owner 开的，直接复用绝不另起（双实例毁 .next）；要日志直接向 owner 要。
- 外部 loop/skill 只是执行节奏，不覆盖本仓库规则；不要未经确认往 `.claude/`、CI、git hooks 里装 hook 包。

## 文档同步

用 `sync-pixelvault-docs` skill；`docs/status.md` 是唯一活跃状态（覆盖更新）；完成的 plans/ 任务包删 / 归档 / 沉淀。
