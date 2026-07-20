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

## 已拍板收敛方向（未实施，2026-07-19）

### 产品边界

- **公共配方发现归 Gallery。** 公开作品是发现单位，经过公开授权和清洗的 Prompt、Negative Prompt、模型、参数、LoRA 等作为作品自带配方展开、比较和复用。
- **Prompts 只做个人配方工作区。** 管理草稿、从 Gallery 保存的配方、版本、标签、作品血缘，并把配方送往对应 Studio/创作域；不执行生成，也不再提供独立公共 feed。
- `/prompts` 的“我的模板 / 共享提示词库”双 Tab 目标删除；页面直接进入个人配方工作区。

### 目标信息架构

- 类型导航提升到页面最上层；类型不是卡片筛选条件，而是独立的 route-backed 配方入口：`/prompts/image`、`/prompts/video`、`/prompts/lora`、`/prompts/audio`。
- 每个类型路由拥有独立字段、空态、创建和编辑流程；只共享搜索、保存、版本、复用和送往创作域等行为。
- 每个类型页的第一任务是查找、打开和复用已有配方；新建/编辑为第二任务，不默认展示空白编辑器，也不承担 Studio 的即时创作职责。
- 四类配方不是 universal Recipe schema 的可选变体。每个路由独立定义字段、依赖、信息层级和页面设计；共享层只保留导航、身份元数据、搜索、保存、版本和复用行为。
- Image：Prompt、Negative Prompt；不使用也不展示 LoRA 字段。
- Video：Prompt、引用文件、Video 自有参数。
- LoRA：Prompt、Negative Prompt、底模、挂载 LoRA、LoRA 自有参数。
- 某类型不负责的字段不得以隐藏、禁用或“高级参数”形式混入该页面。
- Audio 结构与 `/prompts` 默认落点仍待确认；“全部类型混排”不再作为默认信息架构。
- LoRA 是独立配方类别，不是 Image 配方的可选挂载区，也不是现有 `OutputType`；后续不得为了 UI 方便直接把 `LORA` 塞进 `OutputType`，需先确认独立 `recipeKind` / `sourceSurface` 等长期模型。
- 列表、卡片、分栏等具体布局尚未拍板，不能从当前网格直接继承。

### 后续删除任务（本轮只登记，不执行）

owner 已确认共享提示词库及其专用数据可以删除。后续独立 task packet 的目标范围：

- 删除 `/prompts?tab=inspiration`、`PromptLibraryTabs` 及 `components/business/prompts/inspiration/**` 公共发现 UI。
- 删除 `/api/inspiration/**`、`hooks/prompts/use-inspirations.ts`、`lib/api-client/inspiration.ts`、`services/prompts/inspiration.service.ts` 与对应测试。
- 删除 `InspirationPrompt` 数据、导入/健康检查脚本及 Prisma model/migration；执行前先统计数据量与引用，提供可回滚迁移。
- 移除 `Recipe.visibility=PUBLIC` 作为独立共享库的发布/合并逻辑；是否删除字段必须先审计 Gallery 合并、recipe 详情和 clone 血缘的调用面。
- Gallery 只消费公开 Generation 的“公开配方投影”，不得直接暴露重型 `snapshot`、私有 reference asset、不可访问 LoRA 或内部 provider 数据。

旧“配方房/药方笺/试做盖章”和 MeiGen 造型方向已随视觉规则重建废止；route-backed 详情是否保留只按交互价值重新评估。

## Source of Truth

`src/app/[locale]/(main)/prompts/**` · `src/services/prompts/`（recipe / inspiration service）· `src/hooks/prompts/`；历史详版 `git show cddc4384:docs/domains/prompts.md`。

## Last Verified

2026-07-19 · 代码现状仍是双 Tab/共享库路线 A；owner 已拍板后续删除共享发现面与 `InspirationPrompt` 专用链路，公共配方发现合并进 Gallery，尚未实施。
