// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorMessageBody } from './StudioOperatorMessageBody'

/**
 * 助手正文那一格的回归闸（2026-09-06 面板轮，第 4 / 5 件）。
 *
 * 钉四件事：
 *  ① 短回话原样出，⛔ 不长出一颗没用的「展开全文」；
 *  ② 长回话折成**首句** + 「展开全文」，点开是全文；
 *  ③ **还在流的时候不折** —— 字长到一半自己没了是最坏的那种；
 *  ④ `detail` 折成「为什么」，缺席时⛔ 一颗都不画。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const LONG =
  ['一', '二', '三', '四', '五', '六', '七', '八'].join('。\n') + '。'

function renderBody(
  entry: Partial<
    React.ComponentProps<typeof StudioOperatorMessageBody>['entry']
  > = {},
) {
  render(
    <StudioOperatorMessageBody
      entry={{ kind: 'message', id: 'm1', text: '改成夜景了。', ...entry }}
    />,
  )
}

describe('StudioOperatorMessageBody', () => {
  it('短回话原样出，⛔ 没有多余的展开钮', () => {
    renderBody()
    expect(screen.queryByTestId('operator-message-expand')).toBeNull()
    expect(screen.getByTestId('operator-message-text').textContent).toBe(
      '改成夜景了。',
    )
  })

  it('⭐ 长回话折成首句，点开才是全文', () => {
    renderBody({ text: LONG })
    const folded = screen.getByTestId('operator-message-text')
    expect(folded.dataset.collapsed).toBe('true')
    expect(folded.textContent).toBe('一。')

    fireEvent.click(screen.getByTestId('operator-message-expand'))
    expect(screen.getByTestId('operator-message-text').textContent).toBe(LONG)
  })

  it('⭐ 还在流的时候⛔ 不折', () => {
    renderBody({ text: LONG, streaming: true })
    expect(screen.queryByTestId('operator-message-expand')).toBeNull()
    expect(screen.getByTestId('operator-message-text').textContent).toBe(LONG)
  })

  it('⭐ `detail` 折成「为什么」；缺席时一颗都不画', () => {
    renderBody({ detail: '夜景比日景更能压住背景里的杂色。' })
    expect(screen.getByTestId('operator-message-why').textContent).toContain(
      '夜景比日景',
    )

    screen.getByTestId('operator-message-why').remove()
    renderBody()
    expect(screen.queryByTestId('operator-message-why')).toBeNull()
  })
})
