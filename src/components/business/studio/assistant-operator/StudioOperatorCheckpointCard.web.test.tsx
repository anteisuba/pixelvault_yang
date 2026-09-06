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
})
