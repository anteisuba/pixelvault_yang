// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { STUDIO_OPERATOR_RAIL_TONES } from '@/constants/studio-assistant-operator'

import { StudioOperatorIconRail } from './StudioOperatorIconRail'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function renderRail(
  overrides: Partial<Parameters<typeof StudioOperatorIconRail>[0]> = {},
) {
  const onExpand = vi.fn()
  render(
    <StudioOperatorIconRail
      domain={ASSISTANT_PROTOCOL_DOMAIN_IDS.image}
      status="idle"
      primed={false}
      stepsDone={0}
      plannedSteps={0}
      onExpand={onExpand}
      {...overrides}
    />,
  )
  return { onExpand }
}

describe('StudioOperatorIconRail', () => {
  it('渲染紧凑助手按钮与图标', () => {
    renderRail()
    const rail = screen.getByTestId('operator-rail')
    expect(rail).toHaveTextContent('title')
    expect(rail).not.toHaveClass('inset-y-0')
    expect(screen.getByTestId('operator-rail-domain')).toBeTruthy()
  })

  it('空闲时状态点是中性档，读数说「待命」', () => {
    renderRail()
    expect(screen.getByTestId('operator-rail').dataset.tone).toBe(
      STUDIO_OPERATOR_RAIL_TONES.idle,
    )
    expect(screen.getByTestId('operator-rail-readout').textContent).toBe(
      `rail.${STUDIO_OPERATOR_RAIL_TONES.idle}`,
    )
  })

  it('运行中出进度环 + N/M 读数，状态点转 working 档', () => {
    renderRail({ status: 'working', stepsDone: 3, plannedSteps: 6 })
    expect(screen.getByTestId('operator-rail').dataset.tone).toBe(
      STUDIO_OPERATOR_RAIL_TONES.working,
    )
    expect(screen.getByTestId('operator-rail-ring')).toBeTruthy()
    expect(screen.getByTestId('operator-rail-readout').textContent).toBe('3/6')
  })

  it('等确认时状态点转 warning 档（胶囊的 awaitingConfirm 那一格）', () => {
    renderRail({ status: 'awaitingConfirm' })
    expect(screen.getByTestId('operator-rail').dataset.tone).toBe(
      STUDIO_OPERATOR_RAIL_TONES.awaiting,
    )
  })

  it('primed 时读数说「已备好」——它不占状态点的档', () => {
    renderRail({ primed: true })
    const rail = screen.getByTestId('operator-rail')
    expect(rail.dataset.primed).toBe('true')
    expect(rail.dataset.tone).toBe(STUDIO_OPERATOR_RAIL_TONES.idle)
    expect(screen.getByTestId('operator-rail-readout').textContent).toBe(
      'rail.primed',
    )
  })

  it('点整条轨就展开', () => {
    const { onExpand } = renderRail()
    fireEvent.click(screen.getByTestId('operator-rail'))
    expect(onExpand).toHaveBeenCalledTimes(1)
  })
})
