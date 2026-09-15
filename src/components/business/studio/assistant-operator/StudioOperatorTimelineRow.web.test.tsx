import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_TIMELINE } from '@/constants/studio-assistant-operator'
import zhMessages from '@/messages/zh.json'
import { StudioOperatorReferenceAnalysisCard } from './StudioOperatorReferenceAnalysisCard'

import {
  STUDIO_OPERATOR_CARD_KINDS,
  STUDIO_OPERATOR_SPEAKERS,
  StudioOperatorTimelineList,
  StudioOperatorTimelineRow,
} from './StudioOperatorTimelineRow'

/**
 * 时间线沟的回归闸（§11.3）。
 *
 * 钉四件事：
 *  ① 沟宽就是 `STUDIO_OPERATOR_TIMELINE.gutterPx`（真机目检读同一个数）；
 *  ② **五类卡 + 系统行的分派**（v2 §3.2）各自落在哪一档形状上；
 *  ③ 五档节点各自的形状类不串（大节点实心 / 证据空心 / 系统行短横 / 两方头像）；
 *  ④ 任何一行都不显示时间戳（§11.3）。
 */

// 词表桩回键名 + 参数，行标签那几条断言按键名读。
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    key === 'assistantFallback'
      ? zhMessages.StudioOperator.timeline.assistantFallback
      : values?.name
        ? `${key}:${values.name}`
        : key,
}))

vi.mock('@/hooks/use-my-profile', () => ({
  useMyProfile: () => ({
    profile: { username: 'fulina', displayName: 'Fl', avatarUrl: null },
    isLoading: false,
    refresh: vi.fn(),
  }),
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
    expect(screen.getByText('Character features')).not.toBeVisible()
    fireEvent.click(
      screen
        .getByTestId('operator-reference-analysis')
        .querySelector('summary')!,
    )
    expect(screen.getByText('Character features')).toBeVisible()
    expect(screen.getByText('contours：Clean contours')).toBeVisible()
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.test/third.png',
    )
    expect(screen.queryByText('requirements')).not.toBeInTheDocument()
  })
  it('uses ANTI as the default assistant ID', () => {
    render(
      <StudioOperatorTimelineRow card={STUDIO_OPERATOR_CARD_KINDS.message}>
        <p>已更新分工。</p>
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-speaker-name')).toHaveTextContent(
      'ANTI',
    )
  })
  it('shows the account ID before the message body on its own row', () => {
    render(
      <StudioOperatorTimelineRow
        card={STUDIO_OPERATOR_CARD_KINDS.message}
        speaker={STUDIO_OPERATOR_SPEAKERS.user}
      >
        <p>保留三图分工，只修改背景。</p>
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-speaker-name')).toHaveTextContent('Fl')
    expect(
      screen.getByTestId('operator-timeline-content'),
    ).not.toContainElement(screen.getByTestId('operator-speaker-name'))
  })

  /**
   * 用户消息靠右（画板 Main / BCards「消息 · 用户」）——⛔ 它不再占左沟：
   * 行上没有 `gridTemplateColumns`，头像排在气泡**后面**（DOM 序 = 视觉序）。
   */
  it('用户消息整行靠右，头像在气泡右侧；其余行仍靠左沟', () => {
    const { rerender } = render(
      <StudioOperatorTimelineRow
        card={STUDIO_OPERATOR_CARD_KINDS.message}
        speaker={STUDIO_OPERATOR_SPEAKERS.user}
      >
        <p>保留三图分工，只修改背景。</p>
      </StudioOperatorTimelineRow>,
    )
    const userRow = screen.getByTestId('operator-timeline-row')
    expect(userRow.dataset.align).toBe('end')
    expect(userRow.className).toContain('justify-end')
    expect(userRow.style.gridTemplateColumns).toBe('')
    const avatar = screen.getByTestId('operator-timeline-avatar')
    expect(avatar.dataset.speaker).toBe('user')
    // 头像在内容之后 = 视觉上在气泡右侧。
    expect(
      screen
        .getByTestId('operator-timeline-content')
        .compareDocumentPosition(avatar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // 气泡列限宽在面板 80%，⛔ 不是任意值。
    expect(
      screen.getByTestId('operator-timeline-content').parentElement?.className,
    ).toContain('w-4/5')

    rerender(
      <StudioOperatorTimelineRow card={STUDIO_OPERATOR_CARD_KINDS.message}>
        <p>已更新分工。</p>
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-row').dataset.align).toBe(
      'start',
    )
    expect(screen.getByTestId('operator-timeline-content')).toHaveClass(
      'col-start-2',
    )
  })

  it('沟宽 24px，五档 data-node 都落在行上', () => {
    render(
      <StudioOperatorTimelineRow card={STUDIO_OPERATOR_CARD_KINDS.evidence}>
        <span>tool</span>
      </StudioOperatorTimelineRow>,
    )
    const row = screen.getByTestId('operator-timeline-row')
    expect(row.dataset.card).toBe(STUDIO_OPERATOR_CARD_KINDS.evidence)
    expect(row.dataset.node).toBe('tool')
    expect(row.style.gridTemplateColumns).toBe(
      `${STUDIO_OPERATOR_TIMELINE.gutterPx}px minmax(0, 1fr)`,
    )
  })

  it('大节点是 8px 实心圆、工具步是 6px 空心圆、系统行是 8×2 短横', () => {
    const { rerender } = render(
      <StudioOperatorTimelineRow card={STUDIO_OPERATOR_CARD_KINDS.confirm}>
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-node').className).toContain(
      'size-2 rounded-full bg-primary',
    )

    rerender(
      <StudioOperatorTimelineRow card={STUDIO_OPERATOR_CARD_KINDS.evidence}>
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-node').className).toContain(
      'size-1.5 rounded-full border border-muted-foreground bg-card',
    )

    rerender(
      <StudioOperatorTimelineRow card={STUDIO_OPERATOR_CARD_KINDS.system}>
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-node').className).toContain(
      'h-0.5 w-2 bg-muted-foreground',
    )
  })

  it('会说话的两方挂 32px 头像，且没有形状节点', () => {
    const { rerender } = render(
      <StudioOperatorTimelineRow
        card={STUDIO_OPERATOR_CARD_KINDS.message}
        speaker={STUDIO_OPERATOR_SPEAKERS.user}
      >
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
      <StudioOperatorTimelineRow card={STUDIO_OPERATOR_CARD_KINDS.message}>
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
      <StudioOperatorTimelineRow
        card={STUDIO_OPERATOR_CARD_KINDS.message}
        speaker={STUDIO_OPERATOR_SPEAKERS.user}
      >
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-row')).toHaveAttribute(
      'aria-label',
      'rowUser:ANTI',
    )

    rerender(
      <StudioOperatorTimelineRow card={STUDIO_OPERATOR_CARD_KINDS.evidence}>
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-row')).toHaveAttribute(
      'aria-label',
      'rowTool:ANTI',
    )

    rerender(
      <StudioOperatorTimelineRow
        card={STUDIO_OPERATOR_CARD_KINDS.message}
        persona={{
          name: '小满',
          avatarPreset: 'mark',
          avatarUrl: null,
          tone: 'professional',
          toneCustom: null,
          verbosity: 'standard',
          routeModel: 'auto',
          planMode: 'auto',
          language: 'ui',
          nextStepHint: false,
          useMyWords: true,
          archetype: null,
          addressUserAs: null,
        }}
      >
        <span />
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-row')).toHaveAttribute(
      'aria-label',
      'rowAssistant:小满',
    )
    expect(screen.getByTestId('operator-speaker-name')).toHaveTextContent(
      '小满',
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

  it.each(Object.values(STUDIO_OPERATOR_CARD_KINDS))(
    '%s 行不显示时间',
    (card) => {
      const { container } = render(
        <StudioOperatorTimelineRow card={card}>
          <span>内容</span>
        </StudioOperatorTimelineRow>,
      )
      expect(container.querySelector('time')).toBeNull()
      expect(container.textContent).not.toMatch(/\d{2}:\d{2}/)
    },
  )
})
