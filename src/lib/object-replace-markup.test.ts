import { describe, expect, it } from 'vitest'

import {
  OPENAI_MARKUP_MAX_PIXELS,
  renderObjectReplaceMarkup,
} from '@/lib/object-replace-markup'

const alphaAt = (
  image: NonNullable<ReturnType<typeof renderObjectReplaceMarkup>>,
  x: number,
  y: number,
) => image.data[(y * image.width + x) * 4 + 3]

describe('renderObjectReplaceMarkup', () => {
  const box = {
    index: 3,
    instruction: 'swap the cup',
    area: { x: 0.25, y: 0.5, width: 0.5, height: 0.25 },
  }

  it('透明底 + 框边是实心红', () => {
    const image = renderObjectReplaceMarkup([box], 800, 400)!
    expect(image).toMatchObject({ width: 800, height: 400 })
    // 框外、框心都透明（标注层不能压原图内容）。
    expect(alphaAt(image, 10, 10)).toBe(0)
    expect(alphaAt(image, 400, 250)).toBe(0)
    // 左边线上（x = 200，y 在框中段）。
    const i = (250 * 800 + 201) * 4
    expect(Array.from(image.data.slice(i, i + 4))).toEqual([230, 38, 38, 255])
  })

  it('编号牌贴在框外上沿，里面有白色笔画', () => {
    const image = renderObjectReplaceMarkup([box], 800, 400)!
    let white = 0
    for (let y = 150; y < 200; y++) {
      for (let x = 200; x < 260; x++) {
        const i = (y * 800 + x) * 4
        if (image.data[i] === 255 && image.data[i + 1] === 255) white++
      }
    }
    expect(white).toBeGreaterThan(0)
  })

  it('框贴着图顶：编号牌收进框里，不画出界', () => {
    const image = renderObjectReplaceMarkup(
      [{ ...box, index: 12, area: { x: 0.9, y: 0, width: 0.1, height: 0.2 } }],
      200,
      100,
    )!
    expect(image.data.length).toBe(200 * 100 * 4)
    expect(alphaAt(image, 199, 0)).toBe(255)
  })

  it('没有一个框带位置 → null', () => {
    expect(
      renderObjectReplaceMarkup([{ index: 1, instruction: 'x' }], 100, 100),
    ).toBeNull()
  })

  it('超过官方像素上限 → null（调用方退回纯文字）', () => {
    expect(
      renderObjectReplaceMarkup([box], OPENAI_MARKUP_MAX_PIXELS + 1, 1),
    ).toBeNull()
    expect(renderObjectReplaceMarkup([box], 0, 10)).toBeNull()
  })
})
