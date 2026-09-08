// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  STUDIO_OPERATOR_REVERT_CHOICES,
  StudioOperatorCheckpointCard,
} from './StudioOperatorCheckpointCard'

/**
 * checkpoint 薄卡的回归闸（§2.13 / §3.2）。
 *
 * 钉四件事：
 *  ① 默认只有一颗「撤销」，⛔ 不上来就摊开三个按钮；
 *  ② 点撤销**就地**展开二选 + 取消（不弹窗、不跳焦点）；
 *  ③ 两条路各自把 choice 交出去 —— 「连对话一起回」与「只回参数」不是同一件事；
 *  ④ 撤完变成「已撤销 · ××」，⛔ 不留一颗还能再点一次的撤销钮。
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
    expect(screen.queryAllByTestId('operator-checkpoint-choice')).toHaveLength(
      0,
    )
  })

  it('点撤销就地展开二选 + 取消，取消能回到原样', () => {
    renderCard()
    fireEvent.click(screen.getByTestId('operator-checkpoint-undo'))
    expect(screen.queryAllByTestId('operator-checkpoint-choice')).toHaveLength(
      2,
    )
    fireEvent.click(screen.getByTestId('operator-checkpoint-cancel'))
    expect(screen.getByTestId('operator-checkpoint-undo')).toBeTruthy()
  })

  it('「只回参数」交出 params，卡变成已撤销', () => {
    const { onRevert } = renderCard()
    fireEvent.click(screen.getByTestId('operator-checkpoint-undo'))
    const [params] = screen.getAllByTestId('operator-checkpoint-choice')
    fireEvent.click(params as HTMLElement)
    expect(onRevert).toHaveBeenCalledWith(
      'run-1',
      STUDIO_OPERATOR_REVERT_CHOICES.params,
    )
    expect(screen.getByTestId('operator-checkpoint').dataset.reverted).toBe(
      STUDIO_OPERATOR_REVERT_CHOICES.params,
    )
    expect(screen.getByTestId('operator-checkpoint-done').textContent).toBe(
      'checkpoint.reverted.params',
    )
    expect(screen.queryByTestId('operator-checkpoint-undo')).toBeNull()
  })

  it('「连对话一起回」交出 thread', () => {
    const { onRevert } = renderCard()
    fireEvent.click(screen.getByTestId('operator-checkpoint-undo'))
    const [, thread] = screen.getAllByTestId('operator-checkpoint-choice')
    fireEvent.click(thread as HTMLElement)
    expect(onRevert).toHaveBeenCalledWith(
      'run-1',
      STUDIO_OPERATOR_REVERT_CHOICES.thread,
    )
    expect(screen.getByTestId('operator-checkpoint-done').textContent).toBe(
      'checkpoint.reverted.thread',
    )
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
