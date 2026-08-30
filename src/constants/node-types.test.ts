import { describe, expect, it } from 'vitest'

import {
  NODE_AUDIO_MODEL_NODE_TYPES,
  NODE_WORKFLOW_FIELDS_BY_IMAGE_ROLE,
  NODE_WORKFLOW_FIELDS_BY_NODE_TYPE,
  NODE_WORKFLOW_FIELD_IDS,
  NODE_WORKFLOW_FREE_TEXT_FIELD_BY_NODE_TYPE,
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

/**
 * 台账 K-1（2026-08-29）：助手往一个**读不到 `prompt`** 的节点写 `prompt`，
 * 内容 100% 丢失且节点只说「还没有镜头文本」。堵住这条路的不是某一处 if，
 * 而是下面这条不变量 —— 加新节点类型时忘了登记自由文本落点会当场红。
 */
describe('free-text field fallback', () => {
  it('registers a free-text landing field for every node type whose field set has no prompt', () => {
    for (const [nodeType, fields] of Object.entries(
      NODE_WORKFLOW_FIELDS_BY_NODE_TYPE,
    ) as Array<[NodeWorkflowNodeType, readonly string[]]>) {
      if (fields.includes(NODE_WORKFLOW_FIELD_IDS.prompt)) continue
      expect(
        Object.hasOwn(NODE_WORKFLOW_FREE_TEXT_FIELD_BY_NODE_TYPE, nodeType),
        nodeType,
      ).toBe(true)
      const landing = NODE_WORKFLOW_FREE_TEXT_FIELD_BY_NODE_TYPE[nodeType]
      if (landing === null) continue
      // 落点必须是这个类型自己**渲染得出来**的字段，否则只是把内容从一个看不见
      // 的字段挪到另一个看不见的字段。
      expect(fields, nodeType).toContain(landing)
    }
  })

  it('needs no fallback for image roles — every role renders prompt', () => {
    for (const [role, fields] of Object.entries(
      NODE_WORKFLOW_FIELDS_BY_IMAGE_ROLE,
    ) as Array<[string, readonly string[]]>) {
      expect(fields, role).toContain(NODE_WORKFLOW_FIELD_IDS.prompt)
    }
  })
})
