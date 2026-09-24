// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorCheckpointCard } from './StudioOperatorCheckpointCard'

/**
 * 每轮「撤销」的回归闸 —— 撤回的唯一入口（owner 2026-09-24）。
 *
 * 钉两件事：
 *  ① 点一下就撤，⛔ 不再展开二选；
 *  ② 撤完变成「已撤销」，⛔ 不留一颗还能再点一次的撤销钮。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function renderCard() {
  const onRevert = vi.fn()
  render(
    <StudioOperatorCheckpointCard
      runKey="run-1"
      count={3}
      fieldSummary="模型 · 提示词 · 参考图"
      onRevert={onRevert}
    />,
  )
  return { onRevert }
}

describe('StudioOperatorCheckpointCard', () => {
  it('默认只画一颗撤销', () => {
    renderCard()
    expect(screen.getByTestId('operator-checkpoint-undo')).toBeTruthy()
  })

  it('成功改动的执行明细收进同一张卡，默认不占时间线高度', () => {
    render(
      <StudioOperatorCheckpointCard
        runKey="run-compact"
        count={1}
        fieldSummary="提示词"
        onRevert={vi.fn()}
        details={<span>写入节点提示词</span>}
        detailsCount={1}
      />,
    )
    const details = screen.getByText('写入节点提示词').closest('details')
    expect(details?.open).toBe(false)
    fireEvent.click(details!.querySelector('summary')!)
    expect(details?.open).toBe(true)
  })

  it('点一下就撤：交出这一轮的 runKey，就地换成「已撤销」', () => {
    const { onRevert } = renderCard()
    fireEvent.click(screen.getByTestId('operator-checkpoint-undo'))
    expect(onRevert).toHaveBeenCalledWith('run-1')
    expect(screen.getByTestId('operator-checkpoint').dataset.reverted).toBe(
      'true',
    )
    expect(
      screen.getByTestId('operator-checkpoint-done').textContent,
    ).toContain('checkpoint.reverted')
    expect(screen.queryByTestId('operator-checkpoint-undo')).toBeNull()
  })
})
