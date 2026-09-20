// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorErrorBar } from './StudioOperatorErrorBar'

/**
 * 错误条的回归闸（owner 2026-09-20 真机第 1 条）。
 *
 * 钉四件事：
 *  ① 没有 `trace` 时**只有第一段**那句人话 —— ⛔ 不为 `GenerationError` 那一族
 *     编一个查不到的短码；
 *  ② 有 `trace` 时三段齐全：人话 · `traceId` · 「复制详情」；
 *  ③ 「复制详情」把三样一起进剪贴板（人话 + 短码 + 非生产的原始 message）；
 *  ④ `detail` 缺席（= 生产环境，判据在服务端）时那一段不渲染。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(',')}` : key
    return t
  },
}))

describe('StudioOperatorErrorBar', () => {
  it('没有 trace 时只画那句人话', () => {
    render(<StudioOperatorErrorBar text="助手没能完成这次请求" trace={null} />)

    expect(screen.getByTestId('operator-error')).toHaveTextContent(
      '助手没能完成这次请求',
    )
    expect(screen.queryByTestId('operator-error-trace')).toBeNull()
    expect(screen.queryByTestId('operator-error-copy')).toBeNull()
    expect(screen.queryByTestId('operator-error-detail')).toBeNull()
  })

  it('有 trace 时三段齐全，短码走等宽槽', () => {
    render(
      <StudioOperatorErrorBar
        text="内部错误"
        trace={{ traceId: 'a1b2c3d4', detail: "reading 'findMany'" }}
      />,
    )

    expect(screen.getByTestId('operator-error')).toHaveAttribute(
      'data-trace-id',
      'a1b2c3d4',
    )
    const trace = screen.getByTestId('operator-error-trace')
    expect(trace).toHaveTextContent('a1b2c3d4')
    expect(trace.className).toContain('font-mono')
    expect(screen.getByTestId('operator-error-copy')).toBeInTheDocument()
    expect(screen.getByTestId('operator-error-detail')).toHaveTextContent(
      "reading 'findMany'",
    )
  })

  it('⛔ 生产环境（服务端没下发 detail）那一段不渲染', () => {
    render(
      <StudioOperatorErrorBar
        text="内部错误"
        trace={{ traceId: 'deadbeef' }}
      />,
    )

    expect(screen.getByTestId('operator-error-trace')).toBeInTheDocument()
    expect(screen.queryByTestId('operator-error-detail')).toBeNull()
  })

  it('「复制详情」把人话、短码与原始 message 一起进剪贴板', async () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    render(
      <StudioOperatorErrorBar
        text="内部错误"
        trace={{ traceId: 'a1b2c3d4', detail: 'table is missing' }}
      />,
    )
    fireEvent.click(screen.getByTestId('operator-error-copy'))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const copied = writeText.mock.calls[0]![0]
    expect(copied).toContain('内部错误')
    expect(copied).toContain('a1b2c3d4')
    expect(copied).toContain('table is missing')
    // 复制之后那颗钮改口 —— 点下去要有可见反馈（`ui-defaults.md §5`）。
    await waitFor(() =>
      expect(screen.getByTestId('operator-error-copy')).toHaveTextContent(
        'error.copied',
      ),
    )
  })
})
