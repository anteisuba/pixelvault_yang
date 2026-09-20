import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { tailorImageRequestToModel } from '@/lib/studio/tailor-image-request'
import type { AdvancedParams } from '@/types'

const LAYOUT = {
  positioning: 'manual' as const,
  characters: Array.from({ length: 8 }, (_, index) => ({
    prompt: `char${index}, rain:1.2`,
    negativePrompt: 'blurry:0.8',
    position: { x: 0.5, y: 0.5 },
  })),
}

describe('出图时按各模型能力裁剪 payload', () => {
  it('把不认识的专属键删掉', () => {
    const advancedParams: AdvancedParams = {
      qualityToggle: 'standard',
      textRendering: 'hello',
      ucPreset: 'heavy',
    }
    const out = tailorImageRequestToModel(
      { modelId: AI_MODELS.NOVELAI_V45_FULL, advancedParams },
      'tags',
    )
    // V4.5 没有质量标签与 Text:，UC 预设留着。
    expect(out.advancedParams).toMatchObject({ ucPreset: 'heavy' })
    expect(out.advancedParams?.qualityToggle).toBeUndefined()
    expect(out.advancedParams?.textRendering).toBeUndefined()
  })

  // 角色构图上限逐模型不同 —— 截到这家的上限，⛔ 不整块丢。
  it('把角色截到这个模型的上限', () => {
    const v5 = tailorImageRequestToModel(
      {
        modelId: AI_MODELS.NOVELAI_V5_FULL,
        advancedParams: { novelAiLayout: LAYOUT },
      },
      'natural',
    )
    expect(v5.advancedParams?.novelAiLayout?.characters).toHaveLength(8)

    const v45 = tailorImageRequestToModel(
      {
        modelId: AI_MODELS.NOVELAI_V45_FULL,
        advancedParams: { novelAiLayout: LAYOUT },
      },
      'natural',
    )
    expect(v45.advancedParams?.novelAiLayout?.characters).toHaveLength(6)
  })

  it('不支持角色构图的模型整块删掉', () => {
    const out = tailorImageRequestToModel(
      {
        modelId: AI_MODELS.PIXAI_TSUBAKI_2,
        advancedParams: { novelAiLayout: LAYOUT },
      },
      'tags',
    )
    expect(out.advancedParams?.novelAiLayout).toBeUndefined()
  })

  // ⭐ 统一串 → 各家自己的语法。界面上一律 ×1.2。
  it('标签台的串按 provider 翻译（正 / 负 / 角色各自的）', () => {
    const nai = tailorImageRequestToModel(
      {
        modelId: AI_MODELS.NOVELAI_V5_FULL,
        freePrompt: '1girl, rain:1.2',
        advancedParams: {
          negativePrompt: 'blurry:0.8',
          novelAiLayout: {
            ...LAYOUT,
            characters: LAYOUT.characters.slice(0, 1),
          },
        },
      },
      'tags',
    )
    expect(nai.freePrompt).toBe('1girl, {{{{rain}}}}')
    expect(nai.advancedParams?.negativePrompt).toBe('[[[[[blurry]]]]]')
    expect(nai.advancedParams?.novelAiLayout?.characters[0].prompt).toBe(
      'char0, {{{{rain}}}}',
    )

    const pixai = tailorImageRequestToModel(
      { modelId: AI_MODELS.PIXAI_HARUKA_V2, freePrompt: '1girl, rain:1.2' },
      'tags',
    )
    expect(pixai.freePrompt).toBe('1girl, (rain:1.2)')
  })

  // ⛔ 自然语言台的提示词原样发 —— 翻一遍会把用户写的句子改写成权重。
  it('自然语言台的提示词一个字都不动', () => {
    const out = tailorImageRequestToModel(
      {
        modelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
        freePrompt: 'a girl: 1.2 meters tall',
      },
      'natural',
    )
    expect(out.freePrompt).toBe('a girl: 1.2 meters tall')
  })

  it('没什么可裁的就原样返回同一个对象', () => {
    const request = { modelId: AI_MODELS.OPENAI_GPT_IMAGE_2, freePrompt: 'hi' }
    expect(tailorImageRequestToModel(request, 'natural')).toBe(request)
  })
})
