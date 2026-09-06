import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { AssistantOperatorGenerationRequest } from '@/types/assistant-operator'

import { StudioOperatorSpendConfirmCard } from './StudioOperatorSpendConfirmCard'

/**
 * 花钱硬确认卡的回归闸（§6 / §11.4 / §3.1 ⑮–⑰）。
 *
 * 钉四件事：
 *  ① 四要素（模型 / 张数 / 规格 / 预估）都在卡上 —— 少一样用户就是在盲按；
 *  ② 「生成」把「本会话不再问」的勾选原样交出去（拍板 24 的作用域靠它成立）；
 *  ③ 默认**不勾** —— ⛔ 默认勾上等于替用户放弃了每次确认；
 *  ④ 算不出金额时既不画金额也不给勾选：没有金额就没有可比的上限，那颗勾选
 *     在服务端永远命中不了，摆出来只会骗人。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const REQUEST: AssistantOperatorGenerationRequest = {
  model: { id: 'seedream-4', label: 'Seedream 4' },
  count: 2,
  specs: { aspectRatio: '1:1', resolution: '2K', durationSeconds: null },
  estimate: { credits: 6, model: 'Seedream 4', count: 2 },
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
  it('四要素都在卡上', () => {
    renderCard()
    expect(screen.getByTestId('operator-spend-model').textContent).toBe(
      'Seedream 4',
    )
    expect(screen.getByTestId('operator-spend-count').textContent).toBe('2')
    expect(screen.getByTestId('operator-spend-specs').textContent).toBe(
      '1:1 · 2K',
    )
    expect(screen.getByTestId('operator-spend-credits')).toBeTruthy()
  })

  it('默认不勾「不再问」，「生成」交出 false', () => {
    const { onConfirm } = renderCard()
    expect(
      (screen.getByTestId('operator-spend-remember') as HTMLInputElement)
        .checked,
    ).toBe(false)
    fireEvent.click(screen.getByTestId('operator-spend-confirm'))
    expect(onConfirm).toHaveBeenCalledWith({ rememberForSession: false })
  })

  it('勾上之后「生成」交出 true', () => {
    const { onConfirm } = renderCard()
    fireEvent.click(screen.getByTestId('operator-spend-remember'))
    fireEvent.click(screen.getByTestId('operator-spend-confirm'))
    expect(onConfirm).toHaveBeenCalledWith({ rememberForSession: true })
  })

  it('「取消」不带任何载荷', () => {
    const { onCancel, onConfirm } = renderCard()
    fireEvent.click(screen.getByTestId('operator-spend-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('⭐ 算不出金额时既不画金额，也不摆那颗永远无效的勾选', () => {
    renderCard({ ...REQUEST, estimate: { model: 'Seedream 4', count: 2 } })
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
