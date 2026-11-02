import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_STREAMING } from '@/constants/studio-assistant-operator'

import {
  StudioOperatorThinkingRow,
  StudioOperatorThoughtReceipt,
} from './StudioOperatorThinkingRow'

/**
 * 等第一个字时那一行（2026-10-14 设计方案 §9.1）的回归闸。
 *
 *  ① 发送后一秒内**不露字**（只留一行高）—— 一秒内回话的那一轮⛔ 不闪；
 *  ② 之后：呼吸点 + 扫光「正在想…」+ 已等秒数；
 *  ③ 超过 6 秒多一句慢提示；
 *  ④ 画布接力那一跳写「正在画布上落地…」；
 *  ⑤ 「想了 N 秒」回执：不到露字门槛的那一轮不画。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}))

const START = 1_000_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

describe('StudioOperatorThinkingRow', () => {
  it('一秒内只留一行高，⛔ 不露字', () => {
    render(<StudioOperatorThinkingRow since={START} />)
    const row = screen.getByTestId('operator-message-pending')
    expect(row.dataset.revealed).toBe('false')
    expect(row.textContent).toBe('')
    expect(row.className).toContain('h-6')
    advance(STUDIO_OPERATOR_STREAMING.thinkingRevealMs - 500)
    expect(row.textContent).toBe('')
  })

  it('过了一秒：呼吸点 + 扫光字 + 秒数', () => {
    render(<StudioOperatorThinkingRow since={START} />)
    advance(STUDIO_OPERATOR_STREAMING.thinkingRevealMs)
    const row = screen.getByTestId('operator-message-pending')
    expect(row.dataset.revealed).toBe('true')
    expect(row.textContent).toContain('thinking')
    expect(row.querySelector('.assistant-shimmer-text')).toBeTruthy()
    expect(row.querySelector('.animate-assistant-breathe')).toBeTruthy()
    // ⚠ 减少动效：呼吸点静止。
    expect(
      row.querySelector('.animate-assistant-breathe')?.className,
    ).toContain('motion-reduce:animate-none')
    expect(
      screen.getByTestId('operator-message-pending-seconds').textContent,
    ).toBe('seconds:1')
    advance(2_000)
    expect(
      screen.getByTestId('operator-message-pending-seconds').textContent,
    ).toBe('seconds:3')
    expect(screen.queryByTestId('operator-message-slow')).toBeNull()
  })

  it('超过 6 秒多一句慢提示', () => {
    render(<StudioOperatorThinkingRow since={START} />)
    advance(STUDIO_OPERATOR_STREAMING.thinkingSlowMs)
    expect(screen.getByTestId('operator-message-slow').textContent).toBe('slow')
  })

  it('画布接力那一跳写「正在画布上落地…」', () => {
    render(<StudioOperatorThinkingRow since={START} landing />)
    advance(STUDIO_OPERATOR_STREAMING.thinkingRevealMs)
    const row = screen.getByTestId('operator-message-pending')
    expect(row.dataset.phase).toBe('landing')
    expect(row.textContent).toContain('landing')
    expect(row.textContent).not.toContain('thinking')
  })

  it('没有起点（老条目）= 立刻露字、不带秒数', () => {
    render(<StudioOperatorThinkingRow />)
    expect(screen.getByTestId('operator-message-pending').textContent).toBe(
      'thinking',
    )
    expect(screen.queryByTestId('operator-message-pending-seconds')).toBeNull()
  })
})

describe('StudioOperatorThoughtReceipt', () => {
  it('想过一秒以上才画「想了 N 秒」', () => {
    const { rerender } = render(
      <StudioOperatorThoughtReceipt thoughtMs={400} />,
    )
    expect(screen.queryByTestId('operator-message-thought')).toBeNull()
    rerender(<StudioOperatorThoughtReceipt thoughtMs={12_300} />)
    expect(screen.getByTestId('operator-message-thought').textContent).toBe(
      'thought:12',
    )
    rerender(<StudioOperatorThoughtReceipt />)
    expect(screen.queryByTestId('operator-message-thought')).toBeNull()
  })
})

describe('思考摘要（10-27 B 一行 + ② 足迹）', () => {
  const SUMMARY =
    '**Understanding the request**\nSwitch to 3:4.\n\n**Planning the edit**\nOne edit is enough.'

  it('想的时候：一步一道短线，只露最新一步的小标题，⛔ 铺正文', () => {
    render(<StudioOperatorThinkingRow since={START} thinking={SUMMARY} />)
    const row = screen.getByTestId('operator-message-pending')
    expect(
      screen.getByTestId('operator-message-thinking-title').textContent,
    ).toBe('Planning the edit')
    expect(row.textContent).not.toContain('One edit is enough')
    expect(row.querySelectorAll('.h-0\\.75')).toHaveLength(2)
  })

  it('想完：前面留短线，点开一步一行（小标题 + 一句）', () => {
    render(
      <StudioOperatorThoughtReceipt thoughtMs={17_000} thinking={SUMMARY} />,
    )
    const toggle = screen.getByRole('button')
    expect(toggle.textContent).toContain('thought:17')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    act(() => toggle.click())
    const steps = screen.getByTestId('operator-message-thought-steps')
    expect(steps.querySelectorAll('li')).toHaveLength(2)
    expect(steps.textContent).toContain('Switch to 3:4.')
  })

  it('没摘要的型号：只是一句灰字，⛔ 画展开键', () => {
    render(<StudioOperatorThoughtReceipt thoughtMs={9_000} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByTestId('operator-message-thought').textContent).toBe(
      'thought:9',
    )
  })
})
