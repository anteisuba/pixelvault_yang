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

  it('拦 @ImageN 与夹在标签串里的整句（V4.5 默认口径）', () => {
    expect(
      findNovelAiPromptProblem('1girl, beach, Use @Image1 for identity'),
    ).toMatchObject({ kind: 'mention' })
    expect(
      findNovelAiPromptProblem(
        '1girl, create a single full-body seaside sunset scene, not a sheet',
      ),
    ).toMatchObject({ kind: 'sentence' })
    expect(
      findNovelAiPromptProblem(
        '1girl, long hair, black knee-high lace-up boots',
      ),
    ).toBeNull()
  })

  it('V5 放行 1–2 句短英文动作/构图句，但仍拦整段长作文与 CJK / @ImageN', () => {
    const v5 = { modelId: 'nai-diffusion-5-full' }
    expect(
      findNovelAiPromptProblem(
        '1girl, solo, firefly (honkai: star rail), She leans by a rain-streaked night train window while a glowing green butterfly hovers above her palm.',
        v5,
      ),
    ).toBeNull()
    expect(
      findNovelAiPromptProblem(
        '1girl, solo, ' + Array.from({ length: 35 }, () => 'word').join(' '),
        v5,
      ),
    ).toMatchObject({ kind: 'sentence' })
    expect(
      findNovelAiPromptProblem(
        '1girl, She sits by the rain-streaked night train window gazing outside, A glowing green butterfly hovers softly above her outstretched hand, Warm amber lamp light reflects off the wet glass pane, The starry Milky Way stretches across the deep night sky',
        v5,
      ),
    ).toMatchObject({ kind: 'sentence' })
    expect(
      findNovelAiPromptProblem('1girl, 她靠在列车窗边看着星空', v5),
    ).toMatchObject({ kind: 'cjk' })
  })
})
