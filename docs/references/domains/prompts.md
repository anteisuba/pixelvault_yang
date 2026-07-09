# Prompts 域 — 提示词模板与灵感库（现状事实）

> 职责：可复用创作起点的「库」——存模板、管模板、灵感 clone、模板↔作品血缘。**不负责**：执行生成；prompt 增强/助手/翻译/看图描述/守卫归 Studio 创作链（kernel 服务族）。

## 路由面与双 Tab

- `/prompts`（`robots: noindex`）：`mine`（用户模板，数据=`Recipe`）+ `inspiration`（平台策展灵感，数据=`InspirationPrompt`）双 tab；signed-out 的 mine 渲染引导空态。
- `/prompts/[id]`：单个 recipe 详情编辑器 + 该模板的作品血缘。

## 数据模型（注意与 cards 域区分）

- `Recipe`：owner-scoped 模板（compiledPrompt / negativePrompt / modelId / provider / outputType / version / parentGenerationId）——**不是** cards 域的 `CardRecipe`。
- `InspirationPrompt`：平台策展条目，**单向 clone** 成用户自己的 Recipe。
- **共享库已落地（2026-07 路线 A）**：`Recipe.visibility=PUBLIC` 即发布共享，零迁移；`listInspirations` 分段 merge 公开 recipe（非 UNION），封面只取 public generation；clone 公开 recipe 走 `cloneSharedRecipe` 回退链。

## Service / API

- `recipe.service`：CRUD + `createRecipeFromGeneration`（作品反存模板）+ `listRecipeGenerations`（血缘）+ `buildRecipeSnapshot`，全 owner-scoped。
- `inspiration.service`：`listInspirations` / `getInspirationById` / `cloneInspirationToRecipe`。
- API：`/api/recipes`（GET/POST）· `/api/recipes/[id]`（GET/PATCH/DELETE）· `/api/recipes/from-generation` · `/api/inspiration` · `/api/inspiration/[id]/clone`。
- Hooks：`src/hooks/prompts/`（use-recipes / use-inspirations / use-prompt-feedback / use-civitai-mined-prompts）。

## 不能破坏

Recipe 与 CardRecipe 的模型分离 · 灵感→模板单向 clone（不反向写平台库）· owner-scoped 查询 · 公开 recipe 封面只取 public generation（隐私）· 模板→作品血缘链（parentGenerationId / recipe 关联）。

## 已拍板方向（未实施）

详情与 Gallery 共用 MeiGen 式 route-backed overlay 模板；工坊宅邸房间定位 = 配方房（药方笺配方卡/试做盖章，草案）。

## Source of Truth

`src/app/[locale]/(main)/prompts/**` · `src/services/prompts/`（recipe / inspiration service）· `src/hooks/prompts/`；历史详版 `git show cddc4384:docs/domains/prompts.md`。

## Last Verified

2026-07-10 · 沿用 2026-06-03 口径 + 2026-07 共享库路线 A 落地事实（memory 交叉核对）。
