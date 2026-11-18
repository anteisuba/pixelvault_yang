import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import type { DanbooruFavorite } from '@/types/danbooru-catalog'
import { queryClient } from '@/lib/query-client'
import { stubBrowserLayout } from '@/test/browser-stubs'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  settle,
} from '@/test/studio-harness'
import { DESKTOP_WIDTH, setViewportWidth } from '@/test/viewport'

import { StudioTagFavoritesPanel } from './StudioTagFavoritesPanel'

/**
 * 标签台「收藏」面板（11-18 工作台里开库）：真 `useDanbooruFavorites`、真工作台表单；只假网络。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-fav' }),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/studio/image/tags',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image/tags',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const P = (key: string, values?: Record<string, string | number>) =>
  text(`StudioTags.favoritesPanel.${key}`, values)
const L = (key: string) => text(`StudioTags.lookup.${key}`)
const ok = (data: unknown) => Response.json({ success: true, data })

const fav = (
  partial: Partial<DanbooruFavorite> & Pick<DanbooruFavorite, 'id' | 'name'>,
): DanbooruFavorite => ({
  kind: 'character',
  count: 100,
  work: null,
  previews: [],
  createdAt: '2026-11-01T00:00:00.000Z',
  ...partial,
})

let favorites: DanbooruFavorite[]
let failing: boolean

beforeEach(() => {
  stubBrowserLayout()
  setViewportWidth(DESKTOP_WIDTH)
  Element.prototype.scrollIntoView = vi.fn()
  queryClient.clear()
  favorites = []
  failing = false
  fakeStudioServer().on('GET', API_ENDPOINTS.DANBOORU_FAVORITES, () =>
    failing
      ? Response.json({ success: false, error: 'UPSTREAM' }, { status: 502 })
      : ok(favorites),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function renderPanel(onOpenLookup = vi.fn()) {
  const onClose = vi.fn()
  const view = renderWithStudio(
    <StudioTagFavoritesPanel onClose={onClose} onOpenLookup={onOpenLookup} />,
  )
  await settle()
  await settle()
  return { ...view, onClose, onOpenLookup }
}

describe('StudioTagFavoritesPanel', () => {
  it('按类分栏、每栏标数量；空的类不画；有样图才有图位', async () => {
    favorites = [
      fav({
        id: 'a',
        name: 'hatsune_miku',
        previews: ['https://cdn.donmai.us/p1.jpg'],
      }),
      fav({ id: 'b', name: 'snow_miku' }),
      fav({ id: 'c', kind: 'artist', name: 'mizuiro_sora' }),
    ]
    const { container } = await renderPanel()
    const characters = screen.getByRole('region', { name: L('kindCharacter') })
    expect(within(characters).getByText('2')).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: L('kindArtist') }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: L('kindWork') })).toBeNull()
    // 只有 miku 带样图。
    expect(container.querySelectorAll('img')).toHaveLength(1)
  })

  it('点一下加进整体正向标签、再点拿掉；面板不关；画师写成 artist:', async () => {
    favorites = [
      fav({ id: 'a', name: 'hatsune_miku' }),
      fav({ id: 'c', kind: 'artist', name: 'mizuiro_sora' }),
    ]
    const { studio, onClose } = await renderPanel()
    const tags = () => studio.current.state.tagChips.map((chip) => chip.text)

    const miku = screen.getByRole('button', {
      name: P('addLabel', { tag: 'hatsune miku' }),
    })
    expect(miku).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(miku)
    expect(tags()).toContain('hatsune miku')
    const added = screen.getByRole('button', {
      name: P('removeLabel', { tag: 'hatsune miku' }),
    })
    expect(added).toHaveAttribute('aria-pressed', 'true')
    expect(within(added).getByText(P('added'))).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: P('addLabel', { tag: 'artist:mizuiro sora' }),
      }),
    )
    expect(tags()[0]).toBe('artist:mizuiro sora')

    fireEvent.click(added)
    expect(tags()).not.toContain('hatsune miku')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('收起与 Esc 都关', async () => {
    favorites = [fav({ id: 'a', name: 'hatsune_miku' })]
    const { onClose } = await renderPanel()
    fireEvent.click(screen.getByRole('button', { name: P('close') }))
    fireEvent.keyDown(screen.getByRole('heading', { name: P('title') }), {
      key: 'Escape',
    })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('空态给下一步：去查资料', async () => {
    const { onOpenLookup } = await renderPanel()
    expect(screen.getByText(P('emptyTitle'))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: P('goLookup') }))
    expect(onOpenLookup).toHaveBeenCalled()
  })

  it('取失败给重试，重试成功出内容', async () => {
    failing = true
    favorites = [fav({ id: 'a', name: 'hatsune_miku' })]
    await renderPanel()
    expect(screen.getByText(P('errorTitle'))).toBeInTheDocument()
    failing = false
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: P('retry') }))
    })
    await settle()
    expect(
      screen.getByRole('button', {
        name: P('addLabel', { tag: 'hatsune miku' }),
      }),
    ).toBeInTheDocument()
  })
})
