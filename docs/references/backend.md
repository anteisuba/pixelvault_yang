# Backend 参考 — service / route / provider 契约（现状事实）

> 定位：服务端分层契约与现状事实。工程哲学见 `brand-dna.md` 工程气质节；红线见 `forbidden.md` 后端/数据库/安全节。改 provider / model / API 前必须按 `WORKFLOW.md` 联网核官方资料。

## 分层（谁能碰什么）

```text
app/api routes（156 个 route.ts，以 glob 为准）  ← 只做三件事，不含业务逻辑
  → services（src/services，101 个非测试文件，全部 server-only）
      ← 唯一能碰 Prisma 和外部 API（AI provider / R2）的层
      → provider adapters（src/services/providers/）
  ← lib 工具（src/lib：retry / breaker / logger / rate-limit / errors / 工厂）
```

- credit 扣减逻辑只能在 services 层；永不信任客户端值。
- service 导出 named functions（不用 class）；输入输出必须有类型（Zod schema 放 `@/types/`）。

## API route 契约

**三件事：auth → Zod `.safeParse()` → call service。优先走路由工厂** `src/lib/api-route-factory.ts`（2026-07-10 核验导出）：

| 工厂                                                                                                                          | 用途                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `createApiRoute`                                                                                                              | POST body 路由（必须登录）                                                                                     |
| `createApiGetRoute`                                                                                                           | GET query 路由；`requireAuth` / `skipAuth`（可缓存公开路由）/ `cacheHeader`（字符串或按请求算 public/private） |
| `createApiGetByIdRoute` / `createApiPutRoute` / `createApiDeleteRoute` / `createApiPostByIdRoute` / `createApiPatchByIdRoute` | by-id CRUD 族                                                                                                  |
| `createApiInternalRoute`                                                                                                      | 内部回调：**无 Clerk**，先 `verifySignature(rawBody)` 再 JSON→Zod→handler                                      |

工厂统一承担：Clerk `auth()` · 用户维度 `rateLimit` · JSON 解析 · Zod 校验 · 标准错误响应 · Sentry 捕获 · `GenerationError`/`i18nKey` 映射（`constants/generation-errors`）。

- 响应格式恒定：`{ success: true, data }` / `{ success: false, error, errorCode?, i18nKey? }`。
- **现状混合**：工厂路由与直接 `auth()` 路由并存（现状事实；统一风格属架构决定，改前问 owner）。
- 新增 route 全链：`route.ts` → endpoint 常量进 `constants/config.ts` → 客户端包装进 `lib/api-client.ts`（组件不 fetch）→ 同目录 `.test.ts` 五段（401→400→mock→success→500）。

## 认证与边界（现状，改权限策略先问 owner）

- Provider：`ClerkProvider` 按 locale 配置（localization / sign-in URL / redirect origins）。
- Middleware = `src/proxy.ts`（Clerk + next-intl 合体）：API 路由跳过 i18n；非公开路由默认执行 `auth.protect()`。仅 development 且显式设置 `AUTH_BYPASS_FOR_E2E=true` 时允许 E2E 绕过；普通本地开发与生产使用同一认证边界。
- 公开路由（2026-09-03 口径）：首页 / gallery(+详情) / sign-in / sign-up / creator profile；公开 API：`/api/images`、`/api/og`（og:image，社交爬虫无 Clerk 会话，路由内部按 `isPublic` 判断）、`/api/voices(/*)`、`/api/webhooks/clerk`、`/api/health(/providers)`、`/api/internal/*`（走签名不走 Clerk）。`/api/users/:username` 公开、`/api/users/me/*` 要登录。
- 内部签名：`src/lib/signature-verifiers/`（`internal-execution`、`fal-webhook`）；Clerk webhook 走 svix 三头验签（`CLERK_WEBHOOK_SECRET`）。Execution v1 签名绑定 timestamp、nonce、HTTP method、pathname 与 body SHA-256；应用侧通过 Upstash Redis 原子消费 nonce，拒绝过期、重放和跨路由请求，生产缺 Redis 时 fail closed。
- 出站 URL 边界（SSRF）：`src/lib/url-guard.ts`。`assertSafeUrl` 只看 URL 字面量（协议白名单 + 主机名黑名单 + IP 字面量私网段）；**取外部资源一律走 `safeFetch`**——它手动跟重定向（默认 ≤3 跳），每一跳都先 `assertSafeUrl`、再 `dns.lookup(host, { all: true })` 把**全部**解析结果过同一份私网/环回/link-local/metadata 判据（挡 DNS rebinding），并在跨源跳转时摘掉 `Authorization` / `Cookie` / `Proxy-Authorization`。⚠ 残余风险：校验用的解析结果与 `fetch` 自己的解析是两次，TOCTOU 窗口仍在——钉死地址需要 undici `Agent({ connect: { lookup } })` 作 dispatcher，本仓无此依赖故未做。
- 用户映射：`User.clerkId`；`user.service.ensureUser(clerkId)` JIT 建档（查→补同步→缺则建）；service 层收 clerkId，经 `ensureUser` 解析内部 `User.id`。Clerk Production 切换实例时，`provisionVerifiedClerkUser` 只接受已验证的主邮箱，并按邮箱原子更新旧记录的 `clerkId`，保持内部 `User.id` 与全部资产关系不变；该同邮箱重绑定仅允许在 `VERCEL_ENV=production`，Preview/Development 遇到已有邮箱会拒绝，避免测试与生产 Clerk ID 来回覆盖。

## Service 纪律

- 首行 `import 'server-only'`；命名 `<name>.service.ts`；测试同目录。
- 日志一律 `lib/logger`；外部调用一律 `withRetry()`；per-provider `circuit-breaker`。
- **kernel/ = prompt 引擎族**：`prompt-guard`（用户 prompt 送 AI 前必过）· `prompt-compiler` / `scene-prompt-compiler` / `card-recipe-compiler` · `prompt-enhance` / `prompt-assistant` · `node-planner-route` / `research-route` / `inspiration-context`。LLM 输出使用前必过 `lib/llm-output-validator`。
- 可观测性：`lib/generation-observability`；错误层次在 `lib/errors`（AuthError / ApiRequestError / GenerationError / RateLimitError…）。

## 生成链路（现状要点）

第一主路径：`选模型 → prompt/参考图 → 生成 → 永久保存 → 管理/复用`。Studio 是主入口；Node workflow 是长视频/高级编排层，不替代 Studio。

- 入口分模态：`api/studio/generate` → `studio-generate.service` → `image/submit-image.service`；`api/generate-video` / `generate-audio` / `generate-3d` 各有 service；长视频 `api/generate-long-video` → `video-pipeline.service`；画布持久化 `api/node-workflow/projects/**` → `node/node-workflow.service`。
- `image/generate-image.service`（~480 行）= 路由解析 + 校验 + 参考图上传模块（**高风险，8+ 依赖**）；**不再是 orchestrator**——2026-08-24 死执行链清理删掉了它内部的 provider 调用/fallback/落库路径（`generateImageForUser` 等），真正的 provider 调用现在只在 `workers/execution`。它现在只做「算出该用哪个 model/key/provider config」（`resolveGenerationRoute` / `resolveImageRouteAndValidate`），由 `image/submit-image.service` 拿着这份路由结果去签名派发给 Worker。
- **`Generation` = 全模态统一资产记录**（outputType / status / url+storageKey / 缩略图 / 尺寸时长 / 3D 模型字段 / prompt / model+provider / 可见性 / userId / projectId / 卡片-配方-runGroup 元数据）；`generation.service` 拥有创建/查询/可见性/列表/删除。
- 异步执行骨架：`GenerationJob` + `ApiUsageLedger`（`usage.service`：免费位预留 / job 创建 / 完成 / 失败 / 账本挂接）+ `execution-outbox` / `execution-callback` / `execution-sweeper` services + `/api/internal/execution/*`（签名回调）。**Comfy runner 复用此骨架**（见 `domains/runner.md`）。
- 无付费公开体验保护：生产环境未显式设置 `PLATFORM_GENERATION_ENABLED=true` 时平台生成 fail closed；免费位在同一数据库 advisory lock 内执行全局日预算（500）与用户日额度（20）检查；创建 Job 时按用户串行限制最多 2 个 `QUEUED/RUNNING` 任务。
- Worker 实例 ID 固定使用 `GenerationJob.id`；Worker 对重复 ID 返回既有实例。应用侧把超时、网络失败、5xx 与无效 ACK 视为“接收结果未知”，只做同 ID 有界重试，不把可能已执行的 Job 误标为确定失败。
- 成功、失败回调与 stale reconciliation 都通过状态条件更新（CAS）竞争终态；CAS 失败后重新读取数据库真实状态。平台计费使用服务端模型目录的 `creditCost`，Worker 的 provider 请求次数不能覆盖计费单位。
- 模型执行目录由 `model-config.service` 解析：数据库 `ModelConfig` 覆盖内置 bootstrap 配置，并把 `available`、adapter、external model ID、cost、timeout 与 provider config 一致传入实际执行面；后台变更会失效模型缓存。
- 存储：`storage/r2.ts`（55 importers，高风险）；provider URL 只能作 ingestion source，成功作品永久保存进 R2。

### 生成任务取消（2026-09-04，commit `205026c9` + 收尾）

五层，自上而下：

1. **状态机**：`GenerationJobStatus` 新增终态 `CANCELLED`（`QUEUED`/`RUNNING` → `CANCELLED`）。
2. **`generation-cancel.service.ts`**：三分区 image / video / audio-3d；命中 `alreadyFinished`（job 已经完成/失败）必须回滚，前端 `use-unified-generate.ts` 同步回滚，不留假取消态。
3. **Worker `terminate`**：`workers/execution/src/index.ts` 的 cancel 处理，托底关闭执行。
4. **Provider 侧取消**：靠 worker 上报 `providerJobId` 才能打到 provider——`reportProviderJobId()`（worker 侧，best-effort）→ app `execution-callback.service.ts` 的 `persistProviderJobIdFromStatusCallback` 用 `status in [QUEUED, RUNNING]` 做 CAS 落库到 `GenerationJob.providerJobId`（迁移 `20260903201844_generation_job_provider_job_id`）；取消时读出这个值喂给 `cancelProviderJob`。
5. **五入口取消 UI**：取消相关文案只集中在 `GenerationCancel` 组件。

`providerJobId` 上报点（谁报、报什么）：

| Provider         | 上报值                             |
| ---------------- | ---------------------------------- |
| 视频 fal         | `{model_id}/requests/{request_id}` |
| MiniMax          | `taskId`                           |
| VolcEngine       | `taskId`                           |
| 图片 Replicate   | `prediction.id`                    |
| RunPod           | job id                             |
| 图片 fal         | fal request id                     |
| Hunyuan3D（fal） | fal request id                     |

**不上报**（故意）：Rodin（无取消分支）· Fish 音频（无取消分支，靠 terminate 兜底）· 长视频逐片 fal（合成 `runId` 没有对应的单条 job 行，故意不报）。

边界：

- 用户自带 key 的任务，取消只能解系统 key，不能解用户 key。
- 火山 / MiniMax 只能取消 `queued` 态，`running` 态取消不了。
- `multiview-generate.service.ts` 把 `CANCELLED` 映射到 `FAILED` 让轮询终止。

判断与教训：第 4 层「打不到 provider」的真因几乎总是 **DB 里没有 `providerJobId`**，不是 provider 本身不支持取消。新增 provider 派发路径时必须同时接 `reportProviderJobId`，否则取消只能停在 terminate 这一层（进程级兜底，打不到 provider 那端的排队/执行）。

## Provider 接入（现状）

- Adapter 目录 `src/services/providers/`（2026-08-24 清点，`runway.adapter.ts` 已随死执行链清理整删）：elevenlabs · fal（含子目录）· fish-audio · gemini · huggingface · minimax（`minimaxAdapter`/`minimaxCnAdapter` 两个 type）· novelai · openai · replicate · runner · volcengine（`volcengineAdapter`/`byteplusAdapter` 两个 type）+ `registry.ts` + `types.ts`；11 个文件、13 个 registry 条目；adapter type 集中 `src/constants/providers.ts`。
- Provider adapter 输入包含解析后的 `externalModelId`；adapter 优先使用该值，不能重新从硬编码目录取执行模型 ID。
- BYOK：`api-key-resolver.service`；**显式 `apiKeyId` 不可 fallback 到平台 key**；平台 key 在 `lib/platform-keys`。
- 加模型四件套必须同步：`AI_MODELS` enum + 模型配置 + i18n ×3 + provider adapter。
- 接入优先直连官方 API；只在没直连或 FAL 唯一/更优时走 FAL（owner 拍板）。

## 高风险模块（改前先 grep 影响面；调用方在同一个改动里一起改完）

grep 的目的是**把所有调用方收进同一个 diff**——不留旧签名垫片、不加兼容层、不写 fallback（CLAUDE.md Engineering Principle 1「不保留向后兼容」）。引用面大只意味着这次改动会大，不构成「改成兼容式」的理由。

| 模块                                           | 引用面（2026-06 口径）                                       |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `src/types/index.ts`                           | 333 files（见 `src/types/CLAUDE.md`）                        |
| `src/services/user.service.ts`                 | 141 files                                                    |
| `src/services/image/generate-image.service.ts` | 路由解析+上传模块（非 orchestrator，2026-08-24 起），8+ deps |
| `src/constants/models.ts`                      | 99 files（见 `src/constants/CLAUDE.md`）                     |
| `src/services/storage/r2.ts`                   | 55 importers                                                 |

## 安全红线

`NEXT_PUBLIC_` 只准 Clerk public key / CDN domain / App URL · credit 只在服务端 · ownership（userId）服务端校验 · rate-limit 用户维度 · 测试 key 一次性 dev 实例 · 日志一律经过 `lib/logger` 递归脱敏，不记录 prompt/LLM 原文、Authorization/Cookie、密钥或签名 URL 查询参数。

## Source of Truth

- `src/lib/api-route-factory.ts` · `src/lib/{with-retry,circuit-breaker,logger,llm-output-validator,rate-limit,errors,db-scope,platform-keys}.ts` · `src/lib/signature-verifiers/`
- `src/services/**`（含就地 `src/services/CLAUDE.md`、`src/app/api/CLAUDE.md`）· `src/services/providers/registry.ts` · `src/proxy.ts`
- 历史详版：`git show cddc4384:docs/architecture/{auth,generation,overview,storage}.md`

## Civitai 搜索的三级降级（2026-08-19 建，全部数字实测）

**起因**：Civitai 对 `/api/v1/models?query=` 主动 load shedding（503 + `Retry-After: 2` + body `"Model search is temporarily overloaded"`，`x-handled-by` 是它自己的应用层不是 Cloudflare），同一时刻**不带 query 的浏览路径全程 200**。挂的是搜索子系统，不是整个 Civitai。

⚠ **别再把 REST `query=` 当 meilisearch 的回落。** 两者是同一个搜索子系统的两张脸，上游一过载必然一起死——原来的"回落"只是把失败重演一遍再赔上十几秒（实录：单次请求 21–24 秒才吐 502）。回落只在 **4xx / 端点坏了 / 公钥轮换**时才有意义，`isUpstreamSearchDegraded()` 就是这条判据。

**降级顺序**（`listCivitaiLoras`）：

1. **上游 meilisearch** — 两级超时 5s → 10s（健康时实测 0.55–1.1s；事故当天返回在 7.99s，单一 8s 闸把"慢但会成功"判成了死）。整条搜索路径罩 `civitai.search` 断路器（3 次失败 / 30 秒），浏览路径不罩。
2. **L2 快照**（`CivitaiSearchSnapshot`）— 每个规范化查询留最近一次成功结果。**不是通用缓存**：只在上游失败那一刻读。一条实测 7.6–7.8 KB，上限 1000 条 ≈ 8 MB，LRU 淘汰搭 prewarm cron（6h）。
3. **L3 本地镜像**（`CivitaiLoraMirror`）— **兜底层，不是主查询层**。只覆盖 top N，当主路径会让长尾搜索静默变少。它的价值是能回答**从没搜过的词**，这是快照填不了的洞。

顺序上快照优先于镜像：快照是这个查询（连同排序/档位/页码）的精确历史答案，保真度更高。

**搜索过载没有上游解法。** Civitai 对搜索子系统主动 load shedding，我们控不了。能做的是：断路器打开后立刻失败（不再等 5–10s）、禁止回落同失败域的 REST `query=`、用快照/镜像接着服务，并且降级时仍按用户选的「最新 / 最多下载」做全局排序。浏览（不带搜索词）不受影响。

### 排序（2026-08-25 对齐 Civitai 官网搜索；2026-08-29 修正下载档字段）

Civitai 官网搜索（`ModelSearchIndexSortBy`）是**全局排序**，不是「先名称匹配再排序」：

| 档       | meilisearch                  | 镜像降级                                    |
| -------- | ---------------------------- | ------------------------------------------- |
| 推荐     | 不传 sort = 相关性           | 点赞降序（复制不了相关性，UI 标排序已降级） |
| 最多下载 | `metrics.downloadCount:desc` | `downloadCount`                             |
| 最新     | `createdAt:desc`             | `createdAt`                                 |

⚠ 下载档**不是** `sortMetrics.downloadCount`：那是官网 Creator Controls 预留的 sort-only 字段（隐藏下载数时保真值），从未在 live 索引上声明成 sortable（官网注释：要先做一次 models index reset）。2026-08-26 对齐时抄了 search-index 侧的意图值没实测，上游恒 400 → 「最多下载」每次静默降级 REST 相关性序，3 天后才发现。教训：**官网源码只是意图，live 索引的 sortable 白名单才是现状**——改 sort 字段前对 live 端点实测（非法字段的 400 报错自带完整白名单），测试锁见 `civitai-lora.service.test.ts` 的 sortable whitelist 用例。

搜索路径用真实 `offset=(page-1)*pageSize`，不再从 0 拉前缀窗口再按名称分层。类型筛选合并路径仍在合并后按同一套全局 sort 重排。

### 官方分页契约（2026-08-24 核 [Civitai Pagination](https://developer.civitai.com/site/guide/pagination)）

历史几轮「page-only / page+cursor / cursor-priority / revert」都在猜 REST 怎么分页。官方现在写死了：

- 浏览（无 `query`）：`page` 或 `cursor` 均可；深页用 cursor。`page * limit` 不得超过 1000，否则 429。
- 搜索（有 `query`）：**必须 cursor，禁止 `page`+`query`（400 Bad Request）**。`query` 不带 cursor 可以（第一页）。
- REST `query=` 与非正式 meilisearch（`search-new.civitai.com`）是同一个搜索子系统，过载时一起死——所以 L1 失败后的回落是快照/镜像，不是 REST `query=`。
- ⚠ **页码不能跨后端搬。** meilisearch offset 的第 6 页 ≠ 本地镜像 offset 的第 6 页（镜像只覆盖 top N，同一词可能只有几十条）。L1 失败时如果请求页在回落语料里是空的、但这个词其实有命中，必须回到回落第 1 页，不能把「第 6 页 · 41 个 LoRA」配上空列表。

### 上游实测事实（改动前先看，别重新踩）

- **下载地址可直接构造**：`https://civitai.com/api/download/models/{versionId}`，32/32 与 REST 返回值一致（跨 top / 第 2 万名 / 最新发布三段采样，含早期访问模型）。原来每个 hit 单独打一次 `/model-versions/:id`，一页 12 条 = 13 次上游请求，**且拿不到就把整条丢掉**——上游一降级搜索页静默返回空，比报错更糟。现在一页 1 次请求。
- **AutoV3 在 `version.hashData` 里**（50/50 命中，带 type 标注），不在 `files[].hashes` 上。旧注释说 meilisearch 拿不到 AutoV3 是找错了地方。
- **meilisearch offset 硬上限 100,000**（offset=99990 有结果，100500 返回 0 条）。`metrics.downloadCount` **可排序但不可过滤**，所以"按下载量取前 20 万"够不着。
- **`lastVersionAtUnix` 是可过滤的**——新模型首发和老模型出新版本都会更新它，等于上游白送一个 changed-since 接口。但**指标不走这个信号**（下载量变化不更新它），所以指标刷新绕不开全量扫描，镜像同步因此只做一条管线而不是三条。
- **目录规模 642,554 条**（按 lastVersionAtUnix 月度分桶精确求和），日增 800–900，2025 年初见顶后稳定在 2 万/月，是线性不是指数。

### 容量算术（改截断线前先重算）

单行实测 **1,724 B**（灌到 6000 行时量的；1000 行时是 2,662 B，小样本会高估）。Neon 免费档整个项目 0.5 GB，当时已用 128 MB，`Generation` 表 701 行就占 67 MB。`CIVITAI_MIRROR_BACKFILL_LIMIT` 现为 5 万 ≈ 85 MB，注释里有完整推导。

## Last Verified

- Date: 2026-07-23 · Method: 核验执行 Worker 幂等创建、应用派发分类、回调 CAS、DB-first 模型解析、平台免费体验闸门、Execution v1 防重放协议、日志脱敏、认证边界、Clerk Production 已验证邮箱重绑定和对应回归测试。route/service 数量与高风险引用计数仍沿用 2026-07-10 快照；据此改动前先对实际代码。
- Date: 2026-09-04 · Method: 核验生成任务取消五层链路（状态机 CANCELLED、`generation-cancel.service`、worker terminate、`providerJobId` 上报 + CAS 落库、五入口 UI），对照 commit `205026c9` 与 `providerJobIdFromStatusCallback` 实现补「生成任务取消」一节。
