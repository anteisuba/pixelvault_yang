/** 助手设置那四格接在新内核上（owner 11-02「接上」）：语气、回复长短、附一条下一步、用我的词。 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import {
  buildCreatorSection,
  buildPersonaStyleSection,
} from '@/features/assistant/services/assistant-operator.service'

const persona = { ...ASSISTANT_PERSONA_DEFAULTS }

describe('助手设置 → 新内核提示词', () => {
  it('语气三档各给一句；长度只有简短 / 详细才写', () => {
    expect(
      buildPersonaStyleSection({ ...persona, tone: 'terse' }, 'v3'),
    ).toMatch(/terse/i)
    expect(
      buildPersonaStyleSection({ ...persona, verbosity: 'concise' }, 'v3'),
    ).toMatch(/Keep it short/)
    expect(
      buildPersonaStyleSection({ ...persona, verbosity: 'standard' }, 'v3'),
    ).not.toMatch(/Keep it short|in depth/)
  })

  it('附一条下一步：开 = 要一条；关 = 明说别写（压过自看图那句）', () => {
    expect(buildCreatorSection(persona, null, [], null)).toMatch(
      /ONE concrete next step/,
    )
    const off = buildCreatorSection(
      { ...persona, nextStepHint: false },
      null,
      [],
      null,
    )
    expect(off).toMatch(/Do not suggest a next step/)
    expect(off).not.toMatch(/ONE concrete next step/)
  })

  it('用我的词：开才写那一句', () => {
    expect(buildCreatorSection(persona, null, [], null)).toMatch(
      /Use THEIR words/,
    )
    expect(
      buildCreatorSection({ ...persona, useMyWords: false }, null, [], null),
    ).not.toMatch(/Use THEIR words/)
  })
})
