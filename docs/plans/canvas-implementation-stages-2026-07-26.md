# 画布重设计 · 分段施工计划（2026-07-26）

> **状态**：owner 2026-07-26 拍板 —— **停止 Claude Design 迭代**，剩余设计在主会话完成，实现分段推进：**先整个框架，再逐个功能**。
> **上游（全部已拍板，实现期不再重开）**：[信息设计](canvas-assembly-console-info-design-2026-07-26.md) · [皮肤数值 v0.2](canvas-skin-spec-2026-07-26.md) · [布局与节点族](canvas-node-family-capability-design-2026-07-26.md) · CD 第二轮产出审计（已删，见 git 历史）
> **CD 产出的用法**：`05c6d4b5-96fd-4d8a-bdbc-537a16bfed54` 的三个文件是**行为与动效的参考实现**，不是可合入代码（`ui-page.md` 红线）。Sonnet 按本文与规格手工翻译成 shadcn + domain token，**不 import 原型代码**。
> **lane**：`src/app/canvas.css` + `src/components/business/node/**`；吞噬退役另有 4 处在 lane 外（`use-cast-ingest.ts` · `node-studio.ts` 的 `NODE_STUDIO_INGEST_*` · `globals.css` 的 `--ease-ingest` · `motion.ts` 的 `EASE_INGEST_CSS`/`INGEST_MOTION`）。

## 0.0 · 北极星（owner 2026-07-26 追加，**优先级高于本文其余排序**）

> **一句话 + 一堆素材 → 助手自动铺好整张画布 → 出片。**

owner 原话：从助手这边输入「我想做一个什么视频」，我提供图片素材和音频素材，
它可以自动帮我创建好所有节点并最后生成视频。

这句话把分段计划的排序改了：

| 原判                             | 现判                                              |
| -------------------------------- | ------------------------------------------------- |
| S11「助手链」是靠后的功能片      | **它就是产品目标本身**，不是锦上添花              |
| 投影只投角色图、静帧与音频要手搭 | 「自动创建好**所有**节点」= 投影必须覆盖全族      |
| 批量队列是「新增能力」           | 一句话铺 N 镜必然是批量，队列是必要条件不是加分项 |

前端侧 owner 同时定调：**所有 UI 都要升级重新设计，先从节点开始，风格follow
已出的 v0.2 / CD 那版**。S1 只换了节点**外壳**，五族卡的**卡内**仍是旧皮
（`node-card-paper` 的变量覆盖还在），那是「先从节点开始」真正指的东西。

⚠ 因此本文 §2 的功能段顺序需要在吞噬退役后重排一次，不要照着旧编号硬走。

## 0.1 · 每一段都是「一个 CD 组件」（owner 2026-07-26 追加）

第二轮的教训是一次交十格状态、十条动效，评审面太宽、反馈只能整体说。改成：

> **一段 = 一个 CD 组件 = 一次评审 = 一片实现。**

每段固定四步，不跨段并行：

| 步     | 谁            | 产出                                                              |
| ------ | ------------- | ----------------------------------------------------------------- |
| ① 规格 | 主会话        | 该组件的自包含粘贴稿（结构 + 数值全给死，只让 CD 做视觉与动效）   |
| ② 设计 | Claude Design | **只做这一个组件**，复用项目里已有组件（`dc-import`），不重画别的 |
| ③ 闸门 | 主会话        | 18 项逐条过；数值用脚本比对源码变量，不目测                       |
| ④ 落地 | Sonnet        | 按文档手工翻译，不 import 原型代码                                |

**CD 项目继续用 `05c6d4b5-96fd-4d8a-bdbc-537a16bfed54`**（不再新开）—— 组件要能互相 `dc-import`，第二轮的 `AssemblyCard` 与 `CanvasScene` 是后续组件的复用底座。⚠ Design system 必须保持 **None**（56 组件库是污染源）。

## 0 · 分段原则

`StudioNodeWorkbench.tsx` 3348 行是成本中心，布局联动（助手分栏 / `bottomRowInsetPx` / CastDock / BottomDock / React Flow resize）全汇在这里。禁区明写「不提出没有分片路径的方案」，所以：

1. **每一片都能单独真机验证**，不依赖下一片。
2. **纯呈现层的片排在结构片前面** —— 先换皮，再动空间，最后动能力。
3. **动 `StudioNodeWorkbench` 的片只有一个**（S2），其余片不碰它。
4. 每片结束跑全量 `tsc` + 全量 `vitest`（约 4.5 分钟，禁止跑子集）。

## 1 · 框架段（S0–S3）

### S0 · 皮肤地基

**范围**：`src/app/canvas.css` 的 `.domain-canvas` 落 v0.2 全部 token（浅色 + `[data-scheme='dark']` 深色）。**零组件改动。**
**落点**：`src/app/canvas.css`
**不做**：不改任何 `--node-*` 旧值，两套并存直到旧皮退役。
**验收**：DevTools 里 `.domain-canvas` 上能读到全部 `--canvas-*`；旧皮渲染完全不变（因为还没有组件消费新 token）。
**依赖**：无。**这是所有后续片的前提。**

⚠ 落地前用确定性脚本复核对比度（规格 §13），不要目测。

### S1 · 节点外壳语言

**范围**：

- 画布底：`#F1F1F1` + `radial-gradient` 圆点 `rgba(200,200,200,.447)` 半径 1px、间距 **48px**（现状 `NODE_STUDIO_CANVAS.background.gap = 44`，改 48）。
- `NodeShell.tsx`（363 行）：**卡名移到卡外上方**（`600 15px/24px` + 族图标 + `margin-bottom:4px` + 左对齐卡左缘）；卡内 `padding:0`；圆角 8px；`1px rgba(0,0,0,0.08)` 发丝边；静态无投影，hover 才 `0 4px 24px rgba(0,0,0,0.08)`。
- 端口：形状 + 族色双编码（图=实心方 / 音=实心圆 / 视=空心方 / 身份=圆环），族色用规格 §7 的四值（**不是 CD 稿自配的那组，它的图端口落在蓝区**）。
- 选中态：`2px var(--canvas-accent)` 环，`inset:-4px`、圆角 12px。

**落点**：`src/app/canvas.css` · `nodes/NodeShell.tsx` · `CanvasSurface.tsx`（背景）· `constants/node-studio.ts`（gap 值）
**验收**：五族卡在画布上都长成新外壳；卡名在卡外；React Flow 的节点尺寸与命中区没被卡外标题撑坏（**这是本片主要风险**）。

### S2 · Chrome 骨架（唯一动 StudioNodeWorkbench 的片）

**范围**：

- **顶栏**（48px）：返回 + 项目名 + 项目切换 · **视图切换「画布 / 序列」分段控件**（序列视图本身未实现，本片只做切换器与占位）· 右侧 credits/助手开关。
- **左侧合体玻璃面板**（`296px = 56 图标轨 + 240 内容区`，圆角 16px，`rgba(255,255,255,0.80)` + `blur(35px)`）：图标轨自上而下 = **＋添加**（唯一墨色实底主按钮，与下方分隔线隔开）→ 班底 → 素材 → 模板 → 历史；内容区默认展示班底架。**`CastDock.tsx`(576) 从底部横匣迁进这里。**
- **底部中间玻璃胶囊**（`≈459×52`，全圆角，`rgba(255,255,255,0.85)` + `blur(20px) saturate(1.5)`）：选择·手 / 缩放 `− 100% +` / 适应 / 撤销重做。**`CanvasBottomDock.tsx`(252) 重构成这个。**
- **右助手 dock**：默认**收起**。
- **断点策略**：≥1600 左面板常驻 + 右 dock 可同开；1024–1600 打开助手时左面板自动收成 56px 轨；768–1024 左面板默认收成轨；<768 不渲染完整画布。

**落点**：`StudioNodeWorkbench.tsx` · `CanvasWorkspaceLayout.tsx` · `CanvasTopBar.tsx` · `CanvasBottomDock.tsx` · `CastDock.tsx` · `src/app/canvas.css`
**验收**：四个断点逐个真机看；助手开合时左面板行为正确；画布可视区在 1440 宽下 ≥700px。
**风险最高的一片** —— 建议单独一个 PR，不与别的片混。

### S3 · 连线语言

**范围**：已建立 `#8A8A8A` 3px 实线 `linecap:round`；未就绪 `#A3A3A3` 1.5px 虚线 `6 5` `opacity .6`；选中叠彗星流光（`stroke-dasharray:14 306`，2.2s 循环，仅明度不换色相）；命中区透明 `stroke-width:16`。
**落点**：`edges/NodeWorkflowStatusEdge.tsx` · `node-workflow-edge-visual.ts` · `canvas.css`
**验收**：一屏 20 条边时不吵；虚线只出现在「未就绪」关系上，不做装饰。

**真机验证结果（2026-07-26，「AI拟人剧场」6 条边 / 10 节点）**：三维度编码本身**成立**，数值从
`getComputedStyle` 读出，非目测 —— 已建立 `#8a8a8a`/3px/实线/round（4 条）· 未就绪
`1.5px`/`6 5`/`opacity .6`/butt（1 条，源头恰是无媒体的镜头图，语义判定正确）· 边自身选中
`#2a2a2a`（域内 `--node-paint` 已重映射成中性墨，石绿确认退出）。

**但同时验出三个缺口 + 一个前置阻断**，见 §1.5。

### S3.5 · 吞噬折叠退役（S3 的前置，验证驱动补入）

S3 的语言是对的，**但 6 条边只画得出 5 条**。缺的是「散图→组装台」，源节点也一并从画布消失
（9/10）。两道闸串在一起：

1. `StudioNodeWorkbench` 的折叠规则 `isLooseImageNode && hasOutgoingEdge` → 节点 `hidden`
   → `renderedEdges` 的「两端可见」守卫连边一起藏。**吞噬把 S3 要展示的那条关系，正好在它
   被建立的瞬间抹掉了。**
2. 更深一层：`LooseImageCard` **根本没有 `<Handle>`**。它不走 `NodeShell`，而吞噬时代散图
   「一连上就消失」，所以从没人发现它缺锚点 —— ReactFlow 没有 bounds 就静默不画这条边。
   同一个组件也被**有图的镜头图**用，那是**骨干边**：镜头一出图，`镜头图→组装台` 同样会断。
   （`VideoReferenceNode` 早就踩过这个坑并单独补过 handle，注释里写着 owner 真机「线断了」。）

**范围**：

- 折叠规则只剩 `fusedIntoNodeId` 一种（referenceAssets 融合，那条路径不建边、内容真的搬进
  了目标卡，两处同显才是重复 —— 补真边是另一片）。
- `handleNodeDragStop` 的散图分支删掉，并入已有的行①②③「墨线签署 + 本体归位」路径。
- 抽出共享 `NodeCardPorts`（`NodeShell` 导出），`NodeShell` / `LooseImageCard` /
  `VideoReferenceNode` 三处共用一份锚点定义。顺带修好 `VideoReferenceNode` 那份副本漏掉的
  `canvas-port` / `data-family` —— S1 之后它的端口一直是隐形的。
- i18n：`ingest.canvasNodeIngested`（"已吞入目标节点"）删除，散图改用
  `canvasNodeSigned`（"已建立引用，本体留在画布上"）；`canvasNodeIngestRejected` 的
  "没吞下" 改成不带吞噬语汇的说法。三语同步。

**落点**：`StudioNodeWorkbench.tsx` · `nodes/NodeShell.tsx` · `nodes/LooseImageCard.tsx` ·
`nodes/VideoReferenceNode.tsx` · `messages/{en,ja,zh}.json`
**验收**：同一项目 **6/6 边渲染、10/10 节点渲染**（已达成）；散图拖进消费者后本体归位不消失。
**未做**：`fusedIntoNodeId` 那条通路仍然零边（「鸣潮」有 1 例）—— 补真边另开一片。

### S3.6 · S3 三个缺口（未做）

1. **彗星流光没实现** —— §S3 写的 `stroke-dasharray:14 306` / 2.2s 在代码里不存在，选中的边
   `animationName: none`；`canvas.css` 只有 running 的 `node-canvas-edge-pulse`。
2. **`--canvas-edge-pending: #a3a3a3` 定义了没人消费** —— `node-workflow-edge-visual.ts` 用的是
   `--node-edge`(#8a8a8a) + opacity，规格里那个专用值是死的。
3. **显现态与选中态几乎同色**（`#3a3a3a` vs `#2a2a2a`，同粗细）—— 「谁被选中」这个信息实际
   没编码出来。

另有一处**不属于 S3** 的伤：minimap 仍是深色（`rgb(16,24,32)`，节点标记深色叠深色），在白底
画布上是个黑洞 —— S2b 只改了 `--canvas-minimap-left` 让位，没重映射配色。

## 2 · 功能段（S4 起，逐个功能）

| #      | 功能                                                                                                                  | 主要落点                                                                         | 依赖                          |
| ------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------- |
| **S4** | **任务模式 tab + 模式决定槽轨**；mode-by-input 退役，模型 id 改由 `(品牌, 档位, 供应商, 模式)` 四元组确定性解析       | `VideoComposer.tsx` · `use-video-composer.ts` · `video-model-resolver.ts`        | S0–S1                         |
| **S5** | **容量与 @ 提及可见性**：有效上限（含跨模态 `12 - videos - audios`）· 编号角标 · 未被提及/不会发送 · 迁移护栏悬崖提示 | `ReferenceManagerPanel.tsx` · `node-video-send-preview.ts` · `VideoComposer.tsx` | S4 + 已挂的「@ 过滤顺序」修复 |
| **S6** | **两档密度 + 原地长大**：card 三行 · detail 卡原地长大 + 画布自动平移避让                                             | `VideoComposer.tsx` · `node-detail/` · `StudioNodeWorkbench.tsx`（视口平移）     | S2 + S4                       |
| **S7** | **动效十条 + reduced-motion**                                                                                         | `canvas.css` · 各组件                                                            | S1–S6 全部就位                |
| S8     | 画布级粘贴（MIME 分流：图→图片卡 / 视频→视频素材卡 / 音频→声音卡 / 文本→便签）                                        | `CanvasSurface.tsx` · `StudioNodeWorkbench.tsx`                                  | S2                            |
| S9     | 声音卡台词（TTS）+ 音效（SFX）两 kind                                                                                 | `VoiceNode.tsx` · 音频 service                                                   | —                             |
| S10    | 视频抽帧 + 截段                                                                                                       | `VideoReferenceNode.tsx` · `video-thumbnail.ts`                                  | S1                            |
| S11    | 助手链：分镜两道门 UI · 投影补静帧与音频 · 批量真实队列                                                               | `ScriptDocWorkspace.tsx` · `node-workflow-script-doc.ts` · 新队列                | S2                            |
| S12    | 序列视图（第二视图）                                                                                                  | 新                                                                               | S2                            |

音乐生成、视频续接（`native_extend`）、首尾帧、视频编辑 —— **各自独立任务，不进本计划**。

## 3 · 本轮补定的两条（owner 2026-07-26 授权在此定夺）

### 3.1 图槽轨折叠收纳 —— **做，阈值 6**

CD 提出展开态全高约 1030px、九个图槽占 190px，建议折叠。**采纳，但绑一条**：

> 槽位数 > 6 时折叠成「前 6 + 展开 N 张」，**但容量条永远写全数（`9/9 图`）**。

理由：折叠会削弱「满载一眼可见」，而满载的可见性本来就该由**容量条**承担、不该由数格子承担。两者因此不冲突 —— 数字管上限，格子管内容。

### 3.2 紧凑态主动作 —— **不加按钮，加状态词**

card 档保持三行（模型名 / 容量条 / 参数 chip），**不放主动作按钮**；改为在容量条行右端放一个状态词：`就绪` / `还差 1 张图` / `生成中` / `失败`。点卡即展开，动作在展开态执行。

理由：card 档的职责是**可比较**（一屏十张镜头卡横向对照）。每张都挂一个按钮会变成按钮墙，和「卡 = 媒体本身」的克制正面冲突。「下一步点哪」这一问用状态词回答已经足够——它告诉你该点哪张卡。

### 3.3 顺带修订上游规格的两处

1. **`--canvas-accent` 的定义放宽**：从「只用于选中 / 活跃」改为「**指向：选中 / 活跃 / 引用**」。`@林皎` 这类引用 token 与选中同属"指向某个对象"，用同一个蓝自洽；CD 稿给 token 加了 `background: var(--canvas-card-bg)` 底，不会与选中环混淆。
2. **组装台部件顺序的自相矛盾已消解**：外壳规则的「媒体窗在上、控制区在下」为准，结果监视区在**卡顶**。理由（CD 提出，接受）：紧凑态与展开态的卡片身份不变、入边端口位置稳定。信息设计 §3 的部件编号顺序据此更正。

## 4 · 交接给 Sonnet 的硬要求

- **不 import CD 原型代码**，按文档手工翻译成 shadcn + domain token。
- 不引入 Tailwind arbitrary values（Hard Rule 5），全部走 `@theme` 或 `.domain-canvas` 作用域变量。
- 不改 API / provider / 计费 / 权限 / 持久化契约。
- 每片结束跑**全量** `tsc`（约 4 分钟，禁止因超时跳过）+ **全量** `vitest`（约 4.5 分钟）。
- owner 点头才提交；push main = 生产部署，先过 `docs/checklists/release.md`。

## Last Verified

- 2026-07-26 · opus 5。分段依据：canvas-redesign-current-state-2026-07-25.md（已删，见 git 历史） 的组件版图与风险点（`StudioNodeWorkbench` 3348 行 / `CastDock` 576 / `CanvasBottomDock` 252 / `NodeShell` 363）· 皮肤 v0.2 全部数值 · 信息设计与状态机 · CD 第二轮产出的 18 项闸门审计（数值零改动，三条编造事实已记录）。未修改任何产品代码。
