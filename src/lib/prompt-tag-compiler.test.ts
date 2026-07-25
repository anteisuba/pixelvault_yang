import { describe, expect, it } from 'vitest'

import { compilePromptTags } from '@/lib/prompt-tag-compiler'
import type { PromptTagSelection } from '@/types/prompt-tags'

function selection(overrides: Partial<PromptTagSelection>): PromptTagSelection {
  return {
    id: 'selection-1',
    tagId: 'tag-1',
    promptText: 'masterpiece',
    label: 'Masterpiece',
    polarity: 'positive',
    source: 'system',
    type: 'quality',
    enabled: true,
    orderIndex: 0,
    insertedAt: '2026-06-08T00:00:00.000Z',
    ...overrides,
  }
}

describe('compilePromptTags', () => {
  it('prepends positive tags to free prompt in selection order', () => {
    const result = compilePromptTags({
      freePrompt: 'portrait of a creator',
      selectedTags: [
        selection({
          id: 'b',
          tagId: 'lighting',
          promptText: 'soft lighting',
          label: 'Soft light',
          orderIndex: 1,
        }),
        selection({
          id: 'a',
          tagId: 'quality',
          promptText: 'highly detailed',
          label: 'High detail',
          orderIndex: 0,
        }),
      ],
    })

    expect(result.freePrompt).toBe(
      'highly detailed, soft lighting, portrait of a creator',
    )
  })

  it('merges negative tags after the existing negative prompt', () => {
    const result = compilePromptTags({
      freePrompt: 'portrait',
      existingNegativePrompt: 'watermark',
      selectedTags: [
        selection({
          id: 'negative-1',
          tagId: 'blur',
          promptText: 'blurry',
          label: 'Blur',
          polarity: 'negative',
          type: 'negative',
        }),
      ],
    })

    expect(result.negativePrompt).toBe('watermark, blurry')
  })

  it('deduplicates repeated prompt fragments and preserves weights', () => {
    const result = compilePromptTags({
      freePrompt: 'portrait',
      selectedTags: [
        selection({
          id: 'weighted',
          promptText: 'cinematic composition',
          label: 'Cinematic',
          weight: 1.25,
        }),
        selection({
          id: 'duplicate',
          tagId: 'cinematic-2',
          promptText: 'cinematic composition',
          label: 'Cinematic duplicate',
          orderIndex: 1,
        }),
      ],
    })

    expect(result.freePrompt).toBe('(cinematic composition:1.25), portrait')
  })
})

// 2026-07-26 真机实测：LoRA 装配台编译出的 prompt 是
// `sks_flasso, sks_flasso, beautiful scenery, ...` —— 触发词正文里有一份、
// 触发词 chip 又注入一份。旧的去重按「整段字符串」比，两段不相等就都留下了。
describe('compilePromptTags — 正文已有的词不再重复注入', () => {
  it('skips a tag whose text already appears as a fragment of the free prompt', () => {
    const result = compilePromptTags({
      freePrompt: 'sks_flasso, beautiful scenery, highly detailed',
      selectedTags: [
        selection({
          id: 'trigger',
          tagId: 'lora-trigger:asset-1',
          promptText: 'sks_flasso',
          type: 'lora_trigger',
          orderIndex: -1,
        }),
      ],
    })

    expect(result.freePrompt).toBe(
      'sks_flasso, beautiful scenery, highly detailed',
    )
    expect(result.positiveTagText).toBe('')
  })

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    const result = compilePromptTags({
      freePrompt: '  SKS_Flasso ,  beautiful scenery',
      selectedTags: [
        selection({
          id: 'trigger',
          promptText: 'sks_flasso',
          orderIndex: -1,
        }),
      ],
    })

    // 正文原样保留（只整体 trim + 折叠空白，不重新序列化），所以逗号前的
    // 空格还在——这条要验的是「已识别出正文里有它」，没有再注入一份。
    expect(result.freePrompt).toBe('SKS_Flasso , beautiful scenery')
    expect(result.positiveTagText).toBe('')
  })

  it('recognises a weighted occurrence in the free prompt', () => {
    const result = compilePromptTags({
      freePrompt: '(sks_flasso:1.2), beautiful scenery',
      selectedTags: [
        selection({ id: 'trigger', promptText: 'sks_flasso', orderIndex: -1 }),
      ],
    })

    expect(result.freePrompt).toBe('(sks_flasso:1.2), beautiful scenery')
  })

  it('still injects a tag the free prompt does not contain', () => {
    const result = compilePromptTags({
      freePrompt: 'beautiful scenery',
      selectedTags: [
        selection({ id: 'trigger', promptText: 'sks_flasso', orderIndex: -1 }),
      ],
    })

    expect(result.freePrompt).toBe('sks_flasso, beautiful scenery')
  })

  it('does not treat a substring of a longer fragment as already present', () => {
    const result = compilePromptTags({
      freePrompt: 'sks_flasso_v2, beautiful scenery',
      selectedTags: [
        selection({ id: 'trigger', promptText: 'sks_flasso', orderIndex: -1 }),
      ],
    })

    expect(result.freePrompt).toBe(
      'sks_flasso, sks_flasso_v2, beautiful scenery',
    )
  })

  it('keeps positive and negative sides independent', () => {
    const result = compilePromptTags({
      freePrompt: 'lowres, beautiful scenery',
      existingNegativePrompt: 'watermark',
      selectedTags: [
        selection({
          id: 'neg',
          promptText: 'lowres',
          polarity: 'negative',
          orderIndex: 0,
        }),
      ],
    })

    // 正文里的 `lowres` 不该压掉负向标签里的同名词——两侧各算各的。
    expect(result.negativePrompt).toBe('watermark, lowres')
  })
})
