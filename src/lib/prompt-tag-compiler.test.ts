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
