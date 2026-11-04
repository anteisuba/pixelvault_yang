import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'

import { API_ENDPOINTS } from '@/constants/config'
import {
  characterCardFixture,
  fakeStudioServer,
  renderWithStudio,
  resetCharacterCardsCache,
  settle,
} from '@/test/studio-harness'

import { StudioCharacterDeepLink } from './StudioCharacterDeepLink'

let query = 'character=denia&keep=1'
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => new URLSearchParams(query),
}))

const replace = vi.hoisted(() => vi.fn())
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/studio/image',
}))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))

const ok = (data: unknown) => Response.json({ success: true, data })

let server: ReturnType<typeof fakeStudioServer>
beforeEach(() => {
  replace.mockClear()
  query = 'character=denia&keep=1'
  resetCharacterCardsCache()
  // 只假网络：这个用户的角色列表里只有 denia。
  server = fakeStudioServer().on('GET', API_ENDPOINTS.CHARACTER_CARDS, () =>
    ok([characterCardFixture({ id: 'denia', name: 'Denia' })]),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('StudioCharacterDeepLink（角色页「用她」落地）', () => {
  it('选中这个角色，并从地址栏去掉 character（其余参数留着）', async () => {
    const { studio } = renderWithStudio(<StudioCharacterDeepLink />)
    await waitFor(() =>
      expect(studio.current.characters.activeCardIds).toEqual(['denia']),
    )
    expect(replace).toHaveBeenCalledWith('/studio/image?keep=1')
  })

  it('角色列表还没载完先不动', async () => {
    server.on('GET', API_ENDPOINTS.CHARACTER_CARDS, () => new Promise(() => {}))
    const { studio } = renderWithStudio(<StudioCharacterDeepLink />)
    await settle()
    expect(studio.current.characters.isLoading).toBe(true)
    expect(studio.current.characters.activeCardIds).toEqual([])
    expect(replace).not.toHaveBeenCalled()
  })

  it('不是自己的角色：只清参数，不选', async () => {
    query = 'character=someone-else'
    const { studio } = renderWithStudio(<StudioCharacterDeepLink />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/studio/image'))
    expect(studio.current.characters.activeCardIds).toEqual([])
  })
})
