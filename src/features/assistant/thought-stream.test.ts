import { describe, expect, it } from 'vitest'

import { chatPlanThoughts, createReasoningLines } from './thought-stream'

/** 按给定分片喂一遍（最后收一次尾），收拢成「我的想法」里的几句。 */
function feed(chunks: readonly string[], maxLineChars?: number) {
  const lines = createReasoningLines(
    maxLineChars === undefined ? {} : { maxLineChars },
  )
  return [...chunks.flatMap((chunk) => lines.push(chunk)), ...lines.end()]
}

describe('原生思考摘要 → 「我的想法」里的一句一句', () => {
  it('一行一句，空行不算', () => {
    expect(feed(['先看台上那张。\n\n只动背景，', '人物不动。\n'])).toEqual([
      '先看台上那张。',
      '只动背景，人物不动。',
    ])
  })

  it('独占一行的加粗小标题和下一行并成一句（小标题照旧加粗）', () => {
    expect(
      feed([
        '**Planning the edit**\n\n',
        'One edit is enough.\n\n**Checking',
        ' the price**\nIt is on the board.',
      ]),
    ).toEqual([
      '**Planning the edit** One edit is enough.',
      '**Checking the price** It is on the board.',
    ])
  })

  it('写完一行就交，⛔ 等整段结束；半行攒着', () => {
    const lines = createReasoningLines()
    expect(lines.push('第一句\n第')).toEqual(['第一句'])
    expect(lines.push('二句')).toEqual([])
    expect(lines.push('\n')).toEqual(['第二句'])
    expect(lines.end()).toEqual([])
  })

  it('一段结束时攒着的半行和落单的小标题照样交出去', () => {
    expect(feed(['**Only a heading**'])).toEqual(['**Only a heading**'])
    expect(feed(['**A**\n**B**\n正文'])).toEqual(['**A**', '**B** 正文'])
    expect(feed(['没换行就结束了'])).toEqual(['没换行就结束了'])
  })

  it('一句太长截到上限（带省略号）', () => {
    expect(feed(['一二三四五六七\n'], 5)).toEqual(['一二三四…'])
  })

  it('什么都没有就什么都不交', () => {
    expect(feed([])).toEqual([])
    expect(feed(['', '\n\n'])).toEqual([])
  })
})

describe('没台、和角色聊的那一轮的「我的想法」= 回复前想的那一步', () => {
  it('为什么 · 心情与强度（实际刻度）· 怎么接；决定加深', () => {
    expect(
      chatPlanThoughts(
        {
          mood: '有点担心',
          intensity: 2,
          why: '他今天第三次提钱的事了',
          stance: '先接住情绪，不说教',
          reply: 'full',
        },
        'chinese',
      ),
    ).toEqual([
      '他今天第三次提钱的事了。',
      '我现在**有点担心（2/3）**。',
      '所以**先接住情绪，不说教**。',
    ])
  })

  it('平静、没写为什么、只回几个字', () => {
    expect(
      chatPlanThoughts(
        { mood: 'calm', intensity: 0, why: '', stance: '', reply: 'brief' },
        'english',
      ),
    ).toEqual([
      'I feel calm.',
      'Not in the mood to say much: **just a few words**.',
    ])
  })
})
