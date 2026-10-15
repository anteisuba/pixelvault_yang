import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorToolGroup } from './StudioOperatorToolGroup'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values && 'count' in values ? `${key}:${String(values.count)}` : key,
}))

describe('StudioOperatorToolGroup', () => {
  it('keeps failed attempts collapsed and exposes one blocker outside the details', () => {
    render(
      <StudioOperatorToolGroup
        total={8}
        failed={8}
        running={false}
        failure={<p>提示词尚未修改</p>}
      >
        <button>执行详情</button>
      </StudioOperatorToolGroup>,
    )
    expect(screen.getByTestId('operator-tool-group-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.getByText('提示词尚未修改')).toBeVisible()
    expect(screen.queryByRole('button', { name: '执行详情' })).toBeNull()
    expect(screen.getByTestId('operator-tool-group-failed')).toHaveTextContent(
      'toolGroup.failed:8',
    )
    fireEvent.click(screen.getByTestId('operator-tool-group-toggle'))
    expect(screen.getByRole('button', { name: '执行详情' })).toBeVisible()
  })

  it('shows the current action, opens itself while running, and is not a live region', () => {
    render(
      <StudioOperatorToolGroup
        total={2}
        failed={0}
        running
        runningTitle="正在看图…"
      >
        <p>内部记录</p>
      </StudioOperatorToolGroup>,
    )
    expect(screen.getByTestId('operator-tool-group-running')).toHaveTextContent(
      '正在看图…',
    )
    // 播报只走面板那颗隐藏的 role=status —— 这一行⛔ 不再是 live region。
    expect(screen.queryByRole('status')).toBeNull()
    // 跑着时标题前有那三颗起伏的小点，跑完的步骤没有。
    expect(
      screen
        .getByTestId('operator-tool-group-toggle')
        .querySelectorAll('.animate-thinking-dot'),
    ).toHaveLength(3)
    // §9.1：运行中自动展开。
    expect(screen.getByTestId('operator-tool-group-toggle')).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByText('内部记录')).toBeVisible()
    expect(screen.queryByTestId('operator-tool-group-succeeded')).toBeNull()
  })

  it('collapses itself when the run finishes if the user never touched it', () => {
    const { rerender } = render(
      <StudioOperatorToolGroup total={1} failed={0} running>
        <p>详情</p>
      </StudioOperatorToolGroup>,
    )
    expect(screen.getByTestId('operator-tool-group')).toHaveAttribute(
      'data-open',
      'true',
    )
    rerender(
      <StudioOperatorToolGroup total={1} failed={0} running={false}>
        <p>详情</p>
      </StudioOperatorToolGroup>,
    )
    expect(screen.getByTestId('operator-tool-group')).toHaveAttribute(
      'data-open',
      'false',
    )
  })

  it('shows no activity dots once the group has finished', () => {
    render(
      <StudioOperatorToolGroup total={2} failed={0} running={false}>
        <p>内部记录</p>
      </StudioOperatorToolGroup>,
    )
    expect(
      screen
        .getByTestId('operator-tool-group-toggle')
        .querySelectorAll('.animate-thinking-dot'),
    ).toHaveLength(0)
  })

  it('preserves the user choice through running and failure transitions', () => {
    const { rerender } = render(
      <StudioOperatorToolGroup total={1} failed={0} running>
        <p>详情</p>
      </StudioOperatorToolGroup>,
    )
    // 跑着时自动开着；用户点一下 = 收起，并且从此以用户为准。
    fireEvent.click(screen.getByTestId('operator-tool-group-toggle'))
    expect(screen.getByTestId('operator-tool-group-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    fireEvent.click(screen.getByTestId('operator-tool-group-toggle'))
    rerender(
      <StudioOperatorToolGroup total={2} failed={1} running={false}>
        <p>详情</p>
      </StudioOperatorToolGroup>,
    )
    // 用户手动展开过 —— 跑完⛔ 不自动收起。
    expect(screen.getByTestId('operator-tool-group-toggle')).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    fireEvent.click(screen.getByTestId('operator-tool-group-toggle'))
    rerender(
      <StudioOperatorToolGroup total={3} failed={2} running={false}>
        <p>详情</p>
      </StudioOperatorToolGroup>,
    )
    expect(screen.getByTestId('operator-tool-group-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('keeps skipped operations separate from failures', () => {
    render(
      <StudioOperatorToolGroup total={3} failed={0} skipped={1} running={false}>
        <p>详情</p>
      </StudioOperatorToolGroup>,
    )
    expect(screen.getByTestId('operator-tool-group-skipped')).toHaveTextContent(
      'toolGroup.skipped:1',
    )
    expect(screen.queryByTestId('operator-tool-group-failed')).toBeNull()
  })
})
