import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { VoiceLineRecord } from '@/types/voiceroom'

import { VoiceLineBubble } from './VoiceLineBubble'

vi.mock('@/hooks/use-picture-number-references', () => ({
  usePictureNumberReferences: (text: string) =>
    text.includes('图_12')
      ? [{ url: 'https://cdn.example/12.png', name: '图_12', aliases: [] }]
      : [],
}))

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
    attachments: null,
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

describe('VoiceLineBubble — chat (owner 10-23)', () => {
  it('shows your own chat line as a plain bubble, without a name or voice', () => {
    const { container } = render(
      <VoiceLineBubble
        line={makeLine({
          speakerId: 'builtin:user',
          speakerKind: 'user',
          speakerName: '',
          text: '你今天怎么样？',
        })}
        onRetake={vi.fn()}
      />,
    )
    expect(screen.getByText('你今天怎么样？')).toBeInTheDocument()
    expect(container.querySelector('[data-self]')).not.toBeNull()
    expect(container.querySelector('.vr-avatar')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('dims delivery cues and offers read-aloud when the reply has no voice', () => {
    const onRetake = vi.fn()
    const { container } = render(
      <VoiceLineBubble
        line={makeLine({ text: '[laughing] 哈哈，被你发现了。', audio: null })}
        onRetake={onRetake}
      />,
    )
    expect(container.querySelector('.vr-cue')?.textContent).toBe('[laughing]')
    fireEvent.click(screen.getByRole('button', { name: 'VoiceRoom:readAloud' }))
    expect(onRetake).toHaveBeenCalledWith('line-1', {})
  })
})

describe('VoiceLineBubble — pictures and sources (用户 10-25 Q3)', () => {
  it('shows a picture she mentions as its own image, not as text', () => {
    const { container } = render(
      <VoiceLineBubble
        line={makeLine({ text: '你看这张 图_12。' })}
        onRetake={vi.fn()}
      />,
    )
    expect(container.querySelector('.vr-bubble')?.textContent).toBe(
      '你看这张。',
    )
    expect(container.querySelector('.vr-shot img')?.getAttribute('src')).toBe(
      'https://cdn.example/12.png',
    )
  })

  it('folds her sources into one chip that opens a list', () => {
    render(
      <VoiceLineBubble
        line={makeLine({
          attachments: {
            sources: [
              { title: '官网', url: 'https://a.example/1' },
              { title: '百科', url: 'https://b.example/2' },
            ],
          },
        })}
        onRetake={vi.fn()}
      />,
    )
    expect(screen.queryByRole('link', { name: '官网' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /VoiceRoom:sources/ }))
    expect(screen.getByRole('link', { name: '官网' })).toHaveAttribute(
      'href',
      'https://a.example/1',
    )
  })

  it('shows the pictures you sent on your own line', () => {
    const { container } = render(
      <VoiceLineBubble
        line={makeLine({
          speakerKind: 'user',
          speakerName: '',
          text: '这个怎么样',
          attachments: {
            images: [{ id: 'g1', url: 'https://cdn.example/mine.png' }],
          },
        })}
        onRetake={vi.fn()}
      />,
    )
    expect(container.querySelector('.vr-shot img')?.getAttribute('src')).toBe(
      'https://cdn.example/mine.png',
    )
  })
})
