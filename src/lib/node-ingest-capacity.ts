/**
 * 落槽的容量闸 —— 契约 `references/pages/canvas-slot-rack.md` §4.5。
 *
 * ── 为什么单独一个模块 ──────────────────────────────────────────────
 * `node-video-send-slots.ts` 只回答「这一档各类能塞几条」（纯算数，不碰图）。
 * 这里回答「**这一条素材现在还塞不塞得下**」，要从图上数已占的位，所以依赖
 * `node-workflow-graph`。两件事分开，前者才能保持可单测的纯粹。
 *
 * ── 闸为什么设在「落槽」而不是各入口 ────────────────────────────────
 * 素材进槽的入口有五条：拖边 · `@` 提及 · 从画布选择 · ＋添加素材 · ＋参考／
 * 上传／素材库（阶段 3 起，参考图一律落散图节点 + 自动连线）。逐个入口各写一遍
 * 正是本轮踩过的形状：原型给 `@` 加了新入口就漏一道闸，9/9 被塞成 10/9、
 * 总额 13/12。
 *
 * ⚠ 落点其实是**两个**不是一个（2026-08-10 阶段 3 查出来的）：连既有节点走
 * `handleIngestConnect`，而「先建节点再连」走 `handleSpawnReference` —— 后者
 * 直接调 `workflow.onConnect`，此前完全绕开了这道闸。所以本模块给出两个问法：
 *   · `resolveIngestCapacity`  —— 源节点已在图上（拖边 / `@` / 从画布选择）
 *   · `resolveSpawnCapacity`   —— 源节点**还没建**（上传 / 素材库 / 粘贴）
 * 两者共用同一个 `computeZoneCapacity` 内核，数出来必然是同一个数。
 */

import { getVideoModelSendContract } from '@/constants/video-model-send-plan'
import {
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import {
  getNodeStageMediaUrls,
  getSeedanceReferenceKind,
  getUpstreamNodes,
  isVideoSourceNode,
  isVoiceProfileNode,
} from './node-workflow-graph'
import {
  resolveVideoSendSlotLimits,
  type VideoSendSlotLimits,
} from './node-video-send-slots'

/** 容量契约里的三个区。键取自 `VideoSendSlotLimits`，加一个模态这里编译不过。 */
export type SlotZoneId = Exclude<
  keyof VideoSendSlotLimits,
  'imagesLimitedByTotal'
>

/** 贡献 image_urls 位的节点族。 */
function isImageContributingType(type: NodeWorkflowNodeType): boolean {
  return (
    type === NODE_TYPE_IDS.characterImage ||
    type === NODE_TYPE_IDS.backgroundImage ||
    type === NODE_TYPE_IDS.frameImage ||
    type === NODE_TYPE_IDS.shot ||
    type === NODE_TYPE_IDS.image
  )
}

/**
 * 这个上游节点占**哪个区**的位。`null` = 它不占素材位（结构类，比如镜头文本
 * 给的是提示词本身，不是素材）。
 *
 * ⚠ 判据必须与**收割侧**逐条对齐，否则「界面拦的」与「实际发的」又会变成两回
 * 事 —— 那正是 `node-video-send-slots` 头注记的那次事故：
 *   · 视频 → `harvestUpstreamVideoUrls` 认 `isVideoSourceNode`
 *   · 音频 → `harvestUpstreamAudioBindings` 认音色节点
 *   · 其余图片族 → `assembleReferenceImagePayload` 的图片位
 */
export function resolveNodeSlotZone(
  /**
   * 只读 `type` —— 所以**尚未落到图上的新节点**也判得了区（阶段 3「参考图落散图
   * 节点」要在建节点**之前**问容量，否则被拒时画布上会留一个孤儿节点）。
   */
  node: Pick<NodeWorkflowNode, 'type'>,
): SlotZoneId | null {
  if (isVoiceProfileNode(node)) return 'audio'
  if (isVideoSourceNode(node)) return 'videos'
  if (isImageContributingType(node.type)) return 'images'
  return null
}

/**
 * 一个上游节点实际占几个位。
 *
 * R3-6 出场组：收集器卡（角色 / 背景）贡献它**整个 onStage 集合**，其余一律 1。
 * `Math.max(1, …)` 让还没加载出图的收集器也算 1 —— 边已经在图上了，位就占着。
 */
function countContribution(node: NodeWorkflowNode, zone: SlotZoneId): number {
  if (zone !== 'images') return 1
  const kind = getSeedanceReferenceKind(node)
  if (kind === 'character' || kind === 'background') {
    return Math.max(1, getNodeStageMediaUrls(node.data).length)
  }
  return 1
}

export interface IngestCapacityCheck {
  zone: SlotZoneId
  /** 已占的位（含本次要落的这一条之前的全部上游）。 */
  current: number
  limit: number
  /** 满了 —— 调用方据此拒绝。 */
  full: boolean
  /**
   * 图片区专属：位被砍是因为**跨模态总额**被视频 / 音频吃掉了，而不是图片自身
   * 到顶。两者对用户的下一步完全不同 —— 前者去减视频音频，后者只能换模型 ——
   * 所以拒绝的话术必须分开（契约 §4.5「说对是哪条限制」）。
   */
  limitedByTotal: boolean
}

/**
 * 这条边落下去会不会超容量。`null` = 无从判断，**诚实沉默不硬造**：
 * 目标不是视频节点 · 源不占素材位 · 目标还没选模型（没有契约就没有上限）。
 */
export function resolveIngestCapacity({
  source,
  target,
  edges,
  nodes,
}: {
  source: NodeWorkflowNode
  target: NodeWorkflowNode
  edges: readonly NodeWorkflowEdge[]
  nodes: readonly NodeWorkflowNode[]
}): IngestCapacityCheck | null {
  const zone = resolveNodeSlotZone(source)
  if (!zone) return null
  return computeZoneCapacity({
    zone,
    contribution: countContribution(source, zone),
    target,
    edges,
    nodes,
  })
}

/**
 * 同一道闸的**落地前**问法（阶段 3「参考图落散图节点 + 自动连线」）：新节点还没
 * 建出来，只知道它将来是什么类型。
 *
 * ⚠ 必须问在 `addNode` **之前**。先建后拒会在画布上留一个连不上的孤儿节点 ——
 * 用户看到的是「加了一张图但它没接上」，比直接拒绝更糟。
 *
 * 贡献恒 1：新节点还没有出场组（收集器卡的 onStage 集合要有图才谈得上）。
 */
export function resolveSpawnCapacity({
  nodeType,
  target,
  edges,
  nodes,
}: {
  nodeType: NodeWorkflowNodeType
  target: NodeWorkflowNode
  edges: readonly NodeWorkflowEdge[]
  nodes: readonly NodeWorkflowNode[]
}): IngestCapacityCheck | null {
  const zone = resolveNodeSlotZone({ type: nodeType })
  if (!zone) return null
  return computeZoneCapacity({ zone, contribution: 1, target, edges, nodes })
}

function computeZoneCapacity({
  zone,
  contribution,
  target,
  edges,
  nodes,
}: {
  zone: SlotZoneId
  contribution: number
  target: NodeWorkflowNode
  edges: readonly NodeWorkflowEdge[]
  nodes: readonly NodeWorkflowNode[]
}): IngestCapacityCheck | null {
  if (target.type !== NODE_TYPE_IDS.seedance) return null

  const model = target.data.model
  if (!model) return null

  const upstream = getUpstreamNodes(target.id, edges, nodes)
  const countIn = (target_: SlotZoneId) =>
    upstream
      .filter((node) => resolveNodeSlotZone(node) === target_)
      .reduce((sum, node) => sum + countContribution(node, target_), 0)

  // ⚠ 跨模态总额要用**实际候选数**扣减，与发送路径同一个函数、同一套入参。
  const limits = resolveVideoSendSlotLimits({
    contract: getVideoModelSendContract(model.modelId, model.adapterType),
    legacyMode: false,
    legacyMaxReferenceImages: undefined,
    audioCandidateCount: countIn('audio'),
    videoCandidateCount: countIn('videos'),
  })

  const limit = limits[zone]
  if (!Number.isFinite(limit)) return null

  const current = countIn(zone)
  return {
    zone,
    current,
    limit,
    full: current + contribution > limit,
    limitedByTotal: zone === 'images' && limits.imagesLimitedByTotal,
  }
}
