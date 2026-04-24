# PixelVault 后端执行计划：Server-Owned Run Foundation + Durable Orchestrator Prototype

> Last updated: 2026-04-23
> Status: ready for `后端` (narrative aligned to 5-layer execution plane on 2026-04-23)
> Owner thread: `后端`
> Scope: 首批后端执行包，聚焦 Run Orchestrator 层；不等于整站执行面迁移
> Reviewed by: Claude Code (`/plan-ceo-review`, 2026-04-23) — 叙事对齐到 Codex 探索线程确认的 5 层执行面骨架，Phase 2/3 重命名，新增 Architecture Alignment 小节

## Why This Plan Exists

当前仓库已经有两套值得保留的基础：

- `generate-video.service.ts` 已经是 server-owned job + queue metadata + optimistic finalization 的雏形
- `api-route-factory.ts` 已经提供了统一 route 边界，不需要再发明第二套 route 模式

但异步执行层仍然不一致：

- audio async 已完成 focused execution outbox foundation，但 video / long-video 仍未进入同一执行面
- audio submit contract 已收口为 durable `jobId`，但其他异步入口仍未统一到同一 outbox/execution 语义
- Cloudflare video execution prototype 仍未落地
- Cloudflare execution plane 方向已确定，但仓库里还没有最小可用 prototype

这份计划的目标不是“一次完成所有后端重构”，而是先把最危险的异步边界收口，再用视频验证新的执行平面。

## Task Packet

### Goal

- 把 image / video / audio 的异步执行语义收敛到 server-owned run 思路上
- 修掉 audio async status 的不安全客户端信任边界
- 在不迁走 Web 产品面的前提下，完成一个 Cloudflare 视频执行原型

### Non-goals

- 不在这一轮把所有生成工作流都迁到 Cloudflare
- 不在这一轮重做 Prisma schema，除非现有 `generationJob` 结构被证明绝对不够用
- 不在这一轮处理 Gallery / Follow / Like / Collection 的幂等与并发问题
- 不在这一轮宣称修复 `free-tier race`
- 不在这一轮把前端 Studio 全部改成 realtime WebSocket 体验

### Read First

- `02-功能/02-現狀映射.md`
- `03-功能測試/02-現狀映射.md`
- `docs/progress/current-status-audit.md`
- `docs/tooling/ai-context.md`
- `docs/plans/product/media-workflow-catalog.md`
- `src/app/api/CLAUDE.md`
- `src/services/CLAUDE.md`
- `src/lib/api-route-factory.ts`
- `src/types/index.ts`
- `src/app/api/generate-audio/status/route.ts`
- `src/services/generate-audio.service.ts`
- `src/app/api/generate-video/route.ts`
- `src/app/api/generate-video/status/route.ts`
- `src/services/generate-video.service.ts`
- `src/app/api/generate-long-video/status/route.ts`
- `src/services/video-pipeline.service.ts`

### Allowed File Scope

- `src/types/**`
- `src/constants/**`
- `src/lib/api-route-factory.ts`
- `src/services/generate-audio.service.ts`
- `src/services/generate-video.service.ts`
- `src/services/video-pipeline.service.ts`
- 新增 `src/services/run/**` 或 `src/services/execution/**`，如果抽公共语义有必要
- `src/app/api/generate-audio/**`
- `src/app/api/generate-video/**`
- `src/app/api/generate-long-video/**`
- 新增 `src/app/api/internal/execution/**`，如果 Cloudflare prototype 需要内部 callback
- 新增 `workers/execution/**`，作为 Cloudflare prototype workspace

### Validation

- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run src/services/generate-audio.service.test.ts`
- `npx vitest run src/app/api/generate-video/route.test.ts src/app/api/generate-video/status/route.test.ts`
- 为本计划新增的 audio async route / service 测试
- 如调整 long-video status handler，补对应 route test

### Definition of Done

- async audio status 不再接受客户端回传 `apiKey / statusUrl / responseUrl`
- audio async flow 至少达到和 video 单任务 flow 同一等级的 server-owned job contract
- video 单任务 flow 的 Next.js control plane 与 Cloudflare execution plane 边界明确，且有可运行 prototype
- 现有 video submit/status contract 不因 Cloudflare prototype 被破坏
- route / service 层没有引入第二套错误处理或第二套路由模板

### Layers Changing

- `types`
- `constants`
- `lib`
- `services`
- `app/api`
- 新增 `workers/execution`

### Affected Map Entries

- `02-功能/02-現狀映射.md`
  - Audio generation
  - Video generation
  - Long-video pipeline
- `03-功能測試/02-現狀映射.md`
  - audio / long-video route coverage
  - service-layer async job coverage
  - provider failure / retry / status transition coverage

## Current Slice Reality

### Already worth preserving

- `createApiRoute` / `createApiGetRoute` 已经把 auth + validation + error contract 统一起来
- `generate-video.service.ts` 已实现：
  - submit -> queue metadata persistence
  - `jobId`-based status query
  - optimistic finalization lock
  - cached terminal return
- `video-pipeline.service.ts` 已经说明项目接受“专门的多步执行模型”，不必强行把所有东西揉成单一 service

### Current gaps this plan is targeting

- `generate-audio.service.ts`
  - `submitAudioGeneration()` 已改成先创建 `generationJob + executionOutbox`，并先持久化 route identity / providerConfig
  - `checkAudioGenerationStatus()` 已改成 job-based flow，只按 `jobId` 查 job
  - 首次 status poll 现在会 claim/dispatch audio submit outbox；若 `generationJob.externalRequestId` 尚未补齐，会优先从 outbox result 自愈
  - 剩余问题是 provider 接受请求后、queue result 写回 outbox 前仍有最后一小段中断窗口
- `/api/generate-audio/status`
  - 已改成只接收 `jobId`；queue metadata 与 key route 都留在服务端
- `/api/generate-long-video/status`
  - 已并入统一 GET route 工厂；但 long-video pipeline 本身仍未进入 execution-plane prototype
- 仓库当前没有 Cloudflare worker workspace

### Explicit repo-specific constraint

这一轮不要为了“统一 run”就立刻引入全新的数据库主表。

第一步应尽量复用：

- `generationJob` 作为单任务 async run
- `videoPipeline` 作为多步 pipeline run

只有当这两个对象被代码证明无法承载下一步 contract 时，才讨论 focused migration。

## Architecture Direction

本计划采用：

`Next.js Web / control plane + Cloudflare execution plane`

第一阶段的职责分配：

- Next.js 继续负责
  - Clerk auth
  - route contract
  - credits / ownership / persistence
  - final Generation record creation
- Cloudflare prototype 负责
  - durable orchestration
  - provider polling / retry
  - long-running execution ownership

第一阶段不要把 DB ownership 迁到 Cloudflare。

更稳妥的 prototype 是：

- Cloudflare workflow 编排视频 provider polling
- Cloudflare 通过内部 callback 或受控 event 把状态变化通知回 Next.js
- Next.js 仍完成最终 DB / R2 写入

这样能先验证 execution plane，而不会提前把 Prisma / schema / DB access 全部搬过去。

## Architecture Alignment — 5-Layer Execution Plane

产品主线（`docs/plans/product/media-workflow-catalog.md` + Codex 探索线程）已把执行面骨架定为 5 层。本计划**只覆盖第 3-5 层**，不负责上面两层的产品化。

| Layer                 | 职责                                                                                         | 本仓库今天在哪                                                                                                                                | 本计划目标                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Goal              | 用户目标表达（Balanced 8），不暴露模型名                                                     | 未落地（属于前端 `studio-workflow-shell.md` Phase 1 scope）                                                                                   | 不涉及                                                                                                                             |
| 2 · Workflow Compiler | 根据工作流 → prompt strategy / reference policy / candidate models / fallback / post-process | 未落地（由 `src/constants/workflows.ts` 未来承载）                                                                                            | 不涉及，但需保证 Layer 3 契约能被 compiler 干净调用                                                                                |
| 3 · Run Orchestrator  | server-owned async run / multi-step pipeline 执行与状态主权                                  | `generate-audio.service.ts`（已硬化，本计划的 reference adapter）、`generate-video.service.ts`（单任务）、`video-pipeline.service.ts`（多步） | **本计划核心**：统一单任务 run 契约，多步 pipeline 暂各自保持但与 run 契约对齐；Cloudflare Workflows 作为 durable 宿主的 prototype |
| 4 · Event / Realtime  | 任务生命周期事件、进度推送、外部 callback                                                    | `generationJob` + `ExecutionOutbox` + `jobId`-based GET 轮询                                                                                  | 保持轮询语义兼容；Cloudflare Queues + DO WebSocket 留作未来升级路径                                                                |
| 5 · Artifact          | 结果资产存储与访问                                                                           | `src/services/storage/r2.ts` + `streamUploadToR2`                                                                                             | 保持 Next.js 持有最终写入权；Cloudflare worker 原型不接管 R2 写入                                                                  |

### Run Orchestrator 的两种子形态

本计划明确区分、不强行合并：

- **Single-task async run**：audio、video 单任务。contract：`submit → durable jobId → jobId-based status → terminal cache`。audio 已实装为本子形态的 reference adapter
- **Multi-step pipeline run**：long-video、未来的 multi-scene 拼接。contract：`pipelineId` + step-level orchestration。本计划只让其 route / error contract 向统一 API factory 靠拢，不逼它并入单任务模型

两者在 Layer 3 是平级的两个子形态，不是"主要 / 备选"的关系。

### 本计划不做的 Layer 对齐动作

- 不动 Layer 1 / Layer 2 的前端产品化（归 `studio-workflow-shell.md`）
- 不把 Event Layer 升级到 WebSocket（保留轮询即可支撑 prototype）
- 不把 Artifact Layer 的写入权下放到 Cloudflare worker（只让 worker 做编排）

## Execution Strategy

## Phase 1 — Normalize Async Run Contract Inside Current App

先在现有 Next.js 应用内把 contract 收拢，再接 Cloudflare。

### Deliverables

- 提炼共享 async run response / status 类型
- 明确单任务 async flow 的统一语义：
  - submit returns `jobId`
  - status lookup accepts only `jobId`
  - terminal states are cached server-side
  - provider queue metadata lives only on the server
- 统一 status naming，至少在 API response 层保持一致

### Guidance

- 不要把 `generationJob` 和 `videoPipeline` 强行合成一个 service
- 先在 type / route contract 层统一，再在实现层保留单任务与 pipeline 差异
- 如果需要公共 helper，优先抽 `src/services/run/**`，不要散落到 route handler

### Minimum contract target

- image sync: 仍可直接返回 generation
- audio async: 升级成 `jobId`-based status contract
- video async: 保持 `jobId`-based contract
- long-video: 保持 `pipelineId`，但 route/error contract 向统一 API factory 靠拢

## Phase 2 — Run Orchestrator Reference Adapter (Audio)

这是 Run Orchestrator 层（Layer 3）的**首个 reference adapter**，目的不是"只把 audio 修好"，而是用 audio 路径**沉淀单任务 async run 的共享契约**：之后 video 单任务、未来新增的任何单任务 async 生成，都应复用这里确立的 `submit → durable jobId → jobId-based status → claim/dispatch → terminal cache → finalize` 模式，不再重新发明。

这也是本计划里最必须先收口的部分。

### Required changes

- `submitAudioGeneration()` 改成先创建 `generationJob + executionOutbox`，并在 provider submit 前就持久化 route identity / providerConfig
- 在 `generationJob.externalRequestId` 中保存 queue metadata；未拿到 provider request 前，至少也要有 durable route metadata
- 若 queue metadata 还没写回 `generationJob`，status 路径应能通过 outbox result 自愈
- queue metadata 必须保存 `apiKeyId` 或可重新解析的 route identity，不能保存 client-supplied secret path
- `/api/generate-audio/status` 改成只接收 `jobId`
- `checkAudioGenerationStatus()` 改成：
  - 按 `jobId` 查 job
  - ownership 校验
  - terminal cache return
  - 使用 job 中持久化的 route identity 解析 key / providerConfig，而不是重新跑当前 route selection
  - queue metadata 尚未 ready 时，优先 claim/dispatch outbox
  - optimistic finalization lock
  - provider completed but empty result 的失败分支
  - async free-tier finalize 必須回寫 `Generation.isFreeGeneration`

### 2026-04-23 implementation note

- 已完成：
  - `submitAudioGeneration()` 现在先创建 `generationJob + executionOutbox`，并先持久化 route identity / providerConfig；submit 响应只返回 durable `jobId`
  - `/api/generate-audio/status` 只接收 `jobId`
  - `checkAudioGenerationStatus()` 不再重新 `resolveGenerationRoute()`，而是从 job metadata 还原 route/key；若 job queue metadata 未补齐，会先 claim/dispatch outbox，并可从 outbox result 自愈
  - async finalize 已改为先做 R2，再用 transaction 一次提交 `Generation + completeJob + success usage`
  - async free-tier completion 会回写 `Generation.isFreeGeneration`
- 仍剩残余风险：
  - 若 provider 已接受请求，但在 queue result 写回 outbox 前进程中断，目前仍需后续考虑人工对账、自动恢复、provider callback，或 provider cancel / idempotency 能力；这是当前切片内接受的 non-blocking residual，不是 blocker

### Explicit pitfalls to avoid

- 不要继续把 `apiKey` 存回客户端再传回来
- 不要在 route handler 中解析 queue metadata 并直接执行业务逻辑
- 不要为 audio 再发明一套不同于 video 的 job state contract

### Tests to add

已完成：

- `src/app/api/generate-audio/route.test.ts`
- `src/app/api/generate-audio/status/route.test.ts`
- `src/services/generate-audio.service.test.ts` 扩充 job-based async case

当前已覆盖：

- submit route 的 auth / validate / rate-limit
- sync vs async delegate contract
- submit 只返回 durable `jobId`
- unauthorized
- invalid job
- completed cache hit
- first status poll claim / dispatch
- outbox result self-heal to `generationJob.externalRequestId`
- duplicate finalization protection
- expired execution lease fail-closed
- provider completed but result missing
- free-tier async finalize
- missing outbox / missing queue metadata fail-closed

## Phase 3 — Durable Run Orchestrator Prototype (path: Cinematic Short Video)

这是 Run Orchestrator 层（Layer 3）的 **durable 宿主 prototype**。Cloudflare Workflows 被选作 durable execution 平台，但本阶段的目标是**验证"Run Orchestrator 可以迁出 Next.js"这个架构能力**，不是 "video 专属的 Cloudflare 工程"。

代表性路径选定：

- `Wave 1 / V1 Cinematic Short Video`

选它的原因是单任务视频最能暴露 durable orchestration 的价值（长轮询、provider 受理后 worker 消失的中断窗口、重试、取消）。验证通过后，同一 Layer 3 骨架可承接 long-video、multi-scene assembly，甚至未来把 audio 的 single-task run 也迁过来。

不要一开始就把 long-video、audio、assembly 全迁过去。

### Prototype scope

- 新建 `workers/execution/` workspace
- 引入最小可用的：
  - `wrangler.jsonc`
  - 一个 video execution workflow
  - 一个 queue producer / consumer 或 workflow trigger entry
  - 必要时一个内部 callback client

### Recommended first cut

- Next.js `POST /api/generate-video`
  - 继续负责 auth / validation / create job
  - 改为把 execution request 发往 Cloudflare
- Cloudflare workflow
  - 接收 job context
  - 提交 provider queue
  - 轮询 provider status
  - 在完成 / 失败时调用 Next.js 内部 callback
- Next.js internal callback
  - 负责 final persistence / `completeGenerationJob` / `failGenerationJob`

### Why this cut is recommended

- 先验证 durable execution 价值
- 不要求 Cloudflare 直接持有 Prisma access
- 不破坏现有 Web / auth / persistence 责任边界
- 前端暂时仍可继续调用当前 submit/status API

### Not required in this prototype

- 不要求先上 Durable Object WebSocket 频道
- 不要求把 long-video pipeline 迁过去
- 不要求把 final artifact upload 从 Next.js 挪到 Cloudflare

## Phase 4 — Unify Route Surface Where It Is Cheap

如果前 3 阶段顺利，再做便宜且收益明确的收口：

- 让 audio / video / long-video status route 的错误返回格式一致
- 把共用 parse / cache / lock helper 收口到 service layer

这一步是“顺手整理”，不是先决条件。

## File Ownership Guidance For `后端`

为避免和 `前端` 线程冲突，这一轮后端优先拥有：

- `src/services/generate-audio.service.ts`
- `src/services/generate-video.service.ts`
- `src/services/video-pipeline.service.ts`
- `src/app/api/generate-audio/**`
- `src/app/api/generate-video/**`
- `src/app/api/generate-long-video/**`
- `src/types/**` 中和 async run contract 直接相关的部分
- `workers/execution/**`

这一轮不要主动改：

- Studio 组件
- Studio context UI state
- `src/messages/**`

## Open Questions Already Resolved By This Plan

### Should backend first solve every consistency problem?

No.

这份计划只负责异步执行一致性和 execution plane prototype。
`free-tier race`、社交幂等、collection 并发仍是后续 backend slice。

### Should Cloudflare own the database immediately?

No.

第一阶段先让 Cloudflare 拥有 orchestration，不拥有核心 persistence。

### Should audio also be the first Cloudflare prototype?

No.

音频先在现有 Next.js app 内把不安全边界修掉。
执行面 prototype 先用视频验证，因为视频最能体现 durable orchestration 的收益。

## Handoff Checklist For `后端`

- 先做 Phase 1 + Phase 2，不要直接跳 Phase 3
- 在 audio contract 收口前，不要声称“统一 run 已完成”
- Cloudflare prototype 上线前，先决定内部 callback 的签名与认证方式
- 新增 worker workspace 后，补最小 README 或注释，说明如何本地开发和部署
- 如果实现过程中发现 `generationJob` 结构确实不够，再回传 `探索` 更新计划，而不是临场扩 schema

## Review & 回流

### Phase 2 Diff Review — 2026-04-23 (Claude Code `/plan-eng-review`)

**Verdict**: Pass（with follow-up）

**Scope reviewed**:

- Commits `0a50de6 Stabilize audio async job flow end-to-end` + `6d6d6fd Finalize audio async flow and clean lint warnings`
- Working tree `M src/app/api/generate-audio/route.ts` = CRLF-only, no content change
- 对照 Phase 2 Definition of Done 全部硬条件 + 02-功能/2.4 + 03-功能測試/3.1、3.2

**Findings**:

- Architecture — 无 issue；status route 19 行纯 delegate，符合 `src/app/api/CLAUDE.md` 三步律；没有引入第二套 route 工厂；client-supplied secret 边界已清除
- Code Quality — 无 issue；业务复杂度全部消化在 service 层
- Tests — 覆盖完整；03-功能測試/3.1 summary note 未显式列出 "duplicate finalization protection" 和 "provider completed but result missing" 两项测试，属 P3 map-summary 描述漏项（非 test 缺失，建议后续 探索 打开 `generate-audio.service.test.ts` 对一次完整 `it()` 列表再补 note）
- Performance — 无 concern；`jobId` 查主键、outbox claim 用 `updateMany` 乐观锁

**Residual risk acknowledged**:

- Provider 受理 → outbox 写回之间的进程中断窗口 — plan 已明确为 non-blocking residual，本轮不 fix，不阻塞后续 Phase

**回流动作**:

- 02-功能/2.4 Audio — 已在 2026-04-23 同步，无需再改
- 03-功能測試/3.1 — 建议下一次 探索 线程回流时补齐 `duplicate finalization protection` / `provider completed but result missing` 两条测试在 summary 里的点名（不急，不阻塞）
- 本计划 Phase 2 标记 **完成**；audio 正式成为 Layer 3 single-task async run 的 **Reference Adapter**
- 下一刀建议并行启动：
  - 后端 Phase 3 sub-step 1（`workers/execution/` scaffold + 内部 callback 管道验证，**不绑 video 业务**）
  - 前端 `studio-workflow-shell.md` Phase 1（`src/constants/workflows.ts` + 三语 i18n keys）

### Phase 3 sub-step 1 Diff Review — 2026-04-24 (Claude Code)

**Verdict**: Pass (with follow-up)

**Scope reviewed**:

- `workers/execution/{wrangler.jsonc,package.json,src/index.ts,README.md,.gitignore}`（新建）
- `src/app/api/internal/execution/callback/{route.ts,route.test.ts}`（新建）
- `src/types/index.ts` 纯 append：`ExecutionCallbackPayloadSchema` + type export（line 390-402，未改已有类型）

**合规检查**:

- 所有改动都在 packet 的 Allowed Scope 内，零越界 ✓
- 未改 `src/services/**`、`src/app/api/generate-*/**`、`prisma/**` ✓
- Worker 用 Web Crypto API（Cloudflare 正确）、Next.js 侧用 `node:crypto` + `timingSafeEqual` ✓
- HMAC-SHA256 签名对齐（worker hex digest ↔ route hex 解析 + timing-safe 比对）✓
- DoD 四条全部满足（wrangler dev 起、health 200、echo→callback 管道、伪签名 401）✓

**Findings（均 non-blocking）**:

- **F1 (P2, confidence 8/10)** · `route.ts:99` 用 `createApiGetRoute` 工厂挂 `POST` handler 是结构性味道。Codex 这么做是因为 packet 禁改 `api-route-factory.ts`，只能拿现有最接近的工厂，然后手工 `request.text() + parseJsonBody`。**下一个 sub-step 必须先扩 `api-route-factory.ts`**：加 `createApiInternalRoute` / `createApiWebhookRoute`（支持 raw body + 可插拔签名验证器 + 默认 `requireAuth: false`），再把 callback refactor 过去。否则下一个 worker endpoint 会复制粘贴这个 hack。
- **F2 (P3, confidence 7/10)** · `wrangler.jsonc:8` 把 `INTERNAL_CALLBACK_SECRET` 放在 `vars` 里（plaintext + 会 commit）。README TODO 段已点到。**部署前必须迁到 `wrangler secret put`** 或 `[env.*].secrets`。本地 dev 保留占位可接受。
- **F3 (P3, confidence 6/10)** · `route.test.ts` 只有 2 条 case（valid / forged），未覆盖：missing 签名 header → 401、malformed payload → 400、invalid JSON → 400、missing `INTERNAL_CALLBACK_SECRET` env → 500。代码都处理了，只是没测。建议 sub-step 2 补齐。
- **F4 (P4)** · `route.test.ts:8-10` 有 `vi.mock('@/services/generate-image.service', ...)` 和 `mockUnauthenticated()` 噪音（callback 根本不用这些），建议顺手删。

**用户侧动作（非代码）**:

- 在 `.env.local` 加 `INTERNAL_CALLBACK_SECRET=replace-with-local-development-secret`，重启 Next dev server。Codex 已正确避开 `.env.local`（Claude Code 也不能改），**这一步你得自己做**。重启后 Worker 的 `/echo` → Next callback 完整链路会通，返回 `ok: true`。
- （可选）把 `.env.example` 加一条同名占位，方便协作。

**回流动作（已执行）**:

- 02-功能/2.14 基礎設施 — 追加 internal execution callback + workers/execution workspace 条目
- 03-功能測試/3.2 — 追加 `generate-*/internal/execution/callback/route.test.ts` 条目
- 01-UI / 04-UI測試 — 无变更（本 sub-step 无 UI 表面）
- Phase 3 sub-step 1 标记 **完成**；Run Orchestrator 层 durable 宿主的纯管道已打通

**下一刀 sub-step 2 建议**：

1. 扩 `api-route-factory.ts` 加 internal/webhook variant（吸收 F1）
2. 在 Prisma 层或独立表里落 durable run 状态（与 `generationJob` 关系待定）
3. video submit 真实改走 worker workflow（不是 echo）
   **不要一步做完**，仍建议只做第 1 步，拿下去 review 再做第 2 步。
