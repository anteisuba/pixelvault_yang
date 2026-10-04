import {
  cloneElement,
  createContext,
  useContext,
  type ReactElement,
  type ReactNode,
} from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UseStudioVideoAssetsReturn } from '@/hooks/use-studio-video-assets'

import {
  StudioMobileAddSheet,
  type StudioMobileAddRow,
} from './StudioMobileAddSheet'

/**
 * 手机输入条的「＋」（owner 2026-10-02「Claude 式最简」）。锁的是**分派**：上半截挂
 * 素材按模态换（参考图身体 / 与桌面「素材」chip 同一份菜单），下半截由宿主给的行
 * 各去各处 —— `onSelect` 收起抽屉去别处，`page` 在抽屉里推进一页。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/business/studio/ReferenceImageChip', () => ({
  ReferenceImagePickerBody: ({ headerSlot }: { headerSlot?: ReactNode }) => (
    <div data-testid="reference-picker">{headerSlot}</div>
  ),
  ReferenceImageCountLine: () => <span>count-line</span>,
  ReferenceImageLibraryDialog: () => null,
}))

vi.mock('@/components/business/studio/StudioVideoAssetChip', () => ({
  StudioVideoAssetMenu: () => <div data-testid="video-asset-menu" />,
  StudioVideoAssetLibraryDialog: () => null,
}))

// 抽屉 / 弹层的开合交给一个最小替身：开着才渲染内容，触发器点一下开。
vi.mock('@/components/business/studio-shared/primitives/tool-surface', () => {
  const SurfaceContext = createContext<{
    open: boolean
    onOpenChange: (open: boolean) => void
  }>({ open: false, onOpenChange: () => {} })
  return {
    studioToolPopoverMaxHeightClass: '',
    StudioToolSurface: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean
      onOpenChange: (open: boolean) => void
      children: ReactNode
    }) => (
      <SurfaceContext.Provider value={{ open, onOpenChange }}>
        {children}
      </SurfaceContext.Provider>
    ),
    StudioToolSurfaceTrigger: ({ children }: { children: ReactElement }) => {
      const { open, onOpenChange } = useContext(SurfaceContext)
      return cloneElement(children as ReactElement<{ onClick?: () => void }>, {
        onClick: () => onOpenChange(!open),
      })
    },
    StudioToolPopoverContent: ({ children }: { children: ReactNode }) => {
      const { open } = useContext(SurfaceContext)
      return open ? <div data-testid="add-sheet">{children}</div> : null
    },
  }
})

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
  vi.clearAllMocks()
})

function openSheet() {
  fireEvent.click(screen.getByTestId('studio-mobile-add'))
  expect(screen.getByTestId('add-sheet')).toBeInTheDocument()
}

describe('StudioMobileAddSheet', () => {
  it('上半截是参考图（报挂了几张），下半截是宿主给的那几行', () => {
    render(<StudioMobileAddSheet rows={ROWS} />)
    openSheet()

    expect(screen.getByTestId('reference-picker')).toHaveTextContent(
      'count-line',
    )
    expect(screen.queryByTestId('video-asset-menu')).toBeNull()
    expect(
      screen.getByTestId('studio-mobile-add-templates'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('studio-mobile-add-characters'),
    ).toHaveTextContent('2')
  })

  it('`onSelect` 的行：收起抽屉再去别处', () => {
    render(<StudioMobileAddSheet rows={ROWS} />)
    openSheet()
    fireEvent.click(screen.getByTestId('studio-mobile-add-templates'))
    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('add-sheet')).toBeNull()
  })

  it('`page` 的行在抽屉里推进一页，‹ 回到上一层；收起再开回到第一层', () => {
    render(<StudioMobileAddSheet rows={ROWS} />)
    openSheet()
    fireEvent.click(screen.getByTestId('studio-mobile-add-characters'))
    expect(screen.getByTestId('characters-page')).toBeInTheDocument()
    expect(screen.queryByTestId('reference-picker')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(screen.getByTestId('reference-picker')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('studio-mobile-add-characters'))
    fireEvent.click(screen.getByTestId('studio-mobile-add'))
    openSheet()
    expect(screen.getByTestId('reference-picker')).toBeInTheDocument()
  })

  it('挂了输入框里看不见的东西时「＋」变灰底', () => {
    const { rerender } = render(<StudioMobileAddSheet rows={ROWS} />)
    expect(screen.getByTestId('studio-mobile-add')).not.toHaveAttribute(
      'data-set',
    )
    rerender(<StudioMobileAddSheet rows={ROWS} hasHiddenSetting />)
    expect(screen.getByTestId('studio-mobile-add')).toHaveAttribute('data-set')
  })

  it('视频档：上半截是与桌面「素材」chip 同一份菜单', () => {
    render(
      <StudioMobileAddSheet
        rows={ROWS}
        videoAssets={{} as UseStudioVideoAssetsReturn}
      />,
    )
    openSheet()
    expect(screen.getByTestId('video-asset-menu')).toBeInTheDocument()
    expect(screen.queryByTestId('reference-picker')).toBeNull()
  })
})
