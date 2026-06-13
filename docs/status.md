# 项目状态

最后更新：2026-06-13

这是唯一的活跃进度文档。它应该保持短，并随着项目变化覆盖更新。

## Current Focus

- 第一轮文档重构已完成，`docs/design/` 已调整为结构入口；详细 UI 设计文档先不写，后续一页一页确认。
- `docs/product/mainline.md` 已成为产品方向主线文档；后续功能、媒体、资源管理和 Studio 相关任务应在 `docs/status.md` 后读取它。
- 视频方向已确认：`Studio Video` 保持轻量短片入口，`Node workflow` 承担长视频、系列镜头、角色/声音绑定、分镜、参考视频和片段合并等导演式生产能力。
- 固定后续开发流程：读文档、查代码事实源、必要时核验官方资料、暴露不确定点、确认方向、写 task packet、实现小切片、跑验证、更新必要文档。
- 当前文档整理阶段不改变产品方向、provider 契约、模型目录、API schema、数据库、认证、积分或存储行为。

## Current Code Facts

- `package.json` 显示当前栈：Next.js 16.2.6、React 19.2.3、TypeScript 5、Prisma 7.7.0、Clerk、Tailwind CSS 4、next-intl、Vitest、Playwright。
- Locale 路由位于 `src/app/[locale]`；`src/messages/` 下存在 `en`、`ja`、`zh` 三份消息文件。
- 当前路由面包含 35 个 `page.tsx` 和 137 个 API `route.ts`。
- `src/services/` 当前包含 94 个非测试 TypeScript service 文件和 73 个 service 测试文件。
- 模型目录拆分在 `src/constants/models/`：本地常量里共有 57 个 model option，其中 32 个标记为 available，25 个标记为 unavailable/retired。
- model option 分布：28 image、21 video、2 audio、6 3D。
- Provider adapter type 集中在 `src/constants/providers.ts`。
- Prisma schema 当前覆盖 users、generations、API keys、projects、node workflow projects、cards、collections、arena、video pipeline、video scripts、LoRA assets 等核心域模型。

## Next

- `docs/engineering/validation.md` 先跳过；等验证流程、CI、测试策略或浏览器 QA 工作开始时再按实际命令补。
- 后续 UI 优化任务先从 `docs/design/README.md` 进入，再按页面或系统主题逐个确认详细设计文档。
- Provider/model/API 的具体实现前，仍必须按 `docs/integrations/providers.md` 做逐 provider / 逐模型官方文档核验。

## Blocked

- 文档重构当前没有阻塞。
- 本轮 Worker 迁移已跑 typecheck 和相关单元测试；仍未跑 full build 或浏览器主路径。
- Provider 官方资料已为 `docs/integrations/providers.md` 做过 provider-level 核验，但尚未完成逐模型 payload 审计。任何 provider/model/API 规划或代码修改都必须重新查对应官方资料。

## Recently Changed

- 旧的活跃 `docs/` 文档材料已移除。
- `docs/README.md` 已定义新的文档分类、默认阅读路径、不确定即停止规则和官方文档核验规则。
- `AGENTS.md` 已补充新的文档上下文规则，以及 provider/model/API 相关修改前必须查官方资料的要求。
- `docs/status.md` 已创建为唯一活跃进度文档。
- `docs/product/mainline.md` 已新增为长期产品主线，记录图片方向、StyleCard 资产化、声音方向、VoiceCard 边界、视频/画布分工、3D 待确认项，以及 Assets / Gallery / Prompts 资源管理边界。
- （2026-06-13）视频主线已按 owner 确认更新：`Studio Video` 做温和直接的短片生成入口，`Node workflow` 做真正的视频导演台；视频中间 clip 生命周期、服务端 graph execution planner、边语义仍待后续确认。
- `docs/product/scope.md` 已记录 owner 确认的产品定位、核心用户、第一主路径、功能优先级和短期非目标。
- `docs/architecture/overview.md` 已记录当前系统分层、架构事实源、边界地图和未决项。
- `docs/architecture/generation.md` 已记录生成链路的 Current、Target、Unresolved，包括 Studio 主入口、Node workflow 长视频定位、Generation 统一数据层、媒体执行层拆分和 BYOK/platform key 优先级。
- `docs/architecture/credits.md` 已记录用量、免费额度、平台额度、BYOK 不消耗平台额度、提交预留/成功确认/失败释放的目标规则，以及未来 admin adjustment ledger 的架构要求。
- `docs/architecture/storage.md` 已记录成功作品永久保存、参考图生命周期、thumbnail/preview 可再生缓存、视频 clip 持久化边界、3D GLB/poster 生命周期、provider URL 只能作为 ingestion source，以及私有作品不能依赖 public R2 URL 的目标规则。
- `docs/architecture/auth.md` 已记录 Clerk provider、middleware、API route factories、直接 `auth()` routes、Clerk webhook、internal signatures、admin boundary、DB user mapping 和权限策略变更必须先确认的规则。
- `docs/domains/studio.md` 已按 owner 二次确认收紧边界：Studio 是创作/生成工作台，不是完整资产管理系统；image/video/audio 是主 workspace；Node workflow 和 LoRA 是核心高级能力；3D 是 Studio 下的支线入口；保存后的批量管理、文件夹、资产库、筛选、删除和发布管理主要归 Assets / Project / Gallery。
- `docs/domains/gallery.md` 已记录 Gallery 当前公开 feed、详情页、筛选、可见性、prompt redaction、API/service 边界、Assets 关系、目标职责和未决边界。
- `docs/domains/profile.md` 已记录 Profile 当前 `/u/[username]` 主页、资料编辑、公开/私有 profile、公开作品流、follow/like 现状，以及目标规则：Profile 公开和作品公开分离，公开主页只展示公开作品，prompt 继续遵守 `isPromptPublic`。
- `docs/domains/api-keys.md` 已记录 API Keys / BYOK 当前管理面、加密和 masking、验证现状、server-side key resolution、显式 `apiKeyId` 不可 fallback 到平台 key、验证状态目标、soft revoke 目标和安全硬规则。
- `docs/domains/projects.md` 已记录普通 Project 是私有文件管理/归类域，不会有公开项目页；记录了项目层级、Assets 文件夹 UI、Generation/Card projectId 关系、删除不删作品、Project 与 NodeWorkflowProject 分离，以及当前 projectId 写入路径需要统一 ownership 校验的未决项。
- `docs/domains/cards.md` 已记录 Cards 是可复用创作上下文层：CharacterCard 负责角色一致性和 workflow 角色卡复用，Background/Style/CardRecipe 负责背景、风格、组合配方，记录了 Studio quick/card mode、Generation lineage、Node workflow card hydration、VoiceCard 相关当前面，以及 card/project/reference ownership 校验未决项。
- `docs/domains/node-workflow.md` 已记录 Node workflow 是 Studio advanced workspace / sub-workspace：负责画布工作流、节点/边语义、角色/声音/剧本连接、planner、Seedance 视频节点、reference video、video merge 和 Generation 回写；同时记录了服务端 graph execution、clip 生命周期、BYOK 对齐、card/voice binding schema 和 provider 官方文档核验的未决项。
- `docs/domains/credits.md` 已记录 Credits 域当前不是付费钱包，而是 usage、free allowance、platform allowance 域；记录了 BYOK 不消耗平台额度、平台 key 额度目标生命周期、未来 allowance ledger 要求，以及当前 `FreeTierSlot` 限制和 display counter 的边界。
- `docs/integrations/providers.md` 已记录 provider registry、model catalog、execution routing、BYOK/platform key 边界、server-side key verification 现状、官方文档核验入口、逐模型核验流程和未决风险。
- `GET /api/usage-summary` 已改为使用 `FreeTierSlot` 今日预留数作为 `freeGenerationsToday`，让用户可见免费额度显示与当前限制源一致。
- `docs/design/` 已建立结构：`system/` 放全局 UI/CSS/组件/响应式/i18n 规则，`pages/` 放逐页设计，`reviews/` 放可复用 UI 审查；详细内容先不定稿。
- （2026-06-03）`docs/domains/arena.md` 已补：记录 Arena 模型对战域（match 创建、并行多模型 entry、投票、ELO 排名、按 taskType 胜率、个人统计），并标注 entry 复用标准生成链路。
- （2026-06-03）`docs/domains/storyboard.md` 已补：记录 Storyboard 叙事编排域（从已有作品挑图成 Story、LLM 叙事、scroll/comic 呈现、导出、公开切换），并标注它只消费 Generation、不生成图像。
- （2026-06-03）`docs/domains/prompts.md` 已补：记录 Prompts 提示词库域（`Recipe` 模板 + `InspirationPrompt` 灵感库、从作品存模板、模板到作品血缘），并把 prompt 增强/助手/守卫等创作辅助划归 Studio 链路（`services/kernel/`）。
- （2026-06-03）`docs/domains/credits.md` 补齐 `Last Verified` 区块，使 domains 层验证区块一致。
- （2026-06-03）Worker-only 生成迁移继续推进：Fish Audio TTS 改为 Cloudflare Worker 执行；FAL/Fish audio、普通 FAL video、FAL 长视频 pipeline、独立 multi-view image fan-out、OpenAI/FAL/Gemini/Replicate/NovelAI/VolcEngine/Hugging Face text-to-image、provider 已支持的普通图片 reference-image / image-to-image、Replicate LoRA image 的 provider submit/poll/artifact download/R2 upload 已由 Worker 负责，Next 只做 auth/validation/reference R2 标准化/dispatch/status aggregation/DB finalization、Civitai token signed resolve 或长视频 clip 状态落库。当前可用视频模型均为 FAL-backed 且已走 Worker；未迁移视频仅剩 disabled 的 `seedance-2.0-volc`、`seedance-2.0-fast-volc`、`seedance-1.5-pro`、`seedance-1.0-pro`、`runway-gen4.5`、`runway-gen4-turbo`。图片剩余未迁移集中在 NovelAI multi-reference Director padding/normalization 这一类 provider 特殊路径。

## Deferred Doc Sync

- `docs/engineering/validation.md`：先跳过；等验证流程、CI、测试策略或浏览器 QA 工作开始时再按实际命令补。

## Known Unverified Areas

- 浏览器主路径和移动端 QA。
- 生产部署和 Vercel 行为。
- Provider API 的基础文档入口已核验；逐模型可用性、价格、限制、payload 字段和返回结构仍未逐项核验。
- 私有媒体访问、R2 signed URL / auth proxy 方案和现有 public R2 URL 迁移。
- 完整 route-by-route 权限审计，以及 API route factory 覆盖是否需要统一。
- image、video、audio、3D 的端到端生成成功率。
- `prisma/schema.prisma` 之外的当前数据库 migration/runtime 状态。

## Source of Truth Checked

- `package.json`
- `src/app`
- `src/services`
- `src/constants/models.ts`
- `src/constants/models/`
- `src/constants/providers.ts`
- `src/messages/`
- `src/i18n/`
- `prisma/schema.prisma`
- `docs/product/scope.md`
- `docs/product/mainline.md`
- `docs/architecture/overview.md`
- `docs/architecture/generation.md`
- `docs/architecture/credits.md`
- `docs/architecture/storage.md`
- `docs/architecture/auth.md`
- `docs/domains/studio.md`
- `docs/domains/gallery.md`
- `docs/domains/profile.md`
- `docs/domains/api-keys.md`
- `docs/domains/projects.md`
- `docs/domains/cards.md`
- `docs/domains/node-workflow.md`
- `docs/domains/credits.md`
- `docs/integrations/providers.md`
- `docs/design/README.md`
- `docs/design/system/README.md`
- `docs/design/pages/README.md`
- `docs/design/reviews/README.md`

## Last Verified

- Date: 2026-06-13
- Method: focused documentation/code inspection and owner direction confirmation for product mainline; earlier Worker-only generation migration validation remains recorded in history
- External docs: checked provider-level official documentation for OpenAI, Google Gemini, Hugging Face, FAL, Replicate, Runway, NovelAI, VolcEngine Ark, Fish Audio, Hyper3D Rodin, and DeepSeek for `docs/integrations/providers.md`; rechecked FAL queue/Veo extend, Gemini image generation, Replicate predictions, NovelAI image Swagger entry, VolcEngine Seedream, Hugging Face HF Inference, Fish Audio TTS, and Cloudflare Workers best practices for 2026-06-03 Worker migrations
