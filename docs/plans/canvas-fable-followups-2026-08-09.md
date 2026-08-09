# 画布 Fable 轮 · 待办交接（2026-08-09）

> 本篇是**任务交接**，不是设计稿。设计结论在 [`canvas-fable-brief-2026-08-09.md`](canvas-fable-brief-2026-08-09.md) §10 与 [`canvas-fable-report-2026-08-09.md`](canvas-fable-report-2026-08-09.md)。
> ⚠ **本会话只分配不执行。** 下面所有代码位置都是**「从这查」**的起点，**不是「问题在这」的定论** —— 它们来自只读静态调查，未跑测试、未真机复现。每条都附了**怎么证伪**，先证伪再动手。
> ⚠ 行号取自 HEAD `c6365637` 前后，并行会话可能已改。**开工前先按符号名 grep，不要照行号跳。**

## 0 · 本轮新拍板（补记）

**不可用档位用「置灰 + 给原因」**（owner 2026-08-09）。

判据（可复用到别处）：**枚举很多的东西用「消失」减噪；骨架固定的东西用「置灰 + 原因」**。

- **模型** = 几十项的列表 → 不兼容的**直接消失**（owner 2026-08-08 已拍，不变）
- **模式 / 能力档** = 固定几档的骨架 → **置灰 + 说出原因**（某档消失会让骨架变形，用户不知道自己少了什么）

已落在原型里的两处示范：视频节点模式下拉（「已连接媒体输入，无法使用纯文生视频」）· 文本节点模型能力（「当前模型读不了视频」）。归 UI 侧。

---

## 1 · ~~必修~~ ✅ **已修（2026-08-09）**

> **修法**：`readVoiceUrl` 的取值链追加第 3 档 `voiceSampleUrl`（`audioClip.url` >
> `voiceReferenceAudioUrl` > `voiceSampleUrl`）。owner 拍板「接上它」。
>
> **「样本该不该当配音素材」这个判断不是现拍的**，三处既有事实早就答了「能」：
> ① `NODE_STUDIO_VOICE_PROFILE.referenceSampleText` 的注释写明样本按 ~12-15s 设计，
> **就是为了卡进 fal Seedance reference-to-video 的 15s 音频上限**；② 详情面板证据抽屉
> 的标题就是「取样将发送」（`nodeDetail.sampleWillSend`）；③ 卡面 `VoiceNode` 与面板
> `VoiceDetailBody` 的试听源解析**都把 `voiceSampleUrl` 当这个音色的音频**。缺的不是
> 判断，是收割层没跟上 —— 同一个事实两条链。
>
> **「另一半提示」不需要新做**：`ReferenceTokenChip` 的 `references.voiceNotReadyHint`
> （「未上传/选择参考音频 — 本次生成不会发送」）已经挂在非 ready 的音色芯片上。上游
> 判「静默」是静态调查没看到这个机制。**不新增 dropped 理由、不新增 i18n 键** ——
> 本仓自己的注释也写着「用户不该在两个地方读少发了什么」。
>
> ⚠ **「那条钉错的测试」实测没有钉错**：`node-workflow-graph.test.ts` 的
> `skips voice nodes with no recorded audio URL` 夹具 data 里连 `voiceSampleUrl` 都没有，
> 接上第 3 档后照样绿。已改名为 `...with no audio field at all` 并加注释说清它覆盖什么、
> 不覆盖什么；真正没人守的两条（系统音色 / 取值优先级）已补。

<details><summary>原始记录（修前）</summary>

### 1 · 必修：系统 TTS 音色送不出声 ✅ **已证实（2026-08-09 探针实跑）**

> **证据**（临时探针跑 `harvestUpstreamAudioBindings`，跑完已删）：
>
> - 系统音色（`voiceId` + `voiceName` + `voiceSampleUrl`，无 `voiceReferenceAudioUrl`）→ **`bindings = []`**
> - 对照组（带 `voiceReferenceAudioUrl`）→ `[{url:"…/real.mp3", nodeId:"v2"}]`
>
> **「服务端可能另有补捞」这半也已排除**：`generate-video.service.ts` 只透传 `input.audioUrls`（:119、:290-292）；`voiceId` 在服务端只出现在 `cards/voice-card.service.ts`（卡片 CRUD），**不在生成链路上**。
> ⇒ **客户端 lib 层丢了就是真的丢了。这条从「推断」升为「事实」。**

**现象**：只有 `voiceId` 的系统音色节点接进视频生成，最终 `audio_urls` 为空，且**不进任何提示**。

| 项                     | 内容                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **从这查**             | `src/lib/node-workflow-graph.ts` 的 `readVoiceUrl`（约 :1050-1064）—— 取值只有 `audioClip.url` 与 `voiceReferenceAudioUrl` 两条；`voiceSampleUrl` 定义在 `src/types/node-workflow.ts:220`，写入点在 `VoiceDetailBody.tsx`（约 :339 取样本、:170-180 选音色） |
| **⚠ 陷阱**             | `node-workflow-graph.test.ts`（约 :2052-2065）有一条测试把「无音频 URL 的 voice 节点被跳过」**钉成了期望值**。修的时候它会红 —— **那是要一起改的，不是你改错了**                                                                                             |
| **另一半（同样重要）** | 这类音色在候选阶段就没生成 binding，所以也**不进 dropped 提示**（`node-video-send-preview.ts` 的 dropped 只收「超上限」与「审核未过」）。只把 URL 接上而不管提示，仍然是静默失败                                                                             |
| **怎么证伪**           | 真机：绑一个系统音色 → 发一次视频生成 → 抓请求体看 `audio_urls`。**若里面有东西，这条不成立**                                                                                                                                                                |
| **未排除的可能**       | 服务端可能另有补捞路径（`generate-video.service.ts` / `volcengine.adapter.ts` 未逐行读完）。证伪那一步同时能排除它                                                                                                                                           |
| **归属**               | service/lib 层 → Codex                                                                                                                                                                                                                                       |

</details>

## 2 · ~~必修~~ ✅ **已修（2026-08-09，owner 选 ② 连根拔，落地 B-1 + B-2）**

> **一件必须记住的事**：② 单独做**救不了**这条缺陷。存量画布里的 `role='frame'` 关键帧
> 节点，数据里根本没有首/尾这个信息（`imageCategory` 缺失），删掉创建入口只挡新病例，
> 已经存在的两张照样双双说「首帧」。**所以 ① 是 ② 的必需前半，不是它的替代品。**
>
> - **B-1 兜底中性化**（`resolveKeyframeLegendCategory` 现在收 `ordinal`）：无分类时
>   第 1 张仍是「首帧」（它在火山关键帧端点上确实是 `first_frame`），**第 2 张起走
>   `NODE_STUDIO_KEYFRAME_LEGEND_UNCLASSIFIED_CATEGORY`（「关键帧」）**。不猜「尾帧」是
>   有理由的：这个函数拿不到 modelId，首/尾只在火山关键帧端点成立（且那边由
>   `role: first_frame/last_frame` **结构**承载，图例本就不负责传首尾），多模态参考端点
>   没有首尾概念 —— 标尾帧只是换个方向说谎。三组夹具（都没标 / 都标了 / 混合）各一条测试。
> - **B-2 关掉创建源头**：`canvas-add-catalog` 的「关键帧」菜单项与 `node-assistant-ops`
>   的同名 intent 一并退役（含 `CanvasAddMenu` 图标与三语 i18n）。替代路径今天就能走：
>   加「图片素材」→ ⤢ 详情面板的分类下拉选「首帧 / 尾帧」（那颗下拉**无媒体也渲染**）。
>   **存量 role=frame / 旧 frameImage 节点仍被 `isKeyframeNode` 认、照旧发送。**
>
> ⛔ **B-3 不做（owner 2026-08-09 拍板「不删 frame role，B-3 到此为止」）**。
>
> 原计划是删 `frameImage` 族本体（role=frame · `FrameDetailBody` · `FrameImageNode` ·
> `node-types.ts` · 三语 i18n，实测 **36 个文件**）。查下去发现它**和 B-1 的修法冲突**：
>
> - B-1 的中性文案（第 1 张「首帧」、第 2 张起「关键帧」）**只对 `role='frame'` /
>   `type='frameImage'` 的存量节点生效** —— `isKeyframeNode` 的另一条分支要求
>   `imageCategory` 有值，而有值的节点本来就不会走兜底。删掉 frame role 等于把今天
>   刚修好的那段代码的**全部活输入**抽走。
> - 而归一没有无损答案：存量节点数据里**没有首/尾信息**，新世界的载体
>   `imageCategory` 又**只有 `frameStart`/`frameEnd` 两个值，没有中性的「关键帧」**。
>   降级成 `role='shot'` 会让那些图不再优先收割、不再进关键帧计划（画布看着没变，
>   生成结果变了）；一律标 `frameStart` 就是 B-1 明确拒绝过的说谎。
>
> **现状是自洽的**：B-2 已关掉创建源头（新病例不再产生），存量节点照旧被
> `isKeyframeNode` 认、照旧发送、图例已中性化。首尾语义有了新家（具名槽）之后再动
> 这一族，那时归一才有目标。⚠ **别再把 B-3 当待办捡起来** —— 它的前置不是工时，
> 是槽架落地。

<details><summary>原始记录（修前）</summary>

### 2 · 必修：关键帧图例说谎 ✅ **已证实，且比原描述更糟 · 但范围更窄**

> **证据**（探针跑 `harvestUpstreamVideoImageReferences`）：
>
> | 夹具                                           | 产出的图例                                                                      |
> | ---------------------------------------------- | ------------------------------------------------------------------------------- |
> | 两个菜单建的关键帧（**都无** `imageCategory`） | `{name:"首帧1", category:"首帧"}` · **`{name:"首帧2", category:"首帧"}`**       |
> | 对照组（显式 frameStart / frameEnd）           | `{name:"首帧1",category:"首帧"}` · `{name:"尾帧2",category:"尾帧"}` ✅ 正确     |
> | 混合（第一个无分类、第二个标了尾帧）           | `{name:"首帧1",category:"首帧"}` · `{name:"尾帧2",category:"尾帧"}` ✅ 恰好对上 |
>
> **比我原先写的更糟**：不只是 `category` 说「首帧」——**`name` 也是「首帧2」**，即**名字与分类两处都说首帧**，模型完全分不出首尾。
> **但范围比原先窄**：只要**有一个**标了分类，另一个的 fallback 恰好落对。**只有「两个都没标」才说谎。**
> ⚠ **而「两个都没标」正是默认路径** —— 菜单建的关键帧不带 `imageCategory`，且**无媒体时没有任何 UI 能标**（详情面板 frame 族无分类下拉，工具条分类入口要有媒体才出现）。所以这不是边缘情况。

**现象**：两个都没分类时，发给模型的图例把第二张也叫「首帧」。

| 项                              | 内容                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **从这查**                      | `node-workflow-graph.ts` 的 `resolveKeyframeLegendCategory`（约 :727-737）的 fallback → `NODE_STUDIO_IMAGE_ROLE_VIDEO_LEGEND_CATEGORY.frame`（`constants/node-studio.ts` 约 :665-671）                  |
| **关联事实**                    | `isKeyframeNode` 有三条并列分支（约 :111-133：role=frame / imageCategory ∈ frameStart·frameEnd / legacy frameImage）；`orderKeyframes` 排序键**只读 imageCategory**（约 :186-195），取不到时一律 rank 0 |
| **怎么证伪**                    | 真机：建两个菜单「关键帧」节点 → 接进关键帧档视频 → 看「查看发送内容」里的图例文字。**若两条都不带「首帧」字样，或第二条正确显示为尾帧，这条不成立**                                                    |
| **两种修法，请 owner/工程择一** | ①**止血**：无分类时别硬写「首帧」（改 fallback，改动小、不动结构）②**连根拔**：随设计侧「关键帧菜单项退役、首尾语义只活在具名槽」一起清双轨（改动大、但三层归一）                                       |
| **归属**                        | ①service/lib → Codex；②要等设计落地，UI+service 一起                                                                                                                                                    |

</details>

## 3 · ~~必修~~ **归类更正：这是新能力，不是缺陷**

**原先我把「图片收割不读上游文本」列进了「实现前必修」，这个归类是错的。**

现行行为是**有意设计的**：`StudioNodeWorkbench.tsx`（约 :1279-1281）有显式视频门 `isVideoMediaNode ? harvestUpstreamShotTextPrompt(...) : ''`，而 `src/lib/node-workflow-prompt.ts`（约 :56-64）的注释写明「镜头图不读上游文本，不传即可」。**它不是 bug。**

它之所以出现在清单里，是因为**本轮设计**让文本胶囊也能出现在图片节点上——那条路要通，就得给图片收割加读文本。所以：

- **正确归类**：随设计落地做的**新能力**，不是独立 bugfix
- **不该现在单独修** —— 现在改会造出一个「能力已通但 UI 没有入口」的中间态
- **做的时候要一起想的**：图片生成的提示词拼接顺序（视频侧今天是写死的，正是文本胶囊要解决的问题）

## 4 · 候选缺陷（**未复现，先复现再判**）

### 4.1 referenceAsset 条目的 approve 操作错对象 ✅ **已修（2026-08-09）**

> **修法**：新增纯函数 `resolveReviewTargetUrl`（`src/lib/node-review-queue.ts`）——
> 审阅模式钉住的那一条优先，钉住的若已不在这张卡上（幽灵）退回主媒体，钉的是别的
> 节点则不串台。`MediaReviewButtons` 改用它，不再自己 `getNodeMediaUrl`。
>
> **解析放在纯函数里、不让调用方传 URL**，是因为审核动作是**多入口**的（今天生成框，
> 明天详情面板 / 近场工具条）：闸写在它们共同经过的那一处才不会漏，逐个入口各传各的，
> 第二个入口出现时就会漏掉这道判断 —— 本轮已经在容量检查上栽过完全同一个形状。
>
> **守卫**：`node-review-queue.test.ts` 六条（纯函数层，含幽灵 / 串台 / legacy imageUrl）
> ＋ `CanvasImageReviewTarget.test.tsx` 七条（组件层，含「没进审阅模式仍按主媒体走」
> 这条不回归）。原来的两条缺陷快照已翻成正确期望。

<details><summary>复现记录（修前）</summary>

> **复现件**：`src/components/business/node/CanvasImageReviewTarget.test.tsx`（2026-08-09，
> 只复现**不修**）。四条断言给出确定性结论：
>
> - 待审队列指着 `referenceAssets[].url`（`collectReviewQueue` 如注释所言收它）
> - **而工具条读的是主媒体** —— 于是主媒体无审核记录 → 祖父条款判 `approved` →
>   **连「通过」按钮都不渲染**。用户从审阅队列飞过来要点的那颗键根本不存在（比原推断
>   「写错对象」更靠前一步就断了）
> - 点「打回」写在**主媒体**上，待审的那条 referenceAsset 一个字没动 → 它会永远挂在
>   队列里，「还剩几张」减不下去
> - 对照组（待审项就是主媒体）行为正确 —— 所以问题是**两层指向不同 URL**，不是审核逻辑本身
>
> **修法方向（未做）**：`MediaReviewButtons` 不该自己解析 URL，应由调用方把「当前审阅的
> 那一条」传进来（审阅模式知道它是谁）。归后续包。

<details><summary>原始推断（复现前）</summary>

#### 4.1 referenceAsset 条目的 approve 可能操作错对象

- **推断链**：待审队列的 URL 集合**包含** `referenceAssets[].url`（`src/lib/node-review-queue.ts` 约 :46-54，注释说这是为了让助手的 `set_review_state` 能标到收集器里任意一条）；而 approve 按钮取 URL 用 `getNodeMediaUrl`（`CanvasImageSelectionToolbar.tsx` 约 :798），该函数只返回 `imageUrl ?? mediaUrl`（`node-workflow-graph.ts` 约 :268-275）。
- **若推断成立**：某条待审项的 URL 是 referenceAsset 时，审阅条能飞过去、能计数，但通过按钮写回的是**另一个 URL**。
- **不受影响的**：助手 `generate` 产出的主路径（写的就是 `mediaUrl`）。
- **怎么复现**：让助手对收集器卡里某条 referenceAsset 发 `set_review_state` 标待审 → 进审阅模式 → 点通过 → 看 `reviewState` 写回到哪个对象上。**若写对了，这条不成立。**

</details>

</details>

### 4.2 `autoAppliedCount === 0` 时的不一致态 ✅ **已修（2026-08-09）**

> **先答了「0 是怎么来的」** —— 上游列的三条推测路径，只有一条成立：
>
> | 推测                                                             | 结论                                                                          |
> | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
> | `conversation.isLoading` 仍为 true，effect 被守卫挡住            | ❌ 提前 `return`，压根不 setState → 产生的是 `undefined`                      |
> | `runAssistantCanvasOps` 为 undefined，dock 直接返回 `applied: 0` | ✅ **唯一来源**（`StudioNodeAssistantDock.tsx` 的 `handleApplyAssistantOps`） |
> | 该 message.id 在 effect 首次执行时已被记入 `seen`                | ❌ 不进 `pending`，同样是 `undefined`                                         |
>
> ⇒ **`0` 的语义是确定的：自动落跑过了，但一条都没落。图没被改，所以条目当然还能编。**
> 选了「`canToggle` 也认 0」那一支，**没选**「dock 侧永不传 0 而传 `undefined`」——
> 后者会抹掉「已经试过了」这个信息，而两者对 UI 的要求本来就一样。
>
> **修法**：三处判据统一到一个值 `landedCount`（`number | null`）。⚠ 查下去发现是
> **三处不是两处** —— 上游只列了 `canToggle` 与回执，漏了 `plan` 的选择（约 :84）：
> 它也在问「自动落落了没有」，0 时会把计划错误地冻在首帧那一份，而那时**图根本没被改**，
> 计划本该继续跟着画布实时重算。现在三处共用一个值，物理上不可能再不一致。
>
> **守卫**：`CanvasOpProposalCard.test.tsx` —— 缺陷快照翻成「0 时条目照样可勾选剔除」，
> 另加 `it.each` 两档（0 跟着画布重算 / 2 冻在首帧）锁住第三个面。
>
> ⬜ **仍未做（记录）**：`StudioNodeAssistantDock.tsx` 的自动落 effect 依旧**零单测覆盖**。
> 本轮是静态读证实了 0 的来源，不是测出来的。

<details><summary>复现记录（修前）</summary>

> **复现件**：`CanvasOpProposalCard.test.tsx` 新增两条（2026-08-09，只复现**不修**）。
> 结构 op 存在 + `autoAppliedCount: 0` 时：回执不渲染（0 条没什么可回执）→ 落到应用按钮
> 那一支 → **「应用」按钮在，但每一条条目都是 `disabled`**，用户看得见应用却剔不掉任何一条。
> 对照组（`autoAppliedCount` 缺省）条目可勾选，确认差异只由这一个值造成。
>
> **修法方向（未做）**：两处判据统一 —— 要么 `canToggle` 也认 0（0 等于「没落，还能编」），
> 要么 dock 侧永不传 0 而传 `undefined`。**得先答「0 是怎么来的」**：§4.2 列的三条推测路径
> 仍未验证，而它们的执行端 `StudioNodeAssistantDock.tsx`（约 :386-423）**零单测覆盖**。

<details><summary>原始推断（复现前）</summary>

#### 4.2 `autoAppliedCount === 0` 时的不一致态

- **推断链**：`CanvasOpProposalCard.tsx` 约 :308 要求 `autoAppliedCount > 0` 才显示回执，而约 :234 的 `canToggle` 只要求 `=== undefined` → 等于 0 时会出现「**有应用按钮，但条目不可勾选**」。
- **现有测试没覆盖**：`CanvasOpProposalCard.test.tsx` 约 :117 用 `autoAppliedCount: 0` 测的是**纯 `set_review_state` 批**（此时 `structuralOps` 为空，按钮本就不渲染），没覆盖「结构 op 存在且 applied=0」。
- **怎么走到 0（三条推测路径，均未验证）**：提案卡渲染时 `conversation.isLoading` 仍为 true（effect 被守卫挡住）· `runAssistantCanvasOps` 为 undefined 时 dock 直接返回 `applied: 0` · 该 message.id 在 effect 首次执行时已被记入 `seen`。
- **怎么复现**：优先补一条单测（结构 op 存在 + `autoAppliedCount: 0`）看渲染是否自相矛盾——**比真机复现快，且能直接当回归**。
- **同批发现的第三件**：自动落那道闸的执行端（`StudioNodeAssistantDock.tsx` 约 :386-423）**零单测覆盖**。

</details>

</details>

## 5 · 执行顺序与进度

| 步  | 内容                                           | 状态                                                                                                                                                                      |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ①②证伪                                         | ✅ **已做（2026-08-09，纯函数探针，未烧生成、未改 `src/**`）—— 两条均证实，且各自被精确化（见 §1 §2 顶部证据框）\*\*                                                      |
| 2   | ①②动手修                                       | ✅ **已做（2026-08-09）**。①接上 `voiceSampleUrl`（提示复用既有 `voiceNotReadyHint`，不新增通道）；② owner 选连根拔，落地 **B-1 兜底中性化 + B-2 关掉创建源头**           |
| 3   | 4.1 / 4.2 补单测复现                           | ✅ **已做（2026-08-09，只复现不修）**。两条推断**均成立**，4.1 比原推断更糟（通过按钮压根不渲染）                                                                         |
| 3.5 | **4.1 / 4.2 动手修**                           | ✅ **已做（2026-08-09）**。4.1 → `resolveReviewTargetUrl` 收口；4.2 → 三处判据统一到 `landedCount`（**上游只列了两处，第三处是 `plan` 的选择**）。结论见 §4.1 / §4.2 顶部 |
| 4   | 「置灰 + 给原因」                              | ⬜ 归 **UI**，随切片实现一起做，不单独开工                                                                                                                                |
| 5   | §3（图片读上游文本）                           | ⛔ **不要动**，等设计落地                                                                                                                                                 |
| 6   | B-3 删 `frameImage` 族本体                     | ⛔ **不做（owner 2026-08-09 拍板）** —— 它和 B-1 的修法冲突，且归一没有无损答案。理由见 §2 顶部，**别再当待办捡起来**                                                     |
| 7   | `StudioNodeAssistantDock` 自动落 effect 补单测 | ⬜ 未做。0 的来源是**静态读**证实的，不是测出来的                                                                                                                         |

### 探针夹具（给 Codex 直接复用，写成正式测试时照抄即可）

```ts
// §1：系统音色送不出声
const voice = {
  id: 'v1',
  type: NODE_TYPE_IDS.voice,
  position: { x: 0, y: 0 },
  data: {
    voiceId: 'sys-tender',
    voiceName: '温柔女声',
    voiceSampleUrl: 'https://example.com/sample.mp3',
    status: 'ready',
  },
}
const video = {
  id: 'vid',
  type: NODE_TYPE_IDS.seedance,
  position: { x: 0, y: 0 },
  data: {},
}
harvestUpstreamAudioBindings(
  'vid',
  [{ id: 'e', source: 'v1', target: 'vid' }],
  [voice, video],
)
// 今天 = []            期望修复后 = 一条带 voiceSampleUrl 的 binding

// §2：两个无分类关键帧
const kf = (id: string) => ({
  id,
  type: NODE_TYPE_IDS.image,
  position: { x: 0, y: 0 },
  data: {
    role: NODE_IMAGE_ROLE_IDS.frame,
    mediaUrl: `https://example.com/${id}.png`,
  },
})
harvestUpstreamVideoImageReferences(
  'vid',
  [
    { id: 'a', source: 'kfA', target: 'vid' },
    { id: 'b', source: 'kfB', target: 'vid' },
  ],
  [kf('kfA'), kf('kfB'), video],
)
// 今天 = 首帧1/首帧 + 首帧2/首帧      期望 = 第二条不得再自称「首帧」
```

## Last updated

- 2026-08-09 · Fable 设计档交接。全部为只读静态调查的推断，未跑测试、未真机复现；行号可能因并行会话漂移，按符号名 grep。
- 2026-08-09（同日晚）· 执行会话回填：§1 §2 已修，§4.1 §4.2 已复现且两条推断均成立。
  真机只验到「系统音色落库形状 = `voiceId`+`voiceName`+`voiceSampleUrl`，无
  `voiceReferenceAudioUrl`」与「＋添加菜单不再有关键帧」两处；**voice→video 连线后的
  发送预览没在真机上跑通**（36% 缩放下拖不中 ReactFlow 的连接点，注入 localStorage 的边
  会被应用回写覆盖），那一段由单测覆盖。
