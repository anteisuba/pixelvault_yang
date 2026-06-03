# Storyboard Domain

最后更新：2026-06-03

本文档记录 Storyboard 业务域的当前事实、已确认目标和未决边界。它不替代生成、存储、认证、Gallery、Cards 或 Node workflow 文档。

## Current

### Route Surface

Current Storyboard route surface（locale 前缀，位于 `(main)` shell 内）：

- `/storyboard` renders the story list + create flow.
- `/storyboard/[id]` renders the story editor（排序、生成叙事、切换显示、公开切换、导出）。
- `/storyboard/loading` and `/storyboard/error` provide route-level fallbacks.
- `/storyboard/layout` is the domain-local layout.

### What Storyboard Does

Storyboard 是一个叙事编排域：把**已有作品**编排成有顺序、有文案的故事。它本身不生成图像。

- 创建：通过 `AssetSelectorDialog` 从 owner 已有的 `Generation` 中挑选多张图，`createStory(title, generationIds)` 建立 `Story` 和按序的 `StoryPanel[]`。服务端会校验所有 generationId 属于当前用户，并拒绝重复 id。
- 叙事：`generateNarrative(tone)` 通过 `llm-text.service` 为每个 panel 生成 caption 与 narration。当前 4 种 tone：humorous / dramatic / poetic / adventure。LLM 输出经 `NarrativeItemSchema` + `z.array(...).safeParse` 校验后才写入。
- 呈现：`displayMode` 在 `scroll`（`StoryScrollRenderer`）与 `comic`（`StoryComicRenderer`）之间切换；`StoryImagePicker` 重排 panel；`StoryExportButton` 导出；`isPublic` 切换 story 级公开。

### Data Model

- `Story` — userId、title、coverImageId、displayMode（默认 `scroll`）、isPublic（默认 false）；owner-scoped。
- `StoryPanel` — storyId、generationId（nullable，`onDelete: SetNull`）、orderIndex（`@@unique([storyId, orderIndex])`）、caption、narration。

Panel 通过 `generationId` 引用共享的 `Generation`。作品被删除时 panel 保留但 `generationId` 置空——叙事结构不随作品删除而丢失，但该格的图会消失。

### API Surface

- `POST /api/stories` — 创建 story。
- `GET /api/stories` — owner story 列表。
- `GET /api/stories/[id]` — 取 story；同时承载公开分支（`getPublicStoryById`，仅 `isPublic` 可匿名取）。
- `PATCH /api/stories/[id]` — 更新 title / displayMode / isPublic。
- `DELETE /api/stories/[id]` — 删除 story。
- `POST /api/stories/[id]/reorder` — 重排 panel。
- `POST /api/stories/[id]/narrative` — 生成叙事。

### Client Surface

- Hook：`use-storyboard`（`useStoryList` 列表/创建/删除；`useStoryEditor` 详情/更新/叙事/重排）。
- API helpers：`listStoriesAPI`、`createStoryAPI`、`getStoryAPI`、`updateStoryAPI`、`deleteStoryAPI`、`reorderPanelsAPI`、`generateNarrativeAPI`（在 `src/lib/api-client`）。
- Components：`StoryCard`、`StoryScrollRenderer`、`StoryComicRenderer`、`StoryImagePicker`、`StoryExportButton`、`AssetSelectorDialog`。
- i18n namespace：`StoryBoard`。

### Relationship To Other Domains

- Generation：Storyboard 只**消费** `Generation`，从不生成。panel 是对作品的引用。
- LLM text：叙事生成走 `llm-text.service`（与 prompt 增强 / assistant 同一文本 LLM 链路）。
- Node workflow：`story.service` 物理位于 `src/services/node/`，与 node workflow 共享目录。两者的域边界需澄清（见 Unresolved）。

## Target

### Role

Storyboard 是把已有作品组织成可分享叙事的轻量编排域，次于主创作 loop。它的价值在编排、叙事和呈现，不在生成。

### Responsibility

Storyboard owns：

- story 与 panel 的 CRUD。
- panel 排序。
- 基于 tone 的 LLM 叙事生成与校验。
- scroll / comic 呈现与导出。
- story 级公开 / 私有切换。

Storyboard does not own：

- 图像生成执行与 provider / 额度规则。
- `Generation` 的所有权或可见性策略（panel 只引用）。
- 资产管理、文件夹 / 项目。
- Profile 公开身份策略。

### Contract

Future Storyboard work must preserve：

- panel 只能引用 owner 自己的 `Generation`，服务端校验所有权。
- owner-scoped 读写与公开读取分离：`getPublicStoryById` 只返回 `isPublic` story。
- LLM 叙事输出必须经 schema 校验后才落库。
- `StoryPanel.orderIndex` 在一个 story 内唯一。
- 作品删除时 panel 走 `SetNull`，不级联删除 story。
- `Story.isPublic` 与底层 `Generation.isPublic` 是两套独立可见性。

### Stability Rules

不能破坏：`/storyboard`、`/storyboard/[id]` 路由；`/api/stories` 系列接口；`Story` / `StoryPanel` 模型与 SetNull 行为；displayMode（scroll / comic）与 tone（四种）取值；可见 UI 文案的翻译就绪。

## Unresolved

- 公开 Story 的访客展示路径不明确：`GET /api/stories/[id]` 已支持公开分支，但 `/storyboard/[id]` 前端走 owner-scoped `useStoryEditor`，本次未找到面向匿名访客的渲染路由。
- `Story.isPublic` 与底层 panel `Generation` 可见性的关系未定义：公开 story 是否会暴露私有 generation 的图或 prompt，需要明确策略。
- `story.service` 位于 `src/services/node/` 下，Storyboard 是独立域还是 node workflow 子能力，归属边界待澄清。
- `coverImageId` 的设置路径与用途本次未确认。
- 导出（`StoryExportButton`）的产物格式、是否依赖客户端渲染、私有媒体处理本次未核。
- 叙事生成的额度 / 计费归属（是否计入文本 LLM 用量）本次未确认。

## Source of Truth

- `docs/product/scope.md`
- `docs/architecture/generation.md`
- `docs/architecture/storage.md`
- `docs/domains/gallery.md`
- `docs/domains/node-workflow.md`
- `src/app/[locale]/(main)/storyboard/page.tsx`
- `src/app/[locale]/(main)/storyboard/[id]/page.tsx`
- `src/app/[locale]/(main)/storyboard/layout.tsx`
- `src/app/api/stories/route.ts`
- `src/app/api/stories/[id]/route.ts`
- `src/app/api/stories/[id]/reorder/route.ts`
- `src/app/api/stories/[id]/narrative/route.ts`
- `src/services/node/story.service.ts`
- `src/services/llm-text.service.ts`
- `src/hooks/use-storyboard.ts`
- `src/components/business/StoryCard.tsx`
- `src/components/business/StoryScrollRenderer.tsx`
- `src/components/business/StoryComicRenderer.tsx`
- `src/components/business/StoryImagePicker.tsx`
- `src/components/business/StoryExportButton.tsx`
- `src/components/business/AssetSelectorDialog.tsx`
- `src/lib/api-client`（story helpers）
- `src/constants/routes.ts`
- `src/types/index.ts`
- `prisma/schema.prisma`（`Story`、`StoryPanel`）

## Last Verified

- Date: 2026-06-03
- Method: route / component / hook / API / service / schema inspection
- External docs: not required for Storyboard domain facts in this pass
- Runtime: not run
