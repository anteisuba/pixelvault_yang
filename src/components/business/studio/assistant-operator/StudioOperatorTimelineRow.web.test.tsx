import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import zhMessages from '@/messages/zh.json'

import {
  STUDIO_OPERATOR_CARD_KINDS,
  STUDIO_OPERATOR_SPEAKERS,
  StudioOperatorTimelineList,
  StudioOperatorTimelineRow,
} from './StudioOperatorTimelineRow'

/**
 * 对话流一行的回归闸（D12 A 定稿）。
 *
 *  ① 一轮一次头像名字，挂在用户那一句后面；用户气泡不带名字；
 *  ② ⛔ 左侧竖线与节点符号；
 *  ③ 行标签（读屏唯一的发言人信息）与 live region；
 *  ④ 任何一行都不显示时间戳。
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

describe('StudioOperatorTimelineRow', () => {
  /**
   * ⭐ D12 A · C1：**一轮只出一次头像名字**，挂在用户那一句后面；助手的各行
   * 自己不再带名字。
   */
  it('用户那一句靠右、不带名字；后面紧跟本轮的头像名字（默认 ANTI）', () => {
    render(
      <StudioOperatorTimelineRow
        card={STUDIO_OPERATOR_CARD_KINDS.message}
        speaker={STUDIO_OPERATOR_SPEAKERS.user}
      >
        <p>保留三图分工，只修改背景。</p>
      </StudioOperatorTimelineRow>,
    )
    const row = screen.getByTestId('operator-timeline-row')
    expect(row.dataset.align).toBe('end')
    expect(row).not.toContainElement(
      screen.getByTestId('operator-speaker-name'),
    )
    expect(screen.getByTestId('operator-speaker-name')).toHaveTextContent(
      'ANTI',
    )
    expect(
      row.compareDocumentPosition(screen.getByTestId('operator-round-header')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('助手那一侧的各行不再各带头像名字', () => {
    render(
      <StudioOperatorTimelineRow card={STUDIO_OPERATOR_CARD_KINDS.message}>
        <p>已更新分工。</p>
      </StudioOperatorTimelineRow>,
    )
    expect(screen.queryByTestId('operator-speaker-name')).toBeNull()
    expect(screen.getByTestId('operator-timeline-row').dataset.align).toBe(
      'start',
    )
  })

  /** ⛔ 左侧时间线竖线与节点符号（D12 A）—— 形状只剩 data-node 这个读数。 */
  it.each(Object.values(STUDIO_OPERATOR_CARD_KINDS))(
    '%s 行不画节点符号',
    (card) => {
      render(
        <StudioOperatorTimelineRow card={card}>
          <span />
        </StudioOperatorTimelineRow>,
      )
      expect(screen.queryByTestId('operator-timeline-node')).toBeNull()
    },
  )

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
