import { beforeEach, describe, expect, it } from 'vitest'

import { STUDIO_OPERATOR_AUTHORSHIP } from '@/constants/studio-assistant-operator'
import {
  readOperatorWrittenText,
  writeOperatorWrittenText,
} from './studio-operator-authorship'

describe('助手写下的全文落盘（刷新后别再问覆盖）', () => {
  beforeEach(() => localStorage.clear())

  it('按域、按字段存取，同域另一字段不被顶掉', () => {
    writeOperatorWrittenText('image', 'prompt', '1girl, rain')
    writeOperatorWrittenText('image', 'negative', 'lowres')
    writeOperatorWrittenText('video', 'prompt', 'a dog running')
    expect(readOperatorWrittenText('image', 'prompt')).toBe('1girl, rain')
    expect(readOperatorWrittenText('image', 'negative')).toBe('lowres')
    expect(readOperatorWrittenText('video', 'prompt')).toBe('a dog running')
    expect(readOperatorWrittenText('video', 'negative')).toBeUndefined()
  })

  it('盘上是坏数据就当没存过；超长的不写', () => {
    localStorage.setItem(
      `${STUDIO_OPERATOR_AUTHORSHIP.keyPrefix}.image`,
      '{oops',
    )
    expect(readOperatorWrittenText('image', 'prompt')).toBeUndefined()
    writeOperatorWrittenText(
      'image',
      'prompt',
      'x'.repeat(STUDIO_OPERATOR_AUTHORSHIP.maxTextChars + 1),
    )
    expect(readOperatorWrittenText('image', 'prompt')).toBeUndefined()
  })
})
