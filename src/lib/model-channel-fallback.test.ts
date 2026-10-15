import { describe, it, expect } from 'vitest'

import type { StudioModelOption } from '@/types/model-option'
import { AI_MODELS } from '@/constants/models/enum'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { getModelUnitPriceByStringId } from '@/constants/models/unit-prices'
import {
  findModelChannelSiblings,
  findRunnableSiblingChannel,
  pickCheapestChannel,
  pickPreferredRunnableChannel,
} from '@/lib/model-channel-fallback'

function option(
  modelId: string,
  adapterType: AI_ADAPTER_TYPES,
  overrides: Partial<StudioModelOption> = {},
): StudioModelOption {
  return {
    optionId: `workspace:${modelId}`,
    modelId,
    adapterType,
    providerConfig: getDefaultProviderConfig(adapterType),
    requestCount: 1,
    isBuiltIn: true,
    sourceType: 'workspace',
    ...overrides,
  }
}

const fal = option(AI_MODELS.SEEDREAM_50_PRO, AI_ADAPTER_TYPES.FAL)
const volc = option(
  AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE,
  AI_ADAPTER_TYPES.VOLCENGINE,
)
const byteplus = option(
  AI_MODELS.SEEDREAM_50_PRO_BYTEPLUS,
  AI_ADAPTER_TYPES.BYTEPLUS,
)
const withKey = (o: StudioModelOption): StudioModelOption => ({
  ...o,
  providerKeyId: `key-${o.adapterType}`,
})

describe('findRunnableSiblingChannel', () => {
  it('卡上那家没 key、同型号另一家配好了：给出那一家', () => {
    const result = findRunnableSiblingChannel(
      [fal, withKey(volc), byteplus],
      fal.optionId,
    )
    expect(result?.current.channelId).toBe(fal.optionId)
    expect(result?.fallback.channelId).toBe(volc.optionId)
  })

  it('卡上那家能跑：不提示', () => {
    expect(
      findRunnableSiblingChannel([withKey(fal), withKey(volc)], fal.optionId),
    ).toBeNull()
  })

  it('同型号一家都没配：不提示（交给配 key 弹窗）', () => {
    expect(
      findRunnableSiblingChannel([fal, volc, byteplus], fal.optionId),
    ).toBeNull()
  })

  it('别的型号有 key 不算：只在同型号里找', () => {
    const other = withKey(
      option(AI_MODELS.OPENAI_GPT_IMAGE_2, AI_ADAPTER_TYPES.OPENAI),
    )
    expect(findRunnableSiblingChannel([fal, other], fal.optionId)).toBeNull()
  })

  it('认不出来的 optionId：null', () => {
    expect(findRunnableSiblingChannel([fal], 'nope')).toBeNull()
  })
})

describe('findModelChannelSiblings', () => {
  it('一个型号的三家折在一起', () => {
    const siblings = findModelChannelSiblings(
      [fal, volc, byteplus],
      volc.optionId,
    )
    expect(siblings?.current.channelId).toBe(volc.optionId)
    expect(siblings?.channels.map((c) => c.channelId).sort()).toEqual(
      [fal, volc, byteplus].map((o) => o.optionId).sort(),
    )
  })
})

describe('pickPreferredRunnableChannel / pickCheapestChannel', () => {
  it('自己的 key 优先于便宜', () => {
    const runner = option(AI_MODELS.SEEDREAM_50_PRO, AI_ADAPTER_TYPES.RUNNER, {
      optionId: 'runner',
    })
    const own = withKey(volc)
    expect(
      pickPreferredRunnableChannel([{ option: runner }, { option: own }])
        ?.option,
    ).toBe(own)
  })

  it('一条都跑不了：null', () => {
    expect(
      pickPreferredRunnableChannel([{ option: fal }, { option: volc }]),
    ).toBeNull()
  })

  it('最便宜的那条；查不到价的排后面', () => {
    const priced = [fal, volc, byteplus].filter((o) =>
      getModelUnitPriceByStringId(o.modelId),
    )
    const cheapest = pickCheapestChannel(
      [fal, volc, byteplus].map((o) => ({ option: o })),
    )?.option
    if (priced.length === 0) {
      expect(cheapest).toBe(fal)
      return
    }
    const min = Math.min(
      ...priced.map((o) => getModelUnitPriceByStringId(o.modelId)!.amount),
    )
    expect(getModelUnitPriceByStringId(cheapest!.modelId)?.amount).toBe(min)
  })

  it('空清单：null', () => {
    expect(pickCheapestChannel([])).toBeNull()
  })
})
