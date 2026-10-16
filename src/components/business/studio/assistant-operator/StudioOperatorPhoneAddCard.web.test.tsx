import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * 手机助手输入栏的 ＋ 小卡片（iOS 稿 v16）：四行各落到面板原有的
 * 通道（素材库 / 上传 / 拍照 / @）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

/** 弹层原语换成直通，同思考 chip 的测试。 */
vi.mock('@/components/ui/responsive-popover', async () => {
  const React = await import('react')
  const Ctx = React.createContext<{
    open: boolean
    setOpen(next: boolean): void
  }>({ open: false, setOpen: () => {} })
  return {
    ResponsivePopover: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean
      onOpenChange(next: boolean): void
      children: React.ReactNode
    }) => (
      <Ctx.Provider value={{ open, setOpen: onOpenChange }}>
        {children}
      </Ctx.Provider>
    ),
    ResponsivePopoverTrigger: ({
      children,
    }: {
      children: React.ReactElement<{ onClick?: () => void }>
    }) => {
      const { open, setOpen } = React.useContext(Ctx)
      return React.cloneElement(children, { onClick: () => setOpen(!open) })
    },
    ResponsivePopoverContent: ({ children }: { children: React.ReactNode }) => {
      const { open } = React.useContext(Ctx)
      return open ? <div>{children}</div> : null
    },
  }
})

const galleryState = vi.hoisted(() => ({
  generations: [] as { id: string; url: string; prompt: string }[],
  hasLoaded: true,
}))
vi.mock('@/hooks/use-gallery', () => ({
  useGallery: () => galleryState,
}))
vi.mock('@clerk/nextjs', () => ({ useAuth: () => ({ userId: 'u1' }) }))
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span data-alt={alt} />,
}))

import { StudioOperatorPhoneAddCard } from './StudioOperatorPhoneAddCard'

function setup() {
  const props = {
    onPickLibrary: vi.fn(),
    onPickRecent: vi.fn(),
    onPickFile: vi.fn(),
    onCameraFiles: vi.fn(),
    onMention: vi.fn(),
  }
  render(<StudioOperatorPhoneAddCard {...props} />)
  return props
}

function openAndPick(id: string) {
  fireEvent.click(screen.getByTestId('operator-phone-add'))
  fireEvent.click(screen.getByTestId(`operator-phone-add-${id}`))
}

describe('StudioOperatorPhoneAddCard', () => {
  it('lists the four rows only after ＋ is tapped', () => {
    setup()
    expect(screen.queryByTestId('operator-phone-add-menu')).toBeNull()
    fireEvent.click(screen.getByTestId('operator-phone-add'))
    for (const id of ['library', 'camera', 'upload', 'mention']) {
      expect(screen.getByTestId(`operator-phone-add-${id}`)).toBeTruthy()
    }
  })

  it('closes the card, then runs the picked action', async () => {
    const props = setup()
    openAndPick('library')
    expect(screen.queryByTestId('operator-phone-add-menu')).toBeNull()
    await waitFor(() => expect(props.onPickLibrary).toHaveBeenCalledTimes(1))

    openAndPick('upload')
    await waitFor(() => expect(props.onPickFile).toHaveBeenCalledTimes(1))

    openAndPick('mention')
    await waitFor(() => expect(props.onMention).toHaveBeenCalledTimes(1))
  })

  it('shows the three latest assets plus 全部, and picks one', async () => {
    galleryState.generations = ['a', 'b', 'c', 'd'].map((id) => ({
      id,
      url: `https://cdn.example/${id}.png`,
      prompt: id,
    }))
    const props = setup()
    fireEvent.click(screen.getByTestId('operator-phone-add'))
    expect(screen.getByTestId('operator-phone-add-recent-c')).toBeTruthy()
    expect(screen.queryByTestId('operator-phone-add-recent-d')).toBeNull()
    fireEvent.click(screen.getByTestId('operator-phone-add-recent-b'))
    await waitFor(() =>
      expect(props.onPickRecent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'b' }),
      ),
    )
    openAndPick('recent-all')
    await waitFor(() => expect(props.onPickLibrary).toHaveBeenCalledTimes(1))
    galleryState.generations = []
  })

  it('hides the recent row when there are no assets', () => {
    setup()
    fireEvent.click(screen.getByTestId('operator-phone-add'))
    expect(screen.queryByTestId('operator-phone-add-recent')).toBeNull()
  })

  it('hands camera shots to the same upload path', () => {
    const props = setup()
    const input = screen.getByTestId(
      'operator-phone-camera-input',
    ) as HTMLInputElement
    expect(input.getAttribute('capture')).toBe('environment')
    const file = new File(['x'], 'shot.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(props.onCameraFiles).toHaveBeenCalledWith([file])
  })
})
