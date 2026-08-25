# CI/CD 参考 — 流水线与部署现状

> 定位：CI/CD 现状事实（按现状写，不引入新 CI——owner 2026-07-10 拍板）。本地闸门见 `testing.md`；环境红线见 `forbidden.md` CI/CD 节。

## GitHub Actions（6 workflows，2026-07-10 核验；2026-08-25 新增 cron-monitor）

| Workflow                | 触发                                                                                                                               | 内容                                                                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                | push main/feat/\* · PR→main                                                                                                        | **五个 job**：lint（prisma generate → `tsc --noEmit` → eslint）· app test · Execution Worker test · audit（high 报告、critical 阻断、Prisma drift、空库迁移重放）· build（needs lint + 两套 test）；Node 22 + npm cache |
| `deploy-check.yml`      | deployment_status（仅 **Production** 成功后）                                                                                      | 等 45s CDN 传播 → **内联 curl 冒烟**（`/api/health`、`/en`、`/en/gallery` 各重试 3 次；`/api/models/health` 失败不阻塞）；失败自动开/追评 issue（`deploy-failure` label；preview 部署有保护不跑，恒 401）               |
| `health-monitor.yml`    | cron `17 */6 * * *`（每 6 小时）+ 手动                                                                                             | POST `/api/health/providers`（HEALTH_CHECK_TOKEN 鉴权）；有模型 unavailable → 开 issue（`provider-outage` label，已有 open 则不重复）；endpoint 非 200 → workflow 失败                                                  |
| `model-doc-monitor.yml` | cron `17 0 * * 1`（每周一）+ 手动                                                                                                  | `npm run models:check-docs`：模型文档/接口检查，报告进 job summary + artifact（用 OPENAI/GEMINI key 做探测）；errorCount 或 changeCount ≠ 0 时自动开/更新 issue（`model-doc-monitor` label）                            |
| `post-deploy-smoke.yml` | **独立 workflow**（不是被 deploy-check 调用）：workflow_dispatch（手动传 base_url）+ deployment_status（同样仅 Production 成功后） | 跑 `scripts/smoke.ts`（带 Vercel protection bypass secret）；与 deploy-check 的内联冒烟是并行两套                                                                                                                       |
| `cron-monitor.yml`      | cron `37 13 * * *`（每日）+ 手动                                                                                                   | GET `/api/health/crons`（HEALTH_CHECK_TOKEN 鉴权，与 health-monitor 同一把，无需新 secret）；`healthy:false` → 开/追评 issue（`cron-failure` label）；端点非 200 → workflow 失败。见下方「Vercel cron 的可见性」        |

### model-doc-monitor 基线与已知退化

- **基线已补**（2026-07-10，commit `206df3d6`）：`docs/reference/api/model-doc-monitor.snapshot.json` 已提交，每周一起有 diff 对比。本地生成时未带 OPENAI/GEMINI key（探测被干净 skip，快照 `apis:[]`），首次 CI 运行会把 2 个 API 探测报为 "added"——一次性噪音。
- **⚠ 已知退化：模型清单为 0**。`scripts/check-model-docs.mjs` 只解析单文件 `src/constants/models.ts` 里的 `AI_MODELS` enum + `MODEL_OPTIONS` 数组字面量；模型拆进 `src/constants/models/{enum,image,video,audio,model-3d}.ts` 后该文件只剩 barrel，脚本静默解析出 **0 个模型**——per-model officialUrl 监控全部失效，当前只监控 9 个硬编码 EXTRA_WATCH_PAGES。修法：脚本改读 `src/constants/models/` 拆分文件后跑 `models:update-doc-snapshot` 重建基线；建议纳入 `model-catalog.md` 月审动作（待 owner 决定）。

## 部署（Vercel）

- push main → Vercel 自动构建部署；构建对比**上一个 deployment**（fix `5552da9a`）。
- Production 部署成功 → `deploy-check` 自动冒烟；失败开 issue。
- 环境变量边界：`NEXT_PUBLIC_` 只准 Clerk public key / CDN domain / App URL；其余机密只进服务端。

### ⚠ Migrate 与运行时分用两个 URL：direct vs pooler（2026-08-25）

`buildCommand`（现在是 `bash scripts/vercel-build.sh`，只在
`VERCEL_ENV=production` 时跑 `prisma migrate deploy`；本节写下时它还是一行
`prisma migrate deploy && next build`）曾经和运行时共用同一个
`DATABASE_URL`——构建日志实证 `prisma migrate deploy` 连的是
`ep-flat-violet-aifhen7l-pooler...`，即迁移跑在 **pooled（PgBouncer）端点**上。
这不是 Neon 官方推荐的用法：PgBouncer 事务池化模式下 `migrate` 用来做互斥的
advisory lock 不可靠；反过来运行时若改走 direct，Vercel 突发并发下每实例
`DATABASE_POOL.MAX_CONNECTIONS`（3）条连接会直接打满 Neon 的连接上限。

现状（`prisma.config.ts`）：

- **`DIRECT_URL`** —— 专供 `prisma migrate` / `db` / `studio` 等 CLI 命令，
  Neon direct 端点（主机名不带 `-pooler`）。缺失时 `prisma.config.ts` 在这里
  就大声抛错，不回退到 `DATABASE_URL`。例外是 `generate`/`validate`/`format`
  这类不连库的纯 schema 命令——CI 的 lint/test/build 三个 job 就是在完全不设
  这两个变量的情况下跑 `prisma generate` 的（Prisma 7.2+ 官方允许），必须保持
  可用，否则会连累三个跟迁移无关的 job。
- **`DATABASE_URL`** —— 运行时（`src/lib/db.ts` 经 `@prisma/adapter-pg`）与各
  backfill/seed 脚本用，保持 Neon pooler 端点，未改动。

⚠ **部署时序**：这个改动上线前必须先在 Vercel 项目设置里配好 `DIRECT_URL`
（值取 Neon dashboard 里主机名不带 `-pooler` 的那条连接串），否则代码一上线，
下一次生产构建的 `prisma migrate deploy` 会在拿不到 `DIRECT_URL` 时直接失败，
短路整个生产构建（同一失败模式见下方「约束型迁移」节）。此外
`scripts/vercel-build.sh` 会在生产路径上先检查 `DIRECT_URL` 主机名含不含
`-pooler`，含就直接退出——把「迁移悄悄跑在 pooler 上」这个**没有任何症状**的
失败模式变成大声报错（只判子串，绝不回显含明文密码的 URL 本身）。

⚠ **Preview 不再跑迁移（2026-08-25）**：`buildCommand` 已从一行
`prisma migrate deploy && next build` 换成 `bash scripts/vercel-build.sh`，脚本
按 `VERCEL_ENV` 分支——**只有 `production` 才跑 `prisma migrate deploy`**，
Preview / Development 直接进 `next build`。起因是三件事叠在一起：Preview 与
Production 在 Vercel 项目设置里配的是**同一个库**；`scripts/vercel-ignore-build.sh`
只按改动路径决定建不建、不按 `VERCEL_ENV` 分支；而旧的 `buildCommand` 无条件
跑迁移。合起来 = 任何 feature 分支只要碰了 `prisma/` 等受监视路径并 push，
**在合并进 main 之前** schema 就已经改到生产库上了。

**代价是期望行为，不是 bug**：Preview 现在跑在**生产的 schema** 上——代码是新
的、schema 还是旧的。带新迁移的分支在 Preview 上会在相关代码路径报错，这正是
要的效果：把「这条分支需要迁移」摆到台面上，而不是偷偷改生产库；真正应用迁移
的是合进 main 之后的那次生产构建。⚠ 生产路径的语义完全没变——迁移仍先于
`next build`，迁移失败仍然短路整个构建（脚本 `set -euo pipefail`）。

Preview scope 的 `DIRECT_URL` 至此已经用不上了（那条路径不跑迁移），留着无害，
不必特意去 Vercel 项目设置里删。

## 状态查询与排障（agent 可直接执行，2026-07-10 验证可用）

- **GitHub 侧（gh CLI，本机已登录 anteisuba）**：`gh run list --limit 10`（最近运行）· `gh run view <id> --log-failed`（失败日志）· `gh pr list`（PR 积压）· `gh run watch`（push 后盯 CI）。
- **Vercel 侧（Vercel MCP 工具）**：team `team_L2sUE4zqPCy2CNhTByObDN9v` · project `pixelvault` = `prj_euIIwn2fBxBjwfy1IvGZqDQ5ERAf`；`list_deployments` 看部署状态（target=production 是生产），`get_deployment_build_logs`（errorsOnly）查构建失败。
- 生产异常时序：先看最新 production 部署 state → deploy-check / post-deploy smoke 结果 → 需要回滚找 `isRollbackCandidate` 的上一个 READY 部署。
- Vercel 计划：Hobby（cron 表达式受限，历史上因此炸过一次构建）。

### ⚠ 加 cron 前必须做的三件事（2026-08-20 又栽了一次，补成清单；第 3 条 2026-08-25 加）

1. **表达式只能是每日粒度。** `0 * * * *` / `0 */6 * * *` 这类会炸构建——
   `6320100a`「use Hobby-compatible cron schedules」删掉的正是这两个。现存三条
   （prewarm `0 0`、sweep `0 12`、civitai-mirror/sync `0 4`）都是每日。
2. **同步把路径加进 `src/proxy.ts` 的 `isPublicRoute`。** Vercel Cron 没有
   Clerk 会话，漏了不是"偶尔失败"是 **100% 被拦在路由外**——连路由里的
   `CRON_SECRET` 校验都够不到，失败也不进 logger，表现为这条 cron 静悄悄地
   永远没跑过。⚠ **症状是 404 不是 401**：Clerk 的 `auth.protect()` 只对页面
   请求 redirect 到登录页，非页面请求走 `notFound()`（见
   `@clerk/nextjs/server/protect`）。所以去 Vercel Function 日志里 grep 401
   会一无所获，要找的是每天一条 404。`src/proxy.test.ts` 有 `it.each` 守着三
   条路径，加 cron 时把新路径加进那个数组。

3. **给它上心跳**：在路由的每条出口调 `recordCronRun(CRON_JOBS.<名字>, …)`，
   并把名字加进 `src/constants/cron.ts` 的 `CRON_JOBS`。漏了不会报错，只会让
   这条 cron **不在监控里**——和它压根没跑一样安静。

### ⚠ Vercel cron 的可见性：日志活不过 1 小时（2026-08-25 立）

**「昨天那条 cron 跑没跑」在没有心跳的情况下是结构上无法回答的**，两条平台事实叠在一起：

| 事实                                                                                                                                       | 来源                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 「Vercel will not retry an invocation if a cron job fails.」                                                                               | <https://vercel.com/docs/cron-jobs/manage-cron-jobs> · Cron job error handling |
| 投递是 best effort；漏投时「your function does not execute, and **no runtime log is created** for that scheduled run」，也可能**重复投递** | 同页 · Cron job delivery and idempotency                                       |
| **Hobby 的 runtime log 保留期 = 1 小时**（Pro 才 1 天）                                                                                    | <https://vercel.com/docs/logs/runtime> · Limits 表                             |
| Hobby 的 cron 在**指定整点内任意时刻**触发（`0 4 * * *` 可能落在 04:00–04:59）                                                             | manage-cron-jobs · Cron jobs accuracy                                          |

实测佐证：2026-08-25 用 Vercel MCP 查生产项目过去 24h 的 runtime log，`group_by=statusCode` 只返回 **2 条**记录，按 `requestPath` 过滤 `/api/internal/` 返回**空表**——当天 00:00 / 04:00 / 12:00 的三次 cron 一条都不剩。

**补法（已落地）**：

- `src/lib/cron-heartbeat.ts` — 每条 cron 在自己的每条出口写一条心跳到 **Upstash Redis**（`pv:cron-heartbeat:<name>`，TTL 7 天）。
  - 落点选 Upstash 不选新建表：Upstash 在生产**已经是硬依赖**（`execution-replay-guard` 没它直接 fail-closed），而加 Prisma 表要在开发机上跑迁移——本仓开发机连的就是生产库。
  - `recordCronRun` **永不抛错**：正事已经做完了，不能让观测手段反过来制造故障。
  - `readCronHeartbeats` **故意会抛**：读不到就是「监控本身瞎了」，必须冒到 HTTP 层。
- `GET /api/health/crons` — 汇总三条心跳。**状态码约定**：cron 出事仍是 200（判据在响应体 `healthy` 上），**非 200 只表示监控自己坏了**。两种故障因此能分开报警。
- `cron-monitor.yml` — 每天 13:37 UTC 读一次；`healthy:false` 开 `cron-failure` issue，非 200 直接让 workflow 红。

**过期阈值 26h 的来历**：日常间隔 24h + Hobby 整点内漂移最多 1h = 正常最大 25h，26h 只留一小时余量。**调大它就等于把「漏跑一次」变成「漏跑两次才报」**，别随手放宽。

⚠ **首次部署会有一条 bootstrap issue**：三条心跳要各自等到自己下一次 cron 才第一次写入，在那之前 `lastRun` 为 null → 判 stale。24 小时内自愈，同标签只会开一条。

**`maxDuration` 的真实上限：Hobby = 300s**（fluid compute 默认开启时，Hobby 的
默认值与最大值都是 300；Pro 才有 800s、扩展 1800s）。来源：
<https://vercel.com/docs/functions/configuring-functions/duration> 的 Duration
limits 表，2026-08-21 查证。

⚠ **仓内那 14 条路由写的 240 是个惯例数字，不是上限**。它来自 2026-03-25 的
`7fdd984b`，标题写着「for Vercel **Pro** plan」——而本账号是 Hobby（2026-08-21
在 Build Machine 设置页看到「Upgrade to the Pro Plan to set Elastic or Turbo」
即为证据）。且那 14 条全是快返路由（arena 建完 match 就 return、generate-video
是 submit 路径，等待在 /status 轮询侧），**没有一条真跑到过 240**，所以「240 已
验证」是把「声明了 240 且部署通过」当成了「跑到过 240」——部署通过只证明配置被
接受。唯一刻意吃满时长的是 `civitai-mirror/sync`，它取 300。

🔥 **2026-08-24：60 秒第一次被真的跑穿。** 助手三条路由（`prompt/assistant`、
`prompt/assistant/stream`、`studio/node-assistant`）此前都写 60，Grok 一轮对话
把它跑满 → `Vercel Runtime Timeout Error: Task timed out after 60 seconds` →
客户端拿到 **504**。三条已改成 300。

⚠ **别把这条读成「时长不够，调大即可」**：真正的病是那条流式路由在没有 SSE 的
provider 上一个字节都不产出，**响应头因此从未 flush**，函数被杀时网关只能回 504
（有 SSE 时同样超时只会得到一条截断的 200，字还在）。300 是兜底，解法是
`LLM_TEXT_STREAMING_ADAPTERS`——判据见 `model-catalog.md` 的 xAI 段。

✅ **2026-08-25 追加：这条路由上的 504 已经在协议层被关死，300 退回成纯粹的兜底。**

08-24 当天只补了 provider 侧的 SSE，当时留了一个已知窗口：Next 要等流吐出第一个
**字节**才 flush 响应头，而推理模型在「想」的时候可能一个 content delta 都不吐，
于是「首字之前」仍然是零字节 → 超时仍是 504。08-25 换帧协议时这个窗口被关掉：
助手流改成 `text/event-stream`，**开流立刻发一帧 `event: open`**，那一帧的字节就
把响应头顶出去了，与模型开没开口无关。

于是超时的表现从「504 错误」变成「一条截断的 200」——已经出的字留在屏幕上。
判据钉在 `src/lib/assistant-stream.test.ts`：「模型一个字都还没吐时，open 帧已经
出去了」。⛔ **别把 `open` 挪到模型开口之后**，那等于把 504 请回来。

⚠ **同日补的第二件事：`maxDuration` 不是超时机制。** 到点是平台杀进程，回给
客户端的 504 不带任何可诊断信息。真正的超时要写在发请求的那一侧
（`LLM_TEXT_TIMEOUTS_MS`：缓冲补全 120s、流式只盖「连接 + 响应头」30s），
这样上游挂住时是我们主动放弃并报 `PROVIDER_TIMEOUT`。

## Dependabot 分流规则（2026-07-10 实践沉淀）

| 类型                                            | 处理                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| dev 依赖 minor/patch（jsdom / lint-staged 类）  | 本地 checkout → 全量 vitest → 绿即可合                                                        |
| 生产依赖 minor/patch 组升级                     | 同上，但出现 peer 冲突（如 three vs model-viewer）时把冲突包摘出组单独处理或等上游，不硬合    |
| **major 升级（尤其认证/框架级，如 Clerk 6→7）** | **绝不机器人式合并**——立专项任务按官方迁移指南做，走 `scenes/new-model.md` 同级的联网核验纪律 |
| CI ❌ + Vercel ERROR 的 PR                      | 不合，先诊断（`gh run view --log-failed`）                                                    |

## ⚠ 数据库：`.env.local` 就是生产库（2026-08-22 由构建日志证实）

| 文件                          | 主机                       | 是什么                                                   |
| ----------------------------- | -------------------------- | -------------------------------------------------------- |
| `.env.local`（dev server 用） | `ep-flat-violet-aifhen7l`  | **Vercel 生产库本身**（owner 确认：有意为之，就一个库）  |
| `.env.production.local`       | `ep-solitary-dew-airqqs4u` | ⛔ **陈旧库，不是生产**。当时落后 6 条迁移、数据也对不上 |

证据：`dpl_DhWtqAFLvBHacQmjsjWpKC9LBvDV` 的构建日志写着
`Datasource "db": ... at "ep-flat-violet-aifhen7l-pooler..."`；而 `.env.local` 指向的库里，
那几条迁移的应用时间戳（08-19 15:03、08-21 12:05…）正是当初在开发机上跑 `migrate dev` 的时刻。

**这条事实的后果，动数据库前必须先想到：**

- `npx prisma migrate dev` 在开发机上跑 = **直接改生产 schema**，没有中间地带。
  08-21 12:05 那条唯一索引就是这样先于代码上线、单方面在生产上生效的（那几天生产
  跑的是旧代码 + 新 schema）。
- 本地随手生成的图 / 会话 / LoRA 收藏都是**生产数据**。
- 要先试一遍迁移，用 `npm run preflight:migrations`：从生产开一个即用即弃的
  Neon 分支（写时复制，初始不占存储，免费档 10 个分支）跑 `migrate deploy`，跑完删掉。
- ⚠ **别按名字猜哪个是生产。** 2026-08-22 我就是照 `.env.production.local` 查的，
  据此得出「生产有 2 组重复行、部署一定会炸」并写进了 `d5fa8587` 的提交信息 ——
  **那段描述是错的**，真生产在 08-21 12:05 就建好唯一索引了，部署一路 READY。
  判据只能是构建日志里那行 `Datasource "db": ... at ...`。

## ⚠ 约束型迁移：CI 结构性地看不见（2026-08-22 立闸）

`ci.yml` 的「从零重建数据库」是在**空库**上跑迁移历史 —— 没有存量数据，唯一索引 /
`SET NOT NULL` / 外键 / 列类型转换怎么都建得上。**绿色的 CI 在这类迁移上不构成证据。**

而失败的代价不只是「索引没建上」：`vercel.json` 的 `buildCommand` 走
`scripts/vercel-build.sh`，生产构建里迁移仍先于 `next build` 且 `set -e` 短路 →
**整个生产构建炸掉**，且 `_prisma_migrations` 会留下一条 failed 记录，得
`prisma migrate resolve` 才能继续。（Preview 不跑迁移，所以这个失败模式只在
production 出现——反过来说，**Preview 绿了不构成迁移能成功的证据**。）

两道闸：

1. **`prisma/migration-safety.test.ts`（自动，进 pre-push 的全量 vitest）** —— 扫所有
   `migration.sql`，对「给**已存在的表**加约束」的语句（同文件 `CREATE TABLE` 出来的新表
   不算）要求在 `ACKNOWLEDGED` 里登记一句「在真实数据上为什么安全」。实测 50 条迁移里
   只命中 7 条，噪声很低。
   ⛔ **理由写在测试文件里，不能写进迁移 SQL** —— Prisma 给每个迁移存了校验和，改动
   已应用迁移的文件（哪怕只加一行注释）会让 `migrate deploy` 报
   「migration was modified after it was applied」。
   ⚠ 它拦的是「你忘了想这件事」，不是「你想了但想错了」——**不会**因为文件里有
   `DELETE` 就自动放行，那样只会把闸门变成安慰剂。
2. **`npm run preflight:migrations`（手动，最彻底）** —— 见上一节。
   ⚠ 需要 `NEON_API_KEY` / `NEON_PROJECT_ID`（放 `.env.local`）；**脚本本身尚未在真实
   key 下跑通过**。

⚠ **闸为什么不在 CI**：本项目直接在 main 上干活，push 即触发 Vercel 生产部署，而 CI 与
Vercel 构建是**并行**的 —— CI 报警时构建已经炸了。所以闸必须在 push 之前、在本机生效。

数据修复的形状参考 `prisma/migrations/20260821210441_dedupe_lora_assets`：时间戳排在约束
迁移前一秒，谓词是严格全序（每组恰好活一行）。

## 本地闸门（与 CI 的关系）

pre-commit（lint-staged 格式化）→ pre-push（tsc + lint + 全量 vitest，本机实测 2026-07-10 合计 ~15.8min，详见 testing.md）→ CI 复跑 tsc + lint + unit。**本地过了 CI 才可能过**；跳过本地钩子（--no-verify）被禁止。

## 环境纪律

- owner 已开 dev（3000）→ 直接复用，绝不另起实例；要 server log 直接向 owner 要。
- dev 跑着不并行 build（污染 .next/Turbopack 缓存 → 嵌套路由 404，需删 .next 重启恢复）。
- 测试 key 一次性 dev 实例，严禁进生产。
- ⚠ 别把 lint / tsc 和全量 vitest 并行跑：CPU 饥饿会把测试拖到超时，表现是**假失败**（2026-08-22 实测三条测试跑到 657 秒然后红，单独复跑全过）。闸门必须串行，且判据是日志里的 `EXIT=`，不是包装它的那条 shell 语句的退出码。

### ⚠ 本地执行 worker：「8787 在听 + /health 200」**不等于**它能用（2026-08-22 实测）

`workers/execution` 的 `GENERATION_BUCKET`（R2）是 **remote 模式**绑定，靠 wrangler 的 `RemoteRuntimeController` 维持一条远端会话，其 preview token 需要**周期性去 Cloudflare 刷新**。刷新链一断，进程不会退出：

- 本地 runtime 照常心跳、8787 照常 LISTENING、`/health` 照常 `{"ok":true}` —— **它碰不到 R2，所以什么都证明不了**
- 远端绑定已死，生成会在写 R2 那步失败

2026-08-22 实测到的完整形态（三环，只有第一环会被人看见）：

1. `Failed to fetch auth token: TypeError: fetch failed` / `read ECONNRESET` → `Token refresh failed`
   —— **传输层被 reset，不是凭据问题**，所以「重新登录」不是这一环的解释
2. 约 4 小时后：`Error in RemoteRuntimeController: Error refreshing preview token` +
   `UserError: Timed out waiting for authorization code`（`user oauth authorization timeout`）
   —— 刷新失败后 wrangler 退回**交互式 OAuth**，没人完成就超时
3. 之后 `Network connection lost.`，然后**只剩心跳，一次都不再重试**

**判据**（别只看端口和 /health）：

```bash
npx wrangler whoami
```

报 `Not logged in.` 即远端凭据已失效。要看时间线就 grep wrangler 自己的日志（路径在每次报错的末行给出，形如 `%APPDATA%/xdg.config/.wrangler/logs/wrangler-<时间戳>.log`）里的 `RemoteRuntimeController`。

**恢复**：`npx wrangler login`（交互式，只能由 owner 做）→ **然后必须重启 worker**。⛔ 光重新登录救不活已经跑着的那个进程里的 controller —— 实测它死了 7 小时、自己一次都没恢复。

**结构性解**：改用 `CLOUDFLARE_API_TOKEN`（R2 读写权限）代替 OAuth，就没有周期性刷新，这个失败模式整个消失。wrangler 的错误文案自己也给了这条路。

**登录不了时的退路**：`wrangler dev --local` 不需要 Cloudflare 凭据。⚠ 代价写在 `wrangler.jsonc` 那条 `"remote": true` 的注释里 —— 产物落本地 R2 模拟，而 Next.js 存下来的 CDN URL 指向真实桶，于是**库里会出现一批打不开的图**。只当临时手段，别拿它跑要留档的生成。

⚠ 与另一条形态分开：**全线 502 = worker 根本没起**（跑 `npm --prefix workers/execution run dev` 等 `Ready on 8787`）；本条是**起着但远端会话已死**，症状完全不同 —— 前者连不上，后者连得上且健康检查绿。

## Source of Truth

- `.github/workflows/*.yml`（5 个）· `.husky/` · `package.json`（scripts）· `scripts/check-model-docs.mjs` · Vercel 项目设置 · `workers/execution/wrangler.jsonc`（远端绑定声明，`GENERATION_BUCKET` 的 `"remote": true`）

## Last Verified

- Date: 2026-07-23 · Method: 读取并解析 `ci.yml`；Execution Worker tests 已成为 build 前置，critical audit 阻断、high audit 报告，Prisma 同时检查 drift 与 fresh-database replay。当前本地审计为 0 critical；high/moderate 仍需按上游与 breaking-change 风险分批治理。
- Date: 2026-08-22 · Scope: 仅「本地执行 worker」那一节 · Method: 真机实测 —— 8787 LISTENING + `/health` 返 `{"ok":true}` 与 `wrangler whoami` 报 `Not logged in.` **同时成立**；wrangler 运行日志里三环失败（ECONNRESET → OAuth 授权码超时 → Network connection lost）时间线逐条读出；`"remote": true` 与 `--local` 的代价取自 `wrangler.jsonc` 注释。⚠ **未实测的一点**：没有真跑一次生成去证「写 R2 必失败」（会花钱），那一步是从 remote 绑定语义推的。
