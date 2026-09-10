import { describe, expect, it } from 'vitest'

import { applyTextMarkdownFormat, textNodeFileName } from './text-markdown'

describe('applyTextMarkdownFormat · 行首标记', () => {
  it('给光标所在行加标题号，再按一次撤掉', () => {
    const once = applyTextMarkdownFormat(
      '开场\n第二段',
      { start: 1, end: 1 },
      'h2',
    )
    expect(once.value).toBe('## 开场\n第二段')
    const twice = applyTextMarkdownFormat(once.value, once.selection, 'h2')
    expect(twice.value).toBe('开场\n第二段')
  })

  it('换档时替换旧前缀，⛔ 不叠第二层', () => {
    const result = applyTextMarkdownFormat('# 开场', { start: 0, end: 5 }, 'h3')
    expect(result.value).toBe('### 开场')
  })

  it('有序列表按行递增', () => {
    const result = applyTextMarkdownFormat(
      '甲\n乙\n丙',
      { start: 0, end: 5 },
      'numbered',
    )
    expect(result.value).toBe('1. 甲\n2. 乙\n3. 丙')
  })

  it('无序列表作用在选区碰到的每一行', () => {
    const result = applyTextMarkdownFormat(
      '甲\n乙',
      { start: 0, end: 3 },
      'bulleted',
    )
    expect(result.value).toBe('- 甲\n- 乙')
  })
})

describe('applyTextMarkdownFormat · 包裹标记', () => {
  it('包住选区并把选区留在标记之内', () => {
    const result = applyTextMarkdownFormat(
      '夜色很深',
      { start: 0, end: 2 },
      'bold',
    )
    expect(result.value).toBe('**夜色**很深')
    expect(
      result.value.slice(result.selection.start, result.selection.end),
    ).toBe('夜色')
  })

  it('没有选区时插一对空标记，光标落中间', () => {
    const result = applyTextMarkdownFormat(
      '夜色',
      { start: 2, end: 2 },
      'italic',
    )
    expect(result.value).toBe('夜色**')
    expect(result.selection).toEqual({ start: 3, end: 3 })
  })

  it('已经包着的再按一次拆掉（标记在选区外也认）', () => {
    const outer = applyTextMarkdownFormat(
      '**夜色**很深',
      { start: 2, end: 4 },
      'bold',
    )
    expect(outer.value).toBe('夜色很深')
    expect(outer.selection).toEqual({ start: 0, end: 2 })
  })

  it('下划线走 `<u>` 而不是 Markdown（Markdown 没有这一档）', () => {
    expect(
      applyTextMarkdownFormat('夜色', { start: 0, end: 2 }, 'underline').value,
    ).toBe('<u>夜色</u>')
  })
})

describe('textNodeFileName', () => {
  it('名字.md，路径字符换成 `-`', () => {
    expect(textNodeFileName('开场 2/3')).toBe('开场 2-3.md')
  })

  it('空名字兜底', () => {
    expect(textNodeFileName('   ')).toBe('untitled.md')
  })
})
