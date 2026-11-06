import { describe, expect, it } from 'vitest'

import { unwrapLines } from './assistant-v3-bench.service'

describe('unwrapLines (11-06: the prompt only filled half the box)', () => {
  it('joins hard-wrapped lines inside a paragraph', () => {
    expect(
      unwrapLines(
        'fluffy wavy pink hair,\npink cat ears, soft blush.\nShe hugs a tablet to her chest\nand smiles.',
      ),
    ).toBe(
      'fluffy wavy pink hair, pink cat ears, soft blush. She hugs a tablet to her chest and smiles.',
    )
  })

  it('keeps blank-line paragraphs and joins CJK lines without a space', () => {
    expect(
      unwrapLines('粉色长发，\n猫耳。\n\nsecond paragraph  \n  here'),
    ).toBe('粉色长发，猫耳。\n\nsecond paragraph here')
  })
})
