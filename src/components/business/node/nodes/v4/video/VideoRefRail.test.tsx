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
    <img src={props.src as string} alt="" data-testid="rail-thumb" />
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
  const onRemove = vi.fn()
  const onRetryPending = vi.fn()
  const view = render(
    <VideoRefRail
      items={ITEMS}
      capacity={{ images: 9, videos: 3, voices: 3 }}
      onChangeRole={vi.fn()}
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
  return { onRemove, onRetryPending, ...view }
}

describe('VideoRefRail', () => {
  /**
   * owner 2026-09-10 真机反馈第二条：光有缩略时四张灰图分不出谁是谁，语音那一格
   * 更是三条一样的波形。
   */
  it('每项下面一行来源卡名，hover 读全名', () => {
    const { container } = setup()
    const names = Array.from(
      container.querySelectorAll('[data-video-rail-name]'),
    ).map((el) => el.textContent)
    expect(names).toContain('S02 站台图')
    expect(names).toContain('莫宁台词')
    expect(
      container.querySelector('[data-video-rail-name]')?.getAttribute('title'),
    ).toBe('S02 站台图')
  })

  it('语音格在波形上压名字首两字（波形本身分不开）', () => {
    const { container } = setup()
    expect(
      container.querySelector('[data-video-rail-voice-initials]')?.textContent,
    ).toBe('莫宁')
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

  it('占位项算进已挂数，满了这一组的加号就灰掉', () => {
    const { container } = setup({
      capacity: { images: 2, videos: 3, voices: 3 },
      pending: [{ id: 'p1', group: 'image', name: 'a.png', progress: 10 }],
    })
    expect(
      container
        .querySelector('[data-video-rail-add="image"]')
        ?.getAttribute('data-video-rail-add-blocked'),
    ).toBe('true')
  })
})
