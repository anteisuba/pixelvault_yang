import { StudioOperatorReferenceAnalysisCard } from './StudioOperatorReferenceAnalysisCard'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_TIMELINE } from '@/constants/studio-assistant-operator'

import {
  STUDIO_OPERATOR_NODE_KINDS,
  StudioOperatorTimelineList,
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

// 词表桩回键名 + 参数，行标签那几条断言按键名读。
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.name ? `${key}:${values.name}` : key,
}))

vi.mock('@/hooks/use-my-profile', () => ({
  useMyProfile: () => ({ profile: null, isLoading: false, refresh: vi.fn() }),
}))

describe('StudioOperatorTimelineRow', () => {
  it('renders visual facts and the source thumbnail without a role brief', () => {
    render(
      <StudioOperatorReferenceAnalysisCard
        analysis={{
          brief: null,
          profiles: [
            {
              url: 'https://cdn.test/third.png',
              identity: 'Character features',
              pose: 'Standing',
              scene: 'White backdrop',
              uncertainties: [],
              style: {
                proportions: 'Stylized',
                contours: 'Clean contours',
                shading: 'Soft shadows',
                materials: 'Matte',
                palette: 'Muted',
                lighting: 'Diffuse',
              },
            },
          ],
        }}
      />,
    )
    expect(screen.getByText('Character features')).toBeVisible()
    expect(screen.getByText('contours：Clean contours')).toBeVisible()
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.test/third.png',
    )
    expect(screen.queryByText('requirements')).not.toBeInTheDocument()
  })
  it('沟宽 24px，五档 data-node 都落在行上', () => {
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

  it('会说话的两方挂 32px 头像，且没有形状节点', () => {
    const { rerender } = render(
      <StudioOperatorTimelineRow node={STUDIO_OPERATOR_NODE_KINDS.user}>
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-avatar').dataset.speaker).toBe(
      'user',
    )
    expect(screen.getByTestId('operator-timeline-avatar').className).toContain(
      'size-8',
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

  /**
   * 读屏那一条（2026-09-06 真机：整条线只听得到内容，听不出谁在说）。
   * 行标签必须**跟着 `data-node` 走**，助手行念的是用户给助手起的名字。
   */
  it('每一档都有 aria-label，助手行念 persona 名字', () => {
    const { rerender } = render(
      <StudioOperatorTimelineRow node={STUDIO_OPERATOR_NODE_KINDS.user}>
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-row')).toHaveAttribute(
      'aria-label',
      'rowUser:assistantFallback',
    )

    rerender(
      <StudioOperatorTimelineRow node={STUDIO_OPERATOR_NODE_KINDS.tool}>
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-row')).toHaveAttribute(
      'aria-label',
      'rowTool:assistantFallback',
    )

    rerender(
      <StudioOperatorTimelineRow
        node={STUDIO_OPERATOR_NODE_KINDS.assistant}
        persona={{
          name: '小满',
          avatarPreset: 'mark',
          avatarUrl: null,
          tone: 'professional',
          toneCustom: null,
          verbosity: 'standard',
          planMode: 'auto',
          language: 'ui',
        }}
      >
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-row')).toHaveAttribute(
      'aria-label',
      'rowAssistant:小满',
    )
  })

  /** 流容器是 live region —— 一步一步长出来的东西，读屏得自己听见。 */
  it('StudioOperatorTimelineList 是 role=log 的 polite live region', () => {
    render(
      <StudioOperatorTimelineList data-testid="operator-thread">
        <span />
      </StudioOperatorTimelineList>,
    )
    const list = screen.getByTestId('operator-thread')
    expect(list).toHaveAttribute('role', 'log')
    expect(list).toHaveAttribute('aria-live', 'polite')
    expect(list).toHaveAttribute('aria-label', 'listLabel')
  })

  it.each(Object.values(STUDIO_OPERATOR_NODE_KINDS))(
    '%s 行不显示时间',
    (node) => {
      const { container } = render(
        <StudioOperatorTimelineRow node={node}>
          <span>内容</span>
        </StudioOperatorTimelineRow>,
      )
      expect(container.querySelector('time')).toBeNull()
      expect(container.textContent).not.toMatch(/\d{2}:\d{2}/)
    },
  )
})
