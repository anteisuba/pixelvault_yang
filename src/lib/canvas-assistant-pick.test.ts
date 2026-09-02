import { describe, expect, it } from 'vitest'

import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS,
} from '@/constants/node-studio'
import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeAssistantMediaReference } from '@/types/node-assistant'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import {
  buildCanvasAssistantMediaReference,
  isCanvasAssistantPickIncluded,
  resolveCanvasAssistantPick,
} from './canvas-assistant-pick'

function makeNode(
  id: string,
  type: NodeWorkflowNode['type'],
  data: Record<string, unknown> = {},
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: 'idle', ...data },
  } as NodeWorkflowNode
}

const getNodeTypeLabel = (type: string) => `type:${type}`
const EMPTY = { getNodeTypeLabel, selectedReferences: [], pickedNodeIds: [] }

function makeReference(nodeId: string): NodeAssistantMediaReference {
  return {
    id: `node-reference:${nodeId}`,
    nodeId,
    source: 'canvas',
    kind: 'image',
    url: `https://cdn.example.com/${nodeId}.png`,
    thumbnailUrl: `https://cdn.example.com/${nodeId}.png`,
    label: nodeId,
  }
}

describe('buildCanvasAssistantMediaReference', () => {
  it('图片节点 → image 引用，带 nodeId、缩略图与显示名', () => {
    const reference = buildCanvasAssistantMediaReference(
      makeNode('img-1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.shot,
        imageUrl: 'https://cdn.example.com/a.png',
        shotName: '开场镜',
      }),
      getNodeTypeLabel,
    )
    expect(reference).toEqual({
      id: 'node-reference:img-1',
      nodeId: 'img-1',
      source: 'canvas',
      kind: 'image',
      url: 'https://cdn.example.com/a.png',
      thumbnailUrl: 'https://cdn.example.com/a.png',
      label: '开场镜',
    })
  })

  it('视频节点 → video 引用，只在海报是 http(s) 时带 thumbnailUrl', () => {
    const reference = buildCanvasAssistantMediaReference(
      makeNode('vid-1', NODE_TYPE_IDS.seedance, {
        mediaUrl: 'https://cdn.example.com/a.mp4',
        videoThumbnailUrl: 'blob:local',
      }),
      getNodeTypeLabel,
    )
    expect(reference).toMatchObject({ kind: 'video', nodeId: 'vid-1' })
    expect(reference).not.toHaveProperty('thumbnailUrl')
    expect(reference?.label).toBe(`type:${NODE_TYPE_IDS.seedance}`)
  })

  it('非 http(s) URL / 文本节点 → null', () => {
    expect(
      buildCanvasAssistantMediaReference(
        makeNode('img-2', NODE_TYPE_IDS.image, { imageUrl: 'data:image/png' }),
        getNodeTypeLabel,
      ),
    ).toBeNull()
    expect(
      buildCanvasAssistantMediaReference(
        makeNode('text-1', NODE_TYPE_IDS.shotText, { action: '走进雨里' }),
        getNodeTypeLabel,
      ),
    ).toBeNull()
  })
})

describe('resolveCanvasAssistantPick', () => {
  const nodes = [
    makeNode('img-1', NODE_TYPE_IDS.image, {
      imageUrl: 'https://cdn.example.com/a.png',
    }),
    makeNode('text-1', NODE_TYPE_IDS.shotText, { action: '走进雨里' }),
  ]

  it('媒体节点 → reference；非媒体节点 → node（只带 id）', () => {
    expect(resolveCanvasAssistantPick(nodes, 'img-1', EMPTY)).toMatchObject({
      kind: 'reference',
      reference: { nodeId: 'img-1', kind: 'image' },
    })
    expect(resolveCanvasAssistantPick(nodes, 'text-1', EMPTY)).toEqual({
      kind: 'node',
      nodeId: 'text-1',
    })
  })

  it('画布上没有这个节点 → unknownNode', () => {
    expect(resolveCanvasAssistantPick(nodes, 'ghost', EMPTY)).toEqual({
      kind: 'rejected',
      reason: NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS.unknownNode,
    })
  })

  it('去重：已挂的引用 / 已拾的节点再点一次 → alreadyPicked', () => {
    expect(
      resolveCanvasAssistantPick(nodes, 'img-1', {
        ...EMPTY,
        selectedReferences: [makeReference('img-1')],
      }),
    ).toEqual({
      kind: 'rejected',
      reason: NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS.alreadyPicked,
    })
    expect(
      resolveCanvasAssistantPick(nodes, 'text-1', {
        ...EMPTY,
        pickedNodeIds: ['text-1'],
      }),
    ).toEqual({
      kind: 'rejected',
      reason: NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS.alreadyPicked,
    })
  })

  it('上限走 NODE_STUDIO_ASSISTANT_LIMITS：引用 maxReferences，节点 maxSelectedNodes', () => {
    const fullReferences = Array.from(
      { length: NODE_STUDIO_ASSISTANT_LIMITS.maxReferences },
      (_, index) => makeReference(`other-${index}`),
    )
    expect(
      resolveCanvasAssistantPick(nodes, 'img-1', {
        ...EMPTY,
        selectedReferences: fullReferences,
      }),
    ).toEqual({
      kind: 'rejected',
      reason: NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS.referenceLimit,
    })
    const fullPicks = Array.from(
      { length: NODE_STUDIO_ASSISTANT_LIMITS.maxSelectedNodes },
      (_, index) => `other-${index}`,
    )
    expect(
      resolveCanvasAssistantPick(nodes, 'text-1', {
        ...EMPTY,
        pickedNodeIds: fullPicks,
      }),
    ).toEqual({
      kind: 'rejected',
      reason: NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS.nodeLimit,
    })
  })

  // ⚠ dock 的候选池在末尾 `.slice(0, maxReferences)` —— 第 9 个媒体节点不在
  // 表里。拾取按节点直接构造，所以它照样能进（只要输入框还装得下）。
  it('不依赖 dock 候选池：候选池装不下的媒体节点也能被拾', () => {
    const many = Array.from(
      { length: NODE_STUDIO_ASSISTANT_LIMITS.maxReferences + 3 },
      (_, index) =>
        makeNode(`img-${index}`, NODE_TYPE_IDS.image, {
          imageUrl: `https://cdn.example.com/${index}.png`,
        }),
    )
    const last = many.at(-1)!
    expect(resolveCanvasAssistantPick(many, last.id, EMPTY)).toMatchObject({
      kind: 'reference',
      reference: { nodeId: last.id },
    })
  })
})

describe('isCanvasAssistantPickIncluded', () => {
  it('已挂引用（按 nodeId）或已拾节点都算「已含」', () => {
    const img = makeNode('img-1', NODE_TYPE_IDS.image)
    const text = makeNode('text-1', NODE_TYPE_IDS.shotText)
    expect(
      isCanvasAssistantPickIncluded(img, {
        selectedReferences: [makeReference('img-1')],
        pickedNodeIds: [],
      }),
    ).toBe(true)
    expect(
      isCanvasAssistantPickIncluded(text, {
        selectedReferences: [],
        pickedNodeIds: ['text-1'],
      }),
    ).toBe(true)
    expect(
      isCanvasAssistantPickIncluded(text, {
        selectedReferences: [],
        pickedNodeIds: [],
      }),
    ).toBe(false)
  })
})
