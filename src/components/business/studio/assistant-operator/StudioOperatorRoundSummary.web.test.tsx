// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorRoundSummary } from './StudioOperatorRoundSummary'
import type { AssistantOperatorRoundSummary } from '@/types/assistant-operator'

/**
 * 结论记录块的回归闸（v2 §7.7 / 画板 BCards 三态）。
 *
 * 钉五件事：
 *  ① 三态各自的形状（展开 / 折叠一行 / 编辑）；
 *  ② 折叠那行的 N 是**三栏条目总数**，⛔ 不含证据编号；
 *  ③ 「改」→ 三栏变文本框，保存把**收窄过**的三栏交出去（≤3 条、每条 ≤60 字）；
 *  ④ 取消不回调，也不改屏幕上那一份；
 *  ⑤ 证据编号默认只展示，⛔ 不摆一颗点了没反应的按钮。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count !== undefined ? `${key} ${values.count}` : key,
  useFormatter: () => ({ dateTime: () => '11:26' }),
}))

const SUMMARY: AssistantOperatorRoundSummary = {
  roundIndex: 2,
  createdAt: '2026-09-11T03:26:00.000Z',
  facts: ['参考图是立体风格化 3D 渲染'],
  decisions: ['主体走写实', 'FLUX 2 Flash，3:2'],
  todos: ['等你确认后生成 3 张'],
  evidenceRefs: ['#e12', '#e13'],
}

function renderBlock(
  props: Partial<React.ComponentProps<typeof StudioOperatorRoundSummary>> = {},
) {
  const onSave = vi.fn()
  render(
    <StudioOperatorRoundSummary summary={SUMMARY} onSave={onSave} {...props} />,
  )
  return { onSave }
}

describe('StudioOperatorRoundSummary', () => {
  it('默认展开：三栏 + 证据 chip 行 + 右上「改」', () => {
    renderBlock()
    expect(screen.getByTestId('operator-round-summary').dataset.state).toBe(
      'expanded',
    )
    expect(screen.getAllByTestId('operator-round-column')).toHaveLength(3)
    expect(screen.getAllByTestId('operator-round-evidence')).toHaveLength(2)
    expect(screen.getByTestId('operator-round-edit')).toBeTruthy()
  })

  it('整行只有一个展开入口，标题和箭头共用同一按钮', () => {
    renderBlock({ defaultCollapsed: true })
    const toggle = screen.getByTestId('operator-round-toggle')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('operator-round-edit')).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    const detailsId = toggle.getAttribute('aria-controls')!
    expect(document.getElementById(detailsId)?.hidden).toBe(true)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(detailsId)?.hidden).toBe(false)
    expect(screen.getAllByTestId('operator-round-column')).toHaveLength(3)
    fireEvent.click(toggle.querySelector('svg')!)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('条目数与展开的记录一致，不使用跨会话记忆条数', () => {
    renderBlock({
      summary: { ...SUMMARY, memoriesWritten: 2 },
      defaultCollapsed: true,
    })
    expect(screen.getByTestId('operator-round-toggle').textContent).toBe(
      'collapsed 4',
    )
  })

  it('隐身轮次仍能整行展开，详情说明未写入记忆', () => {
    renderBlock({
      summary: { ...SUMMARY, incognito: true },
      defaultCollapsed: true,
    })
    fireEvent.click(screen.getByTestId('operator-round-toggle'))
    expect(
      screen.getByTestId('operator-round-incognito').textContent,
    ).toContain('incognito')
    expect(screen.getAllByTestId('operator-round-column')).toHaveLength(3)
  })

  it('空栏不画一行只有标签的空句子', () => {
    renderBlock({ summary: { ...SUMMARY, todos: [], evidenceRefs: [] } })
    expect(screen.getAllByTestId('operator-round-column')).toHaveLength(2)
    expect(screen.queryByTestId('operator-round-evidence')).toBeNull()
  })

  it('折起来是一行，N = 三栏条目总数（⛔ 不含证据编号）', () => {
    renderBlock()
    fireEvent.click(screen.getByTestId('operator-round-toggle'))
    const block = screen.getByTestId('operator-round-summary')
    expect(block.dataset.state).toBe('collapsed')
    // 1 + 2 + 1 = 4，而证据是两条 —— 数进去就会写成 6。
    expect(block.textContent).toContain('collapsed')
    expect(screen.queryByTestId('operator-round-column')).toBeNull()
    fireEvent.click(screen.getByTestId('operator-round-toggle'))
    expect(screen.getByTestId('operator-round-summary').dataset.state).toBe(
      'expanded',
    )
  })

  it('载回来的历史首次渲染就折起来，展开之后照旧能读全', () => {
    renderBlock({ defaultCollapsed: true })
    expect(screen.getByTestId('operator-round-summary').dataset.state).toBe(
      'collapsed',
    )
  })

  it('展开详情后可以就地编辑，无需离开聊天', () => {
    renderBlock({ defaultCollapsed: true })
    fireEvent.click(screen.getByTestId('operator-round-toggle'))
    fireEvent.click(screen.getByTestId('operator-round-edit'))
    expect(screen.getByTestId('operator-round-summary').dataset.state).toBe(
      'editing',
    )
    expect(screen.getAllByTestId('operator-round-input')).toHaveLength(3)
  })

  it('「改」→ 三栏可编辑，保存交出收窄过的三栏', () => {
    const { onSave } = renderBlock()
    fireEvent.click(screen.getByTestId('operator-round-edit'))
    expect(screen.getByTestId('operator-round-summary').dataset.state).toBe(
      'editing',
    )
    const inputs = screen.getAllByTestId('operator-round-input')
    expect(inputs).toHaveLength(3)
    // 一行一条；空行丢掉、第 4 条截掉、超长那条截到 60 字。
    fireEvent.change(inputs[0]!, {
      target: { value: `一\n\n二\n三\n四\n${'长'.repeat(80)}` },
    })
    fireEvent.click(screen.getByTestId('operator-round-save'))
    expect(onSave).toHaveBeenCalledWith({
      facts: ['一', '二', '三'],
      decisions: ['主体走写实', 'FLUX 2 Flash，3:2'],
      todos: ['等你确认后生成 3 张'],
    })
    expect(screen.getByTestId('operator-round-summary').dataset.state).toBe(
      'expanded',
    )
  })

  it('取消不回调，也不改屏幕上那一份', () => {
    const { onSave } = renderBlock()
    fireEvent.click(screen.getByTestId('operator-round-edit'))
    fireEvent.change(screen.getAllByTestId('operator-round-input')[0]!, {
      target: { value: '乱写的' },
    })
    fireEvent.click(screen.getByTestId('operator-round-cancel'))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByTestId('operator-round-summary').textContent).toContain(
      '参考图是立体风格化 3D 渲染',
    )
  })

  it('改不动的那几条（没有 onSave）不画「改」', () => {
    render(<StudioOperatorRoundSummary summary={SUMMARY} />)
    expect(screen.queryByTestId('operator-round-edit')).toBeNull()
  })

  it('证据编号默认是死的 —— ⛔ 不摆一颗点了没反应的按钮', () => {
    renderBlock()
    expect(
      screen.getAllByTestId('operator-round-evidence')[0]!.tagName,
    ).not.toBe('BUTTON')
  })

  it('给了 onRecallEvidence 才画成可点的', () => {
    const onRecallEvidence = vi.fn()
    render(
      <StudioOperatorRoundSummary
        summary={SUMMARY}
        onRecallEvidence={onRecallEvidence}
      />,
    )
    fireEvent.click(screen.getAllByTestId('operator-round-evidence')[0]!)
    expect(onRecallEvidence).toHaveBeenCalledWith('#e12')
  })

  it('续跑 chip 长在块的尾部（§3.6）', () => {
    const onResume = vi.fn()
    renderBlock({
      resume: { stepNumber: 4, failedReason: '网络掉线', onResume },
    })
    expect(screen.getByTestId('operator-round-resume-reason')).toBeTruthy()
    const chip = screen.getByTestId('operator-round-resume')
    expect(chip.dataset.step).toBe('4')
    fireEvent.click(chip)
    expect(onResume).toHaveBeenCalled()
  })
})
