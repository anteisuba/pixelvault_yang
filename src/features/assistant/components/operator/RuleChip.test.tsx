import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PROJECT_RULE_SOURCE_IDS } from '@/constants/assistant-operator'

/**
 * 规则薄卡（§10）的回归闸，两条：
 *  ① **不用状态色** —— 规则不是成功也不是警告，走系统行档。这一条最容易在
 *    「顺手统一一下卡片样式」时被改成 `border-warning`，而那会让用户以为出事了。
 *  ② **日期直接切 ISO 串** —— 过 `Intl` 会让「记于哪天」跨时区跳一天。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}))

import { RuleChip } from './RuleChip'

describe('RuleChip', () => {
  it('逐字显示原文、记录日期与来源', () => {
    const { container } = render(
      <RuleChip
        ruleId="rule-1"
        text="Never put text inside the picture."
        source={PROJECT_RULE_SOURCE_IDS.creator}
        createdAt="2026-09-01T23:30:00.000Z"
      />,
    )

    expect(
      screen.getByText('Never put text inside the picture.'),
    ).toBeInTheDocument()
    expect(screen.getByText('recordedOn:2026-09-01')).toBeInTheDocument()
    expect(screen.getByText('sourceCreator')).toBeInTheDocument()

    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('border-border')
    for (const statusToken of ['destructive', 'warning', 'success', 'info']) {
      expect(card.className).not.toContain(statusToken)
    }
  })

  it('给了回调才画「查看规则」，点它带上规则 id', () => {
    const onView = vi.fn()
    render(
      <RuleChip
        ruleId="rule-9"
        text="Skin tones stay warm."
        source={PROJECT_RULE_SOURCE_IDS.assistant}
        createdAt="2026-09-06T10:00:00.000Z"
        onView={onView}
      />,
    )

    fireEvent.click(screen.getByText('view'))
    expect(onView).toHaveBeenCalledWith('rule-9')
  })

  it('没有回调时不画那颗按钮', () => {
    render(
      <RuleChip
        ruleId="rule-9"
        text="Skin tones stay warm."
        source={PROJECT_RULE_SOURCE_IDS.assistant}
        createdAt="2026-09-06T10:00:00.000Z"
      />,
    )
    expect(screen.queryByText('view')).not.toBeInTheDocument()
  })
})
