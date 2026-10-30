import { afterEach, describe, expect, it } from 'vitest'

import { scanScreen, screenItemProps } from './assistant-screen-scan'

/** 摆一格：jsdom 不排版，位置由测试给。 */
function tile(
  props: Record<string, string>,
  rect: { left: number; top: number; width: number; height: number },
): HTMLElement {
  const element = document.createElement('div')
  for (const [key, value] of Object.entries(props))
    element.setAttribute(key, value)
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect
  document.body.appendChild(element)
  return element
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('看屏：扫你眼前那一屏（10-30）', () => {
  it('没名字的格子不挂属性；只认 http(s) 的缩略图', () => {
    expect(screenItemProps('gallery', null, 'https://a/x.jpg')).toEqual({})
    expect(screenItemProps('gallery', 'g1', '/api/proxy?x')).toEqual({
      'data-screen-kind': 'gallery',
      'data-screen-name': 'g1',
    })
    expect(screenItemProps('gallery', 'g1', 'https://cdn/x.jpg')).toEqual({
      'data-screen-kind': 'gallery',
      'data-screen-name': 'g1',
      'data-screen-thumb': 'https://cdn/x.jpg',
    })
  })

  it('只收视口里的，按排从上到下、从左到右排号，带位置比例', () => {
    window.innerWidth = 1000
    window.innerHeight = 800
    // 瀑布流：同一排上沿错开几像素也算同一排。
    tile(screenItemProps('gallery', 'right', 'https://cdn/r.jpg'), {
      left: 500,
      top: 10,
      width: 400,
      height: 300,
    })
    tile(screenItemProps('gallery', 'left', 'https://cdn/l.jpg'), {
      left: 0,
      top: 0,
      width: 400,
      height: 300,
    })
    tile(screenItemProps('gallery', 'below'), {
      left: 0,
      top: 400,
      width: 400,
      height: 300,
    })
    // 滚出去的、藏起来的、露出不到一半的都不算。
    tile(screenItemProps('gallery', 'gone'), {
      left: 0,
      top: 900,
      width: 400,
      height: 300,
    })
    tile(screenItemProps('gallery', 'hidden'), {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    })
    tile(screenItemProps('gallery', 'peek'), {
      left: 500,
      top: 700,
      width: 400,
      height: 400,
    })
    // 别的类（底下台上的格子）不混进来。
    tile(screenItemProps('picture', '图_1'), {
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    })

    const screen = scanScreen('gallery')
    expect(screen?.visible).toEqual(['left', 'right', 'below'])
    expect(screen?.tiles[0]).toEqual({
      thumb: 'https://cdn/l.jpg',
      box: [0, 0, 0.4, 0.375],
    })
    expect(screen?.tiles[2]).toEqual({ box: [0, 0.5, 0.4, 0.375] })
    expect(screen?.viewport).toEqual({ width: 1000, height: 800 })
  })

  it('屏上一格都没有：回 null', () => {
    expect(scanScreen('voice')).toBeNull()
  })
})
