import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { AssistantOperatorGenerationRequest } from '@/types/assistant-operator'

import { StudioOperatorSpendConfirmCard } from './StudioOperatorSpendConfirmCard'

/**
 * 生成确认卡的回归闸（v2 §3.3 / §5）。
 *
 * 钉三件事：
 *  ① 三要素（模型 / 张数 / 规格）都在卡上 —— 少一样用户就是在盲按；
 *  ② 「确认生成」不带任何载荷：扳机在宿主那颗生成键上，⛔ 不重发一轮；
 *  ③ ⛔ **卡上没有花费读数、也没有「本会话不再问」**（决策 8）—— 花费确认整条
 *     删掉，那颗勾选是它的配件，一起走。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const REQUEST: AssistantOperatorGenerationRequest = {
  model: { id: 'seedream-4', label: 'Seedream 4' },
  count: 2,
  specs: { aspectRatio: '1:1', resolution: '2K', durationSeconds: null },
}

function renderCard(request = REQUEST) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <StudioOperatorSpendConfirmCard
      request={request}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  )
  return { onConfirm, onCancel }
}

describe('StudioOperatorSpendConfirmCard', () => {
  it('三要素都在卡上', () => {
    renderCard()
    expect(screen.getByTestId('operator-spend-model').textContent).toBe(
      'Seedream 4',
    )
    expect(screen.getByTestId('operator-spend-count').textContent).toBe('2')
    expect(screen.getByTestId('operator-spend-specs').textContent).toBe(
      '1:1 · 2K',
    )
  })

  it('「确认生成」不带载荷 —— 扳机在宿主那颗生成键上', () => {
    const { onConfirm } = renderCard()
    fireEvent.click(screen.getByTestId('operator-spend-confirm'))
    expect(onConfirm).toHaveBeenCalledWith()
  })

  it('「取消」不带任何载荷', () => {
    const { onCancel, onConfirm } = renderCard()
    fireEvent.click(screen.getByTestId('operator-spend-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('⛔ 卡上没有花费读数，也没有「本会话不再问」（决策 8）', () => {
    renderCard()
    expect(screen.queryByTestId('operator-spend-credits')).toBeNull()
    expect(screen.queryByTestId('operator-spend-remember')).toBeNull()
  })

  it('视频档把时长也摆出来', () => {
    renderCard({
      ...REQUEST,
      count: 1,
      specs: { aspectRatio: '16:9', resolution: '1080p', durationSeconds: 5 },
    })
    expect(screen.getByTestId('operator-spend-specs').textContent).toBe(
      '16:9 · 1080p · spend.seconds',
    )
  })
})
