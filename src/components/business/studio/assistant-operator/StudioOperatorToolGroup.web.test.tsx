// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_TOOL_GROUP_COLLAPSE_MS } from '@/constants/studio-assistant-operator'

import { StudioOperatorToolGroup } from './StudioOperatorToolGroup'

/**
 * ToolGroup 的回归闸（§2.7 / §3.1 ⑧）。
 *
 * 钉四件事：
 *  ① 流式时**强制展开** —— 正在跑的时候人是想看的；
 *  ② 跑完停 `STUDIO_OPERATOR_TOOL_GROUP_COLLAPSE_MS` 才自动收起，标题换「用时 Ns」；
 *  ③ 失败数单独一格（`text-status-risk` 那一格），⛔ 不和成功数混成一句；
 *  ④ 用户手点过之后**不再自动收** —— 自动化压过显式意图，用户下次就不敢点了。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('StudioOperatorToolGroup', () => {
  it('流式时展开，跑完 1000ms 后自动收起并把标题换成用时', () => {
    const { rerender } = render(
      <StudioOperatorToolGroup total={3} failed={0} running>
        <span data-testid="child" />
      </StudioOperatorToolGroup>,
    )
    const group = screen.getByTestId('operator-tool-group')
    expect(group.dataset.open).toBe('true')
    expect(screen.getByTestId('operator-tool-group-title').textContent).toBe(
      'toolGroup.title',
    )

    rerender(
      <StudioOperatorToolGroup total={3} failed={0} running={false}>
        <span data-testid="child" />
      </StudioOperatorToolGroup>,
    )
    // 还没到点：仍然开着（⛔ 不做「跑完立刻收」）。
    expect(group.dataset.open).toBe('true')

    act(() => {
      vi.advanceTimersByTime(STUDIO_OPERATOR_TOOL_GROUP_COLLAPSE_MS)
    })
    expect(group.dataset.open).toBe('false')
    expect(screen.getByTestId('operator-tool-group-title').textContent).toBe(
      'toolGroup.elapsed',
    )
  })

  it('默认折叠成一行 —— 全成功的那种', () => {
    render(
      <StudioOperatorToolGroup total={5} failed={0} running={false}>
        <span data-testid="child" />
      </StudioOperatorToolGroup>,
    )
    expect(screen.getByTestId('operator-tool-group').dataset.open).toBe('false')
  })

  it('⭐ 有失败步就**自动展开**，并单独画失败计数（2026-09-06 第 5 件）', () => {
    render(
      <StudioOperatorToolGroup total={5} failed={1} running={false}>
        <span data-testid="child" />
      </StudioOperatorToolGroup>,
    )
    // 折起来的那一行只写着「1 失败」，而用户那一刻要看的是它错在哪。
    expect(screen.getByTestId('operator-tool-group').dataset.open).toBe('true')
    expect(screen.getByTestId('operator-tool-group-failed').textContent).toBe(
      'toolGroup.failed',
    )
  })

  it('⭐ 失败组用户**手动收起**之后就收着 —— 自动化⛔ 不压过显式意图', () => {
    render(
      <StudioOperatorToolGroup total={5} failed={1} running={false}>
        <span data-testid="child" />
      </StudioOperatorToolGroup>,
    )
    fireEvent.click(screen.getByTestId('operator-tool-group-toggle'))
    expect(screen.getByTestId('operator-tool-group').dataset.open).toBe('false')
  })

  it('用户手动展开之后不再被自动收起', () => {
    const { rerender } = render(
      <StudioOperatorToolGroup total={2} failed={0} running={false}>
        <span data-testid="child" />
      </StudioOperatorToolGroup>,
    )
    const group = screen.getByTestId('operator-tool-group')
    fireEvent.click(screen.getByTestId('operator-tool-group-toggle'))
    expect(group.dataset.open).toBe('true')

    // 再来一轮「跑完」也不该把用户亲手打开的这一组收掉。
    rerender(
      <StudioOperatorToolGroup total={2} failed={0} running>
        <span data-testid="child" />
      </StudioOperatorToolGroup>,
    )
    rerender(
      <StudioOperatorToolGroup total={2} failed={0} running={false}>
        <span data-testid="child" />
      </StudioOperatorToolGroup>,
    )
    act(() => {
      vi.advanceTimersByTime(STUDIO_OPERATOR_TOOL_GROUP_COLLAPSE_MS * 2)
    })
    expect(group.dataset.open).toBe('true')
  })

  /**
   * pending 那一档（§4.1「ToolGroup pending」）—— 步在开跑时就进组，而那一步
   * 要过好几秒才有结论。⛔ 没有 spinner 的话「它到底在干什么」只能靠盯着猜。
   */
  it('跑着的时候出 spinner 与「进行中」，跑完两样都收掉', () => {
    const { rerender } = render(
      <StudioOperatorToolGroup total={2} failed={0} running>
        <span data-testid="child" />
      </StudioOperatorToolGroup>,
    )
    expect(screen.getByTestId('operator-tool-group-spinner')).toBeTruthy()
    expect(screen.getByTestId('operator-tool-group-running').textContent).toBe(
      'toolGroup.running',
    )

    rerender(
      <StudioOperatorToolGroup total={2} failed={0} running={false}>
        <span data-testid="child" />
      </StudioOperatorToolGroup>,
    )
    expect(screen.queryByTestId('operator-tool-group-spinner')).toBeNull()
    expect(screen.queryByTestId('operator-tool-group-running')).toBeNull()
  })
})
