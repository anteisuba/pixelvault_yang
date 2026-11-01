import { describe, expect, it } from 'vitest'

import { pickTemplateParams, styleChipsOf } from './template-save-include'

const PARAMS = {
  aspectRatio: '3:4',
  promptDialect: 'tags',
  loraSetup: { baseId: 'b', items: [] },
  advancedParams: {
    negativePrompt: 'lowres',
    steps: 28,
    loras: [{ url: 'u', scale: 1 }],
    novelAiLayout: {
      positioning: 'auto',
      characters: [{ prompt: 'girl', negativePrompt: 'bad hands' }],
    },
  },
}

describe('pickTemplateParams', () => {
  it('全勾 = 原样', () => {
    expect(pickTemplateParams(PARAMS, {})).toEqual(PARAMS)
  })

  it('不勾负面：总负面拿掉，每位角色的负面清空', () => {
    const out = pickTemplateParams(PARAMS, { negative: false })
    const advanced = out.advancedParams as Record<string, unknown>
    expect(advanced.negativePrompt).toBeUndefined()
    expect(advanced.novelAiLayout).toEqual({
      positioning: 'auto',
      characters: [{ prompt: 'girl', negativePrompt: '' }],
    })
  })

  it('不勾参数：比例、步数拿掉，负面 / 角色 / 挂载留着', () => {
    const out = pickTemplateParams(PARAMS, { params: false })
    expect(out.aspectRatio).toBeUndefined()
    expect(out.promptDialect).toBe('tags')
    expect(Object.keys(out.advancedParams as object).sort()).toEqual([
      'loras',
      'negativePrompt',
      'novelAiLayout',
    ])
  })

  it('不勾角色 / 挂载', () => {
    const out = pickTemplateParams(PARAMS, { characters: false, lora: false })
    const advanced = out.advancedParams as Record<string, unknown>
    expect(advanced.novelAiLayout).toBeUndefined()
    expect(advanced.loras).toBeUndefined()
    expect(out.loraSetup).toBeUndefined()
  })
})

describe('styleChipsOf', () => {
  it('只挑画师和画法', () => {
    expect(
      styleChipsOf([
        { text: 'artist:wlop', weight: 1 },
        { text: '1girl', weight: 1 },
        { text: 'watercolor (medium)', weight: 1 },
      ]).map((chip) => chip.text),
    ).toEqual(['artist:wlop', 'watercolor (medium)'])
  })
})
