# 画布助手 · 操作员化对齐方案（2026-08-30）

> **状态：方向已拍板（owner 2026-08-30，四点见 §六），任务书未写，⛔ 未开工。**
> 排期在工作台包 P2–P4 之后。本文是「工作台助手操作员化」
> （`studio-assistant-operator-2026-08-30.md`，下称工作台包）的画布对齐方案。
> 依据 = 2026-08-30 两路只读调查（代码链路 + 既有拍板收拢），文中 file:line
> 均为**候选锚点**（从这查，别当结论）。

## 〇、一句话

画布助手从「一次性 `[[canvas-ops]]` marker 块」升级为与工作台同一套**操作员事件流**
（plan / step / confirm / inverse），钱闸从「一次确认即生成」收紧为**预填节点生成键**
（`generate` op 退役，生成永远用户点），并借工具环的「按需读」根治 K-3 / K-4
（线路挑错、不读角色卡）两条真机缺陷。

## 一、现状判断（调查结论压缩）

**链路**：画布助手今天是文本 SSE + 正文内 marker 块——服务端只吐 `text` 帧，
op 藏在 `[[canvas-ops]]…[[/canvas-ops]]` JSON 里，客户端剥出→模拟图上规划→
workbench 执行（`handleRunAssistantCanvasOps`，候选锚点 `StudioNodeWorkbench.tsx:3729`）。
服务端全程不认识「op」。10 条 op 词表，8 条 AUTO_APPLY 免费直落，
`set_review_state` / `generate` 逐条确认。

**画布已经比工作台激进、且要保留的**：

- 结构 op 免费直落不确认（owner 2026-08-08 拍板，⛔ 别退回「点一下」档）；
- 一批 op = 一个撤销步（`runAsSingleHistoryStep`，B2.5 已交付带单测）。

**三个真缺口**：

1. **钱闸是 UI 级不是结构级**——`generate` op 存在于词表，一次确认后客户端直接
   `handleGenerateMediaNode`；`runAssistantCanvasOps` 的签名不分 op 类型，传什么执行什么；
   全仓唯一的 money-gate 结构性测试在工作台侧，画布零对应件。
2. **上下文瞎**——模型看不到边（edges 只给客户端规划器用，不进请求）、看不到项目名、
   看不到角色卡外观与参考图 URL（投影层显式剥掉）、看不到 ScriptDoc。
   域简报 `ASSISTANT_DOMAIN_BRIEFS.canvas` 定义了但零消费者，三档收敛协议画布不用。
3. **一次性投包，无过程**——没有 plan/step 流、没有逐步理由、没有插话转向；
   BYOK 路线整段缓冲后一块吐（伪流式）。

**K 系列账**：K-1/K-2（镜头文本落错字段、连线计数说谎）**已修**
（2026-08-29，落点表 + 不变量测试；⚠ `generation-capability-findings-2026-08-29.md`
里的状态未回填，开工前 `git log` 复核一次）。**K-3/K-4 未修**，且根因都在本方案的改造面上：

- K-3：`set_model` 载荷只有 model id 没有渠道字段，渠道由「列表第一条能跑的」决定
  （候选锚点 `node-assistant-op-plan.ts:499`），节点上不显示线路名 → fal 被默认选中，贵 2.2×。
- K-4：上下文投影只给 `refs: 2/3 (identity from img-7)` 这种计数，角色外观字段与图 URL
  一个字不进 payload（候选锚点 `node-assistant-context.ts:182-186`）→ 模型只能编外观。

## 二、方案核心（六条）

### 1. 协议对齐：复用 P1 六件，换画布工具表

直接复用（零改或近零改）：事件协议（`open/plan/step/confirm_request/message/done|stopped|error`）·
成帧器 `toAssistantOperatorSseResponse` · step 契约骨架（`readStep`/`mutatingStep`，
**inverse 在函数签名层强制**）· 工具环循环骨架（maxSteps / abort 双检 / observation 回灌 /
rejected 进流让模型改口）· api-client SSE 解析 · 线程条目模型与 store 骨架
（`use-studio-operator-store` 的 `useSyncExternalStore` 模式）。

画布侧新做：**画布工具表**（见 §2.3）· **图工作副本**（nodes+edges+批内新建别名，
替代工作台的表单字段副本）· **确认复合键**（`nodeId+field`，工作台只有
`prompt|negative` 两个平键）。

`ASSISTANT_OPERATOR_DOMAINS` 加 `canvas`（常量注释写着「画布对齐是 P4」，
但工作台包 P4 扩域清单没列画布——落地时把两处口径改一致，画布对齐按本方案单独成包）。

### 2. 钱闸：`generate` op 退役 → `prime_node_generate`

- 编排模式下（即本方案全部范围）：助手把节点的 prompt/模型/渠道/参数/参考全填好，
  最后一步只能把**该节点的生成键置为 primed 态**（节点卡上亮起、可多节点各自 primed），
  点的人永远是用户。`generate` 从词表整删——「生成永不出现在 ops 里」（工作台拍板 2）。
- **不算价**：画布「我这边不做积分」owner 已两次拍（2026-07-27 删 ⚡ 占位、2026-08-09 再否），
  primed 态只做视觉与聚焦，不复刻工作台的 cost preview。**别再提第三次。**
- 结构性测试两道：① 服务端画布操作员 service 沿用 P1 money-gate 模式
  （import 白名单 + 禁标识符）；② **客户端新增**——画布 apply 模块（§2.5 抽出后）
  读源码禁 `handleGenerateMediaNode`/generation 相关标识符。画布执行在客户端，
  只锁服务端挡不住，这是画布与工作台钱闸的关键差异。
- **自动导演模式不在本方案**：导演内核边界 4/11（AI 授权两模式、循环控制器
  `autoApprove=false`）归导演线，将来以显式策略位叠加，与本方案不冲突。

### 3. 画布工具表（草案）

读类（readStep）：
| 工具 | 语义 |
| --- | --- |
| `read_graph` | 图概览：节点+**边**+选中+项目名+ScriptDoc 摘要。替代今天 32 节点一次性前置投影 |
| `read_node` | 单节点全量事实：角色卡外观字段、参考图列表**含 URL**、参数。**K-4 的根治载体** |
| `search_assets` | 与工作台同一工具（BY 检索天花板共担） |

改类（mutatingStep，inverse 必填；**数组载荷 = 一步一批**，对齐「批 = 一撤销步」）：
| 工具 | 语义 | inverse |
| --- | --- | --- |
| `stage_nodes` | 建节点（批量） | 删这些节点 |
| `connect_nodes` | 连边（批量；合法性仍唯一走 `node-connection-rules.ts` 查表） | 删这些边 |
| `set_node_fields` | 按**族类型化字段表**改节点内容（rename/prompt/分类/参数归并；K-1 落点表的延续）。覆写用户手写字段走 `confirm_request`（追加/覆盖/保留小条，对齐工作台拍板 3；assistantWrittenFields 语义照搬） | 改前值 |
| `set_node_model` | 模型 + **渠道**两个一起下（**K-3 根治**；目录里给模型看的每行带渠道与相对价签） | 改前模型+渠道 |
| `attach_refs` | 挂参考（画布卡图集 / 素材库）。「卡只出不进」不受影响——挂的是媒体节点的引用架 | 摘除 |
| `update_script_doc` | 写 ScriptDoc（大纲/镜头）；投影仍走 `previewScriptDocProjection` + 既有确认门 | 改前文档 |
| `set_review_state` | 保留，逐条确认；`approved` 硬禁不变 | 改前状态 |
| `prime_node_generate` | 置节点生成键 primed；不算价、不生成 | 回灰 |

词表守门原则不变：**op 词表只能表达 ＋添加 菜单里有的东西**（助手不比人手多一条暗路）；
**助手只动用户看得见的旋钮**（工作台拍板 19 与画布既有原则是同一条）。

### 4. 上下文根治（K-4 及同族）

- 请求快照补齐：**edges、projectName、ScriptDoc 摘要**进 `read_graph`；
- 角色事实按需读：`read_node` 返回卡的外观字段 + 出场图组 URL，系统提示补一条
  「铺叙事节点前必须先 `read_node` 画布上的同名角色卡，外观以卡为准，禁止自行描述」；
- 挂参考成为一等动作：视频/图片节点铺完即 `attach_refs` 卡的出场图（K-4 里
  「视频节点没挂任何参考图」的那半）；
- 画布接入 `ASSISTANT_DOMAIN_BRIEFS.canvas` 与三档收敛协议（今天画布自写 persona、
  无收敛协议，「第一轮别直接出成品」在画布不成立）。

### 5. 叙事流：双路并存，以「真人操作员的自然路径」为准（owner 2026-08-30 拍板）

owner 原话：「就像你今天在画布中的操作一样。」——即助手像一个真人操作员那样
自由使用画布的既有路径，**不设 schema 级硬闸**：

- 长叙事/成套剧本 → 助手应当先 `update_script_doc` 再投影（真人处理长剧本的自然做法；
  「自由对话不落 ScriptDoc」的老缺口由此闭合——聊出的剧本助手自己落文档，
  不再要求用户展开 ⤢ 手点「起草大纲」）；
- 零散/小批量节点 → 直接 `stage_nodes`/`connect_nodes`（真人也这么干）。

引导写在系统提示（操作员习惯），不写在 schema 禁令。⚠ 直接铺节点这条路必须继续
钉着 K-1/K-2 的防线（按族落点表 + 不变量测试）——「铺完即错」的土壤不因双路并存而回来。
剧本脑 → ScriptDoc → autospawn 仍是核心架构（曾丢过一次），双路是入口自由，不是架构后退。

### 6. UI：共底盘不共实例（推荐，待拍板）

复用操作员面板的**组件与线程模型**（LogItem / Lightbox / 二击清空 / 工作态 ⏹ /
日志详情+撤销划线+系统行），但画布**独立实例**，不并入工作台的连续线程：

- **画布线程按项目分槽**（现状 `NODE_CANVAS + projectId` 落库，比工作台还先进——
  操作员线程落库是工作台 P4 才做的事），并不进工作台域 chip；
- 画布既有拍板的特例全保留：历史入口在左侧 activity rail（assistant-shell §2.3
  已拍的导航例外）· 面板可拖位置 · ScriptDoc 展开态 `min(64rem,72vw)`；
- **注意力收放法则不挪用**：「点工作台任意处→收」在画布语义冲突（点空白 =
  取消选中/平移），画布保持手动开合 + FAB；
- 宽度记忆第三把独立键（`studio-assistant-operator.ts:24-31` 已明文「记忆键必须与旧 dock 分开」）；
- `CanvasOpProposalCard` 三档混合体整体退役，由 plan 条 + step 行 + 确认小条 +
  批回执行（带撤销）接替；
- 顺路消化：B-20（单栏↔两栏硬切无动效，用 motion 补，禁 GSAP）、B-21（dock 遮挡
  详情面板 246px 的 z 层关系，面板重做时一并定）、B-13（三档文案漏第三档，新 UI 重写）。
- **mock 先行**：画布 UI 台账拍板=载体是 Fable 出 HTML 原型、owner 批了才动 `src/`；
  视觉维持现有皮肤（2026-08-02 拍板），动效只用 motion。

## 三、与既有拍板的对账（调查登记的八处冲突逐条表态）

| 冲突                                                        | 本方案立场                                    | 需 owner 拍？             |
| ----------------------------------------------------------- | --------------------------------------------- | ------------------------- |
| 「生成永不出现在 ops 里」vs 画布 `generate` op 现存         | `generate` 退役换 prime（§2.2）               | **是（拍板点①）**         |
| 工作台 primed 算价 vs 画布「不做积分」两次拍                | 画布 primed 不算价                            | 否（既有拍板直接沿用）    |
| 拍板 3 就地确认小条 vs 画布确认长在提案卡                   | 随提案卡退役，字段覆写改就地小条（复合键）    | 否（对齐即答案）          |
| 面板 560px vs 画布共享壳 360px / Script 态 72vw             | 画布独立实例，几何走画布自己的契约            | **是（拍板点②的一部分）** |
| 注意力收放 vs 画布点空白已有语义                            | 画布不挪用收放法则                            | 否（语义冲突，无第二解）  |
| 历史入口位置（头部菜单 vs activity rail）                   | 画布保持 rail（已拍的例外）                   | 否                        |
| `unified-ai-assistant-2026-08.md` §1 已被 Q2 作废但文件未改 | 本包落地时顺路改掉该残句                      | 否                        |
| `domains/canvas.md` 停在 07-19、多轮拍板未回填              | 本包收口时回填（完成即删规矩下沉 references） | 否                        |

## 四、旧账吸收表（B 系清单的去向）

**本方案顺路消化**：B-3/K-3（渠道字段+线路显示）· B-4/K-4（read_node+attach_refs）·
B-5（自由对话落 ScriptDoc）· B-12（自动落零单测——apply 抽层后带测试）·
B-13 · B-20 · B-21 · B-24/O（重生成丢规格——`set_node_fields` 参数与分辨率成对下，
台账 AE/BG/BS 同款教训）· B-11（半截标记闪烁——marker 链路整体退役后消失）。

**显式不做（不在本方案）**：B-17（「从画布并入」入卡手势）· B-18/B-19（token 去留 /
绑定真相住哪 A/B/C——**上游未拍板**，本方案不押注：`attach_refs` 走现有引用架通道，
token 语义一字不动；若日后拍 C「对话为真相」需回头重估本方案的 attach 语义）·
B-22（批量队列与取消——先补取消再做队列，另立线）· B-14（`role=background` 投影，随 G5）·
自动导演模式（导演线）· `web_search_import` 画布侧（跟工作台 P3 的比价结论走）。

**共享天花板（记录，不由本方案解）**：BZ——LLM 层无原生 tool-calling，工具环 =
每步一次 strict-JSON 完整往返，maxSteps 内每步都是钱和延迟；画布用「一步一批」压往返数。
CA——`llmTextCompletion` 不吃 AbortSignal，插话转向的粒度钉在单步耗时上；
**建议把「`LlmTextInput` 加 signal」修进 C0**（工作台同受益）。

## 五、分片草案（拍板后细化成任务书）

| 片  | 内容                                                                                                                                                           | 验收                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| C0  | 画布域契约 + 服务端工具环（工具表/图工作副本/inverse/确认复合键）+ money-gate 双测试之①（服务端）+ CA 的 signal 修复                                           | 契约与工具环单测；**每个改动型 step 无 inverse 即测试失败**（工作台同款硬判据）                                     |
| C1  | 执行层：把 workbench 里的 op 执行（候选锚点 3729-4110）抽成 `canvas-operator-apply` 可测模块；批=一撤销步接线；money-gate 之②（客户端）；rail 撤销语义（见下） | apply 单测 + 撤销真机验证（B2 前科：验不过退回）                                                                    |
| C2  | 面板 UI：mock（Fable 出 HTML）→ owner 批 → 共底盘实例化；`CanvasOpProposalCard` 与 marker 链路**平价后整体退役**（不加 flag，本仓 flag 文化已死）              | 真机交互清单（对照 mock 逐项）+ 三语键数一致                                                                        |
| C3  | 上下文根治（edges/projectName/ScriptDoc 摘要/角色事实）+ ScriptDoc 工具 + 三档协议接入                                                                         | **真机重跑 2026-08-29 的四镜叙事题**：线路=BytePlus、外观与卡一致、参考图已挂、台词语言正确——K-3/K-4 的原题即验收题 |

**rail 撤销语义（画布与工作台的一处诚实差异）**：工作台表单字段彼此独立，逐步 inverse
随便撤；画布图 op 有依赖（删了节点，后续连它的边成孤儿）。方案：`set_*` 类字段级
逐步可撤；`stage_nodes`/`connect_nodes` 结构类只提供**「撤销这一批」**（映射
`runAsSingleHistoryStep` 那一步，仅当它仍是最近一步时可点，否则置灰并给理由）。

## 六、拍板记录（owner 2026-08-30，全部已定）

1. **`generate` op 退役换 primed 键** ——「生成永不出现在 ops 里」延伸到画布，
   08-08 三档闸中的 generate 档就此改拍；自动导演的口子按模式切留给导演线。
2. **底盘并入深度 = 共组件独立实例** —— 日志条/灯箱/线程模型/store 骨架复用，
   画布线程按项目分槽、历史留 rail、几何走画布契约，不并工作台域 chip。
3. **撤销粒度 = 字段级 + 批撤** —— `set_*` 类逐步 inverse 可撤；`stage_nodes`/
   `connect_nodes` 结构类只给「撤销这一批」（仅当仍是最近一步）。
4. **叙事路径 = 双路并存**（owner 原话「就像你今天在画布中的操作一样」，
   解读见 §2.5；⚠ 若 owner 本意是强制过 ScriptDoc，以 owner 更正为准）。

## 七、风险

- **多宿主前科**：dock 内部 `<AssistantConversation>` 写了两遍（展开/收起态各一份
  11 个 props），历史面板也是两宿主——C2 重做时**必须合并成单一渲染点**，
  这是「一个 panel N 个宿主，验一个≠验全部」的画布本地版。
- **死代码顺路清**：`CanvasAssistantToggle.tsx`（只弹 notImplemented，唯一引用是 barrel）。
- **成本**：工具环把一次往返变多次往返（BZ），画布批量语义能压但压不没；
  C0 验收里要带一条「同题 token 用量对比（marker 链路 vs 工具环）」，超过 2× 要回来重议。
- **在飞冲突**：开工前 `git status` 对表；工作台 P2 正在收尾，共用的 operator
  基建文件（constants/types/stream/store）以 P2 合入后的形态为基线。
