# 画布视频域整理 — 首尾帧 / 命名 / 模式 / 节点（2026-08-08）

> **这篇是整理不是设计。** 产出是「已钉死的现状事实 + 命名统一表 + 三档模式定义」，供 owner 确认后才进设计与施工。按设计治理硬门禁，本轮不改代码。
>
> **起因**：owner 2026-08-08 提出三个问题——① 画布的「关键帧」是不是 Seedance 说的首尾帧 ② 每个视频模型参数都不一样，怎么让用户分辨 ③ 节点是不是很乱、该删该加。外加前端模型分类要做成通用组件。
>
> **执行顺序**（owner 确认）：钉首尾帧 → 本文档（命名表 + 三档定义）→ 再谈通用组件怎么切。
>
> ⚠ 本文出自规划会话，实修在别的会话。凡标「建议」的都是建议不是定论。

## 1. 首尾帧：事实已钉死

**答案：一张。首尾帧在整条链路上从未实现。** owner 08-08 拍板**补上**。

五层链路（全部本地实读）：

| 层              | 位置                                                                                                                                                   | 首尾信息的状态                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| ① 画布 UI       | `NODE_STUDIO_REFERENCE_ROLES`（`constants/node-studio.ts:362`）含 `frameStart` / `frameEnd`                                                            | ✅ 能标注「关键帧首」「关键帧尾」                                                              |
| ② 图判定        | `isKeyframeNode()`（`lib/node-workflow-graph.ts:102`）                                                                                                 | ❌ **只返回 boolean，首尾区别在这里被丢弃**；消费点 :353 也是一股脑 push                       |
| ③ 能力声明      | `ReferenceSlotRole` 含 `first_frame` / `last_frame`，`ReferenceImageCapability` 有 `slotted` kind（`constants/reference-image-capabilities.ts:34-64`） | ⚠ **死代码**——注释标「Reserved for Step 3」，**零个模型声明 `slotted`**，唯一用例在测试文件    |
| ④ 发送契约      | `FIRST_FRAME_SLOTS = { images: 1 }`（`constants/video-model-send-plan.ts:51`）                                                                         | ❌ 只给一张的位置                                                                              |
| ⑤ worker 请求体 | volcengine builder（`workers/execution/src/models/volcengine/video-request-builder.ts:106-143`）                                                       | ❌ 单张 → `role:'first_frame'`；多张 → 全部 `role:'reference_image'`，**无 `last_frame` 分支** |

**实际后果**：用户把两张图标成「关键帧首 / 关键帧尾」，送到火山时被当作**多模态参考**发出，视频不会以第二张图结尾。

**三处代码自己就承认了**：

- builder 注释（:102）：「ark forbids mixing its three scenarios (first-frame i2v / **first+last frame** / multimodal reference)」——列了三种场景，只实现两种
- `reference-image-capabilities.ts:31`：`first_frame`/`last_frame` 标着「Step 3」，Step 3 从没做
- `node-studio.ts:395`：frameStart/frameEnd 是「原 frame role 退役后的替代信号」，作用是让 `isKeyframeNode` 认出这是关键帧——**本来就没打算区分首尾**

**上游是支持的**：火山与 BytePlus 全系模型能力表都有「图生视频-首尾帧」，官方文档有完整示例（`role:"first_frame"` + `role:"last_frame"`，两条 `image_url` 并列）。

### 1.1 一处概念混淆（可能是 Step 3 停在那的原因）

`reference-image-capabilities.ts:31` 把「Seedance `last_frame_chain`」和「Veo reference-to-video」并列当作首尾帧插值的例子。**但 `last_frame_chain` 不是首尾帧** —— 它是 `extensionMethod` 的取值（`constants/models/types.ts:32`），指**视频延长**时拿上一段的尾帧当下一段的首帧、链式接续。与「给首尾两张、模型补中间」是两个功能。概念在注释里就没分清，代码自然接不下去。

**整理建议**：这两个词从此分开——「**首尾帧**」只指同一次生成给首和尾两张；「**尾帧接续**」指延长时的链式拼接。

### 1.2 补上要动的四处（锚点，非定论）

⚠ 下面是「从这里开始查」不是「问题在这里」，每条都要执行会话自己确认：

1. **② 层要保住首尾信息** —— `isKeyframeNode` 是 boolean，不够用。从这里查：它的调用点（`node-workflow-graph.ts:353`）怎么把关键帧 push 进列表的，首尾顺序是否可以从 `imageCategory` 恢复。⚠ 别直接改 `isKeyframeNode` 的签名——27 处引用那类风险见 §5。
2. **④ 契约要能表达「首尾帧模式」** —— 且它与「多图参考」**互斥**（火山明说三种场景不能混）。现在 `referenceMode` 是三值枚举，首尾帧属于 `text-or-first-frame` 那一档的子形态还是第四个值，是设计选择。
3. **⑤ builder 加 `last_frame` 分支** —— 现有 `useReferenceMode` 判据是「图 >1 张 或 有视频/音频」，两张图会直接落进多模态参考。加首尾帧后这个判据要重写，别只加分支不改判据。
4. **③ 的 `slotted` 要么用起来要么删掉** —— 它已经死了很久，补首尾帧正好是它的用武之地；若最终不走它，就把死代码清掉，别留第三套并行概念。

⚠ **与 Seedance 2.5 的联动**：2.5 在首帧/首尾帧场景下 `ratio` **只能 `adaptive`**（见 `seedance-25-ga-integration-2026-08.md` §3.3b）。首尾帧做出来的同时会撞上这条。

## 2. 命名统一表

### 2.1 现状（i18n 实读，同一概念多处不一致）

| 概念                    | 出现位置                                                  | 现在的字                        |
| ----------------------- | --------------------------------------------------------- | ------------------------------- |
| 关键帧节点              | `nodeTypes.frameImage` · `addCatalog.items.imageKeyframe` | 关键帧                          |
| 关键帧的首/尾角色       | `node-studio.ts` 的 legend labels                         | 关键帧首 / 关键帧尾             |
| composer 里的同一类引用 | `videoComposer.refKind.keyframe`                          | **首尾帧**                      |
| 首页文案                | `Homepage.videoDemo.firstFrame`                           | 首帧                            |
| 火山/BytePlus 官方      | —                                                         | 图生视频-首帧 / 图生视频-首尾帧 |

**另外两处用户可见的不一致**（本次顺带查到）：

- `addCatalog.items.videoMerge` = 「视频**合成**」 vs `nodeTypes.videoMerge` = 「视频**合并**」——同一个节点，添加菜单和节点标题用了两个词
- `addCatalog.items.imageShot` = 「镜头图」 vs `videoComposer.refKind.shot` = 「镜头」

**一个孤儿键**：`addCatalog.items.collect` = 「收集」在三份 i18n 里都有，但 `canvas-add-catalog.ts` 里没有 `collect` 这个 intent。⚠ 是孤儿还是我漏看了别的写法，执行时 grep `CANVAS_ADD_INTENT_IDS` 全量核一遍再删。

### 2.2 建议统一为

| 概念                             | 建议用词                     | 理由                                                                               |
| -------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| 这一类引用 / 节点                | **关键帧**                   | 已是主用词，覆盖首帧与首尾帧两种形态                                               |
| 单张、作为开头                   | **首帧**                     | 与官方一致；「关键帧首」读起来像「关键帧的第一个」，实际意思是「作为首帧的关键帧」 |
| 两张、开头 + 结尾                | **首尾帧**                   | 与官方一致                                                                         |
| 结尾那张                         | **尾帧**                     | 同上                                                                               |
| 延长时的链式拼接                 | **尾帧接续**                 | 与「首尾帧」显式分开，见 §1.1                                                      |
| `videoComposer.refKind.keyframe` | 改成「关键帧」               | 它指的是这一类引用，不是特指两张                                                   |
| 视频合并/合成                    | 二选一，建议「**视频合成**」 | 两处对齐即可，选哪个都行                                                           |

## 3. 三档模式的用户视角定义

owner 的直觉（纯文本 / 可以参考视频 / 全能参考）与现有建模**同向**——`VideoReferenceMode` 已经是三值枚举，且与模型池一一对应。缺的只是用户视角的名字：现在这三个名字讲的是「怎么传参」。

| 现有枚举值（技术视角） | 建议对外名   | 用户能喂什么                                     | 落在哪些模型                                         |
| ---------------------- | ------------ | ------------------------------------------------ | ---------------------------------------------------- |
| `text-or-first-frame`  | **关键帧**   | 只写文字，或给 1 张首帧（补上首尾帧后可给 2 张） | Seedance 普通 · MiniMax H3 普通 · Kling · HappyHorse |
| `image-content-array`  | **多图参考** | 多张图，**不吃视频和音频**                       | Veo 3.1（3 张）· Gemini Omni（无公布上限）           |
| `multimodal-reference` | **全能参考** | 图 + 视频 + 音频                                 | Seedance Reference · MiniMax H3 Reference            |

⚠ **owner 原话的中间那档「可以参考视频」在当前模型池里分不出来**：能吃视频的只有 `multimodal-reference` 那两个，而它们同时也吃音频。所以「可以参考视频」与「全能参考」是同一批模型，三档要成立，中间那档必须改成「多图参考」。

**这三档同时解决了「怎么分辨视频模型」**：用户先选模式（我要怎么喂），模式再收窄可选模型，而不是先在十几个模型名里猜谁能吃视频。

## 4. 参数矩阵（`video-model-send-plan.ts` 实读）

「每个模型参数都不一样」是事实，但**已经建模好了**——乱的是 UI 没把它表达出来，不是数据没有。

| 模型             | 时长  | 宽高比 | 分辨率 | 负向词 | 音频开关 | seed |
| ---------------- | ----- | ------ | ------ | ------ | -------- | ---- |
| Seedance（全系） | ✓     | ✓      | ✓      | ✗      | ✓        | ✓    |
| MiniMax H3       | ✓     | ✓      | ✗      | ✗      | ✗        | ✗    |
| Kling            | ✓     | ✓      | ✗      | **✓**  | ✓        | ✗    |
| HappyHorse       | ✓     | ✓      | ✓      | ✗      | ✗        | ✓    |
| Gemini Omni      | **✗** | ✓      | ✗      | ✗      | ✗        | ✗    |
| Veo 3.1          | ✓     | ✓      | ✓      | ✓      | ✓        | —    |

八种模型没有两个完全一样。这张表的权威来源是 `getVideoModelSendContract()` 的 `parameters` 字段，UI 应当**从它渲染**而不是各自硬编码。

## 5. 节点盘点：不乱在数量，乱在代码层命名

### 5.1 现状

添加菜单 **10 个入口 → 6 种活跃节点类型**（`image` 一个类型靠 `data.role` 扛五个入口，是 node-consolidation option B 的做法）：

| 入口                                                                       | 节点类型   |
| -------------------------------------------------------------------------- | ---------- |
| imageAsset · imageShot · imageKeyframe · organizeCharacter · organizeScene | `image`    |
| videoGenerate                                                              | `seedance` |
| videoReference / videoShotText / videoMerge                                | 各自同名   |
| audioVoiceProfile                                                          | `voice`    |

活跃 6 类正好对上「名词做节点、动词做动作 → 六族」那次的结论。**没有冗余节点该删。**

### 5.2 ⚠ 更正一处我先前说错的判断

我在对话里说过「节点却姓 Seedance，用户看到 seedance 不会想到能切 Kling」——**这是错的**。i18n 实读：`nodeTypes.seedance` 的显示名是「**视频生成**」，`addCatalog.items.videoGenerate` 也是「视频生成」。**用户从来没看到过 seedance 这个词**，问题只在代码层。

### 5.3 因此：建议不改 enum 值

`'seedance'` 作为节点类型字符串的风险面：

- **两处独立定义**：`node-types.ts:36`（节点类型）+ `script-doc.ts:60`（`SCRIPT_DOC_REF_KIND_IDS`）
- **27 处非测试引用**，横跨 14+ 文件
- **参与持久化 key**：`script-doc.ts:52-57` 的注释写明 match key 是 `${kind}:${sourceId}`

改字符串值 = 存量项目与存量 ScriptDoc 双双失配。收益只是代码可读性，**不值**。建议在 `node-types.ts` 那行加一句注释说明「`seedance` 是历史名，实际是模型无关的视频生成节点」，与上面 composer/agent 那条「拦住下一个想顺手删的人」的注释同惯例。

### 5.4 不该加节点

Seedance 2.5 的新能力里「视频编辑」「视频延长」都是**动词**（作用于已有视频节点的动作），按「名词做节点、动词做动作」不该开新节点族。这与已删的 `seedance-25-capability.md` §2 结论一致（四种模式里一种都不需要新节点），该结论已内联到 `seedance-25-ga-integration-2026-08.md` §6。

## 6. 模型分类：第一层现在是渠道不是公司

> ⚠ **本节的证据在 2026-08-08 被更正过一次，结论未变。** 原先我拿 `groupModelsByProvider`（`constants/models.ts:383`）当现状证据——**那是死代码，全仓零消费**。真正在渲染的是 `BaseModelPickerPanel`（`components/business/studio-shared/pickers/`）：它按 `adapterType` 分组（:162-170），标签取 `providerConfig.label`，钻进去后再按 saved / platform / locked 分色；只有一个 provider 时跳过第一层。**第一层确实是渠道，这点没变**，但下次要改的是 `BaseModelPickerPanel` 不是那个死函数。
>
> 同源更正：`getProviderGroup` 里「MiniMax 双站合并成一个显示组」那句注释描述的是**死代码的意图**，实际 UI 上 MiniMax 与 MiniMax (CN) 就是两条。
>
> **本节提的方向已被 §8 取代** —— owner 2026-08-08 拍板的是「系列 → 型号 → 渠道」三层，不是我这里写的「厂商 → 模型」两层。看 §8。

owner 要「先公司、再模型」的两层分类。**现状第一层不是公司**——`PROVIDER_GROUP_ORDER`（`constants/models.ts:319`）按 `adapterType` 分组，混着三类东西：

- 真·公司：openai · google · deepseek · novelai · runway · minimax · fish_audio · elevenlabs · anthropic · hyper3d
- 渠道/转售商：**fal** · **replicate**
- 既是公司又是渠道：volcengine · dashscope
- 两者都不是：opensource（HuggingFace）· runner（自建）

后果：Seedance 走 fal 归进「fal」组、走火山归进「volcengine」组，**同一模型系列裂成两处**；Kling 是快手的，走 fal 就归进「fal」，用户看不到快手。

**现成先例**：MiniMax 国内外双站被合并成一个显示组，注释写「users pick the station via the model entry, not via a second heading in the picker」（`models.ts:369-370`）。**建议把这条做法推广到全部**：第一层 = 模型厂商，渠道降级成模型条目上的属性。

**这件事因 Seedance 2.5 三站而变紧急**：BytePlus 进来之后，同一个 2.5 会同时出现在 fal、volcengine、byteplus 三个标题下。

## 7. owner 已拍板（2026-08-08）

四条全部拍定：

1. ✅ **命名统一表照 §2.2 定**
2. ✅ **三档对外名照 §3 定**（关键帧 / 多图参考 / 全能参考）
3. ✅ **对内四值、对外三档** —— `referenceMode` 内部枚举新增首尾帧作为**第四个值**（贴上游语义：火山把 first-frame i2v / first+last frame / multimodal reference 列为三个互斥场景，见 §1 builder 注释），但 UI 上仍只呈现三档，首帧与首尾帧是「关键帧」档内部的两种用法，不拆成两个选项
4. ✅ **分类第一层改公司，与 Seedance 2.5 三站接入同批做**（N）—— 理由见 §6 末：BytePlus 进来后同一个 2.5 会同时挂在 fal / volcengine / byteplus 三个标题下，不改就是三倍的重复

### 7.1 拍板后的连带影响

- **③ 与 ④ 是同一件事的两面**：`referenceMode` 加第四值之后，§1.2 第 2 条「首尾帧是子形态还是新枚举」的问题自动消解，但**UI 层要有一个映射把四值折成三档**——这个映射是新代码，别指望现有 `getVideoModelSendContract` 直接给。
- **④ 让 Q 与 N 咬合**：分类第一层改公司要动 `PROVIDER_GROUP_ORDER` / `getProviderGroup` / `groupModelsByProvider`（`constants/models.ts:319-389`），而 N 的 §3.9 正好要往 `AI_ADAPTER_TYPES` 加 `BYTEPLUS`。**两边都碰 providers/models 常量，同批做才不会互相踩**。
- 通用组件（owner 原话「这边需要做成通用的组件」）建在第一层改完之后——第一层的语义没定，组件抽象出来也是错的。

## 8. 模型选择器与模式适配（2026-08-08 owner 拍板）

### 8.1 先把两件事分开

原先我把能力档做成了模型选择器里的筛选 chips —— **owner 否掉了**。正确的分工是：

|                                          | 归属         | 职责                                                 |
| ---------------------------------------- | ------------ | ---------------------------------------------------- |
| **模式**（关键帧 / 多图参考 / 全能参考） | **视频节点** | 决定节点长什么样、走哪个端点、以及模型选择器里出现谁 |
| **模型选择器**                           | 共享组件     | 在模式已定的前提下，选系列 → 型号 → 渠道             |

### 8.2 模型选择器：三层钻取

```
第 1 层 系列    Seedance · Kling · Veo · MiniMax H3 · HappyHorse · Gemini Omni
第 2 层 型号    2.5 · 2.0 · 2.0 fast · 2.0 mini
第 3 层 渠道    火山 $0.21/s · BytePlus $0.23/s · fal $0.47/s   ← 只用来比价
```

**第 3 层的唯一职责是比价**（owner 原话：「这边的区别就是只给价钱的不同或者说对比」）。单渠道的型号跳过这一层直接选中。

⭐ **这个结构顺手消掉了 reference 变体的概念负担**：`SEEDANCE_20` 与 `SEEDANCE_20_REFERENCE` 是两个端点（`text-to-video` / `reference-to-video`），今天在列表里各占一条。模式移到节点之后，「选了全能参考」本身就决定走 reference 端点——**用户只需要看见「Seedance 2.0」，端点由模式挑，reference 这个词不必出现在 UI 里**。

### 8.3 ✅ 已实现（2026-08-08）：四个维度里只有一个是新数据

我原先写的是「加四个元数据字段」——**高估了**。实测后三个维度全都现成：

| 层             | 取自                                                 | 状态                                                    |
| -------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| 1 系列         | **`MODEL_FAMILIES`**（`constants/models.ts`）        | 已有，实测 100% 覆盖 20 个视频模型，分组正好是 7 个系列 |
| 2 型号         | **`MODEL_VARIANTS`**                                 | ⬅ **唯一的新数据**，本轮已加                            |
| 3 渠道         | **`adapterType`**（显示名走 `providerConfig.label`） | 已有                                                    |
| 端点（不露出） | **`getVideoModelSendContract().referenceMode`**      | 已有，与三档模式一一对应                                |

**枚举值一个都没改** —— 存量项目和 ScriptDoc 依赖它们（同 `node-types.ts` 那条注释的教训）。新数据做成一张表（同 `MODEL_FAMILIES` 惯例），没动 `ModelOption` 类型、没改 20 个模型条目。

**闸门**：新增 `src/constants/models/model-variants.test.ts`，四条不变量，`src/constants/` 21 文件 152 测试全过。其中最要紧的一条已实测成立：

> **(型号 × 渠道 × 模式) 唯一定位一个 `AI_MODELS` 条目。**

这是整套设计的地基 —— 撞车就意味着有两个条目除 id 外完全同构，那时模式切换会随数组顺序随机挑一个端点。测试钉住它，以后接新渠道/新型号时撞车会立刻红。

### 8.4 ✅ 已实现（2026-08-08）：可比单价表

`cost` 是 credit 数横向比不了，故新建 `constants/models/unit-prices.ts`。**基准档钉死在 720p / 每秒 / 含音频 / 无视频输入** —— 分辨率和有无视频输入都影响单价，不钉基准就没法横向比。

**⚠ 没有复用 `HOMEPAGE_MODEL_REFERENCE_PRICES`**：那张表自称 display-only、口径未标注，且 2026-08-08 抽查发现数据对不上——它给 Seedance 2.0 标 $0.1/s，而火山官方算例换算是 $0.14/s、fal 的 2.5 官网标价 $0.473/s；2.5 只比 2.0 贵约 50%，差不出 4.7 倍。**拿它当比价源等于把错数字喂给用户决策。**

**覆盖策略：宁可留空，不填没核实过的数字。** 缺失时 UI 应当隐藏价格而非显示占位——比价的价值全在可信度，一个错的数比没有数更糟。当前只填了火山 Seedance 四条（都附 `source` 与 `verifiedAt`，写到能原样复核的程度），fal / MiniMax / BytePlus 全部留空并在文件里列明。

**闸门**：`unit-prices.test.ts` 四条。**不断言覆盖率**——断言覆盖率只会逼人拿猜的数凑绿。其中一条守住了「两张价格表并存」的结构性风险：

> 同一个模型不得同时出现在本表和 homepage 表里。

只要零重叠，就不会有一个模型两个价格来源、改一处漏一处。两张表将来合并时这条自然退役。

**立案未做**：homepage 那张表要逐个核实 20+ 模型的官方定价才能合并，不在本切片范围。合并前两张表并存是已知的坏味道。

### 8.5 模式：三档，**没有「全部」**

owner 拍板去掉「全部」。理由：模式不只是筛选器，它还决定端点，而「全部」在端点决策上是空的（不知道该走 text-to-video 还是 reference-to-video）。默认档 = **关键帧**（最通用）。若要总览入口，那是「浏览全部模型」，不是一个模式档。

### 8.6 模式的 UI 形态 —— 靠界面表达，不靠文案

owner 原话：「不用说明，但是要在 UI 层面上体现出来。全能参考能上传视频，而多图参考不能。」**形态本身就是说明**：

| 模式     | 图片区                        | 视频区   | 音频区   |
| -------- | ----------------------------- | -------- | -------- |
| 关键帧   | **两个具名位置**：首帧 / 尾帧 | 不存在   | 不存在   |
| 多图参考 | 多张平铺，无语义              | 不存在   | 不存在   |
| 全能参考 | 多张平铺                      | **存在** | **存在** |

关键帧与多图参考都只有图片区，但形态不同：前者是两个固定的具名槽，后者是一堆等价的图。**「不存在」是真的不渲染，不是禁用后置灰** —— 置灰仍然是在用文案解释「你不能用它」，而不渲染才是让人一眼看出差别。

### 8.7 模式切换的冲突处理

owner 拍板：**不符合新模式的模型直接消失，并清空当前选择。**

**「清空什么」分三层，全部已拍板**：

| 对象                               | 处置                                           | 理由                                                                   |
| ---------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| 模型选择                           | **清空**                                       | 不符合新模式的模型直接从列表消失，当前选择一并清掉                     |
| 模型相关参数（时长档 / 分辨率档）  | **清空回默认**                                 | 新模型未必支持旧档位（2.5 有 30s，Kling 没有）                         |
| 用户已传的素材（图 / 视频 / 音频） | **保留在数据层，切回来还在，当前模式下不发送** | 素材是用户的劳动，模式是可来回切的视图状态，因为切视图销毁数据代价太大 |

⚠ 第三行有两个实现后果，别漏：

1. **发送时要按模式过滤**，不能直接把节点上所有素材塞进请求 —— 否则多图参考模式下会把藏着的视频一起发出去，触发 400。过滤点在 `buildVideoSendPreview` / 提交链路，不在 UI。
2. **UI 要有「有东西没被发送」的提示**，否则用户看不见的素材会变成静默的困惑（「我明明传了视频」）。这是唯一需要文案的地方——§8.6 的「靠形态不靠文案」管的是模式差别，不管这个。

### 8.8 关键切片

1. ✅ **已完成**（2026-08-08）：`MODEL_VARIANTS` 表 + `getModelVariant` + 四条不变量测试。纯 constants，零 UI，零枚举改动。
2. ✅ **已完成**（2026-08-08）：`unit-prices.ts` + 四条不变量。⬜ 剩两件增量：把 fal / MiniMax / BytePlus 的价格补齐（各自接入时顺手做，别单独立项）；把周检脚本扩到价格核对（`verifiedAt` 超期告警）。
3. ✅ **已完成**（2026-08-08，见 §9.8）：`BaseModelPickerPanel` 两态机扩成三态机。四个消费者行为不变，非视频模态自动退化成两层（**没有按模态分支**）。⚠ 第三层仍是过渡态：端点重复要等切片 4 的模式过滤才消掉。
4. ✅ **已完成**（2026-08-08，见 §9.10）：节点的 `videoMode` 字段 + 三档 tab + 按模式收窄模型列表；提交链路换成读节点模式的解析器，`video-brands.ts` / `video-model-resolver.ts` 已整体删。⚠ §9.8 发现 1 的那句「画布视频节点走的是另一套分类，不是这个选择器」**是错的**——它用，经 `VideoComposer` → `CanvasRoutePicker` → `BaseModelPickerPanel`。
5. ✅ **已完成**（2026-08-08）：`constants/video-node-modes.ts` —— 三档枚举、模式 ↔ `referenceMode` 双向映射、`resolveVideoModelId` 端点解析、`getModelsForNodeMode` 筛选、`modelSurvivesModeSwitch` 切换判断。纯 constants，零 UI。
   - ⭐ 核心机制已验证：`('seedance-2.0', FAL, keyframe)` → `SEEDANCE_20`，同型号同渠道换成 `multimodal` → `SEEDANCE_20_REFERENCE`。**「用户只看见 Seedance 2.0、端点由模式挑」由此成立。**
   - 解析不到时**返回 null 而非回退**：Kling 没有多模态端点，回退会让用户以为在用全能参考、实际发首帧请求。宁可让该型号从列表消失。
   - 模式与 `referenceMode` 一一对应 → **加新模型不用登记模式**，契约填对模式自动正确。
6. 🔶 **一半已完成**（2026-08-08，见 §9.11）：**首尾帧五层全通**（§1 / §1.2 那部分做完了）。⬜ **仍未做**：三种模式各自的**槽位形态** —— 现在三档共用同一套素材区，多图参考档照样渲染视频/音频槽。连带没做的是「N 段素材在当前模式下不会发送」提示的其余模式部分（关键帧档那部分已随首尾帧落地）。

⚠ **切片 6 与 §1 的首尾帧补齐是同一块 UI，必须合成一次改**，别分两轮。~~（首尾帧那半已于 2026-08-08 落地；剩下的槽位形态是纯 UI，不再与发送链路耦合。）~~
⚠ 切片 3–6 是 UI，按设计治理要先过「关键切片 → owner 确认」再动手；切片 2 是纯数据，可随时做。

## 9. 关键切片设计（2026-08-08，待 owner 确认后才动 UI 代码）

### 9.1 切片 3：选择器从两态机扩成三态机

> ✅ **已实现（2026-08-08）。交付记录、实现时定死的三处规格空白、以及三个要带进切片 4 的发现，全在 §9.8。** 本节保留为「当初怎么想的」。

现状（`BaseModelPickerPanel`）：`view: 'providers' | 'models'`，`singleProvider` 时跳过第一层，搜索时走 `searching` 分支绕过分层，返回按钮仅在 `!singleProvider` 时渲染。

改成 `view: 'families' | 'variants' | 'channels'`，三条贯穿规则：

1. **搜索绕过全部分层** —— 沿用现有 `searching` 分支平铺结果，不做三层的搜索
2. **跳过要连锁** —— 三层各自判断「只有一个候选就跳过」，可能一路跳到底（单系列单型号单渠道 = 零点击直接选中）。实测会跳第二层的：Veo / Gemini Omni / HappyHorse / LTX / MiniMax H3
3. **返回要回到「最近一个没被跳过的层」** —— 不能是常量

⚠ **本切片真正的复杂度不在多画一屏**：跳过判断从 1 处变 3 处，返回目标从常量变成动态计算。现有那条注释（:176-181）已经记录过一次相关的坑——「callers often pass a freshly-built `options` array on every render」导致视图被重置回第一步，三层之后这个坑的破坏面更大。

### 9.2 切片 4+6：节点三态的槽位规格

| 模式         | 图片区                                     | 视频区            | 音频区           |
| ------------ | ------------------------------------------ | ----------------- | ---------------- |
| **关键帧**   | **两个具名固定位**：首帧 / 尾帧，最多 2 张 | 不渲染            | 不渲染           |
| **多图参考** | 多张等价平铺，无语义                       | 不渲染            | 不渲染           |
| **全能参考** | 多张等价平铺                               | **渲染**，最多 10 | **渲染**，可独存 |

⭐ **「关键帧两张都空」= 纯文生视频** —— owner 早前提的「文字生成模式」就是这个状态，不必单开一档。这也回答了当时那个「当前模型池里没有纯文本档」的空档问题。

⭐ **切片 6 与 §1 的首尾帧补齐是同一件事**：关键帧模式的两个具名槽正是首帧/尾帧。§1 查明首尾帧从未实现（五层链路第 2 层就丢了首尾区别），这里是它的落点。**必须一次做完**，否则会出现「UI 有两个槽但只送一张」的中间态。

### 9.3 模式切换的完整行为

| 动作               | 行为                                       |
| ------------------ | ------------------------------------------ |
| 不符合新模式的模型 | 从列表消失，当前选择清空                   |
| 时长档 / 分辨率档  | 重置为新模型的默认                         |
| 已传素材           | **留在数据层**，新模式不渲染，切回来还在   |
| 未发送提示         | 节点上一行「N 段视频在当前模式下不会发送」 |

⚠ 那行提示是**整套设计里唯一该用文案的地方**。§8.6 的「靠形态不靠文案」管的是模式差别（形态自己会说话），但「看不见的东西还在」没法靠形态表达——不给提示，用户就会以为素材被吞了。

⚠ **发送链路必须按模式过滤**（`buildVideoSendPreview` / 提交侧），不能把节点上所有素材直接塞进请求，否则多图参考模式下会把藏着的视频一起发出去 → 400。

### 9.4 对标：updream 与 libtv 怎么放（2026-08-08 实地看的）

owner 让去看两个对标产品。**updream 是 B 站的 AI 视频创作平台**（无限画布 + Agent 助手 + skills + 积分制，形态与本项目高度重合；模型阵容 Seedance 2.5 / Kling 3.0 / MiniMax H3 也几乎一样，且**它 8/7 就上了 Seedance 2.5**，与火山开放 API 同天）。

**⭐ 模式切换器的答案：选中节点后浮出的参数面板顶部，做成 tab。**

updream 选中视频节点后，节点下方浮出一块面板：

```
┌──────────────────────────────────────────┐
│ [文生视频] [图生视频]        ← 模式 tab 在这
│ [图1][图2][图3][图4][图5]    ← 参考槽，带序号角标
│ 🏷 参考图1  🎬 video_00b7…    ← 素材引用胶囊
│                        31/2500 字节
│ 📹 视频生成▾ │ Kling 2.5▾ │ 5S/1080P▾ │ ⚡225 │ ⬆
└──────────────────────────────────────────┘
```

**映射到我们**：那块面板 = `VideoComposer` 的 `density='card'`（挂在节点卡上的紧凑侧车，`SeedanceNode.tsx:114`），**不是** ⤢ 展开的 `density='detail'` 详情面板。所以模式 tab 放 `density='card'` 顶部。

> ⚠ **2026-08-08 补**：`VideoComposer` 里已经有一套 brand → variant 的分类 + 「reference 靠输入自动判」的逻辑（`constants/video-brands.ts` / `lib/video-model-resolver.ts`），与本设计的「模式归节点」**互相矛盾**。往这块面板加模式 tab 之前先看 §9.8 发现 1。

⚠ `density='detail'`（direction E 七槽）也需要模式切换器，放哪个槽要另定 —— 不在本节范围。

**两个产品在同一件事上做了同样选择**（强信号）：**模型选择在节点的面板内，不在全局** —— libtv 是 `General image V2 ▾` 在提示词面板底部，updream 是 `Kling 2.5 ▾` 在参数面板底部。我们现在也是这样（`WorkflowModelPicker` 挂在节点 inspector），**这条不用改**。

**两个可以直接抄的手法**：

1. **多个参数压成一个下拉** —— updream `5S / 1080P ▾`、libtv `16:9 · 2K · 1张 ▾`。这对我们「八个模型没有两个参数集相同」的复杂度是个现成解法：不要为每个参数各摆一个控件。
2. **生成前就显示消耗** —— updream `⚡225`、libtv `⚡12`。我们现在没有，而三站接入后价差会很大（fal 是 BytePlus 的 2.06 倍），这个位置正好承载 §8.4 的单价数据。

### 9.5 owner 已拍板（2026-08-08）

1. **模式切换器** —— 按 §9.4 的对标结论：`density='card'` 面板顶部 tab
2. **尾帧槽折叠** —— 默认只显示首帧，填了首帧才展开尾帧槽
3. **价格缺失** —— 不留空，**按 token 单价推算补齐**（见 §9.6）

### 9.6 价格：改为 token 推算而非留空

owner 提出缺失的价格「是不是需要计算下，根据 token」—— 可行，而且能自洽验证：

火山官方算例「720p·5s·无输入视频 = 7.56 元」，单价 70 元/百万 token
→ 7.56 ÷ 70 × 1,000,000 = **108,000 tokens / 5 秒 = 21,600 tokens/秒（720p）**

拿这个基准乘各渠道的 token 单价：

| 渠道     | token 单价      | 推算每秒                      | 交叉验证                          |
| -------- | --------------- | ----------------------------- | --------------------------------- |
| 火山     | 70 元/M         | 1.512 元/s ≈ $0.213           | = 官方算例，自洽                  |
| BytePlus | $10.70/M        | **$0.231/s**                  | 与早前「按单价比推算」得数一致 ✅ |
| fal      | 不按 token 计费 | $0.4730/s（官网标价，直接抄） | —                                 |

⚠ **21,600 tokens/秒是 720p 基准**，480p 不同（实测 480p/4s = 38,830 tokens ≈ 9,708/秒）。推算别跨档。
⚠ MiniMax / Kling / Veo 不按 token 计费，得逐个抄官网标价，token 推算法对它们不适用。

### 9.7 ⚠ 顺带发现：首页在展示过时的价格

补价格时把 fal 官方标价逐条抄了下来（`fal.ai/api/models` 的 `pricingInfoOverride` 字段，官方文本，2026-08-08 实读），与 `HOMEPAGE_MODEL_REFERENCE_PRICES` 一对，**对不上**：

| 模型              | homepage 现值 | fal 官方（720p）              | 判断                     |
| ----------------- | ------------- | ----------------------------- | ------------------------ |
| Seedance 2.0      | $0.1          | **$0.3034**                   | ⚠ 低了 3.03 倍，疑似过时 |
| Seedance 2.0 fast | $0.06         | **$0.2419**                   | ⚠ 低了 4.03 倍，疑似过时 |
| Kling V3 Pro      | $0.3          | $0.168 含音频 / $0.112 不含   | ⚠ 对不上任何一档         |
| Kling O3 Pro      | $0.35         | $0.14 含音频 / $0.112 不含    | ⚠ 对不上任何一档         |
| Veo 3.1           | $0.2          | $0.40 含音频 / **$0.20 不含** | ✅ 对得上「不含音频」档  |

Veo 那条能对上不含音频档，说明 homepage 至少有一部分是按「不含音频」口径填的；但 Seedance 差 3–4 倍、Kling 对不上任何档，只能解释为**过时**。

**这是线上问题**：首页给用户看的 Seedance 单价低报了 3 倍，会让人对成本产生错误预期。

~~**本轮没有擅自改 homepage**~~ → ✅ **2026-08-08 owner 已拍板并落地**：口径选「**按产品默认档**」（哪个开关默认开就报哪个价），落地方式选「**homepage 从 `unit-prices` 派生**」。

⚠ **一个巧合要记住**：当前目录里 12 个有价视频模型**全部** `generateAudio: true`，所以「按产品默认档」恰好等于 `unit-prices` 已有的含音频口径，**不需要存第二个数字**。这是巧合不是定理 —— 哪天进来一个默认关音频的模型，本条就不再自动成立，那时才要在 `unit-prices` 加一列。`unit-prices.test.ts` 里已经立了一条断言守住这个前提，它红了就说明该加列了。

落地后首页实际取到的值（实跑）：

| 模型              | 改前  | 改后                        |
| ----------------- | ----- | --------------------------- |
| Seedance 2.0      | $0.1  | **$0.3034** ← 低报 3 倍修掉 |
| Seedance 2.0 fast | $0.06 | **$0.2419**                 |
| Kling V3 Pro      | $0.3  | $0.168 ← 原来是**高**报     |
| Kling O3 Pro      | $0.35 | $0.14                       |
| Veo 3.1           | $0.2  | $0.4 ← 默认开音频           |
| HappyHorse        | $0.14 | $0.14（本来就对）           |

`HOMEPAGE_MODEL_REFERENCE_PRICES` 里重复的 8 条已删，只剩 `unit-prices` 还没核实的图片/音频那批。取值统一走 `resolveHomepageReferencePrice`。⚠ **补价格请补到 `unit-prices`**，别往首页那张加新条目。

⚠ **那条断言改过两次，两次都值得记**：

1. 最初「两表不得重叠」—— 立错了，补齐 fal 价格后必然重叠。
2. 改成「只比单位不比金额」—— **也不对**：它把「首页低报 3 倍」正当化成了「两个口径」，于是那个 bug 被测试**保护**了起来。
3. 现在（首页改为派生）重叠**真的**不该存在了：同一个模型两个数字，就是漂移本身。断言改回「不得重叠」，这次是对的。

教训与本轮一路在治的同形：**测试锁住的东西要是「行为」，不是「当下的数字/字面量」**。同批还修了 `node-workflow-graph.test.ts` 里写死「关键帧首」的那条 —— 它测的是「选了更具体的角色」，却被改名弄红。

### 9.8 ✅ 切片 3 已交付（2026-08-08）

改动落在 4 处：`BaseModelPickerPanel.tsx`（+ 测试从 19 条到 33 条）、`use-split-model-options.ts`（把三桶分法抽成纯函数 `splitModelOptions`，型号层要**按分组**判桶）、`messages/{en,ja,zh}.json`（新增 `Common.channelCount`，删掉零消费的 `backToProviders`）。全量 tsc 0 error · eslint 干净 · 相关 635 测试全绿 · studio 视频/图片两条线真机验过。

**§9.1 的三条规则都按原样实现**，另外定死了三处规格里没写、但不定就没法写代码的判断：

1. **「跳过」在两种时机上是两件事**：打开时跳过 = 落在更深的层；点击时跳过 = **整组只剩一个条目的行，就是那个条目**（有对勾/健康点、无 chevron，点了直接选中或进 QuickSetup）。§8.2「单渠道的型号跳过这一层直接选中」把后者写明了，前者是连锁推出来的。⚠ 打开时**绝不自动触发 `onChange`** —— 那会变成「打开下拉框就改了用户的选择」。§9.1 里「零点击直接选中」按「零点击抵达那一行」实现。
2. **系列层的兜底是 `adapterType`，不是模型 id**。目录里 57 个模型 100% 有 family，没有 family 的是 LLM 路由和 `EDIT_MODELS` 那类目录外 id。退回 `adapterType` 正好等于改造前的第一层，那些调用方一字不变；退回模型 id 会把助手的路由选择器压成一屏无分组的平铺列表。
3. **型号名是从 i18n 标签推的，没有新建标签表**：取同组里**最短的那条**再削掉结尾括注（`Seedance 2.5（火山方舟）` → `Seedance 2.5`）。⚠ **只在型号有多个条目时才削** —— 单条目型号（图片/音频/3D 全是）的括注装的是真实差别，`Seedream 5.0 Pro（火山方舟）` 削完与 fal 那条重名。不写死一张英文表是因为 zh 下 `klingV3Pro` 是「快手可灵 3.0 Pro」，写死就把中文标签降级了。

**判错一次**：交接说「8–10 条测试会红」，实际**只红了 1 条**。因为三桶标题被一并搬到了型号层，单 provider 那条退化路径的断言原样通过。→ 「会红几条」是拍的，别当验收基线；红得少要去确认是设计对了还是测试太弱（这里是前者，另补了 14 条锁三层行为的新测试）。

**真机抓到两个静态看不出来的错**（程序化读 DOM 抓的，不是看截图）：

- MiniMax 的系列行写「1 个模型」，点进去是 **4 行**。计数本来报的是「下一层有几项」，但跳过是连锁的：单型号的系列直接跳到渠道层。→ 计数必须沿跳过链算。
- 型号行的计数写「N 个模型」，可那一层数的是渠道。新增 `Common.channelCount`。

#### 三个要带进切片 4 的发现

1. ❌ **这条我写错了，已于同日更正 —— 见 §9.9。** 原文是「画布的视频节点根本不用这个选择器」。**它用**：`VideoComposer:1509` 渲染 `CanvasRoutePicker variant="media"`，那条路径就是 `MainModelPicker → BaseModelPickerPanel`。我 grep 时关键词里没有 `CanvasRoutePicker`，一层没查到就下了结论（同 §一.3「grep 一层就下结论」）。旧分类当时还活着的只有四个窄用途，不是选择器本身。
2. ⚠ **第三层现在是过渡态**：Seedance 2.0 显示 4 条 = 2 渠道 × 2 端点。组件**故意不**自己按模式挑一条 —— 选择器不知道模式（模式归节点），挑了就等于把另一个端点变成用户永远够不着的模型。切片 4 的模式过滤一上，(型号 × 渠道 × 模式) 唯一性保证每个渠道只剩一条，重复自然消失。
3. ⚠ **没有接单价显示**，虽然 §8.2 说第三层「唯一职责是比价」。`MODEL_UNIT_PRICES` 按 `AI_MODELS` 索引，而这是四个模态共用的组件（LLM 路由的 id 根本不在枚举里）—— 硬塞进去就是把视频域概念塞进壳里，正是这次要避免的按模态分支。注入点用已有的 `detailForOption` prop，由调用方给。**排在模式过滤之后**：现在接，价格会挂在重复的端点行上。

**顺带**：`MODEL_VARIANTS` 里 `HAPPYHORSE_10` 的 slug 是 `'happyhorse-1.1'`，模型名却是 HappyHorse 1.0。slug 不露出，纯内部不一致，改不改都行。

### 9.9 ✅ 两套分类收敛 —— 第一批（2026-08-08，owner 拍板「需要收敛」）

#### 先更正 §9.8 发现 1

**「画布视频节点根本不用这个选择器」是错的。** `VideoComposer:1509` 渲染的是
`CanvasRoutePicker variant="media" mediaModality="video"` → `MainModelPicker` →
`BaseModelPickerPanel`。三层钻取在画布里一直是生效的。我 grep 的关键词里漏了
`CanvasRoutePicker`，查了一层就下结论 —— 与 §一.3 记的是同一个坑，**这一轮又踩了一次**。

同时更正：旧分类的 **UI 早就死了**。`composer.brands` / `variants` /
`isDualProvider` / `selectVariant` / `selectProvider` / `previewBrandModelId`
全部零消费，`SURFACED_VIDEO_BRANDS`（只露 Seedance/Kling/Veo 的白名单）也因此失效
—— 画布视频选择器本来就列出全部七个系列。旧分类真正还活着的只有四处窄用途。

#### ⭐ 顺带查出一个活缺陷：Seedance 2.5 被静默换成 2.0

旧的 variant 轴由 `getVideoVariantForModelId` 从 **`qualityTier`** 推出，只编码速度档
（standard / fast），**不编码代次**。2.0 与 2.5 都是 `premium` → 撞进同一格 →
`pickBest` 取数组第一个。实测（一次性探针，跑真实目录）：

| 用户选中             | 提交实际跑                          |
| -------------------- | ----------------------------------- |
| 2.5、无参考          | `seedance-2.0-volcengine`           |
| 2.5、有参考          | `seedance-2.0-reference-volcengine` |
| 2.5 参考端点、有参考 | `seedance-2.0-reference-volcengine` |

`StudioNodeWorkbench:1619` 是 `submitModelId = effectiveVideoModel?.modelId ?? model.modelId`，
**无条件**走这条路。`use-video-composer` 的 `effectivePreviewModel` 中同一个招 ——
于是 2.5 节点的参考容量按 2.0 算（9/3/3 而不是 30/10/10），送出预览也是 2.0 的。

**为什么一直没被发现**：`video-model-resolver.test.ts` 的夹具 `SEEDANCE_IDS` 只有 2.0
的八条，`0fa75286` 接 2.5 时没扩它。→ **往目录加同系列新代次时，夹具必须跟着加。**

好消息：`0fa75286` 当时**尚未 push**，线上没受影响。

#### 本批落地了什么

owner 选的路子：先落不依赖模式的部分 + 止血，提交链路的彻底替换留给切片 4。

| 处                                              | 改法                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **止血** `resolveEffectiveVideoModelOption`     | 先用目录型号键（`getModelVariant`）把候选夹到与用户所选**同一型号**，再交给旧解析器挑端点                                                                                                                                                                                                             |
| `use-video-composer` 的 `effectivePreviewModel` | 不再自己拆 brand/variant/provider，**直接复用** `resolveEffectiveVideoModelOption` —— 「按当前输入实际会跑哪个模型」只留一份实现，止血自动继承                                                                                                                                                        |
| `VideoComposer` 的 `pickerLabel` / `modelLabel` | 删掉「brand · variant」拼串。它**从来没被显示过**：`triggerLabel` 映射到 `triggerEmptyLabel`（无值时的占位），选中后触发器显示模型自己的标签；唯一实际效果是当了 aria-label，于是读屏念「Seedance · 快速」而画面写「Seedance 2.0（火山方舟）」                                                        |
| `VideoComposer` 的 QuickSetup 重挑              | 记 **optionId** 而不是系列。原先配完 key 调 `selectBrand(brand)` 重挑，用户点的是「Seedance 2.5（火山方舟）」却会落到同系列的另一条                                                                                                                                                                   |
| `SeedanceNode` 的 `isOverridden`                | `deriveSwitcherStateFromModel` → 直接 `getModelFamily`（`MODEL_FAMILIES` 的值就是 `defaultVideoModel.brand` 存的那批字符串）                                                                                                                                                                          |
| **删**                                          | `getSurfacedVideoBrands` · `getBrandProviders` · `isDualProviderBrand` · `getBrandKeyStatus` · `SURFACED_VIDEO_BRANDS` · `use-video-composer` 的整套 switcher API（state / applySelection / brands / variants / isDualProvider / selectBrand / selectVariant / selectProvider / previewBrandModelId） |

#### 留给切片 4 的

- **提交链路** `resolveEffectiveVideoModelOption` → 新的 `resolveVideoModelId(型号, 渠道, 模式)`。它要读节点上的**模式字段**，那是切片 4 才加的 → 这一处**没法脱离切片 4**。届时 `video-brands.ts` / `video-model-resolver.ts` 整体删掉，止血一并消失。
- **`VideoDefaultModelSchema {brand, variant}`**（按项目持久化）。本批**故意没动**：它与 autospawn 的端点解析绑在一起，而那一步也依赖模式，改两次持久化不如改一次。
  - ⚠ 顺带查明：**`setDefaultVideoModel` 根本不在 `NodeWorkflowActionsContext` 的类型里**，没有任何组件能写它 → `defaultVideoModel` 永远是 `undefined` → `SeedanceNode` 的 ⚠ 覆盖徽标是死的，autospawn 恒走硬编码兜底（Seedance + fast）。schema 注释里说的「topbar chip 读写它」**那个 chip 不存在**。切片 4 要决定：补上写入口，还是整条删掉。
  - 改 shape 时旧项目的 `{brand:'Seedance', variant:'fast'}` 会解析失败 → `.catch(undefined)` → 用户丢一次项目默认视频模型（可接受，但要知情）。
  - 附带好处：现在的 `variant: z.enum(ALL_VIDEO_VARIANTS)` 意味着**加一个 variant id 就是一次持久化 schema 变更**；换成型号字符串就不再是。

**闸门**：全量 tsc 0 error · eslint 干净 · 受影响 63 文件 577 测试全绿 · 画布真机验过（节点卡渲染正常、三层钻取可用、选 2.5 之后节点持久化的就是 `seedance-2.5-volcengine`、aria-label 变回「选择模型」）。

### 9.10 ✅ 收敛完成 + 切片 4 节点侧（2026-08-08）

两批落地，commit `49750d7e`（节点侧）与本批（提交链路）。**全仓现在只有一套视频分类。**

#### 语义切换：reference-by-input → mode-by-node

这是整件事的核心，一句话：**端点从「按输入自动判」改成「按节点上的模式」。**

旧规则在有了显式模式之后就是错的——用户选了「关键帧」，往节点上接一段视频，不该被偷偷换到全能参考的端点上。旧规则要解决的问题仍然被解决着：持久化的 `data.model` 只记「型号 + 渠道」，端点每次提交按模式重算，所以节点后来加了参考边也不会卡在旧 id 上。

`lib/video-node-model-resolver.ts` 取代 `lib/video-model-resolver.ts` + `constants/video-brands.ts`（三个文件已删）。三个消费者共用同一份答案：

| 消费者                                | 之前                                                             | 现在                                       |
| ------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| 提交（`StudioNodeWorkbench`）         | `resolveEffectiveVideoModelOption(model, hasReferenceInputs, …)` | `resolveVideoModelForMode(model, mode, …)` |
| 容量/送出预览（`use-video-composer`） | 自己拆 brand/variant/provider 算一遍                             | 同上，**同一个函数**                       |
| autospawn                             | brand+variant+provider 双段回退                                  | `pickDefaultVideoModel(variant, mode, …)`  |

模式的推导（存量节点从模型反推）也收进 `useVideoComposer` 一处，组件不再自己算第二遍。

⚠ **解析不到时返回 null、调用方保留原选择**，绝不回退到别的端点——旧实现就是这么把 2.5 静默换成 2.0 的。

#### 节点侧（§9.3 全部行为已实现）

模式字段 `videoMode`（可选，存量节点从模型反推，不写 migration）· 三档 tab 落在 `canvas-video-composer-mode`（那里原本是个派生的只读指示器，段控皮肤本来就在）· 切档清不兼容的模型与参数档、**素材一律保留** · 模型列表按模式收窄（`MainModelPicker` 新增 `filterOption`）。

真机端到端：同一个型号 `Seedance 2.5`，在关键帧档下落到 `seedance-2.5-volcengine`，在全能参考档下落到 `seedance-2.5-reference-volcengine`。

#### 持久化：`defaultVideoModel` 已整条删除（owner 拍板）

先把形状从 `{brand, variant}` 收敛到 `{variant}`，随后**整条删掉**。

删的理由是它**从来没有写入口**：`setDefaultVideoModel` 一直不在 `NodeWorkflowActionsContext` 的类型里，没有任何组件能调它。于是这个值恒为 `undefined`、⚠ 跨镜头漂移徽标从不点亮、autospawn 永远走硬编码兜底。schema 注释里写的「topbar chip reads/sets it」——**那个 chip 不存在**。

> 留着无人消费的管道，正是这一轮清掉的那套 brand switcher 的成因 —— 下一个会话会以为它在跑。**我这一轮就被同类幽灵误导过一次**（§9.9 的更正）。

一并删除：schema 字段 · `NodeWorkflowStateDataSchema.defaultVideoModel` · hook 的 setter 与只读值 · context 字段 · `StudioNodeWorkbench` 的两处接线 · `SeedanceNode` 的 `isOverridden` 与 ⚠ 徽标 · `NodeShell` 的 `overridden` prop 与虚线边（SeedanceNode 是它唯一消费者）· 孤儿 i18n 键 `overrideHint`（三语）· 那条守着它的测试。

⚠ **「项目级默认模型」这个功能本身没有被否定**，被否定的是「管道半截挂着」。真要做时按新分类（型号键）重建，并且**先有写入口再有 schema**。

顺带记一条：旧的 `variant: z.enum(ALL_VIDEO_VARIANTS)` 有个毛病——**往目录加一个新型号就是一次持久化 schema 变更**。将来重建时别再用 enum 存这种值。

#### ⚠ 写测试时被本文档骗了一次

我照 **§3 那张表**写「多图参考档退到 Veo 3.1」，测试红了才发现 **Veo 3.1 与 LTX 2.3 在目录里都是 `available: false`**。§3 写的是设计意图，不是当前目录事实。

→ **这一档目前只有 Gemini Omni Flash 一个可用模型**（而它的原生视频还停在 501）。三档模式的设计不受影响，但「多图参考」在模型池填起来之前基本是空的。
→ 教训同 §一.2：**引用文档里的表当代码事实之前，先对一遍目录。**

#### ✅ 触发器不再漏「参考」（owner 选「单开覆写口」）

新增 `triggerLabelForOption`，**只作用于收起态触发器**。视频节点传
`({ variantLabel, channelLabel }) => \`${variantLabel} · ${channelLabel}\``：

|                  | 之前                                | 现在                          |
| ---------------- | ----------------------------------- | ----------------------------- |
| 模式 tab         | 全能参考                            | 全能参考                      |
| 列表第二层       | Seedance 2.5                        | Seedance 2.5                  |
| **收起后触发器** | **Seedance 2.5（参考，火山方舟）**  | **Seedance 2.5 · VolcEngine** |
| 底下存的 id      | `seedance-2.5-reference-volcengine` | 不变                          |

⚠ **没有复用 `labelForOption`**：它的契约是「触发器与列表项**共用**同一个覆写」，而这两处需求正好相反 —— 触发器要藏端点，第三层的渠道行恰恰要能区分火山与 fal。共用一个口正是那个 prop 至今没人用的原因。

⚠ 覆写函数拿到的是选择器**已经算好**的型号名与渠道名，调用方只负责拼 —— `deriveVariantLabels` 那套族内去重不该复制到调用点。

⚠ 记一条容易误判的交互：`selectedOption` 是对**传进来的** options 解析的，而 `filterOption`（按模式收窄）在到达组件**之前**就过滤掉了。所以选中的模型一旦不属于当前模式，触发器读的是占位而非模型名，即使 `data.model` 还存着值。这在视频节点里应当是瞬态（切档会清掉不兼容的模型）；**若稳定复现，说明清空那一步漏了，不是显示错了**。

#### 还剩

- 「N 段素材在当前模式下不会发送」提示 —— 关键帧档那部分已随切片 6 落地（见 §9.11），其余模式的槽位形态仍未做。

### 9.11 ✅ 切片 6 已交付：首尾帧五层全通（2026-08-08）

§1 说「首尾帧在整条链路上从未实现」，现在五层都补上了。**逐层对照 §1 的表**：

| 层         | 原状态                  | 现在                                                                                         |
| ---------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| ① 画布 UI  | ✅ 本来就能标           | 未动 —— 用户在图片节点上标「关键帧首/尾」，入口是 `CanvasImageSelectionToolbar`              |
| ② 图判定   | ❌ 首尾区别被丢         | `orderKeyframes` 按 `imageCategory` 排序（首在前），并新增 `HarvestedImageUrls.keyframeUrls` |
| ③ 能力声明 | ⚠ 死代码                | **删掉了**（见下）                                                                           |
| ④ 发送契约 | ❌ 只给一张的位置       | `keyframeSlots: 1 \| 2` + `FIRST_LAST_FRAME_SLOTS`（images: 2）                              |
| ⑤ 请求体   | ❌ 无 `last_frame` 分支 | 两侧都加了 `first_frame` + `last_frame` 并列两条                                             |

**③ 按 §1.2 第 4 条「要么用起来要么删掉」选了删**：`ReferenceImageCapability` 的 `slotted` 变体零个模型声明、唯一用例在测试里。首尾帧最终住在发送契约的 `keyframeSlots` + 适配器的 `role`。同批删掉 `ReferenceSlotRole` 里从未被发出过的 `first_frame` / `last_frame` / `mask` —— 它们正是 §1.2 说的「第三套并行概念」。⚠ 同文件的 `getReferenceCapabilityMax` / `getReferenceCapability` **有 3 个真实调用方**（studio 两处 + `generate-image.service`），没动。

#### ⑤ 的判据从「数输入个数」改成「看端点」

原判据 `图 >1 张 或 有视频/音频 → 多模态参考`，两张关键帧因此被判成一组无序参考图 —— 这就是 §1 那句「视频不会以第二张图结尾」的落点。端点由**节点上的模式**选定，场景本来就已经定了，不该在这里从输入再反推。

⚠ **火山的参考端点与关键帧端点共用同一个 `externalModelId`**（`doubao-seedance-2-0-260128`），只能按我们**内部**的 modelId 分场景。

#### ⚠ 位置约定不够，加了 `keyframeUrls`

收割顺序是「关键帧在前，其余参考图跟在后面」。适配器按位置取（images[0]=首帧、images[1]=尾帧），**这条约定只在全是关键帧时成立**：

    1 张首帧 + 1 张角色卡图  →  urls = [首帧, 角色图]  →  角色图被当成尾帧发出去

新增 `lib/node-video-keyframe-plan.ts`（纯函数 + 7 条测试）在离开客户端前把选图定死，发送路径与预览层**共用同一个函数**。被留下的图进**既有**的 `dropped` 通道（理由 `unsupported`），不另起提示。⚠ 只对首尾帧档改变行为，其余模型原样透传。

#### ⚠ 顺带修掉两条同形缺陷（判据用错了维度，与本轮一路在治的是同一类）

1. **2.0 Fast 的 1080p 闸在生产里一次都没生效过。** `VOLCENGINE_SEEDANCE_20_FAST_MODEL_IDS` 装的是 `'seedance-2.0-fast-volc'`（**不存在的 id**）和外部 id，而 `resolveVolcEngineVideoResolution` 拿到的是**内部** id，两个都对不上。单测当时是绿的 —— 夹具喂的是外部 id，验的是另一个维度。**测试夹具已改用真实内部 id**。⚠ worker 那份键的是 `externalModelId` 且值对得上，**是好的**；两侧键的维度不同，别把值互相抄过去。
2. **Seedance 2.5 + 首帧/首尾帧会直接 400**（§1.2 末尾预言的联动，`models/video.ts:285` 自己也标了「尚未实现的上游约束」）。契约新增 `imageAspectRatioLock`，两侧适配器在**这次请求真有图**时才改发 `adaptive`（只看模型 id 会把纯文生的比例也一起改掉）。composer 的比例控件与参数摘要同步在锁生效时收起 —— 摆一个不会被采纳的值等于骗人。

#### ⬜ 已知缺口（明确不做，不是漏了）

- `use-video-composer.ts` 的槽位徽标（图N）没接选帧函数：`effectivePreviewModel` 定义在 `referenceTokens` **之后**，接上去要重排一个两千行的 hook。徽标与容量上限本来就已不一致（发送路径用 `getMaxReferenceImages`、预览层用 `contract.slots`，**两套容量源**），这是既有问题不是这次引入的。
- **两套容量源**本身没统一 —— 超出切片 6。
- 未真机实测（改动集中在发送路径，画布上无可见变化；两侧共 8 + 22 条单测覆盖）。

## Last Verified

2026-08-08 · §1 五层链路、§2.1 i18n 现状、§4 参数矩阵、§5.1/5.3 节点与引用计数均为本地实读。~~⚠ **未验证项**：① `addCatalog.items.collect` 是否真是孤儿键~~ → **2026-08-08 已核实：不是孤儿，别删。** 它在 `CanvasAddMenu.tsx:247` 是一个**真在渲染**的按钮标签，只是不作为 intent id 存在——那个按钮点下去派的是 `CANVAS_ADD_INTENT_IDS.organizeCharacter`。⚠ 教训与 §2.1 同源：只 grep 了 intent 常量表就下「孤儿」的结论，而 i18n 键的消费方式不止「按 intent 查表」一种。⬜ 顺带记一条**名实不符**（不是 bug，要不要改归命名统一）：按钮写着「收集」，派的却是 organizeCharacter。

② §1.2 四条锚点 **2026-08-08 已随切片 6 全部执行验证**（见 §9.11）：第 1 条（②层保住首尾）走的是 `orderKeyframes` + 新增 `keyframeUrls`，**没改 `isKeyframeNode` 签名**；第 2 条（契约表达首尾帧）选了「`text-or-first-frame` 档内的子形态」而非第四个枚举值，落在 `keyframeSlots`；第 3 条（重写 builder 判据）已改成按端点判；第 4 条（`slotted`）选了删。

③ 2.5 的 `ratio=adaptive` 联动**已实现**（契约 `imageAspectRatioLock` + 两侧适配器 + 单测），但**仍未真机实测**——需要一次真实的 2.5 首帧生成才能确认火山不再 400。
