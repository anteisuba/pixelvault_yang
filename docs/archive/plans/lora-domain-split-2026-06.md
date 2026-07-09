# LoRA 独立域重构 — 任务包（2026-06-27）

> 状态：**设计讨论中（未落地）**。本文沉淀三轮设计讨论的结论，作为后续实现的唯一事实源。
> 讨论方式：一页一页出线框 + 确认 + 回写本文。实现是另一阶段（见 §12）。
> 关联：[[lora-recipe-workflow]]、[[comfy-runner-recipe-clone]]、[[project-lora-nsfw-tag-library]]、`docs/design/direction.md`。

---

## 0. 一句话目标

把 **LoRA 生成从 Image Studio 拆出去，收进独立的 `/studio/lora` 域**；该域含三模块 **生成 / 训练 / 库（公开｜我的）**；Image Studio 彻底不知道 LoRA 存在。两边共享同一执行引擎与结果层，用 `sourceSurface` 区分入口。

---

## 1. 核心架构原则

### 1.1 拆 surface，不拆 engine（最易做错的一步）

"把生成从 image 拆出去" **≠** 给 LoRA 单独造一套生成引擎。

- **拆**：入口 / 状态 / 参数构造 / UI。
- **共享**：执行引擎（`submitImageGeneration → Worker → provider/runner → R2 → Generation`）+ 结果层。

当前耦合点（需解开）：

- `advancedParams.loras[]` 是共享 `AdvancedParamsSchema` 上的字段 —— **保留**（执行契约需要），但 Image Studio UI 不再填充/暴露。
- `mergeStackLoras()` 被塞在 `src/hooks/use-unified-generate.ts`（Image Studio 编排器）—— LoRA 路径不再调，移到 LoRA 生成 surface 的请求构造。
- `LoraStackProvider`（`src/app/[locale]/(main)/studio/layout.tsx`）包住了 image/video/audio —— 下移到只包 `/studio/lora`。

### 1.2 统一资产结果层

LoRA 生成与 Image 生成的产物**都是 `Generation(outputType=IMAGE)`，都落「素材」库**（`/assets`）。生成台只保留"最近出图"条，长期资产在素材浏览。入口/参数/血缘用 `sourceSurface` 区分。

---

## 2. 数据模型变更

### 2.1 Generation 加血缘

```prisma
model Generation {
  // ...现有字段
  sourceSurface  GenerationSourceSurface  @default(IMAGE_STUDIO)  // 顶层枚举列，素材/画廊可直接筛
  loraLineage    Json?    // 用了哪些 loraAssetId / scale / recipe 来源（变长，不索引）
}
enum GenerationSourceSurface { IMAGE_STUDIO  LORA_WORKBENCH  CANVAS  EDIT }
```

- 用**顶层枚举列**而非塞进 `snapshot` Json：以后要按来源筛素材、统计 LoRA 域产出、做 LoRA 详情页"同款 grid"，都需要可查询列。
- 存量数据一律默认 `IMAGE_STUDIO`，**不回填**（推断不可靠、无业务价值）。

### 2.2 底模目录（LoRA 域专属，包一层、不重复造）

不新建与 `AI_MODELS` 平行的模型定义；新建一个 LoRA 域组织视图，引用已有 `AI_MODELS`（hosted）与 `RUNNER_CHECKPOINTS`（runner，见 comfy-runner 任务包），补 family/fidelity/兼容元数据：

```ts
interface LoraBaseModel {
  id: string // 'wai-illustrious-v16-runner'
  displayName: string
  family: 'flux' | 'sdxl' | 'illustrious' | 'pony'
  backend: 'hosted' | 'runner'
  providerModelId?: string // hosted → 复用 AI_MODELS
  runnerCheckpointId?: string // runner → 复用 RUNNER_CHECKPOINTS
  fidelity: 'fast' | 'faithful'
  available: boolean
  recommendedFor?: string[]
}
```

复用 `src/lib/lora-model-compatibility.ts` + `LoraAsset.baseModelFamily`，形式化成 `getCompatibleBases(loraFamily)`。

---

## 3. 底模问题 → "可选模型"（已确认方向）

### 3.1 问题根因

LoRA 是"针对某个底模的增量"。当前 LoRA 挂在 Image Studio 通用模型选择器上，能选的底模被锁在 FLUX 那几个 hosted endpoint；而用户真正要用的 LoRA 几乎全是 **Illustrious / SDXL / Pony / SD1.5**（非 FLUX），hosted 帮不上、硬套就是漂移或报 `layer ... not supported`。**结论：只有走 runner（自托管 ComfyUI）才能任意选底模。**

### 3.2 解法：被 LoRA 约束的扁平底模选择器

- 底模 = LoRA 的"插槽属性"，不是全局设置。
- 选了 LoRA（决定 family）→ 底模选择器自动过滤到兼容项 → 每个 `底模×后端` 组合是一个**扁平可选条目**，带三标签：**家族 · 后端（hosted 快 / runner 忠实）· 可用性**。
- 这把"hosted vs runner"从硬编码决策变成用户当场可选的 fidelity 权衡 = 你要的"冲突点做成可选模型"。
- 多 LoRA stack 必须同家族（否则拦/警告）。
- recipe 还原时按 `CivitaiImageRecipe.baseModel` 自动预选匹配底模。

---

## 4. 信息架构（IA）

### 4.1 三模块 + 常驻脊柱（壳子范式 A，已确认）

```
/studio/lora（暗房工作台，深色面）
├─ 生成 (Generate)   ← 新一等 surface（从 Image Studio 搬出 + 升级）
├─ 训练 (Train)      ← 已有，沿用为主
└─ 库 (Library)
    ├─ 公开 (Public)  ← Civitai + 平台精选（动作：收藏→我的）
    └─ 我的 (Mine)    ← 已收藏 + 已训练 + 最近用（动作：去生成）
```

- 顶层三 tab（生成 / 库 / 训练）。当前线上是 `库/训练/我的`：**「我的」降一级折进「库」**，顶层加「生成」。
- **常驻「当前 LoRA / 底模」脊柱条**：跨模块可见，选过的 LoRA 一直跟随 → 解决"我的"降级后的高频可达，也是"发现→生成"零距离的连接组织（对应 Scenario 的 train-then-use）。
- 范式 B（左右两区浏览器+工作台）暂不采用：全局已有左 rail，再加一列在小屏挤、重建量大。库做大了再议。

### 4.2 与 Image Studio 的区别

- Image Studio = 垂直「画布在上 / dock 在下」、prompt-first 单工作台。
- LoRA 域 = 三种不同形状（浏览 / 表单向导 / 生成台）+ 脊柱条。视觉**继承** v1「暗房工坊」，差异在**布局与信息层级**，不是另搞一套视觉。

### 4.3 库模块（公开/我的）— 设计定稿（线框已出）

当前两痛点：① 空白太多（公开=稀疏列表+常驻详情吃 1/3+居中黑边；我的=少量卡下半屏全黑）② 信息太复杂（顶部 chrome 堆叠 + 详情面板塞满 + 把"生成"的活塞进库详情）。改法：

- **封面优先密集网格，统一公开/我的**：5–6 列、小间距、填满宽度。抛弃小缩略图稀疏列表。
- **详情=按需抽屉（不常驻）**（已确认）：点卡才滑出；内容=封面/预览图轮播 + 名字/家族 + 触发词(复制) + **推荐提示词（只读可复制）** + **去生成（主行动·反相 pill）** + 收藏。**交互式还原/自己搭配仍在「生成」**——库详情只负责"看够再决定"，不放交互式 recipe builder。
- **顶栏压成一行**：左 `公开|我的` 切换；右 搜索 + 家族 + 排序 + **分级（默认安全，opt-in 放开 s/q/e）**（已确认）。删掉"这里是筛选器"提示句（改 tooltip）。
- **卡片信息量**（已确认）：封面 + 名字 + 角标家族 + ♥ 浮层；作者等次要信息进抽屉。
- **空态/稀疏回填**（已确认）：用"推荐收藏"封面条回填，永不留黑屏。
  - 状态 A 完全空（没收藏没自训）：居中上手引导（去公开库收藏 / 训练第一个）+ "猜你想收藏"条。
  - 状态 B 稀疏（只有几个）：已有放上面 + "推荐你收藏"条填满，每张带 ♥。
- **公开 vs 我的**：公开=发现导向（家族/搜索/排序/分级 + ♥ 收藏）；我的=收藏导向（`收藏|自训` 切换，主行动"去生成"）。
- **删旧残留**：我的页副标题「添加到 prompt tags 后即可在 Studio 使用」是旧模型遗留，改成"挑一个 → 去生成"。
- **Civitai 合规 gating（调查定稿，见 §4.4）**：直接引用可行，但「用此 LoRA 生成」必须按单 LoRA `allowCommercialUse` 含 `Rent` 才放开；封面图保持 hotlink（ToS §9.2 有显示许可，**与 §6.7 的 tag 缩略图必须自生成相区分**）。

### 4.4 Civitai 合规 gating（调查定稿 2026-06-27）

公开库直接引用 Civitai **可行，但非无门槛 firehose**，必须按单 LoRA 授权 gate。数据已在库（`allowCommercialUse`/`allowDerivatives`），缺的是 UI enforcement + 几个 ToS 卫生修复。

- **封面图**：保持 hotlink Civitai CDN（现状 `rewriteCivitaiImageUrl`），**不要 re-host**。ToS §9.2 给每个 User 显示/复制许可 → 比 danbooru 抓图安全。**与 §6.7 区分**：LoRA 封面有授权可 hotlink；tag 缩略图无授权须自生成。
- **单 LoRA 授权 gate**：
  - `allowCommercialUse` 含 `Rent` → 放开「用此 LoRA 生成」；否则**禁用** + "创作者未授权第三方生成" + 去 Civitai（仍可复制触发词 / 收藏）。
  - 含 `Image` → 出图标"可商用"，否则"个人使用"。
  - `None` → 仅展示 + 外链。
  - `allowNoCredit===false` → "需署名"徽标 + 始终显示创作者名 + `modelPageUrl`。
  - 补存 `allowNoCredit` / `allowDifferentLicense`（`toLibraryItem` 现在丢弃）。
- **NSFW 硬门**：保持 `nsfw=false` / `nsfwLevel<=2`；**永远**硬排真人/POI/未成年（按 name/tag 过滤，不只 nsfwLevel）；真人内容不可商用化。CSAM / 肖像权红线。
- **归属 + takedown**：显示创作者 + 链接；发布认领/删除流程；存 `modelId`/`modelVersionId`/`creatorName` 备查。
- **ToS 卫生（实现期）**：弃用内部 `search-new.civitai.com` meilisearch key，全走文档 `/api/v1/*` + 服务端 API key bearer 提限额；下载 token 保持 per-user 加密可撤销，尽量 header 传 runner 而非 `?token=`（query 形式会泄进日志）。
- **关键文件**：`civitai-lora.service.ts`（补字段 + 弃 meilisearch key + 加 bearer）、`civitai-token.service.ts`（token 处理已稳妥）、`card-recipe-compiler.service.ts`（~477 行 gate 生成）、`types/index.ts` + `constants/lora.ts`（派生 `canRunOnPlatform`/`imagesCommercial`）。

### 4.5 动效与抽屉规范（全域统一，遵 v1 motion canon）

- **token**：`--ease-standard` = cubic-bezier(0.22,1,0.36,1)；时长 fast 120 / base 200 / slow 320 / reveal 500（仅展陈面）。全程 `prefers-reduced-motion` 降级。motion 只做状态澄清 / 连续性 / 反馈，不装饰。
- **详情抽屉（库）**：
  - Desktop = **右侧滑入浮层**，宽 ~360–400px，translateX(100%)→0 / 320ms / ease-standard；**网格不被推开、保持满宽**；背后 scrim 0→~42% / 200ms。关闭：点 scrim / Esc / X，反向；网格滚动位置不变。
  - Mobile = 底部 sheet（Vaul，复用现有 ResponsiveOverlay），上滑出现、可拖拽下滑关闭、snap 点。
  - 与项目既有 ResponsiveOverlay（Desktop Popover/Dialog ↔ Mobile Drawer）一致，不另造。
- **模块切换（生成/库/训练 tab）**：壳（tab + 脊柱条）不动，仅 body 交换；内容 crossfade + 轻位移 200ms。首次取数显示**骨架卡**（非 spinner）淡入。
- **卡片 hover**：120ms 轻抬升 / 描边。
- **出图 / 训练 loading**：结果区 / 任务行用骨架 shimmer，不空转 spinner。

---

## 5. 生成模块（recipe-first）

信息层级与 Image Studio **相反**：

- Image Studio = prompt-first（开局空 prompt 框）。
- LoRA 生成 = **源图/配方优先**：重力中心是"当前 LoRA + 它的源图配方网格"，prompt 是从配方推导、可二次编辑的结果。

布局（线框已出）：左栏 = 配方源图网格 + 模式 chip；右栏 = 结果 + 可编辑 prompt（含身份块锁）+ scale/seed + 出图。

模式（对接 [[lora-recipe-workflow]]）：

- **还原模式**：忠实还原（一键套源图配方，已落地 M2c）/ 半身 / 全身（替换构图块）。
- **精修模式**：去漂移（锁身份块）/ 风格强化（提 scale + style 块）/ 批量 A·B（多 scale/seed 对比）。

出图 → 落「素材」库（`Generation(sourceSurface=LORA_WORKBENCH)`）。

---

## 6. 提示词构建：推荐 / 自己搭配（本轮重点）

### 6.1 重大现状：引擎已有 ~80%

| 能力                                   | 现状                      | 文件                                                                          |
| -------------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| 标签类型体系（含 `prompt_preset`）     | ✅                        | `src/types/prompt-tags.ts`                                                    |
| 搜索+排序（别名/分类/热度）            | ✅                        | `src/lib/prompt-tag-search.ts`                                                |
| 编译（权重 `(tag:1.2)`/去重/负向合并） | ✅                        | `src/lib/prompt-tag-compiler.ts`                                              |
| 选中栈（持久化/权重/正负极）           | ✅                        | `src/hooks/use-prompt-tag-stack.tsx`                                          |
| 「补词」UI（按来源分组、搜索式）       | ✅                        | `prompt-tags/TagLibrary.tsx`                                                  |
| LoRA 触发/作者/挖掘词                  | ✅                        | `TagLibrary.tsx` + `LoraSourceRecipeStrip.tsx`                                |
| Danbooru 语料                          | ⚠️ **空壳**，脚本就绪未跑 | `prompt-tags.danbooru.generated.ts`、`scripts/import-danbooru-prompt-tags.ts` |
| 设计稿                                 | ✅                        | `docs/design/lora-tag-system.md`、`lora-prompt-assistant.md`                  |

### 6.2 二分映射（tab 切换，推荐默认 —— 已确认）

- **推荐 tab**＝recipe 驱动（主路、基本现成）：LoRA 触发词 + 作者推荐词 + 社区挖掘词 + 源图配方一键套用。重组进生成台即可。
- **自己搭配 tab**＝danbooru 词库魔导书（引擎现成，补语料 + 分类 UI + 酒馆式增强）。

### 6.3 从酒馆（SillyTavern）偷什么

留**数据模型 + 一键插入 + 可分享 JSON**；扔**运行时扫历史 / 布尔关键词 / 正则向量触发 / 三作用域**。

- 偷 1：**智能词条 = lorebook entry**（概念→一捆标签）。`prompt_preset` 类型已留位。
- 偷 2：**可分享词条包（JSON）** —— 后置（见 §9）。
- 偷 3：**一键 stamp 按钮 + booru 级自动补全**。
- 轻量增量：互斥组（一次一个机位/时间）、概率随机（变体 roll / wildcard）。

### 6.4 词库硬要点（决定像不像）

- **热度排序 + 分类颜色 + 别名**：采 `tagcomplete` CSV 格式（`name,type,postCount,"aliases"`）做 import/export，白嫖生态最新 dump。颜色按 danbooru 五类（general 蓝/artist 红/copyright 紫/character 绿/meta 橙）。
- **规范英文 + zh/ja 覆盖层**：英文入库（模型只认英文）、中日文显示；灌社区现成 `danbooru-10w-zh_cn.csv` 等，别自己翻 10 万。
- **质量预设按底模分叉**：Illustrious/NoobAI 用 `masterpiece, best quality, very aesthetic`；**Pony 用 `score_9, score_8_up`**，互不通用 —— 一键质量块读当前底模。
- **权重**默认 `(tag:1.2)`（SDXL/Illustrious/Pony 通用），NovelAI `{}` 后置。
- **NSFW = 一级 gated 分类**：danbooru 四级 rating（general/sensitive/questionable/explicit），全局阈值 + 黑名单 + 显式 opt-in。对应 [[project-lora-nsfw-tag-library]]。
- **wildcard 随机槽**（`__hair__` / `{a|b|c}`）= 变体引擎。

### 6.5 数据地基要动的（真正"最大增量"）

当前 `scripts/import-danbooru-prompt-tags.ts` 只收 general+meta、min post 5000、**排除 character/artist/copyright/NSFW** —— 收得太窄。要做：

1. **放开 import**（已确认）：纳入 character/artist/copyright，存 `tagcomplete` CSV 格式（含 postCount + aliases）。
2. **加 NSFW 一级分类**：按四级 rating 打标，默认锁，阈值 + 黑名单 + opt-in 解锁。
3. **zh/ja 覆盖层**：灌社区翻译 CSV。
4. **`TagLibrary` 改按"功能类"分组**（发型/眼睛/姿势…），不再按"来源"分组。

> 呼应 memory「最大增量 = 跑从没跑过的 import 脚本」：脚本就绪，改宽过滤条件、跑一遍，词库即从 14 条变几万条。

### 6.6 功能分类（Axis B，魔导书可点树）

质量 / 主体数量 / 角色·系列 / 体型 / 发型 / 眼睛 / 表情 / 服装 / 姿势动作 / 构图角度 / 背景场景 / 光照 / 风格画师 / **NSFW（gated）** / 负向预设。

### 6.7 缩略图与语料的版权红线（2026-06-27 调查结论）

- **tag 文本/别名/热度 = 安全**（事实信息不受版权保护）。优先用干净源：`qdlabs/danbooru-tags`(Apache-2.0) 或 BooruTagCart CSV(GPL 数据当数据用)；采 `tagcomplete` CSV 格式。
- **预览图 = 不能引用任何现成图集**：标签超市(wfjsw) 图零授权且代码 AGPL-3.0（传染性）；BooruTagCart/magic-tag 图同源；Danbooru API/ToS 不把图授权给你（DMCA-only）；HF/gwern 数据集图是批量抓取。**全部追溯到画师版权作品**。
- **唯一合法路 = 自家管线自生成**：固定中性 scaffold + 每 tag 一个 seed，隔离单 tag 效果；自托管 R2/CDN；默认只生成 SFW。MVP ~300–500 通用造型 tag（排除 artist/character/copyright），~1.5–2k 为天花板；成本可忽略（$1–20 量级）。schema 可借鉴标签超市（`images/<hash>.webp` + YAML），**但绝不拿它的图**。

---

## 7. Image Studio 清理清单

| 移除/改                   | 文件                      | 动作                                |
| ------------------------- | ------------------------- | ----------------------------------- |
| `LoraPromptControlButton` | `prompt-tags/`            | 逻辑搬到 LoRA 生成 surface          |
| `ActiveLoraBar`           | `studio-shared/chrome/`   | 从画布顶栏移除                      |
| `LoraStackProvider`       | `studio/layout.tsx`       | 下移到只包 `/studio/lora`           |
| `mergeStackLoras()` 调用  | `use-unified-generate.ts` | Image 路径不再调                    |
| `UseLoraButton`           | `image-card/`             | 改成跳 `/studio/lora`               |
| `advancedParams.loras`    | `AdvancedParamsSchema`    | 保留（执行契约），Image UI 不再暴露 |

---

## 8. 现有可复用资产（别重复造）

- LoRA 数据/训练/库：`LoraAsset`、`LoraTrainingJob`、`lora-training.service`、`civitai-lora.service`、`LoraWorkbench`。
- recipe：M2c 一键同款已落地（`LoraSourceRecipeStrip` + `civitai-recipe-to-generation`）。
- prompt-tag 引擎：见 §6.1（~80%）。
- runner 高保真：`comfy-runner-recipe-clone.md` 已设计好 `RUNNER` adapter + 安全红线（卡在 Phase 0 本地验证）。

---

## 9. 待拍板 / 后置项

| 项                               | 是什么                       | 建议                                                                                                                                                                       | 状态      |
| -------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| per-tag 缩略图                   | 每个标签配小样图，"看图选词" | **采纳（自生成）**：无开源图可引用（全是抓取的画师版权图 + AGPL 陷阱，见 §6.7），唯一合法路=用自家管线生成；MVP ~300–500 通用造型 tag，成本 ~$1–4 可忽略，~1.5–2k 是天花板 | v1 做 MVP |
| 词条分享包（import/export JSON） | 词条导出/导入、社区风格包    | 第一期只做本地个人词条；分享包后置                                                                                                                                         | 后置      |
| 角色卡绑定 LoRA                  | 卡上挂 `loras[]` 时生成走哪  | 角色卡尚未深入开发，暂搁置                                                                                                                                                 | 搁置      |
| 用户公开自己的 LoRA              | 公开库的"用户公开"流程       | 第一期公开库= 平台精选 + Civitai；用户公开后置                                                                                                                             | 后置      |

---

## 10. direction.md 必须同步修改

`docs/design/direction.md`（v1 已确认）现写明"LoRA workbench 不负责生成，生成在 Studio"。本重构**反转**此结论：**LoRA 域从此拥有生成，Image Studio 彻底清 LoRA**。落地时同步改 direction.md 对应段，不留两套说法。（owner 已确认反转。）

---

## 11. 决策记录（round-by-round）

1. 拆分方向、统一资产层判断 → 认同。
2. 底模问题 = 底模不可选、不挂家族；社区 anime LoRA 无匹配底模 → 确认；只能走 runner。
3. "冲突点做成可选模型" → 底模×后端 扁平选择器。
4. 壳子范式 → A（三 tab + 常驻脊柱）。
5. 生成图归属 → 落「素材」库。
6. 提示词 → 推荐/自己搭配 tab 切换、推荐默认；自己搭配需"酒馆式"词库。
7. 词库语料 → 放开（含 character/artist/copyright + NSFW gated）。
8. direction.md 反转 → 认同。

---

## 12. 落地顺序（设计阶段 → 实现阶段）

### 设计阶段（当前，一页一线框 + 确认 + 回写本文）

- [x] 生成：壳子 + 提示词构建（线框已出）。
- [ ] 库（公开/我的 + 详情面板"用此 LoRA 生成"出口 + NSFW 筛选）。
- [ ] 训练（向导沿用为主，改动最小）。

### 实现阶段（设计锁定后，分档，每档独立可验）

1. 数据 + 拆耦合：`sourceSurface` 列；摘除 Image Studio 的 `LoraStackProvider`/`mergeStackLoras`/LoRA UI；Image 出图标 `IMAGE_STUDIO`。
2. 词库地基：放开并跑 `import-danbooru-prompt-tags`；NSFW 分级；zh 覆盖；`TagLibrary` 改按功能分组。
3. 生成 surface（hosted/FLUX 先通）+ 提示词 推荐/自己搭配 + 底模扁平选择器。
4. 库重组（公开/我的 + 出口闭环）。
5. 训练对齐新壳。
6. runner 高保真（Phase 0 本地验证 → 接 `RUNNER` 第二引擎）。

> 实现阶段走项目 UI 确认阶梯：`npm run lint && npm run build` → 视觉回归 `e2e/visual.spec.ts` → token/a11y/响应式断言 → 交互验证。一次一个组件，必要时先出 Figma。
