import type { ComponentType } from 'react'

import {
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import type { NodeDetailSlotProvider } from './slots'
import { BackgroundDetailBody } from './BackgroundDetailBody'
import { CharacterDetailBody } from './CharacterDetailBody'
import { FrameDetailBody } from './FrameDetailBody'
import { LooseImageDetailBody } from './LooseImageDetailBody'
import { ShotTextDetailBody } from './ShotTextDetailBody'
import { ShotDetailBody } from './ShotDetailBody'
import { VideoDetailBody } from './VideoDetailBody'
import { VideoMergeDetailBody } from './VideoMergeDetailBody'
import { VideoReferenceDetailBody } from './VideoReferenceDetailBody'
import { VoiceDetailBody } from './VoiceDetailBody'

export interface NodeDetailBodyProps {
  nodeId: string
  type: NodeWorkflowNodeType
  data: NodeWorkflowNodeData
}

/**
 * 方向 E 的槽表登记处 —— 迁移期与下面那张 `NODE_DETAIL_REGISTRY` **并存**。
 *
 * 壳的分发规则：这张表里有该族 → 走七槽骨架；没有 → 走 legacy（整块 body 塞进编排台槽）。
 * 于是**共存粒度是族、不是槽**：任一时刻打开任意一个面板，要么全新要么全旧，
 * 永远不出现一个面板里一半新一半旧。
 *
 * ⚠ 迁移完成前不要动 `NODE_DETAIL_REGISTRY` 的任何一条 —— `registry.test.ts` 有一条
 * 「＋添加 菜单能建的类型必须有专属 body」的对齐断言靠它。两张表在 S8 收尾时合一：
 * 那时改成穷举的 `Record<NodeWorkflowNodeType, …>`，让「新增族忘了给关系带」变成
 * 编译错误，而不是线上整族缺席。
 */
export const NODE_DETAIL_SLOT_REGISTRY: Partial<
  Record<NodeWorkflowNodeType, NodeDetailSlotProvider>
> = {}

/**
 * Per-node-type detail body for the shared ⤢ floating panel (B3). Types not
 * listed fall back to `GenericDetailBody` (model + fields + action). Deferred
 * rich bodies (character 音色集, background 环境音) add an entry here with no
 * panel changes.
 */
export const NODE_DETAIL_REGISTRY: Partial<
  Record<NodeWorkflowNodeType, ComponentType<NodeDetailBodyProps>>
> = {
  [NODE_TYPE_IDS.seedance]: VideoDetailBody,
  [NODE_TYPE_IDS.videoMerge]: VideoMergeDetailBody,
  [NODE_TYPE_IDS.videoReference]: VideoReferenceDetailBody,
  [NODE_TYPE_IDS.voice]: VoiceDetailBody,
  [NODE_TYPE_IDS.characterImage]: CharacterDetailBody,
  [NODE_TYPE_IDS.backgroundImage]: BackgroundDetailBody,
  [NODE_TYPE_IDS.shot]: ShotDetailBody,
  [NODE_TYPE_IDS.frameImage]: FrameDetailBody,
  // S5d ③: a role-less (loose) image node presents as `image` itself (see
  // `NodeDetailPanel`'s `isLooseImage` branch) instead of falling through to
  // `resolveNodePresentationType`'s shot default — 图片（素材）must read as
  // its own kind, not as 镜头图（生成）.
  [NODE_TYPE_IDS.image]: LooseImageDetailBody,
  // 2026-08-02：shotText 进了 ＋添加 菜单（owner「助手自动生成与用户手动输入
  // 是同一种东西」），按本表上方那条约定 —— 菜单能建的类型必须有专属 body，
  // 不落 GenericDetailBody 兜底。
  [NODE_TYPE_IDS.shotText]: ShotTextDetailBody,
}
