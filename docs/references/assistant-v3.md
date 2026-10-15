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

| 工具           | 管什么                                                                               | 交给旧执行器的哪一步                                        |
| -------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| read           | 卡的全文、连线、参数                                                                 | 服务端直接渲染（`read_state` 过程行）                       |
| look           | 把要看的图（被 @ 的、卡上的、参考位的）连同问题交到主模型眼前，只附给紧跟着的那一步  | ⛔ 不交旧执行器（`read_state` 过程行）                      |
| edit           | 建卡（带模型 / 参数 / 提示词）、设名字模型参数、连线、断线、删卡、挪镜、投影剧本     | `canvas_batch`                                              |
| write          | 一张或几张卡的提示词 / 正文：替换、追加、找句换句                                    | `canvas_batch`                                              |
| generate       | 生成确认卡：几张合成一张队列条（方向 C）；镜头卡先过出片前核对                       | `canvas_generate`                                           |
| search_web     | 联网查                                                                               | `research`                                                  |
| search_library | 素材库；`kind: "web_images"` 联网找图、`kind: "web_videos"` 联网找视频（每张脸都开） | `search_assets` / `search_web_images` / `search_web_videos` |
| ask            | 反问（≤4 题、每题 2–6 项；`multiSelect` 多选；选项 `image` 句柄换缩略图；`why`）     | 问题卡                                                      |

### 一张脸一个适配（S6）

- 各张脸共用一层「步骤」（`assistant-v3-steps.service.ts`：过程行、调旧执行器、把计划变成步与工具结果）。差别只在改动型那一步：画布要前端落完再接力（`pending`），工作台随步落、当场就有结果。两张工作台脸（LoRA 台、图片台）再共用一层 `assistant-v3-bench.service.ts`：写提示词、看图、出确认卡、卸参考图（旧执行器的 `slotIndex` 从 1 起）。看图五张脸再共用 `assistant-v3-look.service.ts`。
- 五张脸都设 `run.skipReferenceReview`：写提示词、出图前⛔ 不另起一次看参考图的子调用（图片台的参考图证据简报、LoRA 台的参考图补读、画布的 `checkCanvasReferencePrompt`）。要看就用 look。
- **LoRA 台**（`assistant-v3-lora.service.ts` · `lib/assistant-v3-lora-board.ts`）：工具名不变，动的是一张表单。板子一行一格：底模、提示词、负面、采样参数（附可选的采样器 / 调度器）、挂着的 LoRA（句柄 `lora-cmg1ab`，权重、开关、触发词在不在提示词里、合不合底模）、总权重与这台底模的上限、参考图 `ref-N`、左边打开着的示例（`sample`，图跟着板子给模型看，配方写在板上，全文用 `read`）。
  - edit：`set_model` · `set_params`（Civitai 的采样器名照认）· `set_weight` · `unmount` · `unmount_reference` · `propose_setup`（搭配卡）· `show_picks`（库页圈选）。新挂 LoRA 只走搭配卡或圈选，挂载由创作者点；助手自己定的权重 / 参数也上卡，创作者说了确切数值或要照抄配方才直接设。
  - write：提示词 / 负面，替换 · 追加 · 找句换句；⛔ 不再问「你写过了，覆盖吗」（创作者叫助手改就是要改，每步可撤）。追加由 v3 拼好整段再写。
  - search_library：`kind: "lora"` 在库页当面搜，另有 `web_images` / `web_videos`（见下「找图 / 找视频」；这一台没有导入工具，找到的图只能由创作者点「选用」挂到下一句话）；look：@ 来的图 · `ref-N` · `sample`（示例图已跟着板子附上，look 只指给模型看）；generate：只在创作者要图时摆确认卡。
  - 系统提示的方言段只注入当前底模那一族（`lib/lora-dialect-section.ts`，旧内核同用）。
- **图片台**（`assistant-v3-image.service.ts` · `lib/assistant-v3-image-board.ts`）：自然语言台与标签台同一张脸。板子一行一格，每个旋钮带可选值：模型（多渠道的列出渠道）、提示词、负面（模型没有负面就说没有）、画幅 / 清晰度 / 质量 / 背景、每次张数、模型选项（`set_option` 按 key）、标签台的分角色与画面文字、参考图 `ref-N`。
  - edit：`set_model`（带渠道）· `set_specs`（没说的那一格沿用台上的值；没有清晰度档的模型写 auto）· `set_count` · `set_option` · `mount_reference`（按附图名或检索结果的资产 id）· `unmount_reference` · `import_url` · 标签台 `set_people` / `set_scene_texts`。
  - 写提示词不走旧内核的「参考图证据简报」闸（`run.skipReferenceReview`，五张脸都设）：v3 的模型自己用 look 看参考图再写。NAI 标签核对照旧（查不到的退回改写一次）。
  - search_library：自己的素材，或 `kind: "web_images"` 联网找图（结果摆在面板上由创作者选用；2026-10-15 起网格摆在回答正文底下，见 `pages/assistant-shell-v2.md` §3.5「找到的图」），或 `kind: "web_videos"` 联网找视频（见下「找图 / 找视频」）。
  - 系统提示的方言段是选中模型的写法（与旧内核同源，旧工具名换成 v3 的说法）。
- **视频台**（与图片台同一个服务与板子，按 `face` 分）：板子多出时长、首尾帧（首帧挂上后画幅按 `aspectRatioLock` 锁死；没挂只是能力声明）、参考视频、参考声音（属于哪个角色）、原声三态开关。
  - edit：`set_specs`（时长 / 画幅 / 清晰度各自独立）· `mount_reference`（slot `first` / `last` / 参考）· `unmount_reference`（`ref-N` / `first` / `last`）· `mount_audio` · `set_sound` · 与图片台同形的 `set_model` / `set_option` / `import_url`。
  - ⭐ 清晰度是花钱的那一格：创作者话里没提清晰度（1080p、清晰度、分辨率…）就不改 —— 写在代码里，提示词管不住（回放 V1 两次自选 1080p）。
  - 系统提示沿用旧内核的视频规矩：按时间写动作与运镜、台词按时长（约 2.5 词 / 秒）、首尾帧是具名槽、原声只在创作者要时动、声音参考搜一两次没有就直说。怎么看片不在视频规矩里，在五张脸共用的 `WATCHING CLIPS` 一段（见下「看片」）。
- **角色页**（`assistant-v3-cards.service.ts` · `lib/assistant-v3-cards-board.ts`）：不改任何东西 —— 没有 write / generate，三种 edit 都是提议，出卡、停下等创作者勾（服务端不写库）。板子：角色名册用句柄（`char-b27ce8`，同名角色不止一位）、打开那位的五格设定与标签，卡上的图跟着板子给模型看（`card-1` …）。
  - edit：`propose_profile`（逐格带出处）· `propose_images`（本轮检索到的资产 id，或找到的图的号 `#3` —— 这一轮或上一轮的，服务端换回地址；⛔ 模型不写地址）· `hand_off`（交给图片助手；那句话里的句柄服务端换回角色名）。一条回复只走第一份提议。
  - read：设定某一格全文，或一个网址（读 wiki 角色页 / 故事页 / 语音页）；look `card` / `card-N`：创作者问图与设定对不对时，指给模型看卡上的图（前 6 张已跟着板子附上，再往后的才附），由它自己对 —— 只比身份（发色、瞳色、肤色、年龄、体型、种族、伤疤犄角），衣服、姿势、表情、背景、画风不算。⛔ 不再另起 `check_character_look`（v2 照旧）。
  - search_library `kind: "web_images"`（联网找图，owner 2026-10-15「一种看法」）：搜完把候选的缩略图当一次 look 交给**主模型**（`searchWebImagesAndLook`），按找到的东西的号（`#n`，与卡片上、模型读的那一行同一个号；过程行「候选 #n」），由它对照卡上的图与设定自己判断哪几张是这位。走 look 的硬规矩：只附给紧跟着的那一步、一次最多 6 张（多出来的点名）、一张下不来只点名那一张；标了 view only 的挂不上卡，⛔ 不占看图名额。所选模型看不了图：结果里明说「没人看过这些候选、只凭标题」，由模型照实告诉创作者。⛔ 不另起看缩略图的子调用（v2 的 `inspectWebImageCandidates` 跑在视觉顺位挑中的那一家，会悄悄借别家的 key）、⛔ 没有藏起来的判定去筛 `propose_images`：v3 设 `run.mainModelLooks`，旧执行器的搜图那一步只搜、只列，不写判词、不按判词丢图。
  - search_library `kind: "web_videos"`：与别的脸同一条（只搜、只列，⛔ 不走 look —— 视频没有能交给模型看的那一帧）。
  - 系统提示沿用旧内核的角色页规矩：设定四部分 + 外观一句、原作先查原文、改编角色按原作改写或先问方向、原创先问方向、好图的标准、换衣不算矛盾。

### 找图 / 找视频（每张脸都开，2026-10-15 搜索期第二片）

- `search_library` 的 `kind` 除了自己的素材（`image` / `video` / `audio`，LoRA 台是 `lora`），**每张脸**都多两种：`web_images`（联网找图）与 `web_videos`（联网找视频）。入参多一个可空的 `subject`（作品 + 角色，只有找图用它铺多语言查询）。路由在 `assistant-v3-bench.service.ts` 的 `runWebFind`：`web_images` → 旧执行器 `search_web_images`（`preferOfficial`），`web_videos` → `search_web_videos`；角色页的 `web_images` 仍走 `searchWebImagesAndLook`（上面那条）。两条描述的文案只有一份（`ASSISTANT_V3_WEB_IMAGES_KIND_DESCRIPTION` / `ASSISTANT_V3_WEB_VIDEOS_KIND_DESCRIPTION`，`constants/assistant-v3.ts`），系统提示每张脸的工具段各有一行（`WEB_VIDEOS_LINE`）。
- **找视频**（`services/web-video-search.service.ts`）：平台的 Serper `/videos`（`SERPER_API_KEY`）+ 已有的 B站连接器（中文查询或点了 B站才打），两路并发、按嵌入地址去重、最多 8 条。⛔ 不走模型的自带联网、⛔ 不碰创作者的模型 key（钱闸测试锁源码）。来源名单照样管（`filterResearchSources` / `filterEvidenceIndices`）。
- **模型拿到什么**：每支一行 `#n · 标题 · 频道 · 平台 · 时长`，外加「你没看过这些、只凭标题判断」「⛔ 别导入、别把视频地址写进提示词、用 #n 指代」。整卡数据（封面、域名、日期…）只走步骤事件给面板。2026-10-15 第三片起找图同样一行一条、与视频共用一套号，见下「找到的东西的编号 `#n` 与查证短版」。搜空了：⛔ 编视频 / 链接，换一次说法（作品官方名、原文名、PV / trailer / tutorial）再说没有。
- **面板**：找到的视频是一排 16:9 卡片，摆在回答正文底下、找到的图下面；点一张在面板里用官方嵌入播（YouTube nocookie / B站 / niconico / Vimeo），认不出稿件号的新窗口开 —— 见 `pages/assistant-shell-v2.md` §3.5「找到的视频」与 §9.4。
- ⚠ 找图的结尾句按这张脸够得着什么写：只有图片台 / 视频台（`modelCanImportWebImages`：画布 ⛔、v3 LoRA 台 ⛔）提「也可以用 import_url 挂」，别的只说「创作者点『选用』」—— 指一条走不通的路，模型就会去走。

### 找到的东西的编号 `#n` 与查证短版（2026-10-15 搜索期第三片）

附录 I 原文：「结果卡的完整数据（缩略图、原图、链接、时长、尺寸）直接随事件下发给面板，**不进模型上下文**。」「模型只拿到一行一条：`#3 · 标题 · 域名 · 1920×1080 · 可当参考`。查资料类保留短摘要，全文按需再读。」「模型回复里写「#3 最接近你要的」，面板把第 3 张高亮。」下面除引号里的原文外，都是实现时的取舍。

- **一套号**：联网找到的每张图、每支视频按找到的顺序编号（`run.webFindSeq`），一轮里跨步、跨接力不撞号；与查证的证据号 `[n]`（`run.evidenceCiteSeq`）是两套，⛔ 不合并。号 → 那一条的数据只活在本轮记录里：结果条目的 `finds`（找图 / 找视频）与 `sources`（查证 `[n]` → 地址），板子上的 `finds` 是上一轮带来的。每一跳开头 `seedV3WebFinds`（`assistant-v3-finds.service.ts`）按记录把连号、`[n]` 的连号与导入准入名单（`run.webImageIndex`）续上 —— 服务端不留会话态。
- **模型拿到什么**：每条一行（`lib/assistant-web-finds.ts`）—— 图 `#n · 标题 · 域名 · 宽×高 · usable as reference / view only`，视频 `#n · 标题 · 频道 · 平台 · 时长`，缺哪格少哪格。⛔ 原图、缩略图、页面地址都不进模型看的东西，整卡只随步骤事件给面板。「能不能当参考」每次由服务端按域名现判（`judgeWebImageFind`），⛔ 不信往返带回来的那一格。
- **按号动手**：图片台 / 视频台的 `import_url` 与 `mount_reference`、角色页的 `propose_images`（入参 `find`，取代原来的 `imageUrl`）收 `#3`，服务端按本轮或上一轮的记录换回地址（`pickV3WebImage`）。认不出的号 / 两轮以前的号 / 视频的号回一句说得清的话（号的范围、「先搜再用号」、「视频只是链接」），⛔ 不抛；view only 的图照旧被导入那一步拒。视频台的 `#n` 只能当参考图，⛔ 不当首尾帧。
- **系统提示**：五张脸共用一段 `FOUND ON THE WEB`（`assistant-v3-prompt.service.ts`）：号怎么来、一行写什么、工具与回复里都用号、⛔ 写地址、view only 与视频不能导入 / 挂 / 提议、上一轮的那几行、`[n]` 是另一套号、整段摘录只给紧跟着的那一步。工具段：图片台 / 视频台「创作者说用哪张才挂」，角色页 `propose_images` 按号。`ASSISTANT_V3_PROMPT_VERSION` 拨到 `2026-10-15b`。
- **下一轮**：前端从时间线上一轮的找图 / 找视频步骤收（`collectOperatorPriorFinds`，只上一轮、按号去重、最多 `ASSISTANT_WEB_FIND_LIMITS.maxCarried` = 16 条；答题 / 定卡那几行也算开了新的一轮，与服务端同一刀），开轮请求带 `priorFinds`；开轮那一跳冻进板子，模型在这句话后面读到 `FOUND ON THE WEB LAST TURN` 那几行（只有编号那一行），接力那几跳读板子、⛔ 不再读请求。号从上一轮最大号 +1 接着数，同一个号始终指同一张卡。再往前的号作废。
- **查证短版**（附录 I 原文：「**费 token**：一次搜索最多 6×300 + 3×1600 字的摘要写进本轮记录，之后每一步都重发（最多 16 步）。」）：`research` 那一步的结果条目多存一份短版 `compact`（`buildResearchCompact`：每条 `[n] 标题 · 域名 · 一句话`，单源的打 `single source`，加结论与「怎么再读」）。紧跟着查证的那一次调用读整段；最后一条 assistant 之前的结果一律读短版（`transcriptMessages`，与 look 的图同一个「新不新」判据）。要全文：`read "[n]"`（五张脸的 read 都收，`ASSISTANT_V3_READ_SOURCE_NOTE`；服务端按 `sources` 换回地址，走旧执行器的 `read_url`；没有页面的来源 —— 标签表、搜索模型自己的回答 —— 拒绝）。⚠ 换成短版的那一步前缀变了，提示缓存从那一条起断一次。
- **量了多少**（⛔ 没调真模型：单测桩模型，数发出去的提示 JSON 的字符，系统提示桩成短串）：快搜满载（6 条摘要 + 3 页全文，`planResearch` 真跑）整段 7,213 字、短版 1,602 字。查证之后接着走的一轮，模型收到的提示累计：4 次调用 25,639 → 14,417；8 次 63,269 → 29,603；16 次 152,805 → 74,251。只算查证这一段，16 次调用 108,195 → 29,641（整段从出现在 15 次调用里变成 1 次）。
- **回放**：R02（Gemini：`search_web` → `read` → 答）钉「整段只给紧跟着的那一步、再往后是短版」（`stepPrompts`：按步查发出去的请求体含 / 不含哪几句）。R03（Gemini）钉「上一轮的号带进这一轮」：回放题的 `turn.priorFinds` 由开轮那一跳带上，模型眼前有那几行。过程记录把开轮板子上冻着的那一份记进 `input.priorFinds`（接力那几跳的请求不带它，所以从板子取），转回回放题时原样带进 `turn.priorFinds`（地址不换：模型只读编号那一行，能不能当参考按 `domain` / `pageUrl` 判）。超 256 KB 时这一份在模型正文之后、快照之前截（`prior_finds`）；板子上有、`input` 里没有就在 `gaps` 里说一句，⛔ 不从板子上悄悄补。
- **面板**：回复里的 `#3` 是一颗小胶囊，悬停 / 焦点圈卡、点一下滚过去圈一会儿，一轮最后那段回复点到的卡常驻细黑框 —— 见 `pages/assistant-shell-v2.md` §3.5「回复里的 `#n`」。

### 读页被挡、退路与查证轮次（2026-10-15 搜索期第三片补充）

起因：Jina 读一个挡爬的站时 HTTP 照样 200，正文是「Just a moment...」「Verification successful. Waiting for …」—— 这段字以前被当成正文交给模型，快搜读前三页时还拿它顶掉了搜索摘要。前四条的范围经 owner 同意；具体判据、做法与取舍（含第五条）是实现方的判断，⛔ 不是 owner 的原话。

- **判「被挡」**（`lib/read-url-blocks.ts` 的 `detectBlockedPage`，判据表 `URL_READER_BLOCK_SIGNALS` 在 `constants/web-search.ts`）：站点状态码 401 / 403 / 429 / 451（直连那一跳的，或 Jina 头里「Target URL returned error 403」那一行）；否则正文短（≤ 2000 字）**且**标题 / 开头 600 字里有一句挑战页才写的整句（Cloudflare 五秒盾的「Just a moment...」「Verification successful. Waiting for」、「请输入验证码」「请完成安全验证」、「You don't have permission to access」……中日英）；或正文更短（≤ 1200 字）且同时沾上两样以上不同的弱信号（cloudflare、captcha、ray id、forbidden、error 1020、Access denied / 访问被拒绝……—— 讲报错的短文开头也会写「Access denied」，所以它只算弱信号）。长文一律不判：正常文章谈到 Cloudflare / captcha / 403 很平常。Jina 自己的非 2xx 算「读不出」，⛔ 不算站点挡你。
- **退路**（`web-research.service.ts` 的 `readUrlDetailed`，`readUrl` 只是它的「读到 = 页、其余 = null」）：Jina → (a) 认得出的 MediaWiki 站按 API 取正文（`MEDIAWIKI_READ_HOSTS` 一行一个站：萌百、维基、Fandom（含语言段）、灰机wiki `*.huijiwiki.com`、B站 wiki `wiki.biligame.com/<游戏>`；`mediawiki.connector` 的 `resolveMediaWikiReadTarget` + `readMediaWikiPage`，与检索腿同一条 extracts → revisions → parse 降级链，结果记一行 info 日志）→ (b) 服务端直连（`safeFetch` 的 SSRF 闸、`RESEARCH_USER_AGENT` 老实报 UA ⛔ 不伪装浏览器、8 秒、只收 html / text、最多 1.5 MB，HTML 转文字也判一次挡没挡）→ (c) 在 `read_url` 的规划期：本轮搜到过这一页（`run.researchSnippets`：`search_web` 与 `research` 读全文**之前**的那段摘要；v3 每跳由本轮记录 `sources[].snippet` 续上）就只交那段摘要，结果 `via: 'snippet'`，观察里写「NOT READ … The full text of that page was not read」，日志条多一行「原页没读到……只是搜索结果里的那段摘要」（`StudioOperator.web.readSnippetOnly`，三语）。都没有就按 `urlUnreadable` 拒，理由写明「<站> blocked the reader (…)」与「Nothing from that page was read」。⛔ 没借任何 key、没加任何付费服务。读到了的结果带 `via`（`jina` / `mediawiki` / `direct`）与页面标题。
- **按站记一阵**（进程内 Map，`URL_READER.blockedHostTtlMs` 30 分钟、最多 200 个站，满了先丢最早到期的；没复用 `lib/circuit-breaker`：它按失败次数计、每次跳闸记 error 级日志，也没有「只查不建」的读法）：整条链都没读到且有一条判了挡 → 记「整站挡」，30 分钟内再读它不碰 Jina 与直连、直接回「被挡了（没再去试）」（wiki 站照试 API）；只有 Jina 被挡、退路读到了 → 记「只挡 Jina」，下次直接走退路、⛔ 不算这个站被挡。查证那边：快搜挑前三页时整站挡的排到后面，扇出排序在印证数、题型分之后再按它排（⛔ 不删证据、不越过前两道次序）。⚠ 进程内的表：换一个 serverless 实例就是空的，这一阵记不住只是多打一次。
- **轮次上限 2 → 3**（`ASSISTANT_RESEARCH_LIMITS.maxRoundsPerTurn`，`research` 步骤 `round` 的 schema 上限跟着它）：两轮里一轮撞上挡爬的站就只剩一轮；成本仍有界 —— 一轮一次扇出（快搜 = 一个 Serper credit + 至多 3 页），查完之后每一步只重发短版。旧内核系统提示里「You may verify twice」改成按常量写。
- ⚠ 安全：直连的 HTML 转文字全用只往前扫的写法（一串没闭合的 `<a` / `<svg` / `<!--` 以前的懒匹配正则是平方级，2 万个 `<a` 就要 1.3 秒）；wikitext 去标记前截到 4 万字（`RESEARCH_LIMITS.maxWikitextChars`），因为 Fandom / 灰机wiki 的任意子站现在也读得到。wiki API 的地址一律 https、只认表里平台自己的域。

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
  - `resolveLlmTextRoute(userId, apiKeyId)` 只认**点名的**那把 key（`apiKeyId` 必填），解不开照实抛；不点名就按顺序挑一家的那一圈已删 —— 没点名时由 `resolveAssistantRoute` / `resolveKeyOrAssistantRoute` 挑出助手那把 key 再递进来。
- **看图**：v3 只由主模型看（look）；看不了就直说（上「看图」「角色页」）。v2 那几条看图腿（`analyze_references` · 看结果 / 看片 · `inspect_asset_folder` · `canvas_look_at` · `check_character_look` · 搜图后的看缩略图）一律用这一轮那把 key、那个型号；看不了 → `visionUnavailable` 拒绝并附一句实话（「这一轮的模型看不了图，没有换别家」），搜图那一步只跳过看缩略图。`resolveVisionRoute`（`/api/vision/analyze`、视频分析）：调用方递了 key 就用它，没递就是助手那一家；看不了 → `AssistantModelCannotSeeError`（`ASSISTANT_MODEL_CANNOT_SEE`）。旧的 `findVisionCapableRoute`、`VISION_ADAPTER_PREFERENCE` / `VISION_CAPABLE_ADAPTERS` / `VISION_NO_CAPABLE_ROUTE` 与结果里的 `borrowedRoute` / `borrowedVisionRoute` 都删了。
  - 看不看得了只有一个判据，按**厂商 + 型号**（`constants/assistant.ts` 的能力表）：`assistantAdapterSupportsImage` / `assistantAdapterVideoTier` / `assistantAdapterSatisfiesVideoTier` / `assistantAdapterAcceptsReferenceKind` 的 `modelId` 是必填参数（`undefined` = 那一家默认档），⛔ 只按厂商判 —— 同一家里有看不了图的型号（DeepSeek V4 Pro）。视频分析（`video-analysis.service.ts` → `resolveVideoAnalysisRoute`）用 `resolveVisionRoute` 挑中的那个型号判档、发请求。
- **联网**：所选模型自带联网就用它自己的；没有就走管线。借别家自带联网的 `findNativeSearchRoute`（`NATIVE_SEARCH_LENDERS`）删了 —— 它本就够不着：`resolveLlmTextRoute` 只回五家之一，而 `supportsNativeWebSearch` 对五家都为真。没人引用的 `resolveResearchRoute` / `findGroundingRoute` 一起删。`research-route.service.ts` 只剩 `findXSearchRoute`（创作者按了「用 Grok 搜这一次」才用的那把 Grok key）。自带联网没成、网页那一源退回平台 Serper（回执 `via: 'serper-fallback'`，`constants/research.ts` 的 `RESEARCH_RECEIPT_VIAS`）时照实说：查证结果带 `webSearchFallback`，调查那一行多一句「自带联网没成，改用平台 Google 搜索」（`researchProgress.serperFallback`），观察行也让模型知道网页结果从哪来。
- **查证改写查询**（`research-planner.service.ts`）用这一轮的路由与型号（调用方交进来），出不来就走确定性那份，⛔ 不换一家再试。此前借的是画布规划器那条路（`resolveNodePlannerRoute`），名册只有 Gemini / DeepSeek / OpenAI —— 不是 Claude / Grok 做不了（规划器只要一个 JSON 对象，五家都给得出），只是那份型号表没有它们，于是选了 Claude / Grok 的人悄悄花了别家的 key。
- **Grok 看 X 上的视频**（owner 2026-10-15）：`x_search` 默认只开 `enable_image_understanding`（看封面）。创作者这一句明说要看视频（「看看视频」/「動画を見て」/ "watch the video"，判据 `X_VIDEO_WATCH_INTENT` + `creatorAsksToWatchXVideos`，在 `native-search-filters.ts` 与搜 X 的意图放一起；「不用看视频」/ "don't watch" 不算）才加 `enable_video_understanding`。⚠ 只读创作者那一句，⛔ 不读模型写的查证目标。开了就数 Grok 实际调了几次 `view_x_video`（`xVideosWatched`，⚠ 工具名按 xAI 文档推断，未实测），观察行让模型说看了几段，调查那一行写「看了 X 上 N 段视频」。计费：视频按图片 token 计；X 搜索 $5 / 千条帖子。
- **测试**：新用例跑**真的** `resolveAssistantRoute` + `resolveLlmTextRoute`，只桩库（`src/test/assistant-route-fixture.ts` 的 `assistantKey` / `seedAssistantRoute`），最后用 `src/test/selected-provider-only.ts` 的 `expectSelectedProviderOnly` 数一遍这一轮每一次碰模型 / 按厂商查 key，⛔ 有一条不是所选那一家就失败。钱闸测试（`assistant-operator.money-gate.test.ts`）的允许名单与操作员实际 import 的模块一一对上：名单里有一条没人 import 也失败（此前还挂着已不 import 的 `vision-route`）。
- `intent-parser`（`/api/generation/plan`，眼下没有界面调用方）不调模型：过提示词守卫后把原话当主体。以前它拿平台哨兵用户去「自动」挑 key，哨兵没有 key、每次都落到这一步，2026-10-15 连那条腿一起删了。

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

### 每轮的过程记录（owner 2026-10-15「建表」）

- **记什么**：每一跳收尾（`runAssistantV3` 的 `finally`）交一份草稿给 `recordAssistantTurn`（`services/assistant-turn-record.service.ts`），写进 `AssistantTurnRecord`：开轮时的快照、本轮记录、请求里回放要用的那几样、这一轮那一家 / 型号 / key 的 id、系统提示的 sha256 与 `ASSISTANT_V3_PROMPT_VERSION`（改了系统提示的固定段落就把它往前拨）。⛔ 不等、不抛：写不进只记一行警告。表、上限、保留见 `database.md`「助手每轮的过程记录」。
- **一轮一行**：板子那一条带 `turn: { id, hop }`（`AssistantV3TranscriptBoardEntrySchema`）。开轮服务端发号，接力时前端原样带回、服务端加一跳；号 ⛔ 不进模型看的东西（板子给模型的只有 `text` / `images` / `clips`，回放「接力前缀逐字不变」照样过）。老客户端带回来的记录没有号：另起一个号、跳数记 2，这一行就不会把已落了改动的快照当开轮的存。
- **怎么收的**（`outcome`）：`done` 那一帧分不出来的几种由 `runV3Turn` 当场写下 —— `quiet`（改动已落、收尾空回复，回放末尾补一条空回复）、`empty`（连着两次空回复，补两条）、`content_filter`、`same_failure`；停下的按原因记 `awaiting_confirm` / `max_steps` / `relay`（画布接力、时间预算）/ `aborted`；抛错记 `error` 与错误码。
- **不记**：隐身那一轮（与结账不写记忆同一颗开关）；交回旧内核的、开跑前就失败的（缺 key、没有画布 —— 没造出模型、没冻板子）。
- **转回回放题**：`src/test/assistant-replay/from-turn-record.ts`（纯函数，⛔ 不连库）把导出的一行变成起始画布 + 题目草稿，补不出来的列在 `gaps`。回放基线每一题都对账自己写下的那一行（`graders.ts` 的 `gradeTurnRecord`）。

### 上下文预算（P2 第一片，2026-10-15）

设计方案 §2 第 1、5、6 条。量法见 `testing.md`「上下文预算」：回放基线上每道题、每条路由跑两轮，量**字数**（⛔ 不是 token，也不是真机命中率；真机看 `assistant llm call` 日志的 `cachedInputTokens` / `cacheWriteTokens`）。

- **分界线**（`assistant-v3-prompt.service.ts` 的 `buildAssistantV3SystemPrompt` 回 `{ rules, creator, text }`）：规则段 = 角色、HOW YOU WORK、ASKING、LOOKING、WATCHING、FOUND ON THE WEB、这张脸的板子 / 工具 / 写法，同一张脸、同一版提示对谁、哪一轮都逐字相同。`THIS CREATOR'S SETTINGS` 之后按变的频率从慢到快：名字与回复语言 → CHARACTER → HOW YOU TALK（人设口吻，以前粘在最后一段规则上）→ ABOUT THIS CREATOR → 规矩 → 记忆 → 这一轮板上型号的写法（画布节点型号、台上型号、LoRA 底模与 CFG；以前夹在规则里）。⛔ 每人 / 每轮会变的东西只许放分界线之后；改了规则段就拨 `ASSISTANT_V3_PROMPT_VERSION`（现为 `2026-10-15f`）。
  - 记忆按记下的先后（`createdAt`，再 `id`）排：注入那一跳按 `lastUsedAt` 选、选完把这几条刷成同一刻，按查出来的顺序排每轮都可能换。查询也加了 `id` 作第二键，选中的那几条是确定的。
  - 工具表本就按固定顺序发。回放断言：一轮里每一步、每一跳接力、跨轮，工具 + 系统提示都逐字相同，相邻两步至少共用这一段前缀。
- **Claude 四个缓存断点**（`assistant-v3-model.service.ts`，SDK 与 API 的上限都是 4）：① 规则段末尾（系统提示拆成两块）② 分界线之后那块末尾 ③ 历史末尾 ④ 最后一条消息。①–③ 给下一轮读，④ 给同一轮的下一步与接力那一跳读。别家（OpenAI / Gemini / DeepSeek / Grok）靠隐式前缀缓存，系统提示照旧一整段（规则在前），⛔ 不打标记。日志多记 `cacheWriteTokens`（AI SDK 的 usage；`llm-text` 读 `cache_creation_input_tokens`）。
  - 我的判断：④ 每一步都写（滚动），一步就答完的轮次多付一次写入溢价（1.25 倍），换多步、接力那几轮每步只重算新的几条；型号写法放在系统提示末尾（②那一块），板上型号一变②之后全部重写 —— 多数轮不变，比挪进消息里简单。
- **收尾不再结账**（§2.5）：v3 的五处收尾走 `closeRoundV3` / `closeRoundV3BeforeStop`（`assistant-operator.service.ts`），⛔ 不再起写结论三栏的那次往返（每轮约 4.5k 字，`done` 要等它回来）。判据：v3 里没有读者 —— 面板不画结论记录（owner 2026-09-24），v3 的提示不注入 `priorRounds`（读它的 `referenceCreatorContext` 在 `skipReferenceReview` 下不走），`memoriesWritten` 没有界面读。
  - 这一轮落了证据编号才写一条**只带编号**的记录（三栏空、确定性、照旧在 `done` 之前写），给面板「钉住」当家；没有证据就不写 —— 我的判断。v2 的 `closeRound` 一字不变。
  - v3 开轮 ⛔ 不读 `priorRounds`（`prepareOperatorTurn` 的 `skipPriorRounds`）：读了没人用。交回旧内核时 `runOperatorTurn` 补读一次（`priorRoundsSkipped`），旧内核的提示从 `run.priorRounds` 取。
- **记忆在后台抽**：门槛与 v2 结账逐字相同（隐身、「让助手记住」关、本轮账本是空的都 ⛔ 不抽）。`scheduleRoundMemories` 收尾时就起，交给 `after()`（`next/server`），流 ⛔ 不等它；失败只记一行 `assistant round memories not stored`，⛔ 不进过程记录。
  - 型号：**这一轮的那一家、那个型号、那把 key**（owner「全跟助手」：小功能跟助手走，同一家也 ⛔ 换快档；唯一的同家快档例外仍只是「自动」下的纯问答轮，见上「只用所选那一家」）。
  - 档位 low、自己的时限 25 s（`ASSISTANT_MEMORY_LIMITS.extractionTimeoutMs`，在路由 300 s 的 `maxDuration` 之内）、只要 `{"memories":[...]}`（`roundMemoriesSystemPrompt`）；记什么、不记什么的规则与 v2 结账共用 `roundMemoryRules`（v2 那份提示逐字不变）。
- **思考档按步调**（§2.6，`assistantV3StepEffort`）：创作者在「思考」chip 上选的那一档管开轮第一步与一切还要判断的步；**纯落地步**（最后一条 assistant 之后全是成功的 edit / write 结果）用 low，⛔ 永远不高过创作者选的。v3 的调用日志多记 `effort`。
  - 只在换档不赔缓存的三家换（`effortPerStep`）：Gemini、DeepSeek、Grok（档位是生成参数，不进前缀 —— 我的判断，没测过命中率）。Claude 与 OpenAI 整轮钉住创作者那一档：Claude 换档至少作废整段消息缓存（官方文档建议按路由钉住思考与档位设置），OpenAI 换 `reasoning.effort` 会改写藏在前面的指令、整段前缀重算。⛔ 不接两家不赔缓存的 beta 写法（Claude 对话中系统消息 `output_config.effort`、GPT-6 的 `configuration_update`）。整轮钉住是我们为了缓存稳定做的取舍（P2），⛔ 不是 owner 定的。
  - 落地步的判据是保守版（我的判断）：上一步只要有一个调用是查、看、问、失败，或画布那一批「只落了一部分」（结果不算错，但模型要补没落的那几条），这一步照用创作者那一档。
- **子调用的档**：查证改写查询（`research-planner`）显式传 low；后台抽记忆 low。查证收尾那句结论与模型自带联网**照旧不传档位**（各家默认；Grok 自带联网照旧钉 low）：查证质量是 owner 按这样实测过的，没有新的实测 ⛔ 不改。
- **量出来的**（`fixtures/context-budget.json`，P2 前 → 后）：
  - 首步原样大小几乎没变：Gemini 约 36.8k 字（工具 11.4k + 系统 21.2k + 消息约 4.2k），别家 38.9–40.2k（工具 13.4–13.5k）；每步多 39 字（两行新标题）。⚠ 「问答首步 < 10k」按原样字数**没达到**：系统提示 21.2k 里画布型号写法约 8.5k，工具 11–13.5k。
  - Claude 真要重算的字（按断点规则）：T13 第二轮 39.2k → 4.5k，T21 Sonnet 40.0k → 5.2k，T03 一整轮 79.1k → 40.2k、第二轮 79.6k → 5.7k，T24 / T25 第二轮 80.9k / 80.4k → 7.0k / 6.5k。别家（隐式缓存）本就只重算 4.2–7.5k。
  - 辅助调用：大多数轮 1 次（结账，约 4.5k 字）→ 0；落了账本的 R01 / R02 2 次 5.4k → 3.1k，T11 1 次 4.6k → 2.4k（只剩抽记忆）。
- **还没做的**：§2 第 3、4 条与型号写法瘦身见下「第二片」；历史窗口（§2 第 2 条：24 条每轮滑动、没有字数上限，滑一格前缀就断）见下「第三片」。

### 上下文预算（P2 第二片，2026-10-15）

设计方案 §2 第 3、4 条，外加系统提示里那约 8.5k 字的画布型号写法。量法同第一片（`context-budget.json`；字数，⛔ 不是 token、⛔ 不是真机命中率）。下面标「我的判断」的都是我（P2 实现者）定的；标「协调者的决定」的是这一片交付后 P2 协调者拍的板（A–E），两者都 ⛔ 不是 owner 定的。

- **型号写法：板上型号给整份，别的按需 read**（`assistant-v3-guides.service.ts`）。画布系统提示分界线之后那段（`WHAT EACH CARD'S PROMPT MUST LOOK LIKE`）给板上型号（按卡数取前 `maxDialectModels` 种、按 id 排）的整份写法：每个型号一行 `enhanceHint`，标签写法、Seedance 控制规则（2.0 与 2.5 同在就各一份）、视频写法 + 镜头语法各一份（板上真有视频卡才给后两样）。板上型号的集合不变，这一段就逐字不变。排在上限之外的型号列在 `Also on the board:` 一行；板上没有的型号（要建到新卡上的）可以 `read "guide:<型号>"` 现取整份写法，只进这一轮的记录 —— 可选，⛔ 不设闸、⛔ 不强制多一步。
  - 第二片一度把整份写法挪出系统提示（每个型号只留一行 + `Full guide: read …`），整段写之前没读过就拦下那一次 write / add、在结果里给写法（写词闸）。**协调者的决定 A**：拿掉写词闸、整份写法放回 —— 写提示词是核心动作，多一来回的延迟不值；省下的约 5.7k 字只在首步、未命中缓存时才算（第二轮起系统提示本就在缓存里；P01 那一轮要重算的字与 T24 差不多）。
  - 别的脸（图片 / 视频台、LoRA）的写法段照旧：台上只有一个型号，那一段本来就短。
- **本轮记录瘦身**（`src/lib/assistant-v3-transcript-view.ts`，纯函数：同一份记录永远算出同一份样子；⛔ 不改记录，「再调一次」拿到的仍是全文）。查来的东西（`read` 的卡与网页全文、`look`、`search_web`、`search_library`）只留最近 3 条原样，更早的换成几行摘要：一行说明 + 第一行 + 条目行（句柄 / `#n` / `[n]` 开头）+ 其余地方出现的句柄与编号。整份写法与改动回执不瘦；模型刚要的（最后一条 assistant 之后）不瘦；不到 800 字或摘要省不下一半的不换。
  - ⚠ 只在**长轮次**里瘦（`ASSISTANT_V3_TRANSCRIPT_SLIM.slimAboveChars` = 6 万字，本轮记录原样只增不减，过了线就一直瘦、不会来回翻）—— 我的判断。瘦掉一条 = 缓存前缀从那一条起断一次，那条之后的东西整段重算，省下的字往后每步只按缓存价计。回放实测 L01（四张约 1.1k 字的卡逐张读）：照字面每步都瘦，整轮少发 907 字、要重算的字反倒多 2,962（+8%），第二轮同样多 2,962；L02（四幕剧本各约 1.7 万字，过线）：第 5 步 106,179 → 88,399 字，整轮 349,697 → 331,917，要重算的 106,183 → 142,763（断缓存那一步的代价，往后每步少发约 1.78 万字）。与 Claude 自家 context editing 同一个思路（默认也是留最近 3 次、过了触发线才清）。设成 0 就回到照字面每步都瘦。
  - `maxTranscriptChars`（40 万字）现在真执行，按固定次序一级一级瘦，够了就停：① 之前查来的全瘦 → ② 之前的所有结果全瘦（含写法、回执）→ ③ 更早的 assistant 正文截到 400 字 → ④ 模型刚要的那几条平分剩下的字数、截短（最后才动）。调用入参一个字不动（截了不是合法 JSON）；超了记一条 `assistant v3 transcript over budget`。⚠ 到了第 ② 级，`read "guide:"` 读来的写法也会被瘦掉 —— 只在 40 万字那一档才会碰到。
- **主步输出上限**（`ASSISTANT_V3_MAX_OUTPUT_TOKENS`，交给 `streamText`）：数是 64k（我的判断：只为拦住失控的长输出，远高于一次写满几段长提示词 —— 回放里最大的一批调用入参才 433 字，T24）。**协调者的决定 C**：⛔ 拿创作者的主模型冒 400 的险 —— 只在**官方端点**、且型号的官方上限登记在 `documentedMax`（每条注释带出处，2026-10-15 读取）并 ≥ 64k 时才发；没登记的型号、代理 / 自建兼容口子一律不发（与旧内核 `providerManagedOutput` 同一条，vLLM 一类「提示 + 上限」超了上下文就 400）。Claude 例外：`max_tokens` 必填，一律发 64k（四个型号官方上限都是 128K）。登记的：Claude 四个 128K、GPT-6.1 Sol / GPT-6 Astra / GPT-6 Luna 128,000、Gemini 3.8 Flash 65,536、DeepSeek `deepseek-flash` / `deepseek-v4-pro` 384K、Grok 4.7（`max_completion_tokens` 不给时默认 128,000，型号页写「No text output limit」）。字段：Claude `max_tokens` / OpenAI 官方 Responses `max_output_tokens`（含推理）/ Gemini `maxOutputTokens`（含思考）/ DeepSeek `max_tokens`（含思维链）/ Grok 只走 `max_completion_tokens`（⛔ 不发已弃用的 `max_tokens`）。owner 的主模型 DeepSeek V4.1 Flash：官方端点发 `max_tokens: 64000`（官方 384K，仓库 `providers.md` 也有这个数），走代理就一个上限字段都不发 —— 单测拦下请求体逐字看过。助手路由上新加型号时不登记就不发，单测会红着提醒去核对。撞上限（`finishReason: length`）记一条日志。
- **板子分级**（`assistant-v3-board.ts`，tldraw agent kit 做法，只在画布、只在大画布 —— 卡多于 `boardCatalogMinNodes`）：在眼前的镜头带照旧（相关的卡展开、其余一张一行）；别的带只印一行 —— `LANE 9 — off-screen, 1 card: 「S09 塔楼」 — read "lane:9" for it`，⛔ 不给句柄。`read "lane:<n>"` 按原路读那条带（全文最多 12 张，其余一张一行带句柄；前端折起来的、没有的、截掉的照实说）。句柄的造法一字没变，op 照旧按句柄认（B01 证明：先读 lane 9 再改 S09）。
  - 「在眼前」是近似（快照里没有视口，我的判断）：当前镜那条与左右各一（没焦点时最前面三条，与前端一定展开的那三面同一条）+ 有展开卡（选中 / @ / 点名 / 剧本 / 一跳连线）的带；散卡永远在。
  - 那一行列卡名（最多 6 个）是我加的：设计方案只说给计数；列名字让模型把「S09」「塔楼」对上是哪一条带（T23：带的位置号不等于剧本镜号），每张卡只多十来个字。
  - **板子不每步重发**：本来就是 —— 开轮那一刻冻进本轮记录头一条、排在稳定前缀之后，往后每一步与每一跳接力逐字复用、改了什么由工具结果带回。现在回放断言了这一条（第一步之后每一步都逐字以第一步的整份请求开头），⛔ 没再加「只发变化」那一套（板子不在后面的步里重算，没有可省的）。
  - **前端把每条带的卡都带上**（协调者的决定 D；`studio-operator-canvas-snapshot.ts`，`ASSISTANT_OPERATOR_CANVAS_LIMITS.maxExpandedShotBytes`）：从前镜头卡多于 60 张时前端只展开焦点那三条，别的带只有卡数，`read "lane:<n>"` 只能回「折起来了」。现在散卡、焦点那三条、选中 / `@` 到的带一定展开，其余的带按离焦点由近到远**整条**加，加到展开的卡在快照里到 19 万字节（JSON 的 UTF-8）为止，放得下就全展开；放不下就停（展开的带连成一片）。取代「≤ 60 张全展开」那条：一张常见的镜头卡（700 字提示词 + 29 个可选型号）约 3 KB，从前 60 张全展开约 17.8 万字节 —— 19 万让这样的 60 张照旧全展开，提示词短的画布放得下更多（300 字提示词 72 张卡、24 条带全展开，13.7 万字节）。数是我的判断。量过（单测，72 张卡）：700 字提示词时 24 条带展开 20 条、快照 18.6 万字节、整个请求 21.6 万；过程记录那一行（快照 + 25 条对话 + 本轮记录）23.1 万字节，一刀不截、快照留着。⚠ 每一跳接力都整份上传快照：大画布上从约 3 万字节涨到约 19 万（不比从前 60 张卡全展开时多）。MCP `read_project` 用同一个构建函数，同样多带了几条带。服务端没改：前端没带上的带照旧回「折起来了」（老标签页也一样）。
  - 别的脸看过、没动：图片 / 视频台的板子是一张表单（提示词截到 1,600 字、最多列 40 个型号）；LoRA 只列挂着的 LoRA、底模最多 12 个；角色页最多 120 位、一位一行（约 90 字：平常 1–3k 字，最坏约 1.1 万字 —— 要不要分级等 owner 定）。
- **量出来的**（`context-budget.json`，第二片前 → 后）：
  - 画布系统提示 21,193 → 15,468 字（只留一行提示时）→ 21,514 字（协调者的决定 A，整份写法放回；比第二片前多的 321 字是 off-screen 带与 `read "lane:"` / `read "guide:"` 那几句）。`malfoy` 上每道题首步因此回到 37.1–40.5k 字（第二片前 36.8–40.2k）。
  - 写词那一轮：一行提示 + 写词闸时 P01（先读写法再写）33,285 / 40,737 / 41,770，整轮 115.8k、重算 41.8k；放回整份写法后 P01 一步写成 39,331 / 40,364，整轮 79.7k、重算 40.4k。P02 改成「给板上没有的型号建卡，先 `read "guide:"`」（39,350 / 42,447 / 43,626）。
  - 板子分级：`hogwarts`（24 张卡、9 条带不在眼前）首步消息 3,878 → 3,518 字（B01）；卡越多省得越多（不在眼前的卡每张从约 85 字的一行变成十来个字的名字，我按这个估：60 张镜头卡、只看三条带时约省 3–4k 字，没量过）。规则段多两行（+164 字，跨轮在缓存里）。
- **没验证的**：都是回放上的字数与录好的回复。真机缓存命中；真模型给板上没有的型号建卡时会不会去 `read "guide:"`、会不会对着 off-screen 那一行去 `read "lane:<n>"`（回放里是写好的回复）；摘要够不够模型接着想；官方上限是 WebFetch 读的官方页面（2026-10-15），没对真接口发过 64k 的请求。
- **协调者拍过板的**（2026-10-15，⛔ 不是 owner 定的）：A 写词闸拿掉、板上型号的整份写法放回（见上）；B `slimAboveChars` 留 6 万字（0 = 照字面每步都瘦）；C 输出上限只发官方上限查得到出处的（见上）；D 前端把每条带的卡都带上，在字节预算之内（见上）；E 角色页先不分级（最坏约 1.1 万字）。
- **要 owner 定的**：没有新的。

### 上下文预算（P2 第三片：历史窗口与摘要，2026-10-15）

设计方案 §2 第 2 条。量法同前两片（字数 + 理想化前缀缓存，⛔ 不是 token、⛔ 不是真机命中率）。下面标「我的判断」的是我（P2 实现者）定的，⛔ 都不是 owner 定的。

- **窗口**（`src/lib/assistant-v3-history.ts`，`ASSISTANT_V3_HISTORY`）：创作者这一句之前的对话按「轮」分组（一条 user 起一轮，空白的不算），只发最后几轮：对白总字数 ≤ 2 万（`maxChars`）、总条数 ≤ 48（`maxMessages`，只防一长串一两个字的来回）。起点只落在第 0、8、16…… 轮上（`blockTurns`，从请求里第一轮数起）：两次滑动之间对白那一段逐字是上一轮的再接两条，缓存吃得到。最后一块自己就超了才退到逐轮挪；最近那一轮再长也留着。取代「最后 24 条、每轮滑一条」（`MAX_HISTORY_MESSAGES`，已删）。
- **摘要**：滑出去的那几轮由后台写成四栏（决定 / 偏好 / 没做完的 / 名字与 id，每栏 ≤ 8 条、每条 ≤ 240 字），接在系统提示分界线之后、记忆之后、板上型号写法之前（`EARLIER IN THIS CONVERSATION — the first N turns … are no longer shown below`），同一份逐字相同。一份接一份：新的 = 上一份 + 刚滑出去的那几轮（原料每条截到 4k 字、整份超 4 万字就每条平分着截短，⛔ 整轮丢）。
  - 认「管到哪一轮」靠那一轮原字的指纹（`through`），⛔ 不靠轮号：刷新之后前端只重带最后 12 条（`replayMessages`），轮号整体挪了，指纹照样对得上；对不上 = 它管的全在请求之前。挑管得最远的那一份；它管到的那几轮不再原样发（刷新后前端重带的几条里可能就有），最近那一轮总留着。⚠ 刷新之后，摘要管到的那一轮与前端重带的 12 条之间若还隔着几轮（窗口通常比 6 轮长），那几轮两边都不在 —— 与从前刷新后一样丢，服务端不读会话的 `messages`；要补得改前端重带的条数或让服务端读会话，这一片没动。
  - 后台那一跳（`assistant-v3-history.service.ts`）：这一轮的那一家、那个型号、那把 key（⛔ 不借别家，与抽记忆同一条），`low` 档、要 JSON、自己的 20 秒时限；`after(fn)` 等这一轮的回复发完才开跑（⛔ 与主步抢同一把 key）。失败（超时、读不出 JSON、四栏一栏都没有、存不进）记 `assistant history summary not stored`，存着的那几份不动，下一轮缺口还在就再补。同一段会话、同一个缺口，同一个进程里只起一次。只在开轮那一跳起，⛔ 在接力上起。隐身：照读（隐身只关写入）、⛔ 补、⛔ 存。
  - **缺口那一轮多留一轮**（我的判断）：滑出去的那几轮还没有摘要时，窗口照上一轮的起点、只多出最新那一轮（上一轮的窗口本来放得下才留），所以那几轮的事每一轮都看得见（在窗口里或在摘要里）；再下一轮摘要还没回来就照样滑。窗口的字数因此最多比上限多一轮；条数照样封顶（多留之后超了 48 条就不留），过程记录那一行因此装得下模型看见的每一条。
  - 接力那几跳照开轮板子上冻的那一份（`history: { turns, summary }`，`turns` 从这一句往前数，前端少带前面几条也不变）：中途后台写好了新的也不换。老客户端的 schema 剥掉这一格时，照开轮那样现算。⚠ 这一格与板子正文一样是前端带回来的：改它只改得了自己这一轮给自己那把 key 的提示。
- **存在哪：要一列新的，现在哪都不存**（`assistant-v3-history-store.service.ts`，`persists: false`）。它该住在会话那一行上（与 `rounds` 同一个理由：与会话同生共死、只有这段会话读它），现有两列都装不干净：`messages` 由前端整份覆盖写（`upsertAssistantConversation`），服务端写进去的下一次保存就冲掉；`rounds` 是结论记录，逐条按三栏 × 60 字的 schema 过、读不出来的丢掉，面板与分享页都读它。过程记录那张表留 30 天、每人 200 行，是排查用的，语义不对。所以（我的判断）要一列：
  - Prisma：`AssistantConversation` 加 `historySummary Json?`（注释：滑出窗口的那几轮的摘要，最近 3 份 `AssistantV3HistorySummary`，最旧的在前）。
  - SQL：`ALTER TABLE "AssistantConversation" ADD COLUMN "historySummary" JSONB;`（可空、无默认、无索引、不回填；Postgres 上只改元数据）。
  - 加上之后换掉那个空的存储：`load` 按 `{ id: conversationId, userId }` 读这一格、过 `AssistantV3HistorySummariesSchema`，读不出来当空；`update` 在事务里 `SELECT … FOR UPDATE` 锁那一行读改写（与 `appendAssistantConversationRound` 同一个做法）；`persists: true`。`toRecord` 按字段挑，这一格不会进会话接口、分享页与导出；前端保存（只写 `messages`）碰不到它；删会话一起删。
  - 那一列加上之前：窗口照样按字数滑，滑出去的那几轮没有摘要（与从前按 24 条截掉一样丢），后台那一跳一次都不起（存不下就 ⛔ 花这笔钱）、也不多留那一轮。
- **过程记录**：对话只存模型这一轮看见的那几条再加这一句（板子上的 `history.turns`，原样带 `answered`），上限 `ASSISTANT_TURN_RECORD_LIMITS.maxMessages` 跟着 `maxMessages` 走（25 → 49，⛔ 不是 owner 定的数）；摘要原样在板子上，系统提示的 sha256 也认它。`ASSISTANT_V3_PROMPT_VERSION` 没拨：规则段没变，摘要与记忆一样是每段会话不同的段落。
- **量出来的**（`long-conversation.test.ts`：同一段会话 32 轮，助手每轮平均约 1.1k 字、隔几轮一段 2.4k，整段对白约 3.9 万字；下表是 DeepSeek V4.1 Flash，Claude 差 ±3%；量的时候还没有第 30 轮那一跳接力）：

  | 窗口                           | 32 轮首步共发 | 要重算  | 摘要（次 / 字） | 滑几次 | 平均看得见的对白 |
  | ------------------------------ | ------------- | ------- | --------------- | ------ | ---------------- |
  | 从前：最后 24 条、每轮滑一条   | 1,697,850     | 639,478 | —               | 18     | 12,820           |
  | 2 万字、每轮滑一条             | 1,772,754     | 518,374 | 11 / 34,158     | 11     | 15,086           |
  | 1.2 万字、8 轮一块             | 1,520,401     | 247,142 | 3 / 34,475      | 3      | 7,513            |
  | 1.6 万字、8 轮一块             | 1,613,485     | 261,365 | 3 / 34,475      | 3      | 10,310           |
  | **2 万字、8 轮一块（取这个）** | 1,706,052     | 253,492 | 2 / 22,862      | 2      | 13,100           |
  | 2.4 万字、8 轮一块             | 1,757,509     | 262,607 | 2 / 22,862      | 2      | 14,649           |
  | 3.2 万字、8 轮一块             | 1,859,515     | 245,155 | 1 / 11,311      | 1      | 17,738           |
  - 「从前」那一行是同一套代码把上限换成「24 条、每轮滑一条」量的（摘要那一段照样在，与真的从前每轮差几百字）。按块滑把要重算的字砍掉六成（639k → 253k）。1.2–3.2 万之间按「重算 + 缓存读约一折 + 摘要原价」折算只差 ±4%（409k–435k），所以上限按「看得见多少」取：2 万字比 1.2 万多看 1.7 倍的原话、只贵约 3%；3.2 万每步多读约 9% 的缓存。取 2 万（与设计方案的「例如 2 万字」一致），我的判断。
  - 每轮第一步：没有历史时 39.4k 字，之后随对白涨、到约 61k 封顶，滑的那一轮掉回 51–53k（那一轮要重算约 2.5 万字；不滑的轮约 5–7k）。整段全带的话第 32 轮会到约 7.8 万；从前按 24 条截，首步最多 57.9k，但第 14 轮起每轮都滑、每轮整段对白重算。
  - 第 2 轮定下的「16:9 横版」：第 18 轮窗口该滑、摘要还没有，多留一轮；第 19 轮起它只在摘要里，一路带到第 32 轮（第二份摘要接着第一份写）；第 30 轮那一跳画布接力，接力那一跳的系统提示与对白逐字照开轮那一跳。

- **没验证的**：摘要是假的（回放里照原料「定了：」那几句抄）：真模型写的摘要准不准、够不够模型接着想，没看过。真机缓存命中。指纹认轮靠前端每轮重发的对白逐字不变：会话里是；刷新后从库里读回来的那几条与会话里的是否逐字相同没对过 —— 对不上只会多带重复，不会丢。真库上的读写（那一列还没有）。
- **要 owner 定的**：加 `AssistantConversation.historySummary`（见上），加之前摘要不生效。

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

### 自动回放基线（每期跑，2026-10-15）

上表是真机回放（人跑、看事件流判分）。附录M 五.6 另立一套**自动**的：`src/test/assistant-replay/`，`npm run test:replay`，约 15 秒，也在 `npx vitest run` 里。真路由 → 整条 v3 环 → `resolveAssistantRoute`，只把网络（录好的模型回复）、库、Clerk 换掉；每题都查「只用所选那一家」（每次碰模型都是选定的那一家、型号、key）。**每一期（S 片 / 附录M 各期）改完都跑**，红了先看是不是改坏了别的题，再决定改题还是改代码。怎么加题见 `testing.md`「助手回放基线」。

每道题还对账这一轮写下的过程记录（`gradeTurnRecord`）：整轮只写一行、只存 key 的 id、没有图的字节、开轮快照就是路由收下的那一份；这一行经 `from-turn-record.ts` 转回来，画布的卡与线、选的那一家与型号、这一句、上一轮带进来的 `#n`、整轮的模型回复、怎么收的都与题目一样。缺 key 那一题（K01）一行都不写。

| 题                    | 路由（选定的那一家）                   | 查什么                                                                                                      |
| --------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| T11 · T12 · T13       | Gemini / 自动→Luna · DeepSeek · Claude | 只答：不落 op、不出卡                                                                                       |
| T21 · V03             | Gemini · Sonnet · DeepSeek V4 Pro      | `@` 两张图都摆到模型眼前；看不了图的型号一张不收                                                            |
| V01 · V02             | Gemini · GPT-6.1 Sol                   | `@` 片子：Gemini 收片子本体，OpenAI 收按片长抽的帧                                                          |
| T01 · T25 · T24       | Gemini · 五家各一遍 · Sonnet           | 断 / 接线一批落、接力续上、其他不动；已接的不重复接                                                         |
| T03 · T05 · T07 · T09 | Opus · Sol · DeepSeek Flash · Sol      | 建卡 + 模型 + 参数 + 连线一批落；只改名；逐字只换一处；挪镜                                                 |
| T06                   | Gemini                                 | 模型直接发删除 → 服务端先出问题卡，一张不删                                                                 |
| T14 · T15             | Grok · Gemini                          | 生成确认卡只列点名的那几张，⛔ 不建 generation                                                              |
| R01                   | Gemini                                 | `search_web` 走 Gemini 自带联网，答出 Aemeath / Danbooru 标签                                               |
| R02                   | Gemini                                 | 查证的整段摘录只给紧跟着的那一步，再往后是一行一条的短版                                                    |
| R03                   | Gemini                                 | 上一轮找到的 `#n` 带进这一轮：模型眼前有那几行，记录转得回来                                                |
| K01                   | 选 Claude、只配 Gemini 的 key          | `ASSISTANT_MODEL_KEY_MISSING`，一次模型都不碰、⛔ 不借别家                                                  |
| P01 · P02             | Sonnet                                 | 板上型号的整份写法在系统提示里，整段重写一步写成、没有写词闸 / 给板上没有的型号建卡前 `read "guide:<型号>"` |
| L01 · L02             | DeepSeek Flash · Sonnet                | 本轮记录瘦身：没过线一字不瘦；过线后最早那条换摘要、句柄还在                                                |
| B01                   | Gemini                                 | 板子分级：不在眼前的带只有一行，先 `read "lane:9"` 再改 S09                                                 |

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
- 找到的东西的编号与查证短版：`src/lib/assistant-web-finds.ts`（一行一条、`#n` 的认法、短版）· `src/types/assistant-web-finds.ts`（本轮记录里的那一条）· `src/services/kernel/assistant-v3-finds.service.ts`（续号、`#n` / `[n]` 换回）· `src/constants/assistant-operator.ts` 的 `ASSISTANT_WEB_FIND_LIMITS` 与 `ASSISTANT_RESEARCH_LIMITS.maxCompactGistChars`
- 读页被挡与退路：`src/lib/read-url-blocks.ts`（判据、按站记一阵、HTML 转文字）· `src/constants/web-search.ts` 的 `URL_READER` / `URL_READER_BLOCK_SIGNALS` · `src/services/web-research.service.ts` 的 `readUrlDetailed` · `src/constants/research.ts` 的 `MEDIAWIKI_READ_HOSTS` + `mediawiki.connector` 的 `resolveMediaWikiReadTarget` / `readMediaWikiPage`
- 开关：`src/app/api/studio/assistant-operator/route.ts` · `src/hooks/use-assistant-operator.ts`
- 自动回放基线：`src/test/assistant-replay/`（题在 `fixtures/cases/`，判分在 `graders.ts`）
- 上下文预算（P2 第二片）：`assistant-v3-guides.service.ts`（板上型号的整份写法、`read "guide:"`）· `src/lib/assistant-v3-transcript-view.ts`（本轮记录瘦身与 `maxTranscriptChars`）· `assistant-v3-board.ts` 的 `viewLaneNumbers` / `renderOffscreenLane` 与 `assistant-v3.service.ts` 的 `readLanes`（板子分级）· `assistant-v3-model.service.ts` 的 `maxOutputTokens` · `src/constants/assistant-v3.ts` 的 `ASSISTANT_V3_TRANSCRIPT_SLIM` / `ASSISTANT_V3_MAX_OUTPUT_TOKENS` / `ASSISTANT_V3_BOARD_TIERS`
- 上下文预算（P2）：`assistant-v3-prompt.service.ts`（分界线、记忆排序）· `assistant-v3-model.service.ts`（Claude 断点、`effortPerStep`、`assistantV3StepEffort`）· `assistant-v3.service.ts` 的 `isLandingStep` · `assistant-operator.service.ts` 的 `closeRoundV3` / `closeRoundV3BeforeStop` / `scheduleRoundMemories` / `prepareOperatorTurn({ skipPriorRounds })` · 量法 `src/test/assistant-replay/context-budget.ts` + `fixtures/context-budget.json`
- 每轮的过程记录：`src/services/assistant-turn-record.service.ts`（写与删）· `src/lib/assistant-turn-record.ts`（摘 data: 地址、挑请求字段、按上限截）· `src/constants/assistant-turn-record.ts` · `src/types/assistant-turn-record.ts`；一行转回回放题：`src/test/assistant-replay/from-turn-record.ts`

### 项目笔记（S4，2026-10-09）

- 板子本身就是项目笔记：新会话读板子已答得出「列车段穿什么」，⛔ 不另造一张笔记卡。
- 缺的是**会话里说过的规矩跨会话不丢**：结账记忆在画布上归当前项目（owner：一个项目一份记忆，换了项目之前的记忆不能影响新项目；全局习惯照旧生效）。存与取见 `docs/references/database.md`「助手记忆」。
- 结账提示在画布项目里换一段：记这个项目的角色 / 画风 / 规矩，只留在这个项目；「未成年」只挡真人，故事里角色的年龄与年级照记，与性有关的一概不记。

## Last Verified

- 2026-10-15 · P2 协调者的决定 A–D（992f37a 整份写法放回、拿掉写词闸；4177d8f 输出上限只发查得到官方出处的；2efc59f 前端每条带的卡在 19 万字节内都带上）+ 第三片「历史窗口与摘要」（见 §2「上下文预算（P2 第三片）」）：对白按字数开窗（2 万字 / 48 条）、8 轮一块滑、滑出去的那几轮由后台写成四栏摘要（这一轮的那一家、那个型号、那把 key，`low`、20 秒、`after()`）、接在记忆之后与型号写法之前、接力照开轮板子上冻的那一份、过程记录只存模型看见的那几轮。`tsc` + 改动文件 eslint（0 problem）+ 定向 vitest（lib · services/kernel · services/research · `llm-text` · `assistant-memory` · `assistant-turn-record` · `assistant-conversation` · constants · types · hooks · node 组件 · mcp，490 个文件 7,323 条全绿）+ `npm run test:replay`（5 个文件 83 条全绿，含长对话两跑：DeepSeek V4.1 Flash 与 Claude Sonnet 5.5 各 32 轮、第 30 轮一跳画布接力）。`context-budget.json` 这一片一个数没变（那几道题的对白都放得下 2 万字、窗口不滑，也不带会话号）。反例：多留那一轮不守条数上限时单测红；`blockTurns` 改成 1（每轮滑）时长对话两跑都红（断缓存 11 次 > 4）；摘要不进系统提示时两跑都红（第 19 轮丢了第 2 轮的决定）。⚠ 摘要的存储是空的（`AssistantConversation.historySummary` 那一列没加，`persists: false`）：生产上这一片只生效了窗口，摘要一次都不生成；回放里写摘要的是假模型、存储是内存里的一份。真模型写的摘要准不准、真机缓存命中、真库读写、`after()` 在 Vercel 流式路由里跑完，都没验证。
- 2026-10-15 · P2 第二片「上下文预算」（见 §2「上下文预算（P2 第二片）」）：型号写法一行提示 + `read "guide:"` + 写词闸、本轮记录瘦身（长轮次留最近 3 条）+ `maxTranscriptChars` 四级、主步 `maxOutputTokens`、画布板子分级 + `read "lane:<n>"`、断言板子只在第一步算新的。`tsc` + 改动文件 eslint（0 problem）+ 定向 vitest（services/kernel · services/research · `llm-text` · `assistant-memory` · constants · types · lib，311 个文件 5,447 条全绿）+ `npm run test:replay`（81 条全绿；新题 P01 / P02 / L01 / L02 / B01，新板子 `hogwarts` / `scripts`）。反例：关掉写词闸 P02 红（多一次请求）；「最近 3 条」改成全留、瘦身线改成 0、在眼前的带不认展开卡，各自的单测红。`context-budget.json` 重写过四次，各有原因：新题入表；型号写法挪走首步 −5,725 字；板子分级的两行提示 +164 字、L01 第四次改读 `lane:4`。五家请求体里的上限字段逐一看过（Claude `max_tokens` / OpenAI `max_output_tokens` / Gemini `maxOutputTokens` / DeepSeek `max_tokens` / Grok 只有 `max_completion_tokens`，都是 64,000）。⚠ 都是回放上的字数与录好的回复，没对真模型跑过（见那一节「没验证的」）。
- 2026-10-15 · P2 第一片「上下文预算」（见 §2「上下文预算」）：量法、分界线、Claude 四个断点、收尾不再结账 + 后台抽记忆（这一轮的型号）、v3 开轮不读 `priorRounds`、思考档按步调（Claude / OpenAI 整轮钉住）、查证改写查询传 low（查证结论与自带联网照旧不传）。`tsc` + 改动文件 eslint（0 error）+ 定向 vitest（services/kernel · services/research · `llm-text` · `assistant-memory` · constants · types，90 个文件 2,560 条；lib 219 个文件 2,852 条，全绿）+ `npm run test:replay`（71 条全绿；`context-budget.json` 重写过三次，各有原因：两行新标题每步 +39 字、Claude 断点让重算字数下降、结账删掉让辅助调用变少；抽记忆改回这一轮的型号、查证档位改回照旧都没动它）。⚠ 都是回放上的字数，没对真模型跑过：真机缓存命中、`after()` 在 Vercel 流式路由里跑完、Gemini / DeepSeek / Grok 换档后缓存还在不在、提示段落挪位后的模型表现，都没验证。
- 2026-10-15 · 过程记录带上上一轮找到的东西（`input.priorFinds`，取开轮板子上冻着的那一份；超限时新的一刀 `prior_finds` 在模型正文之后、快照之前），回放题 schema 加 `turn.priorFinds`、`runner.ts` 只在开轮那一跳带、`from-turn-record.ts` 原样转回、`gradeTurnRecord` 对账它；新题 R03。`tsc` + 改动文件 eslint（0 error）+ 定向 vitest（lib / types / constants / services/kernel / 过程记录服务 / 回放，300 个文件 4,921 条全绿）+ `npm run test:replay`（21 题 × 路由 = 27 跑 + 判分器反例 7 条 + 记录转题 10 条，44 条全绿）；把 runner 改成不带、把转换器改成不转时 R03 各红一次（请求体里没有那几行 / 记录转不回同一道题）。
- 2026-10-15 · 读页被挡、退路与查证三轮（见上「读页被挡、退路与查证轮次」）。`tsc` + 改动文件 eslint（0 error）+ 定向 vitest（lib / types / constants / i18n / services/kernel / services/research / `web-research.service` / assistant-operator 组件 / 回放，350 个文件 5,595 条全绿；新增：判据 28 条（挑战页真阳性、讲 Cloudflare / Access denied 的正常文章不误判、按站记一阵的 30 分钟到期与表满、HTML 转文字含刁钻输入的线性）、读页链 8 条（先后：Jina → wiki API → 直连；挑战页的字不进正文；整站挡之内不碰网络；只挡 Jina 下次跳过；读不出不记；字节上限）、wiki 网址解析 11 条、扇出排序 2 条、`read_url` 摘要退路 / 被挡拒绝 / wiki via / 快搜挑页 4 条、v3 摘要续上 2 条、日志条 1 条；轮次上限两条用例改成「第三轮允许、第四轮拒」）+ `npm run test:replay`（42 条全绿）。⚠ 灰机wiki 与 B站 wiki 的 API 路径按 MediaWiki 惯例写、Jina 头里 `Warning:` 行的格式按已知样子写，都没对真站验过（沙箱代理拒连这几个站）；没有对真模型 / 真浏览器跑过；进程内的「记一阵」在 serverless 多实例下各记各的。

- 2026-10-15 · 搜索期第三片：找到的东西编号 `#n`、按号动手、下一轮带上一轮的号、查证短版（见上「找到的东西的编号 `#n` 与查证短版」）。`tsc` + 改动文件 eslint（0 error）+ 定向 vitest（lib / types / constants / i18n / services/kernel / services/research / assistant-operator 组件 / 回放，347 个文件 5,510 条全绿）+ `npm run test:replay`（20 题 × 路由 = 26 跑 + 判分器反例 7 条 + 记录转题 9 条，全绿；新题 R02，判分器补 `stepPrompts` 会红的反例）。字数是单测里桩模型数的（7,213 → 1,602；16 次调用的一轮 152,805 → 74,251）。⚠ 没有对真模型跑过：模型会不会老实写 `#3`、点名准不准、短版之后会不会该 `read "[n]"` 时不读，都还没看过。
- 2026-10-15 · 搜索期第二片：`search_library` 加 `web_videos`，每张脸都开 `web_images` + `web_videos`（见上「找图 / 找视频」）。定向 vitest（v3 五张脸各一条 `web_videos` 用例）+ `npm run test:replay`；⚠ 没有对真模型跑过找视频的题，Serper `/videos` 的线上字段名没对过。
- 2026-10-15 · 每轮的过程记录接进 v3（`AssistantTurnRecord`，迁移只在 PGlite 上回放过、未对共用库执行）：`npm run test:replay` 19 题 × 路由 = 25 跑全绿，每一跑都对账自己写下的那一行并原样转回题目（含五家各跑一遍的 T25、两跳接力的 T01 / T03、看片的 V01 / V02）；把转换器故意改坏（丢最后一条回复）时 T11 两跑都红。v3 内核单测补了号与跳数、接力同号、老客户端丢号、空回复 / 审核 / 等确认 / 抛错的收尾、隐身与交回旧内核不记。

- 2026-10-15 · 自动回放基线落地（`npm run test:replay`）：19 题 × 路由 = 25 跑 + 判分器反例 6 条，全绿，约 15 秒；没有揭出真 bug（无 `knownBug`）。

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
