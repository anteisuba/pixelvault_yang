import { describe, it, expect } from 'vitest'

import type { StudioModelOption } from '@/types/model-option'
import { AI_MODELS } from '@/constants/models/enum'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import {
  channelHasOption,
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

  it('drops the workspace twin of a keyed route but keeps other models', () => {
    const series = groupModelsForPicker(
      [
        option(AI_MODELS.SEEDREAM_50_PRO, AI_ADAPTER_TYPES.FAL, {
          optionId: 'key:k1',
          sourceType: 'saved',
          keyId: 'k1',
        }),
        option(AI_MODELS.SEEDREAM_50_PRO, AI_ADAPTER_TYPES.FAL),
        option(AI_MODELS.SEEDREAM_50_LITE, AI_ADAPTER_TYPES.FAL, {
          optionId: 'workspace:lite',
        }),
      ],
      labelOf,
    )

    const models = series[0].models
    expect(models[0].channels.map((c) => c.channelId)).toEqual(['key:k1'])
    expect(models[1].channels.map((c) => c.channelId)).toEqual([
      'workspace:lite',
    ])
  })

  /**
   * owner 2026-09-10 真机反馈第四条：Seedance 2.5 底下 VolcEngine / fal.ai /
   * BytePlus **各出现两次** —— 那是同一条渠道上的关键帧端点与参考端点。渠道身份是
   * 「adapter + 凭据」，端点不进 key。
   */
  it('folds the reference endpoint into the same channel row', () => {
    const series = groupModelsForPicker(
      [
        option(AI_MODELS.SEEDANCE_25, AI_ADAPTER_TYPES.FAL),
        option(AI_MODELS.SEEDANCE_25_REFERENCE, AI_ADAPTER_TYPES.FAL),
        option(AI_MODELS.SEEDANCE_25_VOLCENGINE, AI_ADAPTER_TYPES.VOLCENGINE),
        option(
          AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
          AI_ADAPTER_TYPES.VOLCENGINE,
        ),
        option(AI_MODELS.SEEDANCE_25_BYTEPLUS, AI_ADAPTER_TYPES.BYTEPLUS),
        option(
          AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS,
          AI_ADAPTER_TYPES.BYTEPLUS,
        ),
      ],
      labelOf,
    )

    const model = series[0].models[0]
    expect(series[0].models).toHaveLength(1)
    expect(model.channels).toHaveLength(3)
    expect(model.channels.map((c) => c.option.adapterType)).toEqual([
      AI_ADAPTER_TYPES.FAL,
      AI_ADAPTER_TYPES.VOLCENGINE,
      AI_ADAPTER_TYPES.BYTEPLUS,
    ])
    // 被折掉的那条仍然认得出来 —— 存量卡上存的可能正是它的 optionId。
    const fal = model.channels[0]
    expect(fal.variants).toHaveLength(2)
    expect(
      channelHasOption(fal, `workspace:${AI_MODELS.SEEDANCE_25_REFERENCE}`),
    ).toBe(true)
    expect(channelHasOption(fal, 'workspace:nope')).toBe(false)
  })

  /**
   * owner 2026-09-10 真机第一条：Seedance 2.0 Fast 展开后 **BytePlus 出现两次**，
   * 两行都写着 `$0.121 / 秒`。两条 byteplus 端点跑的是同一把 key —— 一条是绑在
   * `-fast-byteplus` 上的 `saved`，另一条是被 provider 级覆盖盖上同一把 key 的
   * `workspace`。凭据一样 = 同一条渠道。
   */
  it('folds the saved route and its provider-key-covered twin into one row', () => {
    const series = groupModelsForPicker(
      [
        option(AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS, AI_ADAPTER_TYPES.BYTEPLUS, {
          optionId: 'key:bp1',
          sourceType: 'saved',
          keyId: 'bp1',
        }),
        option(
          AI_MODELS.SEEDANCE_20_FAST_REFERENCE_BYTEPLUS,
          AI_ADAPTER_TYPES.BYTEPLUS,
          { providerKeyId: 'bp1' },
        ),
      ],
      labelOf,
    )

    const model = series[0].models[0]
    expect(model.channels).toHaveLength(1)
    // 代表取 `saved` 那条 —— 提交时钉住 apiKeyId，行上还有 key 标签与健康点。
    expect(model.channels[0].channelId).toBe('key:bp1')
    expect(
      channelHasOption(
        model.channels[0],
        `workspace:${AI_MODELS.SEEDANCE_20_FAST_REFERENCE_BYTEPLUS}`,
      ),
    ).toBe(true)
  })

  it('keeps the whole Seedance 2.0 Fast family to one row per credential', () => {
    const series = groupModelsForPicker(
      [
        option(AI_MODELS.SEEDANCE_20_FAST, AI_ADAPTER_TYPES.FAL, {
          providerKeyId: 'fal1',
        }),
        option(AI_MODELS.SEEDANCE_20_FAST_REFERENCE, AI_ADAPTER_TYPES.FAL, {
          providerKeyId: 'fal1',
        }),
        option(
          AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE,
          AI_ADAPTER_TYPES.VOLCENGINE,
        ),
        option(
          AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE,
          AI_ADAPTER_TYPES.VOLCENGINE,
        ),
        option(AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS, AI_ADAPTER_TYPES.BYTEPLUS, {
          optionId: 'key:bp1',
          sourceType: 'saved',
          keyId: 'bp1',
        }),
        option(
          AI_MODELS.SEEDANCE_20_FAST_REFERENCE_BYTEPLUS,
          AI_ADAPTER_TYPES.BYTEPLUS,
          { providerKeyId: 'bp1' },
        ),
      ],
      labelOf,
    )

    const model = series[0].models[0]
    expect(model.channels.map((c) => c.option.adapterType)).toEqual([
      AI_ADAPTER_TYPES.FAL,
      AI_ADAPTER_TYPES.VOLCENGINE,
      AI_ADAPTER_TYPES.BYTEPLUS,
    ])
  })

  /** 差别是「自己的 key A」与「自己的 key B」时**各占一行**，行上写出 key 标签。 */
  it('splits two keys on the same provider and names them apart', () => {
    const series = groupModelsForPicker(
      [
        option(AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS, AI_ADAPTER_TYPES.BYTEPLUS, {
          optionId: 'key:bp1',
          sourceType: 'saved',
          keyId: 'bp1',
          keyLabel: '公司账号',
        }),
        option(AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS, AI_ADAPTER_TYPES.BYTEPLUS, {
          optionId: 'key:bp2',
          sourceType: 'saved',
          keyId: 'bp2',
          keyLabel: '个人账号',
        }),
      ],
      labelOf,
    )

    const channels = series[0].models[0].channels
    expect(channels).toHaveLength(2)
    expect(channels.map((c) => c.label)).toEqual([
      expect.stringContaining('公司账号'),
      expect.stringContaining('个人账号'),
    ])
  })

  it('keeps a keyless channel apart from the user key on the same adapter', () => {
    const series = groupModelsForPicker(
      [
        option(AI_MODELS.SEEDANCE_25, AI_ADAPTER_TYPES.FAL, {
          optionId: 'key:k1',
          sourceType: 'saved',
          keyId: 'k1',
        }),
        option(AI_MODELS.SEEDANCE_25_REFERENCE, AI_ADAPTER_TYPES.FAL, {
          optionId: 'workspace:ref',
        }),
      ],
      labelOf,
    )
    // 凭据不同 = 不同渠道（`key:k1` vs 无 key），⛔ 不折。
    expect(series[0].models[0].channels.map((c) => c.channelId)).toEqual([
      'key:k1',
      'workspace:ref',
    ])
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
