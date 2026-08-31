// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`
//   （加包之前先翻已有依赖）。这几下都是单纯的点击，两者等价。
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StudioOperatorAttachMenu } from './StudioOperatorAttachMenu'

const defaultProps = {
  onAttach: vi.fn(),
  onDismiss: vi.fn(),
  onUploadFiles: vi.fn(),
  triggerRef: { current: null },
}

/**
 * 拍板 20 的回归闸：📎 面板的「打开完整素材库」**就地开弹层，不跳页**。
 *
 * ⚠ 这条最容易以「三绿而功能没了」的方式回退 —— 把 `<button>` 换回
 * `<Link href={ROUTES.ASSETS}>` 编译期一个字都不红，只有真机点下去才发现整个
 * 工作台没了。所以这里同时钉住**没有指向 /assets 的链接**这一面。
 */

const mockFetchGalleryImages = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/lib/api-client/gallery', () => ({
  fetchGalleryImages: mockFetchGalleryImages,
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

vi.mock('@/components/ui/spinner', () => ({
  Spinner: () => <span data-testid="spinner" />,
}))

interface DialogMockProps {
  open: boolean
  onSelect?: (generation: unknown) => void
}

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: ({ open, onSelect }: DialogMockProps) =>
    open ? (
      <div data-testid="asset-selector-dialog" data-slot="dialog-content">
        <button
          type="button"
          onClick={() =>
            onSelect?.({
              id: 'gen-video',
              url: 'https://cdn.example.com/clip.mp4',
              thumbnailUrl: null,
              prompt: '借伞 30 秒',
              model: 'seedance',
              outputType: 'VIDEO',
            })
          }
        >
          pick-video
        </button>
      </div>
    ) : null,
}))

function galleryResponse() {
  return {
    success: true,
    data: {
      generations: [
        {
          id: 'gen-image',
          url: 'https://cdn.example.com/a.png',
          thumbnailUrl: null,
          prompt: '角色立绘',
          model: 'seedream',
          outputType: 'IMAGE',
        },
      ],
      page: 1,
      limit: 6,
      total: 1,
      hasMore: false,
      nextCursor: null,
    },
  }
}

function KeyboardDismissHarness({ onDismiss }: { onDismiss(): void }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <div>
      {open ? (
        <StudioOperatorAttachMenu
          {...defaultProps}
          triggerRef={triggerRef}
          onDismiss={() => {
            onDismiss()
            setOpen(false)
          }}
        />
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        data-operator-attach-trigger
        onClick={() => setOpen(true)}
      >
        trigger
      </button>
    </div>
  )
}

describe('StudioOperatorAttachMenu · 拍板 20 就地素材库弹层', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchGalleryImages.mockResolvedValue(galleryResponse())
  })

  it('「打开完整素材库」是就地弹层，不是跳去 /assets 的链接', async () => {
    render(<StudioOperatorAttachMenu {...defaultProps} />)

    const trigger = await screen.findByTestId('operator-attach-open-library')
    // ⛔ 任何 <a href> 都算跳页 —— 这就是 owner 真机点验时打回的那个形态。
    expect(document.querySelectorAll('a[href]')).toHaveLength(0)
    expect(screen.queryByTestId('asset-selector-dialog')).toBeNull()

    fireEvent.click(trigger)
    expect(screen.getByTestId('asset-selector-dialog')).toBeTruthy()
  })

  it('弹层里选中 = 挂载为附件（与 6 格「点即挂」同一语义），且视频不拿 url 当缩略图', async () => {
    const onAttach = vi.fn()
    render(<StudioOperatorAttachMenu {...defaultProps} onAttach={onAttach} />)

    fireEvent.click(await screen.findByTestId('operator-attach-open-library'))
    fireEvent.click(screen.getByText('pick-video'))

    expect(onAttach).toHaveBeenCalledTimes(1)
    expect(onAttach.mock.calls[0]?.[0]).toEqual({
      id: 'gen-video',
      url: 'https://cdn.example.com/clip.mp4',
      label: '借伞 30 秒',
      kind: 'video',
    })
    // 视频没有缩略图时**不给** thumbnailUrl —— 回落到 url 会让 next/image 碎掉。
    expect(onAttach.mock.calls[0]?.[0]).not.toHaveProperty('thumbnailUrl')
  })

  it('6 格瓦片点一下就挂（图片自己当缩略图）', async () => {
    const onAttach = vi.fn()
    render(<StudioOperatorAttachMenu {...defaultProps} onAttach={onAttach} />)

    const tiles = await screen.findAllByTestId('operator-attach-tile')
    fireEvent.click(tiles[0]!)

    await waitFor(() => expect(onAttach).toHaveBeenCalledTimes(1))
    expect(onAttach.mock.calls[0]?.[0]).toEqual({
      id: 'gen-image',
      url: 'https://cdn.example.com/a.png',
      label: '角色立绘',
      kind: 'image',
      thumbnailUrl: 'https://cdn.example.com/a.png',
    })
  })

  it('点击附件面板外会收起，面板内部与素材库弹层内部不会误关', async () => {
    const onDismiss = vi.fn()
    render(
      <div>
        <button
          type="button"
          data-testid="trigger"
          data-operator-attach-trigger
        >
          trigger
        </button>
        <button type="button" data-testid="outside">
          outside
        </button>
        <StudioOperatorAttachMenu {...defaultProps} onDismiss={onDismiss} />
      </div>,
    )

    fireEvent.pointerDown(screen.getByTestId('operator-attach-menu'))
    expect(onDismiss).not.toHaveBeenCalled()

    fireEvent.pointerDown(screen.getByTestId('trigger'))
    expect(onDismiss).not.toHaveBeenCalled()

    fireEvent.click(await screen.findByTestId('operator-attach-open-library'))
    fireEvent.pointerDown(screen.getByTestId('asset-selector-dialog'))
    expect(onDismiss).not.toHaveBeenCalled()

    fireEvent.pointerDown(screen.getByTestId('outside'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('打开后聚焦首个操作，Escape 关闭并把焦点还给触发器', async () => {
    const onDismiss = vi.fn()
    render(<KeyboardDismissHarness onDismiss={onDismiss} />)

    fireEvent.click(screen.getByText('trigger'))

    expect(document.activeElement).toBe(
      screen.getByTestId('operator-attach-upload'),
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('operator-attach-menu')).toBeNull()
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByText('trigger')),
    )
  })

  it('消费 Escape 后不再冒泡到 Studio 的全局收起快捷键', () => {
    const studioEscapeLadder = vi.fn()
    window.addEventListener('keydown', studioEscapeLadder)

    try {
      render(<KeyboardDismissHarness onDismiss={vi.fn()} />)
      fireEvent.click(screen.getByText('trigger'))
      fireEvent.keyDown(document, { key: 'Escape' })

      expect(studioEscapeLadder).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', studioEscapeLadder)
    }
  })
})

/**
 * P3-A 的回归闸：上传区**不是装饰**。
 *
 * ⚠ owner 2026-08-30 真机点验时打回的就是这一条 —— 「拖进来，或点击上传」
 * 长得完全正常，点下去什么都不发生。它在编译期与测试里都不会红（一个没有
 * `onClick` 的 `<div>` 是完全合法的），所以这里钉的是**两个手势各自真的接到了
 * 那一个函数**，而不是「这块 DOM 还在」。
 */
describe('StudioOperatorAttachMenu · P3-A 上传三通道', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchGalleryImages.mockResolvedValue(galleryResponse())
  })

  it('点击上传区 = 打开文件选择器（owner 打回的那条：点了没反应）', async () => {
    render(<StudioOperatorAttachMenu {...defaultProps} />)

    const input = screen.getByTestId('operator-attach-file-input')
    const openPicker = vi.spyOn(input, 'click')

    fireEvent.click(screen.getByTestId('operator-attach-upload'))
    expect(openPicker).toHaveBeenCalledTimes(1)
  })

  it('选中文件 → 交给同一条上传通道，并清空 input（否则同一个文件选第二次没反应）', () => {
    const onUploadFiles = vi.fn()
    render(
      <StudioOperatorAttachMenu
        {...defaultProps}
        onUploadFiles={onUploadFiles}
      />,
    )

    const input = screen.getByTestId(
      'operator-attach-file-input',
    ) as HTMLInputElement
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(onUploadFiles).toHaveBeenCalledTimes(1)
    expect(onUploadFiles.mock.calls[0]?.[0]).toHaveLength(1)
    expect(onUploadFiles.mock.calls[0]?.[0][0].name).toBe('shot.png')
    expect(input.value).toBe('')
  })

  it('拖进来 = 同一条通道（accept 不参与判定，类型闸在通道里按 MIME 走）', () => {
    const onUploadFiles = vi.fn()
    render(
      <StudioOperatorAttachMenu
        {...defaultProps}
        onUploadFiles={onUploadFiles}
      />,
    )

    const zone = screen.getByTestId('operator-attach-upload')
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' })
    fireEvent.drop(zone, { dataTransfer: { files: [file] } })

    expect(onUploadFiles).toHaveBeenCalledTimes(1)
    expect(onUploadFiles.mock.calls[0]?.[0][0].name).toBe('clip.mp4')
  })

  it('空的 drop 不触发上传（拖一段文字进来不该凭空冒出一件上传）', () => {
    const onUploadFiles = vi.fn()
    render(
      <StudioOperatorAttachMenu
        {...defaultProps}
        onUploadFiles={onUploadFiles}
      />,
    )

    fireEvent.drop(screen.getByTestId('operator-attach-upload'), {
      dataTransfer: { files: [] },
    })
    expect(onUploadFiles).not.toHaveBeenCalled()
  })
})
