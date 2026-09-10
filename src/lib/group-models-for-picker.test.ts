import { describe, it, expect } from 'vitest'

import type { StudioModelOption } from '@/components/business/ModelSelector'
import { AI_MODELS } from '@/constants/models/enum'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import {
  deriveModelLabels,
  flattenPickerModels,
  groupModelsForPicker,
} from '@/lib/group-models-for-picker'

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

/** 列表里显示的字 —— 真实调用方给的是 i18n 后的标签，测试给个可预测的。 */
const LABELS: Record<string, string> = {
  [AI_MODELS.SEEDREAM_50_PRO]: 'Seedream 5.0 Pro',
  [AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE]: 'Seedream 5.0 Pro（火山方舟）',
  [AI_MODELS.SEEDREAM_50_PRO_BYTEPLUS]: 'Seedream 5.0 Pro（BytePlus）',
  [AI_MODELS.SEEDREAM_50_LITE]: 'Seedream 5.0 Lite',
  [AI_MODELS.OPENAI_GPT_IMAGE_2]: 'GPT Image 2',
}
const labelOf = (o: StudioModelOption) => LABELS[o.modelId] ?? o.modelId

describe('groupModelsForPicker', () => {
  it('collapses the channel-suffixed twins into ONE model row with N channels', () => {
    const series = groupModelsForPicker(
      [
        option(AI_MODELS.SEEDREAM_50_PRO, AI_ADAPTER_TYPES.FAL),
        option(
          AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE,
          AI_ADAPTER_TYPES.VOLCENGINE,
        ),
        option(AI_MODELS.SEEDREAM_50_PRO_BYTEPLUS, AI_ADAPTER_TYPES.BYTEPLUS),
      ],
      labelOf,
    )

    expect(series).toHaveLength(1)
    expect(series[0].label).toBe('Seedream')
    expect(series[0].models).toHaveLength(1)
    // 削掉渠道括注：一行「Seedream 5.0 Pro」，三条渠道在它下面。
    expect(series[0].models[0].label).toBe('Seedream 5.0 Pro')
    expect(series[0].models[0].channels).toHaveLength(3)
  })

  it('groups by series and keeps the incoming (preference-ranked) order', () => {
    const series = groupModelsForPicker(
      [
        option(AI_MODELS.OPENAI_GPT_IMAGE_2, AI_ADAPTER_TYPES.OPENAI),
        option(AI_MODELS.SEEDREAM_50_PRO, AI_ADAPTER_TYPES.FAL),
        option(AI_MODELS.SEEDREAM_50_LITE, AI_ADAPTER_TYPES.FAL),
      ],
      labelOf,
    )

    expect(series.map((s) => s.label)).toEqual(['GPT Image', 'Seedream'])
    expect(series[1].models.map((m) => m.label)).toEqual([
      'Seedream 5.0 Pro',
      'Seedream 5.0 Lite',
    ])
  })

  it('drops the workspace twin of a keyed route but keeps a free-tier one', () => {
    const series = groupModelsForPicker(
      [
        option(AI_MODELS.SEEDREAM_50_PRO, AI_ADAPTER_TYPES.FAL, {
          optionId: 'key:k1',
          sourceType: 'saved',
          keyId: 'k1',
        }),
        option(AI_MODELS.SEEDREAM_50_PRO, AI_ADAPTER_TYPES.FAL),
        option(AI_MODELS.SEEDREAM_50_LITE, AI_ADAPTER_TYPES.FAL, {
          optionId: 'free:lite',
          freeTier: true,
        }),
      ],
      labelOf,
    )

    const models = series[0].models
    expect(models[0].channels.map((c) => c.channelId)).toEqual(['key:k1'])
    expect(models[1].channels.map((c) => c.channelId)).toEqual(['free:lite'])
  })

  it('falls back to the provider as the series for catalog-less ids', () => {
    const series = groupModelsForPicker(
      [option('fal-ai/flux-pro/edit', AI_ADAPTER_TYPES.FAL)],
      labelOf,
    )
    expect(series[0].seriesKey).toBe(`provider:${AI_ADAPTER_TYPES.FAL}`)
    expect(series[0].models).toHaveLength(1)
  })

  it('flattens to model rows for search and the recents section', () => {
    const series = groupModelsForPicker(
      [
        option(AI_MODELS.OPENAI_GPT_IMAGE_2, AI_ADAPTER_TYPES.OPENAI),
        option(AI_MODELS.SEEDREAM_50_PRO, AI_ADAPTER_TYPES.FAL),
      ],
      labelOf,
    )
    expect(flattenPickerModels(series).map((e) => e.model.label)).toEqual([
      'GPT Image 2',
      'Seedream 5.0 Pro',
    ])
  })
})

describe('deriveModelLabels', () => {
  it('keeps the qualifier when stripping would collide inside the series', () => {
    const labels = deriveModelLabels([
      { modelKey: 'a', labels: ['Seedream 5.0 Pro'] },
      { modelKey: 'b', labels: ['Seedream 5.0 Pro（火山方舟）'] },
    ])
    expect(labels.get('b')).toBe('Seedream 5.0 Pro（火山方舟）')
  })

  it('strips the qualifier when the stripped name stays unique', () => {
    const labels = deriveModelLabels([
      { modelKey: 'a', labels: ['Seedance 2.5（参考，火山方舟）'] },
      { modelKey: 'b', labels: ['Seedance 2.0'] },
    ])
    expect(labels.get('a')).toBe('Seedance 2.5')
  })

  it('takes the shortest label of a model that spans several channels', () => {
    const labels = deriveModelLabels([
      {
        modelKey: 'a',
        labels: ['Seedream 5.0 Pro（BytePlus）', 'Seedream 5.0 Pro'],
      },
    ])
    expect(labels.get('a')).toBe('Seedream 5.0 Pro')
  })
})
