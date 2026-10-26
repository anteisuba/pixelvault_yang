import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { chatBubblePauseMs } from '@/hooks/use-chat-bubble-reveal'

import { VoiceLinePending } from './VoiceLinePending'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('motion/react', () => ({ useReducedMotion: () => false }))

const CAST = [
  { id: 'voice-1', kind: 'voice' as const, name: 'Denia', coverImage: null },
]

function bubbles(container: HTMLElement) {
  return [...container.querySelectorAll('.vr-bubble:not(.vr-bubble-dots)')].map(
    (node) => node.textContent,
  )
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('VoiceLinePending — typing like a chat app（10-26 F）', () => {
  it('shows the next bubble only after a pause, with typing dots meanwhile, then hands over', () => {
    const onRevealed = vi.fn()
    const text = '又熬夜了吧\n图先放着嘛'
    const { container, rerender } = render(
      <VoiceLinePending cast={CAST} speakerId="voice-1" text={text} typing />,
    )
    expect(bubbles(container)).toEqual(['又熬夜了吧'])
    expect(container.querySelector('.vr-bubble-dots')).not.toBeNull()

    rerender(
      <VoiceLinePending
        cast={CAST}
        speakerId="voice-1"
        text={text}
        typing
        done
        onRevealed={onRevealed}
      />,
    )
    act(() => {
      vi.advanceTimersByTime(chatBubblePauseMs('又熬夜了吧'))
    })
    expect(bubbles(container)).toEqual(['又熬夜了吧', '图先放着嘛'])
    expect(container.querySelector('.vr-bubble-dots')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(onRevealed).toHaveBeenCalledTimes(1)
  })

  it('waits with dots right after a finished line while she is still writing', () => {
    const { container } = render(
      <VoiceLinePending
        cast={CAST}
        speakerId="voice-1"
        text={'画崩了？\n'}
        typing
      />,
    )
    expect(bubbles(container)).toEqual(['画崩了？'])
    expect(container.querySelector('.vr-bubble-dots')).not.toBeNull()
  })
})

describe('chatBubblePauseMs', () => {
  it('waits longer after a longer bubble, up to a cap', () => {
    expect(chatBubblePauseMs('短')).toBeLessThan(
      chatBubblePauseMs('长一点的一句话'),
    )
    expect(chatBubblePauseMs('字'.repeat(500))).toBe(1600)
  })
})
