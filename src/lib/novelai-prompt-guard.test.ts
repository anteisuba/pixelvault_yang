import { describe, expect, it } from 'vitest'

import { findNovelAiPromptProblem } from './novelai-prompt-guard'

describe('findNovelAiPromptProblem', () => {
  it('拦中文整句（09-21 真机那一段）', () => {
    expect(
      findNovelAiPromptProblem('1girl, 她穿着黑色校服站在雨里, rain'),
    ).toMatchObject({ kind: 'cjk' })
  })

  it('拦夸张的数字权重与过深的括号', () => {
    expect(findNovelAiPromptProblem('20::denia (wuthering waves) ::')).toEqual({
      kind: 'emphasis',
      sample: '20::',
    })
    expect(findNovelAiPromptProblem('{{{{{{{masterpiece}}}}}}}')).toMatchObject(
      { kind: 'emphasis' },
    )
  })

  it('正常标签、常用权重与 Text: 之后的文字都放行', () => {
    expect(
      findNovelAiPromptProblem(
        'denia (wuthering waves), 1girl, 1.3::red eyes ::, -1::hat ::, {{smile}}, Text: 你好',
      ),
    ).toBeNull()
  })
})
