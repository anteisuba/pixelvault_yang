# Backend 参考 — service / route / provider 契约（现状事实）

> 定位：服务端分层契约与现状事实。工程哲学见 `brand-dna.md` 工程气质节；红线见 `forbidden.md` 后端/数据库/安全节。改 provider / model / API 前必须按 `WORKFLOW.md` 联网核官方资料。

## 分层（谁能碰什么）

```text
app/api routes（149 个 route.ts）      ← 只做三件事，不含业务逻辑
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
- Middleware = `src/proxy.ts`（Clerk + next-intl 合体）：API 路由跳过 i18n；**production 对非公开路由 `auth.protect()`，development 跳过 middleware 级保护**（⚠ dev/prod 行为差异，安全验证必须在 preview/prod 做）。
- 公开路由（2026-06-02 口径）：首页 / gallery(+详情) / sign-in / sign-up / creator profile；公开 API：`/api/images`、`/api/voices(/*)`、`/api/webhooks/clerk`、`/api/health(/providers)`、`/api/internal/*`（走签名不走 Clerk）。`/api/users/:username` 公开、`/api/users/me/*` 要登录。
- 内部签名：`src/lib/signature-verifiers/`（`internal-execution`、`fal-webhook`）；Clerk webhook 走 svix 三头验签（`CLERK_WEBHOOK_SECRET`）。
- 用户映射：`User.clerkId`；`user.service.ensureUser(clerkId)` JIT 建档（查→补同步→缺则建）；service 层收 clerkId，经 `ensureUser` 解析内部 `User.id`。

## Service 纪律

- 首行 `import 'server-only'`；命名 `<name>.service.ts`；测试同目录。
- 日志一律 `lib/logger`；外部调用一律 `withRetry()`；per-provider `circuit-breaker`。
- **kernel/ = prompt 引擎族**：`prompt-guard`（用户 prompt 送 AI 前必过）· `prompt-compiler` / `scene-prompt-compiler` / `card-recipe-compiler` · `prompt-enhance` / `prompt-assistant` · `node-planner-route` / `research-route` / `inspiration-context`。LLM 输出使用前必过 `lib/llm-output-validator`。
- 可观测性：`lib/generation-observability`；错误层次在 `lib/errors`（AuthError / ApiRequestError / GenerationError / RateLimitError…）。

## 生成链路（现状要点）

第一主路径：`选模型 → prompt/参考图 → 生成 → 永久保存 → 管理/复用`。Studio 是主入口；Node workflow 是长视频/高级编排层，不替代 Studio。

- 入口分模态：`api/studio/generate` → `studio-generate.service` → `image/submit-image.service`；`api/generate-video` / `generate-audio` / `generate-3d` 各有 service；长视频 `api/generate-long-video` → `video-pipeline.service`；画布持久化 `api/node-workflow/projects/**` → `node/node-workflow.service`。
- `image/generate-image.service` = orchestrator（**高风险，8+ 依赖**）。
- **`Generation` = 全模态统一资产记录**（outputType / status / url+storageKey / 缩略图 / 尺寸时长 / 3D 模型字段 / prompt / model+provider / 可见性 / userId / projectId / 卡片-配方-runGroup 元数据）；`generation.service` 拥有创建/查询/可见性/列表/删除。
- 异步执行骨架：`GenerationJob` + `ApiUsageLedger`（`usage.service`：免费位预留 / job 创建 / 完成 / 失败 / 账本挂接）+ `execution-outbox` / `execution-callback` / `execution-sweeper` services + `/api/internal/execution/*`（签名回调）。**Comfy runner 复用此骨架**（见 `plans/comfy-runner-HANDOFF-2026-07.md`）。
- 存储：`storage/r2.ts`（55 importers，高风险）；provider URL 只能作 ingestion source，成功作品永久保存进 R2。

## Provider 接入（现状）

- Adapter 目录 `src/services/providers/`（2026-07-10 清点）：elevenlabs · fal（含子目录）· fish-audio · gemini · huggingface · novelai · openai · replicate · runway · volcengine + `registry.ts` + `types.ts`；adapter type 集中 `src/constants/providers.ts`。
- BYOK：`api-key-resolver.service`；**显式 `apiKeyId` 不可 fallback 到平台 key**；平台 key 在 `lib/platform-keys`。
- 加模型四件套必须同步：`AI_MODELS` enum + 模型配置 + i18n ×3 + provider adapter。
- 接入优先直连官方 API；只在没直连或 FAL 唯一/更优时走 FAL（owner 拍板）。

## 高风险模块（改前先 grep 影响面；>5 处引用只做向后兼容）

| 模块                                           | 引用面（2026-06 口径）                   |
| ---------------------------------------------- | ---------------------------------------- |
| `src/types/index.ts`                           | 333 files（见 `src/types/CLAUDE.md`）    |
| `src/services/user.service.ts`                 | 141 files                                |
| `src/services/image/generate-image.service.ts` | orchestrator，8+ deps                    |
| `src/constants/models.ts`                      | 99 files（见 `src/constants/CLAUDE.md`） |
| `src/services/storage/r2.ts`                   | 55 importers                             |

## 安全红线

`NEXT_PUBLIC_` 只准 Clerk public key / CDN domain / App URL · credit 只在服务端 · ownership（userId）服务端校验 · rate-limit 用户维度 · 测试 key 一次性 dev 实例。

## Source of Truth

- `src/lib/api-route-factory.ts` · `src/lib/{with-retry,circuit-breaker,logger,llm-output-validator,rate-limit,errors,db-scope,platform-keys}.ts` · `src/lib/signature-verifiers/`
- `src/services/**`（含就地 `src/services/CLAUDE.md`、`src/app/api/CLAUDE.md`）· `src/services/providers/registry.ts` · `src/proxy.ts`
- 历史详版：`git show cddc4384:docs/architecture/{auth,generation,overview,storage}.md`

## Last Verified

- Date: 2026-07-10 · Method: route 清点（149）/ service 清点（101）/ 工厂导出与三类 config 读源码 / providers、kernel、image、storage、signature-verifiers 目录清点 / proxy.ts、studio-generate 等关键文件存在性核验。
- middleware 公开路由清单、用户映射函数名、高风险引用计数沿用 2026-06-02/03 审计口径（快照）；据此改动前先对 `src/proxy.ts` 与实际代码。
