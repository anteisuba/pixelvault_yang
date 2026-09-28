// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StudioOperatorLoraSetupCard } from './StudioOperatorLoraSetupCard'
import type { StudioOperatorLoraSetupPrompt } from './StudioOperatorLoraSetupCard'
import type { AssistantOperatorLoraPickCandidate } from '@/types/assistant-operator'

/**
 * **搭配卡**的回归闸（lora-assistant §12）。
 *
 * 钉五件事：
 *  ① 一行一处变化：＋ 新挂 · 权重 a → b · － 卸下 · 参数（只写变了的，宽高合成「尺寸」）；
 *  ② 超预算标红 + 一句提醒，**按钮照旧可点**（§5）；
 *  ③ 应用中按钮换字、不可再点；
 *  ④ 已应用收成一行，有几处没成照实写；
 *  ⑤ 「先不用」调 `onDismiss`。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(',')}` : key
    return t
  },
}))

const candidate: AssistantOperatorLoraPickCandidate = {
  candidateId: 'civitai:1',
  source: 'civitai',
  name: '祀 (Sue)',
  author: 'someone',
  family: 'illustrious',
  triggerWords: ['sue'],
  downloads: 1200,
  licenseLabel: null,
  licenseKnown: false,
  commercialUse: null,
  importable: true,
  compatible: true,
  alreadyMounted: false,
  alreadyImported: false,
  defaultWeight: 0.8,
  recommended: false,
  importPayload: null,
}

function prompt(
  over: Partial<StudioOperatorLoraSetupPrompt> = {},
  setupOver: Partial<StudioOperatorLoraSetupPrompt['setup']> = {},
): StudioOperatorLoraSetupPrompt {
  return {
    id: 'confirm-1',
    kind: 'loraSetup',
    status: 'idle',
    setup: {
      question: '给你搭了一套',
      baseFamilyLabel: 'illustrious',
      budget: { total: 1.35, limit: 1.5 },
      mounts: [{ candidate, weight: 0.75 }],
      unmounts: [{ loraId: 'asset-old', name: '旧画风 LoRA' }],
      weights: [
        { loraId: 'asset-dt', name: 'Detail Tweaker', from: 0.8, to: 0.4 },
      ],
      parameters: {
        patch: {
          runnerSampler: 'euler_ancestral',
          steps: 30,
          runnerWidth: 832,
          runnerHeight: 1216,
        },
        previous: {
          runnerSampler: null,
          steps: 28,
          runnerWidth: null,
          runnerHeight: null,
        },
      },
      ...setupOver,
    },
    ...over,
  }
}

function renderCard(value: StudioOperatorLoraSetupPrompt) {
  const onApply = vi.fn()
  const onDismiss = vi.fn()
  render(
    <StudioOperatorLoraSetupCard
      prompt={value}
      onApply={onApply}
      onDismiss={onDismiss}
      formatTime={() => '11:24'}
    />,
  )
  return { onApply, onDismiss }
}

describe('StudioOperatorLoraSetupCard（搭配卡）', () => {
  afterEach(cleanup)

  it('一行一处变化：新挂 · 权重 a → b · 卸下 · 参数只写变了的', () => {
    renderCard(prompt())

    expect(
      screen.getByTestId('operator-lora-setup-mount').textContent,
    ).toContain('0.75')
    expect(
      screen.getByTestId('operator-lora-setup-weight').textContent,
    ).toContain('0.80 → 0.40')
    expect(
      screen.getByTestId('operator-lora-setup-unmount').textContent,
    ).toContain('confirm.loraSetup.unmount')
    const parameters = screen.getByTestId(
      'operator-lora-setup-parameters',
    ).textContent
    expect(parameters).toContain(
      'confirm.loraSetup.param.runnerSampler confirm.loraSetup.paramDefault → euler_ancestral',
    )
    expect(parameters).toContain('confirm.loraSetup.param.steps 28 → 30')
    // 宽高合成一格「尺寸」。
    expect(parameters).toContain(
      'confirm.loraSetup.param.size confirm.loraSetup.paramDefault → 832×1216',
    )
  })

  it('超预算标红并提醒，⛔ 按钮照旧可点', () => {
    const { onApply } = renderCard(
      prompt({}, { budget: { total: 1.8, limit: 1.5 } }),
    )

    expect(
      screen.getByTestId('operator-lora-setup-tally').dataset.overBudget,
    ).toBe('true')
    expect(
      screen.getByTestId('operator-lora-setup-over-budget'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('operator-lora-setup-apply'))
    expect(onApply).toHaveBeenCalledOnce()
  })

  it('应用中按钮换字、不可再点', () => {
    const { onApply } = renderCard(prompt({ status: 'submitting' }))

    const apply = screen.getByTestId('operator-lora-setup-apply')
    expect(apply.textContent).toBe('confirm.loraSetup.applying')
    expect(apply).toBeDisabled()
    fireEvent.click(apply)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('已应用收成一行，有几处没成照实写', () => {
    renderCard(
      prompt({
        status: 'confirmed',
        decidedAt: '2026-09-28T03:24:00.000Z',
        failedCount: 1,
      }),
    )

    expect(
      screen.getByTestId('operator-lora-setup-state').textContent,
    ).toContain('confirm.loraSetup.appliedPartial:11:24,1')
    expect(screen.queryByTestId('operator-lora-setup-apply')).toBeNull()
  })

  it('「先不用」调 onDismiss', () => {
    const { onDismiss } = renderCard(prompt())

    fireEvent.click(screen.getByTestId('operator-lora-setup-dismiss'))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
