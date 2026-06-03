# Arena Domain

最后更新：2026-06-03

本文档记录 Arena 业务域的当前事实、已确认目标和未决边界。它不替代生成、存储、认证、积分、模型目录或 Gallery 文档。

## Current

### Route Surface

Current Arena route surface（locale 前缀，位于 `(main)` shell 内）：

- `/arena` renders the match creation + voting client.
- `/arena/leaderboard` renders the global model ELO leaderboard.
- `/arena/history` renders the signed-in user's past matches.
- `/arena/loading` and `/arena/error` provide route-level fallbacks.
- `/arena/layout` and `/arena/leaderboard/layout` are domain-local layouts.

### Match Lifecycle

Arena 是一个"同 prompt、多模型、盲投选优"的模型评测域。核心流程：

- `createArenaMatch` 只创建一条 `ArenaMatch` 记录，不生成图像。base64 参考图会先上传 R2，DB 只存 URL。
- `classifyPromptTaskType` 给 match 异步打 `taskType` 标签（portrait / landscape / anime / artistic / product / architecture / general），用于按任务的胜率统计。
- 前端对每个参选模型并行调用 entries 接口；`generateArenaEntry` 通过 `generateImageForUser` 真实生成一张图，并写入一条 `ArenaEntry`。每个 entry 调用有独立的 serverless 超时，避免累积超时。
- `submitArenaVote` 记录 winner：更新 `ArenaMatch.winnerId` / `votedAt`、对应 `ArenaEntry.wasVoted`，并更新模型 ELO。
- 已投票的 match 不能再生成 entry，也不能重复投票。

### Data Model

- `ArenaMatch` — userId、prompt、taskType、aspectRatio、referenceImage、winnerId、votedAt；owner-scoped。
- `ArenaEntry` — matchId、generationId、modelId、slotIndex、wasVoted；`@@unique([matchId, generationId])`。
- `ModelEloRating` — 全局每模型评分：modelId、modelFamily、rating（默认 1500）、matchCount、winCount。

每个 entry 关联一条共享的 `Generation`（`onDelete: Cascade`）。Arena 不维护独立的图像表。

### API Surface

- `POST /api/arena/matches` — 创建 match（不生成）。
- `GET /api/arena/matches/[id]` — 取 match + entries。
- `POST /api/arena/matches/[id]/entries` — 为单个模型生成一个 entry。
- `POST /api/arena/matches/[id]/vote` — 提交投票并更新 ELO。
- `GET /api/arena/leaderboard` — 全局 ELO 排行。
- `GET /api/arena/history` — owner 对战历史。
- `GET /api/arena/model-winrate` — 按 taskType 的模型胜率（仅统计已投票 match，且样本 ≥3）。
- `GET /api/arena/personal-stats` — owner 的个人模型偏好统计。

### Client Surface

- Hooks：`use-arena`、`use-arena-history`、`use-arena-personal-stats`。
- Components：`ArenaPageClient`（主流程）、`ArenaForm`（创建对战）、`ArenaGrid`（候选图展示 + 投票）、`ArenaLeaderboard`、`ArenaHistory`、`ArenaPersonalStats`。
- i18n namespaces：`ArenaPage`、`ArenaLeaderboard`、`ArenaHistory`、`ArenaPersonalStats`。

### Relationship To Generation

Arena entry 不是独立的生成系统。它通过 `generateImageForUser` 走标准生成链路，因此遵循相同的 provider 路由、BYOK / platform key 解析和额度规则。Arena 自身只新增"对战、投票、ELO、按任务胜率、个人统计"这一层评测语义。

## Target

### Role

Arena 是模型评测与发现工具，次于主创作 loop。它帮助用户在同一 prompt 下横向对比模型质量，并把投票结果沉淀为可复用的模型排名和个人偏好信号。

### Responsibility

Arena owns：

- match 创建与生命周期（创建 → 多模型 entry → 投票）。
- 盲投与 winner 记录。
- 全局模型 ELO 排名。
- 按 taskType 的模型胜率聚合。
- 个人模型偏好统计与对战历史。

Arena does not own：

- 图像生成执行、provider payload 或模型 API 正确性。
- 额度 / 免费额度 / BYOK 规则（由生成链路与 credits 域负责）。
- R2 上传与存储留存。
- 模型目录定义（来自 `src/constants/models` 与 `ModelConfig`）。
- Gallery 公开展示与公开可见性策略。

### Contract

Future Arena work must preserve：

- match、entry、vote、history、personal-stats 全部 owner-scoped，服务端授权。
- 已投票 match 不可重复投票、不可继续生成 entry。
- ELO 与胜率更新只能发生在服务端。
- entry 生成不能绕过标准生成链路的额度 / key 规则。
- ELO 排名与按 taskType 胜率是 Arena 独有语义，不应被其它域改写。

### Stability Rules

不能破坏：`/arena`、`/arena/leaderboard`、`/arena/history` 三条路由；match → entries → vote 流程；`ArenaMatch` / `ArenaEntry` / `ModelEloRating` 模型与 ELO 更新；按 taskType 的胜率口径；可见 UI 文案的翻译就绪。

## Unresolved

- `getModelWinRatesByTask` 同时存在于 `arena.service.ts` 与 `arena-winrate.service.ts`，归属与去重待统一。
- Arena entry 生成的 `Generation` 默认可见性、是否进入 owner 的 Gallery / Assets、是否需要 arena 来源标记，本次未确认（`generateArenaEntry` 未见 arena 专属可见性字段）。
- entry 生成的额度预留 / 成功确认 / 失败释放是否与标准 Studio 生成完全一致，本次未逐路径验证。
- `submitArenaVote` 的并发与重复投票防护细节本次未深入。
- 参选模型集合（哪些模型进入对战、如何按 available 过滤）的来源本次未核。
- 对战候选数量、slotIndex 上限与 aspectRatio 约束未在本文档固化。

## Source of Truth

- `docs/product/scope.md`
- `docs/architecture/generation.md`
- `docs/architecture/credits.md`
- `docs/integrations/providers.md`
- `src/app/[locale]/(main)/arena/page.tsx`
- `src/app/[locale]/(main)/arena/history/page.tsx`
- `src/app/[locale]/(main)/arena/leaderboard/page.tsx`
- `src/app/[locale]/(main)/arena/layout.tsx`
- `src/app/[locale]/(main)/arena/leaderboard/layout.tsx`
- `src/app/api/arena/matches/route.ts`
- `src/app/api/arena/matches/[id]/route.ts`
- `src/app/api/arena/matches/[id]/entries/route.ts`
- `src/app/api/arena/matches/[id]/vote/route.ts`
- `src/app/api/arena/leaderboard/route.ts`
- `src/app/api/arena/history/route.ts`
- `src/app/api/arena/model-winrate/route.ts`
- `src/app/api/arena/personal-stats/route.ts`
- `src/services/arena.service.ts`
- `src/services/arena-winrate.service.ts`
- `src/services/image/generate-image.service.ts`
- `src/lib/classify-task-type.ts`
- `src/components/business/ArenaPageClient.tsx`
- `src/components/business/ArenaForm.tsx`
- `src/components/business/ArenaGrid.tsx`
- `src/components/business/ArenaLeaderboard.tsx`
- `src/components/business/ArenaHistory.tsx`
- `src/components/business/ArenaPersonalStats.tsx`
- `src/hooks/use-arena.ts`
- `src/hooks/use-arena-history.ts`
- `src/hooks/use-arena-personal-stats.ts`
- `src/constants/routes.ts`
- `src/constants/config.ts`
- `src/types/index.ts`
- `prisma/schema.prisma`（`ArenaMatch`、`ArenaEntry`、`ModelEloRating`）

## Last Verified

- Date: 2026-06-03
- Method: route / component / hook / API / service / schema inspection
- External docs: not required for Arena domain facts in this pass
- Runtime: not run
