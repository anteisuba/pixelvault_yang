// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorPlanCard } from './StudioOperatorPlanCard'

/**
 * 计划卡的回归闸（§2.6 / §11.4 / §3.1 ②–⑤）。
 *
 * 钉五件事：
 *  ① 阶段列表逐条出来，序号是 mono 两位；
 *  ② 待定项没答完「开始」不亮 —— ⛔ 别让一个没答完的计划开跑；
 *  ③ 选完之后「开始」把答复原样交出去（`pendingId` / `optionId` 成对）；
 *  ④ 图示三条分支：缩略图 → 词表图示 → 纯文字（⛔ 词表外不画任何图）；
 *  ⑤ 算不出金额就**不写**那一行（⛔ 不写「约 0 credits」）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const STEPS = [
  { id: 'plan-1', label: '写提示词' },
  { id: 'plan-2', label: '挂参考图' },
  { id: 'plan-3', label: '备好生成键' },
]

const PENDING = [
  {
    id: 'pending-1',
    label: '取多少身？',
    kind: 'single' as const,
    options: [
      { id: 'option-1-1', label: '半身', visual: 'comp.halfBody' as const },
      { id: 'option-1-2', label: '全身', visual: 'comp.fullBody' as const },
      // ⛔ 词表外的图示在服务端就被剥掉了，所以这里表达为「没有 visual」。
      { id: 'option-1-3', label: '随意' },
    ],
  },
]

function renderCard(
  overrides: Partial<React.ComponentProps<typeof StudioOperatorPlanCard>> = {},
) {
  const onStart = vi.fn()
  const onRevise = vi.fn()
  render(
    <StudioOperatorPlanCard
      steps={STEPS}
      pending={PENDING}
      estimate={{ credits: 6, model: 'Seedream 4', count: 2 }}
      started={false}
      onStart={onStart}
      onRevise={onRevise}
      {...overrides}
    />,
  )
  return { onStart, onRevise }
}

describe('StudioOperatorPlanCard', () => {
  it('阶段逐条列出，序号是两位 mono', () => {
    renderCard()
    const steps = screen.getAllByTestId('operator-plan-step')
    expect(steps).toHaveLength(3)
    expect(steps[0]?.textContent).toContain('01')
    expect(steps[2]?.textContent).toContain('备好生成键')
  })

  it('⭐ 待定项没答完「开始」不亮', () => {
    renderCard()
    expect(
      (screen.getByTestId('operator-plan-start') as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('选完之后「开始」把答复成对交出去', () => {
    const { onStart } = renderCard()
    const [firstOption] = screen.getAllByTestId('operator-plan-option')
    fireEvent.click(firstOption as HTMLElement)
    expect((firstOption as HTMLElement).dataset.selected).toBe('true')

    const start = screen.getByTestId('operator-plan-start') as HTMLButtonElement
    expect(start.disabled).toBe(false)
    fireEvent.click(start)
    expect(onStart).toHaveBeenCalledWith([
      { pendingId: 'pending-1', optionId: 'option-1-1' },
    ])
  })

  /**
   * ⭐ `started` 是**受控**的（切片 3a）：它住在 store，⛔ 不是卡自己的 state。
   * 卡自己记的下场是收放法则（拍板 7）卸载一次面板，再展开时那一轮明明在跑，
   * 卡却又变回可点的「开始」。
   */
  it('⭐ started 由外面说了算 —— 收成一行摘要，只剩「修改」', () => {
    const { onRevise } = renderCard({ started: true })
    expect(screen.getByTestId('operator-plan-card').dataset.started).toBe(
      'true',
    )
    expect(screen.queryByTestId('operator-plan-start')).toBeNull()
    fireEvent.click(screen.getByTestId('operator-plan-revise'))
    expect(onRevise).toHaveBeenCalledTimes(1)
  })

  it('没有待定项时「开始」一开始就亮着', () => {
    renderCard({ pending: [] })
    expect(
      (screen.getByTestId('operator-plan-start') as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('⭐ 图示三条分支：词表命中画图示，词表外只剩文字', () => {
    renderCard()
    const visuals = screen.getAllByTestId('plan-option-visual')
    // 三个选项里只有两个有 visual —— 第三个 ⛔ 不画任何图。
    expect(visuals).toHaveLength(2)
    expect(visuals.map((node) => node.dataset.visualId)).toEqual([
      'comp.halfBody',
      'comp.fullBody',
    ])
  })

  it('assetUrl 优先于 visual —— 缩略图就是选项本身', () => {
    renderCard({
      pending: [
        {
          id: 'pending-1',
          label: '用哪张参考？',
          kind: 'single',
          options: [
            {
              id: 'option-1-1',
              label: '第一张',
              visual: 'comp.fullBody',
              assetUrl: 'https://cdn.example.com/a.png',
            },
            { id: 'option-1-2', label: '第二张' },
          ],
        },
      ],
    })
    const [visual] = screen.getAllByTestId('plan-option-visual')
    expect((visual as HTMLElement).dataset.visualKind).toBe('asset')
  })

  it('⛔ 算不出金额就不写预估那一行', () => {
    renderCard({ estimate: {} })
    expect(screen.getByTestId('operator-plan-estimate').textContent).toBe('')
  })
})
