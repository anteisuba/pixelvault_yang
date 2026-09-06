// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import {
  STUDIO_OPERATOR_RAIL_TONES,
  STUDIO_OPERATOR_SHELL,
} from '@/constants/studio-assistant-operator'

import { StudioOperatorIconRail } from './StudioOperatorIconRail'

/**
 * 收起态图标轨的回归闸（拍板 7 改口：胶囊 → 48px 竖轨）。
 *
 * 钉四件事：
 *  ① 轨宽就是 `STUDIO_OPERATOR_SHELL.railWidthPx`（真机目检读的也是这个数）；
 *  ② 胶囊那四档状态**真的迁到了状态点**（`data-tone`），不是只换了个形状；
 *  ③ 运行中有进度环与「3/6」读数 —— 收起之后这是唯一还看得见的进度；
 *  ④ 点整条轨就展开（⛔ 不是「点对那颗小箭头才展开」）。
 */

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
  it('渲染成 48px 宽的竖轨，并把域图标画出来', () => {
    renderRail()
    const rail = screen.getByTestId('operator-rail')
    expect(rail.style.width).toBe(`${STUDIO_OPERATOR_SHELL.railWidthPx}px`)
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
