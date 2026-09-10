import { describe, expect, it } from 'vitest'

import { mentionDeletionRangeAt, parseMentions } from './parse-mentions'

describe('parseMentions', () => {
  it('无 @ 时整段就是一段文字', () => {
    expect(parseMentions('站台，中景，冷白光')).toEqual([
      { type: 'text', value: '站台，中景，冷白光' },
    ])
  })

  it('已知名字表走最长匹配，名字里的空格不再被切断', () => {
    const segments = parseMentions('从 @首帧 S02 站台图 起，镜头推近', {
      names: ['S02 站台图', 'S02'],
    })
    const mention = segments.find((s) => s.type === 'mention')
    expect(mention).toMatchObject({
      name: 'S02 站台图',
      role: 'firstFrame',
      explicitRole: true,
      raw: '@首帧 S02 站台图',
    })
  })

  it('无前缀 = 参考，且不标成显式角色', () => {
    const [, mention] = parseMentions('灯光把影子拉到 @莫宁 站的那一端', {
      names: ['莫宁'],
    })
    expect(mention).toMatchObject({
      type: 'mention',
      name: '莫宁',
      role: 'reference',
      explicitRole: false,
    })
  })

  it('三语前缀都认（同一段文字在任何界面语言下解析一致）', () => {
    for (const [raw, role] of [
      ['@语音 旁白', 'voice'],
      ['@音声 旁白', 'voice'],
      ['@voice 旁白', 'voice'],
      ['@尾帧 旁白', 'lastFrame'],
    ] as const) {
      const [mention] = parseMentions(raw, { names: ['旁白'] })
      expect(mention).toMatchObject({ role })
    }
  })

  it('没有名字表时退回「空白/标点终止」的宽松档', () => {
    const segments = parseMentions('参考 @风格·夜车，再来一版')
    expect(segments.find((s) => s.type === 'mention')).toMatchObject({
      name: '风格·夜车',
    })
  })

  it('名字表给了但没命中就当普通文字，⛔ 不吞半句话', () => {
    expect(parseMentions('邮箱 a@b.com', { names: ['莫宁'] })).toEqual([
      { type: 'text', value: '邮箱 a@b.com' },
    ])
  })

  it('mentionDeletionRangeAt 只在光标贴着 mention 尾部时给出整体删除区间', () => {
    const text = '看 @莫宁 一眼'
    expect(mentionDeletionRangeAt(text, 5, { names: ['莫宁'] })).toEqual({
      start: 2,
      end: 5,
    })
    expect(mentionDeletionRangeAt(text, 4, { names: ['莫宁'] })).toBeNull()
  })
})
