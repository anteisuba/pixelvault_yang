# Plans

`docs/plans/` 存放**活跃的**规划与工作包。已实现或已被新规划覆盖的文档会直接删除,不保留在此处。

## 活跃规划(根级)

- [server-expansion-analysis.md](server-expansion-analysis.md) — 服务器扩展分析(重型长文)
- [studio-optimization-progress.md](studio-optimization-progress.md) — Studio 7 周优化进度(W1-W7,已完成)
- [optimized-execution-plan.md](optimized-execution-plan.md) ⭐ — **优化后执行计划**(2026-05-03),Plan A/B 重新排序 + 已知问题验证结果

## 按模块

### Frontend

- [frontend/studio-feature-map.md](frontend/studio-feature-map.md) ⭐ — **当前 Studio 真相源**,所有 Studio 改动前必读
- [frontend/studio-workflow-shell.md](frontend/studio-workflow-shell.md) — 工作流优先入口壳(Phase 1-5 完成,Phase 6 待做)

### Backend

- [backend/server-owned-run-foundation.md](backend/server-owned-run-foundation.md) — 服务器托管运行基础
- [backend/jimeng-google-video-integration.md](backend/jimeng-google-video-integration.md) — Google 视频集成预研
- [backend/video-payload-audit.md](backend/video-payload-audit.md) — 视频模型 Payload 审计
- [backend/2026-04-25-plan-a-a1-runtime-stability.md](backend/2026-04-25-plan-a-a1-runtime-stability.md) ⭐ — Plan A A.1 运行时稳定性 TDD 子计划
- [backend/2026-04-25-plan-a-a2-test-coverage.md](backend/2026-04-25-plan-a-a2-test-coverage.md) ⭐ — Plan A A.2 测试覆盖 TDD 子计划
- [backend/2026-04-26-plan-a-a3-error-loading-webhook.md](backend/2026-04-26-plan-a-a3-error-loading-webhook.md) ⭐ — Plan A A.3 Error/Loading + Webhook TDD 子计划

### Creative Control (Plan B — 能力扩展 B 线)

- [roadmap/能力扩展/创作控制/2026-04-25-plan-b-b11-intent-layer.md](roadmap/能力扩展/创作控制/2026-04-25-plan-b-b11-intent-layer.md) ⭐ — Plan B B.1.1 Intent 层
- [roadmap/能力扩展/创作控制/2026-04-25-plan-b-b12-prompt-compiler.md](roadmap/能力扩展/创作控制/2026-04-25-plan-b-b12-prompt-compiler.md) ⭐ — Plan B B.1.2 Prompt Compiler
- [roadmap/能力扩展/创作控制/2026-04-25-plan-b-b14-generation-evaluator.md](roadmap/能力扩展/创作控制/2026-04-25-plan-b-b14-generation-evaluator.md) ⭐ — Plan B B.1.4 Generation Evaluator
- [roadmap/能力扩展/创作控制/2026-04-25-plan-b-b15-studio-ui.md](roadmap/能力扩展/创作控制/2026-04-25-plan-b-b15-studio-ui.md) ⭐ — Plan B B.1.5 Studio UI 三件套
- [roadmap/能力扩展/创作控制/2026-04-25-plan-b-b16-recipe-persistence.md](roadmap/能力扩展/创作控制/2026-04-25-plan-b-b16-recipe-persistence.md) ⭐ — Plan B B.1.6 Recipe Persistence

### Product

- [product/tech-debt-and-creative-control-roadmap.md](product/tech-debt-and-creative-control-roadmap.md) ⭐ — 两主线战略规划(Plan A + Plan B)
- [product/model-catalog-next-steps.md](product/model-catalog-next-steps.md) — 模型清单后续
- [product/video-module-roadmap.md](product/video-module-roadmap.md) — 视频模块四阶段路线
- [product/video-phase2-storyboard.md](product/video-phase2-storyboard.md) — Phase 2 故事板规格
- [product/video-phase4-assembly.md](product/video-phase4-assembly.md) — Phase 4 视频组装规格(未实现)
- [product/prompt-data-and-recommendation.md](product/prompt-data-and-recommendation.md) — Prompt 数据与推荐系统
- [product/consistency-strategy-discussion.md](product/consistency-strategy-discussion.md) — 图片一致性策略讨论

## 工作包

- [qa/](qa/) — 测试工作包:`qa/functional/` + `qa/ui/`
- [roadmap/](roadmap/) — 后续计划:能力扩展(含视频剧本 Phase 0-1)

## 规范

- 一条规划只要对应代码已经落地,**立即删除此处的规划文档**,不做"历史归档"
- 新规划直接加到对应模块子目录;重大跨模块的合并计划放根级
- 文档命名用 kebab-case;工作包目录用原语言名保持原状
