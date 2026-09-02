/**
 * 工作台助手「操作员化」的**词表**：工具名、op 类型、事件类型与各自的上限。
 *
 * ── 它和 `node-assistant-ops.ts` 是什么关系 ─────────────────────────
 * 思想同源、形态不同。画布那套是「模型在正文里留 `[[canvas-ops]]` 标记 → 客户端
 * 剥出来渲染成一张提案卡」；这里是**多步工具环**：服务端一步一步地跑，每跑一步
 * 就吐一个 `step` 事件，客户端边看边应用。区别的根源是 owner 拍板 2 —— 免费动作
 * 直做，不再攒成一张要点的卡。
 * 画布正在并入这条工具环（C0/C1，`docs/plans/canvas-assistant-operator-c0c1-2026-09-01.md`）；
 * marker 链在 C2 平价后整体退役，⛔ 那之前别去改 `node-assistant-ops.ts`。
 *
 * ── 这个文件为什么不放 Zod ─────────────────────────────────────────
 * 全仓 `src/constants/` 零个文件 import zod（2026-08-30 清点），schema 一律住
 * `src/types/`。本词表的 schema 因此在 `src/types/assistant-operator.ts`，与
 * `constants/node-assistant-ops.ts` ↔ `types/node-assistant-ops.ts` 完全同构。
 * constants 会被客户端组件直接 import，让它拖上 zod 是白付的包体积。
 *
 * ── 钱闸（本片的宪法）────────────────────────────────────────────
 * **这张工具表里没有任何一条能创建 generation，将来也不许有。**
 * `prime_generate` 只是让客户端把生成键置成 primed 态并算价，扣扳机的永远是用户
 * （拍板 2）。加工具前先问一句：它会不会花钱？会就不是这里的工具。
 */

import {
  ASSISTANT_PROTOCOL_DOMAIN_IDS,
  type AssistantProtocolDomain,
} from '@/constants/assistant-protocol'
import { ASSISTANT_STREAM_EVENTS } from '@/constants/assistant-stream'
import { NODE_WORKFLOW_FIELDS } from '@/constants/node-types'

/**
 * 操作员流的事件名。
 *
 * ⚠ `open` **借的是传输层那一帧**（`ASSISTANT_STREAM_EVENTS.open`），不是新造的：
 * 它的职责是在模型开口前产生第一个字节把响应头顶出去（那条 504 实证见
 * `constants/assistant-stream.ts` 头注）。工具环的第一步就是一次完整的 LLM 往返，
 * 没有它这条路由和 2026-08-24 那次生产事故是同一个形状。
 * 值共用一个常量，别抄字符串 —— 抄了就是两个「open」，客户端只认其中一个。
 */
export const ASSISTANT_OPERATOR_EVENTS = {
  /** 开流握手，载荷为空。由成帧器发，service 不产。 */
  open: ASSISTANT_STREAM_EVENTS.open,
  /** 计划条，最多一次，排在第一个 `step` 之前。载荷 `{ steps: string[] }`。 */
  plan: 'plan',
  /**
   * 一步。同一个 `id` 会出现两次：`running` 一次、`done` / `error` 一次。
   *
   * ⚠ 客户端按 `id` 覆盖而不是追加 —— 追加的表现是日志流里每步重复两行。
   */
  step: 'step',
  /**
   * 就地确认请求（拍板 3）。它之后这条流即结束，
   * 见 `ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm`。
   */
  confirmRequest: 'confirm_request',
  /** 普通对白。 */
  message: 'message',
  /** 正常收尾。 */
  done: 'done',
  /** 未跑完就停了 —— 载荷带 `reason`，与 `done` 分开是为了让 UI 说得出为什么。 */
  stopped: 'stopped',
  /** 流中途失败，形态与 `AssistantStreamErrorFrame` 一致。 */
  error: 'error',
} as const

export type AssistantOperatorEventName =
  (typeof ASSISTANT_OPERATOR_EVENTS)[keyof typeof ASSISTANT_OPERATOR_EVENTS]

/**
 * P1 工具表。
 *
 * 分三类，判据是「谁承担后果」：
 *   · **读**（`read_state` / 素材检索 / 文件夹视觉检查）—— 不改任何东西，客户端只画日志条。
 *   · **写**（`set_*` / `mount_reference` / `prime_generate`）—— 吐一个 op 给客户端
 *     应用；服务端**不落任何状态**，所以这条流断在哪里都不会留下半个写入。
 *   · 花钱的 —— 一个都没有，见文件头注。
 */
export const ASSISTANT_OPERATOR_TOOL_IDS = {
  /**
   * 读当前表单。⚠ 数据源是**请求里带上来的客户端快照**，不查库 —— 库里没有
   * 「用户此刻在输入框里打了一半的字」，而那正是覆写确认要判的东西（拍板 3）。
   */
  readState: 'read_state',
  /** 按关键词检索用户自己的素材库。 */
  searchAssets: 'search_assets',
  /** 按名称查找用户自己的素材文件夹，并返回可验证的 folder id 与完整路径。 */
  listAssetFolders: 'list_asset_folders',
  /** 实际查看一个已列举文件夹里的图片；分批走视觉模型，不修改素材或表单。 */
  inspectAssetFolder: 'inspect_asset_folder',
  /**
   * 联网搜图（P3-B）。**只出预览候选，什么都不落。**
   *
   * ⛔ 它与 `search_assets` 有一条根本区别，写在这里以免下一个人"顺手补齐"：
   * 库里的素材已经是用户的，所以 `mount_reference` 直接挂得上；**联网候选不是**，
   * 它只是一串第三方地址。转存进 R2 的动作由**用户点选**触发，走的是另一条 API
   * 路由（`STUDIO_WEB_IMAGE_IMPORT`），工具环里**没有对应的导入工具，将来也不许有**
   * —— owner 2026-08-30 原话「主要是给个预览的功能，用户确定了再落 R2」。
   * 顺带：这也是钱闸那份 import 白名单能一直守住的原因（助手够不着上传模块）。
   */
  searchWebImages: 'search_web_images',
  /**
   * 把素材挂成参考图。
   *
   * ⛔ **载荷里的 URL 不由模型写**：模型只能给 `assetId`，而且只能是本轮
   * `search_assets` 真的返回过的那些，URL 由服务端从检索结果里查出来填。
   * 论据照抄画布 `attach_asset` 那条 —— 让模型写 URL 就是让它编一个不存在的地址。
   */
  mountReference: 'mount_reference',
  /** 换模型。⛔ 只能从快照的 `availableModels` 里挑，不许自己写 id。 */
  setModel: 'set_model',
  /** 写正面提示词。⚠ 目标字段已有用户手写内容时先走确认通道（拍板 3）。 */
  setPrompt: 'set_prompt',
  /**
   * 写负面提示词。
   *
   * ⚠ 快照里 `negativePrompt` **字段缺席 = 这个工作台没有负面框**，不是「有但
   * 空着」—— 这条判据是 2026-08-22 真机换来的（见 `lib/assistant-workbench-state.ts`
   * 里同一段注释），缺席时这条工具按 `noSuchControl` 拒。
   */
  setNegative: 'set_negative',
  /**
   * 设出图规格（**图片档专用**）。
   *
   * ⚠ 台账 AE/BG/BS：`aspectRatio` **只有配上 `resolution` 才是真比例**，所以这
   * 条工具的载荷两个字段一起下，一个都不能省。拆成两条工具就等于把那个坑重挖一遍。
   * ⚠ 视频档走 `set_video_specs` —— 分家的理由写在那条上。
   */
  setSpecs: 'set_specs',
  /**
   * 设视频规格：**时长 · 画幅 · 分辨率一次下齐**（P4-A）。
   *
   * ── 为什么不复用 `set_specs` ────────────────────────────────────
   * 两个域的规格**形状不同，不是同一件事换了值**：
   *  · 图片档比例与清晰度**必须同时给**（台账 AE/BG/BS：只给比例不是真比例），
   *    schema 层把两个字段都写成必填，`types/assistant-operator.test.ts` 有一条
   *    用例专门锁住「只给比例就整条不合法」；
   *  · 视频档的三个参数是 provider 的**三个独立字段**（`buildVideoInput` 里
   *    `aspectRatio` / `duration` / `resolution` 各发各的），而且**逐型号有无**：
   *    Kling V3 Pro / MiniMax H3 的契约里 `parameters.resolution === false`
   *    （`constants/video-model-send-plan.ts`），HappyHorse 连 `duration` 都没有。
   *    把它们塞进「两个必填」的载荷，结果是这些模型上 `set_specs` **永远无解** ——
   *    正是 2026-08-30 那次「三连红而表单没动」的形状。
   * 于是：一个域一条工具，各自的必填规则在各自的 schema 上写死。
   *
   * ⚠ 分家**不等于**放弃「成对下发」那条教训：这条工具的载荷与逆操作**永远带齐
   * 三格**（没有的那格是 `null`），所以撤销一定落回一个真实存在过的组合，
   * ⛔ 不会撤出「5s 配 1080p 配 21:9」这种从没有过的三元组。
   */
  setVideoSpecs: 'set_video_specs',
  /**
   * 设一次出几张。值域 = 快照给的档位表（本仓 `IMAGE_BATCH_COUNTS` 是 1/2/4）。
   *
   * ⛔ **图片档独有**：视频恒单条（工作台上压根没有这个控件，成本行传的是
   * `[selectedModel]` 而不是矩阵名单）。域工具表因此不给视频，调了就按
   * `noSuchControl` 拒 —— 台账「视频恒单条，别照搬矩阵」。
   */
  setCount: 'set_count',
  /**
   * 把视频参考位上的**音频**挂上（P4-A，台账 A 那条修好的通道）。
   *
   * ⭐ 与 `mount_reference` 分家的理由是**槽不同**：图片走
   * `imageUpload.referenceImages`，音频走 `state.videoAudioRefs`，两者的上限来自
   * 契约里两个不同的数（`slots.images` / `slots.audio`），撤销也各撤各的。
   * 合成一条工具就得在载荷里塞一个「这是图还是声」的判别位，而那正是
   * `applyOperatorStep` 最容易写漏的一支。
   *
   * ⚠ 载荷里的 `ownerName` 是**角色归属**（界面上那颗 `AudioOwnerPicker`）：
   * worker 据此生成 `{Name} (@AudioN)` 提示词 token，多角色对白片少了它就分不出
   * 谁在说话。候选来自本次已应用的角色卡，留空退化成无标签 `@AudioN`（schema 允许）。
   */
  mountAudioReference: 'mount_audio_reference',
  /**
   * 视频**出不出声**（P4-A）。
   *
   * ⚠ 它是**三态**：`null` = 用户没设过（最终吃模型目录的默认，多数模型是开），
   * `true` / `false` = 用户明确表过态。⛔ 把「没设过」发成 `false`，在目录默认为
   * 开的模型上结果**正好相反** —— 所以这条工具的 `inverse` 允许 `null`，而工具
   * 本身只写得出 `true` / `false`（用户没设过这件事助手模拟不出来，也不该模拟）。
   *
   * ⚠ 名字里**故意不出现 provider 那个字段名**：钱闸那份禁字表逐字扫工具环源码
   * （`assistant-operator.money-gate.test.ts`），那个词在表里。协议这一侧叫
   * "sound"，落到表单字段的那一跳发生在客户端 `studio-operator-apply.ts`。
   */
  setSound: 'set_sound',
  /**
   * 把生成键置成 primed 态并算价。
   *
   * ⛔ **它不是生成**。服务端在这一步什么都不做，只吐一个 op；点的人永远是用户
   * （拍板 2）。它仍算「写」类 —— 因此照样带 `inverse`（置回未 primed），
   * 不然拍板 14 的「清空全部改动」会留下一个亮着的生成键。
   */
  primeGenerate: 'prime_generate',
  /**
   * 看它自己备的那张图（P3-C，拍板 4）。
   *
   * ⭐ **图不由模型给**：地址来自请求里的 `result`，而那份 `result` 只有在客户端
   * 观察到「助手 primed 的那一次生成」完成时才会带上来（归属追踪见
   * `lib/studio-operator-claim.ts`）。用户自己点的那些生成**永远不进这个字段** ——
   * 拍板 4 的后半句「用户自己发的不打扰」就是在这里成立的，不是靠模型自觉。
   * 没有 `result` 时这条工具按 `noResultToCritique` 拒。
   *
   * ⚠ 它是**读**类：看图不改表单。看完之后要改什么，照旧走 `set_*`（因此照旧
   * 可撤销、照旧进登记簿）。把评价和改动合成一条工具，撤销就没有粒度了。
   */
  critiqueResult: 'critique_result',
  /**
   * 把**用户亲手递过来的**一条 URL 取图、入库并挂上（P3-D，拍板 22）。
   *
   * ⭐ 它与 `search_web_images` 的候选是**两件事**，判据只有一条：这条地址是谁给的。
   *   · 助手自己搜出来的候选 → 仍要用户点「选用」（拍板 21，浏览零下载）；
   *   · **用户自己在消息里粘的地址 → 递过来就是确认**（owner 原话「你递的就是确认」），
   *     助手直接接手，⛔ 不再回头支使用户去点任何东西。
   *
   * ⚠ 「是用户给的」是**服务端结构校验**出来的，不靠模型自觉：那条 URL 必须逐字
   * 出现在本次请求的某条用户消息里，否则按 `urlNotFromUser` 拒。让模型自己声明
   * 「这是用户给的」等于没有闸 —— 它编一句就绕过去了。
   *
   * ⛔ **执行仍在客户端**：这一步只吐一个 op（载荷就是那条源地址），取图 / 落 R2 /
   * 落库全部发生在客户端调既有导入路由（`STUDIO_WEB_IMAGE_IMPORT`）那一跳。
   * 服务端照旧碰不到 R2 与导入模块 —— 钱闸那份 import 白名单一条不松。
   */
  importUserUrl: 'import_user_url',
  /**
   * 找 LoRA（P4-C，**LoRA 域专属**）。
   *
   * ⭐ **复用既有检索**：`services/lora/lora-candidates.service` 那条已经在跑的双源
   * 检索（Civitai + HF，单源失败不拖垮另一源，归一成一张 `LoraCandidate`）。
   * ⛔ 别在工具环里新写一套 —— 那条链上「许可如实展示、不知道就写 null」
   * 「导入门槛写在数据上不写在 UI 上」「已挂载的要标出来」三条规矩都是实证换来的，
   * 重写一次就是把它们一起丢掉。
   *
   * ⚠ 它是**只读**的：一个字节都不下载、一分钱都不扣。真正把 LoRA 收进库那一跳由
   * `mount_lora` 在**客户端**走既有导入链（`favoriteLoraAPI`）—— 与拍板 22 的
   * `import_user_url` 完全同构，服务端照旧碰不到 R2。
   */
  searchLoras: 'search_loras',
  /**
   * 把一把 LoRA 挂上装配台（P4-C）。
   *
   * ⛔ **模型只能给 `candidateId`**，而且只能是本轮 `search_loras` 真的返回过的那些
   * （论据与 `mount_reference` 逐字同源：让模型写下载地址就是让它编一个 404，而这条
   * 链后面接着的是「导入进库」）。导入载荷由服务端从本轮检索结果里查出来填。
   *
   * ⚠ **不设数量上限** —— 本仓硬事实：三个后端全不限，服务端不读 maxLoras 是故意的。
   * 所以这条工具没有 `referencesFull` 的对应物，⛔ 别顺手补一个「最多几把」的闸。
   *
   * ⚠ 撤销按 `candidateId` 反查：那把 LoRA 的**库记录 id** 是客户端导入那一跳才产生
   * 的（与 `import_user_url` 的「源地址 → 落地地址」对照表同构）。
   */
  mountLora: 'mount_lora',
  /**
   * 从装配台上摘一把 LoRA（P4-C）。
   *
   * ⚠ 目标只能是快照里列着的**已挂载项**（`loras.items[].id`），⛔ 不是候选 id：
   * 候选来自检索，挂载项来自用户的装配台，两者是不同的东西。
   * ⚠ 撤销 = 挂回去，而挂回去要的是那条**库记录**；服务端没有它，所以客户端在摘的
   * 那一刻把记录扣下来（同 `mount_lora` 的那张对照表）。
   */
  unmountLora: 'unmount_lora',
  /**
   * 调一把已挂载 LoRA 的权重（界面上那颗 `LoraScaleChip` 与整行滑杆）。
   *
   * ⚠ 值域借 `ASSISTANT_LORA_PICK_LIMITS` 的 0.1–2，**不新拍一对数**：`[[lora]]`
   * 推荐块里的 `suggestedWeight` 用的就是那一对，两处分叉的表现是「推荐卡上 1.5
   * 合法、助手直接设 1.5 被拒」。
   */
  setLoraWeight: 'set_lora_weight',
  // ── 画布域（C0，任务书 §2.3）──────────────────────────────────────
  /**
   * 读整张图的**紧凑概览**：节点 id / type / title / status + 边 + 选中 + 项目名
   * + ScriptDoc 摘要。⚠ 首轮系统提示里放的就是这一级，⛔ 不含 URL、不含外观字段
   * （K-4 根治：全量事实只经 `read_node` 按需取）。
   */
  readGraph: 'read_graph',
  /** 读单个节点的**全量事实**：自由文本字段、外观字段、参考图（含 URL）、模型与渠道、档位。 */
  readNode: 'read_node',
  /**
   * 批量建节点 —— **一步一批**，撤销也是撤这一批。只能建 `CANVAS_ADD_CATALOG`
   * 里有的类型（规划器按 `unknownNodeType` 拒）。每项可带 `alias`
   * （`ASSISTANT_OPERATOR_CANVAS_ALIAS_PREFIX` + 序号），同一 run 后续步骤可引用。
   */
  stageNodes: 'stage_nodes',
  /** 批量连边。合法性**只**查 `node-connection-rules.ts`（`illegalConnection`），⛔ 不复制规则表。 */
  connectNodes: 'connect_nodes',
  /**
   * 按族类型化字段表改节点：title / 自由文本（落点按
   * `NODE_WORKFLOW_FREE_TEXT_FIELD_BY_NODE_TYPE`）/ imageCategory / 档位。
   * ⚠ 覆写用户手写自由文本走确认通道，键是 `${nodeId}:${field}`（§2.4）。
   */
  setNodeFields: 'set_node_fields',
  /**
   * 给节点换模型 —— **modelId 与 optionId（渠道）一起下**（K-3 根治）。
   * ⛔ 缺渠道整步拒：同一个型号可能有工作区内置与用户 key 两条路由。
   */
  setNodeModel: 'set_node_model',
  /** 把参考（画布卡图集 / 素材库 id）挂到媒体节点的引用架。⛔ URL 由服务端填，模型不写。 */
  attachRefs: 'attach_refs',
  /** 改审核态。沿用逐条确认；`approved` **硬禁**（`approvedForbidden`）—— 助手不能替人放行。 */
  setReviewState: 'set_review_state',
  /**
   * 把**某个节点**的生成键置成 primed。与 `prime_generate` 同一条宪法：
   * 服务端什么都不做，⛔ 不算价（owner 两次拍：画布不做积分 / 价签预览），点的人永远是用户。
   */
  primeNodeGenerate: 'prime_node_generate',
  /**
   * 写 ScriptDoc（定义在 C0，实现在 C3）。投影仍走 `previewScriptDocProjection`
   * + 既有确认门，这条工具只改文档本身。
   */
  updateScriptDoc: 'update_script_doc',
} as const

/**
 * 画布批内新建节点的**临时 id 前缀**：`stage_nodes` 给每项一个 `new:<n>` 别名，
 * 同一 run 后续 `connect_nodes` / `set_node_fields` 可引用；客户端 apply 时映射成
 * 真实 id（`CanvasWorkingState.aliases`）。⛔ 别名只活在一轮之内。
 */
export const ASSISTANT_OPERATOR_CANVAS_ALIAS_PREFIX = 'new:'

export const ASSISTANT_OPERATOR_TOOLS = [
  ASSISTANT_OPERATOR_TOOL_IDS.readState,
  ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
  ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders,
  ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder,
  ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
  ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
  ASSISTANT_OPERATOR_TOOL_IDS.setModel,
  ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
  ASSISTANT_OPERATOR_TOOL_IDS.setNegative,
  ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
  ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
  ASSISTANT_OPERATOR_TOOL_IDS.setCount,
  ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference,
  ASSISTANT_OPERATOR_TOOL_IDS.setSound,
  ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
  ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
  ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
  ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
  ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
  ASSISTANT_OPERATOR_TOOL_IDS.unmountLora,
  ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
  ASSISTANT_OPERATOR_TOOL_IDS.readGraph,
  ASSISTANT_OPERATOR_TOOL_IDS.readNode,
  ASSISTANT_OPERATOR_TOOL_IDS.stageNodes,
  ASSISTANT_OPERATOR_TOOL_IDS.connectNodes,
  ASSISTANT_OPERATOR_TOOL_IDS.setNodeFields,
  ASSISTANT_OPERATOR_TOOL_IDS.setNodeModel,
  ASSISTANT_OPERATOR_TOOL_IDS.attachRefs,
  ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
  ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate,
  ASSISTANT_OPERATOR_TOOL_IDS.updateScriptDoc,
] as const

export type AssistantOperatorTool = (typeof ASSISTANT_OPERATOR_TOOLS)[number]

/**
 * 只读工具 —— 不产生 op，客户端没有东西可撤销。
 *
 * ⚠ `search_web_images` 在这一档**不是勉强归类**：它连一条候选都不落，日志条上
 * 那几张图是纯预览。用户点选之后发生的转存不是这一步的后果，是用户自己的动作
 * （它有自己的界面反馈与失败态），所以这一步照样没有东西可撤。
 */
export const ASSISTANT_OPERATOR_READ_TOOLS = [
  ASSISTANT_OPERATOR_TOOL_IDS.readState,
  ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
  ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders,
  ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder,
  ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
  /**
   * ⚠ 看图**也是读**：这一步只产生一段评价，表单一个字都没动。所以它没有
   * `inverse`，日志条上也不该出现「撤销」（撤一条评价什么都撤不掉）。
   * 真正要撤的是它之后那几条 `set_*` —— 那正是评价卡上「还原这轮」在做的事。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
  /**
   * ⚠ 找 LoRA **也是读**（P4-C）：它出的是一串候选，一个字节都没下载、一把都没挂上。
   * 与 `search_web_images` 同一档 —— 落地那一跳（导入 + 挂载）是 `mount_lora` 的事，
   * 撤销也撤在那一条上。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
  /** 画布两条读：概览与单节点全量。都只从请求快照的工作副本取，不查库。 */
  ASSISTANT_OPERATOR_TOOL_IDS.readGraph,
  ASSISTANT_OPERATOR_TOOL_IDS.readNode,
] as const

/**
 * 改动型工具 —— **每一条的 step 都必须带 `inverse`**，那是撤销的本钱（拍板 18）。
 *
 * ⚠ 这不是靠自觉：schema 层把改动型 step 的 `inverse` 写成必填，缺了就校验失败
 * （`types/assistant-operator.ts` + 那边的单测）。新加一条改动型工具而忘了想清楚
 * 「怎么撤」，在编译/测试期就会被拦下来，而不是等到用户点撤销时发现没反应。
 */
export const ASSISTANT_OPERATOR_MUTATING_TOOLS = [
  ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
  ASSISTANT_OPERATOR_TOOL_IDS.setModel,
  ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
  ASSISTANT_OPERATOR_TOOL_IDS.setNegative,
  ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
  ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
  ASSISTANT_OPERATOR_TOOL_IDS.setCount,
  ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference,
  ASSISTANT_OPERATOR_TOOL_IDS.setSound,
  ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
  /**
   * ⚠ 拍板 22 那条是**改动型**：它让参考位上多出一张图，撤销就是把那张摘掉
   * （`inverse` 里放的是**源地址**，客户端按「源地址 → 落地地址」的对照表反查 ——
   * 落地地址在服务端还不存在，那一跳发生在客户端）。
   * ⛔ 撤销**不删素材**：用户亲手递的那条地址是他自己的决定，摘掉挂载就够了；
   * 拍板 21 的「零残留」管的是助手搜出来的候选，不是这一条。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
  /**
   * LoRA 域那三条改动型（P4-C）。
   *
   * ⚠ `mount_lora` 的 `inverse` 里放的是 **candidateId** 而不是库记录 id —— 后者在
   * 服务端还不存在（导入那一跳在客户端）。形态与 `import_user_url` 逐字同源。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
  ASSISTANT_OPERATOR_TOOL_IDS.unmountLora,
  ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
  /**
   * 画布域那八条改动型（C0）。撤法各不相同，全部写在 `AppliedStepSchema` 上：
   * `stage_nodes` / `connect_nodes` 撤的是**这一批**（拍板 3：批撤只在最近一步可用），
   * `set_*` 撤到改前值，`attach_refs` 摘掉这次挂的，`prime_node_generate` 回灰。
   */
  ASSISTANT_OPERATOR_TOOL_IDS.stageNodes,
  ASSISTANT_OPERATOR_TOOL_IDS.connectNodes,
  ASSISTANT_OPERATOR_TOOL_IDS.setNodeFields,
  ASSISTANT_OPERATOR_TOOL_IDS.setNodeModel,
  ASSISTANT_OPERATOR_TOOL_IDS.attachRefs,
  ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
  ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate,
  ASSISTANT_OPERATOR_TOOL_IDS.updateScriptDoc,
] as const

export function isMutatingAssistantOperatorTool(
  tool: AssistantOperatorTool,
): boolean {
  return (ASSISTANT_OPERATOR_MUTATING_TOOLS as readonly string[]).includes(tool)
}

/**
 * `search_assets` 能检索的媒体类型。
 *
 * ⚠ 判据一直是同一条：**工作台上有没有把它挂上去的槽**（拍板 19）。3D 至今
 * 没有，所以至今不在表里；音频在 P4-A 进来，因为视频工作台的音频参考面板
 * （`StudioVideoAudioPanel`，台账 A）就是那个槽 —— 它挂的是素材库里的音频。
 * ⛔ 「有这个类型」不等于「哪个域都能挂」：`audio` 只在视频域挂得上，图片域调
 * `mount_audio_reference` 会被域工具表挡掉（见 `ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN`）。
 * 值域与 `OUTPUT_TYPE_VALUES` 的从属关系由 `types/assistant-operator.ts` 的
 * `satisfies` 锁住。
 */
export const ASSISTANT_OPERATOR_SEARCH_KINDS = [
  'image',
  'video',
  'audio',
] as const

export type AssistantOperatorSearchKind =
  (typeof ASSISTANT_OPERATOR_SEARCH_KINDS)[number]

/** 文件夹视觉检查对每张图的相关度结论；不用虚假的百分比分数。 */
export const ASSISTANT_FOLDER_VISION_RELEVANCE_IDS = {
  high: 'high',
  medium: 'medium',
  low: 'low',
  unknown: 'unknown',
} as const

export const ASSISTANT_FOLDER_VISION_RELEVANCES = Object.values(
  ASSISTANT_FOLDER_VISION_RELEVANCE_IDS,
)

export const ASSISTANT_FOLDER_VISION_DEFAULT_INSTRUCTION =
  'Describe each image accurately, identify the strongest recurring patterns, and call out important differences.'

/**
 * `search_assets` **不指定类型时**默认搜什么。
 *
 * ⚠ 不是 `ASSISTANT_OPERATOR_SEARCH_KINDS` 全集：音频进表之后，一次泛搜会把
 * 一堆挂不到参考图位上的音频混进候选里（图片域尤其荒唐）。要音频就明写
 * `kind:'audio'` —— 那是一次有意的动作，而不是泛搜的副产物。
 */
export const ASSISTANT_OPERATOR_DEFAULT_SEARCH_KINDS = [
  'image',
  'video',
] as const satisfies readonly AssistantOperatorSearchKind[]

/** 一步的三态。同一个 step id 先 `running` 后 `done` / `error`。 */
export const ASSISTANT_OPERATOR_STEP_STATUS_IDS = {
  running: 'running',
  done: 'done',
  /** ⚠ 只用于**被规划器拒掉**的那一步 —— 它没有 payload / inverse，什么都没应用。 */
  error: 'error',
} as const

export const ASSISTANT_OPERATOR_STEP_STATUSES = [
  ASSISTANT_OPERATOR_STEP_STATUS_IDS.running,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
] as const

export type AssistantOperatorStepStatus =
  (typeof ASSISTANT_OPERATOR_STEP_STATUSES)[number]

/**
 * 没跑完就停下来的理由。
 *
 * ⚠ `awaitingConfirm` 与 `aborted` **走的是同一条机制**（流结束 + 客户端带上下文
 * 重发），只是触发方不同 —— 前者是助手要问一句，后者是用户插话。合成一个理由会
 * 让 UI 分不出「等你选」和「你打断了」。
 */
export const ASSISTANT_OPERATOR_STOP_REASONS = {
  /** 客户端 abort 了（插话 / ⏹，拍板 13）。 */
  aborted: 'aborted',
  /** 等就地确认（拍板 3）。客户端带 `confirmations` 重发即可续跑。 */
  awaitingConfirm: 'awaiting_confirm',
  /** 撞到步数上限。**不自动续跑** —— 台账 AH：这条链没有幂等键，不做任何自动重试。 */
  maxSteps: 'max_steps',
} as const

export type AssistantOperatorStopReason =
  (typeof ASSISTANT_OPERATOR_STOP_REASONS)[keyof typeof ASSISTANT_OPERATOR_STOP_REASONS]

/** 会触发就地确认的字段 —— 工作台上只有这两个是「用户手写的自由文本」。 */
export const ASSISTANT_OPERATOR_CONFIRM_FIELDS = {
  prompt: 'prompt',
  negative: 'negative',
} as const

export type AssistantOperatorConfirmField =
  (typeof ASSISTANT_OPERATOR_CONFIRM_FIELDS)[keyof typeof ASSISTANT_OPERATOR_CONFIRM_FIELDS]

/**
 * 画布域会触发就地确认的**节点字段**（任务书 §2.4）：节点 title 与 prompt 族自由
 * 文本字段（`NODE_WORKFLOW_FIELDS`）。确认键是 `${nodeId}:${field}` 复合键，
 * 由 `buildAssistantOperatorCanvasConfirmKey` 拼；`confirm_request` 载荷带
 * `nodeId`，decisions 也按复合键存。结构 op 一律不确认（08-08 拍板）。
 */
export const ASSISTANT_OPERATOR_CANVAS_CONFIRM_FIELD_IDS = {
  title: 'title',
  /**
   * 审核态也走这条确认通道（附录 D §5）：`set_review_state` 每次都问，choices 只有
   * overwrite / keep（客户端渲染成「确认 / 跳过」）。`approved` 到不了这里 ——
   * 规划器先按 `approvedForbidden` 拒。
   */
  reviewState: 'reviewState',
} as const

export const ASSISTANT_OPERATOR_CANVAS_CONFIRM_FIELDS = [
  ASSISTANT_OPERATOR_CANVAS_CONFIRM_FIELD_IDS.title,
  ASSISTANT_OPERATOR_CANVAS_CONFIRM_FIELD_IDS.reviewState,
  ...NODE_WORKFLOW_FIELDS,
] as const

export type AssistantOperatorCanvasConfirmField =
  (typeof ASSISTANT_OPERATOR_CANVAS_CONFIRM_FIELDS)[number]

/** 复合确认键的分隔符。节点 id 里不会出现冒号（nanoid / cuid），所以拆得回去。 */
export const ASSISTANT_OPERATOR_CANVAS_CONFIRM_KEY_SEPARATOR = ':'

export type AssistantOperatorCanvasConfirmKey =
  `${string}${typeof ASSISTANT_OPERATOR_CANVAS_CONFIRM_KEY_SEPARATOR}${AssistantOperatorCanvasConfirmField}`

export function buildAssistantOperatorCanvasConfirmKey(
  nodeId: string,
  field: AssistantOperatorCanvasConfirmField,
): AssistantOperatorCanvasConfirmKey {
  return `${nodeId}${ASSISTANT_OPERATOR_CANVAS_CONFIRM_KEY_SEPARATOR}${field}`
}

/** 就地确认小条上的三个选择（拍板 3，逐字对应切片 v4 的「追加在后 / 覆盖 / 保留」）。 */
export const ASSISTANT_OPERATOR_CONFIRM_CHOICES = {
  append: 'append',
  overwrite: 'overwrite',
  keep: 'keep',
} as const

export type AssistantOperatorConfirmChoice =
  (typeof ASSISTANT_OPERATOR_CONFIRM_CHOICES)[keyof typeof ASSISTANT_OPERATOR_CONFIRM_CHOICES]

/**
 * 文本写入方式。`append` 时客户端把新值接在旧值后面（用 `appendSeparator`），
 * `replace` 时整段换掉 —— 而 `inverse` 两种情况下都是**改前的完整原文**，
 * 撤销因此只有一种实现。
 */
export const ASSISTANT_OPERATOR_WRITE_MODES = {
  replace: 'replace',
  append: 'append',
} as const

export type AssistantOperatorWriteMode =
  (typeof ASSISTANT_OPERATOR_WRITE_MODES)[keyof typeof ASSISTANT_OPERATOR_WRITE_MODES]

/** 追加时插在旧文本与新文本之间的分隔符。放常量是因为撤销/预览两处都要用它算长度。 */
export const ASSISTANT_OPERATOR_APPEND_SEPARATOR = ', '

/**
 * 操作员的域 —— 工作台三域 + 画布，**取值来自 `ASSISTANT_PROTOCOL_DOMAINS`**（域简报
 * 已分域，复用不重造）。`canvas` 自 C0 起接入（任务书
 * `docs/plans/canvas-assistant-operator-c0c1-2026-09-01.md` §2.1），
 * `ASSISTANT_DOMAIN_BRIEFS.canvas` 从此由 `buildOperatorSystemPrompt('canvas')` 消费。
 * `satisfies` 保证有人改域词表时这里编译期就红。
 */
export const ASSISTANT_OPERATOR_DOMAINS = [
  ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.video,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.lora,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas,
] as const satisfies readonly AssistantProtocolDomain[]

export type AssistantOperatorDomain =
  (typeof ASSISTANT_OPERATOR_DOMAINS)[number]

/**
 * **跨域通用**的那几条 —— 换个工作台它们做的还是同一件事。
 *
 * 判据：这条工具动的东西在每个域里都长着同一个样子（读快照 / 搜库 / 搜网 /
 * 收下用户递的链接 / 挂参考图 / 把生成键点亮）。⛔ 一旦某个域的形状不同
 * （比如视频的规格是三格、图片是两格），那就不是通用件，得各自一条。
 */
const COMMON_DOMAIN_TOOLS = [
  ASSISTANT_OPERATOR_TOOL_IDS.readState,
  ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
  ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders,
  ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder,
  ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
  ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
  ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
  ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
  ASSISTANT_OPERATOR_TOOL_IDS.setNegative,
  ASSISTANT_OPERATOR_TOOL_IDS.setModel,
  ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
] as const satisfies readonly AssistantOperatorTool[]

/**
 * **一个域有哪些工具**（拍板 8 的另一半：切域换工具，不断会话）。
 *
 * ── 为什么工具表要按域裁，而不是靠快照缺席去拒 ────────────────────
 * 快照缺席那条闸仍然在（`noSuchControl`），但它是**事后**的：模型先花一步调，
 * 再读到一句「这台机器上没这回事」。而每一步都是一次完整的 LLM 往返，
 * `maxSteps` 只有 8 —— 在视频档上白烧一步去试 `set_count` 是真的会发生的事
 * （它在系统提示的工具表里看得见）。裁掉之后它压根看不见那条工具。
 * ⚠ 两道闸都要留：模型仍可能写出一个不在自己域里的工具名（提示词不是闸），
 * 那时规划器按 `noSuchControl` 拒并说清楚「这条工具不在这个工作台上」。
 *
 * ⚠ 写成 `Record<域, …>`：域词表加一个而这里没跟上，编译期就红。
 */
export const ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN: Record<
  AssistantOperatorDomain,
  readonly AssistantOperatorTool[]
> = {
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.image]: [
    ...COMMON_DOMAIN_TOOLS,
    ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
    ASSISTANT_OPERATOR_TOOL_IDS.setCount,
    /**
     * ⭐ 看图闭环**只在图片域**：借来的那条视觉线吃的是一张静态图
     * （`imageData: result.url`）。把一条 mp4 地址喂给它，得到的是一份格式完整、
     * 内容全编的评价 —— 正是 `vision-route.service.ts` 头注里说的那种，比说不出话
     * 坏得多。视频要能被看，得先有一条真的能读视频的路，那是另一件事。
     */
    ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
  ],
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.video]: [
    ...COMMON_DOMAIN_TOOLS,
    ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
    ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference,
    ASSISTANT_OPERATOR_TOOL_IDS.setSound,
  ],
  /**
   * LoRA 装配台（P4-C）。
   *
   * ── 通用件为什么是这九条，以及**缺的那两条为什么缺** ──────────────────
   * `/studio/lora` 的界面上真有：提示词框、负面框（可折叠）、底模选择器、参考图卡
   * （逐底模按能力开关）、装配台挂载栈、出图键。所以九条通用件一条不少。
   * ⛔ **没有 `set_count`**：装配台是单次出图，界面上压根没有张数控件
   *    （`LoraWorkbench` 里那句「本域是单次出图，压根没有张数字段」）。
   * ⛔ **没有 `set_specs`**：装配台有比例（`LoraAspectRatioChip`）却**没有清晰度**
   *    —— 而 `set_specs` 的两个字段都是必填（台账 AE/BG/BS：只给比例不是真比例）。
   *    摆一条这里永远无解的工具，正是 2026-08-30「三连红而表单没动」那个形状。
   *    比例这颗旋钮因此在本片**够不着**（如实记在任务包里，补它是独立一件：
   *    要么给 LoRA 域一条单字段的比例工具，要么等装配台补上清晰度控件）。
   * ⛔ **没有 `critique_result`**：看图闭环的归属追踪（`studio-operator-claim`）
   *    盯的是工作台的 `activeRun`，而装配台走自己那条结果列（`resultHistory`）。
   *    在闭环接上之前给这条工具，只会让它每次都撞 `noResultToCritique`。
   */
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.lora]: [
    ...COMMON_DOMAIN_TOOLS,
    ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
    ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
    ASSISTANT_OPERATOR_TOOL_IDS.unmountLora,
    ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
  ],
  /**
   * 节点画布（C0，任务书 §2.3）。
   *
   * ⛔ **不铺 `COMMON_DOMAIN_TOOLS`**：`set_prompt` / `set_model` / `prime_generate` /
   * `mount_reference` 动的都是「这台工作台的那一格」，而画布上每一格都是「某个
   * 节点的」—— 形状不同即非通用件（`COMMON_DOMAIN_TOOLS` 头注的判据）。画布各自
   * 一条：`set_node_fields` / `set_node_model` / `prime_node_generate` / `attach_refs`。
   * 从通用件里只借三条**读库**的：搜素材、找文件夹、看文件夹（C3 接内容）。
   * ⛔ 表里**没有任何一条叫 generate 的**，`prime_node_generate` 是唯一沾字的，
   * 载荷只有 `{ nodeId, primed: true }`（money-gate 测试 ① 锁）。
   */
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas]: [
    ASSISTANT_OPERATOR_TOOL_IDS.readGraph,
    ASSISTANT_OPERATOR_TOOL_IDS.readNode,
    ASSISTANT_OPERATOR_TOOL_IDS.stageNodes,
    ASSISTANT_OPERATOR_TOOL_IDS.connectNodes,
    ASSISTANT_OPERATOR_TOOL_IDS.setNodeFields,
    ASSISTANT_OPERATOR_TOOL_IDS.setNodeModel,
    ASSISTANT_OPERATOR_TOOL_IDS.attachRefs,
    ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
    ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate,
    ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders,
    ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder,
    ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
  ],
}

export function isAssistantOperatorToolInDomain(
  tool: AssistantOperatorTool,
  domain: AssistantOperatorDomain,
): boolean {
  return ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN[domain].includes(tool)
}

export const ASSISTANT_OPERATOR_LIMITS = {
  /**
   * 一轮最多跑几步。**每一步都是一次完整的 LLM 往返**，所以这个数直接决定最坏
   * 情况下的等待时间与账单，不是防御性的大数。撞到上限按 `maxSteps` 停下并说出来。
   */
  maxSteps: 8,
  /** 计划条最多几项 / 每项多长。它是给人看的一句话，不是可执行清单。 */
  maxPlanItems: 6,
  maxPlanItemChars: 120,
  /** 日志条的标题与理由（拍板 18 的「候选与放弃理由」写在 reason 里）。 */
  maxTitleChars: 80,
  maxReasonChars: 300,
  /** 一轮对白的长度上限。 */
  maxMessageChars: 4000,
  /**
   * 提示词 / 负面提示词载荷的长度上限。
   *
   * ⚠ 这**不是**产品上限（表单里人手输入不受此限），只是「一条 op 能有多大」的
   * DoS 护栏 —— 与 `NODE_ASSISTANT_OP_LIMITS.maxPromptLength` 同性质，别把它当成
   * 能力承诺印到 UI 上。
   */
  maxPromptChars: 4000,
  /** 模型 id / 档位值 / 标签这类短字符串。 */
  maxIdChars: 200,
  maxLabelChars: 120,
  maxParamValueChars: 40,
  /** 快照里能列多少个可选模型 —— 与 `ASSISTANT_WORKBENCH_STATE_LIMITS.maxCatalogModels` 同量级。 */
  maxAvailableModels: 24,
  /** 一个档位（比例 / 清晰度）最多列几个可选值。 */
  maxSpecOptions: 24,
  /** 快照里已挂的参考图条数上限（纯载荷护栏，真上限由 `references.limit` 说了算）。 */
  maxSnapshotReferences: 16,
  /**
   * `search_assets` 一次最多返回几条。
   *
   * 附件面板一屏就摆 6 格（拍板 16），这里给 12 是留出「模型从中挑一张」的余地 ——
   * 日志详情要展示候选与放弃理由（拍板 18），只给 6 条就没什么可挑的。再往上翻倍
   * 只会让每一步的 token 变贵而候选质量不变。
   */
  maxSearchResults: 12,
  /** `search_assets` 的查询词长度，与 `GallerySearchSchema.search` 的 200 对齐。 */
  maxSearchQueryChars: 200,
  /** 一次最多把多少个同名/近名文件夹交给模型消歧。 */
  maxFolderMatches: 12,
  /** 文件夹名称查询沿用 Project.name 的短字符串尺度。 */
  maxFolderQueryChars: 120,
  /** 一次文件夹视觉检查最多真的送进模型多少张图。 */
  maxFolderVisionImages: 24,
  /** 每次视觉补全的图片数；必须与 `VISION_LIMITS.maxMedia` 保持一致。 */
  maxFolderVisionBatchImages: 8,
  /** 模型转述给视觉线的本轮目标，例如“挑三张角色参考”。 */
  maxFolderVisionInstructionChars: 600,
  /** 逐图观察与理由的协议护栏，避免 24 张时事件体无界增长。 */
  maxFolderVisionObservationChars: 400,
  maxFolderVisionReasonChars: 300,
  maxFolderVisionTags: 6,
  maxFolderVisionTagChars: 40,
  maxFolderVisionBatchSummaryChars: 800,
  maxFolderVisionUncertainties: 8,
  /**
   * `search_web_images` 一次最多返回几张候选。
   *
   * ⚠ 与 `maxSearchResults`（12）分开：那是库内检索，一个 credit 都不花；这一条
   * **每调一次就是一个 Serper credit**（免费池 2500）。8 张已经够日志条摆两行，
   * 再多只是让每一步的 token 更贵。真正的上限在 `WEB_IMAGE_SEARCH.maxNumResults`，
   * 这里是协议侧的护栏，两边取小。
   */
  maxWebImageResults: 8,
  /**
   * 联网查询词的长度。**比库内检索短得多是故意的** —— 图搜引擎吃的是短查询，
   * 一段两百字的描述只会让召回崩掉（系统提示里也这么告诉模型）。
   */
  maxWebImageQueryChars: 120,
  /**
   * 重发时能带回来的「前情 steps」条数。
   *
   * ⚠ 这条链**没有服务端会话态**（拍板 13 的打断语义就靠这个成立），所以上一轮
   * 做过什么全靠客户端带回来。给得太少 = 助手在插话后忘了自己刚改过什么，
   * 于是重复改一遍。
   */
  maxPriorSteps: 24,
  maxPriorStepSummaryChars: 200,
  /** 就地确认里「你已经写了什么」的摘要长度 —— 小条上放不下一整段。 */
  maxConfirmHaveChars: 200,
  /**
   * 一张评价卡最多列几条（P3-C，拍板 6）。
   *
   * ⚠ 4 条是**版式上限不是模型的礼貌**：卡片左边是那张图（h-28），右边放得下
   * 四行；给 8 条只会让图和结论错位半屏。真要说更多，让它写进 `advice`。
   */
  maxCritiqueFindings: 4,
  /** 一条结论一句话 —— 卡片一行放得下的长度。 */
  maxCritiqueFindingChars: 120,
  /** 「下一轮建议」那一行。 */
  maxCritiqueAdviceChars: 300,
  /** 评价那一步能带的目标描述（模型自己写的「这一轮想要什么」）。 */
  maxCritiqueGoalChars: 300,
  /**
   * `import_user_url` 收的地址长度（P3-D，拍板 22）。
   *
   * ⚠ 比 `maxIdChars`(200) 宽：真实的图片直链常带一长串签名参数
   * （wikimedia 的 `thumb/…/1280px-….jpg`、CDN 的 `?token=`），200 会把正常地址
   * 截在半路，而截断过的地址**永远过不了「逐字出现在用户消息里」那道闸** ——
   * 表现是「我明明把链接给它了，它说那不是我给的」。
   */
  maxUserUrlChars: 2000,
  /**
   * 连着几次撞上「同一步重复」就强制收尾（P3-D 卡死护栏）。
   *
   * ⚠ 2 是「一次是抖动、两次是打转」：第一次拒掉时模型读得到理由，还有一次
   * 换策略的机会；第二次说明它没读进去，再放它跑下去只会把剩下的步数（每一步
   * 都是一次完整 LLM 往返）全烧在同一个坑里 —— 那正是 owner 撞到的三连搜。
   */
  maxRepeatedStepStrikes: 2,
  /**
   * `search_loras` 一次最多回几张候选（P4-C）。
   *
   * ⚠ 真上限在 `LORA_CANDIDATE_LIMITS.maxCandidates`（检索层自己的），两边取小 ——
   * 这里是协议侧的护栏。⛔ 别在这里抄一份检索层的数：那两个数分叉的表现是
   * 「日志里说找到 8 条，候选行只画得出 6 条」。
   * 6 是候选行一屏摆得下、又够挑的量；`[[lora]]` 推荐块的 `maxPicks` 是 3，
   * 检索给 6、推 3，中间那一层「挑」正是助手的活。
   */
  maxLoraResults: 6,
  /** LoRA 检索词长度 —— 与库内检索同量级（上游吃的是短查询）。 */
  maxLoraQueryChars: 120,
  /**
   * 就地确认回执的条数上限。
   *
   * ⚠ 此前是 `Object.keys(ASSISTANT_OPERATOR_CONFIRM_FIELDS).length`（= 2），
   * 那在工作台上成立（一个域只有两个自由文本框）；画布按 `${nodeId}:${field}`
   * 复合键存决定（§2.4），一轮里可能问到好几个节点，2 会把第三条决定整包拒掉。
   * 24 与 `maxPriorSteps` 同量级 —— 一轮最多 8 步，问不到这个数。
   */
  maxConfirmDecisions: 24,
  // ── 画布快照（C0，§2.2）────────────────────────────────────────────
  /** 快照里最多带多少个节点 / 边 —— 与 `NODE_STUDIO_ASSISTANT_LIMITS.maxNodes`（32）对齐上探。 */
  maxCanvasNodes: 64,
  maxCanvasEdges: 128,
  /** 一个节点的自由文本字段数上限（`NODE_WORKFLOW_FIELDS` 是 18 个）。 */
  maxCanvasNodeFields: 24,
  /** 一个节点上的档位数上限（今天视频节点是 5 个）。 */
  maxCanvasNodeParams: 12,
  /** 一个节点引用架上最多带几条（纯载荷护栏，真上限由模型契约给）。 */
  maxCanvasNodeReferences: 16,
  /** 参考图 / 媒体地址长度 —— 与 `NodeWorkflowReferenceAssetSchema.url` 的 4000 对齐。 */
  maxCanvasUrlChars: 4000,
  /** ScriptDoc 摘要长度（C3 填内容，C0 留位）。 */
  maxCanvasScriptDocSummaryChars: 2000,
  /**
   * 一步里最多建几个节点 / 连几条边 / 改几个节点。
   *
   * ⚠ 「一步一批」是撤销粒度（拍板 3：批撤只在最近一步可用），不是吞吐承诺。
   * 8 与 `NODE_ASSISTANT_OP_LIMITS.maxOps` 同量级 —— 再大，一次撤掉的东西用户就看不过来了。
   */
  maxCanvasBatchItems: 8,
  /** 别名 `new:<n>` 的长度（前缀 + 序号），远小于 `maxIdChars`。 */
  maxCanvasAliasChars: 16,
  /** 渠道 id（`optionId`）长度 —— 与 `NodeWorkflowModelSelectionSchema.optionId` 的 240 对齐。 */
  maxCanvasOptionIdChars: 240,
  /**
   * 快照 `canvas.modelOptions[]` 的行数上限（附录 D §7：按 nodeType 列
   * modelId + optionId + label + 相对价签）。同一型号多条渠道各占一行。
   */
  maxCanvasModelOptions: 64,
} as const

/**
 * 工具被规划器拒绝的理由。
 *
 * ⚠ 与画布同一条论据：**值域校验一律留在规划器，不收进 schema 的 enum**。
 * schema 拒 = 模型这一轮的输出整个解析失败，用户看到一句笼统的「读不出来」；
 * 规划器拒 = 那一条日志显示「这个工作台没有负面框」，助手还能据此改口。
 * 同一个禁令，后者可教。
 */
export const ASSISTANT_OPERATOR_REJECT_REASON_IDS = {
  /**
   * 这个工作台上**根本没有这个控件**（拍板 19：助手只动用户看得见的旋钮）。
   * 判据是快照里对应的那一节缺席 —— 比如图片台没有负面框、音频台没有比例。
   * ⚠ 台账 BJ 那条（参考强度）就是靠这一条兜住：控件没补上之前，工具压根不存在。
   */
  noSuchControl: 'noSuchControl',
  /** 模型 id 不在快照的 `availableModels` 里 —— 十有八九是它自己编的。 */
  unknownModel: 'unknownModel',
  /** 档位值不在快照给的那张表里。⛔ 不做就近匹配。 */
  unknownValue: 'unknownValue',
  /**
   * `mount_reference` 引的 asset 本轮 `search_assets` 从没返回过。
   * ⛔ 不去补查一次：那等于承认模型可以凭空说出一个 id。
   */
  unknownAsset: 'unknownAsset',
  /** `inspect_asset_folder` 引的 folder id 本轮从未由 `list_asset_folders` 返回。 */
  unknownFolder: 'unknownFolder',
  /** 参考图位已满（上限由快照的 `references.limit` 给）。 */
  referencesFull: 'referencesFull',
  /** 写了个空字符串 —— 清空字段不是助手该干的事，要清用户自己清。 */
  emptyValue: 'emptyValue',
  /**
   * 就地确认里用户选了「保留」（拍板 3）。
   *
   * ⚠ 它是**用户的决定**，不是助手的错 —— 与其余几条分开，UI 上的语气也该不同。
   * 留在拒绝词表里而不是静默跳过，是因为线程里必须看得见「这一步没做，因为你说别动」。
   */
  userDeclined: 'userDeclined',
  /**
   * 还没选模型。
   *
   * 两处用它：`prime_generate`（与人手点生成键时的拦法一致），以及 **`set_specs`
   * —— 清晰度档位表由已选模型算出来，没模型就一个值都没有**（2026-08-30 真机：
   * 那时它是被 args schema 抓成 `malformedArgs` 的，用户连着吃三条红字而表单没动）。
   * ⚠ 与 `noSuchControl` 分开：这条是「还差一步」，那条是「这台机器上没这回事」。
   */
  noModelSelected: 'noModelSelected',
  /** `prime_generate` 时提示词还是空的。 */
  emptyPrompt: 'emptyPrompt',
  /** 模型写的参数形状不对（缺字段 / 类型错），已经过一次 schema。 */
  malformedArgs: 'malformedArgs',
  /**
   * 联网搜图这条路当下用不了（平台没配 `SERPER_API_KEY`）。
   *
   * ⚠ 与 `noSuchControl` 分开：那条说的是「这台工作台上没这回事」（拍板 19），
   * 这条说的是「这个能力在，但后端没接通」。合成一条会让日志说谎 —— 用户会以为
   * 是自己的工作台不支持，然后去别的模态再试一遍。
   * ⚠ 它不是用户的 key（那类缺 key 要路由到 `QuickSetupDialog`，Hard Rule 8），
   * 是平台侧的一条线路，用户这边**没有任何可配置的东西**，所以只说明、不引导。
   */
  searchUnavailable: 'searchUnavailable',
  /**
   * 这一轮**没有结果图可看**（P3-C）。
   *
   * ⚠ 与 `noSuchControl` 分开：那条说「这台工作台上没这回事」，这条说
   * 「有这回事，但此刻没有它自己备的那一张」。用户自己点的生成不会带 `result`
   * 进来（拍板 4「用户自己发的不打扰」），所以这条**是常态而不是故障** ——
   * 模型读到它就该明白「等它备的那次跑完再说」。
   */
  noResultToCritique: 'noResultToCritique',
  /**
   * 一条能看图的路都借不到（P3-C）。
   *
   * ⛔ **不降级成「凭提示词猜」** —— 让一个看不见图的模型评价一张图，产出的是
   * 一份格式完整、内容全编的评价，比说不出话坏得多（论据与
   * `services/vision/vision-route.service.ts` 头注同源）。
   */
  visionUnavailable: 'visionUnavailable',
  /**
   * 看了，但那条视觉线没给出读得懂的评价（P3-C）。
   *
   * ⚠ 它是一条**被规划器拒掉的步**而不是一次抛错，这是有意的：抛错会让整轮以
   * 一句笼统的「跑到一半失败了」结束、日志停在半截（`clamp` 那段头注记的就是
   * 这种失败的样子）。做成拒绝之后，助手读得到理由，还能接着改表单。
   */
  critiqueFailed: 'critiqueFailed',
  /**
   * `import_user_url` 引的那条地址**不是用户自己给的**（P3-D，拍板 22）。
   *
   * ⭐ 判据是结构性的：那条 URL 必须**逐字**出现在本次请求的某条用户消息里。
   * 「你递的就是确认」的另一半就是这条 —— 用户没递过的地址，助手不能替他确认。
   * ⛔ 不放宽成「同域名就算」：那等于让模型把用户给的一条链接扩写成整个站。
   * 助手自己搜来的候选走另一条路（用户点「选用」，拍板 21）。
   */
  urlNotFromUser: 'urlNotFromUser',
  /**
   * 这一步与本轮**已经跑过的某一步一模一样**（P3-D 卡死护栏）。
   *
   * 🔬 owner 2026-08-31 真机：用户递了三条链接，而当时没有任何工具能接 URL ——
   * 助手于是连着跑了三次**同参**的「查找已保存的参考图」，把步数烧光，最后回头
   * 支使用户自己去点图。原地打转在事后一目了然，在当时对模型却是「再试一次
   * 说不定就有了」，靠提示词劝不住，只能在环上拦。
   * ⚠ 只比对**真的执行过**的步，不比对被拒的步：被拒之后条件可能已经变了
   * （`set_specs` 被 `noModelSelected` 拒 → 选完模型再来一次是**对的**行为），
   * 拿被拒的步去堵会把那条唯一的出路一起堵上。
   */
  repeatedStep: 'repeatedStep',
  /**
   * `mount_lora` 引的候选**本轮 `search_loras` 从没返回过**（P4-C）。
   *
   * ⛔ 与 `unknownAsset` 同一条论据，而且代价更大：这条链后面接着的是「导入进库」，
   * 一个编出来的 id 换来的是一次 404 或者别人的模型。⛔ 不去补搜一次。
   */
  unknownLora: 'unknownLora',
  /**
   * `unmount_lora` / `set_lora_weight` 指的那把**不在装配台上**（P4-C）。
   *
   * ⚠ 与 `unknownLora` 分开：那条是「你编了一个候选」，这条是「那把 LoRA 你没挂着」
   * —— 后者常常只是助手把候选 id 当成了挂载项 id，说清楚它就改得过来。
   */
  loraNotMounted: 'loraNotMounted',
  /**
   * 这把 LoRA **导入不了**（P4-C）。
   *
   * 判据来自检索层写在数据上的那一位（`LoraCandidate.importable`，门槛 = 定得出
   * 底模家族 + 有权重文件）。⛔ 不阻断展示 —— 不可导入的候选照样出现在候选行里
   * （策略 C：如实说明），只是挂不上；助手读到这条理由该改口说「这把只能去它的
   * 来源页看」，而不是换个参数再挂一次。
   */
  loraNotImportable: 'loraNotImportable',
  // ── 画布域（C0）──────────────────────────────────────────────────
  /**
   * 引的节点 id **不在快照里**，也不是本轮 `stage_nodes` 给出的别名。
   * ⛔ 不做前缀 / 模糊匹配：猜错一个节点，改动就落在别人的卡上。
   */
  unknownNode: 'unknownNode',
  /** `stage_nodes` 要建的类型不在 `CANVAS_ADD_CATALOG` 里（用户自己也建不出来的类型，助手也不建）。 */
  unknownNodeType: 'unknownNodeType',
  /**
   * `connect_nodes` 这条边不合法 —— 判据**只**来自 `node-connection-rules.ts`
   * 查表（任务书禁改：唯一事实源，只查不复制）。detail 里带那张表给的理由。
   */
  illegalConnection: 'illegalConnection',
  /** `set_node_fields` 写的字段这个节点类型 / 角色上没有（按族字段表查）。 */
  unknownField: 'unknownField',
  /**
   * `set_node_model` 缺 `optionId`（渠道）或渠道不属于那个模型（K-3 根治）。
   * ⚠ 与 `unknownModel` 分开：那条是「模型不在名单」，这条是「模型对了、路没指明」。
   */
  missingChannel: 'missingChannel',
  /** 引了一个 `new:<n>` 别名，但本轮 `stage_nodes` 没给出过它（或那一步被拒了）。 */
  aliasUnresolved: 'aliasUnresolved',
  /**
   * `set_review_state` 想写 `approved`。**硬禁**：放行是人看过之后的决定，助手替人
   * 放行等于把审核门拆了（`canAssistantSetReviewState` 同一条判据）。
   */
  approvedForbidden: 'approvedForbidden',
} as const

export type AssistantOperatorRejectReason =
  (typeof ASSISTANT_OPERATOR_REJECT_REASON_IDS)[keyof typeof ASSISTANT_OPERATOR_REJECT_REASON_IDS]

/**
 * 每个工具**是什么**，给模型看的一句话。
 *
 * ⚠ 写成 `Record<AssistantOperatorTool, …>`：工具表加一条而这里没跟上，编译期就红。
 * 论据同画布 `NODE_ASSISTANT_ADD_INTENT_HINTS` —— 只把 id 列给模型，它会按英文词
 * 的字面意思猜，而 `read_state`（读谁的状态）/`prime_generate`（这算不算生成）
 * 这两个词在通用语义里都太宽。
 */
export const ASSISTANT_OPERATOR_TOOL_HINTS: Record<
  AssistantOperatorTool,
  string
> = {
  [ASSISTANT_OPERATOR_TOOL_IDS.readState]:
    'read the workbench form the creator is looking at right now — every field, plus the values each one accepts. Costs nothing; call it first when you are unsure what is already filled in.',
  [ASSISTANT_OPERATOR_TOOL_IDS.searchAssets]:
    "search the creator's OWN asset library (images / videos they already made or uploaded). Returns real asset ids you may then mount. This is the only way to obtain an asset id — never invent one.",
  [ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders]:
    "find folders in the creator's OWN asset library by name. Returns real folder ids, full paths, and image counts. Call this before inspect_asset_folder, even when the creator gives an exact name; duplicate folder names can exist at different paths.",
  [ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder]:
    'actually LOOK at the images in one folder returned by list_asset_folders. Takes that real folderId plus a short instruction that preserves what the creator wants you to judge or select. It checks this folder only, never child folders; images only; newest first; at most 24 images in batches of 8. Read inspectedImages / totalImages / truncated before answering and never describe images that were not inspected.',
  /**
   * ⚠ 这段话在 P3-D 改过口径（拍板 21 + 22）：原文写着「there is no import tool
   * and never will be」，而 `import_user_url` 现在就在表里 —— 一条说谎的工具说明
   * 会让模型在用户递了链接时仍然去搜一遍库。两条路的区别只有一条：**地址是谁给的**。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages]:
    "search the open web for reference pictures the creator does NOT already own. Returns PREVIEWS ONLY — thumbnails plus their source pages, and nothing is downloaded by this call. Each candidate is shown to the creator with a 'use this' button; they press it and the app files that one into their library and attaches it. So: never claim you saved, imported, or mounted a web result of your own search, and never paste one of these URLs into a prompt or a reference. Short English queries work far better than long descriptions. Use it only when the creator's own library has nothing suitable. ⚠ A URL the creator typed themselves is NOT this tool's business — use import_user_url for that.",
  [ASSISTANT_OPERATOR_TOOL_IDS.mountReference]:
    "attach one asset from a previous search_assets result to the workbench as a reference image. Takes an assetId, never a URL. ⚠ Web search results have no assetId and can never be mounted this way — only the creator's own library can.",
  [ASSISTANT_OPERATOR_TOOL_IDS.setModel]:
    'switch the generation model. The id must be copied verbatim from availableModels in the state.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setPrompt]:
    'write the positive prompt. If the creator already hand-wrote something there, you will be asked which they want (append / overwrite / keep) before it lands.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setNegative]:
    'write the negative prompt. Only exists on workbenches that actually have that field.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setSpecs]:
    'set aspect ratio AND resolution together — one without the other does not produce a real aspect ratio in this app.',
  /**
   * ⚠ 参数名**逐字写出来**（真机 2026-08-31：模型第一次写的是 `duration` /
   * `aspect_ratio`，一条都没认出来，白烧一步换回一条 `emptyValue`）。
   * 「a plain number」那句同理 —— 状态块里的档位印成 `4s, 5s` 时它会照抄成
   * `"10s"`，而那是个字符串。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs]:
    'set the clip specs in ONE call. The argument names are exactly: durationSeconds (a plain number, no unit), aspectRatio, resolution. Send every one the state block lists options for; omit only the ones it says this model does not expose.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setCount]:
    'set how many outputs one send produces. Pick from the options in the state.',
  [ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference]:
    "attach one audio clip from the creator's own library as a voice reference for this shot. Takes an assetId from a search_assets call with kind 'audio'. Name the character it belongs to when you know it — that is how the model learns who is speaking in a multi-character line.",
  [ASSISTANT_OPERATOR_TOOL_IDS.setSound]:
    'turn the clip\'s own soundtrack on or off. Only call it when the creator asked for silence or for sound — leaving it alone means "whatever this model normally does", which is usually what they want.',
  [ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate]:
    "arm the generate button so it is one click away, with the price shown. This does NOT generate anything and never spends the creator's credits — they press it themselves. Use it as the LAST step once the form is ready.",
  [ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult]:
    'actually LOOK at the picture that came back from the run you armed, and say what worked and what did not. Only callable when the state block shows a fresh result — you never get to look at runs the creator started on their own. Call it first when a result is waiting, then fix the form with set_* based on what you saw.',
  [ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl]:
    'take ONE web address the creator typed in this conversation, fetch that picture into their library, and mount it as a reference — all in one step. Use it the moment they hand you a link; that is them saying yes. The url must be copied VERBATIM from their own message (a link you found yourself is refused). Plain image links work, and so does a normal web page — the picture on it is taken. ⛔ Never tell the creator to download, upload, or click anything for a link they already gave you: that is what this tool is for.',
  /**
   * ⚠ 「短英文查询」那句与 `search_web_images` 同源，理由也一样：两个上游
   * （Civitai 的 meilisearch / HF 的仓库搜索）吃的都是名字与短标签，一整句描述
   * 会让召回崩掉。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.searchLoras]:
    'look for LoRAs on Civitai and Hugging Face. Returns real candidates with their id, licence, base-model family, and whether this workbench can actually mount them. This is the ONLY place a candidateId comes from — never invent one. Keep the query SHORT and in English (a style name, an artist, two or three words); a whole sentence returns junk. Read the compatibility line on each candidate before you recommend it: a LoRA built for a different base-model architecture will not load on the base that is selected.',
  [ASSISTANT_OPERATOR_TOOL_IDS.mountLora]:
    "mount one LoRA from a previous search_loras result onto the assembly bench, with a weight. Takes a candidateId, never a name or a URL. The app files it into the creator's library and mounts it in one go. There is NO limit on how many LoRAs can be stacked — never tell the creator they have to remove one first. If a candidate is marked as not importable, this is refused; say plainly that it can only be opened on its source page.",
  [ASSISTANT_OPERATOR_TOOL_IDS.unmountLora]:
    'take one LoRA off the assembly bench. The id comes from the mounted list in the state block — that is a different list from search results. Use it when two mounted LoRAs are fighting over the same thing, and say which one you dropped and why.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight]:
    'change how strongly one already-mounted LoRA applies. The id comes from the mounted list in the state block. Weight is a plain number in the range the state block gives.',
  // ── 画布域（C0）──────────────────────────────────────────────────
  [ASSISTANT_OPERATOR_TOOL_IDS.readGraph]:
    'read a compact overview of the whole canvas: every node (id, type, title, status), every edge, which nodes are selected, the project name, and the script-doc summary. Costs nothing; call it first when you are unsure what is on the board.',
  [ASSISTANT_OPERATOR_TOOL_IDS.readNode]:
    "read everything about ONE node by id: its text fields, appearance details, reference images (with URLs), model and channel, and generation settings. This is the only way to see a node's full content — read_graph deliberately omits it.",
  [ASSISTANT_OPERATOR_TOOL_IDS.stageNodes]:
    "create one or more nodes in ONE call. Only the node types the creator's add-menu offers are allowed. Give each item an alias like new:1 so later steps in this run (connect_nodes, set_node_fields) can refer to it before it has a real id. One call is one undo step.",
  [ASSISTANT_OPERATOR_TOOL_IDS.connectNodes]:
    'connect nodes in ONE call as a list of source → target pairs. Ids may be real node ids or new:<n> aliases from stage_nodes in this run. Illegal pairs are refused with the reason from the connection rules — do not retry the same pair.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setNodeFields]:
    'write fields on one or more nodes in ONE call: title, the free-text fields that node type actually has (read_node lists them), imageCategory, and generation settings. If the creator hand-wrote the text you want to replace, you will be asked which they want (append / overwrite / keep) before it lands.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setNodeModel]:
    'switch the generation model on ONE node. You must send BOTH modelId and optionId (the channel), copied verbatim from the catalog in the state block — the same model can be reachable through several channels and the step is refused without one.',
  [ASSISTANT_OPERATOR_TOOL_IDS.attachRefs]:
    "attach reference images to ONE node's reference rack. Each reference is either another canvas node id (its primary image is used) or an assetId from a search_assets result in this run. Never a URL — the app looks the picture up itself.",
  [ASSISTANT_OPERATOR_TOOL_IDS.setReviewState]:
    "mark ONE node's media as awaiting review or rejected, with a reason. You can never mark anything approved — approving is the creator's decision after they have looked.",
  [ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate]:
    "arm the generate button on ONE node so it is one click away. This does NOT generate anything, shows no price, and never spends the creator's credits — they press it themselves. Use it as the LAST step once the node is ready.",
  [ASSISTANT_OPERATOR_TOOL_IDS.updateScriptDoc]:
    'rewrite the project script document (logline, characters, scenes, shots). The canvas is projected from it only after the creator confirms the projection preview — this call changes the document, not the board.',
}
