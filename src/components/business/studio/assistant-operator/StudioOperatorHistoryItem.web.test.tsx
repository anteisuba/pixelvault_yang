// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorHistoryItem } from './StudioOperatorHistoryItem'

/**
 * 只读历史条目的回归闸（2026-09-07 真机）。
 *
 * ⭐ 钉的是**长正文在历史里也折**：真机上历史里一条 8 行的正文整条铺开，既没有
 * 「展开全文」也没有那颗测试锚 —— 根因是历史那一支走的是另一段裸 `<p>`，折叠
 * 逻辑只写在实时线程那一侧。两边现在共用 `StudioOperatorCollapsibleText`。
 */

vi.mock('next-intl', () => ({
  useFormatter: () => ({ list: (items: string[]) => items.join('、') }),
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(',')}` : key
    return Object.assign(t, { has: () => true })
  },
}))

const LONG =
  ['一', '二', '三', '四', '五', '六', '七', '八'].join('。\n') + '。'

describe('StudioOperatorHistoryItem', () => {
  it('⭐ 历史里的长正文也折成首句 + 「展开全文」，点开才是全文', () => {
    render(
      <StudioOperatorHistoryItem
        entry={{ kind: 'message', id: 'h1', text: LONG }}
      />,
    )
    const folded = screen.getByTestId('operator-message-text')
    expect(folded.dataset.collapsed).toBe('true')
    expect(folded.textContent).toBe('一。')

    fireEvent.click(screen.getByTestId('operator-message-expand'))
    expect(screen.getByTestId('operator-message-text').textContent).toBe(LONG)
  })

  it('短正文原样出，⛔ 不长出一颗没用的展开钮', () => {
    render(
      <StudioOperatorHistoryItem
        entry={{ kind: 'message', id: 'h2', text: '改成夜景了。' }}
      />,
    )
    expect(screen.queryByTestId('operator-message-expand')).toBeNull()
    expect(screen.getByTestId('operator-message-text').textContent).toBe(
      '改成夜景了。',
    )
  })
})
