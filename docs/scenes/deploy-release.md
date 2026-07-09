# Scene · Ship / 部署 / 发布（deploy-release.md）

> 覆盖：commit、push、上线、发布后确认。**push main = 生产部署**（Vercel 自动），所以本场景的每一步都是生产动作。Commit/Push 通用规则见 `../WORKFLOW.md`；对应 checklist：`checklists/release.md`。执行循环可用 `ship` skill。

## 专属 5 问（开工硬门）

1. **本次发布包含什么？**——`git status` + diff 逐项过：有没有混进无关改动/半成品/临时调试代码？有就先剥离，不夹带。
2. **发布闸门过了吗？**——`checklists/release.md` P0 全绿：全量 vitest + 全量 tsc + lint/build（dev 跑着时不 build）。没过 = 不 commit。
3. **有 schema 迁移或环境变量变更吗？**——有迁移：确认生产库迁移策略与部署顺序（先迁库还是先发码，取决于兼容性方案）；有新 env：Vercel 控制台配好了吗（`NEXT_PUBLIC_` 白名单守住）？
4. **部署后怎么确认、怎么回滚？**——`deploy-check` 自动冒烟之外，手动走一条主路径（端到端生成一张图）；出问题的回滚动作是什么（Vercel rollback 到上一 deployment）？
5. **文档与任务包同步了吗？**——`status.md` 覆盖更新；完成的 `plans/` 任务包删/归档/沉淀；涉及模型的更新 `model-catalog.md`。

## 本场景工作流

1. 问 5 问。
2. **Commit**（按 WORKFLOW 规则）：owner 点头 → diff 里无 secret/.env/测试 key → conventional message + Co-Authored-By → pre-commit lint-staged 自动格式化属正常。
3. **Push 前闸门**：release checklist P0 全过；pre-push 三关（tsc + lint + 全量 vitest，约 8–9 分钟）耐心等完，**不 `--no-verify`**。
4. **Push** → 盯 `ci.yml` 绿；红了就修，**不 force push 覆盖**。
5. **部署确认**：Vercel Production 完成 → `deploy-check` 冒烟通过 → 手动主路径一条（生成→入库→画廊可见）。
6. **异常处理**：部署后发现问题 → 先 Vercel rollback 止血 → 再按 `bugfix.md` 慢修根因 → 全程向 owner 同步。
7. 收尾：status / 任务包 / 相关文档同步（第 5 问的答案落实）。
8. 交付报告：commit 列表 + 各闸门结果 + 部署确认证据 + （如有）回滚预案。

## 必读清单

`../WORKFLOW.md`（Commit/Push 规则）· `checklists/release.md` · `references/cicd.md`（5 workflows 行为）· 有迁移时加 `scenes/db-migration.md` 的部署顺序答案

## 禁改范围默认值

不 force push · 不 `--no-verify` · 不在发布流程里顺手夹带代码改动 · 生产环境变量变更 = 先问 owner。

## 验证命令

`git status` / `git diff --stat`（夹带检查）→ release checklist P0 全套 → push 后 `gh run watch`（或 Actions 页）→ 生产 URL 主路径实测。
