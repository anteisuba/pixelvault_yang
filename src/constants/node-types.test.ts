import { describe, expect, it } from 'vitest'

import {
  NODE_AUDIO_MODEL_NODE_TYPES,
  NODE_IMAGE_MODEL_NODE_TYPES,
  NODE_MEDIA_KIND_BY_NODE_TYPE,
  NODE_MEDIA_KIND_IDS,
  NODE_TEXT_NODE_TYPES,
  NODE_VIDEO_MERGE_NODE_TYPES,
  NODE_VIDEO_MODEL_NODE_TYPES,
  NODE_VIDEO_REFERENCE_NODE_TYPES,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'

describe('node model type mapping', () => {
  it('assigns every generative media node to its matching model bucket', () => {
    const textNodes = new Set<NodeWorkflowNodeType>(NODE_TEXT_NODE_TYPES)
    const imageModelNodes = new Set<NodeWorkflowNodeType>(
      NODE_IMAGE_MODEL_NODE_TYPES,
    )
    const videoModelNodes = new Set<NodeWorkflowNodeType>(
      NODE_VIDEO_MODEL_NODE_TYPES,
    )
    const audioModelNodes = new Set<NodeWorkflowNodeType>(
      NODE_AUDIO_MODEL_NODE_TYPES,
    )
    const uploadOrUtilityVideoNodes = new Set<NodeWorkflowNodeType>([
      ...NODE_VIDEO_REFERENCE_NODE_TYPES,
      ...NODE_VIDEO_MERGE_NODE_TYPES,
    ])

    for (const [nodeType, mediaKind] of Object.entries(
      NODE_MEDIA_KIND_BY_NODE_TYPE,
    ) as Array<[NodeWorkflowNodeType, string | undefined]>) {
      if (mediaKind === NODE_MEDIA_KIND_IDS.text) {
        expect(textNodes.has(nodeType), nodeType).toBe(true)
      }
      if (mediaKind === NODE_MEDIA_KIND_IDS.image) {
        expect(imageModelNodes.has(nodeType), nodeType).toBe(true)
      }
      if (
        mediaKind === NODE_MEDIA_KIND_IDS.video &&
        !uploadOrUtilityVideoNodes.has(nodeType)
      ) {
        expect(videoModelNodes.has(nodeType), nodeType).toBe(true)
      }
      if (mediaKind === NODE_MEDIA_KIND_IDS.audio) {
        expect(audioModelNodes.has(nodeType), nodeType).toBe(true)
      }
    }
  })
})
