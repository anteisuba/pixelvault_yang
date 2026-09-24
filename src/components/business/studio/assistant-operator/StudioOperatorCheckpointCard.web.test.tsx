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

  /**
   * **断点续跑**（第三期）—— 三件事：缺席不画、在场画一颗带步号的按钮、
   * 失败那句原因写在旁边。
   */
  describe('续跑', () => {
    it('没有未完成计划时⛔ 一颗按钮都不画（不画停用态）', () => {
      renderCard()
      expect(screen.queryByTestId('operator-checkpoint-resume')).toBeNull()
    })

    it('有未完成计划时画「从第 N 步继续」，点了把命令交出去', () => {
      const onResume = vi.fn()
      render(
        <StudioOperatorCheckpointCard
          runKey="run-2"
          count={2}
          fieldSummary="提示词"
          onRevert={vi.fn()}
          resume={{ stepNumber: 4, onResume }}
        />,
      )
      const button = screen.getByTestId('operator-checkpoint-resume')
      expect(button.dataset.step).toBe('4')
      fireEvent.click(button)
      expect(onResume).toHaveBeenCalledTimes(1)
    })

    it('失败步把原因写在按钮旁边；不是失败（刷新/被掐）就不写', () => {
      const { unmount } = render(
        <StudioOperatorCheckpointCard
          runKey="run-3"
          count={1}
          fieldSummary="提示词"
          onRevert={vi.fn()}
          resume={{
            stepNumber: 2,
            failedReason: '模型超时',
            onResume: vi.fn(),
          }}
        />,
      )
      expect(
        screen.getByTestId('operator-checkpoint-resume-reason').textContent,
      ).toContain('resume.failed')
      unmount()

      render(
        <StudioOperatorCheckpointCard
          runKey="run-4"
          count={1}
          fieldSummary="提示词"
          onRevert={vi.fn()}
          resume={{ stepNumber: 2, onResume: vi.fn() }}
        />,
      )
      expect(
        screen.queryByTestId('operator-checkpoint-resume-reason'),
      ).toBeNull()
    })
  })
})
