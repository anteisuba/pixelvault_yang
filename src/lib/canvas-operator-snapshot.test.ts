import { describe, expect, it } from 'vitest'

import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { AssistantOperatorSnapshotSchema } from '@/types/assistant-operator'
import type {
  NodeWorkflowModelOption,
  NodeWorkflowNode,
} from '@/types/node-workflow'

import {
  buildCanvasOperatorModelOptions,
  buildCanvasOperatorSnapshot,
  CANVAS_OPERATOR_FREE_PRICE_LABEL,
  describeRelativePrice,
} from './canvas-operator-snapshot'

function makeNode(
  id: string,
  type: NodeWorkflowNode['type'],
  data: Record<string, unknown> = {},
  selected = false,
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    selected,
    data: { prompt: '', status: 'idle', ...data },
  } as NodeWorkflowNode
}

function option(
  modelId: string,
  optionId: string,
  requestCount: number,
  extra: Partial<NodeWorkflowModelOption> = {},
): NodeWorkflowModelOption {
  return {
    optionId,
    modelId,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: { label: 'fal', baseUrl: 'https://fal.run' },
    requestCount,
    sourceType: 'workspace',
    ...extra,
  }
}

const URL_A = 'https://cdn.example.com/a.png'
const getNodeTypeLabel = (type: string) => `type:${type}`

const CARD = makeNode(
  'card',
  NODE_TYPE_IDS.image,
  {
    role: NODE_IMAGE_ROLE_IDS.character,
    characterName: '小林',
    character: { characterId: 'c1', name: '小林', visualSeed: '银发少女' },
    cardId: 'card-9',
    mediaUrl: URL_A,
    mediaReview: { [URL_A]: { state: 'rejected', reason: 'hands' } },
    referenceAssets: [
      {
        id: 'r1',
        url: URL_A,
        role: 'identity',
        weight: 0.7,
        source: 'canvas',
        sourceId: 'x',
      },
    ],
  },
  true,
)
const VIDEO = makeNode('video', NODE_TYPE_IDS.seedance, {
  duration: '6',
  seed: 7,
  model: { optionId: 'workspace:seedance-2.0', modelId: 'seedance-2.0' },
})
const SHOT = makeNode('shot', NODE_TYPE_IDS.shotText, { action: '走进雨里' })
const VOICE = makeNode('voice', NODE_TYPE_IDS.voice, { voiceName: '阿瑞' })

const MODEL_OPTIONS = {
  [NODE_TYPE_IDS.seedance]: [
    option('seedance-2.0', 'workspace:seedance-2.0', 10, { freeTier: true }),
    option('seedance-2.0', 'saved:seedance-2.0', 22, { sourceType: 'saved' }),
    option('veo-4', 'workspace:veo-4', 40), // 没 key、不免费 → 跑不了，不进目录
  ],
  [NODE_TYPE_IDS.image]: [
    option('seedream-4', 'workspace:seedream-4', 4, { freeTier: true }),
  ],
}

describe('buildCanvasOperatorSnapshot', () => {
  const snapshot = buildCanvasOperatorSnapshot({
    projectId: 'p1',
    projectName: '雨夜',
    nodes: [CARD, VIDEO, SHOT, VOICE],
    edges: [{ id: 'e1', source: 'card', target: 'video' }],
    scriptDoc: undefined,
    modelOptionsByType: MODEL_OPTIONS,
    getNodeTypeLabel,
  })
  const canvas = snapshot.canvas
  if (!canvas) throw new Error('canvas section missing')

  it('过协议 schema；根上没有 prompt（附录 D §1）', () => {
    expect(AssistantOperatorSnapshotSchema.safeParse(snapshot).success).toBe(
      true,
    )
    expect('prompt' in snapshot).toBe(false)
    expect(snapshot.availableModels).toEqual([])
  })

  it('节点：字段按族表、模型 / 档位 / 外观「控件不在整个键不给」，URL 与审核态进快照', () => {
    const [card, video, shot, voice] = canvas.nodes
    expect(card).toMatchObject({
      id: 'card',
      title: '小林',
      role: NODE_IMAGE_ROLE_IDS.character,
      fields: { prompt: '' },
      character: { name: '小林', visualSeed: '银发少女', cardId: 'card-9' },
      mediaUrl: URL_A,
      reviewState: 'rejected',
      references: [{ id: 'r1', role: 'identity', sourceId: 'x', url: URL_A }],
    })
    // 身份卡不选模型、不带档位、不是散图：三个键都不在。
    expect('model' in card).toBe(false)
    expect('params' in card).toBe(false)
    expect('imageCategory' in card).toBe(false)

    expect(video.model).toEqual({
      modelId: 'seedance-2.0',
      optionId: 'workspace:seedance-2.0',
    })
    expect(video.params).toEqual({ duration: '6', seed: 7 })
    // duration 两张表各登记一次：带档位的节点上它在 params，不在 fields。
    expect(Object.keys(video.fields)).toEqual([
      'motion',
      'camera',
      'audioIntent',
      'prompt',
    ])
    expect('character' in video).toBe(false)

    expect(shot.fields).toEqual({
      scene: '',
      action: '走进雨里',
      camera: '',
      composition: '',
    })
    expect(shot.title).toBe(`type:${NODE_TYPE_IDS.shotText}`)
    expect(shot.references).toEqual([])

    expect(voice.title).toBe('阿瑞')
    expect(Object.keys(voice.fields)).toEqual([
      'voiceName',
      'voiceProvider',
      'voiceId',
      'voiceStyle',
      'voiceEmotion',
    ])
  })

  it('边 / 选中 / 项目 / 无 ScriptDoc 时整个键不给', () => {
    expect(canvas.edges).toEqual([
      { id: 'e1', source: 'card', target: 'video' },
    ])
    expect(canvas.selectedNodeIds).toEqual(['card'])
    expect(canvas.projectId).toBe('p1')
    expect(canvas.projectName).toBe('雨夜')
    expect('scriptDoc' in canvas).toBe(false)
  })

  it('模型目录：只列画布上出现过的 nodeType、只放能跑的渠道、modelId+optionId 成对、相对价签', () => {
    expect(canvas.modelOptions).toEqual([
      {
        nodeType: NODE_TYPE_IDS.seedance,
        modelId: 'seedance-2.0',
        optionId: 'workspace:seedance-2.0',
        label: 'seedance-2.0 · fal · 10 credits',
        priceLabel: CANVAS_OPERATOR_FREE_PRICE_LABEL,
      },
      {
        nodeType: NODE_TYPE_IDS.seedance,
        modelId: 'seedance-2.0',
        optionId: 'saved:seedance-2.0',
        label: 'seedance-2.0 · fal · 22 credits',
        priceLabel: '1×',
      },
    ])
    // 图片族在画布上只有身份卡（不选模型）→ image 那一组一行都不列。
    expect(
      canvas.modelOptions.some((row) => row.nodeType === NODE_TYPE_IDS.image),
    ).toBe(false)
  })

  it('ScriptDoc 在时给 logline 摘要（C3 填内容，C0/C1 留位）', () => {
    const withDoc = buildCanvasOperatorSnapshot({
      projectId: 'p1',
      projectName: '雨夜',
      nodes: [],
      edges: [],
      scriptDoc: {
        title: 'Rain',
        logline: '  一个人走进雨里 ',
        roles: [],
        shots: [],
      },
      modelOptionsByType: {},
      getNodeTypeLabel,
    })
    expect(withDoc.canvas?.scriptDoc).toEqual({ summary: '一个人走进雨里' })
    expect(withDoc.canvas?.modelOptions).toEqual([])
  })
})

describe('describeRelativePrice / buildCanvasOperatorModelOptions', () => {
  it('相对同类最便宜的付费渠道：1× / 2.2×；免费印 free', () => {
    expect(describeRelativePrice(10, 10, undefined)).toBe('1×')
    expect(describeRelativePrice(22, 10, undefined)).toBe('2.2×')
    expect(describeRelativePrice(10, 10, true)).toBe(
      CANVAS_OPERATOR_FREE_PRICE_LABEL,
    )
    expect(describeRelativePrice(0, 10, undefined)).toBe(
      CANVAS_OPERATOR_FREE_PRICE_LABEL,
    )
  })

  it('两条付费渠道时价签相对最便宜那条', () => {
    const rows = buildCanvasOperatorModelOptions([VIDEO], {
      [NODE_TYPE_IDS.seedance]: [
        option('a', 'saved:a', 10, { sourceType: 'saved' }),
        option('b', 'saved:b', 25, { sourceType: 'saved' }),
      ],
    })
    expect(rows.map((row) => row.priceLabel)).toEqual(['1×', '2.5×'])
  })
})
