import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorThoughts } from './StudioOperatorThoughts'

/**
 * 「我的想法」（助手思考过程 C，owner 11-11）的回归闸：
 *  ① 平时只有一行（正在想 / 我的想法 + 秒数），⛔ 露任何一句；
 *  ② 点开才看到几句：决定加深、来源挂句尾；
 *  ③ 想的时候点开，换成答完那一行之后照样开着（开没开按条目 id 记）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}))

const LINES = [
  '台上是雨天那张，**这次只动环境那几个词**。',
  '你说过喜欢冷色调，**夜景就走冷蓝**。〔记忆·偏好冷色调〕',
]

describe('StudioOperatorThoughts', () => {
  it('收着：一行标签 + 秒数，⛔ 露任何一句', () => {
    render(
      <StudioOperatorThoughts
        entryId="m-1"
        lines={LINES}
        live={false}
        seconds={6}
      />,
    )
    const toggle = screen.getByTestId('operator-thoughts-toggle')
    expect(toggle.textContent).toContain('myThoughts')
    expect(toggle.textContent).toContain('seconds:6')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('operator-thoughts-lines')).toBeNull()
  })

  it('点开：一句一行，决定加深，来源是句尾小签', () => {
    render(
      <StudioOperatorThoughts
        entryId="m-2"
        lines={LINES}
        live={false}
        seconds={6}
      />,
    )
    act(() => screen.getByTestId('operator-thoughts-toggle').click())
    const list = screen.getByTestId('operator-thoughts-lines')
    expect(list.querySelectorAll('li')).toHaveLength(2)
    expect(
      [...list.querySelectorAll('[data-thought-key]')].map(
        (n) => n.textContent,
      ),
    ).toEqual(['这次只动环境那几个词', '夜景就走冷蓝'])
    expect(screen.getByTestId('operator-thought-source').textContent).toBe(
      '记忆·偏好冷色调',
    )
    expect(list.textContent).not.toContain('**')
    expect(list.textContent).not.toContain('〔')
  })

  it('想的时候写「正在想」并有呼吸点；点开后换成答完那一行照样开着', () => {
    const { unmount } = render(
      <StudioOperatorThoughts
        entryId="m-3"
        lines={LINES.slice(0, 1)}
        live
        seconds={2}
      />,
    )
    const toggle = screen.getByTestId('operator-thoughts-toggle')
    expect(toggle.textContent).toContain('thinkingNow')
    act(() => toggle.click())
    unmount()
    render(
      <StudioOperatorThoughts
        entryId="m-3"
        lines={LINES}
        live={false}
        seconds={4}
      />,
    )
    expect(
      screen
        .getByTestId('operator-thoughts-toggle')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      screen.getByTestId('operator-thoughts-lines').querySelectorAll('li'),
    ).toHaveLength(2)
  })
})
