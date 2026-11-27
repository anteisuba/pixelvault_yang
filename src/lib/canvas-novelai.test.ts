import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { NODE_SLOT_IDS, NODE_SLOT_OUTPUT_IDS } from '@/constants/node-slots'
import type { CharacterCardRecord } from '@/types'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
} from '@/types/node-workflow'

import {
  collectCanvasImageReferenceNodes,
  countCanvasNovelAiCardPreciseRefs,
  defaultNovelAiRefOverrideForConnection,
  resolveCanvasNovelAiReferences,
  sanitizeCanvasNovelAiLayout,
  sanitizeCanvasNovelAiSceneTexts,
} from './canvas-novelai'

const NOW = '2026-11-27T00:00:00.000Z'

function makeNode(
  id: string,
  data: Partial<NodeV4Data> & { kind: NodeV4Data['kind'] },
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { name: id, status: 'idle', createdAt: NOW, ...data } as NodeV4Data,
  }
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  slot: NodeWorkflowEdgeV4['slot'],
): NodeWorkflowEdgeV4 {
  return {
    id,
    source,
    sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
    target,
    slot,
  }
}

describe('collectCanvasImageReferenceNodes', () => {
  it('收集 reference 槽直连图与角色卡 1 跳特写，并按 URL 去重', () => {
    const target = makeNode('img-out', { kind: 'image', subtype: 'shot' })
    const charNode = makeNode('char-1', {
      kind: 'image',
      subtype: 'character',
      name: '小岚',
      url: 'https://cdn/char.png',
    })
    const closeupNode = makeNode('cu-1', {
      kind: 'image',
      subtype: 'reference',
      name: '面部特写',
      url: 'https://cdn/closeup.png',
    })
    const dupNode = makeNode('dup-1', {
      kind: 'image',
      subtype: 'shot',
      url: 'https://cdn/char.png',
    })

    const collected = collectCanvasImageReferenceNodes(
      target,
      [
        makeEdge('e1', 'char-1', 'img-out', NODE_SLOT_IDS.reference),
        makeEdge('e2', 'cu-1', 'char-1', NODE_SLOT_IDS.closeup),
        makeEdge('e3', 'dup-1', 'img-out', NODE_SLOT_IDS.reference),
      ],
      [target, charNode, closeupNode, dupNode],
    )

    expect(collected).toHaveLength(2)
    expect(collected[0]).toMatchObject({
      nodeId: 'char-1',
      url: 'https://cdn/char.png',
      subtype: 'character',
    })
    expect(collected[1]).toMatchObject({
      nodeId: 'cu-1',
      url: 'https://cdn/closeup.png',
      isCloseup: true,
    })
  })
})

describe('resolveCanvasNovelAiReferences', () => {
  const sources = [
    {
      nodeId: 'n1',
      edgeId: 'e1',
      name: '底图A',
      url: 'https://cdn/base.png',
      subtype: 'shot' as const,
    },
    {
      nodeId: 'n2',
      edgeId: 'e2',
      name: '角色B',
      url: 'https://cdn/char.png',
      subtype: 'character' as const,
    },
    {
      nodeId: 'n3',
      edgeId: 'e3',
      name: '画风C',
      url: 'https://cdn/style.png',
      subtype: 'reference' as const,
    },
  ]

  it('存量无 novelAiRefConfig 时一律默认走底图轨（零静默 Anlas 消耗）', () => {
    const compiled = resolveCanvasNovelAiReferences({
      sources,
      modelId: AI_MODELS.NOVELAI_V5_FULL,
    })
    expect(compiled.baseUrls).toEqual(['https://cdn/base.png'])
    expect(compiled.preciseReferences).toEqual([])
    expect(compiled.preciseCount).toBe(0)
    expect(compiled.anlasCost).toBe(0)
    expect(compiled.entries.map((entry) => entry.activeInRequest)).toEqual([
      true,
      false,
      false,
    ])
  })

  it('V5 Full 支持底图 + 多张精确参考（含 outfit / preferSameOutfit / 0–5 强度）', () => {
    const compiled = resolveCanvasNovelAiReferences({
      sources,
      modelId: AI_MODELS.NOVELAI_V5_FULL,
      refConfig: {
        n1: { mode: 'base' },
        n2: {
          mode: 'precise',
          kind: 'character&style',
          strength: 2.5,
          preferSameOutfit: true,
        },
        n3: { mode: 'precise', kind: 'outfit', strength: 1.5 },
      },
    })
    expect(compiled.baseUrls).toEqual(['https://cdn/base.png'])
    expect(compiled.preciseCount).toBe(2)
    expect(compiled.anlasCost).toBe(10)
    expect(compiled.preciseReferences).toEqual([
      {
        id: 'canvas-n2',
        url: 'https://cdn/char.png',
        kind: 'character&style',
        strength: 2.5,
        preferSameOutfit: true,
        source: { type: 'canvas', nodeId: 'n2' },
      },
      {
        id: 'canvas-n3',
        url: 'https://cdn/style.png',
        kind: 'outfit',
        strength: 1.5,
        source: { type: 'canvas', nodeId: 'n3' },
      },
    ])
  })

  it('V4.5 自动将强度钳到 0–1、保留 fidelity 并剔除 V5 专属 outfit 项', () => {
    const compiled = resolveCanvasNovelAiReferences({
      sources,
      modelId: AI_MODELS.NOVELAI_V45_FULL,
      refConfig: {
        n2: {
          mode: 'precise',
          kind: 'character',
          strength: 3.2,
          fidelity: 0.85,
          preferSameOutfit: true,
        },
        n3: { mode: 'precise', kind: 'outfit', strength: 1 },
      },
    })
    expect(compiled.preciseReferences).toHaveLength(1)
    expect(compiled.preciseReferences[0]).toMatchObject({
      kind: 'character',
      strength: 1,
      fidelity: 0.85,
    })
    expect(compiled.preciseReferences[0]?.preferSameOutfit).toBeUndefined()
    expect(compiled.anlasCost).toBe(5)
  })

  it('V5 Full Medium 不支持精确参考时全部降级到底图轨且 Anlas 为 0', () => {
    const compiled = resolveCanvasNovelAiReferences({
      sources,
      modelId: AI_MODELS.NOVELAI_V5_FULL_MEDIUM,
      refConfig: {
        n2: { mode: 'precise', kind: 'character&style', strength: 1 },
      },
    })
    expect(compiled.preciseReferences).toEqual([])
    expect(compiled.anlasCost).toBe(0)
    expect(compiled.baseUrls).toEqual(['https://cdn/base.png'])
  })
})

describe('defaultNovelAiRefOverrideForConnection', () => {
  it('角色卡连入默认走精确参考 character&style；已有底图时第 2+ 张走 style；首张普通图留 base', () => {
    expect(
      defaultNovelAiRefOverrideForConnection({
        sourceSubtype: 'character',
        existingBaseCount: 0,
        modelId: AI_MODELS.NOVELAI_V5_FULL,
      }),
    ).toEqual({
      mode: 'precise',
      kind: 'character&style',
      strength: 1,
      preferSameOutfit: true,
    })

    expect(
      defaultNovelAiRefOverrideForConnection({
        sourceSubtype: 'shot',
        existingBaseCount: 0,
        modelId: AI_MODELS.NOVELAI_V5_FULL,
      }),
    ).toBeUndefined()

    expect(
      defaultNovelAiRefOverrideForConnection({
        sourceSubtype: 'shot',
        existingBaseCount: 1,
        modelId: AI_MODELS.NOVELAI_V5_FULL,
      }),
    ).toEqual({
      mode: 'precise',
      kind: 'style',
      strength: 1,
    })

    expect(
      defaultNovelAiRefOverrideForConnection({
        sourceSubtype: 'character',
        existingBaseCount: 0,
        modelId: AI_MODELS.NOVELAI_V5_FULL_MEDIUM,
      }),
    ).toBeUndefined()
  })
})

describe('sanitizeCanvasNovelAiLayout & sanitizeCanvasNovelAiSceneTexts', () => {
  it('过滤空角色、按模型上限裁齐、V4.5 吸附 5×5 格心并重映射互动下标', () => {
    const layout = sanitizeCanvasNovelAiLayout(
      {
        positioning: 'manual',
        characters: [
          {
            prompt: '   ',
            negativePrompt: '',
            position: { x: 0.2, y: 0.2 },
          },
          {
            prompt: '1girl, red scarf',
            negativePrompt: 'lowres',
            position: { x: 0.14, y: 0.88 },
            interactions: [
              { tag: 'holding hands', target: 2, mutual: true },
              { tag: 'hug', target: 0 },
            ],
            dialogue: ' Hello! ',
          },
          {
            prompt: '1boy, black coat',
            negativePrompt: '',
            position: { x: 0.72, y: 0.48 },
          },
        ],
      },
      AI_MODELS.NOVELAI_V45_FULL,
    )

    expect(layout).toEqual({
      positioning: 'manual',
      characters: [
        {
          prompt: '1girl, red scarf',
          negativePrompt: 'lowres',
          position: { x: 0.1, y: 0.9 },
          interactions: [{ tag: 'holding hands', target: 1, mutual: true }],
          dialogue: 'Hello!',
        },
        {
          prompt: '1boy, black coat',
          negativePrompt: '',
          position: { x: 0.7, y: 0.5 },
        },
      ],
    })
  })

  it('过滤空画面文字行并保留裁剪后的内容', () => {
    expect(
      sanitizeCanvasNovelAiSceneTexts([
        { kind: 'sign', text: '  CAFE  ' },
        { kind: 'title', text: '   ' },
      ]),
    ).toEqual([{ kind: 'sign', text: 'CAFE' }])
    expect(
      sanitizeCanvasNovelAiSceneTexts([{ kind: 'sign', text: '' }]),
    ).toBeUndefined()
  })
})

describe('countCanvasNovelAiCardPreciseRefs', () => {
  it('默认关闭返回 0；开启后按角色卡造型槽位统计可注入张数', () => {
    const card = {
      id: 'card-1',
      name: '小岚',
      looks: [
        {
          id: 'look-1',
          name: '常服',
          isDefault: true,
          referenceSlots: [
            {
              id: 'slot-1',
              role: 'front',
              isPrimary: true,
              imageUrl: 'https://cdn/front.png',
            },
          ],
        },
      ],
    } as unknown as CharacterCardRecord
    const mentions = [{ card, picks: [] }]

    expect(
      countCanvasNovelAiCardPreciseRefs(
        mentions,
        false,
        AI_MODELS.NOVELAI_V5_FULL,
      ),
    ).toBe(0)
    expect(
      countCanvasNovelAiCardPreciseRefs(
        mentions,
        true,
        AI_MODELS.NOVELAI_V5_FULL,
      ),
    ).toBe(1)
    expect(
      countCanvasNovelAiCardPreciseRefs(
        mentions,
        true,
        AI_MODELS.NOVELAI_V5_FULL_MEDIUM,
      ),
    ).toBe(0)
  })
})
