import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { chatBubblePauseMs } from '@/hooks/use-chat-bubble-reveal'

import { StudioOperatorChatBubbles } from './StudioOperatorChatBubbles'

vi.mock('motion/react', () => ({ useReducedMotion: () => false }))

const shown = () =>
  screen
    .queryAllByTestId('operator-chat-bubble')
    .map((node) => node.textContent)
const typing = () => screen.queryByTestId('operator-chat-typing')

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('StudioOperatorChatBubbles（②c-2，出场照样件 F）', () => {
  it('还在写的那一行不露面：先三点，写完整条一次弹出，后一条等停顿', () => {
    const { rerender } = render(
      <StudioOperatorChatBubbles text="又熬夜" streaming />,
    )
    expect(shown()).toEqual([])
    expect(typing()).not.toBeNull()

    rerender(<StudioOperatorChatBubbles text={'又熬夜了吧\n图先'} streaming />)
    expect(shown()).toEqual(['又熬夜了吧'])
    expect(typing()).not.toBeNull()

    rerender(
      <StudioOperatorChatBubbles
        text={'又熬夜了吧\n图先放着嘛'}
        streaming={false}
      />,
    )
    expect(shown()).toEqual(['又熬夜了吧'])
    act(() => {
      vi.advanceTimersByTime(chatBubblePauseMs('又熬夜了吧'))
    })
    expect(shown()).toEqual(['又熬夜了吧', '图先放着嘛'])
    expect(typing()).toBeNull()
  })

  it('翻历史：整段直接摆出来，不等、没有三点', () => {
    render(
      <StudioOperatorChatBubbles text={'在呢\n怎么啦'} streaming={false} />,
    )
    expect(shown()).toEqual(['在呢', '怎么啦'])
    expect(typing()).toBeNull()
  })
})
