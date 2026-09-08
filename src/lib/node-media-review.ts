/**
 * 画布素材的**审核态**（合格 / 打回 / 未审）。
 *
 * 纯函数、无 React，可单测。这里只回答两个问题：
 *   ① 这一张图现在是什么审核态？
 *   ② 要把它标成某个态，该往 `node.data` 上打什么补丁？
 * 「谁不许进下游」那条硬规则的执行点在 `node-workflow-graph.ts` 的收割函数里。
 *
 * ── 为什么键是 URL，不是 `referenceAssets` 的下标 ──────────────────────
 * owner 2026-07-31 把粒度从「按节点」改成了「按图」。一个节点往下游贡献的图
 * 可能来自两处：节点自身的 `mediaUrl`/`imageUrl`，以及 `referenceAssets` 里被
 * ★(`isPrimary`) 或 `onStage` 选中的若干条。用下标键控会被增删打乱，用 URL 则
 * 两处天然统一。
 *
 * 它还顺带对 **G5（身份卡存废未定）** 免疫：身份卡将来若只是换个卡面呈现，这里
 * 一行都不用改；若连「一个节点挂多张图」的收集器机制一起废掉（一节点一图），
 * 按 URL 会自然退化成按节点，同样不用重做。
 *
 * 两个免费得到的正确性质：
 *   · 「重做」换 seed 重跑 → 新 URL → 审核态自动回到待审（重生成的图本来就该重审）
 *   · 打回时保留上一版 URL → 老 URL 保着 `rejected`，可以和新版并排比
 */

import {
  NODE_MEDIA_KIND_IDS,
  NODE_REVIEW_STATE_IDS,
  type NodeReviewState,
} from '@/constants/node-types'
import type {
  NodeMediaReview,
  NodeV4Data,
  NodeV4ImageData,
  NodeV4VideoData,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

/**
 * 审核记录的**承载者**（v3 节点 data 与 v4 的 image / video data）。
 *
 * ⚠ v4 里 `mediaReview` 只长在 image / video 两种形状上——`text` / `audio` 没有
 * 这个字段，也不该有（一段字和一条音轨不进图片审阅队列）。收 `NodeV4Data` 全集
 * 是因为调用方拿到的就是四类的联合（审阅队列逐个节点问「你有审核记录吗」），
 * 取窄那一步在 `isNodeV4ReviewCarrier` / `readReviewMap` 里做，两支没有字段的
 * 形状走「没有审核记录」那一路而不是崩。
 *
 * ⛔ 不是「字段改名」——v3 的 `referenceAssets` 那一路在 v4 是**上游节点各自的
 * `url`**，谁审谁自己那张，见 `node-review-queue.ts`。
 */
export type NodeMediaReviewCarrier = NodeWorkflowNodeData | NodeV4Data

/**
 * 这份 data 上的审核表。
 *
 * ⚠ v4 的 `text` / `audio` 形状**没有** `mediaReview` 字段（审核记录只长在有画面
 * 的素材上），所以联合里必须先取窄再读，⛔ 不给两个形状硬加一个空字段。
 */
export function readReviewMap(
  data: NodeMediaReviewCarrier,
): Record<string, NodeMediaReview> | undefined {
  return (data as { mediaReview?: Record<string, NodeMediaReview> }).mediaReview
}

/**
 * 这份 data 是 v4 形状吗。
 *
 * 判据是 **`kind` 字段的存在**：`kind` 是四个 v4 形状的判别键（`node-workflow.ts:979`
 * 起的四个 `z.literal`），v3 的 `NodeWorkflowNodeData` 上根本没有这个字段。
 * ⛔ 不判 `node.type`：v3/v4 两套 type 表在翻转期同时活着，而 data 那份才是落库的
 * 事实源。
 *
 * ⚠ 收窄到 image / video 两支——审核记录只长在这两种形状上。text / audio 传进来
 * 时返回 `false`，调用方走「没有审核记录」那一路（而不是崩）。
 */
/**
 * 这份 data 是四类 v4 形状里的**任何**一种吗（含 text / audio）。
 *
 * ⚠ 与 `isNodeV4ReviewCarrier` 是两问：那个问「有没有审核记录这回事」（只有
 * image / video 有），这个问「是不是 v4 形状」。收割 URL 的一路要先分 v3/v4，再
 * 在 v4 里区分有没有画面 —— 拿前者当后者用，v4 的文本节点会掉进 v3 分支去读一堆
 * 根本不存在的字段。
 */
export function isNodeV4Data(data: NodeMediaReviewCarrier): data is NodeV4Data {
  return (data as Partial<NodeV4Data>).kind !== undefined
}

export function isNodeV4ReviewCarrier(
  data: NodeMediaReviewCarrier,
): data is NodeV4ImageData | NodeV4VideoData {
  const kind = (data as Partial<NodeV4ImageData>).kind
  return (
    kind === NODE_MEDIA_KIND_IDS.image || kind === NODE_MEDIA_KIND_IDS.video
  )
}

/** 打回时可以带的补充信息。「通过」不需要这些，所以整个参数可省。 */
export interface ReviewDecisionInput {
  /** 打回理由 —— 用户为什么不要这张。 */
  reason?: string
  /** 「改词再来」时用户给的提示词增补。 */
  promptPatch?: string
  /**
   * 审核发生的时间。**调用方传入**，本模块不读时钟 —— 保持纯函数可测，
   * 也避免在渲染路径里产生每次都不同的值。
   */
  reviewedAt?: string
  /**
   * 进入待审队列的时间（包 6 §4.1 的排序依据）。同样由调用方传。
   * 只有 `markMediaAwaitingReview` 用得到。
   */
  markedAt?: string
}

/**
 * 一张图今天的审核态。
 *
 * ⚠ **查不到 = `approved`（祖父条款）**。见 `NodeWorkflowNodeDataSchema.mediaReview`
 * 的注释：反过来设计会让所有存量项目的所有图当场停止喂下游。
 */
export function resolveMediaReviewState(
  data: NodeMediaReviewCarrier,
  url: string | undefined,
): NodeReviewState {
  if (!url) return NODE_REVIEW_STATE_IDS.approved
  return readReviewMap(data)?.[url]?.state ?? NODE_REVIEW_STATE_IDS.approved
}

/** 这张图的完整审核记录；没被标过就是 undefined（≠ 未审，见上）。 */
export function getMediaReview(
  data: NodeMediaReviewCarrier,
  url: string | undefined,
): NodeMediaReview | undefined {
  if (!url) return undefined
  return readReviewMap(data)?.[url]
}

/**
 * 硬规则的判据（§4.2 Q3）：**只有 `approved` 能进下游**。
 * `awaiting_review` 与 `rejected` 都挡 —— 「审核不影响下游 = 审核是装饰」。
 */
export function isMediaApprovedForDownstream(
  data: NodeMediaReviewCarrier,
  url: string | undefined,
): boolean {
  return resolveMediaReviewState(data, url) === NODE_REVIEW_STATE_IDS.approved
}

function withEntry(
  data: NodeMediaReviewCarrier,
  url: string,
  entry: NodeMediaReview,
): Pick<NodeWorkflowNodeData, 'mediaReview'> {
  return { mediaReview: { ...(readReviewMap(data) ?? {}), [url]: entry } }
}

/**
 * 生成成功、把结果写回节点时**同时**打上「已出未审」。
 *
 * ⚠ 只给**助手**发起的生成用（包 6 ①-bis）。用户自己点的生成、上传的图、从素材
 * 库挑的图都不走这里 —— 亲手做过的选择再拦一道是仪式，那不是这道门要防的东西。
 * 调用点靠 `mediaJobSource` 判断来源，**不许**从「dock 开着吗」反推。
 *
 * `markedAt` 是审阅推进的排序依据（§4.1「按生成顺序」）。和 `reviewedAt` 同一条
 * 规矩：**调用方传时钟**，本模块保持纯函数。不传就不写，队列把它当最早处理。
 */
export function markMediaAwaitingReview(
  data: NodeMediaReviewCarrier,
  url: string | undefined,
  input: Pick<ReviewDecisionInput, 'markedAt'> = {},
): Pick<NodeWorkflowNodeData, 'mediaReview'> {
  if (!url) return {}
  return withEntry(data, url, {
    state: NODE_REVIEW_STATE_IDS.awaitingReview,
    ...(input.markedAt ? { markedAt: input.markedAt } : {}),
  })
}

/** 放行一张图。清掉上一次打回留下的理由，免得通过了还挂着旧的驳回词。 */
export function approveMedia(
  data: NodeMediaReviewCarrier,
  url: string | undefined,
  input: Pick<ReviewDecisionInput, 'reviewedAt'> = {},
): Pick<NodeWorkflowNodeData, 'mediaReview'> {
  if (!url) return {}
  return withEntry(data, url, {
    state: NODE_REVIEW_STATE_IDS.approved,
    ...(input.reviewedAt ? { reviewedAt: input.reviewedAt } : {}),
  })
}

/**
 * 打回一张图。**不删媒体** —— §5-W3 明写「保留上一版媒体 URL 作对比（不立刻删
 * R2）」，所以这里只改状态、记理由，节点上的 `mediaUrl` 原封不动。
 */
export function rejectMedia(
  data: NodeMediaReviewCarrier,
  url: string | undefined,
  input: ReviewDecisionInput = {},
): Pick<NodeWorkflowNodeData, 'mediaReview'> {
  if (!url) return {}
  return withEntry(data, url, {
    state: NODE_REVIEW_STATE_IDS.rejected,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.promptPatch ? { promptPatch: input.promptPatch } : {}),
    ...(input.reviewedAt ? { reviewedAt: input.reviewedAt } : {}),
  })
}

/**
 * 助手可写的审核态 —— **`approved` 不在其列**（§4.2 Q4，owner 钉死无开关）。
 *
 * 理由是防确认偏差：制作者自检必然放水，所以放行只能由人做。助手最多能把东西标
 * 成「待审」，让它出现在人的审阅队列里。写成守卫而不是只写进 prompt —— 光靠
 * 提示词，模型总会往那边滑。
 */
export function canAssistantSetReviewState(state: NodeReviewState): boolean {
  return state !== NODE_REVIEW_STATE_IDS.approved
}
