import { describe, expect, it, vi } from 'vitest'

import type { LoraAssetRecord } from '@/types'

import {
  extraLoraKey,
  extraLoraLabel,
  mountRecipeExtraLoras,
} from './lora-recipe-extra-mount'

function makeAsset(overrides: Partial<LoraAssetRecord> = {}): LoraAssetRecord {
  return {
    id: 'lora-base',
    styleCode: 'base',
    name: 'Base LoRA',
    source: 'imported',
    type: 'style',
    baseModelFamily: 'Illustrious',
    provider: 'civitai',
    triggerWord: 'base trigger',
    loraUrl: 'https://example.com/base.safetensors',
    coverImageUrl: null,
    previewImageUrls: [],
    defaultScale: 0.85,
    isPublic: false,
    isOwn: true,
    createdAt: '2026-06-11T00:00:00.000Z',
    ...overrides,
  }
}

describe('mountRecipeExtraLoras', () => {
  it('mounts every resolvable extra LoRA before applying a source recipe', async () => {
    const extraByHash = makeAsset({
      id: 'extra-hash',
      styleCode: 'extra-hash',
      name: 'Extra Hash',
      fileHashAutoV3: 'aabbcc',
    })
    const extraByVersion = makeAsset({
      id: 'extra-version',
      styleCode: 'extra-version',
      name: 'Extra Version',
      modelVersionId: 777,
    })
    const pushLora = vi.fn()
    const setLoraScale = vi.fn()
    const statuses: Array<[string, string]> = []

    const result = await mountRecipeExtraLoras({
      extras: [
        { hash: 'AABBCC', name: 'Extra Hash', weight: 0.4 },
        { modelVersionId: 777, weight: 0.3 },
      ],
      stackItems: [{ asset: makeAsset() }],
      maxStack: 3,
      resolveLora: vi.fn(async (params) => ({
        success: true,
        data: params.hash ? extraByHash : extraByVersion,
      })),
      pushLora,
      setLoraScale,
      setStatus: (key, status) => statuses.push([key, status]),
    })

    expect(result).toEqual({ newlyMounted: 2, missing: 0 })
    expect(pushLora).toHaveBeenNthCalledWith(1, extraByHash, 0.4)
    expect(pushLora).toHaveBeenNthCalledWith(2, extraByVersion, 0.3)
    expect(setLoraScale).not.toHaveBeenCalled()
    expect(statuses).toEqual([
      ['aabbcc', 'loading'],
      ['aabbcc', 'mounted'],
      ['v777', 'loading'],
      ['v777', 'mounted'],
    ])
  })

  it('passes the source base model family into resolver calls', async () => {
    const extra = makeAsset({
      id: 'illu-extra',
      styleCode: 'illu-extra',
      name: 'Illustrious Extra',
    })
    const resolveLora = vi.fn(async () => ({
      success: true,
      data: extra,
    }))

    await mountRecipeExtraLoras({
      extras: [{ name: 'detailed hand focus style illustriousXL v1.1' }],
      stackItems: [{ asset: makeAsset() }],
      maxStack: 3,
      baseModelFamily: 'Illustrious',
      resolveLora,
      pushLora: vi.fn(),
      setLoraScale: vi.fn(),
    })

    expect(resolveLora).toHaveBeenCalledWith({
      hash: undefined,
      modelVersionId: undefined,
      name: 'detailed hand focus style illustriousXL v1.1',
      baseModelFamily: 'Illustrious',
    })
  })

  it('repairs mojibake extra names before display and resolver calls', async () => {
    const repairedName = '明日方舟终末地岁代理人'
    const extra = makeAsset({
      id: 'repaired-extra',
      styleCode: 'repaired-extra',
      name: repairedName,
    })
    const resolveLora = vi.fn(async () => ({
      success: true,
      data: extra,
    }))

    expect(
      extraLoraLabel({
        name: 'ææ¥æ¹èç»æ«å°å²ä»£çäºº',
      }),
    ).toBe(repairedName)

    await mountRecipeExtraLoras({
      extras: [{ name: 'ææ¥æ¹èç»æ«å°å²ä»£çäºº', weight: 0.8 }],
      stackItems: [{ asset: makeAsset() }],
      maxStack: 3,
      baseModelFamily: 'Illustrious',
      resolveLora,
      pushLora: vi.fn(),
      setLoraScale: vi.fn(),
    })

    expect(resolveLora).toHaveBeenCalledWith({
      hash: undefined,
      modelVersionId: undefined,
      name: repairedName,
      baseModelFamily: 'Illustrious',
    })
  })

  it('updates scale locally when the extra LoRA is already mounted', async () => {
    const mounted = makeAsset({
      id: 'mounted-extra',
      styleCode: 'mounted-extra',
      name: 'Already Mounted',
      fileHashAutoV3: 'aabbcc',
    })
    const resolveLora = vi.fn()
    const pushLora = vi.fn()
    const setLoraScale = vi.fn()
    const statuses: Array<[string, string]> = []

    const result = await mountRecipeExtraLoras({
      extras: [{ hash: 'AABBCC', name: 'Already Mounted', weight: 0.62 }],
      stackItems: [{ asset: makeAsset() }, { asset: mounted }],
      maxStack: 3,
      resolveLora,
      pushLora,
      setLoraScale,
      setStatus: (key, status) => statuses.push([key, status]),
    })

    expect(result).toEqual({ newlyMounted: 0, missing: 0 })
    expect(resolveLora).not.toHaveBeenCalled()
    expect(pushLora).not.toHaveBeenCalled()
    expect(setLoraScale).toHaveBeenCalledWith('mounted-extra', 0.62)
    expect(statuses).toEqual([['aabbcc', 'mounted']])
  })

  it('reports missing extras when the LoRA stack capacity is reached', async () => {
    const firstExtra = makeAsset({
      id: 'first-extra',
      styleCode: 'first-extra',
      name: 'First Extra',
    })
    const secondExtra = makeAsset({
      id: 'second-extra',
      styleCode: 'second-extra',
      name: 'Second Extra',
    })
    const pushLora = vi.fn()
    const statuses: Array<[string, string]> = []

    const result = await mountRecipeExtraLoras({
      extras: [
        { modelVersionId: 11, weight: 0.4 },
        { modelVersionId: 12, weight: 0.5 },
      ],
      stackItems: [{ asset: makeAsset() }],
      maxStack: 2,
      resolveLora: vi.fn(async (params) => ({
        success: true,
        data: params.modelVersionId === 11 ? firstExtra : secondExtra,
      })),
      pushLora,
      setLoraScale: vi.fn(),
      setStatus: (key, status) => statuses.push([key, status]),
    })

    expect(result).toEqual({ newlyMounted: 1, missing: 1 })
    expect(pushLora).toHaveBeenCalledTimes(1)
    expect(pushLora).toHaveBeenCalledWith(firstExtra, 0.4)
    expect(statuses).toContainEqual(['v12', 'failed'])
  })

  it('normalizes extra keys for status tracking', () => {
    expect(extraLoraKey({ hash: 'AABBCC' })).toBe('aabbcc')
    expect(extraLoraKey({ modelVersionId: 42 })).toBe('v42')
    expect(extraLoraKey({ name: ' Detail Tweaker ' })).toBe('n:detail tweaker')
    expect(extraLoraKey({ name: ' ææ¥æ¹èç»æ«å°å²ä»£çäºº ' })).toBe(
      'n:明日方舟终末地岁代理人',
    )
  })
})
