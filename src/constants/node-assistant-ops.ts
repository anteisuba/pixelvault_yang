/**
 * 助手写画布的 op 词表（包 5 / `research-landing-plan-2026-07-30.md` §6.3）。
 *
 * ── 为什么是 marker + JSON，而不是 tool-calling ──────────────────────
 * 助手今天有两条路由：gateway 走 `streamText` 纯文本流，BYOK 走缓冲文本补全，
 * **两条都没有 tools**。要让写能力在两条路上行为一致，唯一不加第二套基建的办法
 * 就是沿用已经在跑的那条链 —— `[[capability:upscale:node-id]]` 正是这么做的：
 * 模型在正文里留标记 → 客户端剥掉并渲染成可点的东西 → **用户点了才发生**。
 *
 * 区别只在载荷大小：能力标记只需要一个 node id，写画布要带族/名字/连线两端，
 * 所以 op 走 JSON 块，并且有**闭合标记** —— 流式回复里「这段 JSON 还没写完」和
 * 「写完了」必须能分清，否则半截载荷会被当成提案。
 *
 * ── 词表为什么直接借 `canvas-add-catalog` ────────────────────────────
 * 「角色节点是什么」在 ＋添加 菜单里已经定义过一次（nodeType + role）。助手若
 * 自带一份族表，那就是第二处定义，迟早分叉。所以 `add_node` 说的是**意图 id**
 * （`organize.character`），落地时走 workbench 同一个 `createCanvasObject`。
 * 代价是：菜单加不了的东西助手也加不了。这是有意的 —— 助手不该比人手多一条
 * 建节点的暗路。
 * ⚠ 2026-08-02：`shotText` 原本是这条代价的举例（「只由剧本投影产出」），
 * owner 拍板「助手自动生成与用户手动输入是同一种东西」后菜单已经放开它，
 * 这里也随之对齐。助手因此有两条产出镜头文本的路：剧本笺投影（节点带
 * `scriptRef`，与 ScriptDoc 双向同步）和 `add_node`（手工节点，字段存自己
 * 身上）—— 与人手的两条路一一对应，不是暗路。
 */

import {
  CANVAS_ADD_INTENT_IDS,
  type CanvasAddIntentId,
} from '@/constants/canvas-add-catalog'
import { NODE_STUDIO_ASSISTANT_LIMITS } from '@/constants/node-studio'

export const NODE_ASSISTANT_OP_IDS = {
  addNode: 'add_node',
  connect: 'connect',
  rename: 'rename',
  setReviewState: 'set_review_state',
  /** ⚠ 唯一会扣 credit 的 op —— 审批上与其余四个分开走。 */
  generate: 'generate',
} as const

export const NODE_ASSISTANT_OPS = [
  NODE_ASSISTANT_OP_IDS.addNode,
  NODE_ASSISTANT_OP_IDS.connect,
  NODE_ASSISTANT_OP_IDS.rename,
  NODE_ASSISTANT_OP_IDS.setReviewState,
  NODE_ASSISTANT_OP_IDS.generate,
] as const

export type NodeAssistantOpId = (typeof NODE_ASSISTANT_OPS)[number]

/**
 * B3：**不用点就落画布**的那一档（owner 2026-08-08 拍板「自动落」）。
 *
 * 分档依据是「错了要付多大代价」，不是「改动大不大」：
 *   · 这三个是**纯结构、免费、一次撤销能全退**（B2.5 之后）。空节点删掉就是，
 *     不留半成品像素，撤销栈也不脏。
 *   · `set_review_state` **不在**这里 —— 审核态是**用户对产出的判断**，不是结构。
 *     代码里已经钉死助手不得自批（`NODE_ASSISTANT_OP_REJECT_REASON_IDS.approvalForbidden`，
 *     owner 无开关），既然自批被禁，降级成「自动」也违背同一个意图。
 *   · `generate` **不在**这里 —— 唯一扣 credit 的 op。
 *
 * ⚠ 这条改写了 `unified-ai-assistant-2026-08.md` §1「助手不会未经用户确认修改画布」。
 * 那份契约已同步作废该半句，别再按旧文档判它是 bug。
 */
export const NODE_ASSISTANT_AUTO_APPLY_OPS = [
  NODE_ASSISTANT_OP_IDS.addNode,
  NODE_ASSISTANT_OP_IDS.connect,
  NODE_ASSISTANT_OP_IDS.rename,
] as const

export function isAutoApplyAssistantOp(op: NodeAssistantOpId): boolean {
  return (NODE_ASSISTANT_AUTO_APPLY_OPS as readonly string[]).includes(op)
}

/**
 * `add_node` 能用的意图，逐条对齐 ＋添加 菜单。有测试锁住「菜单里新增的意图
 * 必须同步进这张表」—— 漏了的话助手会安静地少一种能建的节点，而不是报错。
 */
export const NODE_ASSISTANT_ADD_INTENTS = [
  CANVAS_ADD_INTENT_IDS.imageAsset,
  CANVAS_ADD_INTENT_IDS.imageShot,
  CANVAS_ADD_INTENT_IDS.imageKeyframe,
  CANVAS_ADD_INTENT_IDS.videoGenerate,
  CANVAS_ADD_INTENT_IDS.videoReference,
  CANVAS_ADD_INTENT_IDS.videoShotText,
  CANVAS_ADD_INTENT_IDS.videoMerge,
  CANVAS_ADD_INTENT_IDS.audioVoiceProfile,
  CANVAS_ADD_INTENT_IDS.organizeCharacter,
  CANVAS_ADD_INTENT_IDS.organizeScene,
] as const satisfies readonly CanvasAddIntentId[]

/**
 * 每个意图**是什么**，给模型看的一句话。
 *
 * ⚠ 真机上抓到的：只把 id 列给模型时，「加一个背景节点」它选了 `image.asset`
 * （散图）而不是 `organize.scene`（场景身份卡）—— id 里的 organize/image 分组是
 * 我们的内部分类法，模型没有理由猜对。写成 `Record<CanvasAddIntentId, …>`：菜单
 * 新增一族而这里没跟上，编译期就红。
 */
export const NODE_ASSISTANT_ADD_INTENT_HINTS: Record<
  CanvasAddIntentId,
  string
> = {
  [CANVAS_ADD_INTENT_IDS.organizeCharacter]:
    'a CHARACTER identity card — use it for any person / role',
  [CANVAS_ADD_INTENT_IDS.organizeScene]:
    'a BACKGROUND / scene identity card — use it for places, environments, locations',
  [CANVAS_ADD_INTENT_IDS.imageShot]:
    'a shot still — one frame generated from shot text plus character / background references',
  [CANVAS_ADD_INTENT_IDS.imageKeyframe]:
    'a keyframe image that feeds a video node',
  [CANVAS_ADD_INTENT_IDS.imageAsset]:
    'a loose image with no assigned role — only when none of the roles above fits',
  [CANVAS_ADD_INTENT_IDS.videoShotText]:
    'a shot-text node — the written scene / action / camera / composition for one shot, feeding a video node',
  [CANVAS_ADD_INTENT_IDS.videoGenerate]: 'a video generation node',
  [CANVAS_ADD_INTENT_IDS.videoReference]: 'a reference video clip',
  [CANVAS_ADD_INTENT_IDS.videoMerge]:
    'a node that stitches several clips into one sequence',
  [CANVAS_ADD_INTENT_IDS.audioVoiceProfile]:
    'a voice / timbre profile used for a character',
}

/**
 * 正文里包住 op 载荷的一对标记。闭合标记不是装饰：流式回复每来一个 chunk 都会
 * 重跑一次抽取，没有闭合标记就无法判断 JSON 是否完整。
 */
export const NODE_ASSISTANT_OP_MARKERS = {
  open: '[[canvas-ops]]',
  close: '[[/canvas-ops]]',
} as const

export const NODE_ASSISTANT_OP_LIMITS = {
  /** 一次提案最多几条。上限存在的理由是「一张卡要看得完」，不是性能。 */
  maxOps: 24,
  /** 批内别名（`ref`）的长度 —— 只在这一次提案里有意义，不进任何持久化。 */
  maxRefLength: 40,
  /** 节点 id 与别名共用的引用长度上限，与助手 payload 里的 id 上限一致。 */
  maxTargetLength: 160,
  /**
   * 名字长度直接借助手 payload 的标签上限 —— 助手读到的名字有多长，它能写回的
   * 名字就有多长，两边用同一个数。
   */
  maxNameLength: NODE_STUDIO_ASSISTANT_LIMITS.maxNodeLabelLength,
  /**
   * 提示词长度，同一条对称论据：助手读一个节点时，它的 prompt 按
   * `maxNodeSummaryLength` 截断后进 payload；那它能写回的也就是这么长。
   *
   * ⚠ 这**不是**节点提示词的产品上限 —— `NodeWorkflowNodeDataSchema.prompt` 是
   * 无界的 `z.string()`，人手输入不受限。这里限的是「一条 op 载荷能有多大」，
   * 和 `maxOps`「一张卡要看得完」同性质。别把它当成能力承诺往 UI 上印。
   */
  maxPromptLength: NODE_STUDIO_ASSISTANT_LIMITS.maxNodeSummaryLength,
  /** 打回理由。与 `NodeMediaReview.reason` 同一个量级。 */
  maxReasonLength: 300,
} as const

/**
 * op 被规划器拒绝的理由 —— **只放连线之外的那些**。
 *
 * 连线的三条（类型不符 / 重复边 / 参考位已满）复用
 * `NODE_STUDIO_INGEST_REJECT_REASON_IDS`：那是 `evaluateCastIngest` 本来就返回
 * 的词表，且 `StudioNode.ingest.reasons.*` 三语文案已经存在。再造一套同义词，
 * 用户就会在两个地方看到两种说法。
 */
export const NODE_ASSISTANT_OP_REJECT_REASON_IDS = {
  /** 引用的节点既不在画布上，也不是本批 `add_node` 声明过的别名。 */
  unknownNode: 'unknownNode',
  /** 同一个别名声明了两次 —— 后面的引用会指向哪个说不清，整条拒掉。 */
  duplicateRef: 'duplicateRef',
  /** 助手不得自批（§4.2 Q4，owner 钉死无开关）。 */
  approvalForbidden: 'approvalForbidden',
  /** 审核态按 URL 键控，节点身上没有媒体就无从标起。 */
  noMedia: 'noMedia',
  /** 文本类节点没有可生成的媒体。 */
  notGeneratable: 'notGeneratable',
  /** 没选模型 —— 与人手点「生成」时的拦法一致。 */
  noModel: 'noModel',
} as const

export type NodeAssistantOpRejectReason =
  (typeof NODE_ASSISTANT_OP_REJECT_REASON_IDS)[keyof typeof NODE_ASSISTANT_OP_REJECT_REASON_IDS]
