# Comfy Runner — Civitai 来源图复刻（任务包）

> 一句话方向：**先用本地 ComfyUI 证明能复刻来源图，再把它收敛成一个"只接结构化 recipe、不接任意 workflow"的私有 runner；云端 GPU 是后面的部署形态，不是现在必须花钱的前提。**
>
> 状态：设计已定，等 Phase 0 本地证明。文档语言中文，代码标识符/路径保留英文。
> 关联：[[project-comfy-runner]]、[[project-lora-recipe-first]]、`docs/plans/lora-recipe-workflow.md`
> 本地/部署形态调研（2026-07，**含宿主决策更新**）：[`comfy-runner-deployment-research-2026-07.md`](comfy-runner-deployment-research-2026-07.md) —— **路线已定 RunPod-first**：本地只装 ComfyUI GUI 调 workflow + 导出模板；生产直接 RunPod Serverless（fork worker-comfyui）；`recipe→workflow` 映射放 Cloudflare Worker（TS 纯函数）。**本文 §2 架构图 / §10 任务 1 的「本地 TS runner + Tunnel」宿主假设已被覆盖，宿主部分以调研文档 §2.2 / §3 为准**（架构分层、契约、错误码、manifest 等其余决策不变）。

---

## 0. 关键发现（重写了整个判断）

**用户描述的"目标架构"（Next.js → Cloudflare Worker → runner → R2 → 回调）已经是 PixelVault 现在的图片生成骨架，并且在生产运行。** 不需要新建执行骨架，只需要给现有骨架加一个新后端。

现状证据：

| 环节          | 现状实现                                                                                                                     | 文件                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 提交          | `submitImageGeneration()` 建 `GenerationJob` → 签名分发                                                                      | `src/services/image/submit-image.service.ts`                                         |
| 分发          | `dispatchImageWorkerRun()`，HMAC-SHA256 签名 POST                                                                            | `src/services/execution-worker.service.ts`                                           |
| 执行          | Cloudflare Worker `pixelvault-execution`，Durable Object Workflows                                                           | `workers/execution/src/index.ts` + `workers/execution/wrangler.jsonc`                |
| 调用 provider | **全部 provider 调用在 Worker 内**，包括 Replicate/illustrious-xl                                                            | `workers/execution/src/index.ts`                                                     |
| 上传 R2       | **Worker 自己 `GENERATION_BUCKET.put()`**（图/视频/音频/3D 一致），Next.js 回调只是兜底上传                                  | `index.ts:1552/2379/2458/4174`，`workerArtifactUrl ?? artifactUrl` @ `index.ts:2810` |
| 回调          | Worker 签名 POST `/api/internal/execution/callback` → `handleExecutionCallback()` 落 `Generation`                            | `src/services/execution-callback.service.ts`                                         |
| 迁移闸门      | `WORKER_MIGRATED_IMAGE_ADAPTERS` 已含 `REPLICATE`；不在列表的 adapter 直接大声失败                                           | `src/constants/execution.ts:69`                                                      |
| 错误模型      | `GenerationJob.errorMessage/errorCode/providerFailure(Json)` + `classifyProviderFailure()` + i18n `Errors.generation.<code>` | `src/constants/generation-errors.ts`、`workers/execution/src/lib/provider-error.ts`  |

**结论**：runner 就是 Worker 眼里的"又一个 provider"。所有问题（谁调、谁传 R2、错误怎么走）都有现成先例可对齐，照抄即可。

当前痛点的根因也因此清楚：illustrious-xl 走 Replicate `delta-lock/noobai-xl`（一个 Cog 托管模型），它的 LoRA loader 只支持特定 layer 格式，挂 WAI/Illustrious 社区 LoRA 时报 `layer lora_unet_label_emb_0_0.alpha not supported`。这是**托管后端的能力上限**，不是 prompt、不是 LoRA 库缺失。换托管模型只会制造"成功但不像"。唯一解是把"同 checkpoint + 同 LoRA stack + 同 sampler/clipSkip/seed/尺寸"的真实环境跑起来 = 自己的 runner。

---

## 1. 产品决策（Product decision）

1. **第一版只做 Illustrious/WAI 的 recipe clone**，不做通用 runner、不做任意模型、不做用户上传 workflow。契约设计成通用形状（checkpoint + loras[] + sampler...），但 **allowlist 收窄到 SDXL/Illustrious 一族 + 一个固定模板**。这样既不画地为牢，又能把失败归因、安全、成本都框死。
2. **不静默切换 illustrious-xl**。新建一个独立模型入口（`ILLUSTRIOUS_RECIPE_CLONE`，走 runner），illustrious-xl 保留为"快速托管"路径。复刻流程显式路由到 runner 模型，能力差异在模型注册表里可见，UI/recipe 可选。
3. **第一版是单用户自用 / proof**（owner 一个人），feature flag + userId allowlist 门控。不对全体用户开放。
4. **不靠"prompt 变长"假装解决复刻**。复刻保真度靠环境一致，不靠提示词。
5. **成功判据不是"能出图"**，而是肉眼明显比当前 Replicate/noobai-xl 路径更贴近来源图（Phase 0 人工对比验收）。

---

## 2. 架构决策（Architecture decision）

照抄现有 migrated-adapter 骨架，新增 4 个点：

```
Studio UI
  └─ Next.js: auth → Zod validate → submitImageGeneration() 建 GenerationJob   [现状]
       └─ dispatchImageWorkerRun() 签名分发  /workflows/recipe-clone           [新增路径常量]
            └─ Cloudflare Worker: RecipeCloneWorkflow (Durable Object Workflow) [新增 workflow]
                 └─ Bearer 调 https://your-runner.example.com/v1/recipe-clone   [新增 runner 后端]
                      └─ runner 内部映射进固定 Comfy 模板，跑 ComfyUI(localhost) [runner 私有]
                 └─ 拿回 bytes → Worker GENERATION_BUCKET.put() 上传 R2          [照抄现状]
            └─ Worker 签名回调 /api/internal/execution/callback                  [照抄现状]
       └─ handleExecutionCallback() 落 Generation（含 recipeSnapshot）           [现状]
```

逐条结论（回答用户 10 问，详见文末附录）：

- **Q1 命名**：新增 adapter type `RUNNER`（按角色命名，技术无关）。**不要** `comfy`（泄露实现，将来换 Diffusers 就说谎）。**不要**塞进 illustrious-xl 的 providerConfig（会把"哪个模型"和"哪个后端执行"混在一起，正是静默切换的坑）。新增 `AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE`，`adapterType: RUNNER`。
- **Q2 谁调 runner**：**Worker 调**。现状所有 provider 调用都在 Worker，runner 只是又一个 provider。Next.js 永不直连 runner。runner 公网端点只有 Worker 一个调用方要鉴权。
- **Q3 谁传 R2**：**Worker 传**。现状每个模态都是 Worker `GENERATION_BUCKET.put()`。runner 返回 bytes（或短时效 URL），Worker 上传。runner **绝不持有 R2 凭证**（它可能在用户家用机上，最不可信）。
- 既对齐代码库约定（CLAUDE.md「匹配代码库约定」），又是正确的安全姿态。

---

## 3. 最小验证清单（Phase 0 — 本地 Proof，零 PixelVault 代码）

目标：证明"同 checkpoint + 多 LoRA + sampler/clipSkip/seed/尺寸"能明显贴近来源图。**这一步不碰任何项目代码。**

- [ ] 安装 ComfyUI（本地）。
- [ ] 放入目标 checkpoint（如 `waiIllustriousSDXL_v160` 的具体版本）。
- [ ] 放入主 LoRA + extra LoRA（从 Civitai 下载，记录 modelVersionId 与文件 sha256）。
- [ ] 手搭固定 workflow：`CheckpointLoader → LoRA Loader stack → CLIPTextEncode(pos/neg) → KSampler → VAEDecode → SaveImage`。
- [ ] 用一张真实来源图的完整 recipe 喂参数：prompt / negativePrompt / seed / steps / cfg / sampler / scheduler / clipSkip / width / height / 每个 LoRA 权重。
- [ ] 出 ≥1 张图，与来源图并排对比。
- [ ] **验收**：肉眼明显比当前 Replicate/noobai-xl 更像来源图。不像 → 先调模板/参数，别进 Phase 1。
- [ ] 把这套手搭 workflow 导出成 JSON，作为 Phase 1 模板 `sdxl-recipe-clone/v1.json` 的起点。

只有 Phase 0 通过，才进 Phase 1（runner contract）。

---

## 4. Runner API 契约草案（Runner API contract）

私有 runner 服务，包在 ComfyUI 外面。**只接结构化 recipe，拒绝任何 raw workflow JSON。**

```
POST /v1/recipe-clone      Bearer <RUNNER_TOKEN>   提交任务（异步）
GET  /v1/jobs/:id          Bearer                  轮询状态
GET  /v1/capabilities      Bearer                  已装 checkpoint/LoRA/节点 + hash + 健康
GET  /v1/healthz           （无鉴权，仅存活）
```

请求体（结构化，无 workflow）：

```jsonc
{
  "templateId": "sdxl-recipe-clone", // 稳定 slug，runner 解析到当前 pin 版本
  "checkpoint": "waiIllustriousSDXL_v160", // 必须命中 runner capabilities
  "prompt": "...",
  "negativePrompt": "...",
  "seed": 3839998829,
  "steps": 24,
  "cfgScale": 3.5,
  "sampler": "euler_ancestral",
  "scheduler": "normal",
  "clipSkip": 2,
  "width": 832,
  "height": 1216,
  "loras": [
    {
      "id": "main",
      "url": "https://civitai.com/api/download/models/123",
      "weight": 0.9,
      "source": { "kind": "civitai", "modelVersionId": 123, "sha256": "..." },
    },
    {
      "id": "extra",
      "url": "https://civitai.com/api/download/models/456",
      "weight": 0.8,
      "source": { "kind": "civitai", "modelVersionId": 456 },
    },
  ],
  "output": { "format": "png", "return": "bytes" }, // bytes → Worker 传 R2；runner 无 R2 凭证
  "idempotencyKey": "<generationJobId>", // 复用现有 jobId，幂等去重
}
```

响应：`202 { "jobId": "...", "status": "queued" }`

轮询 `GET /v1/jobs/:id`：

```jsonc
{
  "status": "queued | running | succeeded | failed",
  "progress": 0.42, // 可选
  "result": {
    // succeeded 时
    "imageBase64": "...", // 或 imageUrl（短时效，仅供 Worker 拉取）
    "width": 832,
    "height": 1216,
    "seed": 3839998829,
    "templateId": "sdxl-recipe-clone",
    "templateVersion": "1.2.0", // runner 解析出的实际版本
    "templateHash": "sha256:...", // 用于复现追溯
    "checkpointHash": "sha256:...",
    "loraHashes": ["sha256:...", "..."],
  },
  "error": {
    // failed 时（结构化，别让 Worker 去 regex）
    "code": "checkpoint_unavailable",
    "message": "human readable",
    "detail": "raw comfy / civitai error，原样保留",
  },
}
```

runner 原生错误码：`runner_busy | checkpoint_unavailable | lora_download_failed | lora_incompatible | sampler_unsupported | template_not_found | comfy_error | invalid_request`。

要点：

- `return: bytes`（base64 或独立 `/v1/jobs/:id/artifact` 流），让 **Worker 上传 R2**，runner 不碰 R2 凭证。
- runner 返回**结构化** error code，Worker 直接 `runner.code → worker code` 确定性映射，不做正则猜测（呼应 CLAUDE.md「确定性转换全交给代码」）。
- 结果带 `templateVersion/Hash + checkpointHash + loraHashes`，Worker 落进 `Generation.recipeSnapshot`，每张图可追溯到精确环境。

---

## 5. Model manifest 草案

两个"manifest"，别混：

**(a) PixelVault 侧 checkpoint 清单（契约：期望 runner 有什么）** — 新文件 `src/constants/runner-checkpoints.ts`（呼应 Hard Rule 1 无 magic value）：

```ts
export interface RunnerCheckpoint {
  id: string // 稳定 slug，契约里传的就是它
  displayName: string
  baseModelFamily: 'sdxl' // v1 只做 SDXL/Illustrious
  civitaiModelVersionId?: number // provenance / 下载
  sha256?: string // 完整性 / 漂移检测
  recommendedSampler?: string
  recommendedScheduler?: string
  recommendedClipSkip?: number
  vae?: string
  available: boolean
}

export const RUNNER_CHECKPOINTS: readonly RunnerCheckpoint[] = [
  {
    id: 'waiIllustriousSDXL_v160',
    displayName: 'WAI Illustrious SDXL v16.0',
    baseModelFamily: 'sdxl',
    civitaiModelVersionId: /* TODO */ 0,
    recommendedSampler: 'euler_ancestral',
    recommendedScheduler: 'normal',
    recommendedClipSkip: 2,
    available: true,
  },
  // v1 手工 allowlist，先就 1–3 个
]

export const RUNNER_TEMPLATES = {
  SDXL_RECIPE_CLONE: 'sdxl-recipe-clone',
} as const
```

**(b) runner 侧能力清单（实际有什么）** — `GET /v1/capabilities` 返回：

```jsonc
{
  "checkpoints": [
    { "id": "waiIllustriousSDXL_v160", "sha256": "...", "ready": true },
  ],
  "loraCache": [{ "modelVersionId": 123, "sha256": "...", "sizeBytes": 0 }],
  "templates": [
    { "id": "sdxl-recipe-clone", "version": "1.2.0", "hash": "sha256:..." },
  ],
  "nodes": ["KSampler", "LoraLoader", "..."],
  "comfy": { "reachable": true, "version": "..." },
}
```

(a) 是期望，(b) 是现实；差异 → `checkpoint_unavailable` / `template_not_found`。runner 每次请求自己校验，PixelVault 也可周期性对账。

---

## 6. 错误模型（Error representation）

**扩展现有体系，不新发明。** 现状：`GENERATION_ERROR_CODES`（client）+ `WORKER_GENERATION_ERROR_CODES`（worker）+ `classifyProviderFailure()` + `GenerationJob.errorCode/errorMessage/providerFailure(Json)` + i18n `Errors.generation.<code>`。

新增错误码（client + worker 两个字典都加）：

| code                        | 含义                                        | UI 处理（见 Q9/§9 不要点）                      |
| --------------------------- | ------------------------------------------- | ----------------------------------------------- |
| `runner_offline`            | runner 不可达 / 家用机关机                  | "复刻 runner 离线，启动后重试" + 路由到 setup   |
| `checkpoint_unavailable`    | manifest checkpoint 未装在 runner           | 指明缺哪个 checkpoint                           |
| `lora_download_failed`      | runner 端 Civitai/HF 下载失败               | 可重试                                          |
| `lora_incompatible`         | LoRA base model 不匹配 / layer 加载失败     | 现在 runner 能精确报，而非 Replicate 笼统报     |
| `sampler_unsupported`       | 模板不支持该 sampler/scheduler              | 提示可用 sampler                                |
| `template_version_mismatch` | 请求的 templateId/version 不存在            | 内部错误，告警                                  |
| `runner_capacity`           | runner 队列满 / 忙                          | 排队 / 稍后重试                                 |
| `lora_incompatible_hosted`  | **托管路径**专用：Replicate 报 layer 不支持 | "此 LoRA 跑不了快速托管模型，切复刻" + 一键重试 |

实现：

- runner 返回结构化 `{code,message,detail}`；Worker 把 `runner.code → WORKER_GENERATION_ERROR_CODES` 确定性映射；`detail` 原样塞 `providerFailure`（延续 commit `011b43cd` 保留原始 provider 失败细节的思路）。
- 给 Replicate adapter 的 `classifyProviderFailure()` 加一条 regex：`/layer .* not supported|checkpoint not supported/i → lora_incompatible_hosted`，把当前那个笼统报错变成可操作错误。
- i18n：`src/messages/{en,ja,zh}.json` 三个文件同步加 `Errors.generation.*`，可操作的再加 `Errors.runner.*`。

---

## 7. 安全约束（Security constraints）

runner 可能跑在用户家用机、经隧道暴露公网。红线：

1. **绝不暴露原生 ComfyUI（8188）。** Comfy 只在 localhost，外面只暴露 runner 的 `/v1/*`。
2. **每个请求 Bearer token 鉴权**，token 是 Worker secret，可轮换。无 token 拒绝。
3. **只走 HTTPS**，优先 **Cloudflare Tunnel**（带鉴权、无入站端口、抗 DDoS，且本来就是 Cloudflare 栈）；Tailscale Funnel 可接受；ngrok 仅一次性 dev。
4. **runner 不持有 R2 凭证**（见 Q3）。
5. **禁止任意 workflow 上传**：runner 只接结构化 recipe，映射进 pin 死的模板；带 raw workflow JSON 的请求直接拒。
6. **只允许 Worker 这一个调用方**（Cloudflare Tunnel service token / mTLS，或 Bearer + IP allowlist）。
7. **资源护栏**：单任务队列或小并发上限、单任务超时、max 分辨率/steps 上限；LoRA 下载源只允许 `civitai.com` / `huggingface.co` 等 allowlist 域名。
8. **离线即显式报错** `runner_offline`，绝不 hang（CLAUDE.md「失败要大声暴露」）。
9. **不把 secret / 完整 prompt 落盘**超过必要；日志脱敏 token。
10. **v1 单用户**：feature flag + owner userId allowlist，不对全体开放。

---

## 8. PixelVault 代码触点（Code touch points）

UI-only 红线不适用（这是执行链路改动），但仍**最小化、向后兼容**。按 feature dev order（constants → types → services → hooks → components + worker）：

| 层        | 文件                                                                       | 改动                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| constants | `src/constants/providers.ts`                                               | `AI_ADAPTER_TYPES.RUNNER = 'runner'`                                                                                                                            |
| constants | `src/constants/models.ts`（`models/image.ts`）                             | 新增 `AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE`，`adapterType: RUNNER`，`supportsLora: true`，`available: false`（flag 门控），`externalModelId: 'sdxl-recipe-clone'` |
| constants | `src/constants/execution.ts`                                               | `EXECUTION_WORKER.RECIPE_CLONE_PATH`、`EXECUTION_WORKFLOW_IDS.RECIPE_CLONE`；把 `RUNNER` 加进 `WORKER_MIGRATED_IMAGE_ADAPTERS`                                  |
| constants | `src/constants/runner-checkpoints.ts` **(新)**                             | §5 的 manifest                                                                                                                                                  |
| constants | `src/constants/generation-errors.ts`                                       | §6 新错误码 + Replicate layer-error regex                                                                                                                       |
| types     | `src/types/index.ts`                                                       | `RunnerRecipeRequestSchema`（基于现有 `CivitaiImageRecipeSchema` / `LoraSchema`）、`RunnerCapabilitiesSchema`                                                   |
| services  | `src/services/providers/runner.adapter.ts` **(新)**                        | 注册到 `providers/registry.ts`，对齐 `replicate.adapter.ts`                                                                                                     |
| services  | `src/services/image/generate-image.service.ts` / `submit-image.service.ts` | route resolve 支持 runner 模型；其余复用                                                                                                                        |
| worker    | `workers/execution/wrangler.jsonc`                                         | 注册 `RecipeCloneWorkflow` + binding + runner endpoint/token vars                                                                                               |
| worker    | `workers/execution/src/index.ts`                                           | `RecipeCloneWorkflow`（提交→轮询 runner→拿 bytes→`GENERATION_BUCKET.put`→回调），照抄 image-queue 形态                                                          |
| worker    | `workers/execution/src/lib/provider-error.ts`                              | runner code → worker code 映射                                                                                                                                  |
| hooks/UI  | `src/hooks/use-unified-generate.ts` + studio                               | 新错误码的可操作提示 + "切复刻 / 重试" CTA                                                                                                                      |
| i18n      | `src/messages/{en,ja,zh}.json`                                             | §6 错误文案 + 模型名，三文件同步                                                                                                                                |

不变更：credit/billing 逻辑、Clerk 配线、`Generation`/`GenerationJob` 表结构（`recipeSnapshot` 已是 Json，直接用）。

---

## 9. Do-not-do 清单

- ❌ 把 illustrious-xl 静默切到另一个"看起来能跑"的托管模型。
- ❌ 开放任意 Comfy workflow 上传。
- ❌ 直接暴露本地原生 ComfyUI（8188）。
- ❌ 让 runner 持有 R2 凭证 / 直连 R2（Worker 传 R2）。
- ❌ 让 Next.js 直连 runner（Worker 调 runner）。
- ❌ adapter 命名 `comfy`（用角色名 `runner`）。
- ❌ Phase 0 没过就写 contract / 代码。
- ❌ 现在就上云端 GPU 花钱（RunPod/Modal/Replicate custom 留到生产前再比价）。
- ❌ 用"prompt 变长"假装解决复刻保真。
- ❌ 把 failed Replicate 当 UI 问题糊弄过去（要分类成 `lora_incompatible_hosted` 并给出路）。
- ❌ v1 就对全体用户开放 runner（单用户 + flag）。

---

## 10. 给 Codex 的首个实现任务包（Phase 1，Phase 0 通过后）

> 前置：Phase 0 已人工验收通过，且已导出 `sdxl-recipe-clone/v1.json`。

**任务 1 — runner 服务骨架（独立仓库 / 独立目录，非 PixelVault 代码）**

- 实现 §4 的 4 个端点；内部用 ComfyUI HTTP API（localhost:8188）跑 `sdxl-recipe-clone` 模板。
- recipe → 模板参数映射；下载并缓存 LoRA（按 modelVersionId+sha256）；checkpoint 校验。
- 结构化错误码（§4）；`/v1/capabilities`；Bearer 鉴权；单任务队列 + 超时。
- 验收：`curl` 提交一条 recipe，轮询拿到 base64 图，hash 字段齐全；离线/缺 checkpoint/坏 LoRA 各返回正确 code。

**任务 2 — Worker `RecipeCloneWorkflow`**

- 照抄 image-queue：收 `WorkerRunContext` → Bearer 调 runner → 轮询 → 拿 bytes → `GENERATION_BUCKET.put()` → 签名回调。
- runner code → worker code 映射；`templateVersion/Hash/checkpointHash/loraHashes` 透传进回调 payload。
- 注册进 `wrangler.jsonc`；runner endpoint/token 走 Worker secret。
- 验收：本地 `wrangler dev` + 隧道指向本地 runner，端到端出一张图落 R2。

**任务 3 — PixelVault 接线**

- §8 的 constants / types / `runner.adapter.ts` / route resolve；`ILLUSTRIOUS_RECIPE_CLONE` 模型（flag + owner allowlist）。
- 复刻流程（`civitai-recipe-to-generation.ts` 一带）在 runner 可用时路由到 runner 模型。
- 验收：Studio 里对一张已知 Civitai 来源图点"复刻"，落库 `Generation` 带完整 `recipeSnapshot`，UI 显示结果。

**任务 4 — 错误 UX**

- §6 错误码 i18n（三文件）；`lora_incompatible_hosted` 分类 + "切复刻"CTA；`runner_offline` 路由 setup。
- 验收：关掉 runner 提交 → UI 明确提示离线 + 重试路径，不 hang、不假成功。

每个任务必须带对应 `.test.ts(x)`（CLAUDE.md Testing），跑 `npx vitest run --reporter=verbose`。

---

## 附录：10 个问题逐条结论

1. **runner 叫什么** → 新 adapter type `RUNNER`（角色名）。不叫 `comfy`、不挂 illustrious-xl providerConfig。新模型 `ILLUSTRIOUS_RECIPE_CLONE`。
2. **Worker 还是 Next.js 调 runner** → **Worker**（现状所有 provider 调用都在 Worker，runner 同理）。
3. **runner 还是 Worker 传 R2** → **Worker**（现状每模态都是 Worker `GENERATION_BUCKET.put`；runner 不持 R2 凭证）。
4. **workflow 模板版本化** → 模板归 runner 仓库，semver + sha256；请求传稳定 `templateId`，结果回 `templateVersion/Hash`，落 `recipeSnapshot`；已发布版本不可原地改。
5. **manifest 放哪、含啥** → PixelVault 侧 `src/constants/runner-checkpoints.ts`（id/displayName/baseModelFamily/civitaiModelVersionId/sha256/推荐采样器·clipSkip·vae/available）；runner 侧 `GET /v1/capabilities`（实际已装）。
6. **错误怎么表示** → 扩展现有 `GENERATION_ERROR_CODES`/`classifyProviderFailure`/`providerFailure(Json)`/i18n；runner 返回结构化 code，Worker 确定性映射；新增 7+ 个码（§6）。
7. **本地 runner 安全** → 不暴露 8188；Bearer + HTTPS(Cloudflare Tunnel)；runner 无 R2 凭证；禁任意 workflow；只允许 Worker 调；资源护栏；离线显式报错；v1 单用户（§7）。
8. **v1 是否只 Illustrious/WAI** → 是。契约通用形状，allowlist 收窄到 SDXL/Illustrious + 一模板。
9. **失败 UI 提示** → 把 Replicate layer 报错分类成 `lora_incompatible_hosted` + "切复刻 / 一键重试"CTA；runner 路径错误各给可操作 i18n，离线/缺装路由到 setup（仿 QuickSetupDialog，不 dead-end）；绝不静默降级 / 假成功。
10. **是否先写 docs/task packet** → 是（本文件）。Phase 0 本地证明零项目代码；证明通过才进 Phase 1。
