import type { ComponentType } from 'react'

import {
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { BackgroundDetailBody } from './BackgroundDetailBody'
import { CharacterDetailBody } from './CharacterDetailBody'
import { FrameDetailBody } from './FrameDetailBody'
import { LooseImageDetailBody } from './LooseImageDetailBody'
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
}
