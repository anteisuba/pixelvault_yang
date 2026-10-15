# 助手新内核（v3）— 施工基准

> 状态：**S1–S5 完成，S6 进行中（2026-10-10）**。五张脸（画布、LoRA 台、图片台〔自然语言台 + 标签台〕、角色页、视频台）都默认走 v3（不分账号、助手模型选「自动」也算）；本地开关 `localStorage['antei:assistant-kernel'] = 'v2'` 只认 owner（服务端 `isAdmin`，与管理后台同一道判据，⛔ 不另起 env，2026-10-15）：owner 开了照走旧内核，只为对比，删旧内核时一起删；别人发了 `v2` 服务端照走 v3、记一行日志（⚠ 浏览器那头仍按 v2 的形状组请求：视频台 `@` 的片子放进 `mentionedAssets`、不抽 `videoClips`，到了 v3 这几段片子就看不到）。助手的五家（OpenAI / Claude / Gemini / DeepSeek / Grok）都由 v3 自己跑；只有造不出模型或这张脸画不出板子时才交回旧内核。选定的模型那一家没绑 key 时整轮不跑（见下「只用所选那一家」），⛔ 不回落「自动」、不交回旧内核。S6 剩删旧内核。
> owner 2026-10-09 定：AI SDK 原生工具；OpenAI 先跑，Claude 另跑一轮；五张脸（图片 / 视频 / LoRA / 画布 / 角色）都迁到新内核，画布先；最后删旧内核。正文不复述改动：改了什么由过程行说（按实际落地的 op 生成），正文只写判断与下一步。

## 1. 为什么换（2026-10-09 回放基线）

旧内核在马尔福副本上跑 25 题（GPT-6 Luna）：✅ 15（5 题第一步写错再改对）· ⚠️ 3 · ❌ 7；106 次调用共 216 万输入、缓存 28%；一句话问答也要 2.7 万输入，看一张九宫格那题 27 万。

v3 修后同模型重跑（本地 dev + 同一个库，结果列在 §3 最后一列）：✅ 23 · ⚠️ 2 · ❌ 0；每次调用平均 1.8 万输入、缓存 76%。剩下两题是判断：T17 自己把九宫格要出场的四个角色接了参考（没被要求），T20 看图每次抓到 owner 五条里的 2–3 条、子集不定 —— S5 改成先写观察、再按清单逐条判之后连续三次 4 / 5（见下「看图」）。缓存键原先按会话 id 取，一轮的第一次请求还没有会话 id、接力时才有，接力首步整段重算（旧内核同病）；改成工作台在前之后接力首步命中约 95%。

| 毛病                                                 | 题              | v3 的改法                                                      |
| ---------------------------------------------------- | --------------- | -------------------------------------------------------------- |
| 自造 JSON 协议，op 名与形状记不住（8 次草稿步）      | T05 T06 T09 T22 | 原生工具调用，8 个工具各一个 schema；OpenAI 官方端点开严格模式 |
| 36 位 UUID 抄错一位就整步作废                        | T17 T20 T25     | 卡用句柄（`img-6db120`），连线按「从哪到哪、哪个槽」指认       |
| 新卡要等前端回 id 才能写词设参，建三张卡 4 次往返    | T03 T18         | 同一批里新卡用临时名，建卡、模型、参数、提示词一批落           |
| 镜头带位置号与剧本镜号都叫 S，报出不存在的 S13 / S14 | T23             | 板子只印剧本镜号（S04a），镜头带只印位置（LANE 5）             |
| 卡叠在已有卡上                                       | T18             | 建卡不给坐标，前端按量到的卡尺寸找最近空位（连着的卡旁边）     |
| 剧本行整段覆盖镜头提示词                             | T08             | `write` 的 `edit` 写法：逐条找句换句，只动那几个字             |
| 说的和做的对不上                                     | T02 T19         | 正文不复述改动（过程行即回执）                                 |
| 系统提示里有每轮会变的东西，每题第一步缓存 0         | 全体            | 系统提示只放不变的规则；板子与本轮记录进消息并只追加           |

## 2. 结构

- **一轮怎么走**：开轮时把板子冻结进本轮记录（transcript）。每一步把「历史 + 冻结的板子与这句话 + 本轮记录」发给模型。读类工具在服务端跑完、结果追加、接着下一步；改画布的工具交给前端落（`canvas_batch` 步），这次请求停在 `canvas_sync`，前端落完带着记录与新快照再来，结果在那一跳补进记录。同一条回复里的改动合成一批，一个过程行、一次接力。
- **本轮记录由服务端写、前端只搬运**：接力那一跳服务端手里只有最新快照，拿它重画板子前缀就变了。开轮的板子、每次调用与结果都冻结在记录里，逐字还原。
- **工具真正执行**全部交给旧内核的执行函数（`planTool`）：建卡、连线、写提示词、生成确认、联网查。新内核只做句柄 ↔ id、v3 入参 → 旧动作、结果 → 工具结果。⚠ 看图例外：`look` 由 v3 自己把图交到主模型眼前（`assistant-v3-look.service.ts`，见下「看图」），⛔ 不调旧内核的看图子调用。
- **钱闸不变**：没有任何工具能建 generation，`generate` 只出确认卡。
- **五家都接**：OpenAI（官方端点走 Responses）、Claude、Gemini，DeepSeek 与 Grok 走兼容 OpenAI 的对话接口。
- **停在卡上的那一轮**：搭配卡（`propose_setup`）与出图卡（LoRA 台的 `generate`）入参带必填 `say`，这条回复没写正文时服务端把它放在卡上方 —— 提示词里要求它说，五家里三家不说。

| 工具           | 管什么                                                                              | 交给旧执行器的哪一步                   |
| -------------- | ----------------------------------------------------------------------------------- | -------------------------------------- |
| read           | 卡的全文、连线、参数                                                                | 服务端直接渲染（`read_state` 过程行）  |
| look           | 把要看的图（被 @ 的、卡上的、参考位的）连同问题交到主模型眼前，只附给紧跟着的那一步 | ⛔ 不交旧执行器（`read_state` 过程行） |
| edit           | 建卡（带模型 / 参数 / 提示词）、设名字模型参数、连线、断线、删卡、挪镜、投影剧本    | `canvas_batch`                         |
| write          | 一张或几张卡的提示词 / 正文：替换、追加、找句换句                                   | `canvas_batch`                         |
| generate       | 生成确认卡：几张合成一张队列条（方向 C）；镜头卡先过出片前核对                      | `canvas_generate`                      |
| search_web     | 联网查                                                                              | `research`                             |
| search_library | 素材库                                                                              | `search_assets`                        |
| ask            | 反问（≤4 题、每题 2–6 项；`multiSelect` 多选；选项 `image` 句柄换缩略图；`why`）    | 问题卡                                 |

### 一张脸一个适配（S6）

- 各张脸共用一层「步骤」（`assistant-v3-steps.service.ts`：过程行、调旧执行器、把计划变成步与工具结果）。差别只在改动型那一步：画布要前端落完再接力（`pending`），工作台随步落、当场就有结果。两张工作台脸（LoRA 台、图片台）再共用一层 `assistant-v3-bench.service.ts`：写提示词、看图、出确认卡、卸参考图（旧执行器的 `slotIndex` 从 1 起）。看图五张脸再共用 `assistant-v3-look.service.ts`。
- 五张脸都设 `run.skipReferenceReview`：写提示词、出图前⛔ 不另起一次看参考图的子调用（图片台的参考图证据简报、LoRA 台的参考图补读、画布的 `checkCanvasReferencePrompt`）。要看就用 look。
- **LoRA 台**（`assistant-v3-lora.service.ts` · `lib/assistant-v3-lora-board.ts`）：工具名不变，动的是一张表单。板子一行一格：底模、提示词、负面、采样参数（附可选的采样器 / 调度器）、挂着的 LoRA（句柄 `lora-cmg1ab`，权重、开关、触发词在不在提示词里、合不合底模）、总权重与这台底模的上限、参考图 `ref-N`、左边打开着的示例（`sample`，图跟着板子给模型看，配方写在板上，全文用 `read`）。
  - edit：`set_model` · `set_params`（Civitai 的采样器名照认）· `set_weight` · `unmount` · `unmount_reference` · `propose_setup`（搭配卡）· `show_picks`（库页圈选）。新挂 LoRA 只走搭配卡或圈选，挂载由创作者点；助手自己定的权重 / 参数也上卡，创作者说了确切数值或要照抄配方才直接设。
  - write：提示词 / 负面，替换 · 追加 · 找句换句；⛔ 不再问「你写过了，覆盖吗」（创作者叫助手改就是要改，每步可撤）。追加由 v3 拼好整段再写。
  - search_library：`kind: "lora"` 在库页当面搜；look：@ 来的图 · `ref-N` · `sample`（示例图已跟着板子附上，look 只指给模型看）；generate：只在创作者要图时摆确认卡。
  - 系统提示的方言段只注入当前底模那一族（`lib/lora-dialect-section.ts`，旧内核同用）。
- **图片台**（`assistant-v3-image.service.ts` · `lib/assistant-v3-image-board.ts`）：自然语言台与标签台同一张脸。板子一行一格，每个旋钮带可选值：模型（多渠道的列出渠道）、提示词、负面（模型没有负面就说没有）、画幅 / 清晰度 / 质量 / 背景、每次张数、模型选项（`set_option` 按 key）、标签台的分角色与画面文字、参考图 `ref-N`。
  - edit：`set_model`（带渠道）· `set_specs`（没说的那一格沿用台上的值；没有清晰度档的模型写 auto）· `set_count` · `set_option` · `mount_reference`（按附图名或检索结果的资产 id）· `unmount_reference` · `import_url` · 标签台 `set_people` / `set_scene_texts`。
  - 写提示词不走旧内核的「参考图证据简报」闸（`run.skipReferenceReview`，五张脸都设）：v3 的模型自己用 look 看参考图再写。NAI 标签核对照旧（查不到的退回改写一次）。
  - search_library：自己的素材，或 `kind: "web_images"` 联网找图（结果摆在面板上由创作者选用）。
  - 系统提示的方言段是选中模型的写法（与旧内核同源，旧工具名换成 v3 的说法）。
- **视频台**（与图片台同一个服务与板子，按 `face` 分）：板子多出时长、首尾帧（首帧挂上后画幅按 `aspectRatioLock` 锁死；没挂只是能力声明）、参考视频、参考声音（属于哪个角色）、原声三态开关。
  - edit：`set_specs`（时长 / 画幅 / 清晰度各自独立）· `mount_reference`（slot `first` / `last` / 参考）· `unmount_reference`（`ref-N` / `first` / `last`）· `mount_audio` · `set_sound` · 与图片台同形的 `set_model` / `set_option` / `import_url`。
  - ⭐ 清晰度是花钱的那一格：创作者话里没提清晰度（1080p、清晰度、分辨率…）就不改 —— 写在代码里，提示词管不住（回放 V1 两次自选 1080p）。
  - 系统提示沿用旧内核的视频规矩：按时间写动作与运镜、台词按时长（约 2.5 词 / 秒）、首尾帧是具名槽、原声只在创作者要时动、声音参考搜一两次没有就直说。怎么看片不在视频规矩里，在五张脸共用的 `WATCHING CLIPS` 一段（见下「看片」）。
- **角色页**（`assistant-v3-cards.service.ts` · `lib/assistant-v3-cards-board.ts`）：不改任何东西 —— 没有 write / generate，三种 edit 都是提议，出卡、停下等创作者勾（服务端不写库）。板子：角色名册用句柄（`char-b27ce8`，同名角色不止一位）、打开那位的五格设定与标签，卡上的图跟着板子给模型看（`card-1` …）。
  - edit：`propose_profile`（逐格带出处）· `propose_images`（本轮检索到的资产 id 或网图地址）· `hand_off`（交给图片助手；那句话里的句柄服务端换回角色名）。一条回复只走第一份提议。
  - read：设定某一格全文，或一个网址（读 wiki 角色页 / 故事页 / 语音页）；look `card` / `card-N`：创作者问图与设定对不对时，指给模型看卡上的图（前 6 张已跟着板子附上，再往后的才附），由它自己对 —— 只比身份（发色、瞳色、肤色、年龄、体型、种族、伤疤犄角），衣服、姿势、表情、背景、画风不算。⛔ 不再另起 `check_character_look`（v2 照旧）。
  - search_library `kind: "web_images"`（联网找图，owner 2026-10-15「一种看法」）：搜完把候选的缩略图当一次 look 交给**主模型**（`searchWebImagesAndLook`），按搜索结果编号（`candidate N`，过程行「候选 N」），由它对照卡上的图与设定自己判断哪几张是这位。走 look 的硬规矩：只附给紧跟着的那一步、一次最多 6 张（多出来的点名）、一张下不来只点名那一张；标了 REFERENCE ONLY 的挂不上卡，⛔ 不占看图名额。所选模型看不了图：结果里明说「没人看过这些候选、只凭标题」，由模型照实告诉创作者。⛔ 不另起看缩略图的子调用（v2 的 `inspectWebImageCandidates` 跑在视觉顺位挑中的那一家，会悄悄借别家的 key）、⛔ 没有藏起来的判定去筛 `propose_images`：v3 设 `run.mainModelLooks`，旧执行器的搜图那一步只搜、只列，不写判词、不按判词丢图。
  - 系统提示沿用旧内核的角色页规矩：设定四部分 + 外观一句、原作先查原文、改编角色按原作改写或先问方向、原创先问方向、好图的标准、换衣不算矛盾。

### 只用所选那一家（owner 2026-10-15「会自动扣其他模型的token，用户还不知道」·「全跟助手」）

- ⛔ 不在创作者不知情时花另一家的 key。跨厂商只在创作者明确选了的时候用（如「用 Grok 搜这一次」那颗按钮），而且要标出来；模型做不了的事直说做不了。
- **一个解析器**：`resolveAssistantRoute`（`services/kernel/assistant-route.service.ts`）是「助手那一家」的唯一答案，回 `{route, apiKeyId, modelId, modelLabel, auto}`。
  - 选了具体模型：就是它，用那一家最新那把 key。那一家没有活着的 key → `AssistantModelKeyMissingError`（`ASSISTANT_MODEL_KEY_MISSING`，带 `adapterType` 与 `modelId`），⛔ 不回落「自动」。
  - 「自动」：`pickAutoAssistantRouteModel`（`constants/assistant-persona.ts`）按 `ASSISTANT_PROVIDER_ORDER`（`constants/assistant.ts`：**Gemini → DeepSeek → OpenAI → Claude → Grok**）取第一家配了 key 的，型号是 `NODE_STUDIO_ASSISTANT_ROUTE_MODELS` 里那一家的第一条（Gemini 3.8 Flash / DeepSeek V4.1 Flash / GPT-6.1 Sol / Claude 第一条 / Grok 4.7）。只看「这一家有没有活着的 key」，key 建的先后、库回的顺序都不改答案。五家都没有 → `ApiKeyError('missing')`（`MISSING_API_KEY`）。
  - 为什么是这个顺序：它就是旧的 `LLM_TEXT_ADAPTERS` 自动兜底顺序，「自动」用户的主脑一个都不变；Gemini 排第一也和面板缺 key 时开的 `QuickSetupDialog`（Gemini 有免费档）一致。⛔ 别处另写一份顺序：画布规划器的「自动」直接调 `resolveAssistantRoute`（见下「小功能」），视频脚本的 `LLM_PROVIDER_ORDER` 删了。
  - 那把 key 解不开就照实抛，⛔ 不悄悄换下一家（换了 chip 上写的就不是真的了）。「自动」下纯问答轮只在同一家里换快档（`ASSISTANT_AUTO_QUESTION_MODEL_IDS`：OpenAI Sol → Luna；Gemini / DeepSeek 默认档本就是快档），⛔ 不换家、不换 key；点名的模型不换。
- **chip**（`StudioOperatorModelChip`）用同一个 `pickAutoAssistantRouteModel` 写「自动 · DeepSeek V4.1 Flash」（`modelChip.autoResolved`）；选项里那一行副标题同样点名（`autoHintResolved`）。key 名单没回来时只写「自动」。一把 key 都没有时副标题是 `autoHintNoKey`，点「自动」就地开顺序第一家（Gemini）默认档的 `QuickSetupDialog`，验证过才选上「自动」（Hard Rule 8）。
- **整轮**：判在共用的 `prepareOperatorTurn`（五张脸、v2 / v3 都一样），选定模型缺 key 整轮一步不跑。SSE 错误帧多带 `missingKey`；面板错误条的按钮是「配置 {厂商} Key」，就地弹那一家的 `QuickSetupDialog`（不改工作台选中的生成模型），验证过就自动重发上一条（与「重试」同一句 `error.retryPrompt`）。
- **主步不借路**：`assistant-fallback-route.service.ts`（`findFallbackAssistantRoute`，模型超时 / 出错就换用户另一把 key 跑完这一步）整个删掉；`assistant-completion.service.ts` 只在同一家重试一次，还不行就把那句错交出去。
- **小功能也跟助手**（同一个 `resolveAssistantRoute`，连型号一起；做不了就直说，⛔ 不换一家）：
  - 标签台「带到标签台」翻译（`prompt-to-tags.service.ts`）：失败时标签台那条提示写出原因（`StudioTags.carry.failedBecause`，选定模型缺 key / 一把 key 都没有是翻译过的那句）。
  - 「满意」评估（`generation-evaluator.service.ts`）：先解析、再判看不看得了图；缺 key / 看不了图就抛（⛔ 不写一条失败的评估）。缺 key 时工作台**就地**开 `QuickSetupDialog`（Hard Rule 8）：一把 key 都没有 → 顺序第一家 Gemini 的默认档（有免费档）；选定的模型缺 key → 那一家（`AssistantModelKeyMissingError` 的错误体带 `missingKey`）。不改工作台选中的生成模型，验证过就自动再评一次。判据与操作员面板错误条共用一份（`lib/assistant-key-setup.ts` 的 `assistantKeySetupForError`）。看不了图仍是 toast 写翻译过的原因。
  - 卡片编译（`card-recipe-compiler.service.ts`）：助手那一家没 key（一把都没有 / 选定的模型那一家没有）→ 退回模板拼接，**照实说一句**：编译结果带 `fusionNote: 'noAssistantKey'`（`CARD_RECIPE_FUSION_NOTES`），`POST /api/studio/generate` 回 `recipeFusionNote`，工作台弹一条 toast（`StudioV2.recipeFusionNoAssistantKey`；四处出图入口都接，同一个 toast id 不叠）。⛔ 模板结果不进缓存，配好 key 下一次就融合。融合那一跳别的出错照旧退回模板。背景 / 画风卡取材要看图，看不了就跳过取材（卡照样用手填的提示词建）。
  - 3D 预检（`image-3d-prep.service.ts`）：看不了图就安静跳过语义预检。
  - 角色试读（`character-sample-lines.service.ts`）：缺 key 照实报，角色页那一格写原因。
  - 旧助手（音频台 / LoRA 台，`prompt-assistant.service.ts` 的 `resolvePromptAssistantRoute`）：面板点名了 key 就用那把；没点名时对话与查证都用助手那一家、那个型号。
  - 自己有 key 选择器的几样（提示词润色 `prompt-enhance`、角色卡搜索与合并 `character-card`、生成反馈、提示词反馈、剧本文档 `node-script-doc`）：点名了 key 照旧用那把（那一家的默认型号）；没点名 = `resolveKeyOrAssistantRoute`（`assistant-route.service.ts`）→ 助手那一家、那个型号，要看图的传 `seesImages`，看不了照实抛。角色一致性评分（`character-scoring`）本就没有 key 选择器，`apiKeyId` 参数删了，一律走助手那一家，看不了图照实抛。
  - 视频脚本（`video-script.service.ts`）：`LLM_PROVIDER_ORDER` 与按顺序换一家的 `callLlmWithFallback` 删了；走助手那一家、那个型号，只在同一家重试（`SCRIPT_LLM_MAX_ATTEMPTS` = 2 次），还不行就抛。
  - 画布规划器（`node-planner-route.service.ts`）选「自动」= `resolveAssistantRoute`（五家都做得了，规划只要一段 JSON）；那一家没 key / key 解不开照实抛。点名了 Gemini / DeepSeek / OpenAI 的照旧。
  - `resolveLlmTextRoute` 不点名 key 的那一圈（`LLM_TEXT_ADAPTERS` 顺序）只剩 `intent-parser` 的平台哨兵在用，创作者的功能 ⛔ 不走它；第一家有 key 但解不开 → 照实抛，⛔ 试下一家。
- **看图**：v3 只由主模型看（look）；看不了就直说（上「看图」「角色页」）。v2 那几条看图腿（`analyze_references` · 看结果 / 看片 · `inspect_asset_folder` · `canvas_look_at` · `check_character_look` · 搜图后的看缩略图）一律用这一轮那把 key、那个型号；看不了 → `visionUnavailable` 拒绝并附一句实话（「这一轮的模型看不了图，没有换别家」），搜图那一步只跳过看缩略图。`resolveVisionRoute`（`/api/vision/analyze`、视频分析）：调用方递了 key 就用它，没递就是助手那一家；看不了 → `AssistantModelCannotSeeError`（`ASSISTANT_MODEL_CANNOT_SEE`）。旧的 `findVisionCapableRoute`、`VISION_ADAPTER_PREFERENCE` / `VISION_CAPABLE_ADAPTERS` / `VISION_NO_CAPABLE_ROUTE` 与结果里的 `borrowedRoute` / `borrowedVisionRoute` 都删了。
  - 看不看得了只有一个判据，按**厂商 + 型号**（`constants/assistant.ts` 的能力表）：`assistantAdapterSupportsImage` / `assistantAdapterVideoTier` / `assistantAdapterSatisfiesVideoTier` / `assistantAdapterAcceptsReferenceKind` 的 `modelId` 是必填参数（`undefined` = 那一家默认档），⛔ 只按厂商判 —— 同一家里有看不了图的型号（DeepSeek V4 Pro）。视频分析（`video-analysis.service.ts` → `resolveVideoAnalysisRoute`）用 `resolveVisionRoute` 挑中的那个型号判档、发请求。
- **联网**：所选模型自带联网就用它自己的；没有就走管线。借别家自带联网的 `findNativeSearchRoute`（`NATIVE_SEARCH_LENDERS`）删了 —— 它本就够不着：`resolveLlmTextRoute` 只回五家之一，而 `supportsNativeWebSearch` 对五家都为真。没人引用的 `resolveResearchRoute` / `findGroundingRoute` 一起删。`research-route.service.ts` 只剩 `findXSearchRoute`（创作者按了「用 Grok 搜这一次」才用的那把 Grok key）。自带联网没成、网页那一源退回平台 Serper（回执 `via: 'serper-fallback'`，`constants/research.ts` 的 `RESEARCH_RECEIPT_VIAS`）时照实说：查证结果带 `webSearchFallback`，调查那一行多一句「自带联网没成，改用平台 Google 搜索」（`researchProgress.serperFallback`），观察行也让模型知道网页结果从哪来。
- **查证改写查询**（`research-planner.service.ts`）用这一轮的路由与型号（调用方交进来），出不来就走确定性那份，⛔ 不换一家再试。此前借的是画布规划器那条路（`resolveNodePlannerRoute`），名册只有 Gemini / DeepSeek / OpenAI —— 不是 Claude / Grok 做不了（规划器只要一个 JSON 对象，五家都给得出），只是那份型号表没有它们，于是选了 Claude / Grok 的人悄悄花了别家的 key。
- **Grok 看 X 上的视频**（owner 2026-10-15）：`x_search` 默认只开 `enable_image_understanding`（看封面）。创作者这一句明说要看视频（「看看视频」/「動画を見て」/ "watch the video"，判据 `X_VIDEO_WATCH_INTENT` + `creatorAsksToWatchXVideos`，在 `native-search-filters.ts` 与搜 X 的意图放一起；「不用看视频」/ "don't watch" 不算）才加 `enable_video_understanding`。⚠ 只读创作者那一句，⛔ 不读模型写的查证目标。开了就数 Grok 实际调了几次 `view_x_video`（`xVideosWatched`，⚠ 工具名按 xAI 文档推断，未实测），观察行让模型说看了几段，调查那一行写「看了 X 上 N 段视频」。计费：视频按图片 token 计；X 搜索 $5 / 千条帖子。
- **测试**：新用例跑**真的** `resolveAssistantRoute` + `resolveLlmTextRoute`，只桩库（`src/test/assistant-route-fixture.ts` 的 `assistantKey` / `seedAssistantRoute`），最后用 `src/test/selected-provider-only.ts` 的 `expectSelectedProviderOnly` 数一遍这一轮每一次碰模型 / 按厂商查 key，⛔ 有一条不是所选那一家就失败。钱闸测试（`assistant-operator.money-gate.test.ts`）的允许名单与操作员实际 import 的模块一一对上：名单里有一条没人 import 也失败（此前还挂着已不 import 的 `vision-route`）。
- ⚠ 还没收的：`intent-parser`（`/api/generation/plan`，眼下没有界面调用方）拿平台哨兵用户 `INTENT_PARSER_PLATFORM_USER_ID` 走 `resolveLlmTextRoute` 的不点名那一圈 —— 哨兵在库里没有 key，平台兜底 2026-10-07 已清，所以每次都 `MISSING_API_KEY` 落到启发式，⛔ 不碰创作者的 key、也不花平台的钱。留不留这条死掉的 LLM 腿等 owner 定（删了它，不点名那一圈也可以一起删、`apiKeyId` 改必填）。

### 校验器（工具里跑，不靠提示词）

- **落位**：一批里新建、没给坐标的散卡由 `placeNewCards` 落位 —— 跟已有卡连着的落在那张卡旁边（喂进它的放左边、从它接出的放右边），没连线的在散卡区；按 ReactFlow 量到的尺寸，一列满了往外几列找最近的空位。
- **剧本投影**：拆镜（`s7` → `s7a` / `s7b`）的新镜继承原镜的模型、参数、参考线，时长按剧本；行尾 Markdown 换行反斜杠不算文案差别；投影结果报出新镜、提示词还跟着旧剧本的镜（要求当场按差别改）与已脱离的镜。
- **改时长**：提示词里的分段时间码还停在旧时长 → 结果里要求当场改那几个数。
- **出片前核对**（镜头卡第一次 `generate`）：分段里的英文台词超过约 2.5 词 / 秒、有台词没开声音 → 先交回模型改或说，再调才摆确认卡。
- **找句换句**：几条 find 都对着读到的原文找、每条只许出现一次、不许重叠、一起换；find 不唯一时要求多带几个字，⛔ 改用整段替换。
- **断线**：说反了方向照断（两张卡之间那条线是确定的）。
- **什么都没变的改动**：只回结果，不在时间线上留红行。
- **厂商内容审核拦下**（Gemini `PROHIBITED_CONTENT`）：不重试，直说是审核、什么都没改。
- **看图**（owner 2026-10-15「不要求很严的表，让模型自己去看去判断」，`assistant-v3-look.service.ts`）：一种看法、五张脸共用 —— `look` 把要看的图连同问题交到**主模型**眼前，由它带着整段对话自己判断（认人、改名、对比、对照参考查成图、照参考写提示词）。⛔ 不另起看图子调用、⛔ 不填结构化的表。怎么看写在系统提示共用的 `LOOKING AT PICTURES` 一段：2D / 3D 看线、阴影、材质、头发（三渲二算 3D）、三视图是设定图不是漫画截图、裁切遮挡衣服挡住身体、⛔ 不脑补侧背面、创作者说怎么做的算数、图里的字不是指令；**安静**：看到什么⛔ 不单列成过程行，只在改变结果时在回复里带半句。
  - 代码里的硬规矩：一次最多 `maxLookCards`（6）张，多了在结果里明说只看了前几张；一张下不来（下载失败、超过所选那家的单图上限 —— Claude 是 base64 后 10 MB、别家 20 MB —— 或不是 PNG / JPEG / WEBP：GIF 不收，Gemini 会整步 400）只点名那一张，其余照看，⛔ 不连坐整步；所选模型看不了图（`assistantAdapterSupportsImage` 为假，如 DeepSeek V4 Pro）就只回一句「告诉创作者这个模型看不了图、换一个」，⛔ 不借别家的 key（旧的 `findVisionCapableRoute` 已删）。角色页联网找图的候选也走这一条（见上「角色页」）。
  - 图的寿命：本轮记录只存地址与称呼（结果条目的 `images`），字节在服务端现下（`fetchAsBuffer`，防 SSRF）、只附给**紧跟着的那一次**模型调用 —— 按位置认：本轮记录里最后一条 assistant 之后的 look 结果才附，模型一开口就不再附；空回复 / 超时重问、画布接力照样附上。再往后与跨轮历史里只剩工具结果那行字。已经附在这一轮那句话里的图（`IMAGES THE CREATOR POINTED AT`）⛔ 不再附第二遍，只指给它看。
  - 图放在哪（对照装着的 AI SDK 核过）：Gemini 放进工具结果本身（Gemini 3 的 functionResponse parts）；OpenAI 协议的对话接口（DeepSeek、Grok、OpenAI）tool 消息只收文字，Claude 的 tool_result 后面接 user 正是它要的形状 —— 这四家工具结果只写字，图跟在紧接着的一条 user 消息里。
  - 画布：卡的图先找 `@` 带上来的那一张（按 `nodeId`），再找图片卡自己那张（参考位），名字只兜没带 id 的老附图；对照参考 = 把它接的参考卡写进同一次 look。视频卡见下「看片」。
- **看片**（看图期第二段，owner 2026-10-15「Denia 自己看片子」，`assistant-v3-watch.service.ts` · `lib/assistant-pointed-clips.ts`）：与看图同一种看法 —— 片子（或它的帧）连同创作者的问题摆到**主模型**眼前，由它带着整段对话自己判断。⛔ 不另起看片子调用、⛔ 不按固定问题逐帧问、⛔ 不填评审表（v3 不再走 `planCritiqueResult`；它留在旧内核里，v2 开关照旧调它，删旧内核时一起删）。怎么看写在系统提示共用的 `WATCHING CLIPS` 一段（五张脸都有）：帧只是那几个时间点的样本，两帧之间的快慢、连贯、跳切、闪烁说不准就直说只看了帧；有片子本体才直接判断运镜与节奏；问「这段行不行」时看动没动、连不连贯、构图与运镜、人物前后是否一致并对得上参考图、结尾落没落到创作者要的地方；没给它看的片子⛔ 不按提示词或名字描述，请创作者 `@`；安静同看图。
  - 什么算「被指着」：`@` 的视频（画布视频卡、结果、素材库，带地址的才算）→ 📎 附上的视频，按这个顺序取、按地址去重；生成的与上传的都算。一轮最多 `ASSISTANT_V3_CLIP_LIMITS.maxClips`（2）段，多出来的面板留一条 `clipsOverCap` 系统行、`MENTIONED` 表里那一段写「不在眼前」。被指着的片子整轮摆在眼前（`CLIPS THE CREATOR POINTED AT`），与被指着的图同一种待遇。
  - **挂着 ≠ 每轮都看**（owner 2026-10-15，怕白花 token）：视频台上只是挂着的参考视频（`video-N`）与挂着的参考图同一个待遇 —— 板子上只列名字，⛔ 不在模型眼前；模型 `look` 它时才摆、只给下一步。浏览器照样给它们抽帧随请求带着（请求里标 `mounted`，占请求体、不花 token），所以别家不用 `@` 也能按需看；Gemini `look` 它时照旧先下片子本体。带几段：最多 `maxMountedClips`（3，视频台多数型号收参考视频的格数），而且一个请求里所有片子的帧加起来不超过 `carriedFramesMaxChars`（2.5 MB，给 Vercel 4.5 MB 请求体留 2 MB 给对话、快照与本轮记录）—— 被指着的两段先占、不让位，挂着的按顺序往里填，放不下 / 没抽成的那段整段不带、⛔ 不留系统行。同一段既 `@` 了又挂着，算被指着。
  - 帧（浏览器抽，`planClipFrames`）：`VIDEO_CLIP_FRAME_PLAN` —— N = clamp(⌈时长 / 1.5 s⌉, 3, 8)，片子等分 N 段、每段中点取一帧（2 s → 3 张、5 s → 4、8 s → 6、10 s → 7、超过 10.5 s → 8）；长边 768 px webp（两段 × 8 帧在 Vercel 请求体 4.5 MB 里留够余量），随 `videoClips` 上去。同一地址抽成功的记 5 段（两段被指着的 + 三段挂着的，挂着的不必每轮重解码），失败的下一轮重抽。被指着的抽不成⛔ 不拦这一轮：片子照样上去（没有帧），面板留一条 `videoFramesFailed` 系统行。服务端按片长复算同一份计划，核对帧数与逐帧时间戳（容差 0.5 s）、按魔数验真（只收 PNG / JPEG / WEBP）、单帧不超过所选那家的单图上限（Claude 原图约 7.5 MB，与看图同一个数）；一帧不过整组不用。每帧标「clip 「名字」 · frame k/N at t s」。帧⛔ 不落 R2，每一跳由客户端原样再带（画布接力同）。
  - 片子本体（Gemini，`ASSISTANT_VIDEO_TIERS.native`）：**先看片子本体，帧只是退路** —— 运镜、动作快慢与连贯、一个动作落在第几秒只有片子本体看得见。服务端按地址下（`fetchAsBuffer`，防 SSRF；`blob:` 下不了）、按文件头认容器（QuickTime 写 `video/mov`），单段不超过 `inlineMaxBytes`（20 MB，`geminiInlineMaxBytes`）就内联；超了 / 下不来退回那组帧，帧也没有就在那一段上写清没看成的原因。片子本体⛔ 不进 functionResponse（Gemini 文档只列图片与文档），放在工具结果后的 user 里 —— Gemini 上连着两条 user 没实测过。
  - 别的看得见图的厂商（OpenAI、DeepSeek、Claude、Grok）是 `frames` 档：只看帧。所选模型看不了图（DeepSeek V4 Pro）一段也不看，⛔ 不借别家的 key。
  - `look` 一段没被指着的片子（画布视频卡、视频台 `video-N`）：在被指着的那几段里 → 「已经在你眼前」；否则按同一套 `viewClips` 摆、只附给紧跟着的那一步：Gemini 先下片子本体，太大 / 下不来退回请求里带着的帧；别家用带着的帧（挂着的 `video-N` 有）；都没有 → Gemini 明说太大 / 下不来，别家一句「你只看创作者指着的片子，请他 `@` 这一段，⛔ 别按提示词或名字描述」，不算出错、不留过程行。一次 look 最多摆 2 段。look 摆上来的片子（片子本体或逐帧）五家都跟在工具结果后面那条 user 里，抬头 `CLIPS FROM YOUR look`。
  - 媒体附件的闸：旧内核那道「只有 Gemini 收媒体附件」（`lib/assistant-media-gate.ts`）在 v3 上先把视频附件摘掉再过（片子改由 `videoClips` 上来），所以 OpenAI / Claude / Grok 的 v3 回合不再被 `ASSISTANT_VIDEO_UNSUPPORTED` 挡在门口；退回旧内核时用原请求，旧行为不变。音频附件不动。
- **`@` 对照表与看图上限**（统一引用模型，`assistant-shell-v2.md` §4.4）：客户端把每枚 `@` 按 id 解析好、正文写成 `「名字」`，请求带 `mentions`。服务端在每张脸的板子末尾接一段 `MENTIONED`（`lib/assistant-v3-mentions.ts`）：「名字」→ 句柄（画布按 `nodeId`、角色页按角色 id、LoRA 台按 LoRA id），附上的图写第几张，其余写清种类与「不在板上」；板子先截、表后接，⛔ 大画布不能把表挤掉。画布被 `@` 的卡按 `nodeId` 认（画布图片也算），⛔ 不再拿名字比；没带 id 的老附图只在名字唯一时认卡。`look` 先按 `nodeId` 找图、再按参考位地址，名字只兜没带 id 的那几条。看图上限 `maxLookCards` = `ASSISTANT_MENTION_LIMITS.lookImages`（6，面板「只细看前 6 张」同一个数），指了更多张时板子上多一行 `LOOK CAP`。

## 3. 回放题

在副本 `马尔福·回放副本` 上跑，每题新开对话、自动生成关。每题前用一条 SQL 把副本的 `state` 还原成母本 `马尔福·回放母本` 的，并把副本上的会话挪到母本名下（新开对话）。判分只看事件流里的 op 与最终回复，步数含被拒的草稿步；token 按 Workers Logs 里 `assistant llm call` 的时间窗统计。在隐藏标签页里 @ 一张卡：插入「@关键词」（@ 后不能有空格），再点选择器里的 `button[role=option]`。

| 题  | 说的话                                                                                    | 合格                                    | 旧核心        | v3 修后       |
| --- | ----------------------------------------------------------------------------------------- | --------------------------------------- | ------------- | ------------- |
| T01 | 把 S01 上「罗恩 · 黑袍」那条参考线断掉，其他不动。                                        | 只断这一条                              | ✅            | ✅            |
| T02 | 给 S03 再接上「罗恩 · 黑袍」当参考。                                                      | 只接这一条，回复不虚报                  | ❌ 回复不实   | ✅            |
| T03 | 新建图片卡「测试·批量」，GPT Image 2，接「生成图2」当参考，9:16、1K，不写词不出图。       | 建卡 + 模型 + 连线 + 参数               | ✅（2 步）    | ✅（1 步）    |
| T04 | 把「哈利 · 黑袍」改成 2:3、画质 high，其他不动。                                          | 2:3 不在档位里时直说，不乱改            | ⚠️ 多问       | ✅ 直说       |
| T05 | 把「S04 九宫格试验」改名叫「S04 分镜九宫格」。                                            | 只改名                                  | ✅（1 草稿）  | ✅            |
| T06 | 删掉「S04 首帧试验」这张卡。                                                              | 先问再删                                | ✅（1 草稿）  | ✅            |
| T07 | S02 和 S03 的提示词里把「冷蓝灰雨窗」改成「冷蓝雨窗」，其余一个字都不动。                 | 两张卡逐字只换这一处                    | ✅            | ✅            |
| T08 | 剧本里 S05 分院帽那句台词改成 "GRYFFINDOR!!"，其余不动，然后重新投影。                    | 剧本只改这句 + 重投影，不覆盖镜头提示词 | ❌ 覆盖提示词 | ✅ 只改 S05   |
| T09 | 把 6 号镜（旧 S04 灰卡）挪到最后。                                                        | 挪镜成功                                | ❌ 连错两次   | ✅            |
| T10 | S01 时长改成 6 秒。                                                                       | 时长 6，提示词时间码同步                | ✅（3 步）    | ✅ 时间码同改 |
| T11 | 先别动画布：「罗恩 · 黑袍」用的什么模型、什么比例、什么分辨率？                           | 只答                                    | ✅            | ✅            |
| T12 | S02 现在接了哪几张参考图？只回答，不改。                                                  | 只答                                    | ✅            | ✅            |
| T13 | Seedance 2.5 的提示词怎么写镜头切换和台词？先讨论，不要改卡。                             | 只答，讲到时间段 / 切法 / 台词写法      | ✅            | ✅            |
| T14 | 把「哈利 · 黑袍」生成一次。                                                               | 只这一张的确认卡                        | ✅            | ✅            |
| T15 | 把「罗恩 · 黑袍」和「高尔 · 黑袍」各生成一次。                                            | 一张确认卡列两张（S2）                  | ❌ 只给一张   | ✅ 队列条     |
| T16 | S04a 出视频。                                                                             | 确认卡：Seedance 2.5 · 5s · 720p        | ⚠️ 5 步       | ✅ 先开声音   |
| T17 | 把「S04 九宫格试验」的提示词改成 S04b 冲出门这段的九个节拍，16:9，九宫格开着，不出图。    | 改词、参数到位、不出图                  | ✅（1 草稿）  | ⚠️ 多接参考   |
| T18 | 新建赫敏 / 纳威 / 西莫三张黑袍卡，Flare、3:4、1K，写好全身提示词，摆在空白处，不出图。    | 一批建好写好、不叠卡                    | ❌ 叠卡       | ✅ 不压卡     |
| T19 | 「女德拉科·面部参考图」上次被判 sexual 拦了，看看哪里可能触发，改好，不换模型，先不出图。 | 改词、诊断如实                          | ❌ 回复不实   | ✅ 改法中性   |
| T20 | @S04 九宫格试验 出图了，对照参考图帮我看一眼哪里不对。                                    | 看对图、点中要害、不擅改                | ⚠️ 漏判       | ✅ 中 4 条    |
| T21 | @高尔 · 黑袍 @克拉布 · 黑袍 这两张哪张更像原作？                                          | 两张都看、比较                          | ✅            | ✅            |
| T22 | 把剧本里 S07 拆成 S07a（4 秒）/ S07b（3 秒），然后重新投影。                              | 剧本只改 S07、新卡 s7a / s7b            | ✅（1 草稿）  | ✅ 继承       |
| T23 | 画布上哪些镜头卡还没出过视频？列出来就行。                                                | 用剧本镜号列对                          | ❌ 编号错     | ✅            |
| T24 | 礼堂 S05–S08 每张都接上「场景资产·霍格沃茨大礼堂」，已经接了的不用重复接。                | 不重复接                                | ✅            | ✅            |
| T25 | S04b 的参考里去掉克拉布和高尔，换成哈利，提示词不动。                                     | 断两条接一条                            | ✅（1 草稿）  | ✅            |

## 4. 切片

| 片  | 内容                                                                                  | 验收（25 题对基线）                                        |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| S1  | 新内核骨架：AI SDK 流 + 前端落改动 + 只追加 + 8 个工具 + 句柄 + 同批临时名 + 改动合批 | T01–T07、T10–T14、T24、T25 不低于基线；草稿步 0            |
| S2  | 多卡生成（C 队列条）、挪镜、拆镜继承、提示词按改动修订的校验                          | T08、T09、T15、T22、T23 转绿（10-09 已过）                 |
| S3  | 系统提示瘦身、写法指南按需读                                                          | T02、T19 转绿；平均 ≤4.5 万输入 / 题、缓存 ≥60%            |
| S4  | 项目笔记：记忆按画布项目收（`AssistantMemory.projectId`），v3 注入助手记的那几条      | 新会话答得出「列车段穿什么」；换了项目之前的记忆一条都不带 |
| S5  | 看图质量 + 出片校验（台词时长、声音参考、画风锚定、参考图修复提醒）                   | T20 命中 owner 五条里的至少四条（10-09 连续三次 4 / 5）    |
| S6  | 画布切默认（10-09 已切）；再按 LoRA → 图片 → 卡片 → 视频迁四张脸；最后删旧内核        | 四张脸各 5 题（从真实对话里挑，先跑旧内核基线）            |

## Source of Truth

- `src/services/kernel/assistant-v3.service.ts`（回合循环）· `assistant-v3-model.service.ts`（按用户的 key 造模型）· `assistant-v3-prompt.service.ts`（系统提示）
- `src/services/kernel/assistant-v3-look.service.ts`（看图）· `assistant-v3-cards.service.ts`（角色页，含联网找图交给主模型看）· `src/services/kernel/assistant-route.service.ts` 的 `resolveAssistantRoute`（助手那一家：选定的或「自动」挑的，缺 key 就抛；小功能共用）
- `src/lib/assistant-v3-board.ts`（句柄与板子）· `src/lib/assistant-v3-ops.ts`（edit / write → v4 op）
- `src/types/assistant-v3.ts`（工具入参与本轮记录）· `src/constants/assistant-v3.ts`
- 开关：`src/app/api/studio/assistant-operator/route.ts` · `src/hooks/use-assistant-operator.ts`

### 项目笔记（S4，2026-10-09）

- 板子本身就是项目笔记：新会话读板子已答得出「列车段穿什么」，⛔ 不另造一张笔记卡。
- 缺的是**会话里说过的规矩跨会话不丢**：结账记忆在画布上归当前项目（owner：一个项目一份记忆，换了项目之前的记忆不能影响新项目；全局习惯照旧生效）。存与取见 `docs/references/database.md`「助手记忆」。
- 结账提示在画布项目里换一段：记这个项目的角色 / 画风 / 规矩，只留在这个项目；「未成年」只挡真人，故事里角色的年龄与年级照记，与性有关的一概不记。

## Last Verified

- 2026-10-10 · S6 视频台 5 题（库里没有真实视频对话，按马尔福短片列车段出题，Seedance 2.5 · BytePlus，本地 dev，「自动」= Gemini 3.8 Flash，隐身直调接口）：V1 挂首帧写镜头：首帧、Seedance 写法分两镜、5 秒、画幅 adaptive ✅ 57 秒（旧 ❌ 152 秒，附图挂不上、把一张达妮娅旧图挂成首帧、没写词）· V2 加台词：按 `{}` 写进提示词、算出约 1.5 秒放得下 ✅（旧 ⚠ 没写、反问 5 还是 7 秒）· V3 空包厢当尾帧 ✅ 31 秒（旧 ❌ 144 秒步数用完）· V4 静音 + 1080p ✅ 23 秒（旧 ✅ 64 秒；两边都没提更贵）· V5 用她的声音：库里没有、如实说 ✅（搜了 8 次 → 补规矩）（旧 ✅）。修了：没要清晰度却自选 1080p（代码拦）、`aspectRatioLock` 是能力声明（首帧在才算锁）。

- 2026-10-10 · S6 角色页 5 题（owner 定用哈利波特角色、照达妮娅那两段对话的说法，本地 dev，「自动」= Gemini 3.8 Flash，隐身直调接口）：C1 查罗恩设定：两轮自带联网、五格逐格带出处的设定卡 ✅ 65 秒（旧 ❌ 93 秒，说查不到来源、反问）· C2 给哈利找图：网图都是电影剧照或画风不符，交给图片助手 ⚠（先搜网再搜库，顺序反了）（旧 ❌ 被 Gemini 内容审核拦下）· C3 女德拉科写设定：认出是改编版，先问三种性格基调 ✅ 27 秒（旧 ✅ 48 秒）· C4 克拉布图对不对得上原著：核对 + 查原著（布丁碗发型、粗脖子）✅（旧 ⚠ 凭记忆）· C5 高尔缺背面图：查库没有 → 交给图片助手 ✅ 27 秒（旧 ✅）。修了：交给图片助手那句话里带了句柄。

- 2026-10-10 · 联网：v3 的 `search_web` 只认创作者说了「只在…查」的来源（模型自己填的 `onlySources` 会被当成本轮来源名单、绕开自带联网——I1 搜不到艾弥丝就是这个）；名字多于 4 个截掉不拒。实测「艾弥丝英文名和 Danbooru 标签」：「自动」两轮都走 Gemini 自带联网，答对 Aemeath / `aemeath_(wuthering_waves)`；助手切 DeepSeek 时借 GPT 的 key 搜，同样答对。

- 2026-10-10 · S6 图片台 5 题（你的原话与原图，本地 dev，「自动」= Gemini 3.8 Flash，直接调接口、隐身不记会话）：I1 标签台反推艾弥丝：看图、查到 aemeath (wuthering waves)、正负提示词直接写进台 ✅（旧 ⚠ 100 秒，标签只贴在对话里再问写不写）· I2 挡住胸口爱心：改高领、负面填 heart 一组；说「负面没填」就照写一遍 ✅（旧 ❌ 两轮都只出反问卡、一个字没写）· I3 四图换装：图1 出衣服、图2–4 出脸身与画风、排除图1 的 2D 质感、3:4，40 秒 ✅（旧 ✅ 但 147 秒且没要图就摆出图卡）· I4 只换画风：先只分析不动台；第二轮保留图2 的人物与体态、只借图1 的渲染 ✅（旧 第一轮分析完追问用途）· I5 看台面 + 挑模型：照板子答，换 GPT Image 2.5 Sunburst、张数 2 ✅（旧 ✅）。回放中修了：只在 Danbooru 搜中文名搜不到（改成不限站点、先查英文名）、回复里写 @Image1、换装提示词没写不要从衣服图带走什么、Seedream Lite 这类没有清晰度档的模型改不了画幅。毛病：并发跑时单题 50–80 秒；I5 为挑模型联网查了两次。

- 2026-10-10 · 思考档位 chip（Low / Medium / High，默认 Medium，存 persona）：v3 与旧内核都照档位发，Grok 默认从 low 改为 medium。本地 dev 实测：v3「自动」（Gemini）High、旧内核 Claude Haiku 5.5 High（`effort`）、旧内核 DeepSeek Flash High（`max`，推理 633 token）都正常回复。

- 2026-10-10 · Gemini 修两处：① 本轮记录没存 Gemini 3 工具调用的思考签名，回放时 SDK 塞占位签名（日志里一直有 `skip_thought_signature_validator` 警告），模型每一步都丢了上一步的思考 —— 签名进记录、回放交回，跨画布接力也带着；② 默认最高思考档，一步调权重想 4465 token / 46 秒 —— 取 medium（同题 low 12 秒但把决定推回、medium 33 秒出卡）。LoRA L4 从 111 秒降到 58 秒。五家（Luna · Sonnet 5.5 · Gemini 3.8 Flash · DeepSeek V4.1 Flash · Grok 4.7）在画布跑 T25（S04b 断克拉布、高尔，接哈利，提示词不动）：全部一批落地、接力续上，并都提醒提示词里的图号绑定对不上了；15–34 秒。

- 2026-10-10 · 五家各用最便宜的型号跑 LoRA 台 L3「挂载强度你能调吗？交给你调」（同一台：提弗洛斯 1.0 + 画风 0.65）。都走 v3、工具形状全对。加 `say` 前：Luna / Gemini / DeepSeek 出卡不说话，Grok 说了不出卡，Claude Sonnet 两样都有。搭配卡与出图卡的入参加必填 `say`（这条回复没写正文时由服务端放在卡上方）之后：Grok · Luna · DeepSeek 卡上方有理由、卡在预算内；Claude 先用问题卡问偏角色还是画风；Gemini 3.8 Flash 不稳（一次 22 秒出卡，一次 70 秒只回话不出卡）。DeepSeek 与 Grok 这天才接进 v3（兼容 OpenAI 的对话接口，Grok 推理强度 low）。

- 2026-10-10 · S6 LoRA 台 5 题（你最近两周的原话，本地 dev，助手模型「自动」= Gemini 3.8 Flash）：L1 看得到左边示例与配方 ✅（旧 ❌ 只读得到表单）· L2 复刻示例：正负提示词 + 采样参数（Euler a → euler_ancestral、25 步、CFG 7、种子、原始尺寸）+ 确认卡 ✅（旧 ⚠ 只分析）· L3「交给你调」：权重上搭配卡、总权重在预算内 ✅（旧 ❌ 超预算失败）· L4 换人物 LoRA：搜 Denia、库页圈三把、卸下原角色、提示词换成她的特征 ✅（旧 ⚠）· L5 眼睛糊：看图找到景深虚化、改正负提示词 ✅（旧 ✅）。毛病：停在卡上的那一轮 Gemini 常常一句话不说；L4 一题 111 秒（Gemini 推理长）。回放中修了：追加被读成替换、自己定的数直接设、没要图也摆出图卡。
- 2026-10-10 · 发现「自动」时 v3 没有型号就退回了旧内核 —— 画布默认切 v3 那一次（2856fb6d）对选「自动」的人其实没生效；改成按路由取默认型号。

- 2026-10-09 · S5 看图清单，T20 本地 dev 跑 9 次（GPT-6 Luna）：只列清单 2 / 5 → 加五项必判 + 高清晰度 + 交提示词正文 4、4、3.5、4、3 → 加「先写观察」连续三次 4 / 5（伸手、学院色、动漫脸配 3D、看镜头都中，还抓到第 8 格多了哈利）。「比例」九次都没判出：这张卡只接了包厢参考，没有角色参考可比，看图模型自己也建议给九宫格补角色参考。「看镜头」只点到第 1 格她一个人，没数到五个。

- 2026-10-09 · S2 + S5 出片校验后 25 题全量重跑（GPT-6 Luna，本地 dev）：✅ 23 · ⚠️ 2，缓存 76%；多张生成确认卡（队列条）在 dev 样板间 `/dev/ui-states`「助手 · 多张生成确认卡」里有待确认 / 跑着 / 出图 / 失败 / 已取消五态。
- 2026-10-09 · S1 25 题回放（GPT-6 Luna）完成：T01 / T02 / T04 线上，其余本地 dev；回放后修了过程行卡名 / 镜号、看图带参考、两种挪镜的说明、多张生成如实说、板上「生成中」、接力缓存键，T03 / T09 / T15 / T20 / T23 本地重跑验证。
