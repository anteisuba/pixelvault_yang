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
import {
  buildSavedModelOptionsForModels,
  withProviderKeyCoverage,
} from '@/lib/model-options'
import type { StudioModelOption } from '@/components/business/ModelSelector'
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

describe('withProviderKeyCoverage', () => {
  const videoModel = getAvailableVideoModels()[0]
  const imageModel = getAvailableImageModels()[0]

  function makeWorkspaceOption(
    over: Partial<StudioModelOption> = {},
  ): StudioModelOption {
    return {
      optionId: `workspace:${over.modelId ?? videoModel.id}`,
      modelId: over.modelId ?? videoModel.id,
      adapterType: over.adapterType ?? videoModel.adapterType,
      providerConfig: over.providerConfig ?? videoModel.providerConfig,
      requestCount: 1,
      isBuiltIn: true,
      sourceType: 'workspace',
      ...over,
    }
  }

  it('covers every model on an adapter the user holds any active key for', () => {
    // The key is bound to an IMAGE model; the server's findActiveKeyForAdapter
    // ignores modelId, so the same key runs this adapter's video models too.
    const [covered] = withProviderKeyCoverage(
      [makeWorkspaceOption()],
      [
        makeKey({
          id: 'same-adapter-other-model',
          modelId: imageModel.id,
          adapterType: videoModel.adapterType,
        }),
      ],
    )

    expect(covered.providerKeyId).toBe('same-adapter-other-model')
  })

  it('leaves options alone when the adapter has no key', () => {
    const options = [makeWorkspaceOption()]
    const [uncovered] = withProviderKeyCoverage(options, [
      makeKey({
        id: 'other-adapter',
        modelId: imageModel.id,
        adapterType: getDifferentAdapter(videoModel.adapterType),
      }),
    ])

    expect(uncovered.providerKeyId).toBeUndefined()
  })

  it('ignores inactive keys', () => {
    const [option] = withProviderKeyCoverage(
      [makeWorkspaceOption()],
      [
        {
          ...makeKey({
            id: 'inactive',
            modelId: videoModel.id,
            adapterType: videoModel.adapterType,
          }),
          isActive: false,
        },
      ],
    )

    expect(option.providerKeyId).toBeUndefined()
  })

  it('picks the newest active key, matching findActiveKeyForAdapter', () => {
    const older = makeKey({
      id: 'older',
      modelId: videoModel.id,
      adapterType: videoModel.adapterType,
    })
    const newer = {
      ...makeKey({
        id: 'newer',
        modelId: imageModel.id,
        adapterType: videoModel.adapterType,
      }),
      createdAt: new Date('2026-06-01'),
    }

    const [option] = withProviderKeyCoverage(
      [makeWorkspaceOption()],
      [older, newer],
    )

    expect(option.providerKeyId).toBe('newer')
  })

  it('does not restamp an explicit saved key route', () => {
    const [option] = withProviderKeyCoverage(
      [
        makeWorkspaceOption({
          optionId: 'key:k1',
          sourceType: 'saved',
          keyId: 'k1',
        }),
      ],
      [
        makeKey({
          id: 'other-key',
          modelId: imageModel.id,
          adapterType: videoModel.adapterType,
        }),
      ],
    )

    expect(option.providerKeyId).toBeUndefined()
    expect(option.keyId).toBe('k1')
  })
})
