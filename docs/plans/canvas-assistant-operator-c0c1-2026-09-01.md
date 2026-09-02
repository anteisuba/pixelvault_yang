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
