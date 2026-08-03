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
> = {
  // S3（2026-08-04）：十族里第一个迁到七槽的。
  [NODE_TYPE_IDS.shotText]: ShotTextDetailBody,
  // S4（2026-08-04）：图片五族。前四族共用 `ImageFamilyBody`，
  // 角色族因为七槽里只有身份条与它们同构而自成一份（见该文件头注）。
  [NODE_TYPE_IDS.image]: LooseImageDetailBody,
  [NODE_TYPE_IDS.shot]: ShotDetailBody,
  [NODE_TYPE_IDS.frameImage]: FrameDetailBody,
  [NODE_TYPE_IDS.backgroundImage]: BackgroundDetailBody,
  [NODE_TYPE_IDS.characterImage]: CharacterDetailBody,
  // S5（2026-08-04）：音色族。
  [NODE_TYPE_IDS.voice]: VoiceDetailBody,
}

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
  // ⚠ shotText（S3）· 图片五族（S4）· 音色（S5）已迁到上面的 NODE_DETAIL_SLOT_REGISTRY。
  // 一个族只能在一张表里 —— 槽表提供者的签名带 children 渲染函数，
  // 塞进 legacy 表会类型不兼容（`registry.test.ts` 有一条断言守着这件事）。
  // 剩下三族在 S6–S7 迁完后这张表连同 `GenericDetailBody` 一起删。
}
