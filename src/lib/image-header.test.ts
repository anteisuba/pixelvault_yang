import { describe, expect, it } from 'vitest'

import { orientedSize, readImageHeader } from './image-header'

/** 3×2 的小图（一次性生成后内联，测试不依赖任何图片库）。 */
const PNG_3X2 =
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWP4z8AAQVDqPwMDAEHSBfsYFwTiAAAAAElFTkSuQmCC'
const WEBP_3X2 =
  'UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoDAAIAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA='
const GIF_3X2 = 'R0lGODlhAwACAIAAAExpcf8AACH5BAUAAAAALAAAAAADAAIAAAICjF8AOw=='

const bytes = (base64: string) => Buffer.from(base64, 'base64')

describe('readImageHeader', () => {
  it.each([
    ['png', PNG_3X2],
    ['webp', WEBP_3X2],
    ['gif', GIF_3X2],
  ])('%s 读出格式和宽高', (format, base64) => {
    expect(readImageHeader(bytes(base64))).toMatchObject({
      format,
      width: 3,
      height: 2,
    })
  })

  it('不是图回 null', () => {
    expect(readImageHeader(Buffer.from('<html>not an image</html>'))).toBeNull()
    expect(readImageHeader(new Uint8Array(0))).toBeNull()
  })
})

describe('orientedSize', () => {
  it('转向 5–8 宽高对调，其它照旧', () => {
    const header = { format: 'jpeg', width: 3, height: 2 }
    expect(orientedSize(header)).toEqual({ width: 3, height: 2 })
    expect(orientedSize({ ...header, orientation: 1 })).toEqual({
      width: 3,
      height: 2,
    })
    expect(orientedSize({ ...header, orientation: 6 })).toEqual({
      width: 2,
      height: 3,
    })
  })
})
