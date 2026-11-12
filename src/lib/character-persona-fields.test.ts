import { describe, expect, it } from 'vitest'

import { hasPersonaProfile } from './character-persona-fields'

describe('hasPersonaProfile', () => {
  it('一格都没写（或只有空白）= 没设定：聊天退回工作口吻', () => {
    expect(hasPersonaProfile(null)).toBe(false)
    expect(hasPersonaProfile({})).toBe(false)
    expect(
      hasPersonaProfile({ identity: '  ', speech: '', catchphrases: [' '] }),
    ).toBe(false)
  })

  it('任一格有字就算写了（口头禅也算）', () => {
    expect(hasPersonaProfile({ backstory: '在北方长大' })).toBe(true)
    expect(hasPersonaProfile({ catchphrases: ['才不是'] })).toBe(true)
  })

  it('学到的说法与关系不算设定（她自己攒的，演不出人来）', () => {
    expect(
      hasPersonaProfile({ learnedPhrases: ['绝了'], relationship: '朋友' }),
    ).toBe(false)
  })
})
