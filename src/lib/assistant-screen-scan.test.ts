// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import {
  ASSISTANT_LIBRARY_TILE_ABOUT_LIMITS,
  AssistantLibraryViewSchema,
} from '@/types/assistant-operator'
import {
  generationScreenAbout,
  scanScreen,
  screenItemAbout,
  screenItemProps,
} from './assistant-screen-scan'

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

describe('屏上每格带一行摘要（11-17「第 4 行那张粉头发女孩」认不出）', () => {
  it('素材格子：类型 · 模型 · 时间 · 提示词前若干字跟着扫屏走', () => {
    window.innerWidth = 1000
    window.innerHeight = 800
    const prompt = `pink hair girl reading a book by the window, ${'soft light, '.repeat(40)}`
    tile(
      screenItemProps(
        'picture',
        '图_0412',
        'https://cdn/p.jpg',
        generationScreenAbout({
          outputType: 'IMAGE',
          model: 'flux-2-pro',
          prompt,
          createdAt: new Date('2026-11-15T09:30:12Z'),
        }),
      ),
      { left: 0, top: 0, width: 300, height: 300 },
    )
    const screen = scanScreen('picture')
    const about = screen?.tiles[0]?.about
    expect(about).toMatchObject({
      type: 'image',
      model: 'flux-2-pro',
      at: '2026-11-15 09:30',
    })
    expect(about?.text?.startsWith('pink hair girl reading a book')).toBe(true)
    // 体量上限：一格的提示词截到上限（素材可上千条，只有屏上那几格进请求）。
    expect(about?.text?.length).toBe(
      ASSISTANT_LIBRARY_TILE_ABOUT_LIMITS.textChars,
    )
    // 过得了请求那道 schema（一格不合规整条请求会被拒）。
    expect(
      AssistantLibraryViewSchema.safeParse({ library: 'assets', screen })
        .success,
    ).toBe(true)
  })

  it('格子上的摘要被改坏了：当没有，⛔ 拖垮整屏', () => {
    window.innerWidth = 1000
    window.innerHeight = 800
    const props = screenItemProps('picture', '图_1', undefined, {
      model: 'x',
    })
    props['data-screen-about'] = '{not json'
    tile(props, { left: 0, top: 0, width: 300, height: 300 })
    expect(scanScreen('picture')?.tiles[0]).toEqual({
      box: [0, 0, 0.3, 0.375],
    })
  })

  it('全空的摘要不挂属性', () => {
    expect(
      screenItemAbout({ type: ' ', model: null, text: '', at: 'bad date' }),
    ).toBeNull()
    expect(screenItemProps('picture', '图_1', undefined, {})).toEqual({
      'data-screen-kind': 'picture',
      'data-screen-name': '图_1',
    })
  })
})
