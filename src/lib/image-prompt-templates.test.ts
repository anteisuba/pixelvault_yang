import { describe, expect, it } from 'vitest'

import {
  imageSubmitCount,
  isImagePromptTemplateId,
  wrapImagePromptTemplate,
} from './image-prompt-templates'

describe('image-prompt-templates', () => {
  it('宫格模板把你那一句嵌进全文，占位符都换掉', () => {
    const wrapped = wrapImagePromptTemplate(
      'grid3',
      '  雨夜的天台，她等了很久，最后转身离开 ',
    )
    expect(wrapped).toContain('3×3 storyboard grid')
    expect(wrapped).toContain('雨夜的天台，她等了很久，最后转身离开')
    expect(wrapped).not.toMatch(/\{story\}|\{shot\}|\{total\}/)
    expect(wrapImagePromptTemplate('grid2', '一句')).toContain('2×2')
  })

  it('连贯分镜逐张写「第 n / 4 拍」', () => {
    expect(wrapImagePromptTemplate('sequence4', '一句', 2)).toContain(
      'Shot 3 of 4',
    )
  })

  it('空句不套', () => {
    expect(wrapImagePromptTemplate('grid3', '   ')).toBe('   ')
  })

  it('张数：宫格钉 1、连贯分镜钉 4，没模板按张数', () => {
    expect(imageSubmitCount({ promptTemplate: 'grid3', count: 4 })).toBe(1)
    expect(imageSubmitCount({ promptTemplate: 'sequence4', count: 1 })).toBe(4)
    expect(imageSubmitCount({ count: 2 })).toBe(2)
    expect(imageSubmitCount({})).toBe(1)
  })

  it('认得出三种模板 id', () => {
    expect(isImagePromptTemplateId('grid2')).toBe(true)
    expect(isImagePromptTemplateId('none')).toBe(false)
  })
})

describe('存量卡迁移', () => {
  it('老的九宫格开关读成 grid3，开关本身剥掉', async () => {
    const { NodeV4GenerationParamsSchema } =
      await import('@/types/node-workflow')
    expect(
      NodeV4GenerationParamsSchema.parse({ storyboardGrid: true, count: 2 }),
    ).toEqual({ promptTemplate: 'grid3', count: 2 })
    expect(
      NodeV4GenerationParamsSchema.parse({ storyboardGrid: false }),
    ).toEqual({})
  })
})
