# 项目状态

最后更新：2026-06-02

这是唯一的活跃进度文档。它应该保持短，并随着项目变化覆盖更新。

## Current Focus

- 围绕代码事实源重建文档系统。
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

- 接下来可进入 `docs/design/ui-system.md` 或 `docs/engineering/validation.md`，用于固定 UI 和验证流程。
- Provider/model/API 的具体实现前，仍必须按 `docs/integrations/providers.md` 做逐 provider / 逐模型官方文档核验。

## Blocked

- 文档重构当前没有阻塞。
- 本轮状态快照尚未验证运行时健康：没有跑 typecheck、tests、build 或浏览器主路径。
- Provider 官方资料已为 `docs/integrations/providers.md` 做过 provider-level 核验，但尚未完成逐模型 payload 审计。任何 provider/model/API 规划或代码修改都必须重新查对应官方资料。

## Recently Changed

- 旧的活跃 `docs/` 文档材料已移除。
- `docs/README.md` 已定义新的文档分类、默认阅读路径、不确定即停止规则和官方文档核验规则。
- `AGENTS.md` 已补充新的文档上下文规则，以及 provider/model/API 相关修改前必须查官方资料的要求。
- `docs/status.md` 已创建为唯一活跃进度文档。
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
- `docs/domains/credits.md` 已记录 Credits 域当前不是付费钱包，而是 usage、free allowance、platform allowance 域；记录了 BYOK 不消耗平台额度、平台 key 额度目标生命周期、未来 allowance ledger 要求，以及当前 FreeTierSlot 限制和 Generation 成功计数显示之间的不一致。
- `docs/integrations/providers.md` 已记录 provider registry、model catalog、execution routing、BYOK/platform key 边界、server-side key verification 现状、官方文档核验入口、逐模型核验流程和未决风险。

## Needs Doc Sync

- `docs/design/ui-system.md`：响应式、i18n、可访问性和视觉系统规则。
- `docs/engineering/validation.md`：typecheck、lint、tests、build 和浏览器 QA 的验证命令与流程。

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

## Last Verified

- Date: 2026-06-02
- Method: code inspection, file counts, generation chain inspection, usage/allowance inspection, storage lifecycle inspection, auth boundary inspection, Studio domain inspection, Gallery domain inspection, Profile domain inspection, API Keys domain inspection, Projects domain inspection, Cards domain inspection, Node workflow domain inspection, Credits domain inspection, and provider integration inspection
- External docs: checked provider-level official documentation for OpenAI, Google Gemini, Hugging Face, FAL, Replicate, Runway, NovelAI, VolcEngine Ark, Fish Audio, Hyper3D Rodin, and DeepSeek for `docs/integrations/providers.md`
