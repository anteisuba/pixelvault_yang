# Prompts 域 — 提示词模板（现状事实）

> 职责：可复用创作起点的「库」——存模板、管模板、模板↔作品血缘。公开发现归 Gallery（`gallery.md`「两种看法」）。**不负责**：执行生成；prompt 增强/助手/翻译/看图描述/守卫归 Studio 创作链（kernel 服务族）。

## 路由面

现行布局与交互见 `../pages/prompts.md`：正文卡、搜索、紧凑新建与详情。

- `/prompts`（`robots: noindex`）：只有「我的模板」（数据=`Recipe`）；signed-out 渲染引导空态。共享提示词库页签与外部灵感数据 2026-10-23 已删，公开提示词改在画廊「提示词」看法里浏览。
- `/prompts/[id]`：单个 recipe 详情编辑器 + 该模板的作品血缘。

## 数据模型（注意与 cards 域区分）

- `Recipe`：owner-scoped 模板（compiledPrompt / negativePrompt / modelId / provider / outputType / version / parentGenerationId）。（cards 域的 `CardRecipe` 表 2026-10-21 已删。）
- 模板不再「发布」：`Recipe.visibility` 已停读停写（`lib/db.ts` 的 `RETIRED_COLUMNS`），下一次数据库改动删列。`usageCount` 是旧共享库的复制计数，不再增长。
- 列表封面：首张用该模板出的图 → 来源作品 → 模板自存的 `coverImageUrl` → 文字兜底。

## Service / API

- `recipe.service`：CRUD + `createRecipeFromGeneration`（作品反存模板）+ `listRecipeGenerations`（血缘）+ `buildRecipeSnapshot`，全 owner-scoped。
- API：`/api/recipes`（GET/POST）· `/api/recipes/[id]`（GET/PATCH/DELETE）· `/api/recipes/from-generation`。
- Hooks：`src/hooks/prompts/`。

## 不能破坏

owner-scoped 查询 · 模板→作品血缘链（parentGenerationId / recipe 关联）。

## 已拍板收敛方向（2026-07-19；删共享库已于 2026-10-23 落地，类型路由未实施）

### 产品边界

- **公共配方发现归 Gallery。** 公开作品是发现单位，经过公开授权和清洗的 Prompt、Negative Prompt、模型、参数、LoRA 等作为作品自带配方展开、比较和复用。
- **Prompts 只做个人配方工作区。** 管理草稿、从 Gallery 保存的配方、版本、标签、作品血缘，并把配方送往对应 Studio/创作域；不执行生成，也不再提供独立公共 feed。
- `/prompts` 的“我的模板 / 共享提示词库”双 Tab 已删（2026-10-23）；页面直接进入个人配方工作区。

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

### 删除共享库（2026-10-23 已完成）

共享页签、`/api/inspiration/**`、灵感 service/hook/api-client、助手与润色里没人打开过的灵感检索、`InspirationPrompt` 表（1446 条外部数据，owner 确认不备份）及导入脚本、模板「发布」都已删；3 个已发布模板改回私有。Gallery 只消费公开 Generation 的“公开配方投影”，不得直接暴露重型 `snapshot`、私有 reference asset、不可访问 LoRA 或内部 provider 数据。

旧“配方房/药方笺/试做盖章”和 MeiGen 造型方向已随视觉规则重建废止；route-backed 详情是否保留只按交互价值重新评估。

## Source of Truth

`src/app/[locale]/(main)/prompts/**` · `src/services/prompts/`· `src/hooks/prompts/`；历史详版 `git show cddc4384:docs/domains/prompts.md`。

## 移动端等级（owner 2026-09-03 拍板，配方见 `../ui-defaults.md §6`）

- **完整**。
- 375px：模板卡单列；`/prompts/[id]` 编辑器全宽，血缘作品区在编辑器下方。

## Last Verified

- 2026-10-23 · 共享提示词库删除、公开提示词搬到画廊「提示词」看法。
- 2026-09-09 · 提示词页已按确认稿实装；375 / 820 / 1440px 页面核对，搜索、取消与使用确认已验证；保存失败与复制降级由组件测试覆盖。

- 2026-09-03 · 新增「移动端等级」节（owner 拍板，配方见 ui-defaults.md §6）。
  2026-07-19 · 代码现状仍是双 Tab/共享库路线 A；owner 已拍板后续删除共享发现面与 `InspirationPrompt` 专用链路，公共配方发现合并进 Gallery，尚未实施。
