# 图片生成异步化 Spec

## 目标与背景

把图片生成从「Vercel 请求内同步等 provider 3–60s」改成「dispatch 到 Cloudflare Worker 异步执行 + 回调落库 + 前端轮询」，复用视频/音频/3D 已验证的 execution-worker 链路。

**为什么做**：

- 图片是 Vercel 上**唯一还在的同步长任务**（视频/音频/3D 已外包给 worker）。异步化后 Vercel 再无长任务 → 可降级 Hobby（短期省 $20/月），也为未来迁 Cloudflare / 商业化铺路。
- 跨区：日本用户的图片生成不再在边缘请求里同步等美东 provider。

**关键架构事实**（已核实）：

- R2 上传发生在 **Vercel 回调端**（`streamUploadToR2` 把 provider 的 `artifactUrl` 转存 R2），worker 只调 provider + 回调 URL。
- 图片生成同步主路径 **sharp-free**（`uploadToR2` 纯上传）。缩略图（sharp）维持现有 `enqueueImagePreviewDerivatives` outbox 异步，不在本次范围。

---

## 架构总览

### 现状（同步）

```
前端 → POST /api/generate → generateImageForUser（请求内同步）:
  resolveRoute(含额度预留) → createJob → callProviderWithFallback(等 3–60s)
  → persistGeneratedImage(R2 上传 + 落库) → 返回 generation
```

### 目标（异步，对齐音频 FAL 模式）

```
前端 → POST /api/generate (submit) → submitImageGeneration:
  resolveRoute(含额度预留) → createJob(RUNNING, metadata→externalRequestId)
  → dispatchImageWorkerRun(IMAGE runContext) → 返回 { jobId }
        │
        ▼  (HMAC 签名 POST 到 Cloudflare Worker /workflows/image-queue)
  Cloudflare Worker: [验签] → [取 key] → 调图片 provider(同步 HTTP, 等 3–60s)
        │  成功 → POST callbackUrl { kind:'result', data:{ artifactUrl, width, height, mimeType, requestCount } }
        │  失败 → POST callbackUrl { kind:'result', data:{ error, requestCount } }
        ▼
  Vercel POST /api/internal/execution/callback → finalizeExecutionResult(IMAGE):
    streamUploadToR2(artifactUrl→R2) → [CAS 事务] createGeneration + completeJob + usage
    → enqueueImagePreviewDerivatives(缩略图 outbox, 现有)
        │
前端轮询 GET /api/generate/status?jobId → COMPLETED + generation
```

状态机：`GenerationJob` `RUNNING → COMPLETED | FAILED`。回调用 `claimRunningJobForFinalize` 做 `RUNNING→COMPLETED` 的 CAS，防重复回调双写（现有机制，图片直接复用）。

---

## 契约定义（Worker 端对接，你负责实现）

### Dispatch：Vercel → Worker

- **URL**：`POST {EXECUTION_WORKER_BASE_URL}/workflows/image-queue`
- **签名头**：`X-Execution-Signature: <hex>` = `HMAC-SHA256(INTERNAL_CALLBACK_SECRET, rawBody)`
- **Body**（新增的 IMAGE runContext 变体）：

```jsonc
{
  "runId": "<generationJob.id>", // 回调用它定位 job
  "workflowId": "IMAGE_QUEUE",
  "outputType": "IMAGE",
  "providerId": "<adapterType>", // gemini / openai / huggingface / replicate ...
  "apiKeyId": "<id>", // BYOK 时有；free-tier 时省略
  "useSystemKey": true, // free-tier 时为 true
  "callbackUrl": "https://app/api/internal/execution/callback",
  "resolveKeyUrl": "https://app/api/internal/execution/resolve-key",
  "timeoutMs": 600000,
  "maxAttempts": 1, // 图片是同步 HTTP，无需轮询 provider（见下）
  "pollIntervalMs": 3000,
  "providerInput": {
    "prompt": "...",
    "modelId": "gemini-3.1-flash-image-preview",
    "externalModelId": "<provider 侧真实 model id>",
    "aspectRatio": "1:1",
    "referenceImage": "https://...", // 可选
    "referenceImages": ["https://..."], // 可选, 多参考
    "advancedParams": { "seed": 123 }, // 可选, provider 特定参数
  },
}
```

- **响应**（Worker → Vercel，dispatch 同步返回）：`{ "workflowInstanceId": "<string>" }`（`WorkerDispatchResultSchema`）

> 与视频/音频的差异：图片 provider 是**同步 HTTP**（调用后直接等图返回），worker 不需要像 FAL queue 那样轮询 provider 状态——直接 `await` provider 响应即可。`maxAttempts/pollIntervalMs` 对图片基本无意义，保留字段只为契约统一。

### 取 key：Worker → Vercel

- BYOK：`POST {resolveKeyUrl}`（HMAC 签名）带 `{ runId, apiKeyId }` → 返回解密后的 provider key。
- free-tier（`useSystemKey: true`）：worker 用**自己 env 配置的平台 key**。
  ⚠️ **实施注意**：现有 worker 的平台 key 可能只覆盖视频/音频 provider（FAL 等）。图片 free-tier 用 Gemini/OpenAI/HF/Replicate 的平台 key，worker 端要补齐这些 provider 的系统 key 配置。

### 回调：Worker → Vercel

- **URL**：`POST {callbackUrl}`（= `/api/internal/execution/callback`），HMAC 签名头同上。
- **成功** payload（`ExecutionCallbackResultDataSchema`，字段已存在，无需新增）：

```jsonc
{
  "runId": "<job.id>",
  "kind": "result",
  "ts": 1730000000,
  "data": {
    "artifactUrl": "https://provider-or-temp/result.png", // Vercel 会 streamUploadToR2 转存
    "width": 1024,
    "height": 1024,
    "mimeType": "image/png",
    "requestCount": 1,
    "cost": 0.003, // 可选
    "providerMetadata": {}, // 可选
  },
}
```

- **失败** payload（`ExecutionCallbackErrorDataSchema`）：`data: { error: "...", requestCount?: 1 }`
- `artifactUrl` 可直接是 provider 的临时 URL，**worker 不必自己传 R2**（Vercel 回调端 `streamUploadToR2` 负责转存）。

---

## Vercel / Next.js 侧改动（我负责）

### 1. 类型 `src/types/index.ts`

- `EXECUTION_WORKFLOW_IDS` 加 `IMAGE_QUEUE`；`WorkerRunContextBaseSchema.workflowId` enum 加入它。
- 新增 `WorkerImageProviderInputSchema`（prompt/modelId/externalModelId/aspectRatio/referenceImage?/referenceImages?/advancedParams?）。
- `WorkerRunContextSchema` discriminatedUnion 加 `outputType: 'IMAGE'` 变体。
- 新增 `ImageSubmitResponseData { jobId }`、`ImageStatusResponse`（复用 `AsyncJobSubmitResponseData` / 视频 status 联合的形状：`IN_QUEUE | IN_PROGRESS | COMPLETED+generation | FAILED`）。
- `GenerateResponseData` 改为联合（`{ generation }` 兼容退路 ∪ `{ jobId }`），仅加可选分支，不破坏现有消费方。

### 2. 常量

- `src/constants/execution.ts`：`EXECUTION_WORKER.IMAGE_QUEUE_PATH = '/workflows/image-queue'`。
- `src/constants/config.ts`：`IMAGE_GENERATION = { POLL_INTERVAL_MS: 2000, MAX_POLL_ATTEMPTS: 60 }`（图片比视频快，60×2s=120s 够）。

### 3. dispatch `src/services/execution-worker.service.ts`

- 新增 `dispatchImageWorkerRun(ctx) → dispatchSignedWorkerRun(ctx, IMAGE_QUEUE_PATH)`（与现有 helpers 同形）。

### 4. submit / status 服务 `src/services/image/generate-image.service.ts`

- 新增 `submitImageGeneration(clerkId, input)`：复用现有 `resolveGenerationRoute`（含额度预留）+ 参考图/能力校验 → `createGenerationJob(RUNNING)`，把图片 metadata 序列化进 `externalRequestId` → 构建 IMAGE runContext → `dispatchImageWorkerRun` → 写回 `workflowInstanceId` → 返回 `{ jobId }`；dispatch 失败 `failGenerationJob`。
- 新增 `checkImageGenerationStatus(clerkId, jobId)`：查 job（include generation）→ 映射状态（复用音频 `checkAudioGenerationStatus` 模式）。
- 保留 `generateImageForUser`（同步）作为**未配 worker 时的退路**（见决策 3）。
- metadata 经 `externalRequestId` 传递；`recipeSnapshot` 不进 externalRequestId（太大），在回调端用 `recipeUsage` 重新 `buildRecipeSnapshotForUser`（与现有 persist 一致）。

### 5. 回调落库 `src/services/execution-callback.service.ts`

- `WorkerJobMetadataSchema.outputType` enum 加 `'IMAGE'`，并加图片 metadata 字段（aspectRatio/advancedParams/seed/creditCost/apiKeyId/referenceImages/recipeUsage 等）。
- `getDefaultMimeType` 加 `IMAGE → 'image/png'`。
- `finalizeExecutionResult` 加 IMAGE 分支：`width/height` 取自 `resultData`、`outputImageCount: 1`、`inputImageCount: ref 数`、写 `characterCardIds/projectId/referenceImageUrl/isFreeGeneration` 与图片 `snapshot`；落库后 `enqueueImagePreviewDerivatives`（缩略图 outbox，现有）。

### 6. API routes

- 改 `POST /api/generate` → submit 模式（调 `submitImageGeneration`，返回 `{ jobId }`）。
- 新增 `GET /api/generate/status?jobId=...`（调 `checkImageGenerationStatus`）。

### 7. 前端

- `src/lib/api-client/generation.ts`：新增 `submitImageGenerationAPI` + `checkImageGenerationStatusAPI`。
- `src/hooks/use-unified-generate.ts`：`generateImage` 改两阶段（submit → 轮询循环），直接复用 `generateVideo` 已有的 `setInterval` 轮询 + `markActiveRunItemCompleted/Failed` 逻辑。

### 8. 缩略图 / cron（降 Hobby 的相邻前置，本 spec 标注不实现）

- 缩略图仍走 outbox + sharp。outbox 消费由 cron 触发（`/api/internal/execution/sweep` 等）。降 Hobby 时这些 cron 需随「cron 外移到 Cloudflare Cron Triggers」一起处理 —— 独立任务。

---

## Worker 侧实现（我负责代码，你负责部署）

worker = Cloudflare Workflows（`workers/execution/src/index.ts`，纯 Workers + `crypto.subtle`，无第三方依赖）。**`Hyper3DRodinWorkflow` 是直接模板**——同样「resolve-key → 调 provider → 传 R2/回调」，图片更简单（同步 provider、无 poll loop）。

新增（第一批含 OpenAI）：

1. **wrangler.jsonc**：加 `IMAGE_QUEUE_WORKFLOW` binding（`class_name: ImageQueueWorkflow`）。
2. **fetch 路由**：加 `/workflows/image-queue` → `handleImageQueueDispatch`（`verifySignedBody` → 解析 IMAGE context → `env.IMAGE_QUEUE_WORKFLOW.create({ id: runId, params })` → 返回 `{ workflowInstanceId }`）。
3. **parseWorkerRunContext**：加 `outputType: 'IMAGE'` 分支（providerInput: prompt/modelId/externalModelId/aspectRatio/referenceImage?/referenceImages?/advancedParams?）。
4. **`ImageQueueWorkflow.run`**（`step.do` 串，仿 Hyper3D 去掉 poll）：
   - `resolve-api-key`：BYOK 走 `resolveKeyUrl` + `encryptStateString` 存 state（复用现有）；free-tier 用 env 平台 key。
   - `generate-image`：decrypt key → 调 provider（同步 HTTP）。**第一批只实现 OpenAI `gpt-image-2`**；未实现的 provider 不会被 dispatch 到（Vercel 白名单挡住，走同步退路）。
   - `callback-result` / `callback-failure`：`postSignedJson(callbackUrl, ...)`，data 带 `artifactUrl/width/height/mimeType/requestCount`；失败带 `error/status`（status 供 Vercel fallback 判断）。MVP 不传 R2。
5. **env**：free-tier OpenAI 需 worker 配 `OPENAI_API_KEY`（`.dev.vars` 本地 + `wrangler secret` 生产）。

> 每加一个 provider = `generate-image` step 加一个 provider 分支 + Vercel 白名单加一项 + worker 配该 provider 平台 key。

---

## 已定决策

- **决策 1 — fallback：Vercel 编排**（见下「Fallback 异步编排设计」）。worker 保持「只调一个 provider」的单一职责。
- **决策 2 — 全异步**：所有图片走 dispatch+轮询，不保留同步快路径，确保 Vercel 无长任务（= 降 Hobby 目标成立）。
- **决策 3 — 保留同步退路**：`isExecutionWorkerDispatchConfigured()` 为 false（本地/未配）时回退 `generateImageForUser` 同步执行；生产配了 worker 即全异步。`generateImageForUser` 因此保留，本地开发可跑、可灰度。
- **决策 4 — 渐进迁移（白名单）**：worker 端每个图片 provider 需手写（~8 个：gemini/openai/huggingface/replicate/fal/novelai/volcengine/runway），无法复用 Vercel adapter（独立 runtime）。Vercel submit 端维护「已迁移 provider 白名单」：命中 → dispatch worker；未命中 → 同步退路（决策 3）。逐个迁、不中断功能。
  - ⚠️ **降 Hobby 的前提**：所有 provider 迁完（或砍用量极低的长尾）才能让 Vercel 无长任务。**渐进迁移是技术路径，降 Hobby 是终点**——迁第一个 provider 不等于能降 Hobby。
- **决策 5 — 第一批：OpenAI `gpt-image-2`**。端到端跑通整条链路（Vercel 双侧 + worker + 回调 + 前端 + 白名单）后再逐个加 provider。
- **R2 模式**：MVP worker 回调 provider 临时 url，Vercel `streamUploadToR2` 转存（worker 简单、storageKey 逻辑留 Vercel 单一真相）。R2 直传（worker `GENERATION_BUCKET.put`，像 3D 的 `glbR2Key`）作后续优化。

## Fallback 异步编排设计（决策 1 落地）

同步版 fallback（同 job 内换 provider）在异步下变成「回调失败 → Vercel 重新 dispatch fallback run」。机制：

1. **submit**：metadata 存 `originalModelId`（= 请求 model）；`job.modelId/provider` = 当前尝试的 model（首次 = 原始）。
2. **回调失败**（`finalizeExecutionResult` 收到 error data）时判断是否可 fallback：
   - `metadata.isFreeGeneration === true`（仅 free-tier，与同步版一致）
   - 且 error 属瞬时类（沿用 `isTransientProviderError` 语义）→ **契约补充：worker 的 error data 需带 `status?: number`**（provider HTTP 状态），让 Vercel 判断瞬时性
   - 且 `PROVIDER_FALLBACK_MAP[job.modelId]` 存在
   - 且本 job **尚未 fallback 过**（metadata 无 `fallbackUsed`）
3. **可 fallback**：
   - `buildFreeTierFallbackRoute(fallbackModelId)` —— **不调 `atomicReserveFreeTierSlot`**，复用已预留额度（与刚修的同步版同一函数）
   - 更新 job：`modelId/provider/adapterType` ← fallback route；metadata 置 `fallbackUsed: true`（job 保持 `RUNNING`）
   - 重新 `dispatchImageWorkerRun`（fallback runContext，同 `runId = job.id`）
   - 回调返回 `action: 'logged'`（不 fail、不 complete）；前端继续轮询，对用户透明（多等一个 provider 时长）
4. **不可 fallback / 已 fallback 过**：`failGenerationJob`（现有路径）。
5. **防循环**：`fallbackUsed` 标记保证最多一次 fallback（与同步版一致）。

> **落库正确性**：回调用 `job.modelId/provider` 写 `generation`。fallback 已更新 job，所以 generation 记录的是**实际产出的 model**，`originalModelId` 留 metadata 供统计。比同步版（job 记原始）更简单且 generation 仍正确。

> **实现注意**：`execution-callback.service` 将新增对 `dispatchImageWorkerRun` + `buildFreeTierFallbackRoute` + `PROVIDER_FALLBACK_MAP` 的依赖；fallback 分支 IMAGE-only，视频/音频不受影响。

---

## 落地顺序（第一批 = OpenAI，端到端；一步一 commit、每步验证）

**Vercel 侧**

1. 类型 + 常量（IMAGE workflowId/path、`IMAGE_GENERATION` config、已迁移 provider 白名单含 `openai`、callback metadata IMAGE 扩展）
2. dispatch helper + `submitImageGeneration`（白名单判断：命中→dispatch，未命中→同步退路）+ `checkImageGenerationStatus`（带测试）
3. 回调 IMAGE 分支 + fallback 编排（`execution-callback.service`，带测试）
4. API routes（`/api/generate` 改 submit + 新增 `/api/generate/status`，四件套测试）
5. 前端（api-client + `use-unified-generate` 两阶段轮询）

**Worker 侧**

6. `ImageQueueWorkflow` + `/workflows/image-queue` 路由 + `parseWorkerRunContext` IMAGE 分支 + OpenAI `gpt-image-2` 调用 + wrangler binding + `.dev.vars` OPENAI_API_KEY

**验证**

7. 端到端：本地 `wrangler dev` + Vercel preview——OpenAI free-tier 生成 → dispatch → 回调 → 落库 → gallery 可见；BYOK 同理；非 OpenAI provider 走同步退路不受影响。

## 验证标准

- 单测：submit（额度预留一次、job 一个、dispatch 调用、失败 failJob）；status（各状态映射）；回调 IMAGE 分支（落库字段正确、CAS 防重复、error→failJob）；API routes 四件套。
- 端到端：免费图片生成走 worker → 回调 → gallery 出图；BYOK 走 worker；worker 未配时回退同步。
