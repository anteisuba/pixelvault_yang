import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

import { StudioCharacterDeepLink } from './StudioCharacterDeepLink'

let query = 'character=denia&keep=1'
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(query),
}))

const replace = vi.fn()
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/studio/image',
}))

const setActiveCardIds = vi.fn()
let isLoading = false
const known = new Set(['denia'])
vi.mock('@/contexts/studio-context', () => ({
  useStudioData: () => ({
    characters: {
      isLoading,
      findCard: (id: string) => (known.has(id) ? { id } : null),
      setActiveCardIds,
    },
  }),
}))

describe('StudioCharacterDeepLink（角色页「用她」落地）', () => {
  beforeEach(() => {
    replace.mockClear()
    setActiveCardIds.mockClear()
    isLoading = false
    query = 'character=denia&keep=1'
  })

  it('选中这个角色，并从地址栏去掉 character（其余参数留着）', () => {
    render(<StudioCharacterDeepLink />)
    expect(setActiveCardIds).toHaveBeenCalledWith(['denia'])
    expect(replace).toHaveBeenCalledWith('/studio/image?keep=1')
  })

  it('角色列表还没载完先不动', () => {
    isLoading = true
    render(<StudioCharacterDeepLink />)
    expect(setActiveCardIds).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('不是自己的角色：只清参数，不选', () => {
    query = 'character=someone-else'
    render(<StudioCharacterDeepLink />)
    expect(setActiveCardIds).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('/studio/image')
  })
})
