# Plans

`docs/plans/` 存放**活跃的**规划与工作包。已实现或已被新规划覆盖的文档会直接删除,不保留在此处。

## 活跃规划(根级)

- [unified-development-plan.md](product/unified-development-plan.md) — 3-track 合并计划(A 修复 / B Studio 重设计 / C 功能)**参考档案,非真相源**
- [server-expansion-analysis.md](server-expansion-analysis.md) — 服务器扩展分析(重型长文)
- [studio-optimization-progress.md](studio-optimization-progress.md) — Studio 7 周优化进度(W1-W7)

## 按模块

### Frontend

- [frontend/studio-feature-map.md](frontend/studio-feature-map.md) ⭐ — **当前 Studio 真相源**,所有 Studio 改动前必读
- [frontend/studio-workflow-shell.md](frontend/studio-workflow-shell.md) — 工作流优先入口壳(最新)

### Backend

- [backend/server-owned-run-foundation.md](backend/server-owned-run-foundation.md) — 服务器托管运行基础
- [backend/jimeng-google-video-integration.md](backend/jimeng-google-video-integration.md) — Google 视频集成
- [backend/2026-04-25-plan-a-a1-runtime-stability.md](backend/2026-04-25-plan-a-a1-runtime-stability.md) ⭐ — **Plan A A.1 运行时稳定性 TDD 子计划**(签名抽取 + callback 事务 + free-tier 原子槽位)
- [backend/2026-04-25-plan-a-a2-test-coverage.md](backend/2026-04-25-plan-a-a2-test-coverage.md) ⭐ — **Plan A A.2 测试覆盖扫描 TDD 子计划**(social/narrative/card-CRUD/LLM services/provider adapters 共 20 个测试文件，5 个 commit)
- [backend/2026-04-26-plan-a-a3-error-loading-webhook.md](backend/2026-04-26-plan-a-a3-error-loading-webhook.md) ⭐ — **Plan A A.3 Error/Loading 边界 + Clerk Webhook 扩展 TDD 子计划**(8 个 loading/error 文件 + user.updated/deleted webhook handler)

### Creative Control (Plan B — 能力扩展 B 线)

- [roadmap/能力扩展/创作控制/2026-04-25-plan-b-b11-intent-layer.md](roadmap/能力扩展/创作控制/2026-04-25-plan-b-b11-intent-layer.md) ⭐ — **Plan B B.1.1 Intent 层 TDD 子计划**(ImageIntent schema + intent-parser + model-router + /api/generation/plan)
- [roadmap/能力扩展/创作控制/2026-04-25-plan-b-b12-prompt-compiler.md](roadmap/能力扩展/创作控制/2026-04-25-plan-b-b12-prompt-compiler.md) ⭐ — **Plan B B.1.2 Prompt Compiler TDD 子计划**(per-model 编译器：tag-based / photorealistic / natural-language 三分路)
- [roadmap/能力扩展/创作控制/2026-04-25-plan-b-b14-generation-evaluator.md](roadmap/能力扩展/创作控制/2026-04-25-plan-b-b14-generation-evaluator.md) ⭐ — **Plan B B.1.4 Generation Evaluator TDD 子计划**(LLM vision 自动评分 + Generation.evaluation 列 + /api/generation/evaluate)
- [roadmap/能力扩展/创作控制/2026-04-25-plan-b-b16-recipe-persistence.md](roadmap/能力扩展/创作控制/2026-04-25-plan-b-b16-recipe-persistence.md) ⭐ — **Plan B B.1.6 Recipe Persistence TDD 子计划**(Recipe 表 + CRUD service + /api/recipes 全套路由 + api-client)
- [roadmap/能力扩展/创作控制/2026-04-25-plan-b-b15-studio-ui.md](roadmap/能力扩展/创作控制/2026-04-25-plan-b-b15-studio-ui.md) ⭐ — **Plan B B.1.5 Studio UI TDD 子计划**(StudioGenerationPlan + StudioResultFeedback + StudioKeepChangePanel 三件套,含 api-client + i18n + panel 接线)

### Product

- [product/tech-debt-and-creative-control-roadmap.md](product/tech-debt-and-creative-control-roadmap.md) ⭐ — **两主线战略规划**(Plan A 技术债 + Plan B 创作控制),TDD 子计划的来源文档
- [product/unified-development-plan.md](product/unified-development-plan.md)
- [product/model-catalog-next-steps.md](product/model-catalog-next-steps.md) — 模型清單 Step 3-6 後續整改工作包
- [product/video-module-roadmap.md](product/video-module-roadmap.md) — 视频模块四阶段路线
- [product/video-phase2-storyboard.md](product/video-phase2-storyboard.md) — Phase 2 故事板规格
- [product/video-phase4-assembly.md](product/video-phase4-assembly.md) — Phase 4 视频组装规格(**未实现**)
- [product/prompt-data-and-recommendation.md](product/prompt-data-and-recommendation.md) — Prompt 数据与推荐系统设计

## 工作包(从根目录 01-05 迁入的繁体文档)

- [ui/](ui/) — UI 工作包(原 `01-UI/`):现状映射、工作包细分、优化方案、实作清单、路线决策
- [feature/](feature/) — 功能工作包(原 `02-功能/`):同套结构
- [qa/](qa/) — 测试工作包:`qa/functional/`(原 `03-功能測試/`)+ `qa/ui/`(原 `04-UI測試/`)
- [roadmap/](roadmap/) — 后续计划(原 `05-后续计划/`):体验优化、基础设施与治理、能力扩展(含视频剧本 Phase 0-1)

## 视觉原型(HTML)

- `b5-variant-ui-mockup.html` — B5 变体 UI 原型
- `studio-layout-mockup.html` — Studio 布局原型

## 规范

- 一条规划只要对应代码已经落地,**立即删除此处的规划文档**,不做"历史归档"
- 新规划直接加到对应模块子目录;重大跨模块的合并计划放根级
- 文档命名用 kebab-case;工作包目录用原语言名(繁体/中文保持原状)
