import { describe, expect, it } from 'vitest'

import {
  deleteTagBefore,
  normalizeTagTextInput,
  replaceTagAt,
  stepTagWeightAt,
  tagQueryAt,
  tagRangeAt,
} from './tag-text-editing'

describe('tagRangeAt', () => {
  it('找光标所在的那一个标签，去掉两头空白', () => {
    const text = '1girl, neon city, rain'
    expect(tagRangeAt(text, 10)).toEqual({ start: 7, end: 16 })
    // 光标正好在逗号前：算左边那一个。
    expect(tagRangeAt(text, 5)).toEqual({ start: 0, end: 5 })
  })

  it('空段上回 null', () => {
    expect(tagRangeAt('1girl, ', 7)).toBeNull()
  })

  it('数值组里的逗号不切', () => {
    const text = '1.5::rain, night::, city'
    expect(tagRangeAt(text, 3)).toEqual({ start: 0, end: 18 })
  })
})

describe('tagQueryAt', () => {
  it('取光标前那半截', () => {
    expect(tagQueryAt('1girl, neon ci', 14)).toBe('neon ci')
    expect(tagQueryAt('1girl, neon city', 9)).toBe('ne')
    expect(tagQueryAt('1girl, ', 7)).toBe('')
  })
})

describe('deleteTagBefore（⌥⌫）', () => {
  it('删光标所在的整个标签，连同前面的逗号', () => {
    expect(deleteTagBefore('1girl, neon city, rain', 16)).toEqual({
      text: '1girl, rain',
      selection: { start: 5, end: 5 },
    })
  })

  it('刚打完逗号：删前面那一个', () => {
    expect(deleteTagBefore('1girl, rain, ', 13)?.text).toBe('1girl, ')
  })

  it('第一个标签：连同后面的逗号与空格', () => {
    expect(deleteTagBefore('1girl, rain', 5)).toEqual({
      text: 'rain',
      selection: { start: 0, end: 0 },
    })
  })

  it('前面没有标签回 null', () => {
    expect(deleteTagBefore('', 0)).toBeNull()
    expect(deleteTagBefore('  ', 2)).toBeNull()
  })
})

describe('stepTagWeightAt（⌘↑ / ⌘↓）', () => {
  it('±0.05，写回成 tag:1.05', () => {
    expect(stepTagWeightAt('1girl, rain', 9, 0.05)).toEqual({
      text: '1girl, rain:1.05',
      selection: { start: 16, end: 16 },
    })
    expect(stepTagWeightAt('rain:1.2', 2, -0.05)?.text).toBe('rain:1.15')
  })

  it('回到 1 就去掉后缀', () => {
    expect(stepTagWeightAt('rain:1.05', 2, -0.05)?.text).toBe('rain')
  })

  it('到了边界不动、空段不动', () => {
    expect(stepTagWeightAt('rain:2', 2, 0.05)).toBeNull()
    expect(stepTagWeightAt('rain, ', 6, 0.05)).toBeNull()
  })
})

describe('replaceTagAt（补全选中）', () => {
  it('换掉打了一半的那段，后面补 `, `', () => {
    expect(replaceTagAt('1girl, neon ci', 14, 'neon city')).toEqual({
      text: '1girl, neon city, ',
      selection: { start: 18, end: 18 },
    })
  })

  it('改中间那一个：不多补逗号，光标落到下一个的开头', () => {
    expect(replaceTagAt('1gi, rain', 3, '1girl')).toEqual({
      text: '1girl, rain',
      selection: { start: 7, end: 7 },
    })
  })

  // 同一个词送两遍在扩散模型里等于被悄悄加权。
  it('别处已经有这个词：只拿掉打了一半的', () => {
    expect(replaceTagAt('1girl, rain, 1GI', 16, '1girl').text).toBe(
      '1girl, rain',
    )
  })
})

it('换行一律当逗号', () => {
  expect(normalizeTagTextInput('1girl\nrain\r\n city')).toBe(
    '1girl, rain, city',
  )
})
