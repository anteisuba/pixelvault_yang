# Testing 参考 — 测试策略与现状事实

> 定位：测试体系的现状事实与纪律。检查项见 `checklists/`（各域 P0 都含测试项）；红线见 `forbidden.md` 测试节。

## 命令与闸门（2026-07-10 核验）

| 闸门                              | 内容                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test` / `test:run`       | Vitest（watch / 单次）                                                                                                                                                                                                          |
| `npm run test:replay`             | 助手回放基线（`src/test/assistant-replay/`，约 15 秒）；也在 `npx vitest run` 里，pre-push 一起跑                                                                                                                               |
| pre-commit（husky + lint-staged） | `*.{ts,tsx}` → prettier + eslint --fix；`*.{json,css,md}` → prettier                                                                                                                                                            |
| **pre-push（husky）**             | `tsc --noEmit` → `npm run lint` → `npx vitest run --reporter=verbose`——**三关全过才能推**（本机实测 2026-07-10：tsc 185s + lint 350s + vitest 412s ≈ **合计 15.8 分钟**，比旧口径"约 8–9 分钟"慢近一倍；不许 --no-verify 跳过） |
| CI `ci.yml`                       | push/PR 跑 tsc + lint、应用 unit、Execution Worker unit、依赖审计、Prisma drift + fresh-database replay 和生产 build（见 cicd.md）                                                                                              |

- **验证范围**：按 `docs/WORKFLOW.md` 的影响面分级。局部定向通过只报告定向通过；高风险共享改动和发布跑全量。长命令保留日志与真实退出码，不过滤错误来判绿，不无依据重复跑套件。

## 单元 / 组件测试（Vitest + @testing-library/react）

- 测试与源文件**同目录**；新增/修改功能必须带对应 `.test.ts(x)`。
- API route 助手：`src/test/api-helpers.ts`；route 必测五段：**401 → 400 → service mock → success → 500**。
- 分层测法：Service 测业务逻辑边界 · Hook 测状态变化与 API mock · Component 测渲染与交互。
- Zod schema 用 `.safeParse()` 测有效 / 无效 / 边界（不用 `.parse()`）。
- i18n 守护测试：`src/i18n/completeness.test.ts`（三语键齐全 + AI_MODELS 标签 + providers 文案）。

## 助手回放基线（`src/test/assistant-replay/`，2026-10-15）

附录M 五.6：**每期改完助手都跑一遍**（`npm run test:replay`），修 A 不悄悄弄坏 B；它也在 `npx vitest run` 里，pre-push 闸门自动带上。

- **跑的是真的那一条**：真路由 `POST` → `runAssistantV3` → 执行器 / 规划器 → 系统提示 → `resolveAssistantRoute`（库里的 key + 人设）→ AI SDK 的五家。只换最外圈：`fetch`（录好的模型回复、按扩展名现做的图 / 片子字节）、`@/lib/db`（`fake-db.ts`，任何写库都判红 —— 只有每轮的过程记录那一行例外，存进 `turnRecords` 另行对账）、Clerk 与限流、`decryptApiKey`。前端那一半（拼请求、读流、落 `canvas_batch`、`canvas_sync` 接力）在 `runner.ts` 里用前端同一批纯函数复现。
- **每题都判**：落了哪几种 op、起始 → 收尾画布的**完整**差异（没列的变了就算多改）、问题卡 / 确认卡、回复包含 / 不包含、第几次模型调用发出去的请求里含 / 不含哪几句（`stepPrompts`，查上下文瘦身：R02）、录好的主步回复不多不少、没有意外的网络，以及硬约束 `expectSelectedProviderOnly`：每一次碰模型（含收尾后在后台抽记忆那一跳）都是选定的那一家、那个型号、那把 key。`graders.test.ts` 是判分器自己的反例（每条硬约束都要真的会红）。
- **加一道题**：在 `fixtures/cases/` 放 `<题号>.json`（文件名 = `id`，schema 见 `fixture.ts`）。板子用 `fixtures/boards/` 里的（卡按名字写，句柄 `img-249e8b` 只出现在模型回复里）；`routes` 写选定的型号、配了 key 的几家（⭐ 多配几家当诱饵）和期望的那一家 / 型号（照写，⛔ 不从解析器抄）；`replies` 每次主步调用一条；`expect` 只写这题在乎的格。写题、查红题时 `REPLAY_DEBUG=1 npm run test:replay` 把每次模型调用、每一帧、画布差异印出来。
- **从真机的一轮做题**：助手每一轮都记在 `AssistantTurnRecord`（见 `database.md`「助手每轮的过程记录」）。由人导出那一行的 JSON（`row_to_json`），交给 `from-turn-record.ts` 的 `replayFromTurnRecord(row, { id, board })`：回来起始画布（存进 `fixtures/boards/`）与题目草稿（存进 `fixtures/cases/`），上一轮带进来的找到的东西（`#n`）照 `input.priorFinds` 原样进 `turn.priorFinds`（开轮那一跳带上）；补不出来的列在 `gaps` —— 折叠的镜、没地址的产出（换成假主机上的占位地址）、库外的 `@`、联网答复、记录里截掉的 `#n`，以及 `expect` 里除「怎么收、几次请求」以外的格（先 `REPLAY_DEBUG=1` 跑一遍再照实填）。⛔ 回放这边不连库取数。每一题也反过来对账：这一轮写下的那一行转得回同一道题（`gradeTurnRecord`）。
- **回放揭出真 bug**：题照留，加 `knownBug: { summary, evidence }`，跑成 `it.fails`（修好那天它变红，提醒删掉这一格）；⛔ 不拿它藏题目写错。
- **上下文预算**（设计方案 §2 / P2，`context-budget.test.ts`）：每道题按每条路由跑两轮（题目那一轮 + 历史里带着它再问一遍），量每次主步发给模型的「工具 + 系统提示 + 消息」字数、相邻两步逐字相同的前缀，以及按各家缓存规则真要重算的字数（`PrefixCache`：Claude 只认显式断点、往回找 20 块；别家按最长相同前缀；理想化，⛔ 不是实测命中率 —— 真机看 `assistant llm call` 日志里的 `cachedInputTokens` / `cacheWriteTokens`）。数字记在 `fixtures/context-budget.json`，按「不许变大」查首步、整轮、整轮重算、第二轮重算、辅助调用次数；`REPLAY_BUDGET=print npm run test:replay` 打表，有意改了提示词或量出变小时 `REPLAY_BUDGET=update npm run test:replay` 重写那份文件，并在提交里写为什么变。另断言一轮里每一步、每一跳接力与跨轮，工具 + 系统提示逐字相同（分界线之前的东西随人随轮变了就红）。
- **收尾后的后台调用**（`after()`，如 v3 抽记忆）：两个回放测试把 `next/server` 的 `after` 换成 `after-tasks.ts` 的 `collectAfterTask`，`runner.ts` 一轮（含接力各跳）跑完后 `settleAfterTasks()` 等完再判，后台那一跳记在发起它的那一轮里；录好的文本回复用完时回 `EMPTY_TEXT_REPLY`（`{"memories":[]}`）。
- 题单与覆盖面见 `assistant-v3.md` §3「自动回放基线」。

## E2E / 视觉回归（Playwright，`e2e/` 2026-07-10 清点）

| spec                                                   | 用途                                                  |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `auth.setup.ts` / `global.setup.ts`                    | 登录态与全局准备                                      |
| `landing.spec.ts` / `gallery.spec.ts` / `i18n.spec.ts` | 主路径 + locale 路由                                  |
| `mobile.spec.ts`                                       | 移动端主路径（`--project=mobile`，UI 改动必跑）       |
| `visual.spec.ts` + snapshots                           | 全站视觉基线                                          |
| `studio.visual.spec.ts` + snapshots                    | Studio 视觉基线（**依赖测试用户状态**，含 mask 方案） |
| `studio-auth.spec.ts`                                  | Studio 鉴权路径                                       |

- **视觉基线按 OS 分套**（`-win32` / `-darwin` / `-linux`，Playwright 自动选）：Mac + PC 双机开发，换机先 `--update-snapshots` 生成该 OS 的套；两套各自提交。
- 有意改动 UI 时更新基线并在报告里点名改了哪些快照——截图不是断言的替代品，具体值用 `toHaveCSS` / `toHaveClass` / `getByRole` 断。

## 环境与安全

- 测试用 key / 账号必须一次性 / dev 实例 / 限额；**严禁生产 key**。
- 本机 preview\_\* 浏览器连不上 localhost：UI 实跑用 claude-in-chrome；owner 已开 dev（3000）直接复用，绝不另起实例。
- dev server 跑着时不 build（毁 .next）。

## Source of Truth

- `vitest.config.ts` · `playwright.config.ts` · `e2e/` · `.husky/{pre-commit,pre-push}` · `package.json`（scripts + lint-staged）· `src/test/api-helpers.ts` · `src/i18n/completeness.test.ts` · `src/test/assistant-replay/`

## Last Verified

- Date: 2026-07-23 · Method: 核验应用 Vitest、Execution Worker 独立 Vitest、typecheck、changed-file ESLint 与 CI 闸门。全量应用测试在并发负载下仅有两个未改 UI 文件超时，两个文件隔离重复运行均 14/14 通过；不能把这种隔离结果表述为全量全绿。
