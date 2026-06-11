# LoRA 配方工作流 — 活跃任务包

创建：2026-06-11
状态：M2c 一键同款已落地（2026-06-11，宿主 LoraPromptControlButton →
LoraSourceRecipeStrip）：点来源图→展开配方（prompt/负向/seed/steps/
cfg/尺寸/checkpoint）→ seed 开关 → 一键同款（prompt 替换、负向合并、
参数覆盖、真实 LoRA 权重、最近比例档；未应用参数与多 LoRA 警告明示）。
下一步：M2b 面板形态 + 入口收敛（布局级，先出 Figma 改动清单）、
M3 配方拆层。
M2a 实现备注：挂载事件为内存态（provider 在 studio layout，跨
/studio/lora→/studio/image 导航存活，不落 localStorage）；同 tick 批量
push 的事件判定可能用到旧快照（真实交互为逐次点击，不受影响，见
use-active-lora-stack push 注释）。
M2a 修订（owner 实测拍板 2026-06-11）：①工具栏按钮 facepile 撤销——
回退为图标+角标，预览图只进"点击 LoRA 后的详细信息卡片"；②详细卡片
新增**来源图横滚预览区**（M1 recipes 数据，即 M2c 第一步提前落地）；
③卡片缩略图兜底链补"第一张来源图"档——旧收藏行没存 coverImageUrl
（字段后加的），带 modelVersionId 即可由来源图补上，无需数据回填。
另：旧收藏 cover 批量回填脚本列为可选小修，暂缓。

⚠️ 重要勘误（2026-06-11）：**`StudioLoraChip` 是死代码**——prompt-tags
上线时已被 `LoraPromptControlButton`（工具栏「LoRA」钻石按钮，
`src/components/business/studio/prompt-tags/`）取代，无任何 import。
M2a 首版 UI 误改了死组件（owner 实测页面无变化才暴露）；已恢复死组件
原状并把 缩略图/来源图条/挂载 toast 移植进活组件。**后续 M2b/M2c 的
面板宿主就是 LoraPromptControlButton**；死组件待 Spec 6 拆分时一并清理。
M1 实现备注：①loraWeight 三信号回收（resources hash → civitaiResources
modelVersionId → prompt `<lora:名:权重>` 标签 + 文件名词干匹配），实测
来源图 resources 常只含 checkpoint、权重多在 prompt 标签里；②映射层对
越界值（如 detail-slider 的负权重）跳过并列入 skippedParams，不静默钳制。

## 问题定义（owner 2026-06-11 确认）

用户从 LoRA 库拿到 LoRA 后的两个核心问题：

1. **还原**：不知道怎么写 prompt 才能生成出与参考图（LoRA 页来源图）一致的效果。
2. **定制**：不知道怎么在保持角色/画风的前提下，改出自己想要的图。

解法是**图片中心**而非文本中心：参考图本身就是配方的载体——
Civitai `model-versions/:id` 的 `images[].meta` 带完整生成配方
（prompt/negativePrompt/seed/steps/sampler/cfgScale/Size/resources），
实测命中率 ≥96%（top LoRA 抽样 75/78，近月热门 77/77）。

## 关键核验事实（2026-06-11 实测 + 官方文档）

- `/api/v1/images` 的 `withMeta` 参数默认 false；**当前生产代码没传**，
  导致社区图 meta 恒为 null（设计文档旧"现状校正"是误诊）。
- `nsfw=false` 是 legacy 参数，行为不稳定，应换 `browsingLevel`（1=SFW）。
- 热门模型按 `modelId` 查 images 有 Cloudflare 超时风险，固定用 `modelVersionId`。
- 分页 `page × limit ≤ 1000`，深翻页用 cursor。
- 每张图带 `hasMeta` / `hasPositivePrompt` / `onSite` / `remixOfId` 标志，
  可预筛"可还原"图。
- `meta.resources` 含该图所有资源及权重 → 可取本 LoRA 真实 weight、
  检测多 LoRA 叠加。
- 文档：https://developer.civitai.com/site/reference/images 、
  /site/reference/model-versions （旧 GitHub wiki 已废弃）。

## 里程碑

### M0 — 地基收尾

- 工作树 in-flight 来源图 prompt 改动：跑相关 vitest + lint，提交。
- 修正 `docs/design/lora-prompt-assistant.md` 中 "meta often null" 误诊段。

### M1 — 配方数据层（constants → types → services）

1. API 调用修复：`mineCivitaiUserPrompts` 加 `withMeta=true`、
   `nsfw=false` → `browsingLevel=1`、查询键固定 `modelVersionId`。
2. 逐图配方记录：新类型 `CivitaiImageRecipe`
   （imageUrl/尺寸/hasMeta/prompt/negativePrompt/seed/steps/sampler/
   cfgScale/clipSkip/本LoRA真实weight/extraLoras[]/baseModel/source）。
   `fetchModelVersionSourcePrompts` 升级为逐图配方而非纯文本 outfits。
3. 参数映射层：`src/lib/civitai-recipe-to-generation.ts` —
   recipe → prompt + AdvancedParams（negativePrompt/seed/guidanceScale←cfgScale/steps）
   - lora scale（真实 weight）+ 尺寸→最近比例档 + 兼容模型路由；
     映射不了的字段进 `skipped[]` 显式警告；extraLoras 非空 → 还原度受限警告。

### M2 — 还原闭环 UI（一键同款 + 挂载可见性）

分三个工作流，M2a 可先行（低风险、数据已就绪）。

**M2a 挂载可见性 + 打开逻辑（owner 2026-06-11 追加）**

数据事实：`LoraAssetRecord` 已有 `coverImageUrl` + `previewImageUrls`
（`src/types/index.ts:3456`），挂载栈（`use-active-lora-stack`）存完整
asset，收藏路径（`FavoriteLoraRequestSchema`）也持久化 cover——
预览图是**纯 UI 渲染缺口**，无数据层改动。

- 工具栏触发按钮：从 icon+数字角标 升级为**封面缩略图叠放**
  （facepile，最多 3 张圆角小图 + 数量），一眼看到挂了哪些 LoRA。
- chip 卡片加**封面缩略图**（cover → 第一张 preview → Palette 占位
  icon 三级兜底）；点缩略图直达该 LoRA 的来源图网格（M2c）。
- **挂载即时反馈**：从 workbench 挂载返回 / `?style=` 分享链接进入时，
  chip 高亮 + toast（带"查看"action）或自动展开一次面板——
  解决"挂上了但界面毫无确认"。
- 旧 localStorage 条目无 cover 的优雅降级（占位 icon，重新收藏可补全）。

**M2b 面板形态 + 入口收敛**

- 当前 `w-80` popover 装不下图片网格：桌面改宽面板或右侧 drawer，
  移动端 bottom sheet（与现有 mobile drawer parity 一致）。
- 入口收敛决策（Figma 阶段定稿，两候选）：
  ① 合并 LoRA chip 与 Prompt 助手为单入口，LoRA 状态区置顶 + 助手
  ②③④⑤ 区接续；② 保持两入口，chip 缩略图点击直达助手对应区。
  倾向 ①（两按钮职责重叠，用户心智里是一件事）。
- 打开逻辑：沿用 `StudioFormState.panels` reducer 管理；新增挂载事件
  触发的一次性自动展开（不持久打扰）。

**M2c 来源图网格 + 一键同款（核心）**

- hook `use-lora-recipes`：按激活 LoRA 拉来源图配方（社区图作补充）。
- 面板推荐区改为**来源图网格**：可还原徽章、来源徽章；
  点选 → 配方预览 + 一键同款（应用 prompt/负向/scale/seed/参数/模型路由）。
- seed 默认带上，UI 露出"锁定/随机"开关。
- 负向词收口：机器写入统一走 negative tag stack（贴近来源图路径同步迁移）。
- 多 LoRA 警告条；无配方图引导到最近的可还原图。
- i18n 三语；非琐碎 UI 先出 Figma 改动清单；UI 确认阶梯逐项走。
- 与 UI 升级线（docs/design/reviews/ Phase 0）对齐面板视觉方向。
- 验收：3–5 个 LoRA 逐图还原肉眼对比；每个失败 case 可归因；
  挂载后 3 秒内用户能从界面确认"挂了什么、长什么样、下一步点哪"。

### M3 — 配方拆层（看懂）

- 跑 `scripts/import-danbooru-prompt-tags.ts`（CSV 手动下载）——
  Danbooru category 数据从 forward-looking 变为 load-bearing：
  它是 token→用途 的分类词典。
- `src/lib/prompt-recipe-decompose.ts`：确定性 token 分类
  （身份/服装/姿势/镜头/场景/光线/质量/风格/负向；未识别→other 低置信；
  处理权重语法/括号/下划线）。
- 配方预览升级为分组 chips；身份块锁定标识；中文组名。

### M4 — 定制层（改成我想要的）

- 可变块替换：分组展开 + 搜索（复用 prompt-tag-search + danbooru 语料）。
- recipes 重定位为**可变层预设**（半身/全身/换场景/去3D/修手 =
  批量替换某分组）；`prompt-recipes.ts` + `apply-prompt-recipe.ts`。
- 身份保护：删身份/trigger 需确认；防漂移集复用 lora-source-match-prompt。
- 已选预览复用 compilePromptTags。

### M5 — 兜底链 + 打磨（后置，按 M2 后实测命中率决定）

- L4：AI vision 反推无配方图（标注"AI 推测"，过 prompt-guard +
  llm-output-validator）。
- remixOfId 追溯；/studio/lora 工作台详情页加同款网格；
  视觉基线更新 + mobile QA。

## 缺配方分层兜底（M1 起生效）

L1 同版本其它可还原来源图 → L2 社区图 withMeta=true →
L3 trainedWords/作者描述（已有）→ L4 AI vision 反推（M5）。

## 边界

- 还原目标 = 同角色+同服装+同构图风格，**不承诺逐像素**（底模差异）。
- promptText 永远英文；本任务不动 prisma/credit/auth。
- 与长视频线的衔接：LoRA 深度只建在 Studio image，画布走素材交接复用。

## Source of Truth

- `src/services/civitai-lora.service.ts`
- `src/lib/lora-source-match-prompt.ts`
- `src/lib/civitai-image-prompt-mine.ts`
- `src/types/index.ts`（AdvancedParamsSchema 行 ~145）
- `docs/design/lora-tag-system.md`、`docs/design/lora-prompt-assistant.md`
