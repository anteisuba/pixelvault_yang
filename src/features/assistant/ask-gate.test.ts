import { describe, expect, it } from 'vitest'

import {
  FINDS_SHOWN,
  FINDS_SHOWN_REFUSAL,
  findsShownRefusal,
  isAllowedInAskOnlyTurn,
  wantsAskOnlyTurn,
  wantsNoGenerateTurn,
} from '@/features/assistant/ask-gate'

describe('wantsNoGenerateTurn（11-17 真机：说了先别出图还弹确认卡）', () => {
  it('真机那一句：先别出图 → 这一轮不许 generate', () => {
    expect(
      wantsNoGenerateTurn(
        '把工作台的提示词换成：一只橘猫趴在窗台上，午后阳光。比例改成 16:9。先别出图，告诉我这样出一张要多少钱。',
      ),
    ).toBe(true)
  })

  it.each([
    '先不要生成',
    '改好就行，别生成。',
    '暂时不用出图',
    "don't generate yet",
    'Do not generate it.',
    'まだ生成しないで',
  ])('明说别出：%s', (text) => expect(wantsNoGenerateTurn(text)).toBe(true))

  it.each([
    '不要生成文字，画面里别有字',
    '别画眼镜',
    '出一张看看',
    '别出图太暗了，亮一点再出',
    "don't generate text in the picture",
  ])('说的是画面内容或要出图，不闸：%s', (text) =>
    expect(wantsNoGenerateTurn(text)).toBe(false),
  )

  it('附件行里的字不算创作者的话', () => {
    expect(wantsNoGenerateTurn('出一张 [attached: 先别出图.png]')).toBe(false)
  })
})

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

describe('findsShownRefusal（11-18：摆出来就等她挑，不再切 toolChoice）', () => {
  it('上一步摆出了找到的 → 这一步的调用一律拒，拒的理由叫它说挑哪几张', () => {
    expect(findsShownRefusal(true)).toBe(FINDS_SHOWN_REFUSAL)
    expect(FINDS_SHOWN_REFUSAL.startsWith('Refused:')).toBe(true)
    expect(findsShownRefusal(false)).toBeNull()
  })

  it('结果里那句不再说「不能调工具」（那是 toolChoice 的说法），改成「等她挑、别调工具」', () => {
    expect(FINDS_SHOWN).not.toContain('cannot call tools')
    expect(FINDS_SHOWN).toContain('wait for them to pick')
    expect(FINDS_SHOWN).toContain('call no tools')
  })
})
