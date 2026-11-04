/**
 * L2b：素材选择弹窗连真 picker、真 `useIsMobile`（按视口宽度），只假网络。
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeServer, message, renderWithApp } from '@/test/app-harness'
import {
  fakeAssetLibraryRoutes,
  stubBrowserObservers,
} from '@/test/fake-routes'
import { DESKTOP_WIDTH, PHONE_WIDTH, setViewport } from '@/test/viewport'
import { AssetSelectorDialog } from './AssetSelectorDialog'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: 'user-1', isSignedIn: true, isLoaded: true }),
}))

beforeEach(() => {
  stubBrowserObservers()
  setViewport(DESKTOP_WIDTH)
  fakeAssetLibraryRoutes(fakeServer())
})

afterEach(() => vi.unstubAllGlobals())

function renderDialog(onOpenChange = vi.fn()) {
  renderWithApp(
    <AssetSelectorDialog
      open
      onOpenChange={onOpenChange}
      onSelect={vi.fn()}
      title="Pick asset"
      description="Choose one asset"
      mediaType="image"
    />,
  )
  return onOpenChange
}

const lockBadge = () =>
  message('AssetsPage.pickerLocked').replace(
    '{type}',
    message('AssetsPage.sidebarImages'),
  )

describe('AssetSelectorDialog', () => {
  it('桌面走挑选框（正中 1000 × 680、圆角 24），里面是锁成图片的 picker', async () => {
    renderDialog()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('data-slot', 'dialog-content')
    expect(dialog).toHaveClass('library-picker-size', 'rounded-24')
    expect(within(dialog).getByText(lockBadge())).toBeInTheDocument()
    await waitFor(() =>
      expect(within(dialog).queryByRole('status')).not.toBeInTheDocument(),
    )
  })

  it('手机走抽屉，正文贴边', async () => {
    setViewport(PHONE_WIDTH)
    renderDialog()

    const dialog = await waitFor(() => {
      const node = screen.getByRole('dialog')
      expect(node).toHaveClass('max-h-[95svh]', 'h-[min(88svh,760px)]')
      return node
    })
    const header = within(dialog).getByRole('banner')
    expect(header.closest('.px-0.pt-0')).not.toBeNull()
  })

  it.each([
    ['desktop', DESKTOP_WIDTH],
    ['mobile', PHONE_WIDTH],
  ])('关闭只交给 picker 标题栏那一颗（%s）', async (_, width) => {
    setViewport(width)
    const onOpenChange = renderDialog()

    const dialog = screen.getByRole('dialog')
    const close = within(dialog).getAllByRole('button', {
      name: message('Common.close'),
    })
    expect(close).toHaveLength(1)
    fireEvent.click(close[0]!)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
