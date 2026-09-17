import { describe, it, expect } from 'vitest'

import type { StudioModelOption } from '@/types/model-option'
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
   * 配 key。
   */
  it('never defaults to a channel without a key', () => {
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

  /**
   * D2 Q1 删掉「自动 = 最便宜」之后，这里也只剩**清单顺序**（那份已经按偏好排过）。
   * ⛔ 别把价格比较加回来 —— 它是同一条被删掉的规则的最后一处残留。
   */
  it('takes the first runnable entry in list order, not the cheapest', () => {
    const picked = pickDefaultModelOption([
      option('key:fal', AI_MODELS.SEEDANCE_20_FAST, AI_ADAPTER_TYPES.FAL, {
        sourceType: 'saved',
        keyId: 'fal',
      }),
      option(
        'key:bp',
        AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS,
        AI_ADAPTER_TYPES.BYTEPLUS,
        { sourceType: 'saved', keyId: 'bp' },
      ),
    ])
    expect(picked?.optionId).toBe('key:fal')
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
    expect(picked?.optionId).toBe('workspace:byteplus')
  })
})
