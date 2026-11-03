# Testing 参考 — 测试策略与现状事实

> 定位：测试体系的现状事实与纪律。检查项见 `checklists/`（各域 P0 都含测试项）；红线见 `forbidden.md` 测试节。

## 测试标准（owner 2026-11-03 定，全项目通用）

> 目标：测试证明「功能真能跑通」，不是「代码按写的样子被调用了」。新写的测试照这节写；旧测试按「迁移」分批改过来。页面版：https://claude.ai/artifact/ShD8bryNx8hPBNW6d4KV2S

### 六层

| 层  | 名字             | 文件                     | 测什么                                                                                                       |
| --- | ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| L0  | 静态             | —                        | tsc + eslint（含本节硬规矩的 lint 规则）                                                                     |
| L1  | 单元             | `*.test.ts`（node）      | 纯逻辑：解析、换算、拼提示词、规则判断。不碰数据库、不开 DOM                                                 |
| L2a | 服务 + 真数据库  | `*.int.test.ts`          | service 连真 Postgres（CI：Postgres 16 容器；本机：PGlite），每例清干净；外部 AI / R2 用假                   |
| L2b | 界面集成         | `*.test.tsx`（jsdom）    | 真组件 + 真 hook + 真 store + 真 context 一起渲染，只假网络（api-client）                                    |
| L2c | 助手工具后置检查 | 按工具清单生成           | 每个改台面的工具执行后，读助手下一步看到的台面快照，断言改动在、副作用没多写；外加线上出事对话的工具调用回放 |
| L3  | 契约             | `contract.test.ts`       | 服务商官方返回样本喂解析代码（见下文 Worker 契约测试）                                                       |
| L4  | 端到端           | `e2e/journeys/*.spec.ts` | Playwright 登录测试账号 + 假出图服务：关键链路 + 冒烟（每个台、每个库页打开不崩、控制台无报错），CI 每次跑   |
| L5  | 助手评测         | `test:eval`              | 真模型 68 题，管话术质量；花钱、手动                                                                         |

关键链路（L4）：① 工作台出图 → 进素材库 ② 助手挂 / 摘 / 再挂 LoRA，台面一致、收藏不多写 ③ 角色页聊一句 ④ 画布镜头表新建 → 发送 ⑤ 冒烟全台全库页。

### 改什么，必须带什么

| 改动                              | 必须带        | 要点                                                                                                             |
| --------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| 纯逻辑 / 解析 / 换算              | L1            | 有效、无效、边界各一条                                                                                           |
| service 读写数据库                | L2a           | 本人数据隔离、唯一约束 / 长度上限、连点两次不重复写                                                              |
| 新 API 路由                       | L2a 或 L1     | 401 / 400 / 500 由路由工厂统一测一次，各路由不再抄；只测业务分支和「别人的数据拿不到」                           |
| 组件 / 交互                       | L2b           | 断言用户看得到的字、按钮状态、弹框，不断言内部 state                                                             |
| 新页面 / 新台 / 新库页            | L4 冒烟       | 冒烟清单加一行                                                                                                   |
| 主要功能流程                      | L4 链路       | 改到链路上任何一环，那条链路必须过                                                                               |
| 助手工具                          | L2c           | 工具在清单里声明「改哪块台面」，没声明直接红                                                                     |
| 接入 / 改外部服务                 | L3            | 样本写明来源和抓取日期，不录 key 和用户内容                                                                      |
| 错误显示（API / 生成 / 助手出错） | L1 + L2b + L4 | 新原话先进样本表再改分类规则；整链真跑：假服务端回各类错误，断言界面是对应语言那句、不是英文原话；新错误码三语齐 |
| 助手内核 / 提示词                 | L5            | 动内核跑评测，先问额度                                                                                           |
| 纯样式、布局                      | 不写测试      | 截图给 owner 看                                                                                                  |
| **修线上 bug**                    | 先写复现      | 先写会红的测试再修，放在「不用假的就能复现」的最低层；提交说明写一行「L? 本该拦住」                              |

### L2a 真库测试怎么写

- 命令 `npm run test:int`（= `vitest run --project int`）。本机不用装 Postgres：没设 `TEST_DATABASE_URL` 时自动起内存 PGlite（含 pg_trgm），直接执行 `prisma/migrations/*/migration.sql`；CI 用 Postgres 16 容器（`TEST_DATABASE_URL`）。⛔ 绝不连 Neon：global-setup 见到 `neon.tech` / `pooler` 直接报错；也不跑 `prisma migrate`（`.env.local` 里是生产 `DIRECT_URL`）。
- 底座在 `src/test/int/`：`resetDatabase()` 每例 `beforeEach` 清空全部表；`createTestUser()` 建一行完整用户（带 email/username，`ensureUser` 不去调 Clerk）。
- 文件串行跑（`fileParallelism: false`），共用一个库；用例之间不靠顺序。
- 样板：`src/features/assistant/services/assistant-skill.service.int.test.ts`（同名旧行 + 开内置技能不撞唯一约束、连点两次只落一行、用户隔离）。

### L2b 界面集成怎么写

- 底座 `src/test/app-harness.tsx`：`renderWithApp` / `renderHookWithApp` 用真 next-intl + 整份三语文案（⛔ 不手写小份 MESSAGES、不替掉 `next-intl` / `api-error-message`）；`message('Errors.x.y', locale)` 取原文做断言。
- `fakeServer()` 只替 `fetch`：按「方法 + 路径」登记处理函数，可以直接用 `createApiRoute` 等工厂做真路由；没登记的请求直接报错；`goOffline()` 模拟断网。
- 样板：`src/test/chains/error-display.test.tsx`（错误显示整链：服务端各类出错 → 技能页 / 出图舞台上是对应语言那句、不是英文原话）。

### L2c 助手改台面工具怎么写

- 清单在 `src/test/assistant-bench/bench-effects.int.test.ts` 的 `BENCH_EFFECTS`：`ASSISTANT_OPERATOR_MUTATING_TOOLS` 里每一条都要声明「改哪几格台面」（`run.state` 的键）或「不在台面上、为什么」。**新加会改东西的工具不声明，清单那一例直接红。**
- 声明了改台面的逐条真跑（L2a 真库 + 真 `prepareOperatorTurn`，不调模型）：`planTool` 必须是 `mutate` → `apply()` 后这一轮台面真变（⛔ 空操作）、只变声明的格、助手下一步 `read_state` 读得到。
- 线上出过事的对话把工具调用原样写成一条回放放在同文件（第一条：11-03 摘下 LoRA 挂不回去；它还查出同轮重复挂同一把没拦，已修）。
- 还没覆盖：画布两条（浏览器落一批、下一跳带新快照回来，另测）；浏览器那一侧把同一步落到真表单之后的快照（下一轮）还没对账。

### 四条硬规矩

1. **只假边界**。可以假：网络请求（api-client / fetch）、AI 服务商、R2、Clerk 登录、时钟、随机数、logger。不许假：自己的 service、hook、store、context、组件；L2a 不许假数据库。
2. **断言结果，不断言过程**。看界面上的字、数据库里的行、返回值、发出去的请求内容；`toHaveBeenCalled` 只用于边界（确实发了请求、确实扣了点数）。
3. **不真等**。重试、超时、轮询一律假时钟；单个文件超过 3 秒要写理由。
4. **一条规则只在一处测**。在最能代表用户的那层测一次，不在路由、service、hook 各抄一遍。

第 1、3 条已做成 lint 规则自动拦（`eslint.config.mjs`「测试标准门」，规则与可假的边界清单在 `scripts/test-standard/rules.mjs`）：测试里 `vi.mock('@/…')` 不在边界清单里就红；`setTimeout(…, ≥50)` 真等就红。门会不会红、名单是否只减不增由 `src/test/test-standard.contract.test.ts` 复核。

### 迁移旧测试（棘轮）

- 基线（2026-11-03）：974 个文件里 351 个假了自己的非边界模块、99 个假了数据库；197 个路由里 102 个有测试，全抄 401 / 400 / 500。
- 待迁名单：`scripts/test-standard/mock-baseline.json`（2026-11-03 上线时 402 个文件，含假数据库的），**名单只减不增**；新文件必须合规，改到名单里的文件顺手迁出并从名单删掉（迁好了还留在名单里，契约测试会红）。
- 按域分批，先迁出事最多的：助手工具与台面 → LoRA（挂载、收藏）→ 角色 / 出门 → 技能、配方、点数（数据库）→ 画布 → 其余。每个域迁完删掉被替代的旧测试。
- 记账：每个线上 bug 在施工单记一行「哪层拦住 / 本该哪层拦住」，一个月后按此砍不干活的那类测试。

## 命令与闸门（2026-07-10 核验）

| 闸门                              | 内容                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test` / `test:run`       | Vitest（watch / 单次）                                                                                                                                                                                                                                                                                                                                                                          |
| `npm run test:eval`               | 助手实跑评测（打真模型、花钱；没设 `ASSISTANT_EVAL_DIR` 就跳过），见下文「助手实跑评测」                                                                                                                                                                                                                                                                                                        |
| pre-commit（husky + lint-staged） | `*.{ts,tsx}` → prettier + eslint --fix；`*.{json,css,md}` → prettier                                                                                                                                                                                                                                                                                                                            |
| **pre-push（husky）**             | 推分支和推 main 一样：只查相对 `origin/main` 的改动——`tsc --noEmit`（incremental）→ 改动的 `src/**/*.ts(x)` 跑 eslint → `vitest run --changed <merge-base>`；只改文档/工具直接跳过；动了 `package*.json` / `vitest.config.ts` / `tsconfig.json` 时 vitest 全量。全量只在 CI（owner 2026-11-03：推 main 不再本机跑全量，Vercel Deployment Checks 等 CI 全绿才切正式域名）。不许 --no-verify 跳过 |
| CI `ci.yml`                       | push/PR 跑 tsc + lint、应用 unit（8 片）、Execution Worker unit、依赖审计、Prisma drift + fresh-database replay 和生产 build（见 cicd.md）                                                                                                                                                                                                                                                      |

- **验证范围**：按 `docs/WORKFLOW.md` 的影响面分级。局部定向通过只报告定向通过；高风险共享改动和发布跑全量。长命令保留日志与真实退出码，不过滤错误来判绿，不无依据重复跑套件。

## 单元 / 组件测试（Vitest + @testing-library/react）

- **环境分组（2026-11-03）**：`vitest.config.ts` 分两组——`*.test.ts` 跑 `node`、`*.test.tsx` 跑 `jsdom`。`.ts` 测试要用 DOM（`renderHook`、`window`、`document`）时文件第一行写 `// @vitest-environment jsdom`。
- **不真等**：重试、超时、轮询一律用假时钟（`vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` + `advanceTimersByTimeAsync`）；只 fake 这两个，fake 掉 `queueMicrotask` 会让流读不动。

- 测试与源文件**同目录**；新增/修改功能必须带对应 `.test.ts(x)`。
- API route 助手：`src/test/api-helpers.ts`；route 必测五段：**401 → 400 → service mock → success → 500**。
- 分层测法：Service 测业务逻辑边界 · Hook 测状态变化与 API mock · Component 测渲染与交互。
- Zod schema 用 `.safeParse()` 测有效 / 无效 / 边界（不用 `.parse()`）。
- i18n 守护测试：`src/i18n/completeness.test.ts`（三语键齐全 + AI_MODELS 标签 + providers 文案）。

## Worker 服务商契约测试（`workers/execution/src/providers/<名字>/contract.test.ts`，2026-11-03）

拿各家**官方**给的返回样本喂 Worker 的解析代码，服务商改了返回长相就红。样本在同目录 `contract-fixtures.json`（fal 是 `contract-fixtures/` 一模型一份），每份写明 `source` / `sourceUrl(s)` / `fetchedAt`，样本里改过的地方写在 `note`。

- 现有：fal（32 个在用模型，出图 / 视频 / 3D）、MiniMax、火山 / BytePlus（出图图层 + 视频）、Replicate、Ideogram、PixAI、OpenAI（普通 + 流式）、Gemini（出图 + 视频文件）。没做：NovelAI（返回是 zip，已有单测）、HuggingFace / Fish Audio（返回是裸字节）、Runner（自家 Modal 服务）、Rodin（3D 先不动）。
- fal 样本靠脚本刷新：`cd workers/execution && node scripts/refresh-fal-contracts.mjs`（读 Next 模型表里的 fal 端点、拉官方 OpenAPI 的 Output 示例，不要 key）。其它家文档变了手动改样本。
- 有了真实返回（Worker 日志 / 实测）直接替换 `output` 或对应字段、`source` 改成 `recorded`。⛔ 别把 key、用户提示词、用户图片地址录进样本。

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
