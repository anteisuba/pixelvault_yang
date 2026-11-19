import { describe, expect, it } from 'vitest'

import { stripLeadingMarks, templateCoverText } from '@/lib/template-cover-text'

describe('templateCoverText', () => {
  it('名字头一个字 + 提示词摘要', () => {
    expect(templateCoverText('portrait', 'soft light, film grain')).toEqual({
      initial: 'P',
      summary: 'soft light, film grain',
    })
  })

  it('首字跳过开头的标点 / 括号（真机：取到了「[」「：」）', () => {
    expect(templateCoverText('[人像] 柔光', 'x').initial).toBe('人')
    expect(templateCoverText('：雨夜', 'x').initial).toBe('雨')
    expect(templateCoverText('「赛博」', 'x').initial).toBe('赛')
    expect(templateCoverText('(beta) tags', 'x').initial).toBe('B')
  })

  it('摘要跳过开头的标点 / 列表符号（真机：以「： - 像用…」开头）', () => {
    expect(templateCoverText('x', '： - 像用胶片拍的').summary).toBe(
      '像用胶片拍的',
    )
    expect(templateCoverText('x', '\n- • 1. soft light').summary).toBe(
      'soft light',
    )
    expect(templateCoverText('x', '【风格】水彩').summary).toBe('风格】水彩')
  })

  it('数字开头的正文不当列表符号吃掉', () => {
    expect(stripLeadingMarks('1girl, solo')).toBe('1girl, solo')
    expect(stripLeadingMarks('3D render')).toBe('3D render')
  })

  it('emoji 开头的名字保留 emoji 作首字', () => {
    expect(templateCoverText('🌙 夜景', 'x').initial).toBe('🌙')
  })

  it('名字全是标点就退到提示词头一个字；都空给空串（调用方退回图标）', () => {
    expect(templateCoverText('——', '：月光').initial).toBe('月')
    expect(templateCoverText('  ', '  ')).toEqual({ initial: '', summary: '' })
  })
})
