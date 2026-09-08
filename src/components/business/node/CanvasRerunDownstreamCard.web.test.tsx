// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

import type { RerunDownstreamPlan } from '@/lib/node-rerun-downstream'

import { CanvasRerunDownstreamCard } from './CanvasRerunDownstreamCard'

/**
 * 只重跑下游的**只读名单卡**（第三期）。
 *
 * 钉两件事：① 卡上一颗「应用 / 开跑」都没有（真要跑走 `generate` 的硬确认）；
 * ② 文本节点标成不花钱 —— 它压根不生成任何东西。
 */

const PLAN: RerunDownstreamPlan = {
  originId: 'ref',
  originName: '参考图',
  entries: [
    { id: 'a', name: 'S02', kind: 'video', paid: true },
    { id: 'b', name: '旁白', kind: 'text', paid: false },
  ],
  paidByKind: { video: 1 },
}

describe('CanvasRerunDownstreamCard', () => {
  it('⛔ 卡上没有任何会让它开跑的按钮', () => {
    render(<CanvasRerunDownstreamCard plan={PLAN} onFocusNode={vi.fn()} />)
    // 卡里的按钮全都只是「跳到那个节点」。
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(PLAN.entries.length)
    for (const button of buttons) {
      expect(button.dataset.testid).toBe('canvas-rerun-downstream-item')
    }
  })

  it('逐条列出来，文本节点标成不花钱', () => {
    render(<CanvasRerunDownstreamCard plan={PLAN} onFocusNode={vi.fn()} />)
    const items = screen.getAllByTestId('canvas-rerun-downstream-item')
    expect(items[0]?.dataset.paid).toBe('true')
    expect(items[1]?.dataset.paid).toBe('false')
    expect(items[1]?.textContent).toContain('StudioNode.rerunDownstream.free')
  })

  it('点名字跳到那个节点（一份读不动的 id 名单等于没给）', () => {
    const onFocusNode = vi.fn()
    render(<CanvasRerunDownstreamCard plan={PLAN} onFocusNode={onFocusNode} />)
    fireEvent.click(screen.getAllByTestId('canvas-rerun-downstream-item')[0]!)
    expect(onFocusNode).toHaveBeenCalledWith('a')
  })

  it('一族都不花钱时写「这一批都不花积分」', () => {
    render(
      <CanvasRerunDownstreamCard
        plan={{ ...PLAN, entries: [PLAN.entries[1]!], paidByKind: {} }}
        onFocusNode={vi.fn()}
      />,
    )
    expect(screen.getByTestId('canvas-rerun-downstream').textContent).toContain(
      'StudioNode.rerunDownstream.noCost',
    )
  })
})
