import { describe, expect, it } from 'vitest'

import {
  isAllowedInAskOnlyTurn,
  wantsAskOnlyTurn,
} from '@/features/assistant/ask-gate'

describe('wantsAskOnlyTurn', () => {
  it('2026-11-15 真机那一句：开反问卡 → 只许问', () => {
    expect(wantsAskOnlyTurn('开反问卡，目前完全没修我想要改的地方')).toBe(true)
  })

  it.each(['先问清楚再改', '你先问我', 'ask me first', '先に聞いてから'])(
    '点名要问：%s',
    (text) => expect(wantsAskOnlyTurn(text)).toBe(true),
  )

  it.each(['别反问了直接改', '不用问我，按你想的来', "don't ask, just do it"])(
    '相反的意思不闸：%s',
    (text) => expect(wantsAskOnlyTurn(text)).toBe(false),
  )

  it('普通修改不闸', () => {
    expect(wantsAskOnlyTurn('感觉画面有点多余，还需要修一修')).toBe(false)
  })

  it('卡名 / 附件行里的字不算创作者的话', () => {
    expect(
      wantsAskOnlyTurn(
        '改一下这张 [mentioned: 「反问测试卡」 (image · canvas card) https://x/y.png]',
      ),
    ).toBe(false)
  })

  it('答卡时复述的题面不算（否则下一轮又被闸）', () => {
    expect(
      wantsAskOnlyTurn('已选择去掉气泡（针对问题「要我先问清楚哪里多余吗」）'),
    ).toBe(false)
  })
})

describe('isAllowedInAskOnlyTurn', () => {
  it('只开 find / look / ask', () => {
    expect(['find', 'look', 'ask'].every(isAllowedInAskOnlyTurn)).toBe(true)
    expect(['edit', 'generate', 'open'].some(isAllowedInAskOnlyTurn)).toBe(
      false,
    )
  })
})
