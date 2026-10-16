# src/components/business/studio/ — Studio Workspace Components

## Risk Level: HIGH (`studio/` + `studio-shared/` 全部组件共享 3 个 context)

现行方向 A「连续对话与结果优先」：工具记录默认折叠，失败摘要独立显示，没有五动词常驻条和「参考依据」折叠。现行增量契约见 `docs/references/pages/assistant-shell-v2.md` 的 A 方向节。

## Component Tree

Studio chrome 已物理拆分：稳定外壳在 `studio-shared/`（`chrome/` + `workflow/` + `setup/`），
image-only 与尚未迁移的组件留在 `studio/` 或 `image/`。下面标注每个节点的真实目录。

三个模态统一走横向工作台（`studio-shared/chrome/StudioWorkbenchLayout`），栏位差异归
`StudioPromptArea` 按 `outputType` 自己分。`StudioFlowLayout` / `StudioBottomDock` /
`StudioToolbarPanels` / `StudioToolbar` 已删，勿复活。

```
(workspace)/layout.tsx
└── StudioProvider
    └── StudioWorkspaceUI (components/business/ — mounted once for image/video/audio)
        ├── StudioWorkbenchLayout (studio-shared/chrome/ — 三模态共用：`columns` = 左参数栏 + 右结果区；`bottom` = 舞台在上 + 底部输入框卡（图片台桌面，自然语言与标签两台，2026-09-26；视频台桌面 09-27 同一个外壳；标签台桌面由 `StudioWorkspaceUI` 直接挂进**同一个**布局元素：输入框 `tags/StudioTagsComposer` + 舞台 `tags/StudioTagsStage`，头部写法切换因此跨台不重挂；手机走 `tags/StudioTagsWorkbench` 上方舞台 + 固定底部编辑框，复用 `StudioTagsComposer`，负向默认折叠），助手展开时地台右内边距绑 `studioOperatorYield` 让位)
        │   ├── params: StudioPromptArea (studio/ — 提示词 + 加料 chip + 模态参数 + 模型 + 规格 + 生成；`layout="bottom"` 同一套控件排成输入框 + 工具行（图片自然语言台与视频台桌面；`column` 竖排栏只剩音频档），生成键走 `StudioGenerateButton variant="round"`；工具行 chip 外观由 `StudioChipLookProvider` 圈定、各 chip 用 `useStudioChipClasses()` 取类，⛔ chip 里不判断自己住哪个宿主；这一行的弹层开合 = ②「从 chip 放大」，走 `tool-surface.tsx` 的 `useStudioChipPopoverMotion`（`StudioToolPopoverContent` 已内置，自己画弹层的 chip 自己接）；⛔ `liquid-popover.tsx` 共享形状那一版已删)
        │   │   ├── StudioCardSection (studio/ — 卡片工作流时才渲染，非音频)
        │   │   ├── StudioVideoAssetRail (studio-shared/chrome/ — 视频台输入框顶上的素材排：挂了才出现，图片N · 视频N · 音频N，
        │   │   │    首 / 尾帧是角标、点一格换角色或移除；最右一行只读灰字说这一枪怎么发)
        │   │   ├── StudioVideoAssetChip (studio/ — 视频台工具行「素材」：唯一的「＋」，挂满 / 这个型号不收的那一项灰着写原因)
        │   │   └── StudioVideoPromptInput (studio/ — 视频档提示词框：按模型写法把素材编号渲染成缩略图胶囊，存储仍是原文)
        │   └── stage: StudioCanvas (studio-shared/chrome/；外面套一层 `StudioStageSwap`（同目录）在结果与一块舞台面板之间换场 —— 模板面板 `templates/StudioTemplatesPanel`（每一台都有，模板 C：点一张直接套用；手机走 `variant="phone"`；撤销条 `templates/StudioTemplateUndoToast` 挂在输入框卡 / 手机输入条 / 标签台底栏上沿，竖排参数栏那一台（音频）挂在舞台底部（`StudioWorkbenchLayout.stageOverlay`）；开合与套用 / 撤销快照住在 `StudioWorkspaceUI` + `hooks/use-studio-template-apply.ts`，模型清单按档取 `hooks/use-studio-mode-model-options.ts`），标签台另有查资料 / 构图；结果层不卸载只藏)
        │       ├── StudioReferenceRail (studio-shared/chrome/ — 参考轨，与结果并存；`bottom` 布局不画（`referenceRail={false}`），附件在输入框里)
        │       ├── GenerationPreview (studio/ — current result)
        │       ├── CompareGrid (image/ — 共享图墙：多模型 / 多张 / 矩阵)
        │       ├── AudioVariantGrid (studio/ — 音频变体，内联播放器)
        │       └── StudioResultFeedback / StudioAudioFeedback（生成失败在 GenerationPreview 里就地说：线停住变灰 + 原因 +「重试」，⛔ 错误对话框，加载态 A）
        ├── StudioAssistantDock + StudioAssistantFab (studio-shared/chrome/ + studio/ — 旧助手，只剩音频档走它；图片/视频已归 operator)
        ├── StudioOperatorDock (studio/assistant-operator/ — 操作员面板外壳：宽度/收放；图片+视频档)
        │   ├── StudioOperatorAvatarToggle (**头像开关**：36px 人设头像 + 数字角标（待确认 + 未读结果，打开面板清零），**右上角**；一个持久 fixed 元素、两个锚点（顶栏 36 ↔ 面板头部槽 22），位移跟着形状左边沿走；图片台桌面（布局 A，锚点 `avatarStays`）头像留在原位不进头部，面板改从右侧滑入、工作台同一根弹簧让位（不走 B 形状）。面板宽 = 视口 × 比例（缺省 0.3，`STUDIO_OPERATOR_PANEL_RESIZE`）。D7b ④；展开形状 = B「先横成一条，再落下」（clip-path，09-26），铁律见 v2 §4.3。⛔ StudioOperatorCollapsedButton · StudioOperatorIconRail · StudioOperatorCollapsedCard · StudioOperatorMobileFab 四个文件都已删)
        │   ├── StudioOperatorMobileSheet (手机 vaul Sheet：**接近满屏 95svh、顶上只留一条窄缝**，往下拖即关；`modal={false}` 不画遮罩也不锁 body —— 装的是下面同一个 Panel 元素。⛔ 半屏 0.55 与 `snapPoints` 整套已删（owner 2026-09-20「半屏高度不够」），软键盘由 `maxHeight` 扣 `--keyboard-inset` 接住)
        │   └── StudioOperatorPanel (同目录 — 面板内容：空态 / 时间线 / 双行输入区)
        │       ├── StudioOperatorHeader (头部一行 44px：左上头像槽（桌面留位给外壳那颗，手机自己画）/ 会话标题▾（= 历史下拉、唯一的历史入口，新会话在底部）/ 续跑 / 右上一颗 ⋯（助手设置 · 隐身）。⛔ 没有收起键（09-26 试过又撤回），收起 = 点头像（悬停「收起 · Esc」）；头像位 `slot` / `own` / `none` 由外壳给；⛔ 域标记胶囊已搬去输入框上方（D7c ④）)
        │       ├── StudioOperatorPinnedEvidence (面板顶部「钉住的证据」常驻条：钉住后在顶部留一份、点回原卡、× 取消钉住；⛔ 没钉住就整条不渲染；v2 §3.2 / 画板 BCards「已钉住 · 留在面板顶部」)
        │       ├── StudioOperatorEmptyState (空态：助手头像 40px + **一句话**（`face.emptyLine`），⛔ 就这两样；起手药丸已搬去输入框正上方那一排 28px chip（D7c ④，只在空态出现）。上下留白是两根 `shrink`+`grow` 的 spacer（basis 52 / 44）—— ⛔ 不写成 padding：矮容器里 padding 不让步)
        │       ├── StudioOperatorTimelineRow (时间线沟一行 + **五类卡的分派点**)
        │       │   └── TimelineAvatar (用户 / 助手 32px 头像，与竖线同轴；助手那一档另出口 `AssistantTimelineAvatar` —— 它不碰 Clerk，收起态与空态用的是它)
        │       ├── StudioOperatorToolGroup (「5 个操作 · 4 成功 1 失败」折叠行；跑着时标题是**人话动词**（`operatorRunningPhrase`），跑着自动展开、跑完自动收起，用户点过以用户为准。§9.1)
        │       ├── StudioOperatorResearchProgress (调查那一行，三态：跑着一行微光 + 预估 / 点开展开步骤 / 跑完收成灰底一行「搜了 N 条 · 读了 M 页」，创作者让 Grok 看视频时多一段「看了 X 上 N 段视频」；有失败步时退回 ToolGroup。56b 切片 2)
        │       ├── StudioOperatorCheckpointCard (每轮过程行上的「撤销」，点一下退回这一轮的改动 —— **撤回的唯一入口**，owner 2026-09-24)
        │       ├── StudioOperatorQueueBar (排队条，浮在输入框上方)
        │       ├── MentionInput（共享输入框：正文存 `<@kind:id>`，渲染成缩略图胶囊（`literal` token）；
        │       │    助手这里走**外部菜单**模式（`mentionMenu` 绑定 = combobox ARIA + 多词查询 + Esc 记住放掉的 `@`），
        │       │    单击胶囊 → `onChipClick`。统一引用模型见 v2 §4.4「`@` 引用」）
        │       ├── StudioOperatorMentionMenu（`@` 菜单：贴在输入框正上方、⛔ 不 portal；最近使用 · 分组 4 条 +「查看全部」·
        │       │    「全部 @」· 素材库文件夹下钻 · 搜索 ≤20 条 · 悬停预览；形状来自 `lib/assistant-mention-menu.ts`）
        │       ├── StudioOperatorMentionCard（单击胶囊的小卡片：看大图 · 在画布上定位 · 当作哪种参考 · 移除；已删除只剩移除）
        │       ├── AssetSelectorDialog（＋ 弹层里「从素材挑图」/「全部」开的弹层：
        │       │    `AssetPickerBrowser` 多选 + 图片锁 + 文件夹分类 + 无限滚动，首屏 10 条；选中 = 插 `library` 胶囊）
        │       ├── StudioOperatorResultRow (结果卡三态：生成中 / 单张 / 多张；**无审核态**，只有「再来一组」「用它当参考」两颗。回流在 use-studio-operator-results.ts)
        │       ├── StudioOperatorLogItem (时间线一行：工具步 / 动作 / 系统行 / 证据卡)
        │       ├── StudioOperatorWebCandidateGrid (找到的图：摆在**回答正文底下**（`StudioOperatorMessageBody.webFinds`，挂哪段按位置 `collectOperatorAnswerWebFinds`），没等到回答时就地画在那一块工具步的过程行外面；**胶片条**（owner 2026-10-16 选 B，配色跟项目 token）：一行横滑吸附（`snap-x`），图按比例三档宽（竖 / 方 / 横），左上「#n」、左下「回复提到」、右上一颗圈（44px 热区）点一下**先选上**（不下载），条下一块「已选 N 张 · 附上 N 张」统一附到下一句话（进输入框的附件、同时收进素材库，⛔ 不进参考位；另有「全选能用的」）；已附上的圈换图钉、再点 = 取下；只能看原页的图变淡没有圈。图下一行站点名 + 域名（整行是打开原页的链接）+ 一行状态。⛔ 别搬回日志条 / 步骤组（搜索期切片 1，2026-10-15）。第三方网图一律 `hooks/use-third-party-image.ts`（no-referrer → 热链代理 → 直连），灯箱 `openOperatorLightbox(url, caption, { thirdParty })`)
        │       ├── StudioOperatorWebVideoRow (找到的视频（搜索期第二片，2026-10-15）：与找图网格同一个槽、排在它下面（`orderOperatorWebFinds`）；一排 16:9 卡片，**一律横滑吸附**（与找图同一条胶片条，2026-10-16），播放器在条下面；左下「回复提到」，标题下一行写点了会怎样（在面板里播 / 正在下面播 / 去 X 看）；封面 `useThirdPartyImage` + `useMediaReveal`，取不到画场记板占位；左上「#n · 平台」角标、右下时长（取不到不画）、两行标题 + 频道；还在搜 = 同形状灰卡。点一张 = **面板里播**（官方嵌入，地址由 `lib/web-video.ts` 的 `resolveWebVideo` 算：YouTube nocookie / B站 / niconico / Vimeo；iframe sandbox ⛔ `allow-top-navigation`，常量在 `constants/web-video.ts`），认不出稿件号的（b23.tv 短链等）与别的站是新窗口链接（`noopener noreferrer`）。⛔ 不下载、⛔ 不转存。播放器是 `StudioOperatorWebVideoPlayer`（带「放大」：整张卡是 `popover`，放大 = 同一个元素进顶层浮在页面中间、iframe 不重载接着播，样式 `operator-video-stage`，owner 2026-10-16），**全面板只有这一个**：回答底下的视频证据（媒体条 / 标成视频的来源卡）与过程行证据条也用它，⛔ 别再写第二个)
        │       ├── StudioOperatorFindRef (回复里的 `#3` 与它指的那张卡（搜索期第三片，2026-10-15）：`withFindRefs` 把正文里认得出的号换成小胶囊（认不出的原样留字，表由 `lib/studio-operator-timeline.ts` 的 `collectOperatorFindRefs` 算：这一轮 + 上一轮），悬停 / 焦点圈卡、点一下滚过去圈 `STUDIO_OPERATOR_FIND_REF.flashMs`；一轮最后那段回复点到的卡常驻细黑框（`namedFinds` 传给网格与视频那一排）。高亮是模块级 store（同 Lightbox），圈是内收 outline。⛔ 别逐层传回调、⛔ 别为它另写 markdown 渲染器)
        │       ├── StudioOperatorSpecLine (输入框上方的规格行：点开**就地**调模型 / 比例 / 张数 / 清晰度，与确认卡同一份 `generationControls`（`lib/studio-operator-knobs.ts`）；空态让位给起手 chip。D12 B6 / P1 / P7)
        │       ├── 输入区（D12 T-A，P4 改）：**一个边框** = 文字 + 工具行（**＋**（`StudioOperatorAddMenu`：最近的图一行 +「全部」/ 从素材挑图 / 上传文件 / @ 角色或素材，⛔ 没有拍照，owner 2026-10-16）· 助手模型灰字（只列聊天模型；出图模型看输入框上方那行，跟当前台走）· 思考 · 自动生成开关 · 圆形发送 / 停止）。弹层都从自己按钮正上方长出来，同宽 `w-64`。⛔ 别复活旧 `StudioOperatorPlusMenu`（那颗管上下文卡 / 指定来源）：提及 = 打 `@` 或 ＋ 里的 `@`，指定来源在话里说（`research.onlySources`）；上下文卡只剩助手提议那张确认卡（设置里那一页 09-26 已删，09-25 定整体去掉）
        │       ├── StudioOperatorHistoryItem (会话历史条目)
        │       ├── StudioOperatorModeSwitch (头部右侧「工作 / 聊天」切换：同一段对话里换模式、记录不变，切的地方时间线留细线 `StudioOperatorChatMark`；聊过谁就接着聊，没聊过先选。v2 §7.9)
        │       ├── StudioOperatorModeSwitch（头部「工作 / 聊天」切换；聊天里点开的弹层顶上写「你在故事里是谁」，关弹层 / 换人才存到角色卡上，按角色记。原头部「和 X 聊」胶囊 `StudioOperatorChatPill` P4 已删，⛔ 别复活）
        │       ├── StudioOperatorChatLine (聊天会话里一条对白底下那排小动作：改 · 删（再点确认）· 她最后那段「重新生成」· 「‹ 2 / 3 ›」；按条目对象本身改，⛔ 按 id。工作会话不套。v2 §7.9)
        │       ├── StudioOperatorMessageBody (助手正文那一格：无气泡 / 长回话折首句 / `detail` 折成「为什么」 / 空正文时的「正在想…」行（`StudioOperatorThinkingRow`：<1 s 不露字 → 呼吸点 + 扫光 + 秒数，>6 s 慢提示，接力跳写「正在画布上落地…」；第一个字到了正文上方「想了 N 秒」。§9.1） / **句尾 `[n]` 角标**（56b 切片 1）· **`#n` 胶囊**（`findRefs`，搜索期第三片）· **末尾光标 + `motion-reduce` 扣住整段**（切片 3）)
        │       ├── StudioOperatorAnswerSources (回答底下那两样：媒体条（图片开灯箱 · 视频封面能嵌就在面板里播、嵌不了开新窗口）+ 一排来源卡（站点图标 + 标题 + 域名，角标点下来高亮；标成视频、能嵌的那张是按钮，同一个播放器）+ 「深入调查 / 钉住 / 回执」一行)
        │       ├── StudioOperatorQuestionBlock (问题块：**与输入框同框**、一组 ≤4 题一次一题、每题 2–6 项、「1 / 3」进度 + 竖排选项（可带缩略图）+ 「其他…」（只把焦点交给输入框）+ 「跳过 · 全部用推荐」；**单选点即进下一题、⛔ 没有「确定」；多选勾选 + 「确定（N）」是唯一例外**（owner 2026-10-14）；勾选住 store（`question.checked`）；键盘 ↑↓ / 1–9 / 空格 / Enter / Esc 跳过；radiogroup / checkbox。面板只交 id，文案与缩略图由 hook 从卡上取。答完的回执（「问题 · 答案」）**不再画进时间线**，只以 `questionAnswered` 系统条目留在数据里、`userText`（i18n）进对话。v2 §3.4)
        │       ├── StudioOperatorConfirmCard (确认卡：多步 / 生成两支，就地换「已确认 · 时间」)
        │       └── StudioOperatorLightbox (全屏单例，模块级 store，三处共用)
        ├── StudioDockPanelArea (studio/ — 工具面板宿主，见下方规则 3)
        ├── StudioKeepChangePanel (image/)
        └── StudioCommandPalette (studio-shared/chrome/ — Cmd+K)
```

**operator 系对外只有一颗入口**（`assistant-operator/index.ts`）：`StudioOperatorDock`（`StudioWorkspaceUI` 与 LoRA 工作台 `studio/lora/LoraWorkbench.tsx` 挂）。其余是面板内部件，不从 index 导出。⛔ 撤回只有每轮过程行上那一颗「撤销」（owner 2026-09-24）：✦ 字段还原、全部还原、逐步撤销、连对话一起回、恢复到这一步（含整套配置快照）都已删除。训练 tab 的身体在 `studio/lora/training/TrainWizard.tsx`（配 `hooks/use-lora-train-wizard.ts`），`LoraWorkbench.tsx` 里只剩 tab 分派那一行。
**卡片已收敛为五类（v2 §3.2）**：消息 / 问题 / 确认 / 结果 / 证据 + 系统行，分派表在 `StudioOperatorTimelineRow.tsx`（`STUDIO_OPERATOR_CARD_KINDS`）。⛔ `StudioOperatorSpendConfirmCard` · `StudioOperatorAssetChoiceCard` · `StudioOperatorProgressBand` **三个文件已删**，旧的覆写三选条也整块删掉 —— 别再按名字找：花钱确认随决策 8 消失，缩略图单选并进问题卡，覆写三选降级成问题卡，进度带的两样挂件搬去了头部。`StudioOperatorConfirmCard`（`confirm` 两支；生成支确认即客户端扣扳机）· `RuleChip`（面板已渲染）· `AssistantSettingsDialog` + `AssistantAvatarGlyph`（入口是**头部右上 ⋯ 菜单里的「助手设置」** → `onOpenAssistantSettings`，开合 state 在 Dock；⛔ 没有常驻齿轮。弹窗只是外壳，内容住 `business/assistant-settings/AssistantSettings`（助手设置 B：「人设 / 记忆」两页、改了就存，与 `/settings/assistant` 同一份）；⛔ `AssistantPersonaPreview` 已删。⋯ 菜单只有「助手设置 · 隐身」两项，历史会话只走标题下拉，D12 B7 / B9）· `StudioOperatorTimelineList`（面板那颗 `threadRef` 容器，`role=log` + `aria-live=off`；播报只走同文件的 `StudioOperatorLiveStatus`：开始 / 完成 / 停止 / 失败四句，§9.1）。
**皮肤是方向 B「玻璃仪表 · 浅色」（v2 §12）**：三层玻璃 = 面板（`assistant-glass-panel` + `shadow-assistant-panel`，18px 圆角）/ 卡片（`bg-card` + `border-border` + `shadow-assistant-card`，⛔ 不带模糊）/ 浮层（`assistant-glass-overlay` + `shadow-assistant-overlay`，历史下拉 · +菜单 · 模型选择器）。「当下要你动手的那张卡」（问题 / 确认待决 / 输入区 / 结论编辑）多一档 `border-assistant-line-strong` + `shadow-assistant-raised`。**信号位只用近黑实底 + 白字**（`bg-foreground text-background`）—— ⛔ 不用 `--primary`，那一支被工作台的生成键占着（§12.2）。token 全在 `globals.css`，⛔ 组件内不写 hex、不写任意值。

已删、勿按名字复活：`StudioOperatorChangeRail` · `StudioOperatorRestoreButton` + `types/studio-operator-checkpoint.ts`（撤回收成一个入口，owner 2026-09-24）· `StudioOperatorRoundSummary`（本轮记录不在界面上显示，owner 2026-09-24；续跑按钮拆成 `StudioOperatorResumeChip`）· `StudioOperatorPlusMenu` + `ContextCardChip`（D12 U2–U4）· `StudioOperatorCritiqueCard` + `use-studio-operator-critique.ts` + `lib/studio-operator-claim.ts`（出图后不自检，D12：助手不会自己去看刚出的图，用户 `@` 一张让它看时由正文回答，`critique_result` 那一步折进过程行）· `StudioOperatorResearchCard`（证据在回答底下的 `StudioOperatorAnswerSources`，过程折进 `StudioOperatorToolGroup`，找到的图摆在回答底下（`StudioOperatorWebCandidateGrid`，日志条只留一句「搜索 Google 图片：… · N 张」），找到的视频排在图下面（`StudioOperatorWebVideoRow`，日志条只留一句「搜索视频：… · N 个」））· `StudioOperatorReferenceAnalysisCard`（`analyze_references` 工具仍在，是 v2 内核 `set_prompt` 的取材来源，历史里的 `referenceAnalysis` 喂 `readOperatorReferenceProfiles`；v3 写词不走它，看图由主模型自己看）· `StudioOperatorQuestionCard` + `PlanOptionVisual`（反问 = 输入区 `StudioOperatorQuestionBlock`，一帧一组 ≤4 题、界面一次一题；选项 `visual` 暂无渲染方，助手提示也不要求它）· `StudioOperatorStreamingText`（正文按 `message_delta` 追加到同一条 `streaming` 气泡，末尾一根不闪的光标，定稿帧按 id 整体覆盖；`motion-reduce` 下写完才画）。

**视频档素材轨**（owner 2026-09-24 视频画板）：⛔ 没有「关键帧 / 多图参考 / 全能参考」模式 —— 这一枪走哪个端点由挂了什么推出来（有参考项 → 参考端点，首尾帧随行；否则关键帧端点），与画布同一个 `videoSendMode` / `resolveVideoSendModelId`。选择器一行一个型号 × 渠道（`isVideoPickerModel`）。素材排 `StudioVideoAssetRail`（owner 09-27 视频台 A：挂在输入框顶上）按类型编号，编号 = 显示顺序 = 参考档发送顺序（首帧 · 尾帧 · 参考图）；「＋」只有工具行的 `StudioVideoAssetChip`，拖放落点是整个输入框 —— 拖入 / 素材库 / 助手三条落法汇到同一份状态（`use-studio-video-assets.ts` 的 `acceptTransfer` / `acceptGeneration`），这一份 assets 由 `StudioPromptArea` 持有、传给素材排与 chip（上传中两边看得见）。视频档**不渲染** `ReferenceImageChip` 与提示词框里的参考图条（图在素材排上），舞台也不画参考轨、不铺参考图（还没出过结果、挂了首帧时首帧当封面）；负面提示词行只在实际端点收这个字段时出现。首帧在场、没挂参考项且线路带图锁比例时，`StudioSpecChip` 把比例组**禁用而不是移除**并说清怎么解除。

**手机形态**：Dock 在 `isMobile` 时图片 / 视频 / LoRA 档渲染 `StudioOperatorAvatarToggle`（右上角）+ `StudioOperatorMobileSheet`（单一高度、接近满屏，见上方组件树），装的是与桌面**同一个 `StudioOperatorPanel` 元素**（同一份 props，⛔ 别为手机再写一套面板内容）。判据是**宿主的域**不是路由：LoRA 手机端与桌面共用此 Dock，旧 `LoraAssistantDock` 已删除；音频档没有 operator 宿主，不新增助手入口。

**四张脸**：宿主契约多一格 `face`（`{domainIcon, contextLine(), emptyLine, starterPills[], inputPlaceholder}`，见 `src/contexts/studio-operator-host.tsx`），四份宿主各自实现，Dock / Header / EmptyState 只读它。⛔ 组件里不许按 `domain` 分叉挑文案 / 图标 / 药丸（`StudioOperatorDock.web.test.tsx` 有源码扫描守着）。静态那几样按域查表走 `src/hooks/use-studio-operator-face.ts`，只有 `contextLine` 是宿主自己算的。⛔ `STUDIO_OPERATOR_SUGGESTIONS` · `STUDIO_OPERATOR_EMPTY_SUGGESTION_COUNT` 与三语 `StudioOperator.suggestion.*` 已整块删。

**收起态**：**右上角 36px 人设头像 + 数字角标，头像即唯一开关**（点开，再点或 Esc 收回；展开时悬停写「收起 · Esc」）。⛔ D7 ④ 的「右下 44px 近黑圆按钮」与画布顶栏那颗「助手」胶囊（`shell-assistant-toggle`）一起退场；⛔ 仍旧没有微状态卡、`N/M` 读数与那句状态词；**运行指示**（2026-10-14 §9.1）：在跑 = 运行环 + 右下呼吸点，收着时跑完 / 出错留一颗完成 / 风险色点，打开即清（外壳 `StudioOperatorDock` 渲染期派生，`activity` 传给头像）。机制与十条动画铁律见 `docs/references/pages/assistant-shell-v2.md §4.3`。

施工基准 `docs/references/pages/assistant-shell-v2.md`（A 方向节 · §3.2 五类卡片 · §4.3 收起态 · §12 皮肤）；`assistant-shell.md` 只作钱闸 / 检索链参考。动这一系之前先读 v2，别照现状扩。

按需挂载、不在主树固定位置的常用单元：StudioWorkflowPicker
（studio-shared/workflow/）、StudioSpecChip /
StudioGallery（studio/）、StudioLightbox / StudioErrorBoundary（studio-shared/chrome/）。

**画布不在这个目录**：`/studio/node` 的全部实现在 `src/components/business/node/`（v4 工作台 `node/workbench-v4/` + 节点卡 `node/nodes/v4/`），分层与禁改见 `src/components/business/node/CLAUDE.md`，基准见 `docs/references/pages/node-canvas-v2.md`。两边**不共用**面板与动作总线——画布走 `useNodeCanvasActions()` 与 v4 op 表，⛔ 别把 studio 的 context 或 operator 组件搬进画布。

## Data Flow

```
User Input (prompt, aspect ratio, cards)
    ↓
StudioFormContext (HOT — useStudioForm)
    ↓
StudioDataContext (cards, projects via useStudioData)
    ↓
useUnifiedGenerate() → POST /api/studio/generate
    ↓
StudioGenContext (result via useStudioGen)
    ↓
GenerationPreview renders result
```

## Rules

1. **Before modifying any component**: check which context hooks it uses (`useStudioForm`, `useStudioData`, `useStudioGen`)
2. **Panels**: controlled by `StudioFormState.panels` — toggling is handled by reducer dispatch, not local state
3. **Panel hosts**: `StudioDockPanelArea` (studio/) renders the centred dialogs (civitai, voiceSelector, voiceTrainer, audioTranscribe, videoAudio, script)，由 **`StudioWorkspaceUI` 直接挂载**。⚠ 它还持有全仓唯一一处 `imageUpload.setMaxImages(...)` —— 不挂载它，参考图上限就是 Infinity。比例 / 规格走 `StudioSpecChip`（自持开合，不占 `panels`）。
4. **Entry point**: `index.ts` re-exports the main component

## Relatively Isolated Components (safer to modify)

- `CompareGrid.tsx` (image/) — **共享图墙**：多模型、单模型多张、以及两者相乘的矩阵都渲染它（`VariantGrid` 已于 2026-08-14 退役）。格子自带模型名，同模型多张时带 `1/2` 序号
- `StudioCommandPalette.tsx` (studio-shared/chrome/) — Cmd+K overlay, reads context but doesn't write
- `StudioLightbox.tsx` (studio-shared/chrome/) — Fullscreen viewer, display-only
- `StudioErrorBoundary.tsx` (studio-shared/chrome/) — Error recovery wrapper

## High-Risk Components (modify with caution)

- `StudioPromptArea.tsx` (studio/) — Core input, dispatches to FormContext
- `StudioCanvas.tsx` (studio-shared/chrome/) — result surface, complex layout logic
- `StudioCardSection.tsx` (studio/) — orchestrates char/bg/style card selection
- `StudioWorkbenchLayout.tsx` (studio-shared/chrome/) — 三模态共用的横向外壳
