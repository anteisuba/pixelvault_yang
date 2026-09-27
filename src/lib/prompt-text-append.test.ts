import { describe, expect, it } from 'vitest'

import {
  appendPromptFragments,
  prependPromptFragments,
  promptHasFragments,
  removePromptFragments,
} from '@/lib/prompt-text-append'

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

describe('trigger fragments in the prompt text', () => {
  it('recognises the same trigger written with escapes, underscores or a weight', () => {
    expect(
      promptHasFragments('aemeath \\(wuwa\\), smile', 'Aemeath (WuWa)'),
    ).toBe(true)
    expect(promptHasFragments('aemeath_(wuwa), smile', 'Aemeath (WuWa)')).toBe(
      true,
    )
    expect(
      promptHasFragments('(Aemeath (WuWa):1.2), smile', 'Aemeath (WuWa)'),
    ).toBe(true)
    expect(promptHasFragments('smile', 'Aemeath (WuWa)')).toBe(false)
  })

  it('needs every phrase of a multi-phrase trigger', () => {
    expect(promptHasFragments('sks, 1girl', 'sks, orange hair')).toBe(false)
    expect(promptHasFragments('orange hair, sks', 'sks, orange hair')).toBe(
      true,
    )
    expect(promptHasFragments('anything', '')).toBe(false)
  })

  it('writes only the missing phrases to the front', () => {
    expect(prependPromptFragments('', 'Aemeath (WuWa)')).toBe('Aemeath (WuWa)')
    expect(prependPromptFragments('smile, night', 'Aemeath (WuWa)')).toBe(
      'Aemeath (WuWa), smile, night',
    )
    expect(
      prependPromptFragments('aemeath_(wuwa), smile', 'Aemeath (WuWa)'),
    ).toBe('aemeath_(wuwa), smile')
    expect(prependPromptFragments('orange hair', 'sks, orange hair')).toBe(
      'sks, orange hair',
    )
  })

  it('removes the trigger phrases and leaves every other character alone', () => {
    expect(
      removePromptFragments('Aemeath (WuWa), smile,\nnight', 'Aemeath (WuWa)'),
    ).toBe('smile,\nnight')
    expect(
      removePromptFragments(
        'smile, aemeath \\(wuwa\\), night',
        'Aemeath (WuWa)',
      ),
    ).toBe('smile, night')
    expect(removePromptFragments('Aemeath (WuWa)', 'Aemeath (WuWa)')).toBe('')
    expect(
      removePromptFragments('Aemeath (WuWa) walking', 'Aemeath (WuWa)'),
    ).toBe('Aemeath (WuWa) walking')
  })
})
