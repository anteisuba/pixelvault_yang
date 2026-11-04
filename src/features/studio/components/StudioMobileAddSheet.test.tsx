import { useLayoutEffect } from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  useStudioVideoAssets,
  type UseStudioVideoAssetsReturn,
} from '@/hooks/use-studio-video-assets'
import { text } from '@/test/i18n-text'
import { fakeStudioServer, renderWithStudio } from '@/test/studio-harness'
import { MOBILE_WIDTH, setViewportWidth } from '@/test/viewport'

import {
  StudioMobileAddSheet,
  type StudioMobileAddRow,
} from './StudioMobileAddSheet'

/**
 * 手机输入条的「＋」（owner 2026-10-02「Claude 式最简」）。锁的是**分派**：上半截挂
 * 素材按模态换（参考图身体 / 与桌面「素材」chip 同一份菜单），下半截由宿主给的行
 * 各去各处 —— `onSelect` 收起抽屉去别处，`page` 在抽屉里推进一页。
 *
 * 全程真工作台 + 真抽屉（手机宽），上半截是真参考图身体 / 真素材菜单。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn() }),
}))

/** 参考图身体的标志：报挂了几张的那一行。 */
const REFERENCE = () => text('ImageChip.referenceLabel')
/** 素材菜单的标志：第一项「上传图片」。 */
const VIDEO_MENU = () => text('StudioVideoSlots.uploadImage')

const mockSelect = vi.fn()
const ROWS: StudioMobileAddRow[] = [
  { key: 'templates', icon: null, label: 'templates', onSelect: mockSelect },
  {
    key: 'characters',
    icon: null,
    label: 'characters',
    detail: '2',
    page: <div data-testid="characters-page" />,
  },
]

beforeEach(() => {
  mockSelect.mockClear()
  setViewportWidth(MOBILE_WIDTH, { touch: true })
  fakeStudioServer()
})
afterEach(() => vi.unstubAllGlobals())

async function openSheet() {
  fireEvent.click(screen.getByTestId('studio-mobile-add'))
  await waitFor(() => expect(sheetOpen()).toBe(true))
}

/** vaul 收起时有退场动画、节点会多留一会儿：看 data-state，不看节点在不在。 */
const sheetOpen = () =>
  screen.queryByRole('dialog')?.getAttribute('data-state') === 'open'

/** 视频档宿主：真 `useStudioVideoAssets()` 那一份交给「＋」。 */
function VideoHost({
  onAssets,
}: {
  onAssets?: (assets: UseStudioVideoAssetsReturn) => void
}) {
  const assets = useStudioVideoAssets()
  useLayoutEffect(() => onAssets?.(assets))
  return <StudioMobileAddSheet rows={ROWS} videoAssets={assets} />
}

describe('StudioMobileAddSheet', () => {
  it('上半截是参考图（报挂了几张），下半截是宿主给的那几行', async () => {
    renderWithStudio(<StudioMobileAddSheet rows={ROWS} />)
    await openSheet()

    expect(screen.getByText(REFERENCE())).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: new RegExp(VIDEO_MENU()) }),
    ).toBeNull()
    expect(
      screen.getByTestId('studio-mobile-add-templates'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('studio-mobile-add-characters'),
    ).toHaveTextContent('2')
  })

  it('`onSelect` 的行：收起抽屉再去别处', async () => {
    renderWithStudio(<StudioMobileAddSheet rows={ROWS} />)
    await openSheet()
    fireEvent.click(screen.getByTestId('studio-mobile-add-templates'))
    expect(mockSelect).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(sheetOpen()).toBe(false))
  })

  it('`page` 的行在抽屉里推进一页，‹ 回到上一层；收起再开回到第一层', async () => {
    renderWithStudio(<StudioMobileAddSheet rows={ROWS} />)
    await openSheet()
    fireEvent.click(screen.getByTestId('studio-mobile-add-characters'))
    expect(screen.getByTestId('characters-page')).toBeInTheDocument()
    expect(screen.queryByText(REFERENCE())).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: text('StudioMobile.back') }),
    )
    expect(screen.getByText(REFERENCE())).toBeInTheDocument()

    // 推进一页后收起，再开回到第一层。
    fireEvent.click(screen.getByTestId('studio-mobile-add-characters'))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(sheetOpen()).toBe(false))
    await openSheet()
    expect(screen.getByText(REFERENCE())).toBeInTheDocument()
  })

  it('挂了输入框里看不见的东西时「＋」变灰底', () => {
    const { rerender } = renderWithStudio(<StudioMobileAddSheet rows={ROWS} />)
    expect(screen.getByTestId('studio-mobile-add')).not.toHaveAttribute(
      'data-set',
    )
    rerender(<StudioMobileAddSheet rows={ROWS} hasHiddenSetting />)
    expect(screen.getByTestId('studio-mobile-add')).toHaveAttribute('data-set')
  })

  it('视频档：上半截是与桌面「素材」chip 同一份菜单', async () => {
    renderWithStudio(<VideoHost />)
    await openSheet()
    expect(
      screen.getByRole('button', { name: new RegExp(VIDEO_MENU()) }),
    ).toBeInTheDocument()
    expect(screen.queryByText(REFERENCE())).toBeNull()
  })
})
