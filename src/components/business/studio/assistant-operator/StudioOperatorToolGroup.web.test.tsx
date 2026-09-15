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

  it('shows the current action without opening the log or counting running steps as successes', () => {
    render(
      <StudioOperatorToolGroup
        total={2}
        failed={0}
        running
        runningTitle="核对参考图"
      >
        <p>内部记录</p>
      </StudioOperatorToolGroup>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('核对参考图')
    expect(screen.getByTestId('operator-tool-group-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByTestId('operator-tool-group-succeeded')).toBeNull()
  })

  it('preserves a manual expansion through running and failure transitions', () => {
    const { rerender } = render(
      <StudioOperatorToolGroup total={1} failed={0} running>
        <p>详情</p>
      </StudioOperatorToolGroup>,
    )
    fireEvent.click(screen.getByTestId('operator-tool-group-toggle'))
    rerender(
      <StudioOperatorToolGroup total={2} failed={1} running={false}>
        <p>详情</p>
      </StudioOperatorToolGroup>,
    )
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
