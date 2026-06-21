import type { ComponentType } from 'react'

import {
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { BackgroundDetailBody } from './BackgroundDetailBody'
import { CharacterDetailBody } from './CharacterDetailBody'
import { VideoDetailBody } from './VideoDetailBody'
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
  [NODE_TYPE_IDS.voice]: VoiceDetailBody,
  [NODE_TYPE_IDS.characterImage]: CharacterDetailBody,
  [NODE_TYPE_IDS.backgroundImage]: BackgroundDetailBody,
}
