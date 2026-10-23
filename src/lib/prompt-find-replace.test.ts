import { describe, expect, it } from 'vitest'

import { applyPromptFindReplace } from './prompt-find-replace'

describe('applyPromptFindReplace', () => {
  it('每处恰好出现一次才换，几处一起换', () => {
    expect(
      applyPromptFindReplace('1girl, red hair, smile', [
        { find: 'red hair', replace: 'blue hair' },
        { find: 'smile', replace: 'smirk' },
      ]),
    ).toEqual({ ok: true, value: '1girl, blue hair, smirk' })
  })

  it('找不到、出现不止一次、互相重叠：说清是哪一处', () => {
    const missing = applyPromptFindReplace('a', [{ find: 'b', replace: 'c' }])
    expect(missing.ok === false && missing.error).toContain('does not occur')
    const twice = applyPromptFindReplace('a, a', [{ find: 'a', replace: 'b' }])
    expect(twice.ok === false && twice.error).toContain('more than once')
    const overlap = applyPromptFindReplace('red hair', [
      { find: 'red hair', replace: 'x' },
      { find: 'hair', replace: 'y' },
    ])
    expect(overlap.ok === false && overlap.error).toContain('overlaps')
  })
})
