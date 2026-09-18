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
 *  ④ `detail` 折成「为什么」，缺席时⛔ 一颗都不画；
 *  ⑤ **正文是 markdown**（v2 §13.2）：`**粗体**` 出 `<strong>`、有序列表出 `<ol>`，
 *     星号⛔ 不许出现在 `textContent` 里；折叠态的首句同样是**渲染后**的。
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

  /**
   * `streaming` 两种形态：空正文是占位脉冲；有字是收尾轮还在写，先不折叠。
   */
  it('⭐ 空正文 + streaming = 三点占位脉冲，⛔ 不是一行空白', () => {
    renderBody({ text: '', streaming: true })
    expect(screen.getByTestId('operator-message-pending')).toBeTruthy()
    expect(screen.queryByTestId('operator-message-text')).toBeNull()
  })

  it('⭐ 还在写的长正文不折叠，免得半截 markdown 被切成首句', () => {
    renderBody({ text: LONG, streaming: true })
    expect(
      screen.getByTestId('operator-message-text').dataset.collapsed,
    ).toBeUndefined()
    expect(screen.queryByTestId('operator-message-expand')).toBeNull()
  })

  it('⭐ `**粗体**` 出 <strong>，星号不落在屏幕上', () => {
    renderBody({ text: '把它改成**夜景**。' })
    const body = screen.getByTestId('operator-message-text')
    expect(body.querySelector('strong')?.textContent).toBe('夜景')
    expect(body.textContent).not.toContain('*')
  })

  it('⭐ 有序列表出 <ol>，⛔ 不是一行 `1. 2. 3.`', () => {
    renderBody({ text: '两步走：\n\n1. 先定光源\n2. 再压背景\n' })
    const body = screen.getByTestId('operator-message-text')
    const items = body.querySelectorAll('ol > li')
    expect(items).toHaveLength(2)
    expect(items[0]?.textContent).toContain('先定光源')
  })

  it('⭐ 折叠态的首句也是渲染后的 —— 星号不许漏出来', () => {
    const text =
      '先把它改成**夜景**。\n二。\n三。\n四。\n五。\n六。\n七。\n八。'
    renderBody({ text })
    const folded = screen.getByTestId('operator-message-text')
    expect(folded.dataset.collapsed).toBe('true')
    expect(folded.querySelector('strong')?.textContent).toBe('夜景')
    expect(folded.textContent).toBe('先把它改成夜景。')
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
