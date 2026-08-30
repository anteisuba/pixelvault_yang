# 生成能力实跑 · 缺陷台账（2026-08-29 起）

> 起因：owner 定的「素材工程」阶段——首页素材一律用**本项目自己的生成链路**产出，
> 顺带当一次真实检验。**跑不通、跑得别扭、跑出来不对，都是有效产出**，逐条记在这里。
> 记录人：本会话（Claude）。每条含：现象 / 复现 / 证据 / 影响 / 建议。
> ⚠ 本文件是**台账**不是任务包：修不修、什么时候修由 owner 定。

---

## A · 视频工作台没有语音通道（owner 2026-08-29 现场发现）

**现象**　`/zh/studio/video` 选「全能参考」+ Seedance 2.5 参考（BytePlus）后，左栏只有
「模板 / 图像 / 剧本」三个按钮，规格面板只有「时长 / 分辨率 / 宽高比」——**全程找不到任何
挂音频参考的地方**，也没有「生成音频」开关。

**复现**　登录 → `/zh/studio/video` → 图片用途选「全能参考」→ 模型选 Seedance 2.5 参考
（BytePlus）→ 逐个点开「图像」「剧本」「规格」。

**证据**

- 真机：规格面板穷举只有三项（实拍 `ss_63495ir9b`）；`read_page` 全量 interactive 树里
  只有 `模板 / 图像 / 剧本` 三个 toolbar 按钮，无任何 audio 相关控件。
- 后端**是支持的**：`workers/execution/src/index.ts:161-171` 视频上下文里有
  `audioUrls?: string[]`、`audioBindings?: Array<{url, characterName?}>`、
  `generateAudio?: boolean`，且 `:165` 注释写明 worker 会据此生成 `{Name} (@AudioN)`
  提示词 token。
- 画布那条路**是通的**：`src/hooks/node/use-video-composer.ts:248` 用
  `harvestUpstreamAudioBindings` 走两跳采集（`voice → character → video`）。

**影响**　工作台这条路**永远不可能做出带指定音色的对白视频**——这正是 owner 拍板的
《借伞》生产方式（「视频生成的时候只需要指定角色图片和对应的语音素材」）。生产因此
整体搬去画布。

**断点精确位置**（2026-08-29 调查）　**UI 与 hook 出口两层断，第三层往下全通**：

| 层           | 位置                                                           | 状态                    |
| ------------ | -------------------------------------------------------------- | ----------------------- |
| ① UI 控件    | `StudioPromptArea.tsx:1478-1497`（视频分支只有「剧本」一颗丸） | ❌ 无入口               |
| ② 请求构造   | `StudioPromptArea.tsx:718-734`（`buildVideoInput` 返回对象）   | ❌ 不填三字段           |
| ③ 编排 hook  | `use-unified-generate.ts:711-783`                              | ⚪ 纯透传               |
| ④ api-client | `lib/api-client/generation.ts:92-100`                          | ✅                      |
| ⑤ 路由       | `app/api/generate-video/route.ts:8-15`                         | ✅                      |
| ⑥ Zod schema | `types/index.ts:548, 557-565, 574`                             | ✅ 三字段都在           |
| ⑦ service    | `generate-video.service.ts:123, 285-298`                       | ✅ 已写进 providerInput |
| ⑧ worker     | `workers/execution/src/index.ts:167, 171, 2283, 2286`          | ✅                      |

连**校验**都已就位：`video-generation-validation.service.ts:74`（音频数上限）、`:82-88`（超槽 400）、
`:101-111`（`audioRequiresVisual`）。也就是说这不是「没做」，是**做到一半停在了最上面两层**。

**最刺眼的一处**　工作台**有**「全能参考」档（`constants/video-node-modes.ts:20-24, 46-50`），
而 Seedance 2.5 是全仓唯一允许纯音频参考、音频槽多达 10 个的模型
（`constants/video-model-send-plan.ts:118-124`）——用户**选得到**那一档，却**挂不上**音频。
分段控件叫「图片用途」而不是「参考用途」，正是这个缺口在文案上的残留。

**顺带**　`generateAudio`（原生出声）工作台也没有开关，最终值吃模型目录默认
（`constants/models/video.ts:27, 44, 64`），用户不可控。画布有两处 Switch
（`VideoComposer.tsx:1706-1723 / 2087-2107`）。

**最小改动面**　**4 个文件、3 个新字段，服务端与 worker 一行不用改**：

1. `src/contexts/studio-context.tsx` — `StudioFormState` 加 `videoAudioRefs`（+ action / reducer / 初值 / 切模态重置）
2. `src/components/business/studio/StudioPromptArea.tsx` — 加「音频」丸 **+ `buildVideoInput` 补
   `audioUrls` / `audioBindings`**（← 真正的断点，只加 UI 不改这里等于白做）
3. 新建音频参考面板（或复用 `StudioDockPanelArea` 的面板宿主）
4. `src/messages/{zh,en,ja}.json` 三份同步

现成可复用件：上传走 `lib/api-client/voices.ts:169-177`（`uploadReferenceAudioAPI`，返回公网 URL
——正好满足 service **不重传 R2、原样透传**的前提，见 `generate-video.service.ts:220-236`）；
UI 形态照 `StudioAudioParams.tsx:456-500` 的 `ReferenceAudioField`；素材库选取用
`AssetSelectorDialog` 传 `mediaType='AUDIO'`；槽位上限读 `getVideoModelSendContract(...).slots.audio`。

两个要 owner 先拍的点：① 工作台没有「角色节点」可推导 `audioBindings.characterName`，
留空（退化成无标签 `@AudioN`，schema 允许）还是让用户手填；② `audioRequiresVisual` today
只有服务端 400 兜底，要不要照画布加前端 blocker。

---

## B · 参考图面板：「素材库」这一格被切成两跳，且与另外三格模型不一致（owner 报）

**现象**　画布角色卡 →「添加素材」→ 参考图面板有四格 Tab（上传 / 素材库 / 粘贴 / 从画布）。
点「素材库」Tab 之后，面板里**只出现一个同名按钮「从素材库选择」**，还要再点一次才开对话框。
Tab 本身已经表达了「我要从素材库选」，等于同一个入口写了两遍。

**复现**　画布 → 角色卡 → 添加素材 → 点「素材库」。

**证据**

- `src/components/business/node/ReferenceLandingTabs.tsx:243-248` Tab 触发器
  `assetTab`；`:286-296` 该格内容只有一个 `Button` → `t('selectAsset')` → 开
  `AssetSelectorDialog`。
- 另外三格都是**直接可用的落区**，没有中间按钮：上传 `:262-285`（点击落区）、
  粘贴 `:297-314`（粘贴落区）、从画布 `:319-348`（缩略图网格，选中即落）。
  只有素材库这格是「按钮 → 弹窗」。

**影响**　四格里三格一跳、一格两跳；且用户已经明确点了「素材库」，再让他点一次
「从素材库选择」是纯多余的一次点击。

**建议**　两种收法二选一：① 点「素材库」Tab 直接开对话框（Tab 即动作）；
② 这格改成**内嵌缩略图网格**，与「从画布」那格同构（那格已证明缩略图比名字好认）。
推荐 ②——四格模型就统一成「都能直接选」，且省掉一层 Dialog。

---

## C · 参考图的「作用」下拉是裸 `<select>`，与全站设计系统脱节

**现象**　参考图条目上那个「身份」下拉，用的是浏览器原生下拉（系统箭头、系统字体、
系统弹出层），周围所有控件都是 shadcn 原语。

**证据**

- gallery 档：`src/components/business/node/CharacterImageReferenceControls.tsx:398-412`
- popover 档：同文件 `:559-573`
  两处都是裸 `<select>` + `<option>`，只挂了 className，没走 `@/components/ui/select`。

**附带**　gallery 档那个 select 藏在 `group-hover` 覆盖层里（`:318`），**必须 hover 才出现**——
触屏上等于不存在。

**影响**　视觉不一致（owner 一眼看出来）；触屏不可达。

**建议**　换成 `ui/select`；gallery 档的 role/weight 控件从 hover-only 改成常显或点击展开。

---

## D · 权重滑块是裸 `<input type="range">`，填充方向看着是反的，且无数值

**现象**　参考图条目下面那条滑块，视觉上「右边深、左边浅」，像是右侧才是已填充部分；
拖完也不显示拖到了多少。

**证据**

- gallery 档：`CharacterImageReferenceControls.tsx:427-440`（`accent-node-paint`）
- popover 档：同文件 `:588-601`（`accent-node-edge-active`）
  两处都只给了 `accent-*`。**accent 色本身是浅色**，而 Chrome 的未填充轨道是深灰——于是
  「填充=浅、未填充=深」，与所有人对滑块的直觉相反。且没有任何数值/刻度显示。

**影响**　用户读不出当前权重，也读不出方向；权重是影响出图的实参，读错就调错。

**建议**　换成 `ui/slider`（项目已有），并在旁边显示数值。

---

## E · 「绑定音色」对话框只显示时长，认不出是哪条

**现象**　角色卡 → 绑定音色 → 列表里 5 条素材全是同一个灰底播放键，**只有右下角一个时长
角标**（5s / 4s / 8s / 2s / 3s）。没有名字、没有台词文本、没有音色名。只能靠「我记得
ひなた 那条是 3 秒」来认。

**证据**　真机实拍 `ss_9170e8fl4`。绑定后详情面板的「听觉身份」栏**反而**显示了台词全文
（「あっ……傘、忘れちゃった。」，实拍 `ss_29376ihmg`）——说明**文本是有的，只是选的时候不给看**。

**影响**　音色一多就选不动；选错了要绑完才发现。

**建议**　列表项显示台词首句（或音色名）+ 时长；播放键保留。

---

## F · Fish 音色库：语言筛选/搜索不实时刷新

**现象**　音频工作台的音色库弹窗里改语言筛选或输入搜索词，列表不变，且**零网络请求**；
关掉弹窗重开才生效。

**复现**　`/zh/studio/audio` → 选音色 → 弹窗内切语言到「日语」。

**影响**　会让人以为「没有日语音色」而放弃——我第一次就是这样，最后是去 fish.audio
官网找到音色 ID 再贴回来的。

## G · Fish「推荐」池里前 ~100 条没有日语音色

**现象**　弹窗默认「推荐」档，翻到底也没有日语音色；日语音色要靠贴 ID 或自己搜。

**影响**　同上——默认档给不出可用结果。

---

## H · Seedream 安全过滤边界不稳：同一组描述，女生过、男生拒

**现象**　生成 湊 的角色设定图时，prompt 里「男子高中生，17岁」被 provider 安全过滤拒绝；
而同一批里 ひなた 的「16岁」女生描述**正常通过**。删掉年龄词后即通过。

**影响**　边界不可预期，用户会以为是自己写错了。错误提示也没说清是哪个词触发的。

**建议**　失败响应里带上 provider 原始拒绝理由（若上游给了），否则用户只能瞎猜。

---

## I · 素材库网格里有空白格（视频素材零缩略图）

**现象**　参考图选择对话框的 21 格里有 2 格是纯空白（无图无占位文案）。对照素材页已知
「视频零缩略图」问题，空白格应为视频素材。

**影响**　空白格既不可读也不可判断，看起来像坏了。

**建议**　视频素材至少给首帧/占位图 + 类型角标；这条与素材页 C+F 那批的「切片0 硬前置」
是同一个根因。

---

## J · dev 页面偶发 `Router action dispatched before initialization`（**非本项目 bug**）

**现象**　dev 环境打开页面时，右下角出现红色「1 Issue」，展开是
`Internal Next.js error: Router action dispatched before initialization.`，标 `Next.js 16.2.11 (stale)`。

**根因（已定位，非猜测）**　控制台完整堆栈为
`WebSocket.handleMessage → processMessage → Object.hmrRefresh → dispatchAppRouterAction`。
即：dev server 编译完通过 WebSocket 推 HMR 消息，客户端调 `hmrRefresh()` 去 dispatch 一个
router action，而此时**页面刚打开、App Router 还没初始化完**，于是抛这个内部错误。
是 **Next.js 自己的 dev-only 竞态**——生产构建里根本没有 HMR 客户端，这条不可能出现。

**触发条件**　「刚打开一个页面」与「dev server 恰好推了一次热更新」撞在一起。
本会话是并行开画布页 + 另一条会话在改 `src/` 时撞上的。

**处置**　刷新页面即可；不用改代码，也**不要**因此回滚任何已验证的改动。
与记忆里那条「Turbopack 卡在编译错误上」是**不同**的东西：那条是 dev 全站 500，这条只是
overlay 里一条红字，页面功能正常。

---

## K · 画布助手「规划分镜」：能规划、能铺节点，但**落地三处断裂**（2026-08-29 实跑）

**怎么跑的**　`/zh/studio/node` → 助手（模型 OpenAI GPT-5.6 Sol）→ 不点快捷键，直接喂
《借伞》完整故事 + 四条硬约束，让它自己决定分几段。

**先说做对的**　方案本身**合理且算术正确**：给出 4 镜头 / 30 秒，切成
**6s + 8s + 10s + 6s = 30s**（中间那镜最长——共伞同行是情绪主段，配得上 10 秒）。
并且真的往画布铺了 8 个节点（4 文本 + 4 视频）成对排列，面板底部显示
**「已落 20 个到画布 — 还没花积分」**并给撤销 —— 「结构直接落 · 生成要确认」的分寸
拿捏得很好：不花钱的结构直接落，花钱的生成才要确认。

**然后是三处断裂**（全部经 localStorage 实读 `pixelvault.nodeStudio.v3.<clerkId>` 验证）：

### K-1 ⭐ 镜头文本写错字段，内容 100% 丢失且用户看不出来

四个 `shotText` 节点的 **`prompt` 字段各有 401 / 288 / 302 / 270 字符内容**，而
**`scene` / `action` / `camera` / `composition` 四个字段全是空字符串**。

详情面板 UI 渲染的正是后面这四栏（实拍：四栏全是占位符），面板底部还写着
「这些字段会按顺序拼成提示词，送进下游的视频节点」——**所以下游也只会拿到空**。

也就是说：助手辛苦写的四段镜头文本**全部作废**，而节点只显示「还没有镜头文本」，
**不会告诉用户内容写错地方了**。这是最危险的一种失败——静默且看起来像「助手没写」。

> 判据（复现用）：读 localStorage 里该节点的 `data`，比较 `prompt` 与
> `scene/action/camera/composition` 的长度。前者非空、后者全空 = 命中。

**根因方向**　助手侧的写入契约与 `shotText` 节点自身的读取契约不一致：一边写
`prompt`，一边读四分栏。两边只要有一处改过就会漂 —— 建议在节点类型上把这组字段
钉成同一个 schema，别让助手自己拼字段名。

### K-2 声明了 4 条连线，实际一条没建（而计数把它们算进去了）

助手操作清单里明确列了 4 次「把『Shot N 文本』连到『Shot N 视频』」，
实测 **`edgeCount = 1`**，且那唯一一条是我自己绑音色产生的 `voice → image`。
**四条声明的连线全部没生效。**

而「已落 20 个」正好 = 4 × (建文本 + 建视频 + 换模型 + 设规格 + **连线**) = 4×5。
即**连线被计入了成功数**——**计数在说谎**，用户看到「已落 20 个」会以为全成了。

**建议**　落数只统计实际生效的操作；失败的单独列出来（「4 条连线未建立」），
否则这个计数就是个反向指标：越大越让人放心，而它恰恰盖住了失败。

### K-3 线路默认挑了 fal，不是 BytePlus —— 贵 2.2 倍

四个视频节点全是 `modelId: "seedance-2.5"` + **`adapterType: "fal"`** +
`providerConfig.label: "fal.ai"`。而 owner 拍板走的是**国际版火山 BytePlus**
（工作台手选那个叫「Seedance 2.5 参考（BytePlus）」）。

同一个模型 fal 线约 2.2× 成本：30 秒 BytePlus ≈ $6.93，fal ≈ $15+。
助手在没有任何提示的情况下替用户选了贵一倍的线路，且**节点上不显示线路名**，
不去读 localStorage 根本发现不了。

**建议**　助手挑线路时要么跟随用户最近一次的选择，要么在操作清单里把线路名写出来
（「换成 seedance-2.5」应该写成「换成 seedance-2.5（fal.ai）」）。

### K-4 内容质量：没读画布上已有的角色卡，外观自己编

画布上已经有一张 ひなた 角色卡（挂了设定图、绑了音色），助手**没有引用它**，
而是在 prompt 里自己重新描述外观，且**描述是错的**：写成
`a teenage girl with brown wavy hair`（棕色波浪发），而设定图与已生成的 S1 里
ひなた 是**深色直短发**。若照这段 prompt 生成，角色一致性当场就断。

另外：四段 prompt **全英文、且完全没有台词**，而我明确要求「台词是日语」；
视频节点也**没有挂任何参考图**——放着卡上的设定图不用。

**建议**　助手在规划时应优先消费画布上已存在的角色卡/背景卡（连过去，而不是用文字
重新描述）——这正是「名词做节点」这套模型的意义所在。

---

## L · 图片工作台「查看作品」跳 404，并且把用户踢出工作台、丢失全部编辑状态

**现象**　图片生成完成后右上角弹「图片已生成！」+「查看作品」按钮。点它跳到
`/zh/gallery/<generationId>`，页面**返回 Not Found**（实测 id
`c0206c46-d7e4-4a0b-9a09-1b2995f13d1a`）。

**更糟的是**：这是一次真实导航，工作台的**全部编辑状态当场丢失**——挂好的 5 张参考图、
写好的几百字提示词、模型与规格全没了，返回也回不来。用户等于被一个「看一眼结果」的
按钮清空了工作区。

**影响**　生成完想看大图是最自然的动作，而这个动作会惩罚用户。参考图挂得越多、
提示词写得越长，损失越大（我这次丢了 5 张参考 + 约 500 字提示词）。

**建议**　两件事分开修：① 那个 gallery 详情路由要么修好要么别链过去；
② 无论如何**不该整页跳走**——结果预览应该开在工作台内的浮层里，工作区不能被清空。

## M · GPT Image 2 在工作台没有价格

**现象**　选中 OpenAI GPT Image 2 后，左下「预计费用」显示 **「1 个模型未标价」**，
不给任何金额。对照 Seedream 5.0 Pro（BytePlus）正常显示 $0.09/张。

**影响**　按张计费的模型不给预估价，用户点「生成」时不知道要花多少。

---

# 画布出图链路（2026-08-29 用画布做完 KF3–KF5 后）

> owner：「图片生成这边也可以在画布中做。这样也能检查画布里面设计不足的地方」。
> 结论：**画布的出图能力是好的**——镜头图节点自带 composer、参考图可挂多张、规格跨节点记忆、
> 生成结果直接落成节点并连边。下面是实跑中撞到的具体问题。

## N ⭐ composer 面板会被视口边缘裁掉，够不到自己的控件

**现象**　选中镜头图节点后，composer 固定开在节点**右侧**。当节点靠近视口右缘时，
面板的模型/规格/发送那一行**整条在屏幕外**；提示词写长之后面板向下长，靠近下缘时
**发送键又掉到屏幕外**。面板既不会翻到节点左边，也不会把自己滚进视野。

**后果**　唯一的出路是**把节点拖到屏幕中间再操作**——我这一轮为了够到发送键，
拖了三次节点、缩放了四次画布。

**建议**　面板做视口避让（右侧放不下就翻到左侧 / 下方放不下就上翻），
这是浮层的基本行为。

## O ⭐ 「重新生成」不带规格 —— 16:9 · 2K 变成 1024 × 1024

**现象**　节点工具条上的「重新生成」跑完后，出来的是 **1024 × 1024 方图**，
而 composer 上明明白白还写着 **16:9 · 2K**，我一个字没改。

**证据**　节点标题栏尺寸从 `2736 × 1536` 变成 `1024 × 1024`（真机实拍两张对比）。

**影响**　对关键帧这种必须锁定画幅的用途，等于**静默毁掉一次生成**；而且用户看着
composer 上的「16:9 · 2K」不会怀疑。

## P 「重新生成」与 composer 发送是两种行为，但外观上看不出来

- **「重新生成」**（节点工具条）＝**原地覆盖**当前节点的图，且丢规格（见 O）。
- **composer 的发送箭头**＝**新建一个下游节点**并连边，规格正确。

两者都长得像「再跑一次」，结果一个毁掉旧图、一个保留旧图另开一个。
**建议**：把「重新生成」改成「重跑（覆盖）」并沿用节点规格；或者干脆统一成新建下游节点。

## Q 「重新生成」紧挨着「放大」，误点直接覆盖，没有确认也没有撤销提示

工具条是 `快捷编辑 | 重新生成 | ⤢ | ↓ | ⋯ | 🗑`，**重新生成与放大相邻**。
我想点放大看大图，点到了重新生成，KF4 当场被覆盖重跑（还因为 O 变成了方图）。
花钱且不可逆的操作不该紧贴一个纯查看操作，也不该零确认。

## R 「替换」按钮常驻压在生成图正中央

生成完成后图上永远浮着一颗「替换」胶囊，**位置在画面正中**——而画面正中通常就是主体。
我要看角色肩膀上的湿痕，只能开详情面板绕过它。这颗按钮不是 hover 才出现的，是常驻。
**建议**：移到角落，或改成 hover 才显形。

## S 新建节点落在视口中心，直接压在已有节点上

`+ → 镜头图` 建出来的节点固定落在视口中心，**不做碰撞避让**，两次都正好盖住我刚生成的图。
每次都要手动拖开。

## T 素材库缩略图加载极慢

画布的「添加参考图」对话框，31 项的缩略图**等了 17 秒只出 2 张、27 秒出 4 张**。
选参考图是高频动作，这个等待很难忍。（工作台那个素材库也慢，但没这么夸张。）

## U ⭐⭐ 切换「图片用途」会把模型重置，槽位上限跟着退回 2.0 的数字

**现象**　视频编排面板里，模型选好 **Seedance 2.5 · BytePlus** 之后，再去把「图片用途」
从「关键帧」切成「全能参考」——**模型自己变回了 Seedance 2.0 Fast**，我一个字没碰模型。

**连带后果**　槽位上限跟着从 2.5 的 **总额 x/50** 退回 2.0 的 **总额 x/15**。也就是说，
用户以为自己在用 2.5 的 30 张图 / 10 条音频，实际被 2.0 的 9/3/3 卡着。

**为什么危险**　这两个控件在同一行紧挨着，「先选模型再选用途」是最自然的操作顺序，
而重置**没有任何提示**——模型名字变了，但用户的注意力在刚点的那个用途上。
我是因为顺手看了一眼槽位数字从 1/50 变成 1/15 才发现的。

**建议**　切换用途时保留已选模型（用途不兼容才提示并让用户确认）。

## V ⭐⭐ 服务端持久化被一条 160 字上限挡住，而 UI 把它报成「网络连不上」

**现象**　画布右上角持续弹「**连不上云端，最近的画布改动没有保存。请保持此标签页打开
并检查网络连接。**」，且 Issues 计数一路涨到 17。

**真因（控制台原文）**

```
[node-workflow] server persist failed {"operation":"update-project-state",
"error":"Too big: expected string to have <=160 characters, ×3"}
```

不是网络，是**服务端 Zod 校验拒收**：某个节点字符串字段有 **160 字上限**，而画布上三个
镜头图节点的标题是**从提示词自动截取**的（我的提示词四五百字），直接超限。

**后果**　① 整个项目的服务端状态**从那一刻起就没再保存过**——我这一轮所有配置（7 个参考
素材、模型、规格）只活在浏览器内存里，刷新即失；② 用户被指去修网络，而这个 bug 跟网络
毫无关系，修不好。

**建议**　两件事分开：① 那个 160 字段要么放宽、要么在写入前截断（节点标题本就该短）；
② 持久化失败的提示必须区分「网络不可达」和「服务端拒绝了payload」，后者要把校验错误
说出来——现在这个文案会让人朝完全错误的方向排查。

## W 关闭「编辑视频参数」浮层会把分辨率打回 480p

设好 **720p / 30 秒 / 16:9** 后，再点一次「编辑视频参数」把浮层收起来，
分辨率**自己变回 480p**（时长和宽高比不受影响）。改成点浮层外面收起就不会。
一次 30 秒的生成，480p 和 720p 的差别不小，而这个回退是静默的。

## X 音色挂进视频节点后一律标成「旁白」，不按角色映射

**现象**　给视频节点挂两条音色（`+ → 音频`）后，详情面板的「视频 / 音频引用」区
把它们列成 **「音1 · 旁白」「音2 · 旁白」**——两条都叫旁白，看不出哪条属于哪个角色。

**对照**　角色卡那条路是有角色映射的（卡上「听觉身份」显示台词、`audioBindings`
带 `characterName`，worker 会据此生成 `{Name} (@AudioN)` token）。直接挂音频这条路
**没有地方指定这条音色属于谁**，角色归属只能靠提示词里用文字写（「音频1 是女孩的音色」）。

**影响**　多角色对白片里，用户没法在 UI 上把音色钉到角色上；而这正是 Seedance 2.5
官方推荐的写法（「Images 1-2 are Character 1 and correspond to Audio 1」）。

**建议**　音频条目上加一个「属于谁」的下拉（可选角色卡 / 手填名字），填了就走
`audioBindings.characterName`；不填才退化成现在的无标签形态。

---

## Y ⭐ 作品记录的分辨率是「请求值」不是「实到值」，provider 换了尺寸就记错

**现象**　同一条提示词分发给四个模型，库里记的 width/height 与实际文件对照：

| 模型                       | 库里记的 | 文件实际      |     |
| -------------------------- | -------- | ------------- | --- |
| flux-2-pro                 | 768×1024 | 768×1024      | ✓   |
| gpt-image-2                | 880×1184 | 880×1184      | ✓   |
| gemini-3-pro-image-preview | 768×1024 | **896×1200**  | ✗   |
| seedream-5.0-pro           | 768×1024 | **1536×2048** | ✗   |

Seedream 实际出的是 2K，库里记成 768×1024——**差 4 倍像素**。

**机制**　落库的宽高来自请求参数而非产物本身。worker 里这一条写得最直白
（`workers/execution/src/index.ts:2454`）：

```ts
width: context.providerInput.width,
```

而同一行往下 `:3293` 对非视频直接给 `undefined`，图片的值是在组装请求时就定死的。
provider 按自己的档位返回别的尺寸时，没有任何一步回头看产物。

**影响**　作品详情页向用户展示错误的分辨率；任何依赖这两列的逻辑（网格布局、
「原图 2K」之类的标示、导出前的预估）都会跟着错。四个模型里两个中招，
说明「provider 返回尺寸 = 请求尺寸」这个隐含假设本来就不成立。

**建议**　落库前用 sharp 读一次产物的真实尺寸。**仓库里已有现成写法**——
`src/services/image/image-edit.service.ts:82` 就是 `metadata.width ?? 1024`，
编辑路径一直在实测，只有生成路径在猜。

**发现于**　核对首页四张同题图的模型归属时。归属本身是对的（见下），
是顺着尺寸线索查下去才发现库里的数字对不上文件。

---

## Z ⭐ Gemini Omni Flash 挂着 `available: true`，但它一次都跑不起来

**现象**　视频模型目录里 `GEMINI_OMNI_FLASH` 是 `available: true`，用户在工作台和画布
都选得到它。实际提交视频生成**每一次都 501**——请求根本到不了 provider。

**根因（读代码确认，非猜测）**　`src/services/generate-video.service.ts:64-71` 的
派发白名单里没有 `GEMINI`：

```ts
const WORKER_CAPABLE_VIDEO_ADAPTERS: ReadonlySet<string> = new Set([
  AI_ADAPTER_TYPES.FAL,
  AI_ADAPTER_TYPES.MINIMAX,
  AI_ADAPTER_TYPES.MINIMAX_CN,
  AI_ADAPTER_TYPES.VOLCENGINE,
  AI_ADAPTER_TYPES.BYTEPLUS,
])
```

而 `constants/models/video.ts:160` 的 `GEMINI_OMNI_FLASH` 是 `adapterType: GEMINI`，
`canSubmitVideoViaExecutionWorker()` 因此恒 false，走到 501 分支。

**这不是新发现，是被写在注释里晾着的**　`video.ts:141-149` 自己就写着「available:true
but NOT actually reachable … Flip available:false or finish the worker migration before
touching this entry」。Next.js 侧的旧实现已于 2026-08-24 死执行链清理时整体删除，
也从未迁到 `workers/execution`。**注释认了，目录没改。**

**影响**　三层：① 用户选得到一个必然失败的模型，且失败信息是 501 这种说不出所以然的码；
② 首页模型站给它单开了一页（`HOME_V4_STATIONS.video` 的 `gomni`），等于对外展示一个
跑不了的能力；③ 本轮「素材工程」要求每页背景图由该模型自产，**唯独这一页做不到**——
最后按 owner 拍板改用 GPT Image 2 代画，徽标如实写「站内生成 · GPT Image 2」。

**建议**　二选一，别再挂着：要么 `available: false`（一行，且 enum 不动，符合
「退役≠删除」的既定做法），要么把 `GEMINI` 加进白名单并在 worker 的
`submitProviderQueue` / `pollProviderQueue` 补上对应分支——**只加白名单不补分支会更糟**：
按 `:59-62` 的注释，那样会从「快速失败的 501」变成「在 workflow 里 500」。

**顺带一条不改文案的记录**　首页声音页第三条气泡写的是「旁白 · 克隆音色」，而这一轮
实际配的是 Fish **音色库**里的旁白音，不是克隆产物。owner 2026-08-29 明确定为不改，
此处只留记录，避免下一个人把它当成已验证的事实引用。

---

## AA ⭐ 语音落库的时长按 128kbps 猜，请求 64kbps 就整整差一倍（Y 的音频版）

**现象**　用 `/api/generate-audio` 连出 9 条语音（`mp3Bitrate: 64`），库里记的 `duration`
与 ffprobe 实测逐条对照：

| 文件（首页九条）  | 库里 duration | ffprobe 实测 | 比值  |
| ----------------- | ------------- | ------------ | ----- |
| voice-qing-zh.mp3 | 1             | 2.30s        | 0.43× |
| voice-lei-zh.mp3  | 1             | 2.01s        | 0.50× |
| voice-ke-zh.mp3   | 2             | 3.08s        | 0.65× |
| voice-qing-ja.mp3 | 1             | 2.12s        | 0.47× |
| voice-lei-ja.mp3  | 1             | 2.72s        | 0.37× |
| voice-ke-ja.mp3   | 2             | 3.08s        | 0.65× |
| voice-qing-en.mp3 | 1             | 2.19s        | 0.46× |
| voice-lei-en.mp3  | 1             | 2.98s        | 0.34× |
| voice-ke-en.mp3   | 2             | 3.79s        | 0.53× |

**九条全错，且全部偏小**——一条 3.79 秒的旁白在素材库里写着 2 秒。

**复现**　`POST /api/generate-audio`，body 里带 `format:'mp3', mp3Bitrate:64`；
生成完读 `/api/images?type=audio&mine=1` 的 `duration`，再 `ffprobe` 同一个文件。

**机制**　`src/services/providers/fish-audio.adapter.ts`（非时间戳分支）：

```ts
// MP3 ~128kbps = 16000 bytes/sec, WAV ~176400 bytes/sec (44100 * 2 * 2)
const bytesPerSec = outputFormat === 'wav' ? 176400 : 16000
const estimatedDuration = Math.round(audioBuffer.byteLength / bytesPerSec)
```

16000 B/s 就是 128kbps 写死的。可 `mp3Bitrate` 在 schema 里明明是三档
（`AUDIO_MP3_BITRATES = [64, 128, 192]`），请求 64 就恰好差 2×、请求 192 就差 1/1.5×——
**同一个请求参数被送进了 provider，却没被送进算时长的这一行**。opus 走同一条兜底（连
`opusBitrate` 都没看），wav 那条则把 44.1kHz/立体声/16bit 写死，而 `sampleRate` 同样是
8000–48000 可调、Fish 返回的还是单声道。

⚠ 这不是「估算难免有误差」：**同一个 adapter 的时间戳分支已经拿得到真时长**
（`parseTimestampStream` 里 `alignment.audio_duration`），只有默认分支在猜。

**影响**　与 Y 同构（记的是「请求值 / 假设值」不是「实到值」）：素材库、语音条、
视频工作台挂音色时的时长显示全部偏短；任何按时长排期或对轨的逻辑都会错位。
音频比图片更糟一点——图片记错尺寸还能看图，时长记错只能靠听。

**建议**　别再按码率反推。要么在落库前用一个 mp3 帧头解析拿真时长（帧头里就写着码率和
采样率，也正是我判定这九条是 64kbps/44.1kHz/单声道的依据），要么把 speech 默认切到
`withTimestamps` 那条已有真时长的路径。⛔ 不要「把 16000 改成按 mp3Bitrate 算」——
那只是把一个假设换成另一个假设，VBR、ID3 头、静音裁剪照样偏。

---

## AB 语音生成闸是 5 次/分钟，撞上之后只说「稍等片刻」，不说等多久

**现象**　串行连发 9 条语音（每条 8–32 秒，都等前一条落库才发下一条），第 9 条被拒：
`429 · RATE_LIMIT_EXCEEDED · "Too many requests. Please wait a moment."`

**复现**　`RATE_LIMIT_CONFIGS.generateAudio = { limit: 5, windowSeconds: 60 }`
（`src/constants/config.ts:806`）。配音间里逐句生成，第 6 句就会撞上。

**影响**　两件事叠在一起：

1. **档位对配音场景偏紧**——图片是 10/60s、视频 5/60s（视频一条要几分钟，自然撞不上），
   语音一条只要 8–30 秒，5/60s 是这几个档里唯一「正常手速就能撞」的。一场戏十句台词
   必然中断两次。
2. **文案不给数字**——既没说上限是多少，也没说还要等几秒。用户不知道是「等一下」还是
   「今天用完了」，只能瞎试。响应里也没有把 `Retry-After` 之类的信息带给前端。

**建议**　先把语音档位对齐一次生成的真实耗时；文案至少要带「还需等待 N 秒」。
上限本身是对的，看不见的上限才是问题。

---

## AC 生成挂掉时只回一句「发生意外错误」——没有原因、没有 request id、也不说重试有没有用

**现象**　第一条语音提交返回
`500 · INTERNAL_ERROR · "An unexpected error occurred. Please try again."`；
**一字不改地重发同一条请求就成功了**（28.99 秒，正常出片）。

**复现**　`POST /api/generate-audio`（Fish S2.1 / BYOK key）。
⚠ 归因保留：当时我有一条**参数完全相同**的请求还在飞（前一次调用超时被我丢弃，服务端仍在跑），
所以这可能是并发同款请求踩到的竞态。**这一点没有验证，别当结论。**

**影响**　不管根因是什么，用户拿到的东西是一样的：一句没有信息量的话。
它同时不回答三个问题——哪一步炸的、要不要重试、去哪报。而这次的事实是「重试就好」，
也就是说**最该说的那句话恰恰没说**。对照 H 条（Seedream 安全过滤）是同一个毛病的另一面：
失败响应不带 provider 的原始理由。

**建议**　`INTERNAL_ERROR` 至少带一个可以贴给客服 / 贴进 issue 的 id，日志里能按它捞到堆栈；
能判定为瞬时的（provider 5xx、超时、锁冲突）就明说「可以直接重试」。

---

## AD Fish 公共音色库原样铺给用户：头部结果大量真人 / 影视 IP 克隆音色

**现象**　`GET /api/voices`（默认「推荐」，即 Fish 公共库按调用量排序）翻出来的头部结果：

- 不限语言：`Super Smash Bros. Ultimate Announcer`、`Mortal Kombat`、`Меллстрой`（俄语主播真人）
- `language=zh`：`丁真`、`蔡徐坤`、`赛马娘`、`央视配音`
- `language=en`：`Emma Watson (British Female)`、`Paddington—British narrator`、`jjk narrator`
- `language=ja`：`Hatsune Miku`、`呪術廻戦ナレーション`、`情熱大陸ナレーション`

**复现**　音频工作台 → 选音色 → 默认档往下翻；或直接 `GET /api/voices?page=1&pageSize=20&sortBy=task_count`。

**影响**　这些是**真人姓名 / 影视作品**的克隆音色，产品把它们不加标注地铺在音色库首屏，
用户拿去做商用配音是有风险的，而界面上没有任何提示说这是第三方公开库的内容。
顺带也解释了 F / G 两条为什么难受：默认档排的是「调用量」，调用量最高的就是这些名人音，
真正通用的描述性音色（「温柔女声」「清朗少年音」「旁白」）都要主动搜标题才出得来——
我给首页配这九条，就是靠按 `温柔女声` / `少年音` / `旁白` 搜标题才挑到能用的。

**建议**　默认档不要直接照抄上游的热度排序；至少给一个「通用音色」入口（按 tag 而非
调用量排），并在库里标明音色来自 Fish 公共库、版权与合规由使用者自负。

---

<!-- 以下 AE–AI 来自「7 张模型站背景图换成站内自产」那一轮（原 MC-1…5）。 -->

## AE · GPT Image 2 选 16:9 实际出 3:2，UI 与结果全程不告知

> ⭐ **BS 给出了解法**：传 `advancedParams.resolution` 就能拿到真比例，默认档才走那张手写尺寸表。
> ⚠ **与 BG 是同一个 switch 的两半**（`aspectRatioToOpenAISize()` 把五档比例压成三档尺寸）。
> 修的时候一起修：只补 16:9 而不补 3:4，另一半照样静默出错。

**现象**　图片工作台的宽高比选择器对每个图片模型都给同样五档（`1:1 / 16:9 / 9:16 / 4:3 / 3:4`）。
对 `gpt-image-2` 选 **16:9**，拿回来的是 **1536×1024（3:2）**。页面上、返回体里、素材库里
都没有任何一处说明「你要的比例没被采纳」。

**复现**

1. `POST /api/generate`，`{ modelId: 'gpt-image-2', aspectRatio: '16:9', ... }`
2. 轮询 `GET /api/studio/generate/status?jobId=…` 拿到 generation
3. 读 `generation.width/height`，并用 sharp 量下载下来的原图

**证据**

- 真机：generation `5eff92b2-4be8-4f7f-ba0f-7290dc3c902b`，库里 `1536×1024`；
  sharp 量下载的 PNG 同样是 `1536×1024`。请求写的是 `16:9`（= 1.778），实到 1.5。
- 代码：`workers/execution/src/index.ts:4242-4256` `aspectRatioToOpenAISize()` 把
  **`16:9` 与 `4:3` 一起**映射到 `1536x1024`，**`9:16` 与 `3:4` 一起**映射到 `1024x1536`。
  即五档里只有三个真实档位，`16:9` 与 `9:16` 是 `4:3` / `3:4` 的别名。
- 选择器不按模型收窄：`src/constants/studio.ts:21-27` `STUDIO_IMAGE_ASPECT_RATIOS`
  是一个**全模型共用**的五元常量，没有 per-model 过滤。

**影响**　这是 Hard Rule 8「缺能力不禁用 UI」被用错了地方——那条规矩说的是缺 API key
时别灰掉按钮，不是说可以给一个做不到的比例。做首页 `cover` 全出血背景正需要 16:9，
拿到 3:2 就得自己裁掉 15% 的高，而且**只有量了才知道**。同理，任何按 16:9 排版的下游
（视频首帧、封面、OG 图）都会静默偏差。

**建议**　二选一：① 按 adapter 收窄选择器（`OPENAI` 只给 `1:1 / 3:2 / 2:3`）；
② 保留五档但在结果上如实回报实到比例，并在选择器上标注会被折算到哪一档。
⛔ 别用「加个 toast」了事——落库的 `width/height` 本身就是折算后的值，下游读的是它。

---

## AF · 图片生成从不落 `negativePrompt`：列在、写入口在、生产者一个都没有

**现象**　请求里带了 `advancedParams.negativePrompt`（且**确实生效**——出图明显受控），
但生成完之后 `generation.negativePrompt` 是 `null`。

**复现**　`POST /api/generate` 带 `advancedParams: { negativePrompt: '…' }` → 完成后读
`GET /api/studio/generate/status` 返回的 `generation.negativePrompt`。

**证据**

- 真机：generation `7c066ba1-92b5-4c1d-97fb-fbd751951e8f`，请求里带了 19 个词的负面词，
  返回的 generation 记录 `"negativePrompt": null`。
- 列是有的：`prisma/schema.prisma:336` `negativePrompt String? @db.Text`。
- 写入口是通的：`src/services/generation.service.ts:417` `negativePrompt: input.negativePrompt`。
- **但没人传**：`negativePrompt` 这个词在 `src/services/execution-callback.service.ts`
  里**一次都没出现**——图片终结器 `finalizeImageResult`（`:827` 起，`createGeneration` 在
  `:896`）压根没有这个字段。而 job metadata 里它是在的
  （`ImageQueueMetadata.advancedParams`，`submit-image.service.ts:76`），
  同一个 `metadata` 对象的 `projectId` / `isFreeGeneration` 都传了。
- **有消费者**：`src/services/prompts/recipe.service.ts:537`
  `negativePrompt: generation.negativePrompt` —— 「把这张图存成配方」这个功能读它，
  于是永远存成空的负面词。`generation.service.ts:170`、`project.service.ts:253`
  也都 select 了它。

**影响**　典型的「有消费者没生产者」。用户调了半天负面词出了一张满意的图，**这张图的
负面词没有任何地方留存**：复刻、存配方、素材库详情全都拿不到。对一个自称「永久归档」
的产品，这是归档缺了一半——正面词留了，负面词丢了。

**建议**　`finalizeImageResult` 的 `createGeneration` 调用补一行
`negativePrompt: metadata.advancedParams?.negativePrompt`。视频 / 3D / 音频三条终结器
按同样口径一并对齐（本轮没跑，未验证它们的现状）。

---

## AG · Replicate 图片任务可卡 `IN_PROGRESS` 11 分钟以上，零进度信号，兜底闸是 60 分钟

**现象**　同一模型、同一参数形状、只差提示词与种子的 4 次 Illustrious XL 请求，前 3 次
60–90 秒完成，第 4 次**至今 15 分钟以上仍是 `IN_PROGRESS`**，
状态端点除了 `status` 字符串什么都不给：没有队列位置、没有已耗时、没有预计、没有上游
prediction id。用户无法区分「慢」和「卡死」。

**复现**　连续提交 4 个 `modelId: 'illustrious-xl'` 的请求，轮询状态端点。

**证据**

- 真机：`submittedAt 2026-08-29T14:17:26Z`，到 `14:28:41Z`（**11 分 15 秒**）状态仍是
  `IN_PROGRESS`，`generation` 为 null，`error` 为空。到 `14:32` 用另一个端点复核
  （`GET /api/images?mine=1&limit=12`）：最新的三条 `illustrious-xl` 仍是
  `14:15:04 / 14:15:06 / 14:15:10` 那三张，**重跑的那张从未落库**。
- 同批对照：`27bed5a5-8824-491c-98d2-eaabcdffee88`、
  `ea987c47-2940-4276-b064-df89c4954f71`、`2226ce70-db75-428b-85c8-7ce6082f2c9a`
  三个同模型任务全部在约 60–90 秒内完成。
- 状态返回体形状：`src/types/index.ts:785-806` `ImageStatusResponseData` 的
  非终态分支**只有** `{ jobId, status }` 两个字段——协议层就没有留进度位。
- 兜底闸太远：`src/constants/execution.ts:15`
  `EXECUTION_SWEEPER.STALE_JOB_THRESHOLD_MS = 60 * 60 * 1000`（60 分钟）。
  也就是说一个真卡死的任务要占着「正在生成」的位子**一小时**才会被判失败。
- 而并发名额只有 4：`MAX_ACTIVE_JOBS_PER_USER = 4`。

**影响**　两层叠加：① 用户看不出卡没卡，只能干等；② 卡住的任务**吃掉 4 个并发名额中的
一个长达一小时**，连卡 2、3 个就基本不能用了。这和台账里已有的「LoRA 排队 10 分钟才
失败」是同一类病（假进度），但这次的上游是 Replicate 不是 RunPod，说明问题在**状态协议
本身**，不在某一家 provider。

**建议**　① 状态非终态分支带上 `startedAt` / 已耗时，前端据此显示「已等待 N 分」；
② 按 adapter 给单任务超时（图片类几分钟量级即可），别让 60 分钟的通用清扫闸当唯一防线；
③ 顺手把上游 prediction/request id 透出来，卡住时人能自己去 provider 后台看一眼。

---

## AH · 提交没有幂等键：客户端超时后重试 = 两张图两次扣费

**现象**　第一次 `POST /api/generate` 客户端侧等待超时（我的自动化在 45 秒处放弃），
我按「大概没提上去」重试了一次。结果**两次都成功了**，同一个 prompt、同一个 seed，
产出两张完全相同的图，扣两次费。

**复现**　提交一个生成请求，在响应回来之前掐断客户端，然后重新提交同样的请求体。

**证据**

- 真机：generation `7c066ba1-92b5-4c1d-97fb-fbd751951e8f`（job `5412462c-…`）与
  `7d667679-110c-4d2b-a89d-2f7ef4162b45`（job `5730201e-…`），prompt 与
  `seed: 771001` 完全一致，产出的 PNG 视觉上完全相同（1566255 B vs 1566341 B）。
- `GenerateRequestSchema`（`src/types/index.ts:435-461`）里没有任何幂等/请求去重字段。
- `generateImageAPI`（`src/lib/api-client/generation.ts:63-70`）的 `fetch` 没有超时，
  所以正常 UI 下不会自动重试——**但用户刷新页面 / 再点一次「生成」就是同一个场景**。

**⚠ 触发这次的是我的自动化超时，不是产品的 bug**；但「提交无幂等键」这个属性是产品的，
上面那条只是让它显形的路径。按低优先级记。

**影响**　慢提交（见 AI）与无幂等叠加，用户在「点了没反应」时再点一次就会重复扣费，
而且两张图长得一模一样——他会以为是产品把同一张存了两遍。

**建议**　`GenerateRequestSchema` 加一个可选 `clientRequestId`，服务端在建 job 前按
（userId, clientRequestId）去重，命中就回原 jobId。前端每次点「生成」生成一个新 id、
重试时复用。

---

## AI · 提交端点本身很慢（低置信 · 环境有混淆）

**现象**　`POST /api/generate` 首次命中 **>45 秒**才返回 jobId；路由热了之后，一次
**必定失败**的请求（故意传不存在的 `apiKeyId`）仍要 **7.1 秒**才回 400。

**证据**

- 首次：45 秒未返回（我的 CDP 求值窗口到期），但服务端其实已经完成并建了 job。
- 热路由探针：`{ apiKeyId: 'BOGUS-…' }` → `7142 ms`，`400 INVALID_ROUTE_SELECTION`。
  这条路径只做「查 key → 发现不可用 → 拒」，不碰 provider。

**⚠ 置信度低**　本机此刻有 4 个并行 agent 会话在同时打同一个 Next dev server（还在
不停触发 Turbopack 重编译），首次 45 秒几乎肯定是冷编译。**这条不能当生产结论**，
记下来只是因为它是 AH 的燃料：提交越慢，用户越容易重复点。

**建议**　别急着优化。若要证伪/证实，在生产（Vercel）上量一次同样的 bogus-key 请求
即可——那条路径没有 provider 调用，纯服务端耗时，是干净的对照。

---

### 附 AE–AI · 顺带记下的两件事（不是缺陷，是给下一个会话省事的事实）

1. **`Generation.width/height` 是「请求值」不是「实到值」**——`execution-callback.service.ts:901`
   写的是 `resultData.width`，而各 provider 的 `resultData` 里那个数是 worker 自己按
   `aspectRatio` 算出来的请求尺寸（`getNovelAiImageDimensions` / `getStandardImageDimensions` /
   `aspectRatioToOpenAISize`），**不是量出来的**。本轮 7 张图我都用 sharp 量了下载后的原始
   字节，恰好都与库里一致；但这只说明这三家 provider 老实照做了，不能当通则。
   （与 MEMORY 里「库里 width/height 是请求值」那条互为佐证，这次找到了代码位置。）
2. **NovelAI / Replicate / OpenAI 三条线本轮都是通的**，BYOK key 齐备，
   Illustrious XL 走 Replicate `delta-lock/noobai-xl` 的 sdxl schema（`index.ts:5427-5437`），
   `negativePrompt` / `steps` / `cfg_scale` / `seed` 四个参数**实测都生效**（同种子可复现，
   两次同参提交产出逐字节近似的同一张图）。

---

<!-- 以下 AJ–AR 来自「Wan 3.0 / Hunyuan3D 补封面」那一轮（原 Z-1…Z-8）。 -->

## AJ · Hunyuan3D 全家在 fal 上必然失败——源图字段名写错（P0，阻断）

**现象**　`/api/generate-3d` 提交 `hunyuan3d-v3.1-pro` 后 ~40s 变 `FAILED`，
错误只有一句 `missing: Field required`。模型在目录里是 `available: true`。

**复现**

```js
// 登录态下任意 localhost:3000 页面
await fetch('/api/generate-3d', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    modelId: 'hunyuan3d-v3.1-pro',
    imageUrl: '<任意合规公网图>',
  }),
})
// → 200 拿到 jobId；轮询 /api/generate-3d/status?jobId=… → FAILED, "missing: Field required"
```

**证据**　真凶是 worker 的 fal 3D payload builder 只发 `image_url`：

`workers/execution/src/index.ts:1726-1750`（`buildFalModel3DQueueRequest`）

```ts
const input: Record<string, unknown> = {
  image_url: providerInput.imageUrl, // ← Hunyuan3D 需要的是 input_image_url
}
```

拉 fal 官方 OpenAPI 逐个端点核对（`https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=…`），
**源图字段名按模型族分裂**：

| 端点                                     | 目录里的模型         | required 源图字段 | builder 发的 | 结果      |
| ---------------------------------------- | -------------------- | ----------------- | ------------ | --------- |
| `fal-ai/hunyuan-3d/v3.1/pro/image-to-3d` | `hunyuan3d-v3.1-pro` | `input_image_url` | `image_url`  | ❌ 必失败 |
| `fal-ai/hunyuan3d-v3/image-to-3d`        | `hunyuan3d-v3`       | `input_image_url` | `image_url`  | ❌ 必失败 |
| `fal-ai/hunyuan3d/v2`、`…/v2/turbo`      | （目录未接，同族）   | `input_image_url` | `image_url`  | ❌ 必失败 |
| `fal-ai/trellis-2`                       | `trellis-2`          | `image_url`       | `image_url`  | ✅        |
| `fal-ai/triposr`                         | `triposr`            | `image_url`       | `image_url`  | ✅        |

即：**builder 是照着 Trellis / TripoSR 写的，Hunyuan 这一族从来没跑通过**。
函数上方的注释还写着 `// ─── fal.ai model-3D (Hunyuan3D) ───`，说明它自认为覆盖了 Hunyuan。

顺带：v3.1 Pro 的 schema 里**根本没有** `octree_resolution` / `seed` / `remove_background`
（props 只有 `input_image_url` / `face_count` / `enable_pbr` / `generate_type` + 6 个方位图
`left|right|back|top|bottom|left_front|right_front_image_url`）。目录 `Generate3DRequestSchema`
把 `octreeResolution` 标成「Hunyuan3D octree 分辨率」，实际这个参数对 v3/v3.1 不存在——
**只有 v2 系有**。同理 `polygonType` 只在 v3 有、v3.1 没有。

**影响**　首页模型站的 `hunyuan` 页要用 Hunyuan3D 自产封面，这条路整个不通；
更要紧的是**线上任何用户点 Hunyuan3D 都是必败**，且失败信息完全无法自助定位。
目录里 3 个 3D 模型（v3.1 Pro / v3，以及潜在的 v2）等于摆设，实际可用的只有 Trellis 2 / TripoSR / Rodin。

**建议**　按端点族分流字段名，一处改完全族生效：

```ts
// workers/execution/src/index.ts, buildFalModel3DQueueRequest
const sourceImageField = /hunyuan/i.test(providerInput.externalModelId)
  ? 'input_image_url'
  : 'image_url'
const input: Record<string, unknown> = {
  [sourceImageField]: providerInput.imageUrl,
}
```

同时建议把 `octreeResolution` / `polygonType` 的适用范围在 `Generate3DRequestSchema`
的注释里改对（现在写的是「Hunyuan3D」，实际只对 v2 / v3 各自成立），免得下一个人照注释传参。

> ⚠ 本次为了把封面做出来，**临时**在本机改了上面这一行、跑完就**已还原**。
> 也就是说仓库里这个 bug **仍在**，需要 owner 决定后正式落。

---

## AK · 同一个 adapter 的**出参**也读错——Trellis 2 跟着一起死（P0，阻断）

**现象**　把 AJ 的入参修好后，Hunyuan3D v3.1 Pro **提交成功、跑完了**，
但结果解析阶段又失败：`fal.ai 3D result did not include a model mesh URL.`
（`errorCode: provider_no_output`）。

**证据**　`workers/execution/src/index.ts:1759-1780`（`readFalModel3DResult`）只认
`model_mesh` 和 `glb` 两个键。拉 fal OpenAPI 逐端点核对 **output**：

| 端点                                     | 目录里的模型         | output required            | reader 认的     | 结果      |
| ---------------------------------------- | -------------------- | -------------------------- | --------------- | --------- |
| `fal-ai/triposr`                         | `triposr`            | `model_mesh`               | ✅ `model_mesh` | ✅        |
| `fal-ai/trellis-2`                       | `trellis-2`          | `model_glb`                | ❌ 不认         | ❌ 必失败 |
| `fal-ai/hunyuan3d-v3/image-to-3d`        | `hunyuan3d-v3`       | `model_glb` + `model_urls` | ❌ 不认         | ❌ 必失败 |
| `fal-ai/hunyuan-3d/v3.1/pro/image-to-3d` | `hunyuan3d-v3.1-pro` | `model_glb` + `model_urls` | ❌ 不认         | ❌ 必失败 |

注释写的是「Hunyuan3D typically returns `model_mesh`」——**恰好写反了**：
`model_mesh` 是 TripoSR 的，Hunyuan 全族和 Trellis 2 用的都是 `model_glb`。
而 `glb` 这个 fallback 键**在四个端点里一个都不存在**，是凭空写的。

**影响（本条把 AJ 的结论放大了）**　把入参和出参两个 bug 合起来看，
**fal 路线的 4 个 3D 模型里只有 TripoSR 真正端到端可用**：

| 模型                 | 入参      | 出参      | 实际可用 |
| -------------------- | --------- | --------- | -------- |
| `triposr`            | ✅        | ✅        | ✅       |
| `trellis-2`          | ✅        | ❌ 出参死 | ❌       |
| `hunyuan3d-v3`       | ❌ 入参死 | ❌ 出参死 | ❌       |
| `hunyuan3d-v3.1-pro` | ❌ 入参死 | ❌ 出参死 | ❌       |

四个都挂着 `available: true`。首页模型站的 3D 幕一共就 4 张卡
（Rodin / Hunyuan3D / Trellis 2 / TripoSR），**其中两张对应的模型是点了必失败的**。
⚠ Trellis 2 这条是**顺带推断出来的**（没有实跑验证，我只实跑了 Hunyuan3D v3.1 Pro）——
但依据是 fal 官方 OpenAPI 的 required 字段，可信度高，建议 owner 用一次真跑确认。

**建议**　reader 按「先 `model_mesh` → 再 `model_glb` → 再 `model_urls.glb`」三级取，
并把 `content_type` 一并读出来：

```ts
// workers/execution/src/index.ts, readFalModel3DResult
// TripoSR → model_mesh；Trellis 2 / Hunyuan3D 全族 → model_glb（同一份文件
// 也在 model_urls.glb）
const modelGlb = isRecord(resultData.model_glb) ? resultData.model_glb : null
if (modelGlb) {
  return {
    artifactUrl: readStringField(modelGlb, 'url'),
    mimeType: readStringField(modelGlb, 'content_type') ?? 'model/gltf-binary',
  }
}
const modelUrls = isRecord(resultData.model_urls) ? resultData.model_urls : null
const modelUrlsGlb = modelUrls && isRecord(modelUrls.glb) ? modelUrls.glb : null
if (modelUrlsGlb) {
  /* 同上 */
}
```

**顺带**　v3/v3.1 的 output 里还有一个 `thumbnail` 字段（fal 自己渲的预览图）。
现在完全没被读取。3D 生成完在素材库里长期没缩略图（要等前端 `<model-viewer>`
自己截一张回传），这个字段本可以直接当首帧用。

> ⚠ 同 AJ：为出封面**临时**改过、**已还原**，仓库里 bug 仍在。

---

## AL · `missing: Field required` 不带字段名，错误无法自助定位（P1）

**现象**　AJ 的失败信息全文就是 `missing: Field required`——没有字段名、没有端点、
没有 provider 原文。

**证据**　fal 的 422 原文是带 `loc` 的（`{"detail":[{"loc":["body","input_image_url"],"msg":"Field required","type":"missing"}]}`），
到用户手里只剩 `type + msg` 拼成的一句。中间还叠了已知的
「Workflow step 边界会拍平错误」（`instanceof` 恒 false、自有属性丢）。

**影响**　这一条直接决定了 AJ 要花多久才能定位。我是靠**拉 fal 官方 OpenAPI 逐端点比字段**
才找到的，不是靠错误信息。线上用户没有这个手段。

**建议**　fal 422 的 `detail[].loc` 至少要拼进 message（`missing: body.input_image_url`）。

---

## AM · 库里的 width/height 是**请求值**不是实到值（复现并加固既有结论）

**现象**　Wan 3.0 那条视频，`Generation` 记 `width: 1792, height: 1024`（比例 1.75），
下载下来 ffprobe 实测 **1280×720**（比例 1.778，真 16:9）。

**复现**　`/api/generate-video` 提交 `aspectRatio: '16:9'`、`resolution: '720p'` →
`/api/generate-video/status?jobId=…` 返回的 `generation.width/height` 与实到文件不符。

**证据**

```
generationId 704ab20d-d7e4-4896-b707-88aca001837d   model wan-3.0
DB:      1792 x 1024   (ratio 1.750)
ffprobe: 1280 x 720    (ratio 1.778)  h264, 30fps, 60 frames, 2.000s
```

**影响**　任何按库里尺寸做的判断（挑封面版式、算比例、排网格、算带宽）都可能错。
这条**账本里已有**（首页素材那轮四个模型里两个记错），这次是**视频侧的又一例**，
说明不是图片链路的个案，是通用的落库口径问题。

**建议**　落库时以实际产物为准（视频侧 worker 上传前已经拿到了文件，可 probe 一次），
或者把字段名改成 `requestedWidth/requestedHeight` 让口径自明。

---

## AN · 3D 源图质检会把「标准半身像」判为 cropped，且不给可操作提示（P2）

**现象**　用 GPT Image 2 出的一张标准角色半身像（1024×1024，中性灰背景、构图居中）
提交 3D，被 422 拒：`source image silhouette appears cropped; keep the full subject visible`。

**复现**　提示词「雕塑级角色半身像，中性灰无缝背景棚拍…」→ 出图（肩部自然出血到画面底边）
→ `/api/generate-3d` → 422。

**证据**　质检是 VLM 语义检查，system prompt 见
`src/services/image/image-3d-prep.service.ts:35`，把「cropped or cut-off subject silhouette」
列为 blocker；文案表在 `src/services/generate-3d.service.ts:920-940`。
换成显式要求「整个主体完全位于画面内部、四周留白、不接触任何边缘、底座完整可见」
重出一张后即通过。

**影响**　「半身像 / bust」这个题材**天然**会让肩膀出血到底边，是最容易撞的构图之一。
用户不会知道要在提示词里写「留白、不接触边缘」。两次出图 = 两次计费。

**建议**　判定本身合理（裁切确实毁重建），但错误文案应给**可操作的下一步**，
例如「主体触到画面边缘；重出时加『完整主体、四周留白、不接触边缘』，或先用扩图补边」。
更好的是直接在 3D 工作台的源图选择处前置提示，而不是等提交后才拒。

---

## AO · 500K 面的默认档会把 3D 落库整条撑爆（P1）

**现象**　AJ / AK 两个 bug 修好后，Hunyuan3D v3.1 Pro **跑完了、拿到 mesh URL 了**，
却倒在最后一步：`Transaction API error: Unable to start a transaction in the given time.`
（`errorCode: storage_upload_failed`）。把 `faceCount` 从默认的 **500,000** 降到
**120,000** 后一次通过。

**证据**

- 失败：`faceCount` 不传（吃 `HUNYUAN3D_FACE_COUNT.DEFAULT = 500_000`）→ `storage_upload_failed`。
- 成功：`faceCount: 120_000` → COMPLETED，产物 GLB **45.6MB**。
- 按比例推算 500K 面那版的 GLB 在 **150MB 以上**（fal 自己 OpenAPI 的示例 GLB 就是 38MB）。
- `src/constants/model-3d-generation.ts:86-91`：`MIN 40_000 / DEFAULT 500_000 / HIGH 1_000_000 / MAX 1_500_000`。

**影响**　**默认档就是失败档**。用户什么都不改、直接点生成，落到的是 500K 面
→ 下载 + 传 R2 + 写库这一串在事务里超时。也就是说即使 AJ/AK 修好，
Hunyuan3D 的**默认参数**仍然大概率失败。注意工作台 UI 上「面数 + 拓扑」那一排
默认高亮的正是 **500K Triangle**（真机实拍可见）。

**建议**　三选一（或组合）：① 把 `DEFAULT` 降到 12 万-20 万这一档；
② 下载/上传移出事务边界，事务里只写最终的 key；③ 给大文件走流式转存而不是先落内存。
⚠ 这条同样会打到 Trellis 2（`trellisDecimationTarget` 同理）和 Rodin 的 HighPack 档。

---

## AP · 3D 生成完在素材库里没有缩略图，而 provider 已经给了（P2）

**现象**　生成成功后回到「打开已有 3D」选择器，唯一那条 3D 素材是**一张空白卡**，
只有右下角一个 `3D` 角标（真机实拍 `ss_584135doc`）。

**证据**　缩略图要等前端 `<model-viewer>` 自己 `toBlob()` 截一张再回传
（`ModelViewerInner.tsx:96-104` → `POST /api/generations/[id]/poster`）——
也就是**必须有人先打开过这个模型**，它才会有封面。而 fal 的 v3/v3.1 output
**本来就带 `thumbnail` 字段**（见 AK 附注），worker 完全没读。

**影响**　「生成完 → 回素材库 → 一片空白卡」是必现的空态；用户分不清哪个是哪个。
且这个空白会一直留到有人挨个点开为止。

**建议**　worker 落库时顺手把 `thumbnail.url` 转存成 poster，前端截图那条留作兜底。

---

## AQ · 模型站的 3D 幕现在混着厂商官方样图（非缺陷，但与「站内自产」目标冲突）

**现象**　`public/homepage/v4/model-rodin-gen-25.jpg` 打开一看是 **Hyper3D 自己的营销物料**
——带 Rodin 彩色 wordmark、`Text/Image To 3D`、`Production-Ready Is Never So Close` 两行英文
标语和一整墙他们自己的模型缩略图。`model-trellis-2.jpg` / `model-triposr.jpg` 的
`src` 徽标也如实写着「官方 teaser / 官方视觉」。

**影响**　与 owner 定的「首页素材一律站内自产」直接冲突：3D 幕四张卡里，
本次补上的 `hunyuan` 是**第一张真正站内产的**，其余三张仍是厂商图。
而且 Rodin 那张里印着别家的 logo 和标语，出现在我们首页上观感很怪。

**建议**　3D 幕剩下三张（rodin / trellis / tripo）按同一条链路补：
源图 → 对应模型出 GLB → 站内 `<model-viewer>` 渲 16:9。
⚠ 但先过 AK：**Trellis 2 的出参解析也是坏的**，得先修才能自产。
Rodin 还额外卡在「未配置 Hyper3D API Key」（真机可见橙色提示条）。

---

## AR · 本机 Clerk 会话在生成过程中被登出（未定位，记录待查）

**现象**　在 3D 选择器里点了一下那条素材，浏览器**所有** localhost:3000 标签页
（含并行会话的）一起跳到 `/zh/sign-in?redirect_url=…`。此前同一会话已经连续成功
调了十几次带 `credentials:'include'` 的 API。

**没能定位**　当时同机有多个会话在并行操作（另一路在跑 LoRA 社区搜索 / 图片工作台），
无法区分是：① 点击那条素材触发的某个请求 401 → 全局登出；② 并行会话触发的；
③ Clerk 会话到期 / Client Trust 的新设备校验。**记在这里只为留痕**，
下次再遇到时优先看 dev server 日志里那一刻的 401 来自哪个路由。

**影响**　本次导致「用站内 3D 工作台打开模型→自动截 poster」这条最顺的路走不通，
改用项目自己的 `@google/model-viewer`（node_modules 里同一个包同一个版本）
在本地 Playwright 里渲染，产物同样成立，但绕了一圈。

---

### 附 AJ–AR · Wan 3.0 / Hunyuan3D 两张封面的链路实录

| 图                    | 链路                                                                            | generationId                           |
| --------------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| `model-wan-30.jpg`    | Wan 3.0 文生视频（2s / 720p / 16:9）→ ffmpeg 抽第 1.93s 帧                      | `704ab20d-d7e4-4896-b707-88aca001837d` |
| `model-hunyuan3d.jpg` | GPT Image 2 出源图 → Hunyuan3D v3.1 Pro 出 GLB → `@google/model-viewer` 渲 16:9 | `6ab4e773-6161-43bd-a193-dec783e300c4` |

完整的三跳归属表、以及两张图要怎么接进常量和三语 `src` 徽标，见
`docs/plans/model-cover-wiring-3d-2026-08-29.md`。

---

<!-- 以下 AS–BF 来自「首页 LoRA 页出图」那两轮（原 L1…L14）。 -->

## AS · LoRA 权重设不到 0（服务端 + UI 两道都卡在 0.1）

**现象**　想表达「这把 LoRA 这一轮不参与」时，**权重填 0 会被 400 拒**。UI 滑杆同样
最低只到 0.1，拖到底也是 0.1。

**复现**　`POST /api/generate`，`advancedParams.loras` 里任意一把 `scale: 0`。

**证据**

- 真机 400：`{"error":"Too small: expected number to be >=0.1","errorCode":"VALIDATION_ERROR","success":false}`
- Schema：`src/types/index.ts:181` — `scale: z.number().min(0.1).max(2).optional()`
- 能力表：`src/constants/provider-capabilities.ts:283` — `loraScale: { min: 0.1, max: 2, step: 0.05, default: 1 }`
- UI 实测：装配台挂一把后读滑杆 `aria-valuemin` = **`0.1`**（`aria-valuemax` = `2`）

**产品现有的替代品**　装配台每把 LoRA 有一个**启停开关**，关掉 = 留在栈里但**整把从
请求里剔掉**（`LoraWorkbench.tsx:1574-1577` 注释写得很清楚：「停用 = 留在栈里不参与出图」，
`:1577` 是 `.filter((entry) => entry.enabled !== false)`）。

**影响**　「关掉一把」与「权重归零」在产品里是**两个不同的动作**，且只有前者可达。
后果是**语义差别**：关掉 → 请求里只有 4 把；权重 0 → 请求里 5 把、其中一把 0 权重。
本轮首页文案要说的是「同一套 5 把，只换权重」，**产品表达不出来**——只能退到 0.1。

**建议**　把两处 `min` 从 0.1 放到 0（ComfyUI 的 `LoraLoaderModelOnly` 收 0 是合法
no-op），或者在 UI 上明确「归零请用启停开关」。现在是既不让填 0、也没解释为什么。

---

## AT · `maxLoras` 两把尺子，而且都不是真上限

**现象**　同一个 RUNNER provider，**两个界面两个上限**，跟真正生效的第三个数还都对不上。

**证据**（三个数各自的位置）

| 数           | 位置                                                       | 是否真做闸                         |
| ------------ | ---------------------------------------------------------- | ---------------------------------- |
| `maxLoras:3` | `constants/provider-capabilities.ts:285`（RUNNER）         | **Arena 做闸**，装配台不读         |
| 不限         | `hooks/use-active-lora-stack.tsx`（装配台唯一的闸）        | 装配台实际行为                     |
| `.max(5)`    | `types/index.ts:250` — `loras: z.array(LoraSchema).max(5)` | **真正生效的硬上限**（服务端 Zod） |

- Arena 那条闸：`components/business/CapabilityForm.tsx:305` —
  `{(params.loras?.length ?? 0) < (config.maxLoras ?? 1) && (<Button …添加>)}`
  → 挂满 3 把后**「添加」按钮直接消失**，没有任何解释。
- `use-active-lora-stack.tsx:32` 自己的注释已经点破了：
  「只有它真的做闸、能力表里的 `maxLoras` 从不做闸——两把尺子对不上就是 H 那个（根因）」。

**影响**　同一个底模，装配台能挂 5 把并成功出图（本轮实证），Arena 只让挂 3 把。
用户在两个界面得到两个「上限」，而**真上限 5 在第三个地方**。

**⚠ 顺带纠正一处过时注释**　`constants/provider-capabilities.ts:271` 写着
「v1 stock worker-comfyui can't download LoRAs at request time — only pre-baked,
allowlisted LoRAs are mountable」——**方向正好反了**。v2 起 app 侧 `prepareRunnerLoras`
把每把 LoRA 送进 R2 + 预签名 GET，worker 组 `loras_to_fetch` 发给 fork
（`workers/execution/src/index.ts:4599-4609`、`:5849-5865`）。本轮 5 把任意 Civitai
LoRA 全部即时下载挂载成功，注释所说的限制**早就不存在**。留着会让人据此判定
「Civitai 的 LoRA 挂不上」。

**建议**　`maxLoras` 要么删（承认装配台的「不设上限」是产品事实、Zod 的 5 是唯一硬闸），
要么三处统一。现状是最坏的一种：**三个数、两套行为、一条过时注释**。

---

## AU · LoRA 库默认不按「已挂底模」过滤——跨底模混排

**现象**　装配台已经挂着 **Anima Base v1.0**，点「添加 LoRA」打开库，底模筛选默认停在
**「全部」**，首屏四张卡是 `SDXL 1.0` / `SD 1.5` / `Pony` / `SD 1.5`——**一张能用的都没有**。
点了也不拦、不警告，照挂。

**复现**　`/zh/studio/lora` → 底模保持 Anima Base v1.0 → 点「添加 LoRA」→ 看首屏卡片的底模角标。

**证据**　真机截图 `ss_692322k14`：底模筛选行「全部」高亮，结果卡角标
`SDXL 1.0` / `SD 1.5` / `Pony` / `SD 1.5`。手动点「Anima」后才全变成 `Anima`（`ss_9521otbdq`）。

**影响**　**这就是首页 LoRA 页当前那份坏配置的成因**——`HOME_V4_FN_LORA_CARDS` 里
三把 LoRA 分属 Illustrious / FLUX / Pony V6 三个底模，物理上根本跑不出来。产品**没有
任何一处**拦住「挂了跟底模不兼容的 LoRA」。

**建议**　打开库时把底模筛选**默认设成当前已挂底模**（保留用户手动切回「全部」的自由）；
或者至少在挂载不兼容底模的 LoRA 时给一次明确警告。

---

## AV · 搜索 + 底模筛选组合，查不到确实存在的 Anima LoRA

**现象**　`search=Flatline` 有结果；`search=Flatline&baseModel=Anima` 返回 **0 条**——
但目标 LoRA「Flatline — Anima/Illus × Niji」（model 1233370 / version 2980056）
**确实是 `baseModel=Anima`**，而且本轮成功挂载出图了。

**复现**（页面内 fetch，带登录态）

```
/api/lora-assets/civitai?search=Flatline&pageSize=5          → 200，5 条
/api/lora-assets/civitai?search=Flatline&baseModel=Anima…    → 200，0 条  ← 目标就在这个集合里
/api/lora-assets/civitai?baseModel=Anima&pageSize=5          → 200，5 条（含 Anima Detail Tweaker）
```

**证据**　`search=Flatline` 返回的 5 条是
`Flatlined [Flux]` / `Flatline (DC)` / `Zavy's Flat Line Paint - Flux` / 两条无关中文模型
——**目标那把一条都没排进来**；加上 `baseModel=Anima` 后直接归零。

**影响**　本轮 5 把 LoRA 是 owner 在 Civitai 官网选好后**把 versionId 直接给我**的。
如果只靠产品内搜索，**其中至少 1 把根本找不到**——「搜 Civitai / HuggingFace…」这个
输入框对已知目标都不可靠。首页 LoRA 页正在宣传这个搜索框。

**⚠ 不要与已知的「Civitai 搜索降级链」混淆**：那条是上游搜索子系统整体挂掉（502）、
浏览照常；这次搜索**返回 200 且有结果**，只是结果不对/组合筛后为空，是另一回事。

**建议**　查一下 `search` + `baseModel` 是「先搜后按底模过滤当页」还是「把底模条件带给
上游」。如果是前者，那么任何底模筛选叠在搜索上都会随机漏掉目标，属于结构性问题。

---

## AW · Anima 档 LoRA 卡片封面全空

**现象**　底模筛选切到「Anima」后，**8 张卡的封面图全是空白**（只有标题、下载数、
心数、「使用」按钮）。切「全部」时部分卡片有图。

**复现**　`/zh/studio/lora` → 添加 LoRA → 点底模「Anima」→ 看卡片。

**证据**　真机截图 `ss_9521otbdq`：8 张 Anima 卡片图区全空。对照 `ss_692322k14`（全部档）
四张里有两张有图。

**影响**　挑 LoRA 是**看图**的活。Anima 是本项目 runner 的主力底模（首页也在讲它），
这一档全无封面 = 这一档基本没法挑。

**未定位**　没深查是 NSFW 封面策略（`project-lora-nsfw-covers`：默认档 `safe`）把图滤掉了，
还是封面代理/取数的问题。**建议先按这两条各排一次**，别直接当渲染 bug 修。

---

## AX · Runner 出的图，`seed` 列永远是 null——出图不可复现

**现象**　本轮两张终图都是**显式传了精确 seed** 跑的（`runnerSeed: '412887301'`），
落库后 `generation.seed` 仍然是 **`null`**。

**复现**　任意 runner 出图（带 `advancedParams.runnerSeed`）→ 读 `generation.seed`。

**证据**　根因只有一行：

```
src/services/execution-callback.service.ts:862-863
  const seedValue = (metadata.advancedParams as { seed?: number } | undefined)
    ?.seed
```

**只读 `advancedParams.seed`，从不读 `runnerSeed`。** 而 runner 这条链路的精确 seed
**本来就只走 `runnerSeed`**——它是十进制**字符串**，专门为了 ComfyUI 的 uint64 不被
JS 精度吃掉（`types/index.ts:205-217` `RunnerSeedStringSchema`；worker 侧
`index.ts:5636-5651` `readRunnerSeed` 也是 `runnerSeed` 优先）。
于是 `seed: seedValue != null ? BigInt(seedValue) : undefined`（`:914`）恒为 `undefined`。

**影响**　`Generation.seed` 这一列（`prisma/schema.prisma:376`，注释直写
`// Seed for reproducibility`）在**整个 runner 域恒空**——偏偏 runner 是全仓 seed
指定得最精确的一条线。下游跟着空：`services/prompts/recipe.service.ts:542`
（`seed: typeof generation.seed === 'bigint' ? … : undefined`）→ **「存成配方」丢 seed**，
「复用这张的 seed」这类功能对 runner 图全部失效。

**缓解（不是修）**　完整 `advancedParams`（含 `runnerSeed`）**有**进 `snapshot` JSON
（`execution-callback.service.ts:925`），所以数据没彻底丢，只是那个**类型化的列**是空的，
按列读的消费者一个都拿不到。

**建议**　`seedValue` 回退读 `runnerSeed`（字符串 → BigInt，本来就是为 BigInt 准备的），
一行的事。

---

### 附 AS–AX · 本轮**没有**踩到的坑（供台账排除法用）

一并记下来，免得下次重复怀疑：

- ✅ **`PLATFORM_GENERATION_ENABLBJ` 总闸**没触发——本机 6 次出图全部正常派发。
- ✅ **RunPod 端点僵死**没触发——6 次全在 1–2 分钟内 COMPLETBJ，无 10 分钟超时。
- ✅ **Civitai 429**没触发——**但这是我主动规避的**：5 把 LoRA 首次入 R2 走的是
  **单请求串行**（`prepareRunnerLoras` 是 `for` 循环逐把下），我特意先跑**一条**把
  R2 缓存捂热，再并发后续。首条请求因此耗时 **> 45 秒**（超过 CDP 45s 上限），
  缓存热了以后同样的请求**只要 4.6–5.9 秒**。
  ⚠ **这条对生产是真风险**：`prepareRunnerLoras` **同步跑在 `/api/generate` 请求里**，
  而该路由 `maxDuration = 60`（`app/api/generate/route.ts:6`）。首次挂 5 把没进过缓存的
  LoRA，**本机就已经吃掉 45 秒以上**——线上 Vercel 60 秒硬顶，随时可能整条 504。
  service 自己的注释也已经预告了（`submit-image.service.ts:238-239`：「大/多 LoRA 有超
  Vercel Hobby 60s 的风险，撞到再迁到 Cloudflare Worker」）。**本轮把这个风险从「理论」
  变成了「实测 45s+」**，建议提前迁，别等线上撞。
- ✅ **8787 execution worker** 正常（`wrangler whoami` 有效登录，非僵死会话）。

---

# 追加（2026-08-30，四张权重扫描轮）

> 第二轮：换胸像参考图 + 出四张做权重扫描。以下是这一轮**新**踩到的。

## AY · 并发提交 4 个任务，必掉一个——「4 个上限」是竞态的

**现象**　同时 `fire` 四个生成（正好等于上限），**第二个被拒**：
`You already have 4 active generation jobs. Wait for one to finish before…`
——四个请求里只有三个建了任务，而当时**并没有**别的任务在跑。

**复现**　同一用户在同一瞬间并发 POST 四次 `/api/generate`。稳定复现（本轮 1/1）。

**证据**　`window.__runs` 里 `sweep2` 拿到的是上述 400 文案，`sweep1/3/4` 全部 200 建任务成功。
错峰重发 `sweep2` 立刻成功。

**根因方向**　「当前活跃任务数」是**先查后写**、两步之间没有原子性：四个请求并发读到
的都是「小于 4」，然后四个都去建——真正落库时被唯一性/计数拦下一个。也就是说这个上限
**在并发下既不准也不稳**：既可能误拒（本例），也可能在别的时序下放过第 5 个。

**影响**　批量出图（对比矩阵 / 变体 / 本轮这种扫描）**只要一次发满就必掉一个**，而且
错误文案把责任推给用户（「你已经有 4 个了」），用户看界面明明只有 3 个。
⚠ 这跟已知的「一次 N 张 = N 个请求」是同一条链上的：档位 `[1,2,4]` 的 **4 档正好踩在
这个竞态上**。

**建议**　计数与建任务放进同一个事务/原子操作；或者拒绝时返回「稍后重试」的语义
而不是断言用户已有 4 个。

## AZ · 出图状态轮询会把自己限流，且错误盖住了任务状态

**现象**　`GET /api/studio/generate/status` 轮询若干次后返回
`{"success":false,"error":"Too many requests. Please wait a moment.","errorCode":"RATE_LIMIT_EXCEBJBJ"}`。

**复现**　对同一批任务持续轮询（本轮我一次轮 8–11 个任务、每 ~40 秒一轮）。

**影响**　两层：

1. **限流值配的是 `RATE_LIMIT_CONFIGS.longVideoStatus`**（`app/api/studio/generate/status/route.ts:20`）
   ——图片状态查询借用了**长视频**的额度。图片是可以一次并发好几张的（上限 4），
   长视频不是，两者的轮询频率天然不同档。
2. **被限流时，响应里完全没有任务状态**——`success:false` 直接盖掉，调用方分不清
   「限流了」和「任务出问题了」。轮询循环如果没专门认 `RATE_LIMIT_EXCEBJBJ`，
   很容易把它当成生成失败。

**建议**　图片状态查询用自己的额度；限流响应至少保留 `jobId` + 上一次已知状态，
或明确标注「这是限流不是任务失败」。

## BA · RunPod 冷启动实测约 10 分钟（且期间状态一直是 IN_PROGRESS）

**现象**　端点闲置约 30 分钟后再提交，**第一张跑了约 10 分钟**才 COMPLETBJ；
同批后两张紧随其后。端点热着的时候同样的请求只要 **1–2 分钟**。

**证据**　本轮三张校准图同时提交，全程 `IN_PROGRESS`，约 9.5 分钟后第一张出，
约 10.5 分钟三张全出。后续批次（端点已热）恢复到 1–2 分钟。

**为什么值得记**　这与已知的「排队 10 分钟才失败 = RunPod 端点僵死」**表象几乎一样**
（都是十分钟量级、都一直不出结果）。本轮证明**十分钟也可能是正常冷启动**，
僵死判据必须落在 RunPod 侧的 `IN_QUEUE` + `idle≥1` + `running 0`，
**不能只看「等了十分钟」**。⚠ 而 app 侧的状态只有 `IN_PROGRESS`，
**根本区分不出「在队列里」还是「真的在跑」**——这正是判据难用的原因。

**顺带**　`workers/execution` 的 `.dev.vars` 里**没有** RUNPOD 凭证
（只有 `STATE_ENCRYPTION_KEY` / `INTERNAL_CALLBACK_URL`），本地会话拿不到 key，
**没法在本地直接查 RunPod health** 来套那条判据。要么把只读的 health 查询做进
worker 的调试端点，要么这条判据在本地环境等于不可用。

## BB · 负面提示词一加「形状名词」，那个物件就整个消失

**现象**　为了把发卡逼成六臂 ✳，我在负面里加了
`four-pointed star, plus sign, cross, hash symbol`——结果**发卡整个不见了**，
不是变形，是画面里根本没有这个物件（其余一切正常）。

**复现**　同一提示词，负面加上述四个词 → 发卡消失；去掉 → 发卡回来（形状仍不保证对）。
generationId `111673fb-520c-4323-a4dc-e2162c3b5ddb`。

**影响**　这是**用户很容易踩的通用陷阱**，不是本项目独有的 bug，但产品**没有任何提示**：
「否定某个形状」在实践中约等于「否定这个物件」。首页 LoRA 页正在教用户写提示词，
负面输入框的 placeholder 目前是 `不想要的元素，比如 bad hands, blurry…`
——示例全是**质量类**词，用户很容易类推去写**内容/形状**类词然后把主体否定掉。

**建议**　负面框的 placeholder / 帮助文案区分「质量类否定」（安全）与
「内容类否定」（会整块删掉东西）。这是**文案层面**的小改动，收益是少一类难归因的失败。

### 附 · 本轮的量化补充

- **发卡形状（六臂 ✳）在最终四张里没保住**：1 = 「#」井字、2 = 团块星、3 = 纯「+」、
  4 = 多臂但畸形。⚠ **值得注意的是校准那三张（提示词短、画风词单一）反而画对了 ✳**
  （0.50 / 0.60 两档都是真六臂）。**推断：提示词越长、竞争性画风词越多，
  小物件的形状越守不住**——四张扫描的共用提示词为了同时支撑两种画风而变得很长，
  代价就落在发卡上。这条只是推断，没有做对照实验证实。
- **首次 LoRA 入 R2 的耗时**（上一轮记的 45 秒+）本轮**没有重现**——五把 LoRA 已在
  R2 缓存里，提交只要 4–6 秒。**缓存是有效的**，风险只在冷缓存那一次。

---

# 追加（2026-08-30，全身 3:4 满量程轮）

> 第三轮：参考图换成**全身**、出图换成 **3:4 竖版**、权重推到能力表满量程 **2.0 ↔ 0.1**。
> 以下是这一轮**新**踩到的。

## BC · 参考图比例跟出图比例不一致时，产品**静默中心裁切**——全身图会被切掉头和脚

**现象**　把一张 941×1672（≈9:16）的全身参考图丢进 `aspectRatio: '3:4'` 的出图，
参考图会被 **cover + 居中裁切**，**上下各切掉约 208px**。这张图的人物内容在
y **79–1584**，也就是**头顶和靴子都在被切掉的那两条带子里**。
产品**没有任何提示**：不预览裁切框、不警告比例不符、不给「留白 / 裁切」的选择。

**复现**　runner（`architecture: 'anima'`）+ `referenceImage` 比例 ≠ `aspectRatio`。

**证据**

- `workers/execution/src/models/runner/anima-workflow-builder.ts:155-161` ——
  `class_type: 'ImageScale'`，`upscale_method: 'lanczos'`，**`crop: 'center'`**，
  宽高直接写目标尺寸。非 Anima 档的 `workflow-builder.ts:144-152` 同样是 `crop:'center'`。
- 代码注释只说「scaled to the requested dimensions so the output aspect ratio
  matches the txt2img path」——**没提这是 cover 裁切**，读注释会以为是拉伸或 contain。
- 算术：cover 缩放系数 = `max(864/941, 1152/1672)` = 0.918 → 缩放后 864×1535 →
  居中裁到 864×1152，即在原图坐标里只保留 y **209–1463**。

**影响**　这是**全身参考图这类用法的结构性坑**：用户越是想「拿一张立绘当参考」，
越会撞上（立绘几乎都是竖长比例，而出图默认档是 1:1 / 16:9 / 3:4）。而且失败形态很
隐蔽——出来的图人物是对的、风格是对的，只是**没有头/没有脚**，很容易被归因成
「模型不会画全身」而不是「参考图被裁了」。

**本轮怎么绕过的**　**没有裁原图**（owner 要求不裁），而是自己把 941×1672
**左右补白**到 1254×1672（精确 3:4，底色 `#FDFDFD` 取自原图角点），再走
`/api/upload-image` 上传。补白后 `ImageScale` 退化成纯缩放，零裁切。

**建议**　三选一（按代价从低到高）：① 上传参考图时若比例与所选 `aspectRatio` 不符，
UI 给一次明确提示 + 显示裁切框；② 提供「留白（contain）/ 裁切（cover）」开关；
③ 至少把那句代码注释改成「cover-crops to the target aspect ratio」，别让下一个人
以为它是等比缩放。

## BD · `/api/generate` 偶发 500 `INTERNAL_ERROR`，同一份请求体重发即成功

**现象**　一次完全合法的提交返回
`{"error":"An unexpected error occurred. Please try again.","errorCode":"INTERNAL_ERROR"}`，
HTTP **500**，耗时 18.6 秒（正常提交 4–11 秒）。**同一个 JS 变量里的同一份 body
原样重发，6.5 秒 200 成功**，jobId `fe36e5d5-538e-4b5c-98e0-53958f3a53cf`。

**复现**　本轮 12 次提交里出现 1 次，未找到稳定复现条件。

**影响**　两层：① 错误文案是纯兜底，**不告诉调用方是暂时性的还是请求本身有问题**
（重试一次就好，但用户没有任何依据知道该重试）；② 更重的一层见 BE——**这次 500
仍然占掉了一个并发位**。

**建议**　至少把「可重试」这个信息带出来（`errorCode` 区分 transient / permanent），
否则用户面对 500 只能猜；顺带查一下这条链路在 18 秒处最可能抛什么（R2 预签名 /
Civitai / worker 派发），现在完全被兜底吞掉了。

## BE · 「你已经有 4 个活跃任务」在**顺序**提交下也会误报——失败的提交会漏掉一个并发位，且 24 小时才自愈

**现象**　我手上**只有 2 个任务在飞**（w1、w2），**顺序**（不是并发）提交第 3 个，
被 429 拒：`You already have 4 active generation jobs.`

**复现**　先制造一次 BD 那样的 500（或任何在建 job 之后失败的路径），再正常提交。

**证据**

- 本轮时序：`cal45` 500 → `cal65` 200 → `cal45` 重发 200 → 三张校准图全部
  `COMPLETBJ` → 提交 `w1` 200、`w2` 200 → 提交 `w3` **429**。
  被拒时真正在飞的只有 w1/w2 两个，UI 上也只有两个。
- 闸的实现：`services/usage.service.ts:436-446` 数 `generationJob` 表里
  `status ∈ ['QUEUBJ','RUNNING']` 且 `createdAt >= now - ACTIVE_JOB_MAX_AGE_MS` 的行。
- `constants/config.ts:679-692`：`MAX_ACTIVE_JOBS_PER_USER: 4`，
  **`ACTIVE_JOB_MAX_AGE_MS = 24h`**。

**⚠ 顺带更正 AY 的归因（AY 大概率归错因了）**　AY 把「并发发满 4 个必掉一个」判成
**先查后写的竞态**。但计数与建行**本来就在同一个事务里、前面还压着一把顾问锁**：

```
src/services/usage.service.ts:428-429
  const activeLockKey = `active-generation-jobs:${input.userId}`
  await client.$executeRaw`SELBIT pg_advisory_xact_lock(hashtextextended(${activeLockKey}, 0))`
```

而且这把锁**不是本轮才有的**——`git log -S pg_advisory_xact_lock` 显示它 2026-07-28
就随 `88166c36`（把并发闸提到 4 的那个 commit）进来了，**AY 发生时它已经在**。
锁存在 ⇒ 四个并发请求会被串行成 0→1→2→3，四个都该过。所以 AY 那次「掉一个」
**用竞态解释不通**，和今天这次一样，更可能是**当时已经有看不见的活跃 job 行占着位**。

**真正的缺口**　顺序提交也会被拒 ⇒ 剩下的问题不在并发，而在
**没能走完的提交会把 job 行留在非终态，一直扣住一个并发位**。
24h 的年龄上限确实防住了「永久顶死」（那是 2026-07-26 那次事故的补丁），但对
「今天想连着出四张图」的人来说，**24 小时 ≈ 永久**。

**影响**　用户看到的是「你已经有 4 个」，而界面上只有 2 个，**没有任何入口能看见、
更别说清除那两个幽灵**。批量出图（对比矩阵 / 变体 / 本轮这种扫描）会莫名其妙地
「少一格」。

**建议**　① 提交失败的路径把自己建的 job 行落成终态（`FAILBJ`），别留悬空；
② 拒绝时把「当前活跃 job 的 id + 创建时间」带回来，或在设置里给一个「我的活跃任务」
列表，让用户至少能看见是什么占着位。

## BF · 补 AT：`maxLoras` 其实是**四把**尺子，第四把藏在 Zod 里

AT 记了三个数（能力表 `maxLoras:3` / 装配台不限 / `LoraSchema` 数组 `.max(5)`）。
**还有第四个**：

```
src/types/index.ts:252
  runnerLoras: z.array(RunnerLoraSpecSchema).max(3).optional(),
```

`runnerLoras` 是**服务端 `prepareRunnerLoras` 注入**的 R2 规格数组，跟客户端传的
`loras`（上限 5）是一一对应的两份。也就是说 `AdvancedParamsSchema` 里
**同一批 LoRA 有两个互相矛盾的上限：`loras` 5、`runnerLoras` 3**。
本轮五把全挂全程成功——因为注入发生在入参校验之后，**这条 `.max(3)` 事实上从不被执行**，
是一条死约束。留着的害处：下一个人读 schema 会以为 runner 最多挂 3 把。

**建议**　跟 AT 一起收：要么统一成 5，要么删掉 `runnerLoras` 上的 `.max(3)`。

### 附 · 本轮的量化补充

- **LoRA 权重 2.0（能力表上限）实测可用**：五把同挂、两端分别推到 2.0，
  人物结构 / 服装 / 道具全部正常，**没有过拟合、没有糊、没有结构崩**，不需要回退。
  唯一代价是**格 1（flatline 2.0）外套上的橙色徽记被扁平化吃掉了**——小图案在
  画风 LoRA 满权重下守不住，方向上与上一轮「提示词越长小物件越守不住」是同一类。
- **两端的零散杂色不是权重过高**。跑了三组对照全部证伪：flatline 降到 1.7
  （`b326e3bb-…`）杂色一模一样；提示词补上参考图里那支笔（`b04a1ef9-…`）**更差**，
  多长出一个青色吊牌；删掉光效 LoRA 的触发词 `dispersion, hue shifting`
  （`f86a2944-…`）几乎逐像素相同。⭐ **教训：看见「像色散」的杂色，别先怀疑那把
  写着 dispersion 的 LoRA——本轮它是清白的。**
- **RunPod 全程是热的**：本轮 12 次出图全部 **2–3 分钟**内 COMPLETBJ，
  BA 那种 10 分钟冷启动没有重现（上一轮刚跑完，端点没凉）。
- **状态轮询没有触发 AZ 的限流**：本轮一次只轮 1–3 个 job、间隔 40–120 秒。
  AZ 那次是「一次轮 8–11 个、每 ~40 秒一轮」。**限流的实际触发点在任务个数×频率上**，
  少量任务的低频轮询是安全的。

---

<!-- 以下 BG–BJ 来自「同一提示词 + 同一参考图，GPT 与 NovelAI 对照」那一轮（原 EA…ED）。 -->

## BG · GPT Image 2 选 3:4，实际出的是 2:3

**现象**　请求 `aspectRatio: '3:4'`（0.750），产物是 **1024×1536（0.667 = 2:3）**。
落库的 `Generation.width/height` 也照抄 1024×1536，所以**从库里、从 UI 上都看不出偏差**——
只有拿产物跟「我点的是 3:4」对一下才发现不是一回事。

**复现**　任意入口对 `gpt-image-2` 选 3:4（或 9:16）出图，读产物 PNG 的 IHDR。

**证据**

- `workers/execution/src/index.ts:4242-4257` `aspectRatioToOpenAISize()`：
  `'9:16'` 与 `'3:4'` 落进**同一个 case**，都返回 `1024x1536`；
  `'16:9'` 与 `'4:3'` 同理都返回 `1536x1024`。五档比例被压成三档尺寸。
- 实测产物 PNG 头（`C:/tmp/elf/elf-gpt-image-2.png`）：
  `IHDR width=0x00000400=1024, height=0x00000600=1536`。
- 同一次实跑的 NovelAI 对照组按 `getNovelAiImageDimensions()`（`:5126-5142`）
  拿到 **768×1024**，是真的 3:4——**证明偏差是 OpenAI 分支独有的，不是全局口径**。

**偏差幅度**

| 用户点的 | 期望比值 | 实到比值 | 偏差       |
| -------- | -------- | -------- | ---------- |
| `3:4`    | 0.750    | 0.667    | **-11.1%** |
| `9:16`   | 0.563    | 0.667    | **+18.5%** |
| `4:3`    | 1.333    | 1.500    | +12.5%     |
| `16:9`   | 1.778    | 1.500    | -15.6%     |

**影响**　构图会被系统性拉长／压扁：这次全身立绘构图里，GPT 那张比 NovelAI 那张
在同高并排时窄了 100px（800 vs 900），全身+夸张透视的脚在更瘦的画幅里更挤。
更麻烦的是**下游拼版**——首页四模型同题图、对照拼图这类要求等比的场合，
按「用户选的比例」算版面会算错，而库里的数字看着是对的（因为库里存的就是这个 1024×1536）。

**这条与账本 AE 是同一个函数的另一半**　账本里已记过「16:9 实际出 3:2」，
当时只记了横版。竖版这一半（`3:4`/`9:16` → 2:3）是同一个 switch 的同一个成因，
建议合成一条：**OpenAI 分支把五档比例压成三档尺寸**。

**建议**　两条路，二选一：

1. **诚实收窄**——`gpt-image-2` 的比例选择器只放 `1:1 / 3:2 / 2:3` 三档（OpenAI 真支持的），
   别让用户点一个拿不到的档位；
2. **后处理补齐**——worker 拿到 1024×1536 后按用户选的比例裁到 1024×1365，
   落库写裁后的真实尺寸。

⚠ 无论走哪条，`Generation.width/height` 都应该写**实到值**而不是请求值
（本次两条恰好一致，是因为 worker 是从它自己算出的 size 回填的；
provider 自作主张改尺寸的场合就对不上了——账本 Y/AM 已记）。

---

## BH · `/api/upload-image` 上传的图片一律以 `.png` 结尾，不管实际是什么格式

**现象**　上传一张 **WebP**（`character-source.webp`，95,118 B），
返回的 URL 是 `.../2026-08-30_c8ebe7f8f44402ce6bddd325.**png**`，
但拿 curl 拉下来 `Content-Type: image/webp`、magic bytes `52 49 46 46 ... 57 45 42 50`（RIFF/WBHP）、
字节数 95,118 与原文件**一字节不差**——**没有转码，只是文件名在撒谎**。

**复现**

```
POST /api/upload-image  { imageDataUrl: "data:image/webp;base64,..." }
→ data.generation.url 以 .png 结尾
curl -D - <该 URL> → Content-Type: image/webp
```

**证据**

- `src/services/storage/r2.ts:35-63` `generateStorageKey(outputType, userId, mediaFormat)`：
  **AUDIO 分支用 `mediaFormat`（mp3/wav/opus），VIDEO 分支用 `mediaFormat`（mp4/webm/mov），
  只有 IMAGE 分支把 `ext` 写死成 `'png'`**（`:54-61`）——形参收了却不用。
- `src/services/upload-image.service.ts:56-78`：上游其实**已经把真实格式探出来了**
  （`detectTrustedImageMime()` 返回 `trustedMimeType`，并原样传给 `uploadToR2`），
  所以 R2 对象的 Content-Type 是对的，`generateStorageKey` 只是没收到／没用这个信息。

**影响**

- 用户从素材库「下载」拿到的是一个 `.png` 后缀的 WebP 文件，双击可能打不开、
  拖进不认 sniffing 的工具直接报错。
- **对外投喂时有真实风险**：这次 GPT Image 2 走的是 OpenAI `/v1/images/edits`
  （`workers/execution/src/index.ts:6403-6406`），参考图是以 **URL** 形式交给 OpenAI 让它自己去拉的。
  这次没炸是因为 R2 的 Content-Type 头是对的；但任何按扩展名判类型的下游（含未来换的 provider）
  都会在这里踩空，而且报错会长得像「参考图无效」，排查方向完全错。
- 顺带：`.png` 后缀让人以为存的是无损 PNG，实际空间占用/画质预期都对不上。

**建议**　`generateStorageKey` 的 IMAGE 分支照 VIDEO/AUDIO 的样子用 `mediaFormat`
（`png` / `jpg` / `webp` / `gif`），调用方把已经探到的 `trustedMimeType` 映射后传进去。
改动面小：`r2.ts` 一个分支 + `upload-image.service.ts` 一处传参。

---

## BI · seed 与 snapshot 双双为 null——这两张图**复现不了**

**现象**　两条生成落库后 `Generation.seed = null`、`Generation.snapshot = null`。
NovelAI 那条尤其刺眼：seed **确实存在**，是 worker 自己 `randomUint32()` 摇出来的，
摇完用完就丢，从没往回传过。

**复现**　跑任意一条图片生成，读 `GET /api/studio/generate/status?jobId=...`
返回的 `generation.seed` / `generation.snapshot`。

**证据**

- `workers/execution/src/index.ts:6258-6262`：NovelAI 分支
  `const seed = configuredSeed ?? randomUint32()`，写进 `parameters.seed` / `extra_noise_seed`。
- 同文件 `:6353`：NovelAI 返回 `return { ...uploaded, ...dimensions }`
  ——`WorkerImageGenerationResult` 明明有可选的 `providerMetadata`（`:5150`），**没填**。
  seed 到此为止。
- `grep -n snapshot src/services/image/submit-image.service.ts` → **零命中**；
  `grep -rn snapshot src/services/image/*.ts`（去掉 test）→ **零命中**。
  图片提交链路上没有任何地方写 `snapshot`。
- 而复现功能是**从 snapshot 里读 seed 的**：
  `src/services/generation-replay.service.ts:88`
  `pickNumber(snapshot, 'seed') ?? pickNumber(advancedParams, 'seed')`。
- `GenerateRequestSchema`（`src/types/index.ts:435-460`）里也**根本没有 snapshot 字段**——
  也就是说这不是「我用 API 直调所以少传了」，产品 UI 走同一个 schema，同样传不了。

**影响**　「再来一张一样的」「用全部参数复现」这类诉求在图片域**结构上做不到**：

- NovelAI 每次都是新随机 seed，同提示词同参考图也出不来同一张；
- `generation-replay.service` 对图片生成永远读到空 snapshot，只能降级。

这次对照实验就吃了这一口：如果 owner 想拿同一个 seed 换个 referenceStrength 再跑一次做 A/B，
**做不到**——只能重摇。

**建议**　最小改法是让 worker 把用掉的 seed 塞进 `providerMetadata` 回传，
finalize 时写进 `Generation.seed`（字段本来就在，`generation.service.ts:88, 186, 429`）。
snapshot 是更大的一坨，另议。

---

## BJ · 图片工作台没有「参考强度」控件，而它恰恰是这次结果的决定性变量

**现象**　`/zh/studio/image` 的参数区**没有任何参考强度控件**。
NovelAI 这条线路参考图是走 img2img 的，强度就是「听参考图还是听提示词」的总开关，
用户看不见也改不了，只能吃默认值。

**复现**　`/zh/studio/image` → 选 `nai-diffusion-5-full` → 挂一张参考图 → 找参考强度滑杆。

**证据**

- `src/constants/provider-capabilities.ts:96, 101`：NOVELAI **声明了** `referenceStrength`
  能力，范围 `0.01–0.99`、默认 **0.7**；`:105` 声明 `referenceImageMode: 'img2img'`。
- 全仓 `referenceStrength` 的**渲染消费者只有两处**：
  `src/components/business/ArenaForm.tsx:488`（经 `CapabilityForm`）
  与 `src/components/business/studio/lora/LoraReferenceImageCards.tsx:203`。
  `src/components/business/studio/` 下**没有** `StudioImageParams` 这类图片参数面板。
- 默认值怎么落到 provider：`workers/execution/src/index.ts:6300-6304`
  `parameters.strength = invertReferenceStrength(referenceStrength ?? 0.7)`，
  而 `invertReferenceStrength` 是 `1 - x`（`:4541-4543`）→ **NovelAI 实收 `strength = 0.30`**。
  0.30 的去噪量意味着**画面基本就是参考图本身**。

**影响**　本次实跑的直接后果：NovelAI 那张几乎是参考图的复印件
（棕色短发、米白外套、抱着黑色书、棕靴全部原样保留），1470 字的提示词
**一个视觉要素都没进去**——没有粉发、没有精灵耳、没有蓝水晶剑、没有夸张透视。
从「模型能力对比」的角度这是**假结论**：不是 NovelAI 听不懂提示词，
是产品把它锁在了 0.30 去噪上。用户看到的是「NovelAI 不听话」，真相是「产品没给旋钮」。

**顺带一个口径问题**　`referenceStrength` 的语义在两层是**反的**：
产品侧 0.7 = 强参考，NovelAI 侧 `strength` 0.3 = 弱改动。中间靠 `invertReferenceStrength` 翻译。
真要把滑杆放出来，文案得写清楚是哪一头，否则「强度调高 = 更像参考图」还是「更听提示词」
会是个长期误解源。

**建议**　图片工作台参数区接上 `CapabilityForm`（Arena 已经在用，零新组件），
按当前模型的 capability 声明动态出滑杆；至少在挂了参考图且模型是 img2img 语义时露出来。
`provider-capabilities.ts:90-105` 里 NOVELAI 该有的都有了——
`referenceStrength` 在能力清单里（`:96`）、范围默认值在（`:101`）、
`maxReferenceImages: 1`（`:102`）、`referenceImageMode: 'img2img'`（`:105`）——
**数据全在，只差一个渲染位**。

⚠ 同一段 `:95` 还声明了 `seed` 能力，图片工作台同样没有入口——
与上面 BI 那条是一个问题的两面：**seed 既传不进去，也存不下来**。

---

### 附 BG–BJ · 没踩到的坑（记一笔，省得下次重查）

- **并发上限**（`MAX_ACTIVE_JOBS_PER_USER = 4`，先查后写竞态）：本次严格串行，两条都一次过，没触发。
- **413 / base64 参考图**：参考图走 `/api/upload-image` 换成 https URL 再挂，
  请求体只有 1.6KB，完全绕开了账本里那条「请求体里有 base64 图 → 413」。
  这条路值得当**推荐姿势**写进文档：**参考图先上传拿 URL，别塞 base64**。
- **库里 width/height 是请求值不是实到值**（账本 Y/AM）：本次两条**恰好一致**，
  因为 OpenAI 分支的尺寸是 worker 自己从 size 表算出来再回填的，NovelAI 分支同理。
  这不代表那条账本失效——它防的是 provider 自作主张改尺寸的场合。

---

<!-- BK–BO：视频幕四张代表帧那一轮（原 VF-1…5）。 -->

## BK ⭐ 视频作品的 width/height 是**图片比例表的常量**——既不是请求值，也不是实到值

**现象**　四条不同线路、三种不同实到分辨率的视频，库里记的宽高**一模一样**都是
`1792×1024`。而 `1792 / 1024 = 1.75`，连 16:9（1.7778）都不是。

| 模型                          | 请求的 resolution    | 库里 width×height | 文件实际      |
| ----------------------------- | -------------------- | ----------------- | ------------- |
| Seedance 2.0 Fast（BytePlus） | `720p`               | 1792×1024         | **1280×720**  |
| MiniMax H3（CN）              | `2k`                 | 1792×1024         | **2560×1440** |
| HappyHorse 1.1（fal）         | `720p`               | 1792×1024         | **1280×720**  |
| Kling V3 Pro（fal）           | 无（模型固定 1080p） | 1792×1024         | **1920×1080** |

**复现**　`POST /api/generate-video`，`aspectRatio:'16:9'` + 任意 `resolution`，
完成后读 `GET /api/generate-video/status?jobId=…` 返回的 `generation.width/height`，
再 `ffprobe` 产物文件对照。

**证据**

- `src/services/generate-video.service.ts:239-240`：

  ```ts
  const { width, height } =
    IMAGE_SIZES[input.aspectRatio] ?? IMAGE_SIZES['16:9']
  ```

  取的是 **`IMAGE_SIZES`**——`src/constants/config.ts:66-72` 的**图片**尺寸表，
  `'16:9': { width: 1792, height: 1024 }`。整个表达式里没有 `input.resolution`。

- 同一写法在 `src/services/video-pipeline.service.ts:802-803` 又出现一次。
- 这两个值随后原样进 `providerInput.width/height`（`generate-video.service.ts:305-306`），
  再由 worker 落库（`workers/execution/src/index.ts:2454` `width: context.providerInput.width`）。

**与既有条目 Y / AM 的关系**　Y 和 AM 记的是「库里是**请求值**不是实到值」。视频这条更糟一档：
**连请求值都不是**。用户选 480p / 720p / 1080p / 2K，落库都是同一个 1792×1024，
这个数字只跟 `aspectRatio` 有关，而且它来自图片域的表。

**影响**

- 作品详情页对**所有** 16:9 视频展示同一个错误分辨率，2K 与 480p 看起来一样。
- 任何依赖这两列的下游（网格布局比例、「原片 2K」之类标示、导出预估、素材库排序）全错。
- 首页素材归属这类核对工作没法用库里的数字，只能逐个 `ffprobe`——本轮就是这么做的。

**建议**　落库前用产物真实尺寸覆盖。视频这边 worker 已经把文件下下来过一次，
拿 `ffprobe` 式的元数据或 provider 回包里的尺寸字段都比现在这个常量强。
最低限度：至少让它跟着 `resolution` 走，别再从**图片**表里取。

---

## BL 视频的 duration 同样是请求值，实到最多差 0.46 秒

**现象**　库里 `duration` 直接是请求里那个整数，产物实际时长与它对不上。

| 模型              | 库里 | 实际       | 差         |
| ----------------- | ---- | ---------- | ---------- |
| Seedance 2.0 Fast | 4    | 4.042s     | +1.0%      |
| MiniMax H3        | 4    | **4.459s** | **+11.5%** |
| HappyHorse 1.1    | 3    | 3.163s     | +5.4%      |
| Kling V3 Pro      | 3    | 3.042s     | +1.4%      |

**影响**　按秒计费的模型（四个全是）用这一列估价会系统性低估；
时间轴/拼接类功能（成片拼段、字幕对齐）拿这个数会累积错位。MiniMax 一条就差半秒。

**建议**　与 BK 一起改：落库时以产物为准。这是同一个「不回头看产物」的病。

---

## BM ⭐ `generateAudio: false` 在 HappyHorse 和 MiniMax H3 上是**死开关**

**现象**　四条请求**全部**显式传 `generateAudio: false`。结果：

| 模型                          | 是否有音轨           | 实测                                            |
| ----------------------------- | -------------------- | ----------------------------------------------- |
| Seedance 2.0 Fast（BytePlus） | ✅ 无音轨            | 关掉了                                          |
| Kling V3 Pro（fal）           | ✅ 无音轨            | 关掉了                                          |
| HappyHorse 1.1（fal）         | ❌ **有 AAC 立体声** | mean −27.9 dB / max −3.9 dB（真声，不是静音轨） |
| MiniMax H3（CN）              | ❌ **有 AAC 立体声** | mean −19.2 dB / max −3.4 dB                     |

**复现**　`POST /api/generate-video`，body 里带 `generateAudio: false`，
模型选 `happyhorse-1.0` 或 `minimax-h3-cn`。产物 `ffprobe -select_streams a` 有流。

**证据**——两个 builder 都**根本不读这个字段**：

- `workers/execution/src/models/fal/video-request-builders.ts:338-370` `buildHappyHorse10()`
  组装的 body 只有 `prompt` / `resolution` / `duration` / `aspect_ratio`（或 `image_url`）。
  同一个文件里 Wan 3.0（`:391`）、Seedance（`:275` `:316` `:502` `:554` `:582`）、
  Kling（`:718`）**全都**有 `providerInput.generateAudio ?? …` 这一行，唯独 HappyHorse 没有。
- `workers/execution/src/models/minimax/video-request-builder.ts` 全文没有 `generate_audio`
  这个键（只有参考音频 `audio_url` / `role:'reference_audio'`，`:127-131`）。

**顺带**　`src/constants/models/video.ts` 给 `HAPPYHORSE_10`（`:63-66`）和四条 `MINIMAX_H3*`
（`:520-523` 等）都声明了 `videoDefaults.generateAudio`，这些声明对这两个模型**是死配置**——
读它的那一行不存在。看代码会以为开关是通的。

**影响**

- 用户要一条无声片子（自己配音轨 / 后期铺 BGM）在这两个模型上做不到，且**界面不会告知**。
- 反过来也一样：想要原生出声的用户以为自己关得掉、开得开，实际全程吃 provider 默认。
- 台账 A 的结论（「工作台没有 `generateAudio` 开关，最终值吃模型目录默认」）在这两个模型上
  还要再退一步：**就算把开关补上去，这两条线也不会有任何反应**。补 UI 之前得先补 builder。

**建议**　`buildHappyHorse10` 补 `generate_audio`（fal 的 happy-horse v1.1 端点有这个入参）；
MiniMax builder 按官方 `video_setting` 补。若某条线上游确实没有这个入参，
那就在 `VIDEO_MODEL_CAPABILITIES` 里显式标出来，让 UI 把开关藏掉，而不是留一个假开关。

---

## BN 视频缩略图只有一条线出得来

**现象**　四条同批次生成，只有 Seedance（BytePlus）那条有 `thumbnailUrl`，
另外三条 `thumbnailUrl` / `thumbnailStorageKey` 全是 `null`。

| 模型                          | thumbnailUrl                                    |
| ----------------------------- | ----------------------------------------------- |
| Seedance 2.0 Fast（BytePlus） | ✅ `…thumbnail.webp`（实测 HTTP 200，25,356 B） |
| MiniMax H3（CN）              | ❌ null                                         |
| HappyHorse 1.1（fal）         | ❌ null                                         |
| Kling V3 Pro（fal）           | ❌ null                                         |

**与既有条目 I 的关系**　I 记的是「素材库网格里有空白格（视频素材零缩略图）」。
本轮实测把它修正得更准：**不是零，是按线路分化**——Ark/BytePlus 那条能出，
fal 和 MiniMax 两条不能。也就是说生成缩略图的能力**已经在管线里**，只是没铺到全部线路。

**影响**　素材库 / 画廊里同一批视频，一部分有封面一部分空白，看起来像随机故障。

**建议**　顺着 BytePlus 那条已经能出缩略图的路径找到落点，铺到另外三条线；
或者在落库后统一补一次（视频文件已在 R2，抽首帧的成本很低）。

---

## BO Seedance 声明支持 seed，实际 seed 回写是 null——这条片子复现不了

**现象**　四条里只有 HappyHorse（fal）把 provider 分配的 seed 写回来了（`504422155`），
Seedance（BytePlus）是 `null`。

| 模型                         | `videoModelSupportsSeed()` | 落库 seed        |
| ---------------------------- | -------------------------- | ---------------- |
| `seedance-2.0-fast-byteplus` | **true**                   | ❌ null          |
| `happyhorse-1.0`             | true                       | ✅ 504422155     |
| `minimax-h3-cn`              | false                      | null（符合预期） |
| `kling-v3-pro`               | false                      | null（符合预期） |

**证据**　`src/constants/video-model-capabilities.ts:27-43` 的 `SEED_CAPABLE_SEEDANCE`
明确含 `AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS`——UI 会给这个模型显示 seed 控件。
HappyHorse 那条能写回，说明「把 provider 回的 seed 落库」这条路是通的，只是 Ark 线没接。

**影响**　用户看得到 seed 控件，生成完却拿不到 seed → 这条视频**再也复现不出来**。
与既有条目 AX（「Runner 出的图 seed 永远是 null」）同一类病，换了个域。

**建议**　Ark（火山 / BytePlus）回包里如有 seed 就落库；确实没有的话，
就在提交时**自己生成**一个 seed 传下去（`SEED_CAPABLE_SEEDANCE` 说明上游接受这个入参），
这样至少参数是可复现的。

---

---

<!-- BP–BR：LoRA 幕六张底模封面那一轮（原 LB-1…3）。 -->

## BP · RunPod 把 job 丢了，用户看到的是「模型不可用」

**现象**　Comfy Runner 的一次出图请求在 `IN_PROGRESS` 上挂了 **11 分 05 秒**，然后失败。
失败原文是 RunPod 的 `job not found`，而应用给它盖的错误码是
**`model_unavailable`**——按 `src/messages/*.json` 那会渲染成「模型不可用 / 该模型当前不可用」。
底模从头到尾都是可用的（同一个 endpoint 十几分钟后就正常出了图），丢的是那一条 job。

**复现**

1. `POST /api/generate`，`modelId: 'illustrious-recipe-clone'`（WAI-Illustrious-SDXL v15.0，
   Comfy Runner / RunPod），`aspectRatio: '3:4'`，`advancedParams.runnerWidth/Height = 864/1152`。
2. `GET /api/studio/generate/status?jobId=<id>` 每 6 秒轮询一次。
3. 前 11 分钟一直返回 `IN_PROGRESS`（与正常冷启动**完全无法区分**），随后一次返回
   `{"status":"FAILED","error":"job not found","errorCode":"model_unavailable"}`。

**证据**

- 本轮真实 job：`jobId 9c9c9bcd-5494-46bd-be7f-bef3f263cdf1`，`modelId illustrious-recipe-clone`，
  提交到失败 **665 672 ms**；同一轮同一 endpoint 的后续请求正常出图，
  `GET /api/runner/usage` 全程 `{"enabled":true,"used":66,"limit":300,"platformEnabled":true}`
  ——不是月度额度、也不是平台总闸。
- 消息来源：`workers/execution/src/index.ts:5963-5996`（`pollRunnerImageJob`）把 RunPod
  `/status/{jobId}` 响应里的 `error` 字段**原样透传**成失败原因，不加任何前缀。
- 误判位置：`src/constants/generation-errors.ts:238-240`

  ```
  { pattern: /model.*unavailable|not\s*found|\b502\b/i,
    code: GENERATION_ERROR_CODES.MODEL_UNAVAILABLE }
  ```

  `job not found` 命中 `not\s*found` → `model_unavailable`。**「job 丢了」和「模型没了」
  是两件事**，这条正则分不出来。

- ⚠ 同一个文件 `:241-252` 已经为**完全同一类错误**写过一段事故记录：曾有一条
  `/credit|limit\s*reached|quota|exceeded/i` 兜底，把 Runner 的
  `exceeded max body size of 10MiB` 说成「今日免费额度已用完」，2026-08-24 删掉并写下
  「用它兜底等于随机说谎」。`not\s*found` 是同一个形状的问题，只是还没被删。

**影响**

- 用户被告知「模型不可用」，于是会去换模型 / 以为底模下线——**唯一正确的动作（重试）
  反而不会做**。这一批六张封面里就有一张因此白等 11 分钟。
- 与台账 BA 叠加更糟：RunPod 冷启动本来就要 ~10 分钟且全程 `IN_PROGRESS`，所以
  「正在冷启动」和「这条 job 已经死了」在 UI 上**没有任何可区分的信号**，只能等到
  11 分钟后看错误码——而那个错误码还是错的。

**建议**（都不涉及新架构）

1. 把 `job not found` 从 `MODEL_UNAVAILABLE` 里摘出去，给它一个「任务丢失 · 可直接重试」
   的码；或者最低限度，把上面那条正则从 `not\s*found` 收紧成
   `model\s+not\s+found|version\s+not\s+found` 之类**带主语**的形状——照 `:241-252`
   那段已有的判例办。
2. runner 透传上游消息时加 provider 前缀（`RunPod: job not found`），别让上游的裸句子
   直接进正则分类器——分类器不知道这句话在说谁。

---

## BQ · Replicate 线的出图尺寸写死，用户与调用方都改不了（同一张 3:4，比 runner 线少 35% 像素）

**现象**　同一条请求（`aspectRatio:'3:4'`），走 Comfy Runner 的五个底模出的是 **864×1152**，
走 Replicate 的 `illustrious-xl` 出的是 **768×1024**——少 35% 像素。而 `768×1024` 既不是
调用方选的，也**没有任何参数能改**。

**复现**　`POST /api/generate`，`modelId:'illustrious-xl'`，`aspectRatio:'3:4'`，
`advancedParams` 里塞 `runnerWidth/runnerHeight`（或任何尺寸字段）→ 出图恒 768×1024。

**证据**

- `workers/execution/src/index.ts:5447-5456`：Replicate 的 `sdxl` schema 分支里
  `width/height` **只**来自 `getStandardImageDimensions(aspectRatio)`，没有 override 入口；
  能覆盖的只有 `negative_prompt / cfg_scale / steps / seed / loras`。
- `workers/execution/src/index.ts:5089-5105`：`getStandardImageDimensions` 是一张写死的表
  —— `3:4 → 768×1024`、`16:9 → 1792×1024`、`1:1 → 1024×1024`。
- 尺寸旋钮 `runnerWidth / runnerHeight` 在 schema 上就标着 runner 专用
  （`src/types/index.ts:239-241`「Runner-only source generation dimensions」），
  Replicate 侧根本不读。
- 本轮实测：`illustrious-xl` 出 **768×1024**（generation `d0cbd2b5-…`），
  同轮 runner 五张全是 **864×1152**。

**影响**

- `illustrious-xl` 是**面向用户、`supportsLora:true`** 的正式模型，不是内部档。它是 SDXL 系，
  SDXL 的 3:4 原生 bucket 就是 864×1152；**产品主动要了一个偏离 bucket 且更小的尺寸**，
  等于白扔分辨率。
- owner 2026-08-30 刚定「背景素材不要压缩清晰度、出图多大就落多大」——这条口径下，
  「有的线能出 864×1152、有的线卡在 768×1024 且不可调」直接决定素材上限。
- 同一张表还管着别的走 `getStandardImageDimensions` 的路径，不止 Replicate 一家。

**建议**　让 Replicate 的 sdxl 分支吃一个通用的尺寸覆盖（不必复用 runner 专用字段名），
或者至少把 `3:4 / 4:3` 两档改成 SDXL 原生 bucket（864×1152 / 1152×864）。

---

## BR · `recommendedPositivePrefix` 是个没有消费者的字段，而它的注释在承诺行为

**现象**　`src/constants/runner-checkpoints.ts` 给 Pony 声明了
`recommendedPositivePrefix: 'score_9, score_8_up, score_7_up'`，字段注释写的是
**「Prefixed onto the positive prompt for checkpoints with quality-tag conventions」**。
实际上**全仓没有任何一处读它**——那三个 score 触发词从来没有被自动加上过，
用户不自己打就是没有。

**复现**　`rg recommendedPositivePrefix`（全仓，含 `workers/`）→ 只有两处命中，
都在 `src/constants/runner-checkpoints.ts`：`:42` 的类型声明和 `:77` 的取值。零消费者。

**证据**

- `src/constants/runner-checkpoints.ts:41-42` 注释 + 声明；`:77` 唯一取值。
- `workers/execution/src/models/runner/request-builder.ts:120-128` 是真正拼工作流的地方：
  它从 manifest 只取 `filename / recommendedSampler / recommendedScheduler / clipSkip`，
  positive prompt 直接用 `input.prompt` 原样传，**没有任何 prefix 逻辑**。
- ⚠ 顺带查出**两份 manifest 已经漂移**：文件头注释说 worker 侧
  `workers/execution/src/models/runner/checkpoints.ts` 是「kept in sync by hand」的等价副本，
  但那份的 Pony 条目（`:48-54`）**连 `recommendedPositivePrefix` 这个字段都没有**。
  也就是说这个字段只存在于 app 侧、且只被人读、不被机器读。
- 本轮实测旁证：Pony 那张封面的 score 触发词是我**手打进 prompt** 的；不打就不会有。

**影响**　Pony V6 XL 的出图质量对 `score_*` 触发词高度敏感，是它最出名的用法约定。
下一个照着「单一事实来源」读这份 manifest 的人（或 agent）会认为前缀已经自动加了，
于是不打——出图质量直接掉一档，而且**没有任何报错**。一个撒谎的 manifest 比没有更糟。

**建议**　二选一，别留中间态：① 在 `request-builder` 真的把 prefix 拼上去（同时补进 worker
那份 manifest）；② 直接删字段，把 score 约定写进模型目录的 UI 提示里。

---

<!-- BS–BX：图片幕三张封面那一轮（原 IC-1…6）。 -->

## BS ⭐ `aspectRatio:'16:9'` 只有传了 `advancedParams.resolution` 才可能是真 16:9；默认档三家给三种比例

**现象**　同一个请求参数 `aspectRatio:'16:9'`，三条线路的**实到**宽高比各不相同，
而且没有一条能保证等于请求值。

**复现**　`POST /api/generate`，`{prompt, modelId, aspectRatio:'16:9'}`，
产物用 sharp 实测（⛔ 不能看库里的 `width/height`，见 BT）：

| 线路                                    | 默认档实到  | 比例       | 传 `resolution:'4K'` 实到 | 比例       |
| --------------------------------------- | ----------- | ---------- | ------------------------- | ---------- |
| `gpt-image-2`（openai）                 | 1536 × 1024 | **1.5000** | 3840 × 2160               | **1.7778** |
| `gemini-3-pro-image-preview`（gemini）  | 1376 × 768  | 1.7917     | 5504 × 3072               | 1.7917     |
| `seedream-5.0-pro-byteplus`（byteplus） | 2560 × 1440 | **1.7778** | 2864 × 1600               | 1.7900     |

（16:9 = 1.7778）

**根因**　默认档走三张**手写尺寸表**——
`aspectRatioToOpenAISize()` / `getStandardImageDimensions()` / `getVolcEngineImageSize()`；
只有传了 tier 才走 `computeTieredDimensions()`（`workers/execution/src/index.ts:4292`），
那条路是**按宽高比算**的，所以 GPT 传 `'4K'` 就拿到了标准 3840×2160。
`tieredOpenAISize()`（`:4364`）自己的注释也写着「16:9 yields the exact standard 3840x2160」。

**影响**　既有账本 **AE**「GPT Image 2 选 16:9 实际出 3:2」**其实已经有解**——传 `resolution`
就绕开了——但 UI 上没有任何地方说这两条路的比例行为不一样，用户不会知道
「不选分辨率档 = 比例也跟着变」。反过来，Gemini 与 Seedream 在**传了 tier 之后
反而偏离 16:9**（1.7917 / 1.7900）。结论是：**当前没有任何一条路径能保证「我要 16:9
就一定拿到 16:9」**，凡是要求比例精确的用途（首页满幅封面就是）都必须落盘前实测再裁。

**建议**　① 默认档也走 `computeTieredDimensions()`，把三张手写表删掉（一次改到位，
不留旧表）；② 或者至少在 UI 的比例选择器旁标出该模型该档位的实到尺寸。

---

## BT ⭐ `Generation.width/height` 又错了 —— 这次 Gemini 差 1.8 倍像素（账本 Y / AM 再复现）

**现象**　库里记的尺寸与实到尺寸不符，且**只有 Gemini 这条线在说谎**。

**证据**（本轮四次生成，实到值一律 sharp 实测）

| 生成 id 前缀 | 模型                | 档位 | 库记 `width×height` | 实到            | 一致？          |
| ------------ | ------------------- | ---- | ------------------- | --------------- | --------------- |
| `1751e978`   | gemini-3-pro-image  | 默认 | 1792 × 1024         | **1376 × 768**  | ❌              |
| `1a5caf3d`   | gemini-3-pro-image  | 4K   | 4096 × 2304         | **5504 × 3072** | ❌ 差 1.8× 像素 |
| `57c84ca1`   | gpt-image-2         | 4K   | 3840 × 2160         | 3840 × 2160     | ✅              |
| `80066cb3`   | seedream-5.0-pro-bp | 4K   | 2864 × 1600         | 2864 × 1600     | ✅              |

**根因**　OpenAI / VolcEngine 两条线把算出来的尺寸**当成 `size` 参数发出去**，所以记的数
就是真的；而 Gemini 这条线 `tieredGeminiDimensions()`（`workers/execution/src/index.ts:4385`）
算出来的数**只用于记账**，真正发给 Google 的只有 `imageConfig.imageSize = '4K'` 这个字符串
（`:5175`），Google 返回多大完全不受那个数控制。

**影响**　账本 Y 的结论继续成立，且**可以精确到一条线**：Gemini 的尺寸列是纯猜的。
任何按尺寸筛选/排序/计费/展示的地方都会错。

**建议**　与账本 Y 的修法一致——落库前用 sharp 实测（`image-edit.service.ts:82` 有现成写法）。
最小改动是只修 Gemini 分支，因为另外两条线的记账恰好是准的。

---

## BU ⭐⭐ 模型站封面有三道「看不见的减法」，但素材规格里一个数字都没写

**现象**　`_manifest.md` 与 `HOME_V4_STATIONS` 对封面的全部要求就是
「16:9 满幅、主体偏右」（`home-v4.css:2740` 附近的注释也是这么写的）。
但一张封面贴上去之后，实际能被看到的只是它的一小块。

**真机实测**（`/zh` → 模型阵容 → 图片幕 GPT Image 2 卡，视口 1920×855，DPR 1）

| 减法                         | 实测值                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| ① `object-fit: cover` 纵向裁 | `.m-bg` 是 `inset:-4%` → 2074×923；16:9 源被放大 1.35026 倍成 2074×1167 → **纵向只有中间 73.3%（13.37% ~ 86.63%）在屏幕上**          |
| ② `.veil` 压暗左半           | `linear-gradient(96deg, rgba(0,0,0,.34), transparent 52%)` + 底部 `linear-gradient(0deg, rgba(0,0,0,.3), transparent 34%)`           |
| ③ 左栏两块板遮挡             | `.m-glass` rect **(80, 316, 500, 230)** + `.m-strip`（强在哪/弱在哪）rect **(80, 558, 500, 233)** → 合计遮住 x∈[80,580]、y∈[316,791] |

⚠ ③ 里的 **`.m-strip` 一直没被提过**——先前的口径只说「左边有个 500px 身份板」，
实际是**上下两块**，纵向一起吃掉 55% 的高度。

**① 随窗口高度变**（同一张 16:9 封面）：

| 视口高 | 可见纵向区间    | 可见比例 |
| ------ | --------------- | -------- |
| 855    | 13.37% ~ 86.63% | 73.3%    |
| 930    | 10.13% ~ 89.87% | 79.7%    |
| 975    | 8.20% ~ 91.80%  | 83.6%    |
| 1000   | 7.13% ~ 92.87%  | 85.7%    |
| 1080   | 3.70% ~ 96.30%  | 92.6%    |

**没有任何一个窗口高度能看到整张图**——因为 `.m-bg` 的 `inset:-4%` 本身就吃掉 4%。

**代价（本轮实测）**　GPT Image 2 那张为此**连废两版**：

- v2：提示词要求「上下各留 12%」，出来的排版块高 **874px**，而 3:2 出图裁到 16:9 后
  可用高只有 **864px**——**物理上装不下**，怎么裁都会切到字。
- v3：改成「中间 68%」，落盘后真机上主标题「字的」被切掉一半（实拍 `ss_1369lva52`），
  只剩「重量」。
- v4：改成「上下各留 20%、排版压进中间 60%」，并改用 `resolution:'4K'` 拿到原生 3840×2160
  才通过（实拍 `ss_9870hbflo`）。

**影响**　这条不只坑本轮。凡是「按 16:9 满幅、主体偏右」交付的封面，作者都不知道
**纵向还要再让出 27%**——已上线的其它封面大概率也有被切掉的元素，只是没人去核。

**建议**　`_manifest.md` 的素材规格补一行硬指标：
**「所有必须被看见的元素，落在画面中间 73% 高度 × 右侧 55% 宽度之内；
左侧 x∈[4%,30%]、上下各 13.4% 视为不可用区」**，并把 `.m-glass` / `.m-strip`
的 500×230 / 500×233 一并写进去。
本轮用的精确重放脚本（按真机几何逐像素重算 veil + 两块板 + object-fit 裁切）在
`C:/tmp/img-covers/mask.mjs`，产物 `masked-preview.png`——值得固化成一个校验工具。

---

## BV Seedream 5.0 在 4K 档中文字形明显退化，2K 默认档反而全对

**现象**　同一条提示词、同一模型（`seedream-5.0-pro-byteplus`），只多传一个
`advancedParams.resolution:'4K'`，中文就开始出错。

**证据**

| 档位                         | 实到        | 落款「丙午年 秋分 于 安亭茶室」   | 朱文印「安亭」  | 重影                                    |
| ---------------------------- | ----------- | --------------------------------- | --------------- | --------------------------------------- |
| 默认（2K）`e1594756`         | 2560 × 1440 | ✅ 全对                           | ✅ 两字笔画正确 | 无                                      |
| `resolution:'4K'` `80066cb3` | 2864 × 1600 | ❌ 漏字成「于安茶」（丢了「亭」） | ❌ 上字不成字   | ❌ 同一句多出一列半透明重影「安亭茶室」 |

**影响**　与模型站上写给用户的强项「**10+ 语言原生文字，中文最稳**」
（`Homepage.v4.models.seedream.plus.1`）冲突——**至少在 4K 档不成立**。
用户按页面上的说法去做「中文海报 + 高分辨率」，会拿到错字。

**顺带**　2K 档也不是每次都干净：同一条加了安全区约束的提示词在 2K 重跑一次
（`28b37b2b`），底部「ANTEI · 茶事 · 第七帖」被排了两遍（第二遍错位且糊），
壶盖还脱离壶身单独放在桌上。**重复/重影是这条线的高频失败模式**，
在提示词里显式写「每句只出现一次、不要半透明重影」有帮助但不保证。

**建议**　① 参数区给 Seedream 的 4K 档加一句提示（「4K 档中文字形不稳，做文字海报建议用 2K」）；
② 或者干脆不给它开 4K。

---

## BW 图片生成没有「按 jobId 查状态」的端点，而视频 / 音频 / 3D 都有

**现象**　`POST /api/generate` 返回 `{ jobId, requestId }`，但 **`jobId ≠ Generation.id`**
（实测 job `fda3a841-…` → generation `f12baf4f-…`，两个 uuid 完全无关），
而且**没有任何端点接受 jobId**。

**证据**

- `src/app/api/generate-video/status/`、`generate-audio/status/`、`generate-3d/status/`、
  `generate-long-video/status/`、`generate-multiview/status/` 都在；
- `src/app/api/generate/` 下**没有 `status/`**（`find src/app/api -type d -name status` 实证）。
- 既有账本已知 `GET /api/generations` 是 404（见记忆 `reference-verify-generation-locally`）。

**影响**　确认一次图片生成结果的唯一办法是拉 `/api/images?mine=1&sort=newest` 列表，
再**按 prompt 前缀猜哪条是自己的**。本轮三个 agent 并发跑生成，列表里混着别人的作品；
更糟的是同一 agent 连发多版同一提示词时（本轮 GPT 出了 4 版）前缀完全相同，
只能靠 `createdAt` 排序赌最新那条——**这是脆的，且随并发数变脆**。

**建议**　加 `GET /api/generate/status?jobId=`，与另外四种模态对齐；
或者更省事：让 `POST /api/generate` 直接把 `generationId` 一起返回。

---

## BX 提交生成期间 dev 首页整体掉进错误边界（低置信 · 环境有混淆）

**现象**　在模型站翻页时，三个打开着 `/zh` 的标签页**同时**掉进
「出了点问题 / 发生了意外错误，我们已经收到通知。」的错误边界（实拍 `ss_5279ktyas`），
随后自行恢复，`read_console_messages` 抓不到任何 error。

**混淆项**　本轮同时有三个 agent 在跑生成并写 `public/`，dev server 一直在重编译；
既有记忆里已有两条同类环境坑（`reference-hmr-router-action-before-init`、
`reference-turbopack-stuck-compile-error`）。**很可能只是 dev/HMR 的重编译窗口，不是产品 bug。**

**记一笔的理由**　错误边界文案说「我们已经收到通知」，但这是 dev 本地，
没有任何 request id / 错误码给用户或开发者，控制台也是空的——
**真发生在生产时，这条信息量为零**（与账本 AC 是同一个问题的另一处发作）。

---

## 附记 · 不是缺陷，但要 owner 知道的一个数

owner 2026-08-30 定「作为背景的素材都不要压缩清晰度」，本轮据此按**原生分辨率 + 近无损**落盘：

| 文件                           | 尺寸        | 体积                                     |
| ------------------------------ | ----------- | ---------------------------------------- |
| `model-gpt-image-2.jpg`        | 3840 × 2160 | 2.41 MB                                  |
| `model-gemini-3-pro-image.jpg` | 5461 × 3072 | 5.68 MB                                  |
| `model-seedream-5.jpg`         | 2560 × 1440 | 0.41 MB（provider 原字节直落，零重编码） |

三张合计 **8.5 MB**（原来三张合计约 0.92 MB）。
⚠ 与之相关的既有事实：项目**全局关掉了图片优化**（`images.unoptimized: true`，
见记忆 `reference-next-image-unoptimized-global`），所以这些字节是**原样发给浏览器**的，
`sizes` / `srcset` / `quality` 全是死配置。图片幕一共 7 张封面，全按这个规格重出的话
首页这一幕的图片体积会到几十 MB 量级。**这是 owner 的取舍，只报数不改。**

---

---

<!-- BY–CA：助手操作员化 P1（后端工具环）实装时挖出，2026-08-30。 -->

## BY · 素材库检索只有 prompt 的 `contains` 模糊匹配——中英文错配即零命中

**现象**　助手的 `search_assets` 复用 `buildGalleryWhere`，唯一的匹配手段是对 `prompt`
字段做子串包含。没有语义检索、不搜模型名、不搜标签。

**影响**　用户用中文让助手找参考（「找张赛璐璐立绘」），而库里的 prompt 多是英文
（本仓生成链路的常态）——**一条都搜不到**。「素材库检索挂载」是助手操作员化的半条命，
这条不解，助手在真机上会显得很笨。

**建议**　短期给 `search_assets` 建关键词映射/双语扩展；长期上向量检索。P3 联网搜图
落地前先量一下真实命中率。

## BZ · LLM 网关层没有原生 tool-calling

**现象**　`LlmTextInput` 无 `tools` 字段，gateway 与 BYOK 两条路都不支持工具调用。

**影响**　助手工具环只能「每步一次 strict-JSON 补全」，maxSteps=8 最坏 8 次完整往返
——延迟与 token 都翻倍数。所有后续 agent 化功能（画布助手同理）共享这个天花板。

**建议**　给 LLM 层补原生 tool-calling；工具环的形状可不变、只换执行器（P1 有意按此设计）。

## CA · `llmTextCompletion` 不接受 AbortSignal——打断只能拦「下一步」

**现象**　打断信号只在步与步之间检查；在飞的那次补全会跑完再被丢弃（await 出来的，
非悬空 promise，但 token 白烧）。

**影响**　「插话即转向」的响应粒度被钉在单步耗时上；步骤越长打断越钝。

**建议**　`LlmTextInput` 加 `signal` 透传到 fetch 层。独立小改，谁先碰谁顺手做。

---

## 成果（说明这些缺陷不是"跑不起来"）

尽管有上面这些坑，**链路本身是通的**：2026-08-29 用画布一次跑出了
**30.04 秒 / 1280×720 / 带音轨**的成片，7 个参考素材 **0 dropped**，五个时间段的分镜
全部按序落地。缺陷清单是给「顺不顺手」打分的，不是给「能不能用」打分的。

---

## 待补

- 生产过程中新踩的坑继续往下追加。
