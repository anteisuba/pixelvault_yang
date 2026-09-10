// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorQuestionCard } from './StudioOperatorQuestionCard'

/**
 * 反问卡的回归闸（2026-09-06 面板轮，第 1 件）。
 *
 * 钉六件事：
 *  ① 推荐项排第一并带「推荐」标 —— 服务端把它放第三位也一样；
 *  ② 单选是 radio 语义（点第二项，第一项自己让位）；
 *  ③ 多选是 checkbox 语义（两项可以同时在）；
 *  ④ 「其他」展开一行输入，答复走 `otherText` 而**不进 `optionIds`**；
 *  ⑤ 没答完点「开始」⛔ 不提交 —— 未答题就地高亮；
 *  ⑥ `resolved` 收成一行「你选了：…」，展开才看得到逐题；
 *  ⑦ 阶段清单折成一行「计划 · N 步」，⛔ 一轮只有这一张卡（第 2 件）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(',')}` : key
    return t
  },
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const SINGLE = {
  id: 'q1',
  header: '取景',
  question: '这一张要取到多少身？',
  multiSelect: false,
  allowOther: true,
  options: [
    {
      id: 'o1',
      label: '半身',
      description: '腰以上，脸看得清',
      visual: 'comp.halfBody' as const,
    },
    { id: 'o2', label: '全身', description: '连鞋一起进画' },
    {
      id: 'o3',
      label: '特写',
      description: '只有脸，细节最足',
      recommended: true,
    },
  ],
}

const MULTI = {
  id: 'q2',
  header: '氛围',
  question: '想要哪些氛围？',
  multiSelect: true,
  allowOther: false,
  options: [
    { id: 'm1', label: '黄昏', description: '暖调，影子拉长' },
    { id: 'm2', label: '雨天', description: '地面有反光' },
  ],
}

function renderCard(
  overrides: Partial<
    React.ComponentProps<typeof StudioOperatorQuestionCard>
  > = {},
) {
  const onSubmit = vi.fn()
  const onRevise = vi.fn()
  render(
    <StudioOperatorQuestionCard
      steps={[{ id: 's1', label: '写提示词' }]}
      questions={[SINGLE]}
      answers={[]}
      resolved={false}
      onSubmit={onSubmit}
      onRevise={onRevise}
      {...overrides}
    />,
  )
  return { onSubmit, onRevise }
}

function optionRows() {
  return screen.getAllByTestId('operator-question-option')
}

describe('StudioOperatorQuestionCard', () => {
  it('⭐ 推荐项排第一并带「推荐」标', () => {
    renderCard()
    const rows = optionRows()
    expect(rows[0]?.dataset.optionId).toBe('o3')
    expect(
      rows[0]?.querySelector('[data-testid="operator-question-recommended"]'),
    ).not.toBeNull()
    // 「其他」那一行固定在末尾。
    expect(rows.at(-1)?.dataset.optionId).toBe('__other__')
  })

  it('⭐ 有题时阶段清单折着，点开才是那几步；没题时默认展开（第 2 件）', () => {
    renderCard()
    expect(screen.queryAllByTestId('operator-plan-step')).toHaveLength(0)
    fireEvent.click(screen.getByTestId('operator-plan-fold'))
    expect(screen.getAllByTestId('operator-plan-step')).toHaveLength(1)

    cleanup()
    renderCard({ questions: [] })
    expect(screen.getAllByTestId('operator-plan-step')).toHaveLength(1)
  })

  it('选项是可读的行 —— 标题 + 一句说明', () => {
    renderCard()
    expect(screen.getByText('腰以上，脸看得清')).toBeTruthy()
    expect(screen.getByText('只有脸，细节最足')).toBeTruthy()
  })

  it('⭐ 单选：点第二项，第一项自己让位', () => {
    const { onSubmit } = renderCard()
    const rows = optionRows()
    fireEvent.click(rows[0]!.querySelector('input')!)
    fireEvent.click(rows[1]!.querySelector('input')!)
    expect(rows[0]?.dataset.selected).toBe('false')
    expect(rows[1]?.dataset.selected).toBe('true')

    fireEvent.click(screen.getByTestId('operator-question-start'))
    expect(onSubmit).toHaveBeenCalledWith([
      { questionId: 'q1', optionIds: [rows[1]?.dataset.optionId] },
    ])
  })

  it('⭐ 多选：两项可以同时在', () => {
    const { onSubmit } = renderCard({ questions: [MULTI] })
    const rows = optionRows()
    fireEvent.click(rows[0]!.querySelector('input')!)
    fireEvent.click(rows[1]!.querySelector('input')!)
    expect(rows.map((row) => row.dataset.selected)).toEqual(['true', 'true'])

    fireEvent.click(screen.getByTestId('operator-question-start'))
    expect(onSubmit).toHaveBeenCalledWith([
      { questionId: 'q2', optionIds: ['m1', 'm2'] },
    ])
  })

  it('⭐ 「其他」展开一行输入，答复走 otherText —— ⛔ 不进 optionIds', () => {
    const { onSubmit } = renderCard()
    expect(screen.queryByTestId('operator-question-other-input')).toBeNull()
    fireEvent.click(optionRows().at(-1)!.querySelector('input')!)
    const input = screen.getByTestId('operator-question-other-input')
    fireEvent.change(input, { target: { value: '侧脸，半身以上' } })

    fireEvent.click(screen.getByTestId('operator-question-start'))
    expect(onSubmit).toHaveBeenCalledWith([
      { questionId: 'q1', optionIds: [], otherText: '侧脸，半身以上' },
    ])
  })

  it('⭐ 没答完点「开始」不提交 —— 未答题就地高亮', () => {
    const { onSubmit } = renderCard({ questions: [SINGLE, MULTI] })
    fireEvent.click(screen.getByTestId('operator-question-start'))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(
      screen
        .getAllByTestId('operator-question')
        .map((node) => node.dataset.unanswered),
    ).toEqual(['true', 'true'])

    // 答完一题，另一题仍然高亮着。
    fireEvent.click(optionRows()[0]!.querySelector('input')!)
    expect(
      screen.getAllByTestId('operator-question')[0]?.dataset.unanswered,
    ).toBe('false')
  })

  it('⭐ resolved 收成一行「你选了：…」，展开才看得到逐题', () => {
    const { onRevise } = renderCard({
      resolved: true,
      answers: [{ questionId: 'q1', optionIds: ['o3'], otherText: '再暗一点' }],
    })
    expect(screen.queryByTestId('operator-question-start')).toBeNull()
    expect(
      screen.getByTestId('operator-question-summary').textContent,
    ).toContain('特写 · 再暗一点')
    expect(screen.queryByTestId('operator-question-summary-detail')).toBeNull()

    fireEvent.click(screen.getByTestId('operator-question-summary'))
    expect(
      screen.getByTestId('operator-question-summary-detail').textContent,
    ).toContain('取景')

    fireEvent.click(screen.getByTestId('operator-question-revise'))
    expect(onRevise).toHaveBeenCalledTimes(1)
  })

  it('⭐ 没有答复时收起态写「计划 · N 步」—— ⛔ 不是一句空的「你选了：」', () => {
    // 由来（2026-09-07 真机）：计划卡那一支压根没有题，复用反问卡的摘要文案得到
    // 的是冒号后面什么都没有的一行。
    renderCard({
      resolved: true,
      questions: [],
      answers: [],
      steps: [
        { id: 's1', label: '写提示词' },
        { id: 's2', label: '挂参考图' },
      ],
    })
    const summary = screen.getByTestId('operator-question-summary').textContent
    expect(summary).toBe('planFold:2')
    expect(summary).not.toContain('question.summary')
  })

  it('⭐ 连点两次「开始」只提交一次，且按钮就地进 loading（不可再点）', () => {
    const { onSubmit } = renderCard()
    fireEvent.click(optionRows()[0]!.querySelector('input')!)
    const start = screen.getByTestId('operator-question-start')
    fireEvent.click(start)
    fireEvent.click(start)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(start.getAttribute('aria-busy')).toBe('true')
    expect((start as HTMLButtonElement).disabled).toBe(true)
  })
})
