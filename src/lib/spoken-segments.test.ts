import { describe, expect, it } from 'vitest'

import { splitSpokenSegments } from './spoken-segments'

describe('splitSpokenSegments', () => {
  it('reads the first and last paragraphs, keeps the report between them silent', () => {
    expect(
      splitSpokenSegments(
        '[sighs] 又是冬装？……行吧。\n\n已换上冬装那套造型。\n\n- LoRA 0.8\n- 张数 4\n\n点生成就行，别怪我哦。',
      ),
    ).toEqual({
      opening: '[sighs] 又是冬装？……行吧。',
      body: '已换上冬装那套造型。\n\n- LoRA 0.8\n- 张数 4',
      closing: '点生成就行，别怪我哦。',
    })
  })

  it('reads everything when there are only one or two paragraphs', () => {
    expect(splitSpokenSegments('  在的。  ')).toEqual({
      opening: '在的。',
      body: '',
      closing: '',
    })
    expect(splitSpokenSegments('好。\n \n去吧。')).toEqual({
      opening: '好。',
      body: '',
      closing: '去吧。',
    })
    expect(splitSpokenSegments('')).toEqual({
      opening: '',
      body: '',
      closing: '',
    })
  })
})
