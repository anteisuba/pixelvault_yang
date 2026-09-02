# 画布助手 · 操作员化任务书 C0 / C1（2026-09-01）

> **状态：待 owner 点头，⛔ 未开工。** 方向四点 owner 2026-08-30 已拍板；本文是那份提案
> （`git show 9809a07:docs/plans/canvas-assistant-operator-proposal-2026-08-30.md`）
> 的第一份任务书。分工：Claude 主会话只做设计 / 验收 / 方向判断；调查、改码、跑测试
> 全部派子 agent。完成即删，结论沉淀进 `references/pages/assistant-shell.md` 与
> `references/pages/node-canvas.md`。

## 〇、2026-09-01 复核：提案锚点失配表（子 agent 只读核对结果）

| 提案说法 | 实际 |
| --- | --- |
| 投影在 `services/node/node-assistant-context.ts` | 在 **`src/lib/node-assistant-context.ts`**（223 行；:177-188 剥 URL，:182 注释「url 一个字都不进 payload」） |
| `set_model` 选渠道 near :499 | `src/lib/node-assistant-op-plan.ts` **:502**（`matches.find(isRunnableModelOption)`，载荷无渠道字段） |
| 宽度记忆键注释 :24-31 | `constants/studio-assistant-operator.ts` **:17-25**；常量 :26-33 |
| 画布会话只在 localStorage | **错。** 画布会话已走 DB（`use-assistant-conversation.ts` 以 `surface:'NODE_CANVAS'` + `persist:true`）；`src/lib/node-assistant-history.ts`（localStorage）三个函数是**死代码**，只被两处 import 类型 |
| K-1 / K-2 | 已修（落点表 `constants/node-types.ts:283` + 不变量测试；连线计数看返回值） |
| K-3 / K-4 | **画布侧未修**（工作台 K-3 已按 `optionId` 修：`use-studio-workbench-operator-host.ts:133`） |
| 提案 / K 账本文件 | 随 `docs/plans` 整目录删除（`8efe57c`），只能 `git show 9809a07:…` |

其他硬事实：

- 画布链 **AbortSignal 零处**（`streamText` 未传、route 不读 `request.signal`、dock 无停止钮）；`LlmTextInput` 不接 signal，操作员 service :2249-2259 头注自认「在飞补全跑完再丢弃」。
- `ASSISTANT_DOMAIN_BRIEFS.canvas` 零消费者；`ASSISTANT_OPERATOR_DOMAINS` 无 `canvas`，注释 `assistant-operator.ts:9` 与 `:484` 都写着「画布对齐是 P4」（P1–P4 已收官，陈述过期）。
- `generate` op 落地 = `StudioNodeWorkbench.tsx:4090-4098` 直接 `handleGenerateMediaNode(targetId, NODE_GENERATION_SOURCE_IDS.assistant)`；op 执行块 **:3729-4116 无任何测试**，`StudioNodeWorkbench.tsx`（5362 行）无测试文件。
- 全仓无原生 tool-calling；工具环 = 每步一次 strict-JSON 完整往返（`maxSteps` 8）。

## 一、通用 5 问

1. **目标**：画布助手改走与工作台同一套操作员事件流（plan / step / confirm_request / done），服务端认识每一个 op，改动型 step 自带 inverse，**工具表里不存在 generate**；一句可验证：同一条画布对话经 `POST /api/studio/assistant-operator` `domain:'canvas'` 返回结构化事件，且客户端 apply 模块源码扫不出任何生成标识符。
2. **影响面**：`/studio/node` 助手一条线。服务端：`constants/assistant-operator.ts` · `types/assistant-operator.ts` · `services/kernel/assistant-operator.service.ts`（+ money-gate 测试）· `services/llm-text.service.ts`（signal，六 adapter）。客户端：`lib/studio-operator-apply.ts` · `contexts/studio-operator-host.tsx` · `hooks/use-studio-operator-store.ts` · `StudioNodeWorkbench.tsx`（抽出 :3729-4116）。图片 / 视频 / LoRA 工作台**行为零变化**。
3. **成功标准**：见 §四。
4. **禁改**：`prisma/schema.prisma`（零迁移，沿用 `AssistantConversation` + `NODE_CANVAS`）· route 鉴权语义 · `node-connection-rules.ts`（连线合法性唯一事实源，只查表不复制）· `runAsSingleHistoryStep` 语义 · 08-08 拍板「结构 op 免费直落不确认」· 画布不做积分 / 价签预览（owner 两次拍）· 工作台三域工具表与 money-gate 白名单 · 不动 `CanvasOpProposalCard` / marker 链（C2 平价后整体退役，⛔ 不加 flag）。
5. **证据**：§四逐条对应的单测 + 两道 money-gate 结构测试 + 全量 tsc + 全量 vitest；token 用量对比表；C3 才有真机。

## 二、C0 · 服务端契约与工具环

### 2.1 域接入（机械路径，漏一处编译红）

`ASSISTANT_OPERATOR_DOMAINS` 加 `canvas` → `AssistantOperatorDomainSchema` → `ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN.canvas` → `TOOL_IDS / READ_TOOLS / MUTATING_TOOLS` → `TOOL_ARGS_SCHEMAS` + `AppliedStepSchema`（按 `tool` 判别）→ `planTool` switch（`assertNever` 兜底）→ `TOOL_HINTS` / `REJECT_REASON_IDS` → `STUDIO_OPERATOR_SUGGESTIONS.canvas` → i18n `domainName.canvas` / `domainChip.canvas` 三语。`ASSISTANT_DOMAIN_BRIEFS.canvas` 由 `buildOperatorSystemPrompt('canvas')` 消费，画布从此接入三档收敛协议。删掉 `assistant-operator.ts:9` 与 `:484` 两处「画布对齐是 P4」过期注释。

### 2.2 请求快照与图工作副本

- `AssistantOperatorSnapshot` 加可选节 `canvas?:`（硬规矩：控件不在整个键不给，⛔ 别 `?? null`）：`projectId` · `projectName` · `nodes[]`（id / type / title / status / prompt 全文 / imageCategory / model + **optionId(渠道)** / params / references[{role, sourceId, **url**}] / 角色卡外观字段）· `edges[]` · `selectedNodeIds` · `scriptDoc` 摘要（C3 填内容，C0 留 schema 位）。
- **系统提示不吃整包**：提示里只放 `read_graph` 级紧凑概览（节点 id/type/title/status + 边 + 选中 + 项目名），节点全量事实只经 `read_node` 从工作副本按需取。这是「无服务端会话态」下 K-4 的唯一可行根治：URL 与外观字段进快照、不进首轮提示。
- 新增 `CanvasWorkingState`（与 `OperatorWorkingState` 平行，不塞进它的 41 个表单字段）：nodes + edges + **批内新建别名表**（`stage_nodes` 返回临时 id `new:<n>`，同一 run 后续 `connect_nodes` / `set_node_fields` 可引用；客户端 apply 时映射成真实 id）。`inverse` 以工作副本当下值为准（第二条改动撤回到第一条之后）。

### 2.3 画布工具表（全表定义在 C0，实现按片）

| 工具 | 类 | 语义 | inverse | 片 |
| --- | --- | --- | --- | --- |
| `read_graph` | 读 | 概览：节点 + 边 + 选中 + 项目名 + ScriptDoc 摘要 | — | C0 |
| `read_node` | 读 | 单节点全量事实（外观字段、参考图含 URL、参数） | — | C0 |
| `stage_nodes` | 改 | 批量建节点；只能建 `CanvasAddMenu` 里有的类型 | 删这些节点 | C0 |
| `connect_nodes` | 改 | 批量连边；合法性**只**查 `node-connection-rules.ts` | 删这些边 | C0 |
| `set_node_fields` | 改 | 按族类型化字段表改节点（title / 自由文本按 `NODE_WORKFLOW_FREE_TEXT_FIELD_BY_NODE_TYPE` 落点 / imageCategory / params 与分辨率成对） | 改前值 | C0 |
| `set_node_model` | 改 | 模型 + **optionId** 一起下（K-3 根治）；目录每行带渠道与相对价签 | 改前模型 + 渠道 | C0 |
| `attach_refs` | 改 | 挂参考（画布卡图集 / 素材库 id）到媒体节点引用架 | 摘除 | C0 |
| `set_review_state` | 改 | 沿用逐条确认；`approved` 硬禁 | 改前状态 | C0 |
| `prime_node_generate` | 改 | 置某节点生成键 primed；`apply: () => {}`；不算价 | 回灰 | C0 |
| `update_script_doc` | 改 | 写 ScriptDoc；投影仍走 `previewScriptDocProjection` + 既有确认门 | 改前文档 | C3 |
| `search_assets` / `list_asset_folders` / `inspect_asset_folder` | 读 | 直接取 `COMMON_DOMAIN_TOOLS` | — | C3 |

不复用 `set_prompt` / `set_model`（形状不同：画布是「某节点的」字段，`assistant-operator.ts:497-502` 的通用件判据明说形状不同即非通用件）。`generate` 从画布词表**整删**。

### 2.4 确认复合键

覆写用户手写自由文本（节点 title / prompt 族字段）走 `confirm_request`，键为 `${nodeId}:${field}`；`confirm_request` 载荷加可选 `nodeId`，decisions 按复合键存；`assistantWrittenFields` 语义照搬（本轮助手写过的不再问）。结构 op 一律不确认（08-08 拍板）。

### 2.5 钱闸（结构性，两道）

① 服务端沿用 `assistant-operator.money-gate.test.ts`：白名单 + 禁标识符不改一字；新增断言 `ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN.canvas` 不含 `generate`，且唯一含 `generate` 字样的 `prime_node_generate` 载荷只允许 `{ nodeId, primed: true }`。
② 客户端（C1）：`canvas-operator-apply.ts` 源码扫描禁 `handleGenerateMediaNode` / `NODE_GENERATION_SOURCE_IDS` / `generate-*` / `createGeneration` / `deductCredits`。画布执行在客户端，只锁服务端挡不住。

### 2.6 `LlmTextInput` 收 AbortSignal（CA，独立 commit）

`LlmTextInput` 加 `signal?: AbortSignal`，六个 adapter 的主请求用 `AbortSignal.any([signal, AbortSignal.timeout(...)])`；`runAssistantOperator` 把 `options.signal` 传下去；删掉 service :2249-2259 那段「另一片的事」头注。工作台三域同受益。

## 三、C1 · 客户端执行层

- 把 `StudioNodeWorkbench.tsx:3729-4116` 抽成 **`src/lib/canvas-operator-apply.ts`**：纯函数 `(graph, step) → { patch, inverse }`，零 React、零生成标识符（§2.5 ②）。别名映射（`new:<n>` → 真实 id）在这里。
- 新宿主 `use-canvas-operator-host.ts` 实现 `StudioOperatorHost`：`domain:'canvas'` · `buildSnapshot()`（§2.2）· `apply.canvas?: {...}` 作为与 `lora?:` 同构的**可选能力组**；`runAsSingleHistoryStep` 在宿主那只手内部包，⛔ 不把 `applyOperatorStep` 改成 async（两个调用方）。
- `use-studio-operator-store` slices 加 `canvas` 一格；`STUDIO_OPERATOR_FIELDS` 不动，画布 change 粒度以 `${nodeId}:${field}` 建自己的字段枚举。
- **撤销语义（拍板 3）**：`set_*` 字段级逐步 inverse；`stage_nodes` / `connect_nodes` 只给「撤销这一批」，仅当它仍是最近一步时可点，否则置灰并给理由。
- 删 `src/lib/node-assistant-history.ts`（死代码）与 `CanvasAssistantToggle.tsx`（只弹 notImplemented）。
- C1 完成时 dock 仍走 marker 链（C2 平价后一次性切换、整体退役）。

## 四、验收（P0，全部可机器判）

| # | 判据 | 证据 |
| --- | --- | --- |
| 1 | 画布域每个改动型 step 无 `inverse` 即出流前被 `AssistantOperatorStepSchema` 拒 | `assistant-operator.service.test.ts` 新增画布用例 |
| 2 | 画布工具表零 `generate`；`prime_node_generate` 载荷只有 primed | money-gate 测试 ① |
| 3 | `canvas-operator-apply.ts` 扫不出生成标识符 | money-gate 测试 ②（新文件） |
| 4 | `connect_nodes` 非法边被拒，拒因来自 `node-connection-rules.ts` 查表，且规则表未被复制 | 单测 + grep 只有一处 import |
| 5 | `set_node_model` 载荷必带 `optionId`；缺渠道整步拒 | 单测（K-3 契约） |
| 6 | `read_node` 返回外观字段与参考图 URL；首轮系统提示**不含** URL | 单测（K-4 契约，两向断言） |
| 7 | 批内别名：`stage_nodes` 后同 run 的 `connect_nodes` 可引用 `new:1`，apply 后 edges 指向真实 id | apply 单测 |
| 8 | 一批 = 一个撤销步；批撤只在最近一步可用 | apply / host 单测 |
| 9 | `LlmTextInput.signal` 中断后六 adapter 的 fetch 均收到 abort | `llm-text.service.test.ts` |
| 10 | 图片 / 视频 / LoRA 现有操作员测试**零改动**全绿 | 全量 vitest |
| 11 | 全量 tsc 零错；三语键数一致 | full-gate |
| 12 | 同题 token 用量：工具环 vs marker 链，**超过 2× 回来重议** | 对比表附在完成报告 |

## 五、待 owner 拍板（开工前）

1. **切片顺序**：提案 C0→C1→C2→C3。我的判断是 **C0→C1→C3→C2**：K-3 / K-4 是用户可见缺陷，C3 只依赖工具表与 apply，不依赖新面板；C2 要先出 HTML mock 过 owner，放最后不阻塞。
2. **C2 要不要 mock**：拍板 2 是「共组件独立实例」，`StudioOperatorDock` / `Panel` / `LogItem` 都是无域 props 的通用件。若 C2 只是把它们实例化进**现有**画布 dock 壳（几何、拖动、rail 历史全不变），是否可免 mock 直接实现？
3. **CA signal 修复**是否随 C0 走（触 `llm-text.service.ts` 2019 行、六 adapter、全域受益）。
4. **token 2× 门**保留还是改数。

## 附录 A · 2026-09-01 owner 访谈结论（改变本任务书范围）

owner 定位：**核心是创意搭档，但要与画布打通**。主战场 = 节点画布。痛点 = 瞎 · 慢 · 不听话/乱花钱 · 三处不一致 · 资料搜索找不到。

已拍：
1. 点输入框再点画布节点 → 节点进输入框：**媒体 + @引用两者都要**（图/视频节点带媒体，文本节点带正文，所有节点带 id）。
2. 素材库文件夹上画布 → **一个收集节点装整个文件夹**，后续生成节点从它挂参考。
3. 慢 → **接原生 tool-calling，模型分快慢路**（GPT / Gemini / Claude 快路，DeepSeek / Grok 留 JSON 慢路）。
4. 面板形态：owner 无法确定 → C2 必须走 ui-page 三方向 + mock。

## 附录 B · 「无限大」检索对比（2026-09-01 实测）

外部搜索（本会话 WebSearch）一次命中：萌娘百科「无限大」条目 · zh.wikipedia「无限大 (游戏)」· 官网 ananta.163.com（27-01-15 全球上线）· 游民星空专区 · 百度百科 · en.wikipedia「Ananta (video game)」· ananta.fandom.com/wiki/Characters · anantadex · namu wiki。事实：网易 Naked Rain 工作室，Project Mugen 2024-11 改名 Ananta，无 gacha，已公开角色 Taffy / Richie / Seymour / Ringo / Aileen 等。

PixelVault 检索链（子 agent 在容器内跑真实代码，网络被出口策略 403，源端真实返回拿不到）：

| 输入 | 链路行为 | 结果 |
| --- | --- | --- |
| 「我想要无限大的资料」auto | `planResearchHeuristically` 判 `no retrieval signal`（「资料」不在任何词表，`research-intent.ts:61/123/156/188`） | **0 个请求**，`runResearch` 返回 null；模型凭记忆答「找不到」 |
| 同句 forced | general 组只有 web_search；`SERPER_API_KEY` 缺 → 记 `empty` 不是 `failed`（`connector-runtime.ts:73-76`） | no_evidence；UI 说「换个关键词」；模型端零信号（`prompt-assistant.service.ts:737`） |
| 「无限大 网易 游戏 角色设定」 | 命中 ip_character 六源；query = 整句原样、无英文 query；Fandom 写死 `wutheringwaves.fandom.com`（`constants/research.ts:460`） | opensearch 前缀匹配整句必空；danbooru 非 ASCII 跳过 |

缺口排序：① 触发词表漏「资料」类泛请求 ② 缺 key 静默成 empty，模型与用户都不知道 ③ Fandom 单站写死、无按 IP 找站 ④ 无 key 时零改写零翻译 ⑤ 空结果不告诉模型「已检索且为空」。


## 附录 C · 路线图 v2（2026-09-01 第二轮访谈后，owner 定「画布操作员化先落地」）

owner 追加拍板：收集节点不承担文件夹批次，**新做一个「素材文件夹节点」**；文件夹入口放在**助手输入框的附件菜单**（选中后成为一条文件夹胶囊，再说「分析」或「放到画布」）；生产是否配了 `SERPER_API_KEY` 不清楚，需查名单。

| 片 | 内容 | 依赖 | 状态 |
| --- | --- | --- | --- |
| C0-a | 常量 + 类型：`canvas` 域、画布工具表、args schema、`AppliedStep` 联合、快照 `canvas?` 节、`CanvasWorkingState`、别名常量 | — | 开工 |
| C0-c | `LlmTextInput.signal`：六 adapter 主请求可中断，`completeAssistantTextWithContextRetry` 透传 | — | 开工（与 C0-a 并行，文件不相交） |
| C0-b | `assistant-operator.service` 画布分支：工作副本、`planTool` 各 case、inverse、确认复合键、money-gate 测试 ① | C0-a | 待 C0-a |
| C1 | `canvas-operator-apply.ts` 抽出 + `use-canvas-operator-host` + store 加 canvas 槽 + money-gate 测试 ② + 删死代码 | C0-b | — |
| G-A | 手势 A：输入框聚焦即 arm pick mode（照 `QuickThrowApi` 形状，挂 `handleNodeClick`）；`selectedReferences` 提升到 dock；读侧接 `NODE_WORKFLOW_FREE_TEXT_FIELD_BY_NODE_TYPE` 让文本节点正文进上下文 | 独立于操作员化 | 可与 C0 并行 |
| C3 | 上下文根治：`read_graph` / `read_node` 内容、角色外观、ScriptDoc 摘要、三档收敛协议；真机重跑「四镜叙事题」 | C1 | — |
| F | **素材文件夹节点**（新 node type，装一批 asset 引用，按 Generation id + URL，输出给下游生成节点；`node-connection-rules` 加行）+ 附件菜单文件夹胶囊 + 画布工具 `list_asset_folders` / `inspect_asset_folder` / `stage_folder_node` | C1 + 手势 A 的胶囊 | 另立任务书 |
| R | 检索修复：触发词表补泛请求词、缺 key 大声暴露、Fandom 按 IP 找站、无 key 时仍做中英改写、空结果告知模型 | 独立 | 另立任务书 |
| T | 原生 tool-calling：`requestOperatorTurn` 接缝；OpenAI + Gemini 先（缓冲路、`parallel_tool_calls:false`、停发 `responseFormat`）；Claude 需要 operator 维护真实 messages 历史，第二片 | C0-b | 另立任务书 |
| C2 | 面板 UI：ui-page 三方向 + mock → owner 选 → 共组件独立实例；`CanvasOpProposalCard` 与 marker 链平价后整体退役 | C1 + C3 | 最后 |

判断记录：
- 顺序 C0 → C1 → C3 → C2，手势 A 并行；C2 走三方向 mock（owner 对形态「无法确定」）。
- CA signal 随 C0 走，独立 commit。token 2× 门保留。
- 文件夹节点是新类型而非收集节点属性：它的本质是「一批外部素材的来源」，与「一个角色的身份卡」不是同一件事，不违反「属性不建成类型」。

## 附录 D · C0-a 验收与契约裁定（2026-09-02）

C0-a 交付：`canvas` 域 + 10 个工具 id + args / AppliedStep schema + 快照 `canvas?` 节 + `CanvasWorkingState` + 三语键 + 20 条新用例；定向 456/457 通过，唯一失败在 money-gate 测试的旧过滤条件（归 C0-b）。tsc 剩余 6 处全在 C0-b / C1 范围（穷举 switch / Record 缺 canvas 分支），属预期。

C0-a 提出的 6 个契约问题，裁定如下（C0-b 照此实现）：

1. 快照根字段 `prompt` 改为可选；service 工作副本对缺席按空串处理。画布宿主**不发** `prompt`（控件不在整个键不给）。
2. 角色外观 = 节点真实字段 `character.{name, visualSeed}` + 参考图 URL；`read_node` 把这两样都给模型。不另造 appearance 结构。
3. `set_review_state` 按节点级（主媒体）；载荷 `{nodeId, state, reason?}`，inverse 改前状态。
4. `stage_nodes` / `connect_nodes` 的 inverse 用别名列表 / (source,target) 对，客户端按别名表反查真实 id。接受。
5. 确认复合键：service 的 `Set<ConfirmField>` 改为复合键集合；`maxConfirmDecisions` 24 接受。`set_review_state` 也走 `confirm_request`，`field: 'reviewState'`，choices 只有 overwrite / keep（客户端渲染为「确认 / 跳过」），`approved` 在规划器直接拒 `approvedForbidden`。
6. `attach_refs` 每条 ref `sourceId` / `assetId` 二选一由规划器判：`sourceId` 必须是工作副本里带媒体的节点；`assetId` 必须是**本轮** `inspect_asset_folder` / `search_assets` 返回过的 id（与 `folderIndex` 同款准入表），否则拒（新增 `unknownAsset` 拒因）。载荷带 url 供客户端落引用架。
7. 补：快照 `canvas.modelOptions[]`（按 nodeType 列 modelId + optionId + label + 相对价签），`set_node_model` 只认表内组合，缺 optionId 拒 `missingChannel`，不在表内拒 `unknownModel`。

## 附录 E · 对话设计决定（owner 2026-09-02，第三轮访谈）

owner 定性：助手设计是一项独立的大工程（回复怎么设计、反问怎么设计、怎么搜图、怎么入库）。本附录只记拍板，正式规范沉淀到 `references/pages/assistant-shell.md` 新开「对话设计」一节（完成即删本包时一并做）。

| 题 | 拍板 | 落点 |
| --- | --- | --- |
| 何时反问 | **交给 AI 判断**：不确定用户想做什么时就反问；不设「先问一轮」硬门，也不禁问 | 系统提示写判据（意图不清 / 多解 / 会花钱或覆盖手写内容时问），协议层给 `ask` 一等事件而非正文标记（接「标记升帧」那片） |
| 反问形式 | **选项卡 + 自由输入**：最多 3 个可点选项，每项一句后果，另留输入框；点选即回答并继续 | 统一成一张卡，`ClarifyingQuestionCard`（画布 ScriptDoc 用）与 `AssistantTurnOptions`（工作台用）两份合一，C2 面板重做时收口 |
| 回复结构 | **结论一句 + 动作清单 + 可展开细节**；创意讨论允许展开成长文 | 操作员事件流天然给出「message + steps」；`message` 帧约束第一行为结论，细节折叠由面板渲染 |
| 网图交互 | **点击 = 打开放大图**（灯箱），**入库是另一个动作**；入库落到素材库根「所有」，不进项目文件夹 | 现有 `search_web_images` 看/选分离保留；`web-image-import` 的目标夹改为根（当前实现按 `isPublic=false` 入库，folder 归属需核对）；灯箱复用 `StudioOperatorLightbox` |

待设计（下一轮问 owner）：反问上限（一轮最多几问）· 反问未答时助手是否按默认继续 · 动作清单里撤销的粒度展示 · 入库去重规则（同 URL / 同哈希）。

## 附录 F · 切片状态（2026-09-02 04:50 UTC）

| 片 | 状态 | 证据 |
| --- | --- | --- |
| C0-a | ✅ 验收通过 | 定向 456/457（唯一失败归 C0-b 的旧过滤条件） |
| C0-c | ✅ 验收通过 | `llm-text` 83/83 + `assistant-completion` 7/7；四文件 tsc 零错；取消抛 `signal.reason`，`isLlmTextAbortError` 识别 |
| G-A | ✅ 验收通过 | 77 文件 756 用例全绿；arm=聚焦或「从画布选」钮，exit=Esc/空白/发送，不因失焦退出；快投优先；非媒体节点以 `selectedNodeIds` 进请求 |
| C0-b | ✅ 验收通过 | 见附录 G |
| C1-pre | ✅ 验收通过 | 见附录 G |

## 附录 G · C0-b / C1-pre 验收（2026-09-02 05:10 UTC）

**C0-b ✅**：service +1630/−212，32 条画布用例，定向 55 文件 708 用例全绿，money-gate 10/10，tsc 零错。验收表 §四 逐条：#1 inverse 缺失出流前被拒（有测）· #2 画布工具表零 generate、prime 载荷只 `{nodeId, primed:true}`（money-gate 新断言）· #4 连线只查 `canConnectNodeTypes`，源码不含规则表名（money-gate 新断言）· #5 `set_node_model` 缺渠道拒 `missingChannel` · #6 系统提示与首轮用户提示零 URL、零 visualSeed、零字段正文，`read_node` 才给（两向测试）· #7 别名跨步解析 · #9 signal 透传 · #10 工作台三域旧用例零改动全绿 · #11 tsc 零错。#3 / #8 归 C1，#12 token 对比归 C3 真机。

C0-b 自定的 8 个默认，全部接受：`priceLabel` 可选展示串 · `modelOptions` 必填数组（宿主至少发 `[]`）· `attach_refs` 默认分类按来源卡 role · `set_node_fields.mode` 只作用自由文本，append 载荷是增量（C1 按 `ASSISTANT_OPERATOR_APPEND_SEPARATOR` 拼，空框视同 replace）· 标题覆写也确认 · `duration` 在带 params 节点上按档位 · 来源无媒体 / 自引用复用 `unknownAsset` · 客户端 i18n 归 C1/C2。

**C1-pre ✅**：四个工作台文件穷举补齐；画布 step 在工作台宿主上返回类型化 `notApplicable` 并由 `use-assistant-operator` 插系统行 `stepNotApplicable`（三语已补）；历史落库不印 URL；116/116；全仓 tsc exit 0。

**下一步**：full-gate（全量 tsc + 全量 vitest）→ 提交本片（C0-a/b/c + C1-pre + G-A）→ C1 正片。

### C1 正片任务书（派工用）

范围：`src/lib/canvas-operator-apply.ts`（新）+ `src/hooks/node/use-canvas-operator-host.ts`（新）+ `contexts/studio-operator-host.tsx`（`apply.canvas?:` 可选能力组）+ `lib/studio-operator-apply.ts`（把 C1-pre 的 notApplicable 分支改为分派到 canvas 能力组，缺能力组仍 notApplicable）+ money-gate 测试 ②（新文件 `canvas-operator-apply.money-gate.test.ts`）+ 删 `lib/node-assistant-history.ts` 与 `CanvasAssistantToggle.tsx`。

契约：
- `applyCanvasOperatorStep(graph, step, aliases) → { patch: NodeWorkflowPatch, inverse: CanvasInverse, aliases }` 纯函数，零 React、零生成标识符；`new:<n>` → 真实 id 映射在此完成，映射表随 run 存活。
- 宿主 `use-canvas-operator-host`：`domain:'canvas'`，`buildSnapshot()` 产 `canvas` 节（含 `modelOptions`，从 `NODE_STUDIO_*` 目录按 nodeType 生成，`priceLabel` 按相对价签；**不发 `prompt`**），`apply.canvas` 把 patch 交给 `runAsSingleHistoryStep` 内的 workflow 写入；`applyOperatorStep` 保持同步，异步只在宿主那只手里。
- 撤销：`set_*` 字段级 inverse；`stage_nodes` / `connect_nodes` 只给「撤销这一批」，仅当它仍是最近一步（`useNodeWorkflow` 的 history 指针）可点，否则置灰给理由。
- `prime_node_generate`：节点卡生成键 primed 态（视觉 + 聚焦），不算价。
- 测试：apply 单测覆盖 10 工具、别名、批撤、append 拼接；宿主单测 snapshot 形状（无 `prompt`、有 `modelOptions`）；money-gate ② 源码扫描禁 `handleGenerateMediaNode` / `NODE_GENERATION_SOURCE_IDS` / `generate-*` / `createGeneration` / `deductCredits`。
- 本片不换 dock 里的 marker 链（C2 平价后整体退役）；宿主先以 hook 形式存在并在 `StudioNodeWorkbench` 挂载但不接 UI，用测试证明可用。

## 附录 H · C1 正片 / 检索修复 R 验收（2026-09-02 10:10 UTC）

**C1 ✅**（worktree `agent-abaeaa5243ae46f84`，基于 `9ee7b1e`）：`canvas-operator-apply.ts` 纯函数（patch 与 inverse 同为 `NodeWorkflowGraphPatch`，逆补丁按此刻的图算）· `node-workflow-graph-patch.ts` 施加原语 · `canvas-operator-snapshot.ts`（根无 `prompt`，`modelOptions` 只列可跑渠道并带相对价签）· `use-canvas-operator-host.ts`（`apply.canvas` 整步粒度四方法；批撤只在撤销栈顶仍是落笔引用时可点）· money-gate ② 两份源码扫描 · 删 `node-assistant-history.ts` 与 `CanvasAssistantToggle.tsx`。定向 212 文件 2566/2566，tsc 零错。C1 自定 5 条契约决定全部接受（`canUndoBatch` 收 step 对象 · 整步粒度 · `duration` 归 params · `attach_refs` 直接构条目 · 新增两条系统码）。遗留归 C2：`assistantPrimed` 视觉、画布步的 inverse 文案。

**R ✅**（worktree `agent-a9eccce2158772537`，基于 `ef0a2c4`）：五个缺口逐一落地——泛请求词表 + 实体抽取 → ip_character 组；缺 key 抛 `WebSearchNotConfiguredError`、源级 `unavailable` 回执不喂熔断、UI「联网搜索未配置」不再劝换词；`buildResearchStatusBlock` 让模型知道「已检索且为空 / 失败 / 不可用」并禁编造；查询按源分派（主语给 wiki 类，整句给网搜），规划器要英文 / 罗马音别名；Fandom 由规划器给 `fandomHost` 按 host 组站，无 host 记 skipped。`prisma/schema.prisma` 只动过一行注释，已回退，新状态不落库。定向 23 文件 310/310，tsc 零错。网络被出口策略挡，全部 mock 验证，**真机命中待 owner 配好 SERPER key 后验**。

**合并顺序**：C1 fast-forward → R 合并（与分支只在三份 messages json 相交）→ full-gate → 提交 → push。

## 附录 I · 合并落地 + C3 / T 任务书（2026-09-02 10:30 UTC）

**已落地**：`a302788`（C1）· `9924f75`（R）· 两次 `--no-ff` 合并零冲突 · 全量闸门 tsc 0 错、eslint 0、vitest 597 文件 6166/6167（1 skipped）· 已推 `12939fa`。C2 原型已出（artifact「画布操作员台」，四态），待 owner 批。

### C3 · 上下文根治 + 对话协议（派工用，Opus 5）

范围：`services/kernel/assistant-operator.service.ts` 画布分支 · `types/assistant-operator.ts` · `constants/assistant-operator.ts` · `constants/assistant-protocol.ts` · `lib/canvas-operator-apply.ts` · `lib/canvas-operator-snapshot.ts` · `hooks/node/use-canvas-operator-host.ts` · `hooks/use-assistant-operator.ts` · `hooks/use-studio-operator-store.ts` · 相应测试与三语键。⛔ 不动面板组件（C2）、不动 llm-text（T）。

1. **`ask` 一等事件**（附录 E 拍板）：模型 turn JSON 可返回 `ask: { question, options: [{label, consequence}] ≤3, allowFreeText: true }`；服务端校验后吐 `ask` 事件并以 `stopped:awaitingAnswer` 结束本 run；客户端线程条目 `ask`，答案（点选 label 或自由文本）作为下一条 user 消息发出，附 `answeredAskId`。系统提示写判据：意图不清 / 多解 / 将花钱或覆盖手写内容时问，否则先做再给撤销。工作台三域同样获得该事件（协议层共享），但本片只加画布提示。
2. **回复结构**：系统提示规定 `message` 第一行是结论、随后是动作清单（由 steps 自然形成）、细节放后段；`message` schema 不变，渲染归 C2。
3. **`update_script_doc`**：服务端 mutating step（inverse = 改前文档），客户端 apply 走既有 `previewScriptDocProjection` + 投影确认门；快照 `canvas.scriptDoc` 由宿主给摘要（标题 / 幕数 / 镜头数 / 角色名）。双路并存原则写进系统提示：长叙事先落 ScriptDoc 再投影，零散节点直接 stage。
4. **三档收敛协议**接入画布（与工作台同一实现），`ASSISTANT_DOMAIN_BRIEFS.canvas` 消费者已存在，核对文案。
5. **验收题**：把 2026-08-29 的「四镜叙事题」做成服务级测试（mock LLM 按脚本返回 turn，断言：第一步是 `read_node` 同名角色卡 · `set_node_model` 带 BytePlus optionId 而非 fal · `attach_refs` 挂到四个视频节点 · 首轮提示零 URL · 台词字段落在 `action` 而非 `prompt`）。真机复跑留给 owner。
6. token 用量对比（验收 #12）：在测试里统计同题 marker 链 vs 工具环的提示字符数，记进报告；超过 2× 回来重议。

### T · 原生 tool-calling 快慢路（派工用，Opus 5，worktree）

范围：`services/llm-text.service.ts`（新入口 `llmTextToolCall`，OpenAI + Gemini 缓冲路）· `constants/llm-capability.ts`（`LLM_TOOL_CALLING_MODES` + 穷举 `Record<AI_ADAPTER_TYPES, …>`：openai / gemini = native，anthropic / deepseek / dashscope / xai = json）· `services/kernel/assistant-completion.service.ts`（把上下文压缩重试抽成泛型 `withContextRetry`，两条路共用）· `services/kernel/assistant-operator.service.ts` **只改** :2306-2340 那十几行 → `requestOperatorTurn(input) → {kind:'tool'|'message'|'done'|'ask', plan?}`，JSON 实现 = 现有代码原样，native 实现 = 新入口。
硬约束：`ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS` 用 `z.toJSONSchema()` 生成 function 参数（不手抄）；OpenAI `parallel_tool_calls:false`，native 路停发 `responseFormat`；Gemini `function_declarations` 与 `google_search` 不并用；args 仍过 zod；`consecutiveParseFailures` 在 native 路语义改为「不调工具也不说话」；money-gate 白名单只允许新增 `@/constants/llm-capability`；`llm-text.service.test.ts` 既有断言零改动；`LLM_TEXT_STREAMS` 不动（native 只做缓冲路）。Claude 原生路（需 messages 历史）**不在本片**。
验收：对同一 operator 脚本，openai / gemini 走 native 时请求体含 tools 且无 response_format；deepseek / xai 请求体与改前逐字一致；操作员 32 条画布用例 + 工作台用例零改动全绿。

## 附录 J · C3 / T 验收 + 端到端审计（2026-09-02 11:30 UTC）

**C3 ✅**（主检出，未提交→本轮合并提交）：`ask` 一等事件（服务端归一、`awaitingAnswer` 停止理由、客户端 `answerAsk` 重发带 `answeredAskId`，四域协议共享、提示只写画布）· 回复结构规则 · `update_script_doc` 真实现（inverse = 改前整份；客户端复用 `ScriptDocWorkspace` 同三只手，投影确认门在 store）· 三档收敛协议画布接入，工作台三域提示逐字未变 · 四镜叙事题 7 步脚本测试 · token 比值首轮 1.09×、整轮 9.25×（结构成本，只记录）。定向 242 文件 2894/2894，tsc 零错，money-gate 白名单未动。

C3 的 5 个契约问题裁定：
1. 模型看不到剧本正文 → **加 `read_script_doc` 读工具**（与 `read_node` 同一「按需读」原则），归下一片 C2-b（后端小项），不进本轮合并。
2. ScriptDoc 无「幕」字段 → 接受按 `sceneLabel` 去重当场次，不改 schema。
3. 投影确认门 UI → C2。
4. 反问进历史降级为 message → 接受（可读 ≠ 可操作）。
5. 撤 `update_script_doc` 只撤文档不撤已投影节点 → 接受，与手动投影语义一致。

**T ✅**（worktree `agent-a08b4ffa39f24fcad`，⚠ 基线 `ef0a2c4`，早于 C0/C1/C3）：`LLM_TOOL_CALLING_MODE_BY_ADAPTER` 穷举（openai / gemini = native，其余 json）· `llmTextToolCall`（OpenAI `parallel_tool_calls:false` 无 `response_format`；Gemini `function_declarations` 不与 grounding 并用）· `withContextRetry` 泛型 · `requestOperatorTurn` 接缝，JSON 路原样、DeepSeek 请求体逐字快照 · 28 条新用例，既有断言零改动 · Claude 留 JSON 路（原生 tool use 需真实 messages 历史，工具环无状态重建接不上）。T 自定：原生路 plan / message 走「正文与工具调用同一条回复」不加伪工具（接受，慢路提示词因此逐字不变）。
合并时必做：① `llmTextToolCall` 透传 C0-c 的 `signal`；② `requestOperatorTurn` union 加 C3 的 `ask` 支；③ 原生工具表自动跟随 `canvas` 域表，补一条 canvas 域原生路用例。

**端到端审计（「无限大二创」四镜 30 秒）**：剧本 / 出图 / 镜头→视频 **能**；资料图、角色一致性、合成、助手代劳 **半能**。P0：台词从未进 TTS、配音间无整场导出无混轨；Fish 免费档标注 08-31 到期未复核（owner 亲自查官方博客）。P1：缺 `SERPER_API_KEY`；`GEMINI_OMNI_FLASH` 假可用（worker 未 allowlist，选中必 501，应下架）。方向建议：C2 之后开「成片链」片（投影写台词进语音节点 → TTS → 混轨进合成），待 owner 点头。
