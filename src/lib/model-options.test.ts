import { describe, expect, it } from 'vitest'

import {
  getAvailableImageModels,
  getAvailableVideoModels,
} from '@/constants/models'
import {
  AI_ADAPTER_TYPE_OPTIONS,
  type AI_ADAPTER_TYPES,
  type ProviderConfig,
} from '@/constants/providers'
import { buildSavedModelOptionsForModels } from '@/lib/model-options'
import type { UserApiKeyRecord } from '@/types'

function makeKey(
  overrides: Pick<UserApiKeyRecord, 'id' | 'modelId' | 'adapterType'>,
): UserApiKeyRecord {
  const providerConfig: ProviderConfig = {
    label: `${overrides.adapterType}-label`,
    baseUrl: 'https://example.com',
  }

  return {
    ...overrides,
    providerConfig,
    label: `${overrides.id} key`,
    maskedKey: 'sk-****1234',
    isActive: true,
    createdAt: new Date('2026-01-01'),
  }
}

function getDifferentAdapter(adapterType: AI_ADAPTER_TYPES): AI_ADAPTER_TYPES {
  const differentAdapter = AI_ADAPTER_TYPE_OPTIONS.find(
    (candidate) => candidate !== adapterType,
  )
  if (!differentAdapter) {
    throw new Error('Expected at least two adapter types')
  }
  return differentAdapter
}

describe('buildSavedModelOptionsForModels', () => {
  it('only includes saved keys whose modelId and adapterType match the target models', () => {
    const videoModel = getAvailableVideoModels()[0]
    const imageModel = getAvailableImageModels()[0]
    if (!videoModel || !imageModel) {
      throw new Error('Expected available image and video models')
    }

    const saved = buildSavedModelOptionsForModels(
      [
        makeKey({
          id: 'video-ok',
          modelId: videoModel.id,
          adapterType: videoModel.adapterType,
        }),
        makeKey({
          id: 'same-model-wrong-adapter',
          modelId: videoModel.id,
          adapterType: getDifferentAdapter(videoModel.adapterType),
        }),
        makeKey({
          id: 'image-model',
          modelId: imageModel.id,
          adapterType: imageModel.adapterType,
        }),
      ],
      [videoModel],
    )

    expect(saved.map((option) => option.keyId)).toEqual(['video-ok'])
  })
})
