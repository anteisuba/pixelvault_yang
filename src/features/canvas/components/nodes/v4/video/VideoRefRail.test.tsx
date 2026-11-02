import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) => (key: string, values?: Record<string, unknown>) =>
      values ? `${namespace}.${key}(${JSON.stringify(values)})` : key,
}))
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={props.src as string}
      alt=""
      width={props.width as number}
      height={props.height as number}
      data-testid="rail-thumb"
    />
  ),
}))

import { NODE_SLOT_IDS } from '@/constants/node-slots'
import type { VideoRailEntry } from '@/lib/video-node-rail'

import { VideoRefRail } from './VideoRefRail'

const ITEMS: readonly VideoRailEntry[] = [
  {
    group: 'image',
    index: 1,
    slot: NODE_SLOT_IDS.firstFrame,
    edgeId: 'e1',
    sourceNodeId: 'n1',
    sourceName: 'S02 站台图',
    thumbnailUrl: '/a.png',
  },
  {
    group: 'voice',
    index: 1,
    slot: NODE_SLOT_IDS.voice,
    edgeId: 'e2',
    sourceNodeId: 'n2',
    sourceName: '莫宁台词',
  },
]

function setup(props: Partial<React.ComponentProps<typeof VideoRefRail>> = {}) {
  const onChangeRole = vi.fn()
  const onRemove = vi.fn()
  const onRetryPending = vi.fn()
  const view = render(
    <VideoRefRail
      items={ITEMS}
      capacity={{ images: 9, videos: 3, voices: 3 }}
      onChangeRole={onChangeRole}
      onOpen={vi.fn()}
      onRemove={onRemove}
      candidatesOf={() => []}
      onPickFromCanvas={vi.fn()}
      onUpload={vi.fn()}
      onLibrary={vi.fn()}
      onRetryPending={onRetryPending}
      onRemovePending={vi.fn()}
      {...props}
    />,
  )
  return { onChangeRole, onRemove, onRetryPending, ...view }
}

describe('VideoRefRail', () => {
  it('缩略只显示 48px 图、编号和角色，来源名留在 title / aria', () => {
    const { container } = setup()
    const thumb = container.querySelector('[data-video-rail-item="image"]')
    expect(thumb?.classList.contains('size-12')).toBe(true)
    expect(thumb?.getAttribute('title')).toBe('S02 站台图')
    expect(thumb?.getAttribute('aria-label')).toContain('S02 站台图')
    expect((thumb?.parentElement as HTMLElement).style.transform).not.toContain(
      'scale(0.72)',
    )
    expect(thumb?.getAttribute('data-video-rail-index')).toBe('1')
    expect(
      container.querySelector('[data-video-rail-badge]')?.textContent,
    ).toBe('StudioNode.v4.video.rail.badge.image({"index":1})')
    expect(
      container.querySelector('[data-video-rail-role="firstFrame"]'),
    ).not.toBeNull()
    expect(container.querySelector('[data-video-rail-name]')).toBeNull()
    expect(container.querySelector('[data-video-rail-add]')).toBeNull()
  })

  it('语音格用波形和编号区分，来源名可悬停读取', () => {
    const { container } = setup()
    const thumb = container.querySelector('[data-video-rail-item="voice"]')
    expect(thumb?.getAttribute('title')).toBe('莫宁台词')
    expect(thumb?.getAttribute('aria-label')).toContain('莫宁台词')
    expect(thumb?.querySelector('[data-video-rail-badge]')?.textContent).toBe(
      'StudioNode.v4.video.rail.badge.voice({"index":1})',
    )
    expect(thumb?.querySelector('[data-video-rail-voice-initials]')).toBeNull()
  })

  it('画中框参考行缩略为 44px、圆角 10；卡上仍为 48px', () => {
    const { container } = setup({ expanded: true, items: [ITEMS[0]!] })
    const thumb = container.querySelector('[data-video-rail-item="image"]')!
    expect(thumb.className).toContain('size-11')
    expect(thumb.className).toContain('rounded-lg')
    expect(thumb.querySelector('img')).toHaveAttribute('width', '44')
  })

  it('首次从空轨挂上缩略时只让新格从 0.72 长出', () => {
    const { container } = setup({ items: [ITEMS[0]], animateOnMount: true })
    const cell = container.querySelector('[data-video-rail-item]')
      ?.parentElement as HTMLElement
    expect(cell.style.transform).toContain('scale(0.72)')
    expect(cell.style.filter).toBe('blur(4px)')
  })

  /** owner 真机反馈第七条：上传要先落一个占位项，⛔ 不是等它凭空出现。 */
  it('上传中的占位项带进度，失败后可重试', () => {
    const { container, onRetryPending } = setup({
      pending: [
        { id: 'p1', group: 'image', name: 'a.png', progress: 42 },
        { id: 'p2', group: 'video', name: 'b.mp4', progress: 0, error: '失败' },
      ],
    })
    const uploading = container.querySelector(
      '[data-video-rail-pending-state="uploading"]',
    )
    expect(uploading?.getAttribute('aria-valuenow')).toBe('42')

    const failed = container.querySelector(
      '[data-video-rail-pending-state="error"]',
    )
    expect(failed).not.toBeNull()
    // radix 的菜单认 pointerdown，不认合成 click。
    fireEvent.pointerDown(
      failed as HTMLElement,
      new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
    )
    fireEvent.click(screen.getByText('rail.retry'))
    expect(onRetryPending).toHaveBeenCalledWith('p2')
  })

  it('已挂的图片仍可从缩略菜单改成尾帧', () => {
    const { container, onChangeRole } = setup()
    fireEvent.pointerDown(
      container.querySelector('[data-video-rail-item="image"]')!,
      {
        button: 0,
        ctrlKey: false,
      },
    )
    fireEvent.click(screen.getByText('rail.setRole.lastFrame'))
    expect(onChangeRole).toHaveBeenCalledWith(ITEMS[0], NODE_SLOT_IDS.lastFrame)
  })
})
