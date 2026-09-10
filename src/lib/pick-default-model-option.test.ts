import { describe, it, expect } from 'vitest'

import type { StudioModelOption } from '@/components/business/ModelSelector'
import { AI_MODELS } from '@/constants/models/enum'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { pickDefaultModelOption } from '@/lib/pick-default-model-option'

function option(
  optionId: string,
  modelId: string,
  adapterType: AI_ADAPTER_TYPES,
  overrides: Partial<StudioModelOption> = {},
): StudioModelOption {
  return {
    optionId,
    modelId,
    adapterType,
    providerConfig: getDefaultProviderConfig(adapterType),
    requestCount: 1,
    isBuiltIn: true,
    sourceType: 'workspace',
    ...overrides,
  }
}

describe('pickDefaultModelOption', () => {
  it('returns null for an empty list', () => {
    expect(pickDefaultModelOption([])).toBeNull()
  })

  /**
   * owner 2026-09-10 真机第二条：新卡的默认模型落在缺 key 的渠道上 = 一按就要去
   * 配 key。⛔ 便宜也不选。
   */
  it('never defaults to a channel with neither a key nor free quota', () => {
    const picked = pickDefaultModelOption([
      option(
        'workspace:volc',
        AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE,
        AI_ADAPTER_TYPES.VOLCENGINE,
      ),
      option(
        'key:bp1',
        AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS,
        AI_ADAPTER_TYPES.BYTEPLUS,
        { sourceType: 'saved', keyId: 'bp1' },
      ),
    ])
    expect(picked?.optionId).toBe('key:bp1')
  })

  it('still names one when the whole list is missing keys (Hard Rule 8)', () => {
    const picked = pickDefaultModelOption([
      option(
        'workspace:byteplus',
        AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS,
        AI_ADAPTER_TYPES.BYTEPLUS,
      ),
      option('workspace:fal', AI_MODELS.SEEDANCE_20_FAST, AI_ADAPTER_TYPES.FAL),
    ])
    // 都跑不了时按同一套规则挑最便宜的那条（BytePlus $0.121 < fal $0.2419）。
    expect(picked?.optionId).toBe('workspace:byteplus')
  })

  it('prefers free platform quota over a paid channel with no key', () => {
    const picked = pickDefaultModelOption([
      option(
        'workspace:byteplus',
        AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS,
        AI_ADAPTER_TYPES.BYTEPLUS,
      ),
      option('free:fal', AI_MODELS.SEEDANCE_20_FAST, AI_ADAPTER_TYPES.FAL, {
        freeTier: true,
      }),
    ])
    expect(picked?.optionId).toBe('free:fal')
  })
})
