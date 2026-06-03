# Prompts Domain

最后更新：2026-06-03

本文档记录 Prompts（提示词库）业务域的当前事实、已确认目标和未决边界。它不替代生成、Studio、Cards、Gallery 或认证文档。

## Current

### Route Surface

Current Prompts route surface（locale 前缀，位于 `(main)` shell 内，`robots: noindex`）：

- `/prompts` renders the prompt library，含 `mine` 与 `inspiration` 两个 tab。
- `/prompts/[id]` renders a single recipe 的详情编辑器 + 该模板的作品血缘。

`/prompts` 服务端用 `PromptCreateQuerySchema.safeParse` 校验创建预填参数；signed-out 的 `mine` tab 渲染引导空状态。

### Two Tabs

Prompts 域是一个可复用创作起点的"库"，由两层组成：

- `mine` — 用户自己的 prompt 模板，数据是 `Recipe`，通过 `recipe.service` 读写。
- `inspiration` — 平台策展的灵感库，数据是 `InspirationPrompt`，通过 `inspiration.service` 浏览并 clone 成用户自己的 `Recipe`。

### Recipe Library

`Recipe`（`prisma/schema.prisma` 中独立 model，区别于 cards 域的 `CardRecipe`）承载可复用的 prompt 模板：compiledPrompt、negativePrompt、modelId、provider、outputType、version、parentGenerationId。

`recipe.service` 职责：`createRecipe` / `updateRecipe` / `getRecipe` / `deleteRecipe` / `listRecipes` / `listRecipeSummaries`、`createRecipeFromGeneration`（从一条作品反存为模板）、`listRecipeGenerations`（一个模板产出的全部作品，即血缘）、`buildRecipeSnapshot`。全部 owner-scoped。

### Inspiration Library

`InspirationPrompt`（平台策展）通过 `inspiration.service` 提供：`listInspirations`、`getInspirationById`、`cloneInspirationToRecipe`。灵感到模板是单向 clone——用户克隆后得到一条属于自己的 `Recipe`。

### Data Model

- `Recipe` — userId、name、outputType、compiledPrompt、negativePrompt、modelId、provider、version、parentGenerationId；owner-scoped 的 prompt 模板。
- `InspirationPrompt` — 平台策展灵感条目，供浏览、筛选、克隆。

### API Surface

- `GET/POST /api/recipes` — 列出 / 创建用户模板。
- `GET/PATCH/DELETE /api/recipes/[id]` — 单个模板读写删。
- `POST /api/recipes/from-generation` — 从一条作品保存为模板。
- `GET /api/inspiration` — 灵感库列表。
- `POST /api/inspiration/[id]/clone` — 克隆灵感为用户模板。

### Client Surface

- Hooks：`src/hooks/prompts/` 下的 `use-recipes`、`use-inspirations`、`use-prompt-feedback`、`use-civitai-mined-prompts`。
- Components：`src/components/business/prompts/` 下的 `PromptTemplateCreatePanel`、`PromptTemplateList`、`PromptTemplateDetailEditor`、`CopyPromptButton`、`PromptAssistantPanel`，以及 `inspiration/` 子目录（`InspirationGrid`、`InspirationCard`、`InspirationFilters`、`PromptLibraryTabs`、`PlaceholderFillDialog`）。
- i18n namespace：`PromptLibrary`。

### Boundary Notes

- prompt 的 AI 辅助引擎（增强 / 助手 / 守卫 / 编译）位于 `src/services/kernel/`（`prompt-enhance` / `prompt-assistant` / `prompt-guard` / `prompt-compiler`），属于 Studio 创作链路，不归本域。本域只在库页面提供保存与复用入口。
- `CardRecipe` 与 `/api/card-recipes/*` 属 Cards 域，与本域的 `Recipe` / `/api/recipes/*` 是不同 model、不同 API。

## Target

### Role

Prompts 是把"好 prompt"沉淀为可复用模板、并把平台灵感转化为个人模板的库，次于主创作 loop。它的价值在沉淀、复用与血缘，不在生成。

### Responsibility

Prompts owns：

- `Recipe` 模板的 CRUD。
- 从作品反向保存模板（`createRecipeFromGeneration`）。
- 模板到作品的血缘（`listRecipeGenerations`）。
- 灵感库浏览、筛选与克隆为用户模板。

Prompts does not own：

- prompt 的 AI 增强 / 助手 / 守卫 / 编译引擎（`services/kernel/`，Studio 创作链路）。
- 图像 / 视频 / 音频 / 3D 生成执行。
- `CardRecipe` 与卡片组合配方（Cards 域）。
- 模型目录、provider、额度规则。

### Contract

Future Prompts work must preserve：

- `Recipe` 的读写删全部 owner-scoped、服务端授权。
- 灵感 clone 的产物必须落为调用者自己的 `Recipe`。
- `Recipe` 与 `CardRecipe` 是不同 model，不可在 API 或数据层混用。
- prompt 辅助引擎留在 `services/kernel/`，不被本域吸收。

### Stability Rules

不能破坏：`/prompts`、`/prompts/[id]` 路由；`mine` / `inspiration` 两 tab；`/api/recipes` 与 `/api/inspiration` 接口族；`Recipe` 与 `InspirationPrompt` 模型；从作品存模板与模板血缘路径；可见 UI 文案的翻译就绪。

## Unresolved

- `Recipe`（本域）与 `CardRecipe`（Cards 域）概念都叫 "recipe"，长期是否需要更清晰的命名区分待定。
- `prompt-feedback.service` 与 `PromptAssistantPanel` 位于 prompts 目录下但偏创作辅助，与 Studio 创作链路的归属边界待澄清。
- `InspirationPrompt` 的数据来源（civitai mined / 外部 dataset 外链，`next.config.ts` 显示 `images.meigen.ai`）与未来镜像 R2 的策略本次未核。
- 灵感库的公开范围、是否有内容审核本次未确认。
- `Recipe.version` 的版本化语义本次未深入。
- recipe 写操作的额度 / 计费关系（保存模板本身不应消耗生成额度）本次未逐路径验证。

## Source of Truth

- `docs/product/scope.md`
- `docs/domains/cards.md`
- `docs/domains/studio.md`
- `docs/architecture/generation.md`
- `src/app/[locale]/(main)/prompts/page.tsx`
- `src/app/[locale]/(main)/prompts/[id]/page.tsx`
- `src/services/prompts/recipe.service.ts`
- `src/services/prompts/inspiration.service.ts`
- `src/services/prompts/prompt-feedback.service.ts`
- `src/app/api/recipes/route.ts`
- `src/app/api/recipes/[id]/route.ts`
- `src/app/api/recipes/from-generation/route.ts`
- `src/app/api/inspiration/route.ts`
- `src/app/api/inspiration/[id]/clone/route.ts`
- `src/hooks/prompts/use-recipes.ts`
- `src/hooks/prompts/use-inspirations.ts`
- `src/components/business/prompts/PromptTemplateCreatePanel.tsx`
- `src/components/business/prompts/PromptTemplateList.tsx`
- `src/components/business/prompts/PromptTemplateDetailEditor.tsx`
- `src/components/business/prompts/inspiration/InspirationGrid.tsx`
- `src/components/business/prompts/inspiration/PromptLibraryTabs.tsx`
- `src/constants/routes.ts`
- `src/types/index.ts`
- `prisma/schema.prisma`（`Recipe`、`InspirationPrompt`）

## Last Verified

- Date: 2026-06-03
- Method: route / component / hook / API / service / schema inspection
- External docs: not required for Prompts domain facts in this pass
- Runtime: not run
