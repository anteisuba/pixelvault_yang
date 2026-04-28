# PixelVault 两主线规划 — 技术债修复 & 创作控制能力

> **起草日**: 2026-04-25 · **作者**: Claude (主规划会话) · **交接对象**: 新会话细化 → codex 实施 → 主会话 review → codex 二轮 review。
>
> **阅读前置**: 先读 [docs/plans/ui/02-現狀映射.md](../ui/02-現狀映射.md)、[docs/plans/feature/02-現狀映射.md](../feature/02-現狀映射.md)、[docs/plans/qa/functional/02-現狀映射.md](../qa/functional/02-現狀映射.md)、[docs/plans/qa/ui/02-現狀映射.md](../qa/ui/02-現狀映射.md) 四份现状映射(基准日 2026-04-22 ~ 2026-04-24)。
>
> **协作流**: 本文档只给**战略分层与边界**,不给 TDD 步骤。新会话接手后必须为每个 Phase 产出 `superpowers:writing-plans` 规范的子计划,文件落到 `docs/plans/backend/` `docs/plans/frontend/` 或 `docs/plans/roadmap/能力扩展/`。

---

## Context

2026-04-24 第三方顾问对 PixelVault 做了两轮建议:

1. **第一轮**: 打开稳定性、首屏理解、第一次生成路径、复杂功能分层 — 属于「现有产品的可用性债」。
2. **第二轮**: 用户如何稳定拿到想要的图/视频/音频 — 主张从「prompt → generate」升级到「Intent → Plan → Sample → Lock → Refine」的创作控制系统。

用户(@xiuruisu)确认分两条主线推进:

- **Plan A** — 既存代码技术债 + 稳定性 + UX 基础修复(不引入新业务概念)
- **Plan B** — 创作控制能力拓展(严格按 **图 → 视频 → 音频** 顺序)

### 用户明确的边界(2026-04-24 AskUserQuestion 确认)

- Gallery 定位是「展示大厅」,**不**引入 remix / extract-to-card / use-as-reference 入口。Recipe 复用只发生在用户自己的 Profile / Library / Archive 内。
- Plan B 严格串行: 图做到可用 → 视频做到可用 → 音频做到可用,不追求三媒介同时完美抽象。

### 代码现状证据盘点(主会话 Phase 1 结论)

由文档 + 3 个 Explore agent 平行校验,核心事实:

- **规模**: 37 service · 80 API route · 8 provider adapter · 67 测试文件 · 467 Vitest 用例 · Route 覆盖 43%(34/80)
- **Worker 执行平面**: 2026-04-24 落地 — `workers/execution/` + `/api/internal/execution/callback` + `/api/internal/execution/resolve-key` + R2 finalize(见 [feature/02-現狀映射.md](../feature/02-現狀映射.md) §2.14)
- **Studio Workflow-first shell**: 2026-04-24 落地 — `StudioWorkflowGroupTabs / Picker / Summary` + `StudioAdvancedDrawer`(见 [ui/02-現狀映射.md](../ui/02-現狀映射.md) §1.2)
- **已有底座可升级**(Plan B 不是从零造):
  - `src/services/recipe-compiler.service.ts` 已是 LLM 驱动的 3-card 编译器(Character + Background + Style + freePrompt)
  - `src/types/index.ts` 的 `GenerationSnapshot` 已捕获 freePrompt / compiledPrompt / modelId / advancedParams / referenceImages / cardIds / seed
  - `prisma/schema.prisma` 的 `Generation` 已有 seed / snapshot / runGroupId/Type/Index
  - `src/constants/model-strengths.ts` 已有 10 个模型的 `bestFor[] + promptStyle + enhanceHint`
  - `src/services/video-script.service.ts` 已能生成场景化脚本

---

## 交接与协作契约

1. **新会话的职责**
   - 读完本文档 + 四份 `02-現狀映射.md` + 本文档末尾列出的关键文件
   - 为 Plan A 与 Plan B **各自**产出 TDD 级子计划,每 Task 明确 Files、Step 1-5(含测试代码块和 commit 指令)
   - 子计划落位:
     - Plan A(技术债) → `docs/plans/backend/` 或 `docs/plans/frontend/`(视任务域而定)
     - Plan B(创作控制) → `docs/plans/roadmap/能力扩展/创作控制/`(新建)
   - 子计划必须引用本文档作为来源,文件头 `> 来源规划: [tech-debt-and-creative-control-roadmap](../product/tech-debt-and-creative-control-roadmap.md)`
2. **codex 的职责**: 按子计划单 Task 执行,每条 PR 附 commit message + 测试运行结果
3. **主会话(Claude) review**
   - 检查是否符合 [CLAUDE.md](../../../CLAUDE.md) 硬规则(no magic、no any、service → hook → UI 顺序、常量集中、i18n 三语同步、变更前 grep 依赖)
   - 检查是否触碰**高风险模块**(`types/index.ts`、`user.service.ts`、`generate-image.service.ts`、`studio-context.tsx`、`constants/models.ts`、`storage/r2.ts`)并验证依赖面
4. **codex 二轮 review**: 由另一独立会话复核,重点看业务正确性、测试覆盖、既有回归风险

---

# Plan A — 既存代码技术债 + 稳定性 + UX 基础

> **边界**: 只修复「已做过但不到位」的部分。不引入新业务概念(Intent、Recipe、VoiceCard)。UI 修复只做「不改变用户心智模型」的瘦身/补全(减密度、补 loading/error、补默认 prompt)。

## A.1 运行时稳定性(P0)

### A.1.1 execution-callback finalize 原子化
- **证据**: [src/services/execution-callback.service.ts](../../../src/services/execution-callback.service.ts) L237-285 用 `Promise.all([completeGenerationJob(), createApiUsageEntry()])`,**未**包 `db.$transaction`。Audio finalize 已有 transaction,两者不一致。
- **目标**: 把 `streamUploadToR2 → createGeneration → completeGenerationJob → createApiUsageEntry` 组织成「R2 在事务外、后三步 DB 在 `db.$transaction` 内」;R2 失败直接 `failGenerationJob`。
- **测试扩展**: `execution-callback.service.test.ts` 增「R2 成功 + usage 写入失败 → 回滚无 generation record」case。
- **子计划要决策**: R2 已写 + DB 事务回滚 → orphan R2 object。方案 (a) 事务外补偿删除; (b) pending 表 + 定时回收; (c) 接受为可控泄漏(定期扫 R2 key 与 generation 差集)。

### A.1.2 Free-tier 并发原子性
- **证据**: [src/services/usage.service.ts](../../../src/services/usage.service.ts) L103-126 `createApiUsageEntry` 非原子;[src/services/free-tier-boundary.test.ts](../../../src/services/free-tier-boundary.test.ts) 目前是**记录** race window,不是断言修复。
- **目标**: 改「check-then-create」→「原子 slot reserve」。三方案新会话对比后选一:
  - (a) Prisma `updateMany` with conditional predicate
  - (b) Postgres advisory lock
  - (c) GenerationJob 新列 `freeTierSlotReserved` + 唯一约束
- **测试扩展**: 从「记录」改为「断言」: 20 并发请求结果精确 20 通过、0 漂移。

### A.1.3 签名验证抽取
- **证据**: [src/app/api/internal/execution/callback/route.ts](../../../src/app/api/internal/execution/callback/route.ts) L49-80 与 [src/app/api/internal/execution/resolve-key/route.ts](../../../src/app/api/internal/execution/resolve-key/route.ts) L45-76 HMAC 代码完全重复。
- **目标**: 新建 `src/lib/signature-verifiers/internal-execution.ts`(verify + sign + 单测);两路由改引用。Worker 侧 `workers/execution/src/index.ts` 因 runtime 不同可独立实现,但共享 spec。
- **测试扩展**: 新增 `.test.ts` 覆盖 valid / forged / timing-safe / missing-secret / expired-timestamp(若引入时间窗)≥ 5 case。

## A.2 测试覆盖缺口(P1)

> 硬目标: 未覆盖 service 每个至少 **1 正常 + 1 错误** 路径,不追求 100% 覆盖率。

### A.2.1 Card 体系补测
- **范围**: `character-card.service.ts`、`background-card.service.ts`、`style-card.service.ts`、`card-recipe.service.ts`、`character-refine.service.ts`、`character-scoring.service.ts`(`recipe-compiler` 已有 13 case)
- **注意**: refine / scoring 依赖 LLM,测试用 `vi.mock` mock provider

### A.2.2 社群 service 补测
- **范围**: `follow.service.ts`、`like.service.ts`、`collection.service.ts`(全部 0 测试)
- **关键 case**: 幂等性(重复 follow/like)、批量并发、计数一致

### A.2.3 叙事 service 补测
- **范围**: `story.service.ts`、`project.service.ts`(全部 0 测试)

### A.2.4 LLM / Prompt / Model 治理补测
- **范围**: `prompt-assistant.service.ts`、`prompt-feedback.service.ts`、`llm-text.service.ts`、`model-config.service.ts`、`model-health.service.ts`、`src/lib/llm-output-validator.ts`

### A.2.5 Provider adapter 补测
- **范围**: `src/services/providers/` 下 8 个 adapter(huggingface / openai / gemini / novelai / fal / volcengine / fish-audio / replicate)— **全部 0 测试**
- **策略**: 每个 adapter ≥ 1 请求构造 + 1 错误响应解析;不打真实 provider,`vi.mock` 或手写 fetch mock
- **风险**: 测试绿但未验真实 provider 是伪绿;子计划区分 smoke / contract

### A.2.6 Route 覆盖(43% → ≥ 70%)
- **现状**: 34/80 route 有 test
- **优先补**: `webhooks/clerk`、`admin/*`、`lora-training` 全套、`generate-long-video/{retry,cancel}`、`image/edit`、`image/decompose`、`voices/*`
- **契约**: 统一 `auth(401) → validate(400) → delegate(200 + 500)` 四挡,参考 [src/test/api-helpers.ts](../../../src/test/api-helpers.ts) 与 [src/app/api/CLAUDE.md](../../../src/app/api/CLAUDE.md)

## A.3 错误 / 载入 / 可观测性边界(P1)

### A.3.1 补齐 loading / error 文件
- **证据**(Explore 实测):
  - `(main)/studio/` 既无 `loading.tsx` 也无 `error.tsx`
  - `(main)/storyboard/` 同上
  - `(main)/u/[username]/` 同上
  - `(main)/arena/` 有 error 缺 loading
  - `(main)/profile/` 有 loading 缺 error
- **目标**: 每条路由补齐。`loading.tsx` 走 `src/components/ui/skeleton.tsx`(已标准化);`error.tsx` 参照 `(main)/error.tsx` 的 AlertTriangle + Retry + Home + Sentry report 结构。

### A.3.2 生成失败的用户级错误反馈(顾问第一轮点到)
- **现状**: 生成失败多为 500 或静默失败,用户不知「为什么失败、能重试吗、要不要换模型」
- **目标**: Studio 提交失败弹窗支持三个动作「重试 / 换模型 / 查看原因」,错误原因从 `GenerationJob.errorMessage` 读取并做用户级文案转换
- **新组件**: `src/components/business/studio/StudioGenerationErrorDialog.tsx`
- **不做**: 自动降级到备用 provider(属 Plan B 范畴,涉及 router)

### A.3.3 Clerk webhook 事件扩展
- **证据**: [src/app/api/webhooks/clerk/route.ts](../../../src/app/api/webhooks/clerk/route.ts) L61 仅处理 `user.created`
- **目标**: 加 `user.updated`(邮箱/用户名变更同步)、`user.deleted`(软删 + session 清理)。每事件 1 route test。

### A.3.4 credits / requestCount 术语统一
- **证据**: UI `tCommon('creditCount', ...)` 但数据是 `requestCount`(`ImageCard.tsx` L129 等多处)
- **方案 A**(推荐): UI 文案全改为「requests / 生成次数 / 請求數」三语同步,字段不变
- **方案 B**: 未来引入真正 credits 体系再动,当前加注释
- **决策方**: 新会话查 [docs/product/](../../product/) 是否有 credits 商业化规划决定

## A.4 UI 轻量瘦身(P2,不引入新概念)

> 限定: 只做「不改变用户心智模型」的信息密度 / 可达性优化。任何带新领域概念的 UI(Intent 表单 / Keep-Change / Recipe 按钮)**不** 入 A,归 B。

### A.4.1 首页 Hero 密度瘦身
- **证据**: [src/components/business/HomepageHero.tsx](../../../src/components/business/HomepageHero.tsx) + i18n hero 文案含 11+ 概念(多模型 / 视频 / Arena / ELO / Storyboard / img2img / prompt 增强 / 反推 / BYOK / 加密 / 归档);3 CTA 等权
- **目标**:
  - Hero 主文案砍到「一句话定位 + 一句副标」;其他概念下沉到 Features / Workflow section
  - 3 CTA → 主 CTA(开始创作)+ 次 CTA(浏览画廊)
  - 三语 JSON(`src/messages/{en,ja,zh}.json`)同步
- **不做**: 产品截图 / Demo 占位(待设计资源)

### A.4.2 Studio 默认样例 prompt
- **证据**: Studio 首次加载无 sample prompt;`OnboardingTooltip` 只指引不填内容
- **目标**: 首次访问(`localStorage` flag)预填一条适配默认模型的 sample prompt;用户改动后撤销 flag。文案入三语 JSON。
- **不做**: Intent 结构化表单 / 模型推荐 UI(属 B)

### A.4.3 OnboardingTooltip 节奏校准
- **证据**: [src/components/business/OnboardingTooltip.tsx](../../../src/components/business/OnboardingTooltip.tsx) 已 5 步,但未与默认 sample prompt 联动
- **目标**: welcome → **已帮你填好 sample prompt** → 模型说明 → apiKey → 生成,文案同步改

### A.4.4 导航命名复查(可选)
- **现状**: Navbar 已为 Gallery / Studio / Arena / Storyboard / Library,三语一致
- **决策**: 暂不改,等 Plan B 引入 Recipe Archive 时一起评估(避免改两次)

## A.5 部署 / 访问面(P1 ~ P2)

### A.5.1 Clerk handshake / 首屏可达性
- **证据冲突**: 顾问称线上中文首页被 Clerk handshake 阻断;Explore 实测 [src/app/[locale]/page.tsx](../../../src/app/[locale]/page.tsx) L44 支持未登录访问,且无 `src/middleware.ts`
- **结论**: 大概率 Clerk **生产实例配置问题**(allowed origins / redirect URL),不是代码问题
- **子计划任务**: 加一条「复现 handshake 情景 → 定位配置 or 代码」诊断 task,确认后再决定代码是否动
- **GitHub issue**: 新会话用 `gh issue view` 抓 2026-04-24 的 `deploy health check failed` 确认 root cause,写入子计划 Context

### A.5.2 部署后 smoke 自动化
- **目标**: 部署后自动拉 `/api/health`、`/api/health/providers`、首页、Gallery、Studio 入口(未登录可达的部分)
- **承载**: `.github/workflows/` 新增 post-deploy smoke;脚本住 `scripts/smoke.ts`

## Plan A 验证契约(新会话子计划须产出的验收点)

- [ ] `execution-callback.service.test.ts` 新增事务 case 通过
- [ ] `free-tier-boundary.test.ts` 并发用例从「记录」改「断言」通过
- [ ] `src/lib/signature-verifiers/` 覆盖 ≥ 5 case
- [ ] 未覆盖 service 全部 ≥ 2 case(≥ 15 个文件)
- [ ] Provider adapter 全部 ≥ 2 case(8 个文件)
- [ ] Route 测试 34 → ≥ 56(70% 阈值)
- [ ] 缺 loading/error 的 5 条路径全部补齐
- [ ] `StudioGenerationErrorDialog` 三个动作(重试/换模型/查看原因)有 component test
- [ ] Clerk webhook `user.updated / user.deleted` 2 个新 handler + 测试
- [ ] Homepage hero 三语新文案 + i18n completeness 测试通过
- [ ] 部署 smoke workflow 合入主分支
- [ ] Clerk handshake 场景复现且定位(配置 or 代码),形成 ops runbook 或代码修复

---

# Plan B — 创作控制能力(Intent → Plan → Sample → Lock → Refine)

> **产品北极星**: 用户平均需要几轮生成,才能拿到满意结果。越低越强。
>
> **用户确认顺序**: 图片 → 视频 → 音频;每一段做到可用再开下一段。
>
> **核心洞察**: 不是从零造,而是把「3-card + recipe-compiler + snapshot + character-scoring」升级成用户可感知的创作循环。

## B.1 图片稳定生成闭环(第一阶段,最重)

> **成功标准**: 用户输入目标 → 系统给生成计划 → 4 张小样 → 用户点「保留 X / 改变 Y」 → 自动 refine → 可另存 Recipe。First Accept Rate ≥ 40%、Iterations to Accept ≤ 3。

### B.1.1 Intent 层(数据层 + API 层)
- **新增 types**([src/types/index.ts](../../../src/types/index.ts)): `ImageIntent` Zod schema — subject / subjectDetails / actionOrPose / scene / composition / camera / lighting / colorPalette / style / mood / mustInclude / mustAvoid / referenceAssets
- **新增 types**: `ReferenceAsset` — `{ url, role: 'identity' | 'pose' | 'style' | 'composition' | 'background' | 'product' | 'first_frame' | 'last_frame', weight?, cropBox?, notes? }`
- **新增 API**: `POST /api/generation/plan` — 接自然语言 + 可选 refs,返回 `{ intent, recommendedModels[], promptDraft, negativePrompt, referenceRequirements, estimatedCost, variationCount }`
- **新增 service**: `src/services/intent-parser.service.ts` — LLM 驱动,走 `prompt-guard` + `llm-output-validator`
- **新增 service**: `src/services/model-router.service.ts` — 输入 `ImageIntent + user preferences + arena taskfit + provider health`,输出排序 `recommendedModels[]`。Round-1 只用 `model-strengths.ts` 静态权重,不接 Arena(留 B.1.7)

### B.1.2 Prompt 编译器(per-model)
- **新增 service**: `src/services/prompt-compiler.service.ts`(与 `prompt-enhance.service.ts` 区分 — enhance 留作「文本美化」,compiler 负责「从 Intent 组装」)
- **策略**: `compilePrompt(intent, model)` 按 `promptStyle === 'tag-based'` → tag 组合; `bestFor.includes('photorealistic')` → 摄影语言; `bestFor.includes('anime')` → 二次元标签。数据来自 `model-strengths.ts`
- **向后兼容**: 旧 `/api/generate` 仍接 prompt string;新路径 `/api/generation/compile` 接 Intent

### B.1.3 参考图角色化
- **DB 迁移**: `Generation.referenceImages` 已是 JSON,扩展为 `ReferenceAsset[]`;老数据 `string[]` 读时映射为 `role: 'identity'`
- **UI**(B.1.5 里一起做): 上传后强制选 role,选项 i18n 三语

### B.1.4 Auto Evaluator
- **新增 service**: `src/services/generation-evaluator.service.ts` — LLM vision 对比生成图 vs Intent,返 `GenerationEvaluation { subjectMatch, styleMatch, compositionMatch, referenceConsistency, artifactScore, promptAdherence, overall, detectedIssues[], suggestedFixes[] }`
- **触发**: 生成完成后异步(不阻塞看图);结果写入 `Generation.evaluation` JSON 新列(Prisma migration)
- **新增 API**: `POST /api/generation/evaluate` — 幂等
- **与 `character-scoring` 关系**: evaluator 通用;character-scoring 仍负责人物一致性专项(被 evaluator 调用)

### B.1.5 生成计划 UI + 小样 + Keep/Change
- **新组件**(都走 `src/components/business/studio/`):
  - `StudioGenerationPlan.tsx` — 点「生成」前弹出计划卡(model + reason + compiledPrompt 预览 + negativePrompt + cost + variationCount),用户可改再提交
  - `StudioResultFeedback.tsx` — 每张结果卡 5 反馈按钮(主体不对 / 风格不对 / 构图不对 / 光线不对 / 满意),映射为结构化 `feedbackTags[]`
  - `StudioKeepChangePanel.tsx` — 点「继续优化」弹保留/改变面板(多选 chips + 自由文字)
- **Studio Context**: `studio-context.tsx` 可能要加 `currentIntent / currentPlan / lastEvaluation` state(走 reducer pattern,与既有 `selectedWorkflowId` 一致)
- **不碰 Gallery**(用户边界)

### B.1.6 Recipe 持久化(用户 Archive 内,非 Gallery)
- **DB 迁移**: 新增 `Recipe` 表 — `{ id, userId, outputType, userIntent JSON, compiledPrompt, negativePrompt, modelId, provider, params JSON, referenceAssets JSON, seed?, parentGenerationId?, version, evaluationSummary? JSON, createdAt, updatedAt }`
- **新 API**: `/api/recipes` CRUD + `/api/recipes/:id/remix`(从 Recipe 创建 Generation)
- **UI**: Profile / Library 页新增「我的配方」tab
- **Gallery 不受影响**(用户边界)

### B.1.7 Arena 反哺(轻量)
- **DB 迁移**: `ArenaMatch / ArenaEntry` 新增 `taskType` 列(nullable,异步填回);初版用 `intent-parser.service.ts` 分类
- **新 API**: `GET /api/arena/model-winrate?taskType=portrait` — per-task ELO
- **接入**: `model-router.service.ts` Round-2 读此数据加权

### B.1.8 用户偏好学习(最小版)
- **DB 迁移**: `UserCreativePreference` 表 — `{ userId, favoriteStyles[], rejectedStyles[], preferredModelsByTask JSON, commonNegativeTags[], preferredAspectRatios[], updatedAt }`
- **写入触发**: 用户点「满意 / 删除 / 另存 Recipe」时 service 聚合更新
- **读取**: `model-router` + Studio 默认值预填

## B.2 视频稳定生成(第二阶段)

> **前置**: B.1 图片闭环跑通。用户确认「先图后视频」。
>
> **已有底座**: `src/services/video-script.service.ts`、`workers/execution/src/index.ts` 的 `CinematicShortVideoWorkflow`(FAL queue + callback)、`Generation.externalRequestId`

### B.2.1 分镜 → 关键帧 → I2V → 失败镜头重试
- **新 types**: `VideoScene` 扩展 — 加 `firstFrame?: ReferenceAsset`、`lastFrame?: ReferenceAsset`、`negativeMotion?: string[]`
- **新 service**: `src/services/video-scene-orchestrator.service.ts` — 对每 scene: (1) Intent + keyframe → I2V、(2) 评分、(3) 低阈值自动换 seed 重试(上限 2)
- **新 API**: `POST /api/video/scenes/:sceneIndex/retry` — 手动单镜头重试
- **成本保护**: 单次长视频 budget cap(读 `config.ts`),超限强停

### B.2.2 Continuity Checklist 注入
- **机制**: scene prompt 编译时自动 prepend 角色/风格/镜头连续性 checklist(从 CharacterCard + StyleCard + 前一 scene 推导)
- **实现**: `recipe-compiler.service.ts` 扩 `compileForScene(intent, scene, continuity)`

### B.2.3 Scene 级 Keep / Change
- **UI**: 视频结果页加「保持角色 / 保持风格 / 保持镜头连续 / 延长这一段 / 从最后一帧继续」5 动作按钮

## B.3 音频稳定生成(第三阶段)

> **前置**: B.1 + B.2 完成。用户确认「最后音频」。

### B.3.1 Voice Card 持久化
- **DB 迁移**: `VoiceCard` 表 — `{ id, userId, name, provider, modelId, voiceId?, referenceAudioUrl?, gender?, age?, tone[], pace, pitch?, pronunciationDictionary JSON, sampleText?, createdAt }`
- **新 API**: `/api/voice-cards` CRUD
- **合规**: 上传他人声音样本时 UI 明确授权提示

### B.3.2 字段化输入 + 反馈
- **UI**: 音频表单字段化(角色 / 情绪 / 语速 / 停顿 / 发音词典),不暴露裸 SSML
- **反馈按钮**: 声音不像 / 情绪不对 / 语速 / 发音错误 / 停顿不自然 / 音质

### B.3.3 Recipe 统一抽象收口
- **时机**: B.3 后做。把图/视频/音频 Recipe 统一到 `CreativeRecipe`(`outputType` discriminated union)
- **风险**: 过早抽象伤可读性;严格遵守「先跑通再抽象」

## Plan B 验证契约

### B.1 图片阶段
- [ ] `ImageIntent` + `ReferenceAsset` 两 Zod schema 有单测
- [ ] `intent-parser.service.test.ts` ≥ 5 case(含 LLM 失败回退)
- [ ] `model-router.service.test.ts` ≥ 6 case(taskFit / styleFit / reference / cost / latency / health penalty)
- [ ] `prompt-compiler.service.test.ts` 按模型类型分组 ≥ 10 case(tag-based / photo / anime / natural)
- [ ] `generation-evaluator.service.test.ts` ≥ 4 case
- [ ] Recipe CRUD route ≥ 8 case
- [ ] 新 UI 组件(Plan / ResultFeedback / KeepChange)各 ≥ 3 component test
- [ ] Prisma migration 附回滚脚本
- [ ] E2E: 新用户走完「Intent → 计划 → 4 小样 → Keep/Change → Recipe 保存」
- [ ] First Accept Rate / Iterations 指标埋点落地(写 `ApiUsageLedger` 或新事件表)

### B.2 视频阶段
- [ ] `video-scene-orchestrator.service.test.ts` 覆盖「评分 → 重试 → 阈值达成」
- [ ] Scene-level Keep/Change UI ≥ 3 test
- [ ] 长片成本 cap 触发 E2E

### B.3 音频阶段
- [ ] `VoiceCard` CRUD route ≥ 6 case
- [ ] 音频反馈 tag → 下一轮 prompt 修改 E2E

---

## 关键文件速查

### Plan A 修复点
- [src/services/execution-callback.service.ts](../../../src/services/execution-callback.service.ts) — transaction 包裹
- [src/services/usage.service.ts](../../../src/services/usage.service.ts) — 原子 free-tier
- [src/app/api/internal/execution/callback/route.ts](../../../src/app/api/internal/execution/callback/route.ts)
- [src/app/api/internal/execution/resolve-key/route.ts](../../../src/app/api/internal/execution/resolve-key/route.ts) — 签名抽取
- [src/lib/llm-output-validator.ts](../../../src/lib/llm-output-validator.ts) — 补测
- `src/services/{character-card,background-card,style-card,card-recipe,follow,like,collection,story,project,lora-training,prompt-assistant,prompt-feedback,llm-text,model-config,model-health}.service.ts` — 测试补齐
- `src/services/providers/*.ts` — 8 adapter 测试
- `src/app/[locale]/(main)/{studio,storyboard,arena,u/[username],profile}/` — loading/error 补齐
- [src/app/api/webhooks/clerk/route.ts](../../../src/app/api/webhooks/clerk/route.ts) — 事件扩展
- [src/components/business/HomepageHero.tsx](../../../src/components/business/HomepageHero.tsx) + `src/messages/{en,ja,zh}.json` — 密度瘦身
- [src/components/business/OnboardingTooltip.tsx](../../../src/components/business/OnboardingTooltip.tsx) + Studio 默认 prompt 注入点

### Plan B 新增 / 改动
- [src/types/index.ts](../../../src/types/index.ts) — `ImageIntent`、`ReferenceAsset`、`CreativeRecipe` 新 schema
- `src/services/intent-parser.service.ts` — 新建
- `src/services/model-router.service.ts` — 新建
- `src/services/prompt-compiler.service.ts` — 新建
- `src/services/generation-evaluator.service.ts` — 新建
- `src/services/recipe.service.ts` + `src/app/api/recipes/` — 新建
- `src/services/video-scene-orchestrator.service.ts` — B.2
- `src/services/voice-card.service.ts` + `src/app/api/voice-cards/` — B.3
- `prisma/schema.prisma` — `Recipe`、`VoiceCard`、`UserCreativePreference` 三张新表 + `Generation.evaluation` + `ArenaMatch.taskType`
- `src/components/business/studio/Studio{GenerationPlan,ResultFeedback,KeepChangePanel,GenerationErrorDialog}.tsx` — 新组件
- `src/app/api/generation/{plan,compile,evaluate,refine}/route.ts` — 新路由
- `src/app/[locale]/(main)/profile/recipes/` — Recipe Archive 页(非 Gallery)
- `src/messages/{en,ja,zh}.json` — 所有新 UI 文案三语同步

## 高风险模块提醒(来源 [CLAUDE.md](../../../CLAUDE.md),新会话必须确认)

触及以下模块前必须 `grep -r "from.*<模块>" src/` 并在子计划 Context 列影响面:

- `src/types/index.ts`(189 files 依赖) — B.1.1/B.1.3 必触
- `src/services/generate-image.service.ts`(orchestrator,8+ service 依赖) — B.1 多处触
- `src/constants/models.ts`(178 files 依赖) — 若扩 model-strengths
- `src/contexts/studio-context.tsx`(23+ 组件) — B.1.5 UI 必触
- `src/services/user.service.ts`(22 files 依赖) — B.1.8 UserPreference 必触
- `src/services/storage/r2.ts`(15 services 依赖) — A.1.1 事务相关需确认

## 验证方式(plan 级,不是 task 级)

```bash
# 测试总入口
npx vitest run --reporter=verbose

# Route 覆盖率
npx vitest run --coverage --reporter=verbose

# E2E
npx playwright test

# Lint / typecheck
npx next lint
npx tsc --noEmit

# i18n 完整性
npx vitest run src/test/i18n

# 本地 smoke
curl -f http://localhost:3000/api/health
curl -f http://localhost:3000/api/health/providers -H "Authorization: Bearer $HEALTH_TOKEN"
```

---

## 下一步

1. 用户 approve 本文档后,主会话退出 plan mode
2. 开**新会话**按 A / B 双线**并行**产出子计划:
   - Plan A 子计划 → `docs/plans/backend/*.md` 或 `docs/plans/frontend/*.md`
   - Plan B 子计划 → `docs/plans/roadmap/能力扩展/创作控制/*.md`
3. 每份子计划用 `superpowers:writing-plans` skill,TDD 粒度 2-5 分钟/step
4. 主会话 review 子计划 → 交 codex 按 task 粒度实施
5. codex 每条 task commit 后 → 主会话 review → 另一独立 codex 二轮 review → 合入

## 边界再强调

- Plan A 不引入新概念
- Plan B 严格图 → 视频 → 音频顺序
- Gallery **不**做 remix / extract 入口
- 所有改动遵循 [CLAUDE.md](../../../CLAUDE.md) 硬规则: no magic、no `any`、no fetch in components、Zod `safeParse`、常量集中、i18n 三语同步、变更前 grep 依赖
