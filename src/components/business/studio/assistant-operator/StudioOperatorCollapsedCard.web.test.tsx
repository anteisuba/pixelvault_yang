// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  STUDIO_OPERATOR_RAIL_TONES,
  STUDIO_OPERATOR_SHELL,
} from '@/constants/studio-assistant-operator'

import { StudioOperatorCollapsedCard } from './StudioOperatorCollapsedCard'

/**
 * 收起态微状态卡的回归闸（v2 §4.3 / 画板 BCollapsed）。
 *
 * 钉五件事：
 *  ① 卡高就是 `STUDIO_OPERATOR_SHELL.collapsedHeightPx`，整张卡可点 = 展开；
 *  ② 忙时画那一行状态词（「正在查 3 个来源…」），空闲时**整行不画**；
 *  ③ 待办角标只在 `> 0` 时出现；
 *  ④ 状态点跟着运行态换档，`primed` ⛔ 不占档；
 *  ⑤ ⛔ 图标轨的读数（`N/M` 进度环）一样都不许回来（决策 14）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock(
  '@/components/business/studio/assistant-operator/TimelineAvatar',
  () => ({
    AssistantTimelineAvatar: ({ className }: { className?: string }) => (
      <span data-testid="operator-collapsed-avatar" className={className} />
    ),
  }),
)

function renderCard(
  overrides: Partial<Parameters<typeof StudioOperatorCollapsedCard>[0]> = {},
) {
  const onExpand = vi.fn()
  render(
    <StudioOperatorCollapsedCard
      status="idle"
      primed={false}
      statusText={null}
      todoCount={0}
      onExpand={onExpand}
      {...overrides}
    />,
  )
  return { onExpand }
}

describe('StudioOperatorCollapsedCard', () => {
  it('卡高钉在 40px，整张卡点一下就展开，⛔ 没有进度环', () => {
    const { onExpand } = renderCard()
    const card = screen.getByTestId('operator-collapsed')
    expect(card.style.height).toBe(
      `${STUDIO_OPERATOR_SHELL.collapsedHeightPx}px`,
    )
    expect(screen.queryByTestId('operator-rail-ring')).toBeNull()
    expect(screen.queryByTestId('operator-rail-readout')).toBeNull()
    fireEvent.click(card)
    expect(onExpand).toHaveBeenCalledTimes(1)
  })

  it('忙时画状态词那一行；空闲时整行不画', () => {
    renderCard({ status: 'working', statusText: '正在查 3 个来源…' })
    expect(screen.getByTestId('operator-collapsed-status').textContent).toBe(
      '正在查 3 个来源…',
    )
  })

  it('空闲且没备好 ⛔ 不画状态行（收起态该安静）', () => {
    renderCard()
    expect(screen.queryByTestId('operator-collapsed-status')).toBeNull()
  })

  it('primed 时那一行说「已备好」——它不占状态点的档', () => {
    renderCard({ primed: true })
    expect(screen.getByTestId('operator-collapsed-status').textContent).toBe(
      'rail.primed',
    )
    const card = screen.getByTestId('operator-collapsed')
    expect(card.dataset.primed).toBe('true')
    expect(card.dataset.tone).toBe(STUDIO_OPERATOR_RAIL_TONES.idle)
  })

  it('待办角标只在 > 0 时出现', () => {
    renderCard({ todoCount: 2 })
    expect(screen.getByTestId('operator-collapsed-todo').textContent).toBe('2')
  })

  it('没有待办就 ⛔ 不画一颗写着 0 的圈', () => {
    renderCard()
    expect(screen.queryByTestId('operator-collapsed-todo')).toBeNull()
  })

  it('状态点跟着运行态换档', () => {
    renderCard({ status: 'awaitingConfirm' })
    expect(screen.getByTestId('operator-collapsed').dataset.tone).toBe(
      STUDIO_OPERATOR_RAIL_TONES.awaiting,
    )
    expect(
      screen.getByTestId('operator-collapsed-dot').className,
    ).not.toContain('hidden')
  })
})
