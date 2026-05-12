import { describe, expect, it } from 'vitest'

import { composeCharacterInjection } from '@/lib/character-card-injection'
import type { CharacterCardRecord, SourceImageEntry } from '@/types'

function makeCard(
  overrides: Partial<CharacterCardRecord> & { id: string; name: string },
): CharacterCardRecord {
  const defaults: Omit<CharacterCardRecord, 'id' | 'name'> = {
    description: null,
    sourceImageUrl: '',
    sourceImages: [],
    sourceImageEntries: [],
    characterPrompt: '',
    modelPrompts: null,
    referenceImages: null,
    attributes: null,
    loras: null,
    tags: [],
    status: 'DRAFT',
    stabilityScore: null,
    parentId: null,
    variantLabel: null,
    variants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  return { ...defaults, ...overrides }
}

function entry(
  url: string,
  viewType: SourceImageEntry['viewType'],
): SourceImageEntry {
  return { url, viewType }
}

describe('composeCharacterInjection', () => {
  it('returns empty injection when no cards', () => {
    const result = composeCharacterInjection([])
    expect(result).toEqual({
      promptPrefix: null,
      referenceImageUrl: null,
      loras: [],
      appliedCardIds: [],
    })
  })

  it('uses characterPrompt when present', () => {
    const card = makeCard({
      id: 'c1',
      name: 'Aemeath',
      description: 'short desc',
      characterPrompt: 'compiled long structured prompt',
      sourceImages: ['https://r2/a.png'],
    })
    const result = composeCharacterInjection([card])
    expect(result.promptPrefix).toBe(
      '[Character: Aemeath]\ncompiled long structured prompt',
    )
    expect(result.appliedCardIds).toEqual(['c1'])
  })

  it('falls back to description when characterPrompt empty', () => {
    const card = makeCard({
      id: 'c1',
      name: 'Aemeath',
      description: 'silver-pink hair, golden eyes',
      characterPrompt: '',
      sourceImages: ['https://r2/a.png'],
    })
    const result = composeCharacterInjection([card])
    expect(result.promptPrefix).toBe(
      '[Character: Aemeath]\nsilver-pink hair, golden eyes',
    )
  })

  it('returns null promptPrefix when both prompt fields are empty', () => {
    const card = makeCard({
      id: 'c1',
      name: 'Aemeath',
      sourceImages: ['https://r2/a.png'],
    })
    const result = composeCharacterInjection([card])
    expect(result.promptPrefix).toBeNull()
    expect(result.referenceImageUrl).toBe('https://r2/a.png')
    expect(result.appliedCardIds).toEqual(['c1'])
  })

  it('prefers sourceImageEntries[viewType=front] as referenceImage', () => {
    const card = makeCard({
      id: 'c1',
      name: 'Aemeath',
      characterPrompt: 'p',
      sourceImageEntries: [
        entry('https://r2/back.png', 'back'),
        entry('https://r2/three.png', 'three_quarter'),
        entry('https://r2/front.png', 'front'),
      ],
      sourceImages: ['https://r2/legacy.png'],
    })
    const result = composeCharacterInjection([card])
    expect(result.referenceImageUrl).toBe('https://r2/front.png')
  })

  it('falls back through viewType priority then sourceImages[0]', () => {
    const onlyDetail = makeCard({
      id: 'c1',
      name: 'A',
      characterPrompt: 'p',
      sourceImageEntries: [entry('https://r2/detail.png', 'detail')],
    })
    expect(composeCharacterInjection([onlyDetail]).referenceImageUrl).toBe(
      'https://r2/detail.png',
    )

    const onlyLegacy = makeCard({
      id: 'c2',
      name: 'B',
      characterPrompt: 'p',
      sourceImages: ['https://r2/legacy.png'],
    })
    expect(composeCharacterInjection([onlyLegacy]).referenceImageUrl).toBe(
      'https://r2/legacy.png',
    )
  })

  it('joins multi-character with numbered headers', () => {
    const a = makeCard({
      id: 'a',
      name: 'Aemeath',
      characterPrompt: 'silver-pink hair',
    })
    const b = makeCard({
      id: 'b',
      name: '绯雪',
      characterPrompt: 'white kimono',
    })
    const result = composeCharacterInjection([a, b])
    expect(result.promptPrefix).toBe(
      '[Character 1: Aemeath]\nsilver-pink hair\n\n[Character 2: 绯雪]\nwhite kimono',
    )
    expect(result.appliedCardIds).toEqual(['a', 'b'])
  })

  it('merges loras across cards and dedupes by url', () => {
    const a = makeCard({
      id: 'a',
      name: 'A',
      characterPrompt: 'p',
      loras: [
        { url: 'https://hf/lora-1', scale: 0.8 },
        { url: 'https://hf/lora-2' },
      ],
    })
    const b = makeCard({
      id: 'b',
      name: 'B',
      characterPrompt: 'p',
      loras: [
        { url: 'https://hf/lora-2' },
        { url: 'https://hf/lora-3', scale: 1.2 },
      ],
    })
    const result = composeCharacterInjection([a, b])
    expect(result.loras.map((l) => l.url)).toEqual([
      'https://hf/lora-1',
      'https://hf/lora-2',
      'https://hf/lora-3',
    ])
  })

  it('uses only the first card for referenceImage (no merging)', () => {
    const a = makeCard({
      id: 'a',
      name: 'A',
      characterPrompt: 'p',
      sourceImages: ['https://r2/a.png'],
    })
    const b = makeCard({
      id: 'b',
      name: 'B',
      characterPrompt: 'p',
      sourceImages: ['https://r2/b.png'],
    })
    expect(composeCharacterInjection([a, b]).referenceImageUrl).toBe(
      'https://r2/a.png',
    )
  })
})
