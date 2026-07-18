import { describe, expect, it } from 'vitest'

import { appendPromptFragments } from '@/lib/prompt-text-append'

describe('appendPromptFragments', () => {
  it('appends new fragments onto an empty existing text', () => {
    expect(appendPromptFragments('', 'silver hair, snowy field')).toBe(
      'silver hair, snowy field',
    )
  })

  it('appends new fragments after existing ones, comma-joined', () => {
    expect(appendPromptFragments('1girl, outdoors', 'backlighting')).toBe(
      '1girl, outdoors, backlighting',
    )
  })

  it('skips fragments already present, case-insensitively', () => {
    expect(
      appendPromptFragments('1girl, Outdoors', 'outdoors, backlighting'),
    ).toBe('1girl, Outdoors, backlighting')
  })

  it('drops duplicate fragments within the addition itself', () => {
    expect(appendPromptFragments('1girl', 'dusk, dusk, backlighting')).toBe(
      '1girl, dusk, backlighting',
    )
  })

  it('trims whitespace and ignores empty fragments', () => {
    expect(appendPromptFragments('1girl , , outdoors ', '  , dusk ,')).toBe(
      '1girl, outdoors, dusk',
    )
  })

  it('returns the existing text unchanged when addition is empty', () => {
    expect(appendPromptFragments('1girl, outdoors', '')).toBe('1girl, outdoors')
  })
})
