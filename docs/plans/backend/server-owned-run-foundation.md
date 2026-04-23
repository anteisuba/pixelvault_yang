# PixelVault 后端执行计划：Server-Owned Run Foundation + Cloudflare Video Prototype

> Last updated: 2026-04-23
> Status: ready for `后端`
> Owner thread: `后端`
> Scope: 首批后端执行包，不等于整站执行面迁移

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

## Phase 2 — Audio Async Hardening

这是本计划里最必须先收口的部分。

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

## Phase 3 — Cloudflare Video Execution Prototype

Cloudflare prototype 只验证一条代表性路径：

- `Wave 1 / V1 Cinematic Short Video`

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
