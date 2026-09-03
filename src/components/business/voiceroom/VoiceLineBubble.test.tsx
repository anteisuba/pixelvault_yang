import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { VoiceLineRecord } from '@/types/voiceroom'

import { VoiceLineBubble } from './VoiceLineBubble'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}))

// 08-29 那波「配音间取消」加的 `cancelling`/`onCancel` prop 一直没有测试
// 覆盖——这里只锁两条契约：① pending 且宿主传了 onCancel 时按钮才出现、
// 点击调用 onCancel；② retaking 或非 pending 态一律不渲染（重录没有独立
// jobId 可取消，见组件内注释）。取消键本身的可用/禁用（`cancelling`）由
// 组件直接把 prop 转给 `disabled`，不单独立测。
function makeLine(overrides: Partial<VoiceLineRecord> = {}): VoiceLineRecord {
  return {
    id: 'line-1',
    order: 0,
    speakerId: 'speaker-1',
    speakerKind: 'voice',
    speakerName: '晴',
    speakerCover: null,
    text: '今天天气不错。',
    emotion: null,
    audio: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('VoiceLineBubble — cancel button', () => {
  it('renders the cancel button while pending and calls onCancel on click', () => {
    const onCancel = vi.fn()
    const line = makeLine({
      audio: {
        jobId: 'job-1',
        status: 'RUNNING',
        url: null,
        duration: null,
        errorMessage: null,
      },
    })

    render(
      <VoiceLineBubble line={line} onRetake={vi.fn()} onCancel={onCancel} />,
    )

    const cancelButton = screen.getByRole('button', {
      name: 'VoiceRoom:cancel',
    })
    expect(cancelButton).toBeInTheDocument()

    fireEvent.click(cancelButton)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not render the cancel button while retaking, even if pending', () => {
    const onCancel = vi.fn()
    const line = makeLine({
      audio: {
        jobId: 'job-1',
        status: 'RUNNING',
        url: null,
        duration: null,
        errorMessage: null,
      },
    })

    render(
      <VoiceLineBubble
        line={line}
        onRetake={vi.fn()}
        onCancel={onCancel}
        retaking
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'VoiceRoom:cancel' }),
    ).not.toBeInTheDocument()
  })

  it('does not render the cancel button when the line is not pending', () => {
    const onCancel = vi.fn()
    const line = makeLine({
      audio: {
        jobId: 'job-1',
        status: 'COMPLETED',
        url: 'https://example.com/a.mp3',
        duration: 3,
        errorMessage: null,
      },
    })

    render(
      <VoiceLineBubble line={line} onRetake={vi.fn()} onCancel={onCancel} />,
    )

    expect(
      screen.queryByRole('button', { name: 'VoiceRoom:cancel' }),
    ).not.toBeInTheDocument()
  })

  it('does not render the cancel button when the host has no onCancel', () => {
    const line = makeLine({
      audio: {
        jobId: 'job-1',
        status: 'QUEUED',
        url: null,
        duration: null,
        errorMessage: null,
      },
    })

    render(<VoiceLineBubble line={line} onRetake={vi.fn()} />)

    expect(
      screen.queryByRole('button', { name: 'VoiceRoom:cancel' }),
    ).not.toBeInTheDocument()
  })
})
