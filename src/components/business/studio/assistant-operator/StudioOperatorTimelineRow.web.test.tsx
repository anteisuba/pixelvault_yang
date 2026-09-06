import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_TIMELINE } from '@/constants/studio-assistant-operator'

import {
  STUDIO_OPERATOR_NODE_KINDS,
  StudioOperatorTimelineRow,
} from './StudioOperatorTimelineRow'

/**
 * 时间线沟的回归闸（§11.3）。
 *
 * 钉三件事：
 *  ① 沟宽就是 `STUDIO_OPERATOR_TIMELINE.gutterPx`（真机目检读同一个数）；
 *  ② 五档节点各自的形状类不串（大节点实心 / 工具步空心 / 系统行短横 / 两方头像）；
 *  ③ 头像行的时间戳退到行尾且默认 `opacity-0`（hover 才出），形状节点行不长头像。
 */

vi.mock('@/hooks/use-my-profile', () => ({
  useMyProfile: () => ({ profile: null, isLoading: false, refresh: vi.fn() }),
}))

describe('StudioOperatorTimelineRow', () => {
  it('沟宽 78px，五档 data-node 都落在行上', () => {
    render(
      <StudioOperatorTimelineRow node={STUDIO_OPERATOR_NODE_KINDS.tool}>
        <span>tool</span>
      </StudioOperatorTimelineRow>,
    )
    const row = screen.getByTestId('operator-timeline-row')
    expect(row.dataset.node).toBe(STUDIO_OPERATOR_NODE_KINDS.tool)
    expect(row.style.gridTemplateColumns).toBe(
      `${STUDIO_OPERATOR_TIMELINE.gutterPx}px minmax(0, 1fr)`,
    )
  })

  it('大节点是 8px 实心圆、工具步是 6px 空心圆、系统行是 8×2 短横', () => {
    const { rerender } = render(
      <StudioOperatorTimelineRow node={STUDIO_OPERATOR_NODE_KINDS.big}>
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-node').className).toContain(
      'size-2 rounded-full bg-primary',
    )

    rerender(
      <StudioOperatorTimelineRow node={STUDIO_OPERATOR_NODE_KINDS.tool}>
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-node').className).toContain(
      'size-1.5 rounded-full border border-muted-foreground bg-card',
    )

    rerender(
      <StudioOperatorTimelineRow node={STUDIO_OPERATOR_NODE_KINDS.system}>
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-node').className).toContain(
      'h-0.5 w-2 bg-muted-foreground',
    )
  })

  it('会说话的两方挂 20px 头像，且没有形状节点', () => {
    const { rerender } = render(
      <StudioOperatorTimelineRow node={STUDIO_OPERATOR_NODE_KINDS.user}>
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-avatar').dataset.speaker).toBe(
      'user',
    )
    expect(screen.getByTestId('operator-timeline-avatar').className).toContain(
      'size-5',
    )
    expect(screen.queryByTestId('operator-timeline-node')).toBeNull()

    rerender(
      <StudioOperatorTimelineRow node={STUDIO_OPERATOR_NODE_KINDS.assistant}>
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-avatar').dataset.speaker).toBe(
      'assistant',
    )
  })

  it('头像行的时间戳退到行尾并默认透明；历史行可以整条关掉', () => {
    const { rerender } = render(
      <StudioOperatorTimelineRow node={STUDIO_OPERATOR_NODE_KINDS.user}>
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-time').className).toContain(
      'opacity-0',
    )

    rerender(
      <StudioOperatorTimelineRow
        node={STUDIO_OPERATOR_NODE_KINDS.user}
        withTimestamp={false}
      >
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.queryByTestId('operator-timeline-time')).toBeNull()
  })
})
