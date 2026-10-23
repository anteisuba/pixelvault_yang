# Testing 参考 — 测试策略与现状事实

> 定位：测试体系的现状事实与纪律。检查项见 `checklists/`（各域 P0 都含测试项）；红线见 `forbidden.md` 测试节。

## 命令与闸门（2026-07-10 核验）

| 闸门                              | 内容                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test` / `test:run`       | Vitest（watch / 单次）                                                                                                                                                                                                                                                                                                                                                        |
| `npm run test:eval`               | 助手实跑评测（打真模型、花钱；没设 `ASSISTANT_EVAL_DIR` 就跳过），见下文「助手实跑评测」                                                                                                                                                                                                                                                                                      |
| pre-commit（husky + lint-staged） | `*.{ts,tsx}` → prettier + eslint --fix；`*.{json,css,md}` → prettier                                                                                                                                                                                                                                                                                                          |
| **pre-push（husky）**             | **非 main**：只查相对 `origin/main` 的改动——`tsc --noEmit`（incremental）→ 改动的 `src/**/*.ts(x)` 跑 eslint → `vitest run --changed <merge-base>`；只改文档/工具直接跳过；动了 `package*.json` / `vitest.config.ts` / `tsconfig.json` 时 vitest 全量。**推 main**：仍跑全量三关。全量把关在 CI（owner 2026-10-21 拍板：旧版每次全量实测 ≈ 15.8 分钟）。不许 --no-verify 跳过 |
| CI `ci.yml`                       | push/PR 跑 tsc + lint、应用 unit、Execution Worker unit、依赖审计、Prisma drift + fresh-database replay 和生产 build（见 cicd.md）                                                                                                                                                                                                                                            |

- **验证范围**：按 `docs/WORKFLOW.md` 的影响面分级。局部定向通过只报告定向通过；高风险共享改动和发布跑全量。长命令保留日志与真实退出码，不过滤错误来判绿，不无依据重复跑套件。

## 单元 / 组件测试（Vitest + @testing-library/react）

- 测试与源文件**同目录**；新增/修改功能必须带对应 `.test.ts(x)`。
- API route 助手：`src/test/api-helpers.ts`；route 必测五段：**401 → 400 → service mock → success → 500**。
- 分层测法：Service 测业务逻辑边界 · Hook 测状态变化与 API mock · Component 测渲染与交互。
- Zod schema 用 `.safeParse()` 测有效 / 无效 / 边界（不用 `.parse()`）。
- i18n 守护测试：`src/i18n/completeness.test.ts`（三语键齐全 + AI_MODELS 标签 + providers 文案）。

## 助手回放基线（已删，2026-10-23）

v3 那套录好回复的回放基线（`src/test/assistant-replay/` 的题、判分器、上下文预算、长对话）录的是 v3 环的协议，第 9c 步删旧内核时一起删了；只留实跑评测用的 `fake-db.ts` 与 `after-tasks.ts`。新内核的回归靠下面的实跑评测（等第 9 步全部做完再统一跑，花用户额度）。

## 助手实跑评测（`src/test/assistant-eval/`，2026-10-22）

助手重设计第 1 步：拿真实过程记录当考题、用真模型重跑，量完成率、工具错误率、往返数、改一处是否变成整段重写、花费与时长。**要花钱，只在本地手动跑**；没设 `ASSISTANT_EVAL_DIR` 时整组跳过（CI 不跑）。

- ⛔ 题目是创作者的真实对话：`scripts/assistant-eval-export.mjs` 只读导出到仓库外的 `ASSISTANT_EVAL_DIR`（`turns/<id>.json` + 分层抽样的 `cases.json`），结果写回 `runs/<label>/`（逐题 JSON、`summary.md`），⛔ 不进仓库。
- 跑法：`ASSISTANT_EVAL_DIR=… npm run test:eval`；可选 `ASSISTANT_EVAL_ONLY=<id,…>`、`ASSISTANT_EVAL_SHARD=1/4`（多进程并行）、`ASSISTANT_EVAL_LABEL=<名字>`。云会话要 `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`。
- 与回放共用 `fake-db.ts`：只有用户、key（库里那把的密文，真解密）、人设有内容，查素材库一律查不到。
- 每题量两遍同一套指标：线上那一次（记录里的 transcript）与这次重跑，判分（Sonnet 5.5）也各判一次；判分只看文字、看不到图。

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

## UI 验收（登录后截图 + 动效参数，2026-10-21 owner 拍板）

`node e2e/tools/ui-check.mjs <baseURL> [path ...] [--video]`：登录测试用户 → 每个 path 截桌面 1440 / 手机 390 → 录入场动画参数（`getAnimations()`）、`reduced-motion` 下残留动画、`scripts/ui-probe.js` 几何探针、console error / 失败请求 → `scratchpad/ui-check/report.json` + png（`--video` 加 webm），stdout 只打精简摘要。

- **目标优先 Vercel Preview**（每个改 `src/` 的 PR 自动部署）；本地 dev 也能跑。Preview 开了 Deployment Protection，需 `VERCEL_AUTOMATION_BYPASS_SECRET`；Preview 的 Clerk 必须与跑脚本处的 `CLERK_SECRET_KEY` 是**同一个 dev 实例**，否则 testing token 无效。
- ⚠ Preview 的 `DATABASE_URL` 与生产共用（owner 2026-10-21 知情接受）：测试账号只读浏览，别在 preview 上点生成 / 删除。
- **分档与 token**：小改只给 preview 链接；中改跑脚本，Claude 只读文字摘要、图片直接转 owner 不打开；**视觉判断归 owner**，owner 说要优化时 Claude 才打开截图看实际样子再改。
- 云端容器：出网只有 HTTPS 代理，Node 侧要 `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`（脚本与 dev server 都要）；Postgres 直连（5432）不通，本地 dev 在云端只能看 UI 外壳、DB 接口 500。

## 环境与安全

- 测试用 key / 账号必须一次性 / dev 实例 / 限额；**严禁生产 key**。
- 登录态测试用户（`auth.setup.ts`）：Clerk dev 实例专用用户，只配 `E2E_CLERK_USER_EMAIL`（`.env.local`），必须是 `+clerk_test` 地址；走 `email_code` 策略、固定码 424242（应用已不开密码登录，故无密码变量）。
- 本机 preview\_\* 浏览器连不上 localhost：UI 实跑用 claude-in-chrome；owner 已开 dev（3000）直接复用，绝不另起实例。
- dev server 跑着时不 build（毁 .next）。

## Source of Truth

- `vitest.config.ts` · `playwright.config.ts` · `e2e/`（含 `e2e/tools/ui-check.mjs`）· `.husky/{pre-commit,pre-push}` · `package.json`（scripts + lint-staged）· `src/test/api-helpers.ts` · `src/i18n/completeness.test.ts` · `src/test/assistant-replay/`

## Last Verified

- Date: 2026-07-23 · Method: 核验应用 Vitest、Execution Worker 独立 Vitest、typecheck、changed-file ESLint 与 CI 闸门。全量应用测试在并发负载下仅有两个未改 UI 文件超时，两个文件隔离重复运行均 14/14 通过；不能把这种隔离结果表述为全量全绿。
