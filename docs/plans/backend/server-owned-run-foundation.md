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

### Phase 3 sub-step 2 part 1 Diff Review — 2026-04-24 (Claude Code)

**Verdict**: Pass

**Scope reviewed**:

- `src/lib/api-route-factory.ts`（新增 `createApiInternalRoute` + `InternalRouteConfig` 接口 + `parseRawJsonBody` 辅助）
- `src/lib/api-route-factory.test.ts`（新增 `describe('createApiInternalRoute', ...)` 3 条 case）
- `src/app/api/internal/execution/callback/route.ts`（refactor：134 行 → 101 行）
- `src/app/api/internal/execution/callback/route.test.ts`（扩：2 条 → 6 条 case）

**合规检查**:

- 所有改动都在 packet Allowed Scope 内 ✓
- `createApiRoute` / `createApiGetRoute` / `createApiPutRoute` / `createApiDeleteRoute` 等现有 factory 零修改 ✓（逐一读过）
- `createApiInternalRoute` 走独立接口 + 独立流程，不侵入用户路由链路 ✓
- JSDoc 明确 "for machine-to-machine callbacks/webhooks. It does not perform Clerk auth and must not replace user-facing route factories" ✓
- callback route 不再用 `createApiGetRoute` 挂 POST 的 hack，直接用 `createApiInternalRoute` + `ExecutionCallbackPayloadSchema` ✓
- `verifyExecutionSignature` 作为 config 传入，职责清晰；handler 只剩 console.log + return，业务逻辑已不在 route 层 ✓
- 上一轮 sub-step 1 Review 的 F1 / F3 / F4 finding 全部被吸收（F1 factory 扩展、F3 补 4 条测试、F4 清理噪音 mock）✓

**Findings（均 P4 小瑕疵，不阻塞）**:

- **F1 (P4, confidence 8/10)** · `InternalRouteConfig.verifySignature` 返回 `void`，调用方必须 throw 才能拒绝。如果未来要支持异步验签（调外部 KMS / remote JWKS），签名需要改 `Promise<void>`。现在同步足够
- **F2 (P4, confidence 7/10)** · `createApiInternalRoute` 的 `logger.info` 不记 `userId`（因为无 auth），结构与用户路由略有差异。建议 sub-step 2 part 2 加 `routeType: 'internal'` tag
- **F3 (P4, confidence 9/10)** · callback `route.ts` 里 `getInternalCallbackSecret` 和 `parseSignatureHeader` 仍是 route-local helpers。当有第二个内部 callback（Stripe webhook、provider callback）时，签名验证逻辑会复制。留作后续 sub-step：签名验证器下沉到 `src/lib/signature-verifiers/**`

**回流动作（已执行）**:

- 02-功能/2.14 基礎設施 — `api-route-factory.ts` 现在导出 `createApiInternalRoute`；callback route 从临时权宜正式 refactor
- 03-功能測試/3.2 — callback route test 从 2 条扩到 6 条
- 03-功能測試/3.1 由于 `api-route-factory.test.ts` 原本就在 lib test 列表里（隐含），不再单独追加条目；`createApiInternalRoute` 的 3 条 factory case 已附在同一文件
- 01-UI / 04-UI測試 — 无变更
- sub-step 2 part 1 标记 **完成**

**下一刀 sub-step 2 part 2 建议**：

1. 在 Prisma 层或独立表里落 durable run 状态（与 `generationJob` 关系待定）
2. 选定 Wave 1 Cinematic Short Video 的 video submit 路径作为第一条真实迁移
3. video submit 改成：Next.js validate + create generationJob → 推 run context 给 worker → worker 轮询 provider → 完成时 callback 回 `/api/internal/execution/callback` → Next.js 写 R2 + finalize
4. 顺手吸收本次 F2（internal route logger tag）
5. 生产部署：Vercel env vars 和 Cloudflare `wrangler secret put` 两边都配强随机 `INTERNAL_CALLBACK_SECRET`，Preview / Production 分别不同值

**预估**：人时 2-3 天 / Codex ~3-4h。**不要一次做完**，DB 层和 video submit refactor 拆成两个 packet。

### Phase 3 sub-step 2 part 2 Diff Review — 2026-04-24 (Claude Code)

**Verdict**: Pass

**Scope reviewed**:

- 新建 `src/services/execution-callback.service.ts` + `.test.ts`
- `src/app/api/internal/execution/callback/route.ts`（handler 改为 delegate 到 service，保留一行 summary console.log）
- `src/app/api/internal/execution/callback/route.test.ts`（6 条原有 case 适配新返回结构 + 新增 1 条 404 case，共 7 条）

**合规检查**:

- 所有改动都在 packet Allowed Scope 内 ✓
- Prisma schema 零改动 ✓（明确 non-goal，按 "先尽量复用 generationJob" 约束）
- api-route-factory.ts / workers/execution/\*\* / generate-\*.service.ts / video-pipeline.service.ts 零改动 ✓
- service 首行 `'server-only'` ✓（符合 services/CLAUDE.md 规则 1）
- 只经 `@/lib/db` 访问 DB（规则 2），API route 不含业务逻辑（规则 3），无 client 信任 ✓
- runId === generationJob.id 约定实装正确：`findUnique({ where: { id: payload.runId } })` ✓
- 幂等骨架到位：terminal status (COMPLETED / FAILED) 短路返回 `ignored-terminal` 且不调 `db.update` ✓
- kind 分派清晰（ping / status / result 全走 log），`result` 分支有明确 TODO 指向 part 3 ✓
- 返回结构 `{ runId, jobStatus, action }` 按 packet spec ✓
- 7 条 route test 全部在无效路径 assert `mockHandleExecutionCallback.not.toHaveBeenCalled()`，证明 factory 的短路先于 service dispatch ✓

**Findings（均 P4 非阻塞）**:

- **F1 (P4, confidence 9/10)** · `execution-callback.service.test.ts` L13, L19 声明并 mock 了 `db.generationJob.update`，但 service 从不调 update（part 2 只 log 不写）。死 mock，可在 part 3 接 finalize 时顺手用或删
- **F2 (P4, confidence 7/10)** · `toExecutionCallbackJobStatus` 把 Prisma 的 string status 守护成本地 union 再返回，逻辑上是 defensive。Prisma 7 生成的 `GenerationJobStatus` 应该已经是 enum type，直接 cast 也可以。**保留原因**：万一 Prisma client 和仓库 enum 漂移，这道守护会把 hard fail 提早到 500 而非 silent bug。可接受
- **F3 (P4, confidence 8/10)** · service 返回 `action: 'not-found'` 作为类型字面量声明了，但实际代码是抛错不返回，永远不会用到 'not-found' 这个 action。type union 里多了一个永不出现的分支。可在下次 refactor 清理

**回流动作（已执行）**:

- 02-功能/2.14 基礎設施 — 追加 `execution-callback.service.ts` + handler 改 delegate 的说明
- 03-功能測試/3.1 Service 單測 — 追加 `execution-callback.service.test.ts`（6 cases）
- 03-功能測試/3.2 Route 測試 — callback 从 6 条扩到 7 条
- 01-UI / 04-UI測試 — 无变更
- sub-step 2 part 2 标记 **完成**

**Part 3 留给未来的 TODO 清单（Codex 已标注的）**:

1. `result` kind 的 log-only 分支要接到真实 finalize：R2 写入 + `completeGenerationJob` / `failGenerationJob`
2. 决定 video submit 推到 worker 的 payload 形状（run context 字段）
3. 决定 worker 侧轮询 provider 的策略（间隔、超时、取消信号如何回传）
4. 生产部署时 Vercel + Cloudflare 两边 `INTERNAL_CALLBACK_SECRET` 配强随机值，Preview / Production 分开
5. 吸收本 part 2 的 F1（dead mockUpdate）和 F3（'not-found' action 永不出现）

### Phase 3 sub-step 2 part 3 Diff Review — 2026-04-24 (Claude Code)

**Verdict**: **Pass with critical follow-up**（P1 需在跨层 tiny packet 里吸收才真正可用）

**Scope reviewed**:

- 新建 `src/app/api/internal/execution/resolve-key/route.ts` + `.test.ts`
- 新建 `src/services/api-key-resolver.service.ts` + `.test.ts`
- 新建 `src/services/generate-video.service.test.ts`
- `src/services/execution-callback.service.ts`（+203/-10，result 分支接入 R2 finalize）
- `src/services/execution-callback.service.test.ts`（+177 新 finalize case）
- `src/services/generate-video.service.ts`（+225/-2，CINEMATIC_SHORT_VIDEO 分支 dispatch 给 worker）
- `src/types/index.ts`（+76 append：ExecutionCallbackResultData/ErrorData、ResolveKeyRequest/Response、WorkerRunContext、WorkerDispatchResult；GenerateVideoRequest 扩 workflowId 可选字段）
- `src/constants/execution.ts`（+15 新增 EXECUTION_INTERNAL / EXECUTION_WORKER 常量）
- `workers/execution/src/index.ts`（+513/-12，Cloudflare Workflow CinematicShortVideoWorkflow + dispatch handler + resolveApiKey + FAL queue submit/poll + emitCallback）
- `workers/execution/wrangler.jsonc`（Workflow binding）
- `workers/execution/README.md`（+126 部署和本地开发流程）
- `workers/execution/src/cloudflare-workers.d.ts`（新建 37 行，Cloudflare Workers runtime 类型）

**合规检查**:

- Prisma schema 零改动 ✓
- `audio` / `long-video` / `image` service 和 route 零改动 ✓
- `api-route-factory.ts` 零改动（复用 part 1 的 createApiInternalRoute）✓
- `resolve-key` 走同一 factory + 同一 HMAC + 响应加 `Cache-Control: no-store`（packet 硬要求）✓
- `getApiKeyValueById` 验证：存在 + userId match + isActive + 解密不抛——已读源码确认（src/services/apiKey.service.ts）✓
- `resolveExecutionApiKey` 的 4 个拒绝条件全部齐（job 不存在 / job terminal 含 CANCELLED / key 不属于 user / key inactive），失败统一 403 防枚举 ✓
- `isCinematicShortVideoWorkerRequest` gate 三条件全满足才走 worker：`workflowId === CINEMATIC_SHORT_VIDEO` + `adapterType === FAL` + `apiKeyId` 存在。**任何一条不满足回退到 inline 路径，非 CINEMATIC_SHORT_VIDEO 视频请求完全无影响** ✓（回归安全）
- Worker 侧 HMAC 用 Web Crypto API（Workers runtime 正确），Next.js 侧用 `node:crypto + timingSafeEqual` ✓
- 自动化验证：tsc / lint / vitest（30 tests in 5 files）/ wrangler deploy --dry-run 全绿；伪签名 → 401 已测 ✓

**Findings**:

- **F1 (P1, confidence 9/10)** — **前端没有把 `selectedWorkflowId` 写进 `GenerateVideoRequest.workflowId`**。`src/hooks/use-unified-generate.ts` 里 `grep workflowId` 零命中。`types/index.ts` 的 schema 已扩字段（optional），backend 已根据 workflowId 分流，**但前端从未传**。净效果：用户在 Studio 选 CINEMATIC_SHORT_VIDEO 点生成 → submit payload `workflowId=undefined` → 后端 gate 不通过 → 仍走 inline 路径。worker 代码完备但 UI 侧不可达。**这是我上一轮两个 packet 严格按前后端切分 scope 留的跨层缝隙，不是 Codex 的执行问题**。需要一个 tiny 跨层 follow-up packet，~20 行：在 use-unified-generate 或对应 video submit 构造点，把 `useStudioContext().selectedWorkflowId` 注入到 payload.workflowId；补一条 use-unified-generate 测试验证 workflowId 透传。在这之前，E2E smoke 不可能跑通（worker 路径永远不触发）。
- **F2 (P2, confidence 8/10)** — `execution-callback.service.ts` 的 `finalizeExecutionResult`（line 190-318）**不用 `db.$transaction` 包** `createGeneration + completeGenerationJob + createApiUsageEntry`。audio reference adapter 的 finalize **是**用 transaction 的（per 02-功能 2.4 updated note："R2 先做，再用 transaction 一次提交 Generation + completeJob + success usage"）。当前 video 实现：R2 upload 成功 → createGeneration 成功 → `Promise.all([completeGenerationJob, createApiUsageEntry])` 失败 → 外层 catch 调 failGenerationJob。**结果是 Generation record 已存在（用户视角内容已生成）但 job 被标 FAILED，且 usage ledger 缺失**。dissonance 不是数据腐败但用户会困惑 + 计费不准。建议 sub-step 2 part 3 follow-up 或 Phase 4 整理时吸收，统一到 audio 的 transaction pattern
- **F3 (P3, confidence 9/10)** — 签名验证代码（getInternalCallbackSecret + parseSignatureHeader + verifyExecutionSignature）在 callback/route.ts 和 resolve-key/route.ts 完全复制。现在已 2 处了，未来任何内部 endpoint 会继续复制。建议下一次 refactor 抽到 `src/lib/signature-verifiers/execution-signature.ts` 导出 `createExecutionSignatureVerifier(secretGetter)` 返回 verifier 函数
- **F4 (P3, confidence 8/10)** — `externalRequestId` 字段被多重语义过载：audio 存 `serializeAudioQueueMetadata(...)`，video worker 路径存 `JSON.stringify({ workerManaged, workflowId, referenceImageUrl, characterCardIds, workflowInstanceId })`，原本语义是"provider's request ID"。不会冲突（每次都整块覆写），但字段名已不准确。建议未来（part 4+）给 `generationJob` 加个明确的 `metadata: Json?` 字段，或把 workflowInstanceId 做成独立列
- **F5 (P3, confidence 7/10)** — `getWorkerBaseUrl()` 和 `getInternalCallbackSecret()` 的 env 检查发生在 `dispatchWorkerRun()` 调用时，即 **generationJob 已经创建之后**。env 缺失 → job 创建 → dispatch 抛错 → failGenerationJob 立即标 FAILED。用户看到"失败"的生成记录，但这是配置问题不是生成失败。应在 `submitCinematicShortVideoWorkerRun` 入口先 check env，不通过直接抛 500（或 fallback 到 inline 路径）
- **F6 (P4, confidence 8/10)** — reference image 在 dispatch 之前就 upload 到 R2。如果 dispatch 失败，R2 里的 ref image 就 orphan 了。无清理逻辑。每次失败 dispatch 多 1 个 orphan。量极低，资源占用可忽略，但可以留 TODO
- **F7 (P4)** — resolve-key service test 的 case 3（key 不属于 user）和 case 4（key inactive）测试路径完全相同（都 mock getApiKeyValueById 返回 null）。两个 case 名字不同但代码路径不区分。可合并或重命名更准确
- **F8 (P4)** — api-key-resolver.service 把 CANCELLED 放 TERMINAL set 但没有 explicit test case。service test 覆盖 COMPLETED 和 FAILED，没覆盖 CANCELLED
- **F9 (P4)** — callback service 的 `ExecutionCallbackAction` type union 里有 `'not-found'` 字面量，但代码从不 return 'not-found'（runId 不存在直接抛错）。永远不会出现的分支，可清理

**关于 E2E smoke**:

Codex 报告"worker 当前缺 `.dev.vars` secret，无法发 signed callback/resolve-key"——这是 handoff 给你的动作，不是代码问题。即便你加了 secret，**F1 未修之前**，Studio UI 点 CINEMATIC_SHORT_VIDEO 也不会走 worker 路径，因为 workflowId 没传。E2E smoke 需要 F1 修完才能跑通。

**回流动作（已执行）**:

- 02-功能/2.14 基礎設施 — 追加 resolve-key 内部路由 + api-key-resolver service + execution-callback finalize + worker Cloudflare Workflow 条目
- 02-功能/2.3 视频生成能力 — 追加 CINEMATIC_SHORT_VIDEO worker-managed 分支说明
- 03-功能測試/3.1 service 单测 — 追加 api-key-resolver 测试；execution-callback 测试数扩
- 03-功能測試/3.2 路由测试 — 追加 resolve-key/route.test.ts
- 01-UI / 04-UI測試 — 无变更
- sub-step 2 part 3 标记 **Pass with critical follow-up**：worker 路径代码完备，E2E unreachable 等 F1 micro-packet 吸收

**F1 micro-packet（下一刀）**：

```
Goal：把 selectedWorkflowId 从 studio-context 注入到 video submit payload，打通 UI 到 worker 路径。
Allowed scope: src/hooks/use-unified-generate.ts + 对应 .test.ts。
~20 行改动。完成后 INTERNAL_CALLBACK_SECRET 配好即可跑 E2E smoke。
```

### F1 micro-packet Diff Review — 2026-04-24 (Claude Code)

**Verdict**: Pass · **P1 已吸收**

**Scope 修正**：Codex 正确识别 `useUnifiedGenerate` 是 StudioProvider 内部 Gen context 的 producer（在 StudioFormContext.Provider 上游被调用），在 hook 内 `useStudioContext()` 会拿到 null。真实 payload 构造在 `StudioPromptArea.tsx`（已经是 StudioFormContext consumer）。我同意扩 scope 到 `StudioPromptArea.tsx` + `.test.tsx`，`use-unified-generate.ts` 未动。

**Diff 审查**：

- `StudioPromptArea.tsx`：
  - import `getWorkflowById` + `WORKFLOW_MEDIA_GROUPS` 消费 constants，不重复定义 workflow → mediaGroup 映射
  - `buildVideoInput` 的 payload 构造里用 `state.selectedWorkflowId` 查 workflow，仅当 `mediaGroup === VIDEO` 时 conditional spread `workflowId` 进 payload
  - `useMemo` deps 同步加上 `state.selectedWorkflowId`，无 stale closure 风险
- `StudioPromptArea.test.tsx`（新建 216 行）：3 条 case 覆盖 CINEMATIC_SHORT_VIDEO / CHARACTER_TO_VIDEO / QUICK_IMAGE

**合规**：只改 2 个 scope 内文件，零越界。INTERNAL_CALLBACK_SECRET 已配好（`.dev.vars` + `.env.local`），`/health` 200、`/echo` HMAC 验证通过（看到 404 EXECUTION_RUN_NOT_FOUND 就是成功信号，因为 runId 'local-ping' 不存在于 DB）。

**E2E 现在可触发**：Studio 选 CINEMATIC_SHORT_VIDEO + 配 FAL key + 点生成 → submit payload.workflowId === 'CINEMATIC_SHORT_VIDEO' → backend gate 通过 → Worker dispatch → resolve-key 反向调 → FAL poll → callback result → R2 finalize → generation record 创建。全链路完整可达。
