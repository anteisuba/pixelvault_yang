# LoRA 域施工图 — lora-workbench.md「检索与组合」

> 状态：**v1.1（2026-07-17，Fable）**，§11 拍板项当日已过 owner（4/5 拍板，见 §11 记录），可交 Sonnet 按 §10 切片执行；唯一遗留 = 第 7 类「场景」待点头（不阻塞其他切片）。
> 页面：`/studio/lora`（库 COMMUNITY section + 生成 GENERATE section）。
> 稳定业务域与未来设计边界：[`../domains/lora.md`](../domains/lora.md)。本文不替代域契约，只记录当前施工与回归事实。owner 已确认的未来页面方向分别见 [`lora-library.md`](lora-library.md) 与 [`lora-generate.md`](lora-generate.md)。
> 设计权力限定（2026-07-19）：本文只负责当前 LoRA 检索、双源、组合和生成业务收口。文中 v1 暗房工作台、灰阶、徽标、反相 CTA、pill 或其他外观描述只用于当前代码回归，**不得成为新视觉依据，也不得传播到其他域**。未来实现必须按对应 page 文档范围执行，未覆盖状态继续走 `docs/scenes/ui-page.md` 的逐项确认门。
> 上游简报：`docs/plans/lora-search-redesign-2026-07.md`（§4 缺口 G1–G4 → 本文 §2–§5）。

> ⚠ **owner 复核调整（2026-07-17，本块优先级最高，覆盖文中对应表述）**：
>
> 1. **G2 双源不合成单壳** → 改「**保留 civitai/HF 两 tab，只对齐视觉**」：两 tab 各自保留（含各自的 NSFW/排序/配方差异，**不强行隐藏**），但 tab 内复用统一的 `LoraLibraryCard` / `LoraLibraryInspector` / 控件行形制 / family slug（§2.2–2.4 作为「对齐」手段**全部保留**）。**§2.1「LoraLibraryShell 单壳 + 源 segmented 切换」作废**；§2.5 `source` 参数含义 = tab 切换；**§10 切片 S1 的「HF 收编进单壳」改「两 tab 各自保留、内部换统一组件」**。
> 2. **G3 兼容圆点给信号** → 改「**兼容也给淡信号**」：兼容 = 淡绿/中性点，不兼容 = 琥珀点。**§4.1「安静默认·兼容不渲染」作废**。
> 3. **G1 第7类「场景」确认加**（共 7 类）；「表情」供给实测不足才首发隐藏（沿用）。
> 4. 触发词 chips 化（§4.3）/ inline 补全写正文（§5·拍板④）**保持不变**。

## 0. 范围与不做什么

**做**（简报设计线四缺口）：

| 缺口            | 本文章节 | 一句话                                                            |
| --------------- | -------- | ----------------------------------------------------------------- |
| G2 双源统一     | §2       | civitai/HF 收敛成一套库外壳，源变成一个筛选维度                   |
| G1 内容类型筛选 | §3       | 人物/服装/表情/姿势/风格/概念 一等 chip 行 + 三重兜底 + 稀疏/空态 |
| G3 组合体验     | §4       | 兼容度圆点 + 「常与它同挂」推荐行 + 触发词 chips 化               |
| G4 tag 补全 UI  | §5       | 提示词纸 inline danbooru 补全（引擎已有，只补 UI）                |

**不做**（明确排除，防scope漂移）：

- 检索性能（over-fetch 根治 / 懒加载 / 虚拟滚动）与 audit 3 bug —— 工程线（简报 §5 工程线 G5/G6），Sonnet 直接执行，不过设计。
- 「我的」库（MINE section）的类型筛选 —— `LoraAssetRecord.type` 已有 subject/style 字段，但供给少、优先级低，列 v2。
- 组合配方的保存/分享 —— 与 `/prompts` 共享库主线（Recipe.visibility）合流，另立任务。
- 魔导书完整版（色点/热度/缩略图/托盘增强）—— 维持评审 P1-8 的独立任务定位；本文 §5 的 inline 补全是它的**输入流**兄弟件，不替代面板。
- 全局字体/材质切换、任何新颜料。

**别重造清单**（改动必须复用，grep 过 exports）：
`LoraCoverTile`（封面瓦）· `CivitaiLoraInspector`（抽屉基底）· `LoraScaleChip` / `LoraAspectRatioChip` / `LoraReferenceImageChip` · `useActiveLoraStack` / `LoraStackProvider` · `useCivitaiMinedPrompts`（推荐搭配数据源）· `searchPromptTags` + `usePromptTagStack` + `PromptTagTray`（danbooru 引擎三件套）· `isLoraBaseModelMountCompatible`（兼容判定）· `civitai-search-history.ts` · `QuickSetupDialog` · ResponsiveOverlay 家族（桌面 Popover ↔ 手机 Drawer，见 `references/frontend.md` 强约定矩阵）。

## 1. 现状 → 缺口对照（2026-07-17 代码核实）

| 面         | 现状（文件锚点）                                                                                                                                      | 缺口                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 源切换     | `CommunitySourceBranch`（LoraWorkbench.tsx:2737）Tabs 套两个**完全独立**的组件                                                                        | 两套控件行/卡片/分页/值域                        |
| Civitai 库 | `CivitaiCommunityBranch`（:2793）：搜索+历史、`BaseModelChipRow` 家族 chips、排序 Select、NSFW 三态 chip、URL 深链（family/q/sort/nsfw）、12/页、抽屉 | 无内容类型维度                                   |
| HF 库      | `HuggingFaceLoraLibrary.tsx`：自带面板壳+搜索+family 横滚 chips（小写值域）+卡内 file Select+import 按钮                                              | 无排序/NSFW/深链/抽屉；卡片语言另一套            |
| 组合       | `LoraSpineBar`（:1939）：LoRA chips + scale popover + ●●○○○ 余量 + 底模 Select                                                                        | 无兼容度显示、无推荐搭配、触发词是裸文本 prefill |
| 词库       | `LoraTagPicker`（:1768，面板式）+ danbooru 5.4 万行定义 + `searchPromptTags` 评分引擎 + tray                                                          | 输入流（textarea 内联想）没有 UI                 |

## 2. 库 · 统一外壳（G2）

### 2.1 信息架构

外壳收敛为单一 `LoraLibraryShell`：**一套**控件行 + 网格 + 分页 + 详情抽屉；源（civitai/HF）降级为控件行里的一个 segmented 切换，数据经各自 hook 出来后走**同一个**渲染管线。

```
┌─ 控件行（三行，去盒化：不再套 rounded-2xl 面板，顶部发丝线分区）─────────┐
│ 行1  [🔍 搜索（历史下拉）………………]  [Civitai|HuggingFace]  [排序 v]  [NSFW]  [↻] │
│ 行2  类型  全部 人物 服装 表情 姿势 风格 概念                                   │
│ 行3  底模  全部 Illustrious Flux SDXL Pony SD1.5 Anima Qwen Z-Image Chroma 其他 │
├─ 网格（12/页，统一卡片，骨架规范照旧）────────────────────────────┤
│ [卡][卡][卡][卡][卡][卡] …                                                    │
├─ 分页（复用 CommunityPagination）─────────────────────────────────┤
└──────────────────────────────────────────────────┘
```

- **行首标**：行 2/3 各带 uppercase `text-2xs` muted 行首标（「类型」「底模」），与生成页脊柱条「当前 LoRA / 底模」同一语言——用户第一次看就能分清两组维度是正交的。
- **chip 形制统一**：行 2/3 的 chips 统一 `h-8`（32px，fine pointer 紧凑档达标，顺带收掉评审 P1-9 的 22px 触达欠账）；选中态沿用现状 `border-primary/40 bg-primary/10 text-primary`；触屏断点升 44px 命中区（视觉不变、扩 hit area）。
- **NSFW chip 仅 civitai 源渲染**（HF Hub 无分级数据，不支持不渲染）；切到 HF 时 nsfw 状态保留在 URL、UI 隐藏，切回恢复。
- **排序全源可用**：civitai 现状三值不动；HF 侧映射 推荐→`trendingScore`、最多下载→`downloads`、最新→`lastModified`（**S1 工程实测，2026-07-17**：HF Hub `/api/models` 不接受 `sort=trending`——返回 400 `Invalid sort parameter`；真实的推荐排序参数是 `trendingScore`。`downloads`/`lastModified`/`trendingScore` 三值均实测可用，且能与 `filter`/`search` 组合，**无需「不支持不渲染」回落**。默认沿用服务端此前硬编码的 `downloads`，不改变现状默认排序。详见 `src/constants/lora.ts` `HUGGINGFACE_LORA_SORT_OPTIONS`）。
- **源切换即筛选**：切源保留 q/type/family（值域见 2.2），重置分页；某源不支持的 family（如 HF 无 Chroma）chip 在该源下隐藏，若当前选中值随之失效 → 静默回落 `all` 并同步 URL。
- 移动端：三行控件自然换行；行 2/3 横滚（现状 HF family 行已是横滚，沿用）。

### 2.2 family 值域规范化（双源对齐的根）

UI 层统一用**小写 slug 枚举** `LORA_LIBRARY_FAMILY_VALUES`（新常量，`src/constants/lora.ts`）：

```
all · illustrious · flux · sdxl · pony · sd15 · anima · qwen · z-image · chroma · other
```

- 每源一个纯映射函数（constants 层）：civitai `'Illustrious'`/`'Flux.1 D'`/… ↔ slug；HF `'anima-dit'`→`anima`、`'qwen-image'`→`qwen`、其余同名。**现有 `CIVITAI_LORA_BASE_MODEL_VALUES` / `HUGGINGFACE_LORA_FAMILY_VALUES` 保留为各源 API 层值域**，只在 UI/URL 边界做翻译——不动 service 契约，向后兼容。
- URL `family=` 改存 slug；**旧深链兼容**：解析时大小写不敏感 + 空格/点容错（`Illustrious`→`illustrious`、`Flux.1 D`→`flux`），未知值按 `all`（沿用 P1-5「非法值静默按默认」约定）。
- 展示 label 走 i18n（现状两套 label key 合并为一套 `familyLabel.*`）。

### 2.3 统一卡片 `LoraLibraryCard`

基底 = `LoraCoverTile`（已共享），双源同一张卡：

| 区       | 规格                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------- |
| 封面     | LoraCoverTile 现状（450 档 transform、blur-up 骨架、黑纱徽标）                                        |
| 左上角标 | 家族名黑纱 `bg-black/55` 白字；外源/受限家族仅追加外链 icon（评审 P2-1 规范不变）                     |
| 右上     | civitai：收藏心；HF：收藏心（语义统一，见 2.4）                                                       |
| 名称行   | 名称 truncate + **源角标**（`CIV` / `HF` 双字母 `text-3xs` 描边小标，title 带全名）——源差异只在这一处 |
| 元数据行 | ↓下载数 · ♥ 点赞数（两源都有此二值）                                                                  |

- HF 卡现状的 file Select、trigger 行、import 按钮**全部移出卡面**进抽屉（2.4）——卡片只负责「认出它」，动作进抽屉，与 civitai 卡行为对齐（点卡=开抽屉）。
- 「我的」页卡片统一（评审 P2-3/B8）不在本次范围，但 `LoraLibraryCard` 落地后 B8 的收敛目标改指向它（一次抽象两处受益）。

### 2.4 统一详情抽屉 `LoraLibraryInspector`

以 `CivitaiLoraInspector` 为基底抽象，双源消费；区块按「有数据才渲染」装配：

| 区块                         | civitai                                               | HF                                                                                       |
| ---------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 封面大图（骨架）/名称/作者   | ✓                                                     | ✓（作者=repo owner）                                                                     |
| 家族徽标 + 授权              | 授权徽标行（P0-2 规范）                               | license 单值文字行                                                                       |
| 触发词（含「无需触发词」态） | ✓                                                     | ✓（`triggerWord`，无则如实显示）                                                         |
| 试用提示词 + 带词去生成      | ✓（D7⑤ 现状）                                         | 无数据不渲染                                                                             |
| 来源图/配方（mined）         | ✓                                                     | 不渲染                                                                                   |
| **文件选择**                 | 不渲染（版本解析在 service）                          | 多 `.safetensors` 时 Select（从卡面迁入）                                                |
| 动作区                       | 主=去生成 · 次=收藏 · 末=打开来源（评审 §4 修订不变） | 同一套：主=去生成（家族可生成时）· 次=**收藏**（=现 import 语义，见下）· 末=打开 HF repo |

- **动作语义统一**：HF 的「导入」与 civitai 的「收藏」后端都是落 `LoraAssetRecord` 进「我的」，UI 文案统一为「收藏」（i18n 复用现有 favorite 系文案）；HF 需先选文件再收藏时，未选状态主按钮引导选择（失败大声暴露，不静默选第一个——多文件 repo 文件差异=不同底模家族，选错会挂错桶）。【拍板项 ②】
- 外源/不可生成家族：沿用 D5 现状（「在 Civitai 生成」/「打开 HF repo」为主按钮 + 琥珀说明条）。
- 手机端：抽屉沿用现状 Vaul Drawer 分支。

### 2.5 URL 深链扩展

在 P1-5 方案 A 基础上追加两个参数，约定不变（默认值不入 URL、未知值静默按默认、`router.replace`）：

| 参数                  | 值域                      | 默认                  |
| --------------------- | ------------------------- | --------------------- |
| `source`              | `civitai` / `huggingface` | `civitai`（不入 URL） |
| `type`                | §3 类型 slug              | `all`（不入 URL）     |
| `family`              | §2.2 slug（旧值兼容解析） | `all`                 |
| `q` / `sort` / `nsfw` | 现状                      | 现状                  |

验收基线：粘贴 `?section=community&source=huggingface&type=character&family=anima&q=girl` 直达即筛即现。

## 3. 库 · 内容类型筛选（G1）

### 3.1 类型集合与常量表

新常量 `LORA_CONTENT_TYPES`（`src/constants/lora.ts`），**数据驱动 chip 行**——增删类型只改表：

| id           | zh label | civitaiTags（L1 下推，剔除后）  | civitai estimatedTotalHits（2026-07-17 实测） | HF 供给近似（`filter=lora&search=<关键词>`）     | nameKeywords（L2）                       | searchFallbackTerm |
| ------------ | -------- | ------------------------------- | --------------------------------------------- | ------------------------------------------------ | ---------------------------------------- | ------------------ |
| `character`  | 人物     | `character`                     | character 100000（封顶）                      | character 266                                    | `character`, `oc`                        | `character`        |
| `clothing`   | 服装     | `clothing`, `outfit`, `costume` | clothing 25838 · outfit 1220 · costume 1100   | outfit 115 · dress 155 · uniform 75 · costume 41 | `outfit`, `dress`, `uniform`, `costume`  | `outfit`           |
| `expression` | 表情     | **（空，见下）**                | expressions 46 · emotion 37                   | expression 31 · smile 31 · emotion 81            | `expression`, `smile`, `face`, `emotion` | `expression`       |
| `pose`       | 姿势     | `poses`, `pose`                 | poses 5059 · pose 1847                        | pose 95 · posture 2                              | `pose`, `posture`, `position`            | `pose`             |
| `style`      | 风格     | `style`                         | style 100000（封顶）                          | style 1000（封顶）                               | `style`, `artstyle`, `aesthetic`         | `art style`        |
| `concept`    | 概念     | `concept`                       | concept 45368                                 | concept 279                                      | `concept`                                | `concept`          |
| `scene`      | 场景     | `background`, `scenery`         | background 6830 · scenery 1851                | background 83 · scenery 13 · landscape 46        | `background`, `scenery`, `landscape`     | `background`       |

**实测方法**（2026-07-17，S2 开工第一步）：civitai 侧对每个候选 tag 单独打
`POST search-new.civitai.com/multi-search`，`filter: ["type = LoRA", "tags.name IN [\"<tag>\"]"]`、`limit: 0`，读
`estimatedTotalHits`（用已知参照值 `Chroma`→1108、`Qwen`→1666 与
`constants/lora.ts` 里 2026-07-07 记录的家族供给数字核对，确认 filter 语法/口径一致后再跑候选 tag）。HF 侧无对等的
tag-level 计数 API，改用 `GET huggingface.co/api/models?filter=lora&search=<关键词>&limit=1000` 数组长度做近似（不经过项目自己
的 `isPotentialLoraCandidate` 严格过滤，是供给上界不是精确可用数）。

**剔除/隐藏决策**：

- 供给 <500 的 tag 从 civitaiTags 剔除，只靠 L2/L3 兜底——本批命中的只有 `expressions`(46) / `emotion`(37)，两者都 <500，`expression` 类型的 civitaiTags 定为空数组。
- 「表情」**未**触发首发隐藏：L2 关键词的全文近似供给健康（`expression` 1388 · `smile` 6626 · `emotion` 164 · `face` 11004，用 `q=` 全文搜索测得，比子串匹配宽但足以证明供给不稀薄），合计供给不满足文档草稿假设的「三层合计供给仍稀薄」条件——**推翻草稿默认值，「表情」chip 保留渲染，不并入「概念」**。
- HF per-source 隐藏：本批 7 类的近似供给全部 >0（最低 `posture` 2 条），**没有类型触发「完全无供给」隐藏条件**，7 类在 HF tab 下全部渲染；机制（`LORA_CONTENT_TYPE_VALUES_BY_SOURCE`）留着，供后续按真实转化率收窄。

- 类别全集核对（2026-07-17 owner 问「还有别的吗」）：civitai 官方还有 `action` / `objects` / `animal` / `vehicle` / `buildings` / `celebrity` / `tool` 等——`action` 与姿势重叠、`celebrity` 真人向、其余长尾稀薄，全部归「概念」兜底不占 chip 位。**「场景」（background）是唯一建议追加的第 7 类**（背景 LoRA 与画布/背景卡需求线相关），已随本片一起交付。
- 每项字段：`id` / `labelKey` / `civitaiTags` / `hfTags`（Hub tag 候选，供给差，允许空数组——本批只有 character/style/concept 三类给了非空 hfTags，其余取经验证的空数组，纯靠 L2）/ `nameKeywords` / `searchFallbackTerm`（空态逃生口用的搜索词）。
- **单选**（与家族行同模式），`type=all` 默认。

### 3.2 三重兜底（工程契约，UI 依赖它的合并结果）

civitai 社区 tag 质量参差（官方 discussion #499：大量模型不打 tag），单靠 L1 会漏。检索结果 = 三层**并集去重**（服务端合并，客户端只见统一列表）：

1. **L1 tag 下推**：meilisearch `tags.name IN (civitaiTags)`——精确但覆盖不全；
2. **L2 名称词表**：`nameKeywords` 下推进 meilisearch **第二个 query 的 `q`**（全文，覆盖 name/tags/description，typo-tolerant）——补 L1 的漏，可能引入误报；
3. **L3 自建映射** `LORA_CONTENT_TYPE_OVERRIDES`（新常量，`modelId → type` 与 `modelId → exclude` 两张小表）：人工/挖掘维护的纠错层，**优先级最高**——L2 误报进 exclude、L1/L2 都漏的热门模型进 override。首发允许空表，机制先立起来。

**S2 工程实现**（`src/services/civitai-lora.service.ts` `listCivitaiLorasByContentType`）：type≠'all' 时整条请求路由到这个函数，绕开 REST 浏览分支（REST `tag=` 只支持单值、表达不了 civitaiTags 的多 tag OR，也没有名称关键词兜底）——统一走 meilisearch。

- **L2 工程选型：下推进 `q=`，不是客户端子串过滤**。理由：① multi-search 端点原生支持一次 HTTP 请求带多个独立 `query` 对象（2026-07-17 实测确认，`body.queries` 数组，每个 query 各自返回独立 `hits`）——L1（tag 过滤）+ L2（关键词全文）打包进同一次 POST，零额外往返；② 客户端子串过滤需要先对已抓取页做宽口径 over-fetch 才有东西可过滤，这正是简报 §0 明确排除的「over-fetch 根治」方向；③ meilisearch 的 typo-tolerant 全文匹配是「名称/描述子串匹配」的合理超集，宁可稍宽，多余命中交给 L3 exclude 纠错。
- 合并：两个 query 各自按 `offset/limit` 独立分页，返回的 hits 按 `hit.id`（civitai modelId）去重合并，L3 exclude 剔除、L3 override 补漏（modelId 不在合并集里时另发一次 REST 单模型请求解析），再按请求的 `sort` 字段重新排序（`Highest Rated` 无暴露的相关性分数，保留合并顺序）后裁到 `pageSize`。
- **已知限制**：两个独立分页窗口的并集不是精确分页（跟简报 §0 排除的 over-fetch 根治同一个已知代价档）——`total` 如实报 `null`（未知）而不是编造一个数字；`hasNextPage` 用「任一底层 query 在这页之后还有更多」近似。meilisearch 请求失败**没有 REST 回落**（REST 表达不了多 tag OR/名称关键词），直接向上抛错、路由层 502——失败大声暴露好过悄悄丢弃用户选中的类型筛选。
- HF 侧（`src/services/huggingface-lora.service.ts`）走既有的「抓 Hub 页 + 服务端过滤」架构（不是 meilisearch）：`isPotentialLoraCandidate` 新增 `modelMatchesContentType` 判据，同一套 L1(`hfTags`)/L2(`nameKeywords` 对 repoId/模型名/tags/文件名子串匹配，复用 `matchesRepositorySearch` 的 haystack 构造)/L3(`LORA_CONTENT_TYPE_OVERRIDES_HF`/`_EXCLUDES_HF`，repoId 键) 语义，不新开 over-fetch 路径。

UI **不逐卡暴露匹配层**（噪音）；只在稀疏/空态整体说明（3.3）。排序在合并集上生效。

### 3.3 稀疏态与空态（civitai tag 参差的用户侧承接）

类型筛选激活（`type≠all`）时，结果按三档处理：

| 档       | 判定        | 处理                                                                                                                                                                                                                      |
| -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 正常     | 本页结果 ≥6 | 正常网格，无额外元素                                                                                                                                                                                                      |
| **稀疏** | 结果 1–5 条 | 网格尾部追加一张**引导卡**（与卡片同尺寸、虚线描边、无封面）：标题「没找全？」+ 说明一句「Civitai 社区标注不全，部分同类模型没打标签」+ 文字链动作「按『{searchFallbackTerm}』搜索」（点击把词填入搜索框、type 重置 all） |
| **空**   | 结果 0 条   | 空态区三件套：① 标题「该类型下暂无收录」② 说明「社区标注覆盖有限，不代表不存在」③ 动作两枚：主=「用关键词搜索」（同上 fallback 注入）、次=「清除类型筛选」（并入现有 P2-6 清除筛选动作，扩展为连 type 一起清）            |

- 引导卡/空态均为中性灰阶（说明性内容不执警示色；琥珀仍只留给 NSFW/错误）。
- 与其他筛选组合为空（family/q/nsfw 同时激活）时走现有「清除筛选」空态，动作扩展为清 type——一个空态一套动作，不做两套。

## 4. 生成页 · 组合区（G3）

生成页布局 B / 暗房工作台七细则**全部不动**；以下是三件增量。

### 4.1 兼容度圆点（NovelAI 熟悉度圆点的 LoRA 翻译）

- 位置：脊柱条每个 LoRA chip 内、名字左侧，`size-1.5` 圆点。
- 判定：`isLoraBaseModelMountCompatible(item.asset.baseModelFamily, selectedBase.family)`（引擎已有，`lib/lora-model-compatibility.ts:71`）。
- **兼容给淡信号**（2026-07-17 owner 改，原「安静默认·兼容不渲染」作废）：兼容 → **淡绿/中性小点**（明确表达「已判定兼容」，与「未判定」区分开——owner 判 LoRA 兼容性易踩坑，需要明确信号）；不兼容（跨架构桶或 other）→ **琥珀实心点** + tooltip/aria「与当前底模架构不符，出图时该 LoRA 不会生效」；底模未选 → 不判定不渲染。淡绿点守颜料纪律（低饱和、不与琥珀警示争夺注意力）。
- 出图前置（2026-07-17 owner 拍板加码：**警示 + 给出建议底模**）：存在不兼容挂载时，纸上出图键不阻断，其上方追加一行琥珀警示（与 runner 额度提示同区、同形制）：「{n} 个挂载与当前底模不兼容，将被忽略」+ **文字链动作「切到 {建议底模}」**——建议值来自该 LoRA 家族的默认底模（`getDefaultBase(family)` / `getRecommendedLoraImageModelId`，引擎已有），点击即切换并重算。多挂载家族互斥（如 Illustrious + Flux 同挂）时无单一解，动作退化为提示「两个挂载家族互斥，请卸载其一」，不给假建议。
- 联动：切换底模 Select 时圆点/警示行即时重算。

### 4.4 底模选择器分组（2026-07-17 owner 拍板追加）

现状底模 Select 是扁平列表 + 「免费额度/需 API Key」徽标，owner 判「分类不明确」。改**两层分组**：

```
底模 ▾
├─ 云端 API · 自备 key        ← backend ≠ runner（fal / Replicate hosted）
│    FLUX.1-dev · 快
│    NoobAI XL · 忠实
└─ Runner · 平台免费额度      ← backend === 'runner'
   ├─ SDXL 系
   │    WAI Illustrious · 忠实 / animaPencil XL / Pony V6 / SDXL 1.0
   └─ DiT 系
        Anima · 忠实
```

- 第一层按 `backend`（云端 API vs runner）分组（`SelectGroup` + `SelectLabel`）；**runner 组内再分一层**：按架构系（SDXL 系 / DiT 系——数据来源 `LoraBaseModel.family`，`anima-dit` 归 DiT，其余归 SDXL；新增架构自动成组）。
- 现有「免费额度/需 API Key」徽标随分组标题上移（组级信息不逐项重复），组内项只留 名称 · 忠实/快 · Coming Soon 态。
- 兼容过滤逻辑不变（仍只列 `getCompatibleBases(loraFamily)` 结果）；分组是纯展示层，空组不渲染。

### 4.2 「常与它同挂」推荐行

owner 的「推荐搭配」诉求，用**已有数据**落地——当前分组 LoRA 的 mined recipes 里，配方作者实际共挂的其他 LoRA（`useCivitaiMinedPrompts` 返回的 recipe extras，配方面板「该图叠加 N 个其他 LoRA · +挂载」的同一数据源），是最真实的搭配信号，零新后端：

- 数据：聚合当前分组全部 `mined.recipes[].extras` 的共现计数，取 **Top 3 且计数 ≥2**（单例噪音不显示）。
- 渲染：配方面板元信息区下一行（直接排版文字，去盒化）：`常与它同挂：今汐 ×4 · 丹瑾 ×2　[+挂载]`——每项名字+次数，`+挂载` 为下划线文字链（形制细则③），复用配方面板既有 extras 挂载路径（含二段解析与逃生口 `CIVITAI_MODEL_SEARCH_URL`）。
- 数据不足（无 recipes / extras 全空 / 计数全 1）→ 整行不渲染。
- ⚠ 依赖：audit Issue A（fileHash null 硬依赖导致搜索命中的 LoRA 配方恒空）**必须先修**，否则此行对搜索来的 LoRA 永远不显示——见 §10 依赖表。

### 4.3 触发词 chips 化（评审 v2⑤ 正式纳入本批）

触发词是「挂载的属性」不是「用户写的词」，裸文本 prefill 让它与正文互相污染（评审 v2⑤ 原判断，本文把它从 v2 提前，因为它是组合体验的结构地基）：

- 纸上新增**触发词 chips 行**（textarea 上方、纸面形制小 chips）：每个挂载一枚 chip（LoRA 名缩写 + 触发词 mono），挂载即现、卸载即删；无触发词的挂载显示「无需触发词」灰 chip？——**不显示**（无数据不渲染，抽屉里已如实展示）。
- chip 可单独禁用（点 chip 切换启/停，停用=该触发词不进编译；场景：风格 LoRA 触发词与正文冲突时临时关掉）。
- **正文 textarea 不再 prefill 触发词**（现状 `mountedTriggersPrefill` 逻辑迁移到 chips 行）；一键同款只替换正文、不碰 chips 行（v2⑤ 原语义）。
- 编译顺序（请求 prompt 装配）：触发词 chips（启用的）→ tray 正向 tags → 正文自由文本，逗号连接去重——复用 `prompt-tag-compiler` 既有 compile 管线 + `lora_trigger` 类型（`types/prompt-tags.ts` 已预留），selections 机制照搬，别重造。
- 回放兼容：`?prompt=` 回放只写正文；`?style=` 挂载自动生成 chips 行——两条回放路径语义不变。

## 5. 生成页 · tag 补全（G4）

新组件 `PromptTagAutocomplete`（`components/business/studio/prompt-tags/`，通用件，首发挂 LoRA 生成页正/负两个 textarea；Studio 图像页复用列 non-goal）：

- **触发**：光标所在词段（最近 `,` 或换行之后的文本 trim）长度 ≥2 触发；IME composition 期间不触发（compositionstart/end 守卫——中文输入法拼音阶段不弹）；debounce 150ms。
- **引擎**：`searchPromptTags({ query: 词段, polarity: 所在框极性, limit: 8 })`——零新检索代码。
- **浮层**：锚定 textarea 底边的下拉（不做 caret 级定位，首发工程简化；popover 色板走标准浮层 token，不属于纸面反相作用域）。最多 8 项，每项：
  - label（主）+ `promptText` mono 小字（辅）
  - **热度点**：`popularity` 映射 3 档不透明度的中性小圆点（NovelAI 熟悉度圆点的直译；无彩，守颜料纪律）
  - 类别 `text-2xs` muted（scene/quality/…）
- **键盘**：↑/↓ 移动、Enter/Tab 确认、Esc 关闭且**同词段抑制**（继续输入才重新触发）；浮层项用 `pointerdown+preventDefault` 防 textarea blur（搜索历史下拉同款手法）。
- **触屏**：不自动抢焦点、不额外弹层遮内容（浮层高度 ≤4 项，超出内滚）；软键盘策略不受影响（用户本来就在输入）。
- **选中动作**：替换当前词段为 `promptText + ', '`，光标落尾。**写入正文文本，不进 tray**——建模决定：tray 管理结构化标签（面板式 LoraTagPicker 的领域），textarea 是自由正文，inline 补全只是打字加速器；两个事实源不混。【拍板项 ④】
- reduced-motion：浮层直显直隐无动画。

## 6. 状态规范（扩展评审 §9 全域状态表）

| 状态                                      | 规范                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 加载 / 空(无筛选) / 错误 / toast / 未登录 | 评审 §9 不变                                                                                   |
| 空（有筛选，含 type）                     | 「清除筛选」动作扩展为清 type+family+q+nsfw（§3.3）                                            |
| 类型稀疏（1–5 条）                        | 网格尾部引导卡（§3.3）                                                                         |
| 类型空（0 条）                            | 三件套空态 + fallback 搜索注入（§3.3）                                                         |
| 源切换                                    | 保留 q/type/family，重置分页；body crossfade 200ms + 骨架卡（D7⑦ 同规范）；reduced-motion 直切 |
| 不兼容挂载                                | chip 琥珀点 + 出图键上方警示行，不阻断（§4.1）                                                 |
| 补全浮层                                  | Esc 同词段抑制；结果 0 不渲染浮层（不显示"无结果"空壳）                                        |

## 7. 视觉与交互规格速记

- 全部沿用 v1 现状 token；**零新颜色**。唯一警示色琥珀，用途封闭列表：NSFW 态描边 / 错误警示文字 / 不兼容圆点与警示行。
- chips：筛选类 = `h-8` 圆角矩形（现状家族 chip 形制，统一两行）；可移除对象（LoRA 挂载/触发词）= 胶囊带 ×（形制细则②）；视图切换（源切换）= segmented（与公开/我的子 tab 同款紧凑 segmented）。
- 命中区：fine pointer 紧凑 32px；触屏 44px（伪元素扩 hit area，视觉不变）。
- 骨架：网格/抽屉封面 blur-up 或 shimmer，禁裸 `bg-muted`（评审 §0 追加条不变）。
- 焦点环/键盘可达：补全浮层 `role="listbox"`+`aria-activedescendant`；类型/家族 chip 行 `role="group"`+`aria-pressed`（HF 行现状已有，统一）。
- Tailwind 任意值禁用；新尺寸进 `@theme inline`。

## 8. i18n 键清单（LoraWorkbench ns 增量，三语同步）

| 键                                                                                                         | zh 参考                                                        |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `libraryTypeFilter`                                                                                        | 类型                                                           |
| `libraryFamilyFilter`                                                                                      | 底模                                                           |
| `typeAll` / `typeCharacter` / `typeClothing` / `typeExpression` / `typePose` / `typeStyle` / `typeConcept` | 全部/人物/服装/表情/姿势/风格/概念                             |
| `familyLabel.*`（11 值，合并两套现状 family label）                                                        | Illustrious / Flux / SDXL / …                                  |
| `sourceBadgeCivitai` / `sourceBadgeHuggingFace`                                                            | CIV / HF（title 全名）                                         |
| `typeSparseTitle` / `typeSparseBody` / `typeSparseAction`                                                  | 没找全？/ Civitai 社区标注不全… / 按「{term}」搜索             |
| `typeEmptyTitle` / `typeEmptyBody` / `typeEmptySearch` / `typeEmptyClear`                                  | 该类型下暂无收录 / … / 用关键词搜索 / 清除类型筛选             |
| `compatDotWarning`                                                                                         | 与当前底模架构不符，出图时该 LoRA 不会生效                     |
| `incompatibleMountsWarning`                                                                                | {n} 个挂载与当前底模不兼容，将被忽略                           |
| `switchToSuggestedBase` / `mountsMutuallyExclusive`                                                        | 切到 {base} / 两个挂载家族互斥，请卸载其一                     |
| `baseGroupCloud` / `baseGroupRunner` / `baseGroupSdxl` / `baseGroupDit`                                    | 云端 API · 自备 key / Runner · 平台免费额度 / SDXL 系 / DiT 系 |
| `typeScene`                                                                                                | 场景                                                           |
| `oftenMountedWith` / `mountExtra`                                                                          | 常与它同挂 / +挂载（复用现有则不新增）                         |
| `triggerChipRowLabel` / `triggerChipDisabledHint`                                                          | 触发词 / 已停用，不进提示词                                    |
| `autocompleteAriaLabel` / （浮层项无新键，label/promptText 来自定义）                                      | 标签建议                                                       |
| `hfSelectFileFirst`                                                                                        | 先选择权重文件                                                 |

HF 卡面移除的键（file select/import 在卡上的文案）迁移到抽屉，key 不删值复用；废弃键收尾时 `i18n-check` 清点。

## 9. 组件与文件改动面（现状 → 目标）

| 件       | 文件                                                                 | 改动                                                                                                   |
| -------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 库外壳   | `LoraWorkbench.tsx` `CommunitySourceBranch`                          | Tabs 套双组件 → `LoraLibraryShell`（建议**趁机拆文件**：`lora/library/` 子目录，Workbench 已 4268 行） |
| 控件行   | 同上 `CivitaiCommunityBranch` 控件区 + `HuggingFaceLoraLibrary` 头部 | 收敛为一套三行控件（§2.1）；HF 自有面板壳/搜索/family 行退役                                           |
| 统一卡   | `CivitaiLoraCard`（:3497）+ `HuggingFaceLoraCard`                    | → `LoraLibraryCard`（§2.3）；HF 卡 file select 迁抽屉                                                  |
| 统一抽屉 | `CivitaiLoraInspector`（:3575）                                      | → `LoraLibraryInspector` 双源装配（§2.4）                                                              |
| 类型常量 | `src/constants/lora.ts`                                              | 新增 `LORA_CONTENT_TYPES` / `LORA_CONTENT_TYPE_OVERRIDES` / family slug 枚举与映射                     |
| 类型检索 | `civitai-lora.service.ts` / `huggingface-lora.service.ts` / 两 hook  | L1–L3 合并（工程线规格，Sonnet 依 §3.2 契约实现）                                                      |
| 兼容圆点 | `LoraSpineBar`（:1939）                                              | chip 内圆点 + 警示行（§4.1）                                                                           |
| 推荐行   | GenerateBranch 配方面板区                                            | 聚合 extras Top3（§4.2）                                                                               |
| 触发词行 | GenerateBranch 纸区（:1391 起）                                      | TriggerChipRow + prefill 迁移（§4.3）                                                                  |
| 补全     | `prompt-tags/PromptTagAutocomplete.tsx`（新）                        | §5 全部；挂正/负 textarea                                                                              |
| URL      | `CivitaiCommunityBranch` URL effect（:2827）                         | + source/type 参数；family slug 兼容解析                                                               |

禁改范围沿用 ui-page 场景默认值；其中 §3.2 检索合并、§2.5 HF sort 是**设计+工程双属**改动，越 service 边界属预期（简报 §5 已把 G1/G2 标为「设计+工程」），执行时按 Hard Rules（server-only / Zod / withRetry）走。

## 10. 切片与验收（交 Sonnet；顺序即依赖序）

| 片                                                         | 内容                                                                                                                          | 验收                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S0** ✅ **已完成 · 别重做**                              | audit 3 bug（配方 fileHash / nsfw 下推 / 翻页锁定）                                                                           | **已在 commit `0d261217`（2026-07-11「fix(lora): unblock recipe mining…」）修复并在 main**；Sonnet 2026-07-17 逐条复核代码 + 全量 tsc/vitest 双绿确认。S4 推荐行依赖的 Issue A 已修，可直接开工。切片从 **S1 起**。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **S1 统一外壳** ✅ **已完成（2026-07-17，Sonnet）**        | family slug 化 + `source=` 深链 + 两 tab 内控件行形制对齐（civitai/HF 各自保留独立组件，按 owner 复核调整）+ HF sort 映射实测 | 深链 §2.5 基线直达；切源保留 q/family；HF 下 NSFW chip 不渲染；旧 `family=Illustrious` 深链不碎；**HF 三排序（trendingScore/downloads/lastModified）实测全部生效**，回写 §2.1。改动面：`src/constants/lora.ts`（family slug 域 + HF sort 域）· `src/components/business/studio/lora/library/`（新目录：`FamilyChipRow.tsx` / `LoraLibraryPagination.tsx` / `CivitaiLibraryPane.tsx` / `HuggingFaceLoraLibrary.tsx` / `LoraLibraryTabs.tsx`，从 `LoraWorkbench.tsx` 拆出，4268→2800 行）· `huggingface-lora.service.ts` + `use-huggingface-lora-library.ts` + `lib/api-client/lora-assets.ts`（sort 贯通）· i18n `familyLabel.*`/`libraryFamilyFilter`。卡片/抽屉/类型行留给 S2/S3。                                                                                                                                                                                                                                                                                                                                                                                          |
| **S2 内容类型** ✅ **已完成（2026-07-17，Sonnet）**        | `LORA_CONTENT_TYPES` + tag 供给实测（回写本文档 3.1 表）+ L1–L3 合并 + chip 行 + 稀疏/空态                                    | 选「服装」出服装类结果且排序生效；制造稀疏（冷门类型+家族组合）见引导卡；0 结果见三件套空态且 fallback 注入可用；`type=clothing` 深链直达。改动面：`src/constants/lora.ts`（`LORA_CONTENT_TYPES`/`LORA_CONTENT_TYPE_OVERRIDES(_HF)`/`LORA_CONTENT_TYPE_EXCLUDES(_HF)`/`LORA_CONTENT_TYPE_VALUES_BY_SOURCE`/`type=` 深链解析）· `civitai-lora.service.ts`（`listCivitaiLorasByContentType` 两 query 合并+L3）· `huggingface-lora.service.ts`（`modelMatchesContentType` 判据）· `src/types/index.ts`（`HuggingFaceLoraSearchQuerySchema.type`）· `library/ContentTypeChipRow.tsx` + `LibraryFilterChipRow.tsx`（新，S1 `FamilyChipRow` 重构为共用基座）+ `LoraLibraryTypeStates.tsx`（新，稀疏卡/空态）· API 路由/api-client/两个 hook 全链路贯通 · i18n 17 键三语同步。全量 tsc/lint/vitest（含新增 20+ 单测覆盖合并/去重/排序/L3 纠错/HF 判据）三绿；claude-in-chrome 实跑因**当次会话内 dev server 全局 Jest-worker 编译池崩溃**（`/zh/gallery`/`/zh/studio/image` 等无关页面同时 500，`/api/health` 正常，证明与本片代码无关）未能完成，需 owner 重启 dev server 后补跑。 |
| **S3 统一卡片+抽屉** ✅ **已完成（2026-07-17，Sonnet）**   | `LoraLibraryCard` + `LoraLibraryInspector`（HF file select 迁入、收藏语义统一）                                               | 全部验收真机通过：双源卡片同基底仅源角标异；HF 多文件 repo 抽屉选文件后收藏成功、未选时 toast 引导不静默选首个；civitai 抽屉零回归 + 新增 P0-2 授权徽标行。新组件：`library/LoraLibraryCard.tsx` / `LoraLibraryInspector.tsx` / `LoraCoverPreviewDialog.tsx`。顺手修复 `sortMergedSearchHits` 对合并结果「最多下载」排序不生效（version.metrics 优先级）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **S4 组合体验** ✅ **已完成（2026-07-17，Sonnet）**        | 兼容圆点 + 警示行（含建议底模动作）+ 常同挂行 + 底模 Select 两层分组（§4.4）                                                  | 真机通过（互斥变体闭环实测；「切到建议底模」子路径因底模下拉作用域绑定主挂家族真机不可达，由 `summarizeLoraStackCompatibility` 单测覆盖）。兼容点 = `bg-emerald-500/70`（淡信号），不兼容 = 琥珀实心。新纯函数：`summarizeLoraStackCompatibility`（lora-model-compatibility.ts）/ `aggregateOftenMountedExtras`（lora-recipe-extra-mount.ts）/ `getLoraBaseArchitectureGroup`（lora-base-models.ts），均带单测。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **S5 触发词 chips 化** ✅ **已完成（2026-07-17，Sonnet）** | TriggerChipRow + prefill 迁移 + 编译顺序                                                                                      | 全部验收真机通过（真实 `/api/studio/generate` 请求体验证编译顺序 触发词→tray→正文；停用剔除；一键同款不碰 chips 行）。新组件 `TriggerChipRow.tsx`；删除旧 `lib/lora-prompt-triggers.ts`（防触发词重复计入）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **S6 inline 补全** ✅ **已完成（2026-07-17，Sonnet）**     | PromptTagAutocomplete                                                                                                         | 全部验收真机通过（IME 用 CDP composition 事件验证）。新件：`prompt-tags/PromptTagAutocomplete.tsx` + `lib/prompt-tag-autocomplete.ts`（纯函数：词段提取/替换/热度分档），挂正/负两 textarea；常量进 `constants/prompt-tags.ts`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

> S1–S6 已于 2026-07-18 以 commit `b3e1452d` 单 commit 进 main（owner 点头）；工作区并发的 spinner 线在制品未混入，`ui/spinner.tsx` + `Common.loading` 因被本线文件引用一并收编。

每片收尾：lint + 全量 tsc（后台跑显式捕获 exit code）+ 全量 vitest + `e2e/visual.spec.ts`（基线更新点名）+ claude-in-chrome 实跑关键交互 + i18n-check 三语。S1→S3 有依赖（卡片/抽屉建立在外壳上）；S4–S6 彼此独立、可与 S2/S3 并行；S2 依赖 S1 的控件行骨架。

## 11. 拍板记录（2026-07-17 owner）

| #   | 分叉                      | 拍板                                                                                                                                                                                                  |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ①   | 类型集合                  | **7 类确认**（2026-07-17 owner 拍板加第 7 类「场景」/背景 LoRA）：人物/服装/表情/姿势/风格/概念/场景。「表情」供给实测不足时首发隐藏并入「概念」（沿用）                                              |
| ②   | HF 动作语义               | **统一为「收藏」**                                                                                                                                                                                    |
| ③   | 不兼容挂载                | **警示不阻断 + 警示行给「切到建议底模」动作** + 底模 Select 两层分组（云端 API / Runner，runner 内按架构系再分，§4.4）。**2026-07-17 owner 追加：兼容圆点改「兼容也给淡信号」（§4.1，安静默认作废）** |
| ④   | 双源架构                  | **2026-07-17 owner 改：保留 civitai/HF 两 tab、只对齐视觉，不合成单壳**（§2 顶部调整块）——统一卡片/抽屉/family slug 作为对齐手段保留                                                                  |
| ④   | inline 补全               | **写正文文本**（tray 专属面板式词库）                                                                                                                                                                 |
| ⑤   | 拆 `lora/library/` 子目录 | Fable 建议拆（Workbench 4268 行减负），owner 未表异议，按拆执行                                                                                                                                       |

## 12. 库控件区纵向压缩（2026-07-18 owner 反馈「上下占用太多空间」，Fable 方案已拍板执行）

现状网格前叠 5 层（公开/我的 → Civitai/HF → 搜索行 → 类型行 → 底模行，约 264px），压成 3 层（约 178px，-33%）：

1. **行A 导航合流**：公开/我的 pills + 竖发丝线（`w-px h-[18px] bg-border`，尺寸走现有 token 不进任意值——用 `h-4.5` 或就近现有档）+ Civitai/HF segmented，同一行左簇；**排序 Select + NSFW chip（仅 civitai）+ 刷新钮移到行 A 右端**。「我的」子态下：源 segmented 与右端排序/NSFW 隐藏（我的库无双源无排序），行 A 只剩 pills。
2. **行B 搜索独占**：全宽搜索框（历史下拉不受挤压），顶部发丝线分区（去盒化语言沿用）。
3. **行C 维度簇**：类型/底模两行紧贴成一簇（行间 `gap-1.5`），行首标定宽对齐（`w-[26px]` 档进 @theme 或复用现有 spacing）；与行 B 间距 10px。
4. 节奏：库区 `space-y-4`→`space-y-3`，控件行间 12px→10px；chips h-8 与触屏 44px 命中区规范不变。
5. 移动端：行 A 允许换行（pills 簇与排序簇分两行）；类型/底模仍横滚。

改动面：`LoraWorkbench.tsx`（公开/我的 pills 行拆出与源行合流）· `library/LoraLibraryTabs.tsx`（行 A 容器 + 右端控件槽）· `CivitaiLibraryPane.tsx` / `HuggingFaceLoraLibrary.tsx`（排序/NSFW/刷新迁出搜索行）。验收：桌面端网格首行卡片在 1080p 视口无需滚动即可见；「我的」子态行 A 无空壳残留；深链/筛选行为零回归。

## 13. HF 样例参考与提示词（2026-07-18 owner 反馈：库侧一张封面够用，生成侧要看全部参考图+提示词）

**数据事实**（2026-07-18 实测 `lrzjason/Anything2Real`）：HF LoRA 的样例图主要活在 README（托管 `cdn-uploads.huggingface.co`，不在 siblings），常配示例提示词；仓内偶有 demo workflow json。这是 civitai「来源图/配方」在 HF 侧的对应物。

**分层原则**（owner 拍板方向）：

- **库侧（卡面/抽屉）**：只放**一张**封面（README 首图优先于社交横幅）；抽屉不加图集，保持轻。
- **生成侧（挂载后）**：挂载 HF LoRA 时，配方面板区（civitai mined 配方同一位置）渲染「**样例参考**」——README 全部图横滚（复用 `LoraSourceImagePreviewStrip` 形制，点击放大复用 `LoraCoverPreviewDialog`）+ 提取的候选提示词列表（复用 civitai 试用提示词 D7⑤ 形制：mono 展示 + 一键填入正文）。无数据不渲染。

**⚠ 封面 README 图必须走渐进增强，不能同步阻塞列表（2026-07-18 实测教训，owner 拍板方案 B）**：

- 事故：bug 批首版把 README 挖掘做成服务端同步（列表 fetch 里 await `hydrateReadmeCoverImages`，对落空卡分批拉 README/6s 超时），实测 HF 库首屏 **5–31s**——单 repo README 往返仅 0.28s，但 12 张全落空分批串行 + 尾部超时把首屏拖死。**同步阻塞列表做 N 个网络往返 = 尾延迟不可控，调参根治不了。**
- 正解（H0 切片）：**列表秒回**（封面到社交横幅兜底为止，移除同步 README 挖掘），**客户端渐进增强**——落空卡初始骨架，`IntersectionObserver` 进视口时懒加载单 repo showcase 端点取 `images[0]`，`LoraCoverTile` blur-up 显示真图；无图/失败回退横幅。落空卡时序 = 骨架→(真图 or 横幅)，无「横幅闪一下」跳变。会话缓存 + 只请求可见卡。
- 端点 = `getHuggingFaceRepoShowcase(repoId, revision) → { images, prompts }`（库侧封面取 `images[0]`；生成侧 showcase 取全部）。`extractReadmeImageUrls` / `fetchReadmeCoverImageUrl` 纯函数保留复用；`prompts` 提取是 H1 的活（H0 先返回 `[]` 占位）。

**切片重排**：

- **H0 库侧封面渐进增强**（2026-07-18 派 Sonnet，与两 bug 同批提交）：service 移除同步挖掘 + showcase 端点（images 可用/prompts 占位）+ api-client + 客户端 IntersectionObserver 懒加载。验收：HF 首屏秒回；Anything2Real 卡骨架→真图；纯工具 repo→横幅；滚动才请求。
- **H1 生成侧 showcase**（独立于助手 F 线）：showcase 端点补 `prompts` 启发式（fenced code block + `prompt:` 前缀行，best-effort）+ 生成侧「样例参考」条 UI（多图横滚+提示词一键填入）。验收：挂 Anything2Real 见多图横滚+提示词填入；无 README 图的 HF LoRA 整条不渲染；civitai mined 配方零回归。

**工程契约**：

- service 新函数 `getHuggingFaceRepoShowcase(repoId)` → `{ images: string[], prompts: string[] }`：README 解析复用封面链的 `extractReadmeImageUrls`（全量而非首图）；提示词提取 = fenced code block + `prompt:` 前缀行两种启发式（best-effort，提不到就空数组，无则不渲染——不硬造）。纯函数可单测。
- API：工厂路由 `/api/lora-assets/huggingface/showcase`（auth→Zod→service），生成页挂载 HF LoRA 时按 `sourceUrl` 懒取（挂载才取，不在库列表批量抓）。
- 缓存：会话内存缓存（同 repo 不重复抓）；持久缓存后置。
- 触发词照常由 S5 chips 行承接，不混入本条。

**切片 H1**（独立于助手 F 线，可与 §12 压缩同批交 Sonnet）：service+route+单测 → 生成侧样例参考条 → 真机验收（挂 Anything2Real 见 8 图横滚 + 提示词一键填入；挂无 README 图的 HF LoRA 整条不渲染；civitai LoRA 的 mined 配方零回归）。

## Source of Truth

- 代码现状：`LoraWorkbench.tsx`（4268 行，锚点见 §9）· `HuggingFaceLoraLibrary.tsx` · `use-civitai-lora-library.ts` / `use-huggingface-lora-library.ts` / `use-active-lora-stack.tsx` · `constants/lora.ts` · `lib/lora-model-compatibility.ts` · `lib/prompt-tag-search.ts` + `constants/prompt-tags.*` · `prompt-tags/PromptTagTray.tsx`
- 上游决策：`docs/plans/lora-search-redesign-2026-07.md`（调查简报）· `docs/archive/reviews/2026-07-02-lora-domain-ui-review.md`（v1 施工基准，D1–D9/B1–B11）· `docs/plans/lora-search-image-audit-2026-07.md`（S0 工程前置）
- 规矩：当前功能施工读本文；未来视觉改版同时读 `lora-library.md` / `lora-generate.md`、`docs/brand-dna.md`、`docs/scenes/ui-page.md`、`docs/checklists/ui.md` 与 `docs/references/frontend.md`，不得从本文现有皮肤反推新方向。

## Last Verified

- Date: 2026-07-17 · Method: 逐文件核实上表代码锚点（LoraWorkbench 结构 grep + 关键区间精读；双库/栈/词库引擎/兼容引擎全读）；未改产品代码。civitai tag 供给数字（§3.1）标注为待 S2 实测项，非已验证值。
