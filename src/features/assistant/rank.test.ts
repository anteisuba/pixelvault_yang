import { describe, expect, it } from 'vitest'

import { queryWords, ranked } from './rank'

describe('查词排序', () => {
  it('空白、逗号、顿号都拆；下划线当空格', () => {
    expect(queryWords('Watercolor_(medium), 厚涂、Thick  lineart')).toEqual([
      'watercolor',
      '(medium)',
      '厚涂',
      'thick',
      'lineart',
    ])
  })

  it('任意命中就算，命中多的在前，同分保持原顺序', () => {
    const items = ['a b', 'b', 'c', 'a']
    expect(ranked(items, 'a b', (item) => [item])).toEqual(['a b', 'b', 'a'])
  })

  it('空查词 = 原顺序前几条', () => {
    expect(ranked(['x', 'y'], '  ', (item) => [item])).toEqual(['x', 'y'])
  })
})
