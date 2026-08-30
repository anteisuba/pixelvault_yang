/**
 * 工作台助手「操作员化」的**词表**（P1，`docs/plans/studio-assistant-operator-2026-08-30.md` §2）。
 *
 * ── 它和 `node-assistant-ops.ts` 是什么关系 ─────────────────────────
 * 思想同源、形态不同。画布那套是「模型在正文里留 `[[canvas-ops]]` 标记 → 客户端
 * 剥出来渲染成一张提案卡」；这里是**多步工具环**：服务端一步一步地跑，每跑一步
 * 就吐一个 `step` 事件，客户端边看边应用。区别的根源是 owner 拍板 2 —— 免费动作
 * 直做，不再攒成一张要点的卡。
 * ⛔ 别去改 `node-assistant-ops.ts`：画布对齐是 P4 的事，那之前两套并存。
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
 *   · **读**（`read_state` / `search_assets`）—— 不改任何东西，客户端只画日志条。
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
  /** 检索用户自己的素材库。**P1 里唯一真的会碰数据库的工具。** */
  searchAssets: 'search_assets',
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
   * 设出图规格。
   *
   * ⚠ 台账 AE/BG/BS：`aspectRatio` **只有配上 `resolution` 才是真比例**，所以这
   * 条工具的载荷两个字段一起下，一个都不能省。拆成两条工具就等于把那个坑重挖一遍。
   */
  setSpecs: 'set_specs',
  /** 设一次出几张。值域 = 快照给的档位表（本仓 `IMAGE_BATCH_COUNTS` 是 1/2/4）。 */
  setCount: 'set_count',
  /**
   * 把生成键置成 primed 态并算价。
   *
   * ⛔ **它不是生成**。服务端在这一步什么都不做，只吐一个 op；点的人永远是用户
   * （拍板 2）。它仍算「写」类 —— 因此照样带 `inverse`（置回未 primed），
   * 不然拍板 14 的「清空全部改动」会留下一个亮着的生成键。
   */
  primeGenerate: 'prime_generate',
} as const

export const ASSISTANT_OPERATOR_TOOLS = [
  ASSISTANT_OPERATOR_TOOL_IDS.readState,
  ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
  ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
  ASSISTANT_OPERATOR_TOOL_IDS.setModel,
  ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
  ASSISTANT_OPERATOR_TOOL_IDS.setNegative,
  ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
  ASSISTANT_OPERATOR_TOOL_IDS.setCount,
  ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
] as const

export type AssistantOperatorTool = (typeof ASSISTANT_OPERATOR_TOOLS)[number]

/** 只读工具 —— 不产生 op，客户端没有东西可撤销。 */
export const ASSISTANT_OPERATOR_READ_TOOLS = [
  ASSISTANT_OPERATOR_TOOL_IDS.readState,
  ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
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
  ASSISTANT_OPERATOR_TOOL_IDS.setCount,
  ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
] as const

export function isMutatingAssistantOperatorTool(
  tool: AssistantOperatorTool,
): boolean {
  return (ASSISTANT_OPERATOR_MUTATING_TOOLS as readonly string[]).includes(tool)
}

/**
 * `search_assets` 能检索的媒体类型。
 *
 * ⚠ 只有这两种 —— P1 检索的目的**只有一个**：挂成参考图。音频与 3D 在
 * `OUTPUT_TYPE_VALUES` 里存在，但工作台上没有「把它挂成参考」的槽，检索出来只会
 * 得到一条挂不上去的结果（拍板 19：助手只动用户看得见的旋钮）。视频域的音频参考
 * 是 P4 的事，那条链另有归属（台账 A）。
 * 值域与 `OUTPUT_TYPE_VALUES` 的从属关系由 `types/assistant-operator.ts` 的
 * `satisfies` 锁住。
 */
export const ASSISTANT_OPERATOR_SEARCH_KINDS = ['image', 'video'] as const

export type AssistantOperatorSearchKind =
  (typeof ASSISTANT_OPERATOR_SEARCH_KINDS)[number]

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

/** 会触发就地确认的字段 —— 只有这两个是「用户手写的自由文本」。 */
export const ASSISTANT_OPERATOR_CONFIRM_FIELDS = {
  prompt: 'prompt',
  negative: 'negative',
} as const

export type AssistantOperatorConfirmField =
  (typeof ASSISTANT_OPERATOR_CONFIRM_FIELDS)[keyof typeof ASSISTANT_OPERATOR_CONFIRM_FIELDS]

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
 * P1 的域 —— 工作台三域，**取值来自 `ASSISTANT_PROTOCOL_DOMAINS`**（域简报已分域，
 * 复用不重造）。`canvas` 有意不在这里：画布对齐是 P4，那之前它走自己的 ops。
 * `satisfies` 保证有人改域词表时这里编译期就红。
 */
export const ASSISTANT_OPERATOR_DOMAINS = [
  ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.video,
  ASSISTANT_PROTOCOL_DOMAIN_IDS.lora,
] as const satisfies readonly AssistantProtocolDomain[]

export type AssistantOperatorDomain =
  (typeof ASSISTANT_OPERATOR_DOMAINS)[number]

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
  /** `prime_generate` 时还没选模型 —— 与人手点生成键时的拦法一致。 */
  noModelSelected: 'noModelSelected',
  /** `prime_generate` 时提示词还是空的。 */
  emptyPrompt: 'emptyPrompt',
  /** 模型写的参数形状不对（缺字段 / 类型错），已经过一次 schema。 */
  malformedArgs: 'malformedArgs',
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
  [ASSISTANT_OPERATOR_TOOL_IDS.mountReference]:
    'attach one asset from a previous search result to the workbench as a reference image. Takes an assetId, never a URL.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setModel]:
    'switch the generation model. The id must be copied verbatim from availableModels in the state.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setPrompt]:
    'write the positive prompt. If the creator already hand-wrote something there, you will be asked which they want (append / overwrite / keep) before it lands.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setNegative]:
    'write the negative prompt. Only exists on workbenches that actually have that field.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setSpecs]:
    'set aspect ratio AND resolution together — one without the other does not produce a real aspect ratio in this app.',
  [ASSISTANT_OPERATOR_TOOL_IDS.setCount]:
    'set how many outputs one send produces. Pick from the options in the state.',
  [ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate]:
    "arm the generate button so it is one click away, with the price shown. This does NOT generate anything and never spends the creator's credits — they press it themselves. Use it as the LAST step once the form is ready.",
}
