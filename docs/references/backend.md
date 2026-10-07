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

### 本月用量按模型（2026-09-18）

`GET /api/usage/by-model` —— `/settings/usage` 那张表的数据源，标准三件事（`createApiGetRoute` → 登录 → 空 Zod query → service）。

- service `getUserMonthlyUsageByModel` 走 `apiUsageLedger.groupBy(['adapterType','modelId'])`，窗口是 **UTC 自然月**，与 runner 月额度共用同一个 `startOfMonthUTC()`：两处说的必须是同一个「本月」。
- **只回次数，不回钱**。单价住 `constants/models/unit-prices.ts`（客户端可读），花费由页面按「次数 × 单价」累加。服务端算一遍就等于给单价开第二个家。
- 按**模型**而不是按 provider 分组：不然没法用逐模型单价累加。没有单价的模型照样回一行，页面上那一格留空。

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
- **提示词字数不设我们自己的上限**（owner 2026-09-27）：长度只认模型声明的 `maxPromptChars`（厂商硬上限——前端提前拦，生成服务按它拒）；请求边界只有防滥用护栏 `PROMPT_TEXT_GUARD_MAX_CHARS`（32000），画布节点字段与剧本正文是 `NODE_V4_PROMPT_MAX_LENGTH`（20000）；超过型号上限的服务端拒绝归 `prompt_too_long`，三语说人话。`validatePrompt` 缺省不查长度，要拦就传真实的数。⛔ 不悄悄截断用户写的提示词：剧本对话装配预算放不下时只截旧消息，最新一条放不下就报 `promptTooLong`；上下文预算（LoRA 参考素材、整板快照的节点摘要）另算。名字、标签、简介与局部重绘 / 3D / 语音室台词 / 剪辑台字幕的上限不在此列。
- 可观测性：`lib/generation-observability`；错误层次在 `lib/errors`（AuthError / ApiRequestError / GenerationError / RateLimitError…）。

## 可选增强不许拖垮主流程（2026-09-20）

**起因**（owner 真机，助手第 1 条）：助手记忆的注入直接 `db.assistantMemory.findMany`，而迁移还没执行 —— 异常一路冒到 SSE 成帧器，用户看到的是一句没有原因的「出错了」。他损失的**本来只是几行可有可无的上下文**。

判据一句话：**这一跳失败了，这一轮还答得出来吗**。

- **答得出来 = 可选**：包进 try/catch，回退成空值，并且 `logger.warn` 记一行（带降级点的名字）。⛔ 不抛、⛔ 也不吞成静默成功 —— 日志里查不到的降级等于没发生过，下一次真机还是「我甚至不知道为什么没生效」。
- **答不出来 = 必须成功**：模型调用、op 落地、`ensureUser`、路由解析、鉴权与钱闸。它们失败时这一轮本来就没有正确答案，照常抛出去让错误条说原因。

落点（`services/kernel/assistant-operator.service.ts` 的 `optionalContext`）：开跑前那一批 persona / 项目规则 / 来源名单 / 上下文卡 / 上几轮结论 / 创作偏好，记忆注入（读）与结账写记忆（写），以及结账里的证据本落本。⚠ 结账整体「任何一步失败都不阻塞 `done`」这条纪律在头注里写了很久，但证据落本那一步此前是直接冒出去的 —— 表现正是「一轮凭空消失」。

⛔ 这条不是「到处加 try/catch」的许可证：包住一个必须成功的东西，等于把一次真失败变成一次说不清的假成功。

### SSE 错误帧的两个诊断字段

`AssistantOperatorErrorEventSchema` 多了 `traceId`（8 位十六进制）与 `detail`（原始 message）两个可选字段。成帧器对**非 `GenerationError`** 生成短码，同一个值同时写进 `logger.error`（连同 stack）；`detail` **只在非生产环境下发**，⛔ 生产 UI 上没有原始 message、更没有 stack。`GenerationError` 那一族不编短码（它自带 `errorCode` + `i18nKey`）。UI 形态见 [`pages/assistant-shell-v2.md §3.7`](pages/assistant-shell-v2.md)。

## 生成链路（现状要点）

第一主路径：`选模型 → prompt/参考图 → 生成 → 永久保存 → 管理/复用`。Studio 是主入口；Node workflow 是长视频/高级编排层，不替代 Studio。

- 入口分模态：`api/studio/generate` → `studio-generate.service` → `image/submit-image.service`；`api/generate-video` / `generate-audio` / `generate-3d` 各有 service；长视频 `api/generate-long-video` → `video-pipeline.service`；画布持久化 `api/node-workflow/projects/**` → `node/node-workflow.service`。
- `image/generate-image.service`（~480 行）= 路由解析 + 校验 + 参考图上传模块（**高风险，8+ 依赖**）；**不再是 orchestrator**——2026-08-24 死执行链清理删掉了它内部的 provider 调用/fallback/落库路径（`generateImageForUser` 等），真正的 provider 调用现在只在 `workers/execution`。它现在只做「算出该用哪个 model/key/provider config」（`resolveGenerationRoute` / `resolveImageRouteAndValidate`），由 `image/submit-image.service` 拿着这份路由结果去签名派发给 Worker。
- **`Generation` = 全模态统一资产记录**（outputType / status / url+storageKey / 缩略图 / 尺寸时长 / 3D 模型字段 / prompt / model+provider / 可见性 / userId / projectId / 卡片-配方-runGroup 元数据）；`generation.service` 拥有创建/查询/可见性/列表/删除。
- 异步执行骨架：`GenerationJob` + `ApiUsageLedger`（`usage.service`：免费位预留 / job 创建 / 完成 / 失败 / 账本挂接）+ `execution-outbox` / `execution-callback` / `execution-sweeper` services + `/api/internal/execution/*`（签名回调）。**Comfy runner 复用此骨架**（见 `domains/runner.md`）。
- 图片缩略图 / 预览图（2026-09-28）：回调落库后入 `IMAGE_PREVIEW_DERIVATIVES` outbox，回调路由用 `after` 在响应之后立刻处理这一条；源图经 S3 API 直读 R2，不走 CDN（刚写入的对象 CDN 边缘可能还在慢速回源）。失败或被中断的留在 outbox，由每日 `execution/sweep` cron（每次 5 条、最旧优先）兜底。⚠ 2026-06-03 迁 worker 时丢了原来的即时处理，此后只剩 cron，缺图时界面退回加载原图。
- 无付费公开体验保护：生产环境未显式设置 `PLATFORM_GENERATION_ENABLED=true` 时平台生成 fail closed；免费位在同一数据库 advisory lock 内执行全局日预算（500）与用户日额度（20）检查；创建 Job 时按用户串行限制最多 2 个 `QUEUED/RUNNING` 任务。
- Worker 实例 ID 固定使用 `GenerationJob.id`；Worker 对重复 ID 返回既有实例。应用侧把超时、网络失败、5xx 与无效 ACK 视为“接收结果未知”，只做同 ID 有界重试，不把可能已执行的 Job 误标为确定失败。
- 成功、失败回调与 stale reconciliation 都通过状态条件更新（CAS）竞争终态；CAS 失败后重新读取数据库真实状态。平台计费使用服务端模型目录的 `creditCost`，Worker 的 provider 请求次数不能覆盖计费单位。
- 模型执行目录由 `model-config.service` 解析：数据库 `ModelConfig` 覆盖内置 bootstrap 配置，并把 `available`、adapter、external model ID、cost、timeout 与 provider config 一致传入实际执行面；后台变更会失效模型缓存。
- 存储：`storage/r2.ts`（55 importers，高风险）；provider URL 只能作 ingestion source，成功作品永久保存进 R2。app 与 execution worker 写 R2 一律带 `Cache-Control: public, max-age=31536000, immutable`（worker 自 2026-09-28 起；此前 worker 写的对象走 Cloudflare 默认的边缘约 2 小时 / 浏览器 4 小时），新增写入点照此。

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

## Civitai LoRA 库：全量索引（2026-10-07 起）

**列表与搜索只查我们自己的索引**：Cloudflare D1 上的 `civitai-index`（`workers/civitai-index`），应用侧入口 `src/services/civitai-lora-library.service.ts`（`CIVITAI_INDEX_URL` / `CIVITAI_INDEX_TOKEN`）。条目、总数、翻页都以索引为准；上游 meilisearch 只在同步时碰，按名字 / 哈希反查单个 LoRA 的路径（`civitai-lora.service.ts`）不变。

**为什么重做，而不是在旧链上再打补丁**：2026-10-07 实测上游 meilisearch 把 offset 翻页**和总数**都封顶在 1000（9-27 还能拿到 1065）。旧的「上游 → L2 快照 → L3 镜像（Neon 里只装得下下载量前 5 万）→ REST 回落」四层，每一层都在补上一层的缺口：总数不准、深页翻不到、镜像同步按下载量 offset 扫，扫到 1000 就「完成」，于是把 4.9 万行判成过期、被比例闸挡住。owner 要「条目全、搜得快、准」——只能把目录整份搬到自己手里。

**同步**（Worker 定时任务 `0 19 * * *` = 日本凌晨 4 点，owner 定每天一次；手动 `POST /sync`）：

- 上游 `id` 可过滤可排序：按 `id > 上一页最后一个` 续翻，每页都是 offset 0，1000 的封顶碰不到。类型取 `LoRA / LoCon / DoRA`。
- 每页先取**轻量字段**（id、名字、分级、标签、指标、最新版本时刻，一千条约 0.4 MB；带图片的完整字段约 7 MB），与本地按指纹对账：新出现或指纹变了 → 只对这些 id 拉完整字段写入；只是下载量 / 点赞变了 → 只改这两列（不碰全文索引）；本地有、上游这一段没有 → 删（一段里要删的超过 50 行且超过 20% 就先不删，多半是上游这一页不完整）。没变的行一行都不写。
- 跑在 Cloudflare Workflow 里，一步 5 页、失败按步重试；读不懂的响应抛错，不当成「扫到头」。结果写进 `sync_state`，`/api/health/crons` 里那条 `civitai-index-sync` 读它（26 小时没完整跑完或报了错就不健康）。
- 首灌约 70 万条，每步约 20 秒（大半是解析上游 JSON）——免费版 Workers 每次 10 ms CPU 跑不动，**要 Workers 付费版**。
- 索引多存一样东西（新列、新的派生索引）时把 `src/rows.ts` 的 `INDEX_ROW_VERSION` 加一：所有指纹对不上，下一轮同步整个目录重写一遍，不另写回填。

**查询**（`POST /search`，结构化条件由应用侧算好，Worker 只按白名单拼 SQL）：

- 全文：FTS5 `trigram`（名字 / 作者 / 标签 / 触发词，任意 ≥ 3 字的子串，中日文一样）。不到 3 个字的中日韩词（「鸣潮」「银发」）查另一份 `lora_cjk`：名字里每段中日韩字切成单字 + 相邻两字，按整词匹配（全表 `LIKE` 要 0.7 s）；不到 3 个字的拉丁词仍退回名字 `LIKE`。
- 「推荐」有搜索词时按相关度分档：名字完全相同 → 名字以它开头 → 名字含整句 → 名字含每个词 → 只在标签 / 作者 / 触发词里命中，同档按下载量；没有搜索词按点赞。「最多下载 / 最新」照字段排。
- 三态是「存在」语义（owner 2026-09-27）：安全 = 至少一张图 ≤ Soft（看 `nsfw_level_min`），仅 NSFW = 至少一张 > Soft（看 `nsfw_level_max`），两档不互斥。每个模型安全图与其余图各存前 6 张，安全档才挑得出封面。
- 内容类型：标签精确命中（标签列存 JSON 文本，短语带上引号就只匹配整个标签）或名字含关键词；「oc」这类两个字的关键词按整词匹配。「其他」底模 = 不在任何具名家族里。
- 总数是 `count(*)` 精确数，翻页按页码。先数再取：命中 ≥ 2000 条时过滤列前加一元 `+`，让规划器沿排序索引走、够一页就停（排序索引与 `ORDER BY` 逐列一致、以 `model_id` 升序收尾）；少于 2000 条时按过滤条件取出再排（冷门底模沿排序索引走反而要 0.9 s）。没有搜索词的总数按「条件 + 最近一次同步完成时刻」存进 `count_cache`，同步完成时清旧的。
- 一次搜索连查 D1 两三次，Worker 开了 Smart Placement（跑在 D1 旁边）。响应带 `Server-Timing: index;dur=…`。路由边缘缓存 1 小时（索引一天才变一次）。

**容量与费用**（2026-10-07 实测，首灌 681,517 条、51 分钟）：一行连索引约 2.2 KB，约 1.6 GB；Workers 付费版包含 D1 存储 5 GB、每月写 5000 万行、读 250 亿行，日常同步只写当天变了的行，全在额度内。

### 上游实测事实（改同步前先看，别重新踩）

- **下载地址可直接构造**：`https://civitai.com/api/download/models/{versionId}`，32/32 与 REST 返回值一致。
- **AutoV3 在 `version.hashData` 里**（带 type 标注），不在 `files[].hashes` 上。
- **`attributesToRetrieve` 不认嵌套路径**（`images.url` 这类会被整个丢掉），只能按顶层字段取；图片占完整字段的大头。
- **`user.image` 在搜索索引里恒为 null**（头像在 `profilePicture`），卡片上作者头像因此一直是空的。
- **`metrics.downloadCount` 可排序但不可过滤**；`id`、`lastVersionAtUnix` 可过滤可排序。
- REST `query=` 与 meilisearch（`search-new.civitai.com`）是同一个搜索子系统，过载时一起死。

## Last Verified

- Date: 2026-07-23 · Method: 核验执行 Worker 幂等创建、应用派发分类、回调 CAS、DB-first 模型解析、平台免费体验闸门、Execution v1 防重放协议、日志脱敏、认证边界、Clerk Production 已验证邮箱重绑定和对应回归测试。route/service 数量与高风险引用计数仍沿用 2026-07-10 快照；据此改动前先对实际代码。
- Date: 2026-09-20 · Method: 按 owner 真机第 1 条改码并核验 —— 新增「可选增强不许拖垮主流程」一节（`optionalContext` 的八个落点 + 判据），错误帧新增 `traceId` / `detail` 两个可选字段（生产不下发 `detail`、任何环境都不下发 stack）。测试：`src/lib/assistant-operator-stream.test.ts` · `src/services/kernel/assistant-operator.service.test.ts`「助手记忆（56a）」组。
- Date: 2026-09-04 · Method: 核验生成任务取消五层链路（状态机 CANCELLED、`generation-cancel.service`、worker terminate、`providerJobId` 上报 + CAS 落库、五入口 UI），对照 commit `205026c9` 与 `providerJobIdFromStatusCallback` 实现补「生成任务取消」一节。
