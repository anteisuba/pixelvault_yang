import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import zhMessages from '@/messages/zh.json'

import {
  STUDIO_OPERATOR_CARD_KINDS,
  STUDIO_OPERATOR_SPEAKERS,
  StudioOperatorTimelineList,
  StudioOperatorTimelineRow,
  StudioOperatorTurns,
} from './StudioOperatorTimelineRow'

/**
 * 对话流一行的回归闸（D12 A 定稿）。
 *
 *  ① 一轮一个框、一框一次头像名字（B-C）；用户气泡不带名字；
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
  it('用户那一句靠右、不带名字与头像', () => {
    render(
      <StudioOperatorTimelineRow
        card={STUDIO_OPERATOR_CARD_KINDS.message}
        speaker={STUDIO_OPERATOR_SPEAKERS.user}
      >
        <p>保留三图分工，只修改背景。</p>
      </StudioOperatorTimelineRow>,
    )
    expect(screen.getByTestId('operator-timeline-row').dataset.align).toBe(
      'end',
    )
    expect(screen.queryByTestId('operator-speaker-name')).toBeNull()
  })

  /**
   * ⭐ 对话框 B-C（owner 2026-09-25）：你每开口一次，助手另起一个框；连续的助手
   * 条目收进同一个框，头像名字在框外、一框一次。
   */
  it('连续的助手条目收进一个框，你开口就另起一框', () => {
    render(
      <StudioOperatorTurns
        items={[
          {
            key: 'u1',
            speaker: STUDIO_OPERATOR_SPEAKERS.user,
            node: <p>画一张</p>,
          },
          {
            key: 'a1',
            speaker: STUDIO_OPERATOR_SPEAKERS.assistant,
            node: <p>好</p>,
          },
          {
            key: 'a2',
            speaker: STUDIO_OPERATOR_SPEAKERS.assistant,
            node: <p>确认卡</p>,
          },
          {
            key: 'a3',
            speaker: STUDIO_OPERATOR_SPEAKERS.assistant,
            node: null,
          },
          {
            key: 'u2',
            speaker: STUDIO_OPERATOR_SPEAKERS.user,
            node: <p>继续</p>,
          },
          {
            key: 'a4',
            speaker: STUDIO_OPERATOR_SPEAKERS.assistant,
            node: <p>出好了</p>,
          },
        ]}
      />,
    )
    const frames = screen.getAllByTestId('operator-turn-frame')
    expect(frames).toHaveLength(2)
    expect(frames[0]).toHaveTextContent('好确认卡')
    expect(frames[1]).toHaveTextContent('出好了')
    expect(screen.getAllByTestId('operator-speaker-name')).toHaveLength(2)
    for (const frame of frames) {
      expect(frame).not.toContainElement(
        screen.getAllByTestId('operator-speaker-name')[0]!,
      )
    }
    expect(screen.getByText('继续')).not.toBeNull()
  })

  it('只有空条目的助手段不画空框', () => {
    render(
      <StudioOperatorTurns
        items={[
          {
            key: 'a1',
            speaker: STUDIO_OPERATOR_SPEAKERS.assistant,
            node: null,
          },
          {
            key: 'a2',
            speaker: STUDIO_OPERATOR_SPEAKERS.assistant,
            node: false,
          },
        ]}
      />,
    )
    expect(screen.queryByTestId('operator-turn-frame')).toBeNull()
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
