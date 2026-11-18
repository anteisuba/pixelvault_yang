import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { RunItem } from '@/types'

vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, { has: () => true }),
}))

import { StudioVideoQueueStrip } from './StudioVideoQueueStrip'

const failed: RunItem = {
  id: 'failed-video',
  modelId: 'demo-video',
  status: 'failed',
  generation: null,
  error: 'ETIMEDOUT after 120000ms',
}

describe('video queue user-facing errors', () => {
  it.each(['cards', 'strip'] as const)(
    'localizes %s failures including tooltip and accessible text',
    (variant) => {
      const { container } = render(
        <StudioVideoQueueStrip
          items={[failed]}
          focusedItemId={null}
          onFocus={vi.fn()}
          onRetry={vi.fn()}
          variant={variant}
        />,
      )
      // 桌面那条把原因写在「#N 失败 · 原因 重试这条」一行里（视频台 A），按内容认。
      expect(
        screen.getByText(/generation\.provider_timeout/),
      ).toBeInTheDocument()
      expect(container.innerHTML).not.toContain('ETIMEDOUT')
    },
  )

  it('桌面：失败那条的原因明着写出来，「重试这条」跟在后面', () => {
    const onRetry = vi.fn()
    render(
      <StudioVideoQueueStrip
        items={[failed]}
        focusedItemId={null}
        onFocus={vi.fn()}
        onRetry={onRetry}
      />,
    )
    const line = screen.getByText(/generation\.provider_timeout/)
    expect(line).toHaveTextContent('itemFailed')
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(onRetry).toHaveBeenCalledWith('failed-video')
  })
})

describe('video queue cover', () => {
  const done = (thumbnailUrl: string | null): RunItem => ({
    id: 'done-video',
    modelId: 'demo-video',
    status: 'completed',
    generation: {
      id: 'gen-1',
      url: 'https://cdn.example.com/take.mp4',
      thumbnailUrl,
    } as Extract<RunItem, { status: 'completed' }>['generation'],
    error: null,
  })

  it.each(['cards', 'strip'] as const)(
    '%s：没有封面时停在片子首帧，不留一块素色格子',
    (variant) => {
      const { container } = render(
        <StudioVideoQueueStrip
          items={[done(null)]}
          focusedItemId={null}
          onFocus={vi.fn()}
          onRetry={vi.fn()}
          variant={variant}
        />,
      )
      const frame = screen.getByTestId('studio-video-queue-cover-frame')
      expect(frame.getAttribute('src')).toBe(
        'https://cdn.example.com/take.mp4#t=0.1',
      )
      expect(container.querySelector('img')).toBeNull()
    },
  )

  it('有封面时用封面', () => {
    const { container } = render(
      <StudioVideoQueueStrip
        items={[done('https://cdn.example.com/poster.jpg')]}
        focusedItemId={null}
        onFocus={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.example.com/poster.jpg',
    )
    expect(screen.queryByTestId('studio-video-queue-cover-frame')).toBeNull()
  })
})
