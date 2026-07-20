# LoRA 检索与组合重设计 · 调查简报（2026-07-16）

> **性质**：顶层调查产出（Opus 4.8 调查段）。**交接**：设计线 → Fable 出施工图；工程线 → Sonnet 直接执行（不必过设计）。
> **范围**：`/studio/lora` 的检索（库）+ 生成页 LoRA 组合 + civitai/HF 双源对齐。
> **owner 需求来源**：`docs/references/project-map.md` LoRA 分支。
> **相邻文档**：`lora-search-image-audit-2026-07.md`（3 个搜索 bug，未执行，见 §2）；`2026-07-02-lora-domain-ui-review.md`（LoRA 域 UI 施工图，别重审）。

---

> ⚠ **2026-07-17 更正（重要）**：本简报原判 audit 3 bug「未执行」是**误判**（我照 audit 文档没回写"已完成"就推断，没核实 git）。实际 **Issue A/B/C 已在 commit `0d261217`（2026-07-11「fix(lora): unblock recipe mining…」）修复并在 main**；Sonnet 2026-07-17 逐条复核代码 + 全量 tsc/vitest 双绿确认。**下文 §2 / §4-G5 / §5 工程线①/ §6 里"未执行 / 先落 audit"的表述全部作废**——工程线只剩 §5-G6 的**性能优化**（over-fetch 根治 / 懒加载 / 虚拟滚动）真待做。

## 0 · owner 想要什么（原话拆解）

1. 参考 **novelai** 升级 lora 生成页面
2. 按类型检索：**人物 lora / 衣服 lora / 表情 lora** 等
3. 生成时 **自由搭配组合** lora
4. **civitai / HF 两边 UI 对齐**
5. 检索性能：**图片加载速度 / 检索精确度 / 缩短检索时间**

> 拆解后是三条独立主线：**A 检索重设计（库）**、**B 组合体验（生成页）**、**C 检索性能（工程）**。下面现状与方案都按这三条组织。

---

## 1 · 现状核实（带代码位置，2026-07-16 核实）

### A 检索（库）— `LoraWorkbench.tsx` + `useCivitaiLoraLibrary`

- 库默认 section = `COMMUNITY`；四 section = GENERATE / MINE / TRAIN / COMMUNITY（`constants/lora.ts`）。
- Civitai 侧：baseModel **家族分桶**（Illustrious/Flux.1 D/SDXL/Pony/SD1.5/Anima/Qwen/Z-Image/Chroma/other），12/页，排序 3 种，NSFW 三态，带搜索历史（`civitai-search-history.ts`）。
- **只有 baseModel（底模架构）这一个筛选维度，没有"内容类型"维度**——用户要的"人物/衣服/表情"是内容语义分类，现状**完全没有**。这是 A 线的核心缺口。

### B 组合（生成页）— `useActiveLoraStack` + `merge-stack-loras.ts`

- 多 LoRA 混挂**已有**：`useActiveLoraStack`（上限 `LORA_STACK_MAX`）+ `merge-stack-loras` + 配方面板（`lora-recipe-workflow`）。
- 缺的不是"能不能挂多个"，而是**组合体验**：没有兼容度提示、没有推荐搭配、没有 tag 级的可视化组合。这是 B 线重点。

### 双源对齐 — 两套 UI 是根因

- Civitai 库：**内联**在 `LoraWorkbench.tsx` 里渲染（`useCivitaiLoraLibrary`）。
- HuggingFace 库：**独立组件** `HuggingFaceLoraLibrary.tsx`（`use-huggingface-lora-library`）。
- 两者 family 值域不同（civitai `'Illustrious'`/`'Flux.1 D'` 大写有空格；HF `'illustrious'`/`'flux'` 小写）、分页机制不同（civitai offset/cursor 双后端；HF 纯 cursor）、卡片/筛选各写各的。**"对齐"= 收敛成一套库外壳，源变成一个筛选维度。**

### C 性能 — 现状与已知瓶颈

- **检索耗时**：Civitai 的 `baseModels` 过滤参数有 coverage bug（传 `Illustrious` 漏 80%，实测 30→4），所以现状**不下推 baseModel，改 over-fetch + 客户端 family 分桶**（`constants/lora.ts` L213-216）。over-fetch 本身是慢因。
- **图片加载**：封面并发直连 civitai 触发限流→全黑，已修（`proxyCivitaiImageUrl` + Cloudflare Worker `img.anteisuba.com`，commit `2f99de2d`/`c8794d09`）。但**没有**缩略图尺寸协商/懒加载/虚拟滚动优化。
- **翻页稳定性**：meilisearch(offset) 与 REST(cursor) 双后端，503 回落时范式冲突→重复页（见 §2 Issue C）。

---

## 2 · 与已有 audit 的关系（先修地基）

`lora-search-image-audit-2026-07.md`（2026-07-11）已定位 3 个搜索**正确性 bug**，**方案已写、但还没执行**：

| Issue | 问题                                                         | 关系到 owner 的哪条 |
| ----- | ------------------------------------------------------------ | ------------------- |
| A     | 搜索命中的 LoRA 配方图恒空（fileHash null 硬依赖）           | 检索精确度/可用性   |
| B     | NSFW 档每页稀疏 / safe 档没真过滤（nsfw 没下推 meilisearch） | 检索精确度          |
| C     | 翻页偶发重复页（双后端范式冲突 + 503 回落）                  | 检索稳定性          |

**判断**：这 3 个是检索**正确性地基**，属工程线，应**先于或并入**重设计执行。重设计（换筛选维度/双源合并）会重写检索链路，正好一起把这 3 个 bug 收掉，避免在旧 bug 上叠新 UI。

---

## 3 · 外部参考拆解

### NovelAI —— 参考的是"组合体验"，不是 lora 库

⚠ **澄清**：NovelAI 没有 LoRA 库（它是自有模型 + danbooru tag 体系）。所以"参考 novelai"落到 **B 线（生成页 prompt + LoRA 组合区）**，不是 A 线（库）。可借鉴模式：

- **tag 熟悉度圆点**：每个 tag 建议旁一个圆点，不透明度=模型对该 tag 的熟悉度。→ 翻译到 LoRA：可视化"这个 LoRA 与当前底模兼不兼容/权重建议"。
- **实时 tag 补全**：输入即联想 danbooru tag（含最新 artist/character）。→ 我们**已有** danbooru 词库 + prompt-tag 引擎（`prompt-tags.danbooru.generated.ts`），基础在，缺的是生成页的补全 UI。
- **权重语法可视**：`{}`加强 `[]`减弱 + hotkey 调权重。→ LoRA scale/权重的可视化微调。
- **Context bar / 多角色一等**：prompt 空间指示、多角色分区。

### Civitai —— 内容分类能力（A 线技术地基）

- Civitai **有**内容分类：Character（识别脸/表情/发型）、Clothing（26k+ 个）、Poses（6k+ 个）、Style、Concept；`civitai.com/tag/{poses,clothing,...}` 真实存在。
- meilisearch `multi-search` **可 filter `tags.name` 与 `category.name`**（audit 已证 `tags.name` 在可 filter 属性里）。→ **"人物/衣服/表情"检索技术可行**：下推 `tags.name IN (character/clothing/expressions/...)`。
- ⚠ **风险**：civitai 社区 tag 质量参差（官方 discussion #499 "search is near useless, people don't tag"）。纯靠社区 tag 会漏。**方案要有兜底**（tag + 名称词表 + 我们自建映射）。

### 我们已有的地基（别重造）

- danbooru 词库 + prompt-tag 引擎（80% 已有，memory `lora-nsfw-tag-library`）。
- 多 LoRA stack + 配方面板 + 兼容性判断（`lora-model-compatibility.ts` `isLoraBaseModelMountCompatible`）。

---

## 4 · 缺口清单（要新建的）

| #   | 缺口                                                    | 线            |
| --- | ------------------------------------------------------- | ------------- |
| G1  | 库缺"内容类型"筛选维度（人物/服装/表情/姿势/风格/概念） | A · 设计+工程 |
| G2  | civitai/HF 两套库 UI，未收敛成统一外壳                  | A · 设计+工程 |
| G3  | LoRA 组合缺体验层（兼容度提示/推荐搭配/tag 化组合）     | B · 设计      |
| G4  | 生成页缺 tag 补全 UI（引擎已有，UI 没接）               | B · 设计+工程 |
| G5  | audit 3 bug（配方/nsfw/翻页）未执行                     | C · 工程      |
| G6  | 检索耗时（over-fetch）+ 图片加载（无懒加载/虚拟滚动）   | C · 工程      |

---

## 5 · 方案空间

### 设计线 → 交 Fable（产出施工图）

1. **统一库外壳（G2）**：一套库 UI = 顶部搜索 + 两组筛选维度（① 内容类型 ② 底模家族）+ 源切换（civitai/HF 作为一个 filter，不是两套页）+ 统一卡片 + 统一分页。参考 `2026-07-02-lora-domain-ui-review.md` 的布局 B。
2. **按类型检索 UI（G1）**：内容类型作为一等筛选 chip 行（人物/服装/表情/姿势/风格/概念）。设计要处理"tag 不规范→结果稀疏"的空态与兜底提示。
3. **LoRA 组合区（G3+G4）**：生成页参考 NovelAI——LoRA stack 可视化（每个 LoRA 显兼容度圆点 + 权重滑杆 + trigger 词）+ danbooru tag 补全 + 推荐搭配。这是"自由组合"的体验落点。
4. **双源卡片语言统一**：civitai/HF 卡片同一套元数据边（名称/底模/类型/来源角标/NSFW 态），源差异只在角标。

### 工程线 → 交 Sonnet（不必过设计）

1. **先落 audit 3 bug（G5）**：配方 fileHash 可选化、nsfw 下推 meilisearch、双后端分页锁定。方案 audit 里已写全。
2. **内容类型 filter 下推（G1 工程侧）**：meilisearch `tags.name` filter + 名称词表兜底 + 自建 category 映射；HF 侧用 Hub tag。
3. **检索性能（G6）**：评估 baseModels coverage bug 根治（减少 over-fetch）；图片缩略图尺寸协商 + 懒加载 + 长列表虚拟滚动 + 预取下一页。

---

## 6 · 交接边界

- **当前业务收口输入**：本文档 §3（参考模式）+ §4（缺口）+ §5 工程/功能线；已确认施工契约落 `docs/references/pages/lora-workbench.md`。2026-07-19 起，本文不再授权继续扩展旧视觉皮肤；LoRA 业务完成后的视觉改版必须重新读 `brand-dna.md` / `scenes/ui-page.md` 并提出三个结构方向。别重造已有的多挂/配方/词库引擎。
- **给 Sonnet 的输入**：§5 工程线 + §2 audit 文档；工程线可与设计线并行（先修 bug 地基不阻塞设计）。收尾全量 tsc + vitest 双绿，别提交等 owner。
- **建议顺序**：C 工程线的 audit 3 bug 可**立即并行开工**（不依赖设计）；A/B 待 Fable 施工图定稿再进 Sonnet。

---

## Source of Truth

- 代码：`constants/lora.ts` · `LoraWorkbench.tsx` · `HuggingFaceLoraLibrary.tsx` · `useCivitaiLoraLibrary` / `use-huggingface-lora-library` / `use-active-lora-stack` · `civitai-lora.service.ts` / `huggingface-lora.service.ts`。
- 外部：Civitai developer API + meilisearch `search-new.civitai.com/multi-search`（内容分类/tag filter）；NovelAI 图像生成文档（tag 补全/熟悉度/权重语法）。
- 相邻文档：`lora-search-image-audit-2026-07.md` · `2026-07-02-lora-domain-ui-review.md`。

## Last Verified

- Date: 2026-07-16 · Method: 核实 `constants/lora.ts` / `LoraWorkbench.tsx` imports / audit 文档；联网核 NovelAI UX 模式 + Civitai 内容分类/tag filter 能力。未改产品代码。
