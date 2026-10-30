import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  readLibraryView,
  setLibraryViewCategory,
  useReportLibraryItem,
} from './use-library-view'

afterEach(() => setLibraryViewCategory(null))

describe('库开着、在看哪一样（10-26）', () => {
  it('库没开：点开了也不报', () => {
    renderHook(() => useReportLibraryItem({ kind: 'character', name: 'Denia' }))
    expect(readLibraryView()).toBeNull()
  })

  it('「我的主页」不算库', () => {
    setLibraryViewCategory('profile')
    expect(readLibraryView()).toBeNull()
  })

  it('开着库：报库，点开了谁一并报；收起详情就收回', () => {
    setLibraryViewCategory('cards')
    expect(readLibraryView()).toEqual({ library: 'cards' })
    const { rerender, unmount } = renderHook(
      ({ name }: { name: string | null }) =>
        useReportLibraryItem(name ? { kind: 'character', name } : null),
      { initialProps: { name: 'Denia' as string | null } },
    )
    expect(readLibraryView()).toEqual({
      library: 'cards',
      item: { kind: 'character', name: 'Denia' },
    })
    rerender({ name: 'Aemeath' })
    expect(readLibraryView()?.item?.name).toBe('Aemeath')
    rerender({ name: null })
    expect(readLibraryView()).toEqual({ library: 'cards' })
    act(() => unmount())
  })

  it('换类时新页先报、叠层后到：新页报的那一样不被清掉', () => {
    setLibraryViewCategory('cards')
    renderHook(() => useReportLibraryItem({ kind: 'tag', name: 'smile' }))
    setLibraryViewCategory('tags')
    expect(readLibraryView()).toEqual({
      library: 'tags',
      item: { kind: 'tag', name: 'smile' },
    })
  })
})

describe('看屏：报屏以扫到的那一屏为准（10-30）', () => {
  it('页面报的范围留着，屏上那几样换成视口里真看得见的', () => {
    window.innerWidth = 1000
    window.innerHeight = 800
    const element = document.createElement('div')
    element.setAttribute('data-screen-kind', 'gallery')
    element.setAttribute('data-screen-name', 'g9')
    element.setAttribute('data-screen-thumb', 'https://cdn/9.jpg')
    element.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    document.body.appendChild(element)
    setLibraryViewCategory('gallery')
    expect(readLibraryView()?.screen).toEqual({
      kind: 'gallery',
      visible: ['g9'],
      tiles: [{ thumb: 'https://cdn/9.jpg', box: [0, 0, 0.2, 0.25] }],
      viewport: { width: 1000, height: 800 },
    })
    // 换到别的库：画廊那几格对不上，不报。
    setLibraryViewCategory('voices')
    expect(readLibraryView()?.screen).toBeUndefined()
    element.remove()
  })
})
