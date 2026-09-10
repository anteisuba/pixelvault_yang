// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorConfirmCard } from './StudioOperatorConfirmCard'
import { STUDIO_OPERATOR_CONFIRM_STATUS_IDS } from '@/constants/studio-assistant-operator'
import { ASSISTANT_OPERATOR_CONFIRM_KIND_IDS } from '@/constants/assistant-operator'
import type { StudioOperatorConfirmPrompt } from '@/types/studio-assistant-operator'

/**
 * **确认卡**的回归闸（v2 §3.3 / 画板 BCards「确认」那一节的五态）。
 *
 * 钉五件事：
 *  ① 多步：一行动作串 + 「开始 / 一步一步来」两颗，各自走各自的回调；
 *  ② 生成 · 默认态：四颗旋钮读数在场（就地改是 #9，本片只有结构）；
 *  ③ 确认中：两颗按钮都不可点（同一帧里连点 = 两枪）；
 *  ④ 已确认 · 时间：整卡收成一行，⛔ 两颗按钮整个不画；
 *  ⑤ 已取消 · 时间：写「没有执行」，且只有这一格长「再来一次」。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(',')}` : key
    return t
  },
}))

const MULTISTEP: StudioOperatorConfirmPrompt = {
  id: 'c1',
  kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep,
  steps: [
    { id: 's1', label: '查来源' },
    { id: 's2', label: '改提示词' },
    { id: 's3', label: '换模型' },
  ],
  status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
}

const GENERATE: StudioOperatorConfirmPrompt = {
  id: 'c2',
  kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate,
  status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
  request: {
    model: { id: 'flux-2-flash', label: 'FLUX 2 Flash' },
    count: 3,
    specs: {
      aspectRatio: '3:2',
      resolution: '1536',
      durationSeconds: null,
    },
    label: '胶片质感',
  },
}

function renderCard(confirm: StudioOperatorConfirmPrompt) {
  const handlers = {
    onApprove: vi.fn(),
    onDecline: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onRetry: vi.fn(),
  }
  render(
    <StudioOperatorConfirmCard
      confirm={confirm}
      {...handlers}
      formatTime={() => '11:24'}
    />,
  )
  return handlers
}

describe('StudioOperatorConfirmCard', () => {
  it('多步：一行动作串 + 开始 / 一步一步来', () => {
    const handlers = renderCard(MULTISTEP)
    expect(screen.getByTestId('operator-confirm-card').dataset.kind).toBe(
      'multistep',
    )
    expect(screen.getByTestId('operator-confirm-title')).toHaveTextContent(
      'confirm.multistep.title:3',
    )
    expect(screen.getByTestId('operator-confirm-steps')).toHaveTextContent(
      '查来源 · 改提示词 · 换模型',
    )
    fireEvent.click(screen.getByTestId('operator-confirm-primary'))
    expect(handlers.onApprove).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('operator-confirm-secondary'))
    expect(handlers.onDecline).toHaveBeenCalledTimes(1)
    // ⛔ 多步那一支永远不走生成那两颗回调。
    expect(handlers.onConfirm).not.toHaveBeenCalled()
    expect(handlers.onCancel).not.toHaveBeenCalled()
  })

  it('生成 · 默认态：四颗旋钮读数在场，两颗按钮各自走各自的回调', () => {
    const handlers = renderCard(GENERATE)
    const knobs = screen.getAllByTestId('operator-confirm-knob')
    expect(knobs.map((node) => node.dataset.knob)).toEqual([
      'model',
      'aspect',
      'count',
      'resolution',
    ])
    expect(knobs[0]).toHaveTextContent('FLUX 2 Flash')
    expect(knobs[1]).toHaveTextContent('3:2')
    expect(knobs[3]).toHaveTextContent('1536')
    fireEvent.click(screen.getByTestId('operator-confirm-primary'))
    expect(handlers.onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('operator-confirm-secondary'))
    expect(handlers.onCancel).toHaveBeenCalledTimes(1)
  })

  it('确认中：两颗按钮都不可点', () => {
    const handlers = renderCard({
      ...GENERATE,
      status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting,
    })
    const primary = screen.getByTestId('operator-confirm-primary')
    expect(primary).toBeDisabled()
    expect(primary).toHaveTextContent('confirm.state.submitting')
    expect(screen.getByTestId('operator-confirm-secondary')).toBeDisabled()
    fireEvent.click(primary)
    expect(handlers.onConfirm).not.toHaveBeenCalled()
  })

  it('已确认 · 时间：整卡收成一行，⛔ 两颗按钮整个不画', () => {
    renderCard({
      ...GENERATE,
      status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed,
      decidedAt: '2026-09-11T03:24:00.000Z',
    })
    expect(screen.getByTestId('operator-confirm-state')).toHaveTextContent(
      'confirm.state.confirmed:11:24',
    )
    expect(screen.queryByTestId('operator-confirm-primary')).toBeNull()
    expect(screen.queryByTestId('operator-confirm-secondary')).toBeNull()
    expect(screen.queryByTestId('operator-confirm-retry')).toBeNull()
  })

  it('已取消 · 时间：写「没有执行」，并长一颗「再来一次」', () => {
    const handlers = renderCard({
      ...GENERATE,
      status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled,
      decidedAt: '2026-09-11T03:22:00.000Z',
    })
    expect(screen.getByTestId('operator-confirm-state')).toHaveTextContent(
      'confirm.state.cancelled:11:24',
    )
    expect(screen.getByTestId('operator-confirm-card')).toHaveTextContent(
      'confirm.generate.notRun',
    )
    fireEvent.click(screen.getByTestId('operator-confirm-retry'))
    expect(handlers.onRetry).toHaveBeenCalledTimes(1)
  })
})
