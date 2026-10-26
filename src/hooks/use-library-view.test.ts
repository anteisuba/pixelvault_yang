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
