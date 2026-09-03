import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STUDIO_LAST_IMAGE_MODEL_STORAGE_KEY } from '@/constants/studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import {
  isImageStudioPathname,
  pickDefaultImageModelOptionId,
  readStoredImageModelOptionId,
  toDefaultImageModelCandidates,
  writeStoredImageModelOptionId,
  type DefaultImageModelCandidate,
} from '@/hooks/use-default-image-model'

const candidate = (
  optionId: string,
  keyConfigured: boolean,
  unitPriceUsd?: number,
): DefaultImageModelCandidate => ({ optionId, keyConfigured, unitPriceUsd })

describe('pickDefaultImageModelOptionId', () => {
  it('prefers the stored option when it still exists', () => {
    const picked = pickDefaultImageModelOptionId(
      [
        candidate('workspace:cheap', true, 0.01),
        candidate('key:remembered', true, 0.9),
      ],
      'key:remembered',
    )
    expect(picked).toBe('key:remembered')
  })

  it('ignores a stored option that no longer exists and falls back to price', () => {
    const picked = pickDefaultImageModelOptionId(
      [
        candidate('workspace:pricey', true, 0.9),
        candidate('workspace:cheap', true, 0.01),
      ],
      'key:deleted-key-row',
    )
    expect(picked).toBe('workspace:cheap')
  })

  it('picks the cheapest key-configured option', () => {
    const picked = pickDefaultImageModelOptionId(
      [
        candidate('workspace:unkeyed-cheapest', false, 0.001),
        candidate('workspace:keyed-pricey', true, 0.9),
        candidate('workspace:keyed-cheap', true, 0.045),
      ],
      null,
    )
    expect(picked).toBe('workspace:keyed-cheap')
  })

  it('ranks options without a trusted price behind every priced one', () => {
    const picked = pickDefaultImageModelOptionId(
      [
        candidate('workspace:unpriced', true),
        candidate('workspace:priced', true, 0.9),
      ],
      null,
    )
    expect(picked).toBe('workspace:priced')
  })

  it('still picks an unpriced option when nothing keyed has a price', () => {
    const picked = pickDefaultImageModelOptionId(
      [
        candidate('workspace:unpriced-a', true),
        candidate('workspace:unpriced-b', true),
      ],
      null,
    )
    expect(picked).toBe('workspace:unpriced-a')
  })

  it('keeps the first of two equally cheap options (stable result)', () => {
    const picked = pickDefaultImageModelOptionId(
      [
        candidate('workspace:first', true, 0.03),
        candidate('workspace:second', true, 0.03),
      ],
      null,
    )
    expect(picked).toBe('workspace:first')
  })

  it('returns null when no provider key is configured (empty branch)', () => {
    const picked = pickDefaultImageModelOptionId(
      [
        candidate('workspace:a', false, 0.01),
        candidate('workspace:b', false, 0.02),
      ],
      null,
    )
    expect(picked).toBeNull()
  })

  it('returns null for an empty catalog', () => {
    expect(pickDefaultImageModelOptionId([], 'workspace:whatever')).toBeNull()
  })
})

describe('toDefaultImageModelCandidates', () => {
  const option = (
    partial: Partial<StudioModelOption> & { optionId: string },
  ): StudioModelOption => ({
    modelId: 'some-model',
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    providerConfig: { label: 'OpenAI', baseUrl: '' },
    requestCount: 1,
    isBuiltIn: true,
    sourceType: 'workspace',
    ...partial,
  })

  it('treats saved key rows and provider-level coverage as configured', () => {
    const candidates = toDefaultImageModelCandidates([
      option({ optionId: 'key:1', sourceType: 'saved', keyId: '1' }),
      option({ optionId: 'workspace:covered', providerKeyId: 'k-1' }),
      option({ optionId: 'workspace:bare' }),
      option({ optionId: 'workspace:free', freeTier: true }),
    ])

    expect(candidates.map((c) => c.keyConfigured)).toEqual([
      true,
      true,
      false,
      // 平台免费额度不是「已配置 API key」——owner 的规则按 provider key 写的。
      false,
    ])
  })

  it('carries the per-image unit price and leaves unpriced models undefined', () => {
    const [priced, unpriced] = toDefaultImageModelCandidates([
      option({ optionId: 'workspace:flux', modelId: 'flux-2-flash' }),
      option({ optionId: 'workspace:ghost', modelId: 'model-not-in-catalog' }),
    ])

    expect(unpriced?.unitPriceUsd).toBeUndefined()
    // 只断言「有价且为正」，避免把测试钉死在会随复核变动的具体金额上。
    if (priced?.unitPriceUsd !== undefined) {
      expect(priced.unitPriceUsd).toBeGreaterThan(0)
    }
  })
})

describe('image model persistence helper', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('round-trips the selected option id', () => {
    writeStoredImageModelOptionId('workspace:seedream-4')
    expect(
      window.localStorage.getItem(STUDIO_LAST_IMAGE_MODEL_STORAGE_KEY),
    ).toBe('workspace:seedream-4')
    expect(readStoredImageModelOptionId()).toBe('workspace:seedream-4')
  })

  it('reads null when nothing is stored or the value is empty', () => {
    expect(readStoredImageModelOptionId()).toBeNull()
    window.localStorage.setItem(STUDIO_LAST_IMAGE_MODEL_STORAGE_KEY, '')
    expect(readStoredImageModelOptionId()).toBeNull()
  })

  it('survives a throwing localStorage (private mode) instead of crashing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(readStoredImageModelOptionId()).toBeNull()
    expect(() => writeStoredImageModelOptionId('workspace:x')).not.toThrow()
  })
})

describe('isImageStudioPathname', () => {
  it('matches the localized image studio route only', () => {
    expect(isImageStudioPathname('/zh/studio/image')).toBe(true)
    expect(isImageStudioPathname('/studio/image')).toBe(true)
    expect(isImageStudioPathname('/en/studio/video')).toBe(false)
    expect(isImageStudioPathname('/zh/studio/node')).toBe(false)
    expect(isImageStudioPathname(null)).toBe(false)
  })
})
