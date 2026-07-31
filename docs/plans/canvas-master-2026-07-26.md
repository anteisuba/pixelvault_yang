# 画布主线总账（2026-07-26）

> **这是入口文档**。新会话先读它，再按需展开下面链接的分册。
> 权力级别：active plan。冲突时以本文的「工作流程」为准。

## 北极星

> **一句话 / 一条参考视频 / 几张素材 → 助手铺好整张画布 → 出片。**
> 用户只提供最基本的角色图与背景图，其余由助手辅助生成。

---

## 一 · 目前工作进度

### 已提交（`aa029046`）

框架段 S0–S3，纯呈现层，tsc 零错误 / 全量 3821 测试绿：

| 片  | 内容                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------- |
| S0  | `.domain-canvas` 作用域 + 皮肤 v0.2 全部 token（浅/深/reduced-motion）                                   |
| S1  | 卡名外置 · 卡内纯媒体 · 圆角 8 · 自适应卡边 · 端口形状+族色 · 点阵 48                                    |
| S2  | 顶栏贴边玻璃 · 底部玻璃胶囊 · 助手默认收起 · 左侧 296px 合体面板 · CastDock 竖版 · minimap 让位 · 四断点 |
| S3  | 连线三维度编码（粗细=建立 / 虚实=就绪 / 流光=焦点）· 石绿退出连线 · 命中区 16                            |

**S3 已真机实测通过**（另一会话，「AI拟人剧场」）：四档 stroke 值程序化读出逐条对上，未就绪判据语义正确，`--node-paint` 域内已重映射成中性墨（石绿确认退出连线）。

⚠ **两条关于 `aa029046` 的账，别被 commit message 误导**：

1. message 只写 S0–S3，但 **S3.5 改 `StudioNodeWorkbench.tsx` 的那部分一起卷进去了**（提交时另一会话正在改）。S3.5 因此横跨 commit 与工作区，翻 blame 时注意。
2. **这个 commit 单独 checkout 出来皮肤不生效** —— `canvas.css` 进了 commit，但「globals.css 删掉旧 node-\* 定义」+「layout.tsx `import './canvas.css'`」两处仍在工作区未提交（属 07-24 token 清场那批）。**当前可运行的状态是工作区，不是 HEAD。**

### S3.5 · 吞噬折叠退役（= P0-C 的前半，已做完）

S3 实测暴露 **6 条数据边只渲染 5 条**，根因两道闸串着：折叠规则 `isLooseImageNode && hasOutgoingEdge` 把源节点藏了 → `renderedEdges` 的「两端可见」守卫连边一起藏；更深一层是 `LooseImageCard` **根本没有 `<Handle>`**（吞噬时代散图一连上就消失，没人发现缺锚点），而同一组件也被**有图的镜头图**用 —— 那是骨干边。

**已做**：折叠只剩 `fusedIntoNodeId` 一种 · 散图并入「墨线签署 + 本体归位」路径 · 抽共享 `NodeCardPorts`（三处共用，顺带修好 `VideoReferenceNode` 漏掉的 `canvas-port`/`data-family`）· i18n 去吞噬语汇（三语）。
**验收已达成**：真机 **6/6 边 · 10/10 节点**；tsc 0 / vitest 446 文件 3821 测试全绿。**未提交**（NodeShell / LooseImageCard / VideoReferenceNode / messages ×3 仍在工作区）。

### S3.6 · S3 留下的三个缺口（未做，小）

| #   | 缺口                                                | 实据                                                                                                                                                       |
| --- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ①   | **彗星流光根本没实现**                              | 选中边 `animationName: none`；`canvas.css` 只有 running 的 `node-canvas-edge-pulse`，规格写的 `14 306` / 2.2s 在代码里不存在                               |
| ②   | `--canvas-edge-pending: #a3a3a3` **定义了没人消费** | 全仓仅 canvas.css 自身出现；实际走 `--node-edge`(#8a8a8a) + `opacity .6`                                                                                   |
| ③   | **显现态与选中态几乎同色同粗**                      | `revealedColor` = `color-mix(--node-paint 80%, --node-edge)` ≈ `#3a3a3a`，`selectedColor` = `#2a2a2a`，两者 `strokeWidth` 都是 3 —— 「谁被选中」没编码出来 |

另有两处**不属于 S3** 的伤：

- ~~**minimap 仍是深色**~~ —— ✅ **2026-07-27 已修**。容器交给 `.canvas-glass`，SVG 内部只留内容色（`bgColor` 透明 / 节点淡填 + 中性描边 / 视口框用 accent）。见 `CanvasMiniMap.tsx`。
- ~~**打开画布时边一条都不画**~~ —— ✅ **2026-07-27 已修并经 owner 真机确认**（前台标签页硬刷新，什么都不点，边直接就在）。下面保留全部诊断过程，因为其中**一条排除是错的**，而那个错误代价很大。

  | 样本         | 场景                             | 节点  | 边               |
  | ------------ | -------------------------------- | ----- | ---------------- |
  | AI拟人剧场   | 刷新后静置 29 秒                 | 10/10 | **0/6**          |
  | AI拟人剧场   | 合成 wheel 把视口 scale 2 → 1.69 | 10/10 | **仍 0/6**       |
  | 未命名项目 3 | 切项目（无刷新）                 | 23/23 | **0/2**          |
  | AI拟人剧场   | 一次真窗口 resize 之后           | 10/10 | **6/6 立即出现** |

  **平移/缩放救不回来** —— 视口变换只改 CSS transform，不触发重新测量；真正的触发是**容器尺寸变化**（ResizeObserver）。
  已排除的原因（全部程序化读值）：节点已测量（`visibility:visible`，React Flow v12 未测量时为 hidden）· **19 个 handle 全在**（S3.5 补的锚点是好的）· 6 条边 source/target 全部命中现存节点 · 两端 `handleId` 均为 null 且与 DOM 一致。**不是数据问题，不是 handle 问题。**
  ~~也排除了 MCP 后台标签页假象：`visibilityState` 全程 `'hidden'`，节点测量照常完成。~~

  ### ⛔ 上面这条排除是错的 —— 它直接导致后续四轮全部误判（2026-07-27）

  > `visibilityState: 'hidden'` **不能**因为「节点测量照常完成」就排除。

  两者走的根本不是同一套调度：

  | 机制                       | 隐藏标签页里                          |
  | -------------------------- | ------------------------------------- |
  | 节点测量（ResizeObserver） | **照常运行** ← 所以看起来「一切正常」 |
  | `requestAnimationFrame`    | **被 Chrome 完全冻结，一次都不执行**  |

  修法是 rAF 驱动的，所以在隐藏标签页里**物理上无法触发**。此后每一轮修完都在同一个隐藏标签页里「验证」出 0 边，于是每一轮都推翻代码重写一次 —— **一共四次，四次都在改本来就对的东西**。

  实证（2026-07-27，hook 内临时打点）：effect 跑了、循环排下去了、`tick` 执行 **0 次**；用 CDP 截图强制一帧后 rAF 解冻，**唯一一次** tick 记录 `expected: 6 / actual: 0` → force → `handleBounds` **0/10 → 10/10**、边 **0 → 6**。只有 `updateNodeInternals` 会写 `handleBounds`，单纯重绘不会，所以那次 force 就是修好它的动作。

  **留下的规矩**：判定任何**计时器 / rAF 驱动**的修复之前，先读 `document.visibilityState`；是 `'hidden'` 就一切「没触发」的观察全部作废。ResizeObserver 类的观察不受影响 —— 别把两者混为一谈。

  **定性**：首次挂载没算 handle bounds。**修法（已落地）**：`use-update-node-internals-on-init.ts` —— 判据是**目标本身**（应可见边数 vs `g.react-flow__edge` 实际渲染数），不是 `nodesInitialized`（会死锁）也不是 DOM 节点数（是代理）；每次未命中都用真实 DOM 元素 + `force: true` 调**store 级** `updateNodeInternals(Map)`。另加 `MIN_EDGE_CATCH_UP_ATTEMPTS = 30`：后台标签页迟到聚焦时挂钟预算早已耗尽，没有这个下限就只会试一次。
  ⚠ 是不是 S1/S3.5 引入的**尚未归因**。

  ### 另一条被证伪的说法

  「点『适应画布』也能修好」—— **不成立**，2026-07-27 在坏状态下实测点了，边仍是 0。`fitView` 只改视口 transform，从不重新量 DOM，所以填不了 `handleBounds`。当初提这条是把「真窗口 resize 有效」错推广成了「任何视口动作有效」。

### 已设计未实现

组装台信息设计（四问 / 两档密度 / 任务模式 tab / 三形态状态机 / 两级上限）· 节点四条修订 · 卡匣降级成注册表 · 三级审批门。

### 已知未做

吞噬其余清理（见 P0-C2）· 五族卡的**卡内**仍是旧皮 · 助手无法操作画布 · `fusedIntoNodeId` 那条通路仍然零边（「鸣潮」有 1 例，补真边另开一片）。

---

## 二 · 开发需求

按依赖排序。**前一件不做完，后一件没意义。**

### P0 · 地基（原三件，C1 已做完；剩 A / B 两件是 P1 的真前提，C2 已降级为清理）

| #         | 需求                                                                      | 落点                                                                                                                              | 为什么最先                                                                                                                  |
| --------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| P0-A      | **补上选中节点的名字 + 让 `[[node:]]` 标记真的能渲染** + 卡匣降级成注册表 | `node-assistant.service.ts:99` · 助手回复渲染层 · `CastDock.tsx`                                                                  | 见下方「P0-A 病因已更正」                                                                                                   |
| P0-B      | **修 `@` 提及的过滤顺序**                                                 | `StudioNodeWorkbench.tsx`（`assembleReferenceImagePayload` → `filterReferencedImages`，约 1248 / 1299）                           | 先砍容量再按 `@` 过滤 → 点名的图排在上限外会被先砍掉。自动流程下顺序不由人控，触发概率远高于手动。**2026-07-26 复核仍未修** |
| ~~P0-C1~~ | ~~吞噬**折叠**退役~~                                                      | ~~4 文件 + i18n~~                                                                                                                 | **已做完**，见 §一 S3.5（6/6 边）。未提交                                                                                   |
| P0-C2     | 吞噬**其余清理**（命名/常量/动效）                                        | `use-cast-ingest.ts` · `IngestDragLayer.tsx` · `NODE_STUDIO_INGEST_*` · `--ease-ingest` / `EASE_INGEST_CSS` · `node-edge-tier.ts` | 行为已经对了（拖到卡上 = 建边、本体留下），剩的是词汇与死常量。**降级为清理，不再是 P1 的前置**                             |

#### ⚠ P0-A 病因已更正（2026-07-26 实读）

原诊断「助手今天拿不到节点名字」**是错的**，实读 `node-assistant.service.ts` 后拆成三件：

1. **画布节点清单本来就带名字** —— `buildNodeSummary` 每行是 `- [[node:id]] 标题 (类型, 状态)`。这条不用修。
2. ~~**真正的洞在选中态**：`buildSelectedNodeText`（:99）只发 `[[node:id]]`，**不带标题**~~ ✅ **已修，本条过期（2026-07-31 实读）**。`services/node/node-assistant.service.ts:104-113` 现在会配对标题（注释原话 "Same `[[node:id]]` title pairing `buildNodeSummary` uses above"）。
   ⚠ 但**真正的洞当时找错了层**：服务端两个消费点（`buildNodeSummary` / `buildSelectedNodeText`）一直都正确读 `node.title`，坏的是**客户端塞进 payload 的 `title` 本身**——`StudioNodeAssistantDock.getNodeTitle` 只认合并前的 `characterImage`，其余类型一律给本地化类型标签。已于**包 4.5（`9f34a6e`）**收口到共享的 `lib/node-display-name`，详见 [`research-landing-plan-2026-07-30.md`](research-landing-plan-2026-07-30.md) §6.3 包 4.5。
3. ~~**`[[node:id]]` 标记全仓没有任何渲染器**~~ ❌ **这条我判错了，已更正（2026-07-27）**。解析与渲染管线**一直都在**：`src/hooks/use-assistant-conversation.ts` 的 `extractNodeReferences`（正则 `/\[\[node:([^\]\s]+)\]\]/g`）+ `AssistantConversation.tsx` 的 chip 渲染，`AssistantConversation.test.tsx` 也一直在测。
   **我为什么会漏掉**：grep 找的是字面量 `[[node:`，而源码里那行是**正则字面量**（带反斜杠 `\[\[node:`），两串字符不同 —— 所以只命中了 service 与测试。⚠ **教训：grep 字面量找不到的东西，不等于不存在**，尤其当目标可能以正则/模板/拼接形式出现时。
   真正缺的只是**查无节点时的降级展示**（已补：已知节点渲染可点 chip，已删节点渲染灰色不可点 chip + 「已删除节点」文案，不再落裸 id）。

原文那句「没名字就没 `@` 引用，没 `@` 引用组装台收不到正确的图」因此**不成立** —— `@` 引用走的是 `MentionInput` 与 `filterReferencedImages`，与助手上下文不是同一条链路。P0-A 与 P0-B 是两个独立的洞，不是一个。

### P1 · 助手的手

给助手一组**写画布**的工具：建节点（族 + role + 名字）· 连线（走 `node-connection-rules` 校验，不绕过）· 改名 · 触发生成。
接已存在的「应用前先询问」骨架，**不新建审批机制**。
⚠ 红线：助手不得直接改 `NodeWorkflowProject.state`。

### P2 · 三种输入 → 一份 ScriptDoc

**文字 / 参考视频 / 参考图 三种起手汇进同一份 `ScriptDoc`，投影逻辑只有一条。**

- **视频分析**：只有 Gemini 能吃视频（助手路由已有 Gemini 3.5 Flash，但助手今天是纯文本，`references` 媒体通道存在却没接 vision）。
- **ScriptDoc 装得下**（已实读）：`shots[]` 有 `sceneLabel`/`summary`/`emotion`/`camera`/`roleIds`/`dialogue`，`roles[]` 有 `name`/`description`/`voiceHint`/`personality`/`goal`。**缺的只有单镜时长**，加一个可选字段即可。
- **投影补两种节点**：`role=shot`（静帧）与 `role=background`（场景图）。其余五种已投。

### P3 · 自动生成一系列镜头图

> **这件事不需要任何新机制。** 实读 `node-connection-rules`：`shot` 节点**今天就会**收割上游 character + background 当具名参考图（`harvestUpstreamImageReferences`），并把名字注入 prompt 图例让模型绑定 名字→图。

所以它 = **P2 的投影补 shot 节点** + **自动连线**（角色卡/场景卡 → shot，连接规则已允许）+ **P4 的批量队列**。三件已有的事组合，零新建。

用户只需给角色图与背景图 → 助手按分镜表建 N 个 shot 节点、自动连好参考、批量跑。

### P-债 · JSON schema 串进 `LlmTextInput` + Anthropic 换官方 SDK（owner 2026-07-26 拍板：合成一片做）

现在 `LlmTextInput.responseFormat` 只有无 schema 的 `'json_object'` 标志，所以 Anthropic 用不了真正的结构化输出（`output_config.format` + json_schema），退而求其次把指令写进 system prompt。把 schema 串进去之后，OpenAI 那侧也能一起从「提示词请求 JSON」升级成「协议保证 JSON」。

⚠ **换 SDK 只在这一片里顺手做，不单独重构**。理由：这一片本来就要重写 `anthropicTextCompletion` 的 JSON 分支，届时 `@anthropic-ai/sdk` 的 typed `output_config` + `zodOutputFormat()` 收益才真正兑现。判据是**API 漂移**——一个会话内已被手写假设坑两次（预填 400、thinking 默认开着吃 `max_tokens`），两条都是裸 `JSON.stringify` 时编译器完全不管的地方。DeepSeek / Qwen 是 OpenAI 兼容格式，裸 fetch 仍然更省，**不跟着换**。

### P4 · 批量真实队列

排队 · 部分失败 · 失败重试 · **中途取消**。
⚠ **取消今天不存在**（`VideoComposer.tsx:229` 明写真实进度与取消是 P2）。**先补取消，再做队列** —— 没有取消的队列 = 点下 10 个任务只能干等。
⚠ 必须尊重既有并发闸与 credit 扣减。

---

## 三 · 后续调查方向

| #     | 要查什么                            | 为什么                                                                                                                                    | 建议方式                                     |
| ----- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| ~~①~~ | ~~`ScriptDocWorkspace` 能不能编辑~~ | **✅ 已答，见下方「① 结论」**                                                                                                             | ——                                           |
| ②     | 助手 `references` 通道到底能传什么  | 接 vision 路由的前提                                                                                                                      | 实读 + 真机发一张图试                        |
| ③     | 自动出的镜头图**质量够不够用**      | 决定 P3 值不值得做。机制通不代表出图能用                                                                                                  | 手动搭一个 shot 节点连两张卡，跑一次真实生成 |
| ~~④~~ | ~~单镜时长字段加在哪~~              | **✅ 已答：加在 `ScriptDocShotSchema`（`types/script-doc.ts:55`），一个 optional 字段。doc 级 `targetDuration` 已存在，缺的只有 shot 级** | ——                                           |

### ① 结论：`ScriptDocWorkspace` 能编辑，而且比原假设强得多

原假设「它是为两阶段生成写的，不一定支持增删镜头 / 调顺序 / 改角色配置」**被推翻**：

- 默认 `view` 就是 `'edit'`
- 有专门的编辑模块 [`src/lib/script-doc-edit.ts`](../../src/lib/script-doc-edit.ts)：`setDocText` / `setRoleField` / `setShotField` / `setDialogueLine` / `setDialogueSpeaker` / `addRole` / `removeRole` / `addShot` / `removeShot` / `addDialogue` / `removeDialogue`
- 状态走 `useNodeWorkflowActions()` **共享上下文**（不是组件本地 state）→ 编辑落进工作流状态
- 还有**字段锁**（`setScriptDocLocks` + `mergeLockedFields` + `focusLockKeys`）：用户手改过的字段，助手重新生成不会覆盖

**只缺两件**：① **没有 reorder / move —— 调顺序不支持**（三级审批门第一道若要「调镜头顺序」，这是唯一要新写的操作）② shot 级时长（见上表 ④）。

⚠ 本条是**代码实读**得到的，不是真机点 —— 当时三个项目都没有已生成的 ScriptDoc，真机摸需要先跑一次助手生成剧本。结论方向是「发现了能力」而非「没找到能力」，误判风险低，但**第一次真机用到时确认一下编辑是否真的持久化**。

⚠ **方法论教训**：这一轮我在「边为什么不显示」上判错三次，根因是**用单个项目的观察推全局结论**。后续调查一律：多项目验证 + 程序化读值（`getComputedStyle` / DOM 计数），不靠单点目测。

---

## 四 · 设计方向

### 已拍板

- 六族节点 · 名词做节点动词做动作 · 卡名在卡外 + 卡内纯媒体
- **模式决定槽轨，模型决定参数**（任务模式 tab 由模型派生）
- 皮肤 v0.2 全部数值（真机取样 + 脚本复核对比度）
- 连线三维度编码 · 强调色拆成「主动作墨色」与「指向蓝」
- **卡匣降级成注册表**：只做找到（列出/搜索/定位），不做操作场所
- 图槽轨 >6 折叠但容量条永远写全数 · 紧凑态不加按钮改加状态词

### 待落地的四条修订

| #   | 修订                                                                      | 理由                                                                           |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ①   | 主动作从「生成」变「**审阅**」，补第五态「已出但未审」                    | 自动铺出来的卡默认待审。审阅是二选一，这是「每对象一个主动作」唯一该显式破例处 |
| ②   | **名字升为一等公民**：可原地编辑 · 就是 `@token` · **空名字必须显式暴露** | 助手读不到名字这个 bug 证明了名字的分量                                        |
| ③   | **批量审阅网格**从加分项升为必需                                          | 一次铺 12 个节点后逐张点开审是灾难                                             |
| ④   | 三级审批门                                                                | 见下表                                                                         |

### 三级审批门（载体已定）

| 门            | 载体                                           | 动作                   |
| ------------- | ---------------------------------------------- | ---------------------- |
| 一 · 铺之前   | **分镜表（= ScriptDoc，已存在，不用新做 UI）** | 改完 → 铺到画布        |
| 二 · 生成之前 | 节点勾选 + 真实总消耗                          | 全选 / 取消 → 开跑     |
| 三 · 出图之后 | 图上的近场工具条                               | 通过 / 重来 / 改词再来 |

**「重做」语义钉死**：保留节点、保留连线、保留提示词，**只换 seed 重跑**。不新建节点、不断连线 —— 否则重来三次画布上多三个孤儿节点，正是「成分永不消失」的反面。

### 一条负向约束（容易被模型绕过，要做成校验不能只写 prompt）

视频分析**只产出结构与意图**（几个角色、谁和谁对戏、每镜多长、机位序列、色调倾向），**不产出具体形象描述**。参考视频里的角色是别人的角色，用户要的是配置和节奏不是复刻。
建议在 ScriptDoc 落库时校验「角色 `description` 不得包含具体外貌描述」—— 光写在 prompt 里模型总会往那边滑。

---

## 五 · 工作流程

### 会话分工

| 会话               | 职责                                         |
| ------------------ | -------------------------------------------- |
| **设计会话**（主） | 定方向、写规格进 `docs/plans/`、过闸门、验收 |
| **执行会话**       | 读文档实现，用 subagent 干活                 |

**交接靠文档不靠会话记忆。** 设计定了写进 `docs/plans/`，执行侧读文档。

### 每一片的四步

① 规格（设计会话写死结构与数值）→ ② 实现（执行会话 / subagent）→ ③ 验证（全量 tsc + 全量 vitest + **真机截图**）→ ④ 汇报（改了哪些文件 / 画面哪里变了）

### 硬要求

- 每片跑**全量** tsc（约 4 分钟）+ **全量** vitest（约 6 分钟），禁止跑子集
- 每片改完**截真机图 + 说明改动**（纯 token 层画面不变也要截，并说明「不变正是验收点」）
- 不引入 Tailwind arbitrary values（Hard Rule 5）
- 不改 API / provider / 计费 / 权限 / 持久化契约
- owner 点头才提交；**push main = 生产部署**
- ⚠ **有并行会话在动同一批文件** —— 开工前确认没人在改 `src/components/business/node/`；`git add` 别用整目录

### 分册索引

| 文档                                                                                 | 内容                                                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `canvas-implementation-stages-2026-07-26.md`                                         | 分段施工计划（含北极星、S0–S12）                                         |
| `canvas-assistant-pipeline-2026-07-26.md`                                            | 助手管道任务包 + 卡匣注册表设计 + 节点四条修订                           |
| `canvas-assembly-console-info-design-2026-07-26.md`                                  | 组装台信息设计 + 任务模式 tab + 三形态状态机                             |
| `canvas-skin-spec-2026-07-26.md`                                                     | 皮肤数值 v0.2（真机取样，对比度脚本复核）                                |
| `canvas-node-family-capability-design-2026-07-26.md`                                 | 六族节点能力 + 视频模型三形态                                            |
| `canvas-assistant-anthropic-route-2026-07-26.md`                                     | **助手模型换装**（接 Claude Sonnet 5 / Qwen 退出助手）—— 2026-07-26 在飞 |
| `canvas-visual-redesign-2026-07-25.md`                                               | 结构条款 §7.1（已确认，不重开）                                          |
| `canvas-cd-driving-protocol-2026-07-25.md` · `canvas-cd-round2-prompt-2026-07-26.md` | CD 喂法与产出审计                                                        |

## Last Verified

- 2026-07-26 · opus 5。进度基于本会话实做与提交 `aa029046`；S3 实测数据来自并行执行会话（6 边 / 10 节点，四档 stroke 值程序化读取）。开发需求 P3 的「零新建」结论实读 `node-connection-rules.ts:16-18`（shot 收割 character + background 为具名参考图并注入图例）。ScriptDoc 字段实读 `types/script-doc.ts`。助手无法操作画布为真机实测（两次不同问法，节点数恒定）。
- **2026-07-26 晚 · 两个存疑项复验**：「边不画」为真机程序化实测（两个项目、四种场景、`document.querySelectorAll` 计数 + `visibilityState` / handle 计数 / localStorage 边数交叉验证）；`ScriptDocWorkspace` 为代码实读（`script-doc-edit.ts` 导出清单 + `useNodeWorkflowActions` 状态归属 + `ScriptDocShotSchema` 字段），**未真机点**。助手路由现状四家（Gemini / OpenAI / DeepSeek / Qwen）为真机截图确认。
- **2026-07-26 晚 · 设计会话 3 状态核对**（本次改的都是这一轮核出来的）：`git log` + `git status` 确认 `aa029046` 是当前唯一画布提交、S3.5 六个文件仍在工作区、globals.css/layout.tsx 清场未提交（故 HEAD 不自洽）。S3.6 三个缺口逐条实读：彗星流光在 `canvas.css` 无对应 keyframe；`--canvas-edge-pending` 全仓仅定义处出现；`revealed`/`selected` 取值与宽度实读 `node-studio.ts:688-712`。P0-A 病因实读 `node-assistant.service.ts:65-105/167` + `node-assistant-request.ts:32-56` + `StudioNodeAssistantDock.tsx:210`，`[[node:` 全仓 grep 只命中 service 与两个测试。P0-B 实读 `StudioNodeWorkbench.tsx` 1225–1300 确认 cap 仍在 `@` 过滤之前。**「打开项目边不画」是单样本观察，尚未复验。**
