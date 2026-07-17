import { describe, expect, it, vi } from 'vitest'

import type { CivitaiImageRecipe, LoraAssetRecord } from '@/types'

import {
  aggregateOftenMountedExtras,
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

    expect(result).toEqual({ newlyMounted: 2, missing: 0, incompatible: 0 })
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

    expect(result).toEqual({ newlyMounted: 0, missing: 0, incompatible: 0 })
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

    expect(result).toEqual({ newlyMounted: 1, missing: 1, incompatible: 0 })
    expect(pushLora).toHaveBeenCalledTimes(1)
    expect(pushLora).toHaveBeenCalledWith(firstExtra, 0.4)
    expect(statuses).toContainEqual(['v12', 'failed'])
  })

  it('mounts a base-compatible extra but rejects an architecture-incompatible one', async () => {
    const illuExtra = makeAsset({
      id: 'illu-extra',
      styleCode: 'illu-extra',
      name: 'Illu Extra',
      modelVersionId: 21,
      baseModelFamily: 'Illustrious',
    })
    const sd15Extra = makeAsset({
      id: 'sd15-extra',
      styleCode: 'sd15-extra',
      name: 'SD15 Hands',
      modelVersionId: 22,
      baseModelFamily: 'SD 1.5',
    })
    const pushLora = vi.fn()
    const statuses: Array<[string, string]> = []

    const result = await mountRecipeExtraLoras({
      extras: [
        { modelVersionId: 21, weight: 0.6 },
        { modelVersionId: 22, weight: 1 },
      ],
      stackItems: [{ asset: makeAsset() }],
      maxStack: 3,
      resolveLora: vi.fn(async (params) => ({
        success: true,
        data: params.modelVersionId === 21 ? illuExtra : sd15Extra,
      })),
      pushLora,
      setLoraScale: vi.fn(),
      setStatus: (key, status) => statuses.push([key, status]),
      // Stub the real bucket rule: only illustrious/SDXL-family mounts.
      isBaseCompatible: (fam) => fam.toLowerCase().includes('illustrious'),
    })

    expect(result).toEqual({ newlyMounted: 1, missing: 0, incompatible: 1 })
    expect(pushLora).toHaveBeenCalledTimes(1)
    expect(pushLora).toHaveBeenCalledWith(illuExtra, 0.6)
    expect(statuses).toContainEqual(['v22', 'incompatible'])
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

describe('aggregateOftenMountedExtras', () => {
  function makeRecipe(
    extraLoras: CivitaiImageRecipe['extraLoras'],
  ): Pick<CivitaiImageRecipe, 'extraLoras'> {
    return { extraLoras }
  }

  it('counts co-occurrence across recipes and returns Top N ≥ min count, sorted desc', () => {
    const recipes = [
      makeRecipe([
        { modelVersionId: 1, name: 'Jinhsi' },
        { modelVersionId: 2, name: 'Danjin' },
      ]),
      makeRecipe([{ modelVersionId: 1, name: 'Jinhsi' }]),
      makeRecipe([
        { modelVersionId: 1, name: 'Jinhsi' },
        { modelVersionId: 2, name: 'Danjin' },
      ]),
      makeRecipe([{ modelVersionId: 1, name: 'Jinhsi' }]),
      // Singleton — filtered out by the ≥2 threshold.
      makeRecipe([{ modelVersionId: 3, name: 'Once Only' }]),
    ]

    const result = aggregateOftenMountedExtras(recipes)

    expect(result).toEqual([
      { extra: { modelVersionId: 1, name: 'Jinhsi' }, count: 4 },
      { extra: { modelVersionId: 2, name: 'Danjin' }, count: 2 },
    ])
  })

  it('does not double-count a duplicate extra within the same recipe', () => {
    const recipes = [
      makeRecipe([
        { modelVersionId: 1, name: 'Dup' },
        { modelVersionId: 1, name: 'Dup' },
      ]),
      makeRecipe([{ modelVersionId: 1, name: 'Dup' }]),
    ]

    expect(aggregateOftenMountedExtras(recipes)).toEqual([
      { extra: { modelVersionId: 1, name: 'Dup' }, count: 2 },
    ])
  })

  it('skips extras with no hash/modelVersionId/name (unresolvable)', () => {
    const recipes = [
      makeRecipe([{ weight: 0.6 }]),
      makeRecipe([{ weight: 0.6 }]),
    ]

    expect(aggregateOftenMountedExtras(recipes)).toEqual([])
  })

  it('returns an empty array when no extra clears the min-count threshold', () => {
    const recipes = [makeRecipe([{ modelVersionId: 5, name: 'Solo' }])]
    expect(aggregateOftenMountedExtras(recipes)).toEqual([])
  })

  it('returns an empty array for recipes with no extraLoras', () => {
    expect(
      aggregateOftenMountedExtras([makeRecipe(undefined), { extraLoras: [] }]),
    ).toEqual([])
  })

  it('caps results at the Top 3 by count', () => {
    const recipes = [
      makeRecipe([
        { modelVersionId: 1 },
        { modelVersionId: 2 },
        { modelVersionId: 3 },
        { modelVersionId: 4 },
      ]),
      makeRecipe([
        { modelVersionId: 1 },
        { modelVersionId: 2 },
        { modelVersionId: 3 },
        { modelVersionId: 4 },
      ]),
    ]

    expect(aggregateOftenMountedExtras(recipes)).toHaveLength(3)
  })
})
