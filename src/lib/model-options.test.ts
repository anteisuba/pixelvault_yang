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
  pickDefaultImageModelOptionId,
  toDefaultImageModelCandidates,
} from '@/hooks/use-default-image-model'
import {
  channelHasOption,
  groupModelsForPicker,
} from '@/lib/group-models-for-picker'
import {
  buildSavedModelOptionsForModels,
  mergeModelOptionsWithPreferredSavedRoutes,
  withProviderKeyCoverage,
} from '@/lib/model-options'
import type { StudioModelOption } from '@/types/model-option'
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

/**
 * ⭐ 真机 2026-09-20 的重复计费：同一条路在目录里有两个 optionId
 * （`workspace:<modelId>` 与 `key:<id>`），选择器折掉了 workspace 那条，
 * 默认模型却落在它上面 —— 行认不出自己已被选中，再点一次走「新增」，
 * 同一个模型进出图名单两份，**按两份跑、按两份计费**。
 */
describe('一条路只留一个 optionId', () => {
  const route = (
    overrides: Partial<StudioModelOption> & Pick<StudioModelOption, 'optionId'>,
  ): StudioModelOption => ({
    modelId: 'nai-diffusion-4-5-full',
    adapterType: AI_ADAPTER_TYPE_OPTIONS[0],
    providerConfig: { label: 'p', baseUrl: '' },
    requestCount: 1,
    isBuiltIn: true,
    sourceType: 'workspace',
    ...overrides,
  })

  const saved = route({
    optionId: 'key:k1',
    sourceType: 'saved',
    isBuiltIn: false,
    keyId: 'k1',
  })
  const workspace = route({
    optionId: 'workspace:nai-diffusion-4-5-full',
    providerKeyId: 'k1',
  })

  // key 健康「未知」是最常见的状态（没跑过检查）—— 正是这一档让 workspace
  // 那条排到了 saved 前面，默认模型于是落在它上面。
  it.each([
    ['健康未知', {}],
    ['健康可用', { k1: 'available' as const }],
    ['健康失败', { k1: 'failed' as const }],
  ])('%s 时合并后只剩 key 那条', (_label, healthMap) => {
    const merged = mergeModelOptionsWithPreferredSavedRoutes(
      [saved],
      [workspace],
      healthMap,
    )
    expect(merged.map((option) => option.optionId)).toEqual(['key:k1'])
  })

  it('没有 key 那条时 workspace 原样留着', () => {
    const merged = mergeModelOptionsWithPreferredSavedRoutes(
      [],
      [workspace],
      {},
    )
    expect(merged.map((option) => option.optionId)).toEqual([
      'workspace:nai-diffusion-4-5-full',
    ])
  })

  // 别的型号不受牵连：折的判据是 adapter + 型号，不是 adapter。
  it('只折同一条路，不折同一家的别的型号', () => {
    const otherModel = route({
      optionId: 'workspace:nai-diffusion-5-full',
      modelId: 'nai-diffusion-5-full',
      providerKeyId: 'k1',
    })
    const merged = mergeModelOptionsWithPreferredSavedRoutes(
      [saved],
      [workspace, otherModel],
      {},
    )
    // ⚠ 顺序仍是既有的健康偏好（健康未知的 saved 排在 workspace 之后），
    // 这一轮一个字没动它 —— 折掉的只有「同一条路的双胞胎」。
    expect(merged.map((option) => option.optionId)).toEqual([
      'workspace:nai-diffusion-5-full',
      'key:k1',
    ])
  })

  /**
   * ⭐ 不变量本身：**凡是应用能自动选中的那一条，选择器都必须指得到**。
   * 这条断言直接钉住那个 bug —— 修之前它是红的。
   */
  it('默认模型必定是选择器指得到的那一条', () => {
    const merged = mergeModelOptionsWithPreferredSavedRoutes(
      [saved],
      [workspace],
      {},
    )
    const picked = pickDefaultImageModelOptionId(
      toDefaultImageModelCandidates(merged),
      null,
    )
    expect(picked).not.toBeNull()

    const pointable = groupModelsForPicker(merged, (o) => o.modelId)
      .flatMap((series) => series.models)
      .some((model) =>
        model.channels.some((channel) =>
          channelHasOption(channel, picked ?? ''),
        ),
      )
    expect(pointable).toBe(true)
  })
})
