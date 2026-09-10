// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { STUDIO_OPERATOR_SHELL } from '@/constants/studio-assistant-operator'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'

import {
  STUDIO_OPERATOR_BAND_STEP_STATES,
  StudioOperatorProgressBand,
} from './StudioOperatorProgressBand'

/**
 * 顶部进度带的回归闸（拍板 10 改口：头部 → 进度带）。
 *
 * 钉四件事：
 *  ① 带高就是 `STUDIO_OPERATOR_SHELL.progressBandHeightPx`（真机目检读同一个数）；
 *  ② 运行中写「3/6 · 当前步骤」—— 过程折叠之后这是唯一的进度来源；
 *  ③ 空闲退化回「域 chip · 会话名」；
 *  ④ 点标题展开完整清单（`grid-rows-[1fr]`），⛔ 不是另开一个弹层。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => '9/6 12:00' }),
}))

// Radix 的 portal 在 jsdom 里只会给这条断言添噪声 —— 菜单本身不是这颗组件的契约。
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    onSelect?: () => void
  }) => (
    <button {...props} onClick={onSelect}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
}))

const HISTORY: UseStudioOperatorHistoryResult = {
  sessions: [],
  currentSessionId: null,
  isHydrating: false,
  loadingSessionId: null,
  renamingSessionId: null,
  renameSession: vi.fn().mockResolvedValue(true),
  error: null,
  selectSession: vi.fn(),
  refreshSessions: vi.fn(),
  deletingSessionId: null,
  deleteSession: vi.fn().mockResolvedValue(true),
}

function renderBand(
  overrides: Partial<Parameters<typeof StudioOperatorProgressBand>[0]> = {},
) {
  render(
    <StudioOperatorProgressBand
      domain={ASSISTANT_PROTOCOL_DOMAIN_IDS.image}
      costs={{ vision: 0, research: 0, llm: 0 }}
      costDetails={[]}
      working={false}
      awaitingPlan={false}
      stepsDone={0}
      plannedSteps={0}
      currentStepTitle={null}
      steps={[]}
      history={HISTORY}
      onNewThread={vi.fn()}
      onOpenAssistantSettings={vi.fn()}
      onCollapse={vi.fn()}
      {...overrides}
    />,
  )
}

describe('StudioOperatorProgressBand', () => {
  it('带高钉在 40px', () => {
    renderBand()
    const head = screen.getByTestId('operator-progress-band')
      .firstElementChild as HTMLElement
    expect(head.style.height).toBe(
      `${STUDIO_OPERATOR_SHELL.progressBandHeightPx}px`,
    )
  })

  it('空闲时退化为「域 chip · 会话名」', () => {
    renderBand()
    expect(screen.getByTestId('operator-domain-chip')).toBeTruthy()
    expect(screen.queryByTestId('operator-band-ring')).toBeNull()
  })

  it('运行中写 N/M 与当前步骤', () => {
    renderBand({
      working: true,
      stepsDone: 3,
      plannedSteps: 6,
      currentStepTitle: '正在挂 LoRA',
      steps: [
        {
          id: 'a',
          title: '正在挂 LoRA',
          state: STUDIO_OPERATOR_BAND_STEP_STATES.running,
        },
      ],
    })
    expect(screen.getByTestId('operator-band-fraction').textContent).toBe('3/6')
    expect(screen.getByTestId('operator-band-toggle').textContent).toBe(
      '正在挂 LoRA',
    )
    expect(screen.getByTestId('operator-band-ring')).toBeTruthy()
  })

  it('点标题就地展开完整清单', () => {
    renderBand({
      working: true,
      stepsDone: 1,
      plannedSteps: 2,
      currentStepTitle: '读表单',
      steps: [
        {
          id: 'a',
          title: '读表单',
          state: STUDIO_OPERATOR_BAND_STEP_STATES.done,
        },
        {
          id: 'b',
          title: '挂参考图',
          state: STUDIO_OPERATOR_BAND_STEP_STATES.running,
        },
      ],
    })
    const band = screen.getByTestId('operator-progress-band')
    expect(band.dataset.open).toBe('false')
    fireEvent.click(screen.getByTestId('operator-band-toggle'))
    expect(band.dataset.open).toBe('true')
    expect(screen.getByTestId('operator-band-list').children).toHaveLength(2)
  })

  /**
   * 「还没有分母」那一档（§4.1 第三行）。⛔ 不显示 `0/0`：一个没有分母的计数
   * 比一句「思考中」更像卡住了。
   */
  it('working 但还没有 plan 帧 → 「思考中」+ 环形 spinner，⛔ 不出分数', () => {
    renderBand({ working: true, stepsDone: 0, plannedSteps: 0 })
    expect(screen.getByTestId('operator-band-toggle').textContent).toBe(
      'band.thinking',
    )
    expect(screen.queryByTestId('operator-band-fraction')).toBeNull()
    const ring = screen.getByTestId('operator-band-ring')
    expect(ring.dataset.indeterminate).toBe('true')
    expect(ring.getAttribute('class')).toContain('animate-spin')
    expect(ring.getAttribute('class')).toContain('motion-reduce:animate-none')
  })

  it('plan 帧到了 → 环停下来按比例画，标题回到那一步在做什么', () => {
    renderBand({
      working: true,
      stepsDone: 1,
      plannedSteps: 3,
      currentStepTitle: '挂参考图',
    })
    expect(screen.getByTestId('operator-band-ring').dataset.indeterminate).toBe(
      'false',
    )
    expect(screen.getByTestId('operator-band-fraction').textContent).toBe('1/3')
    expect(screen.getByTestId('operator-band-toggle').textContent).toBe(
      '挂参考图',
    )
  })

  /**
   * ⭐ `awaitingPlan` 与「思考中」是两句不同的话：前者要用户去点那张卡，后者
   * 只要等。合成一句的表现是计划卡钉在屏幕上而带上写着「思考中」。
   */
  it('awaitingPlan → 「等你确认计划」，环露脸但不转', () => {
    renderBand({ working: false, awaitingPlan: true })
    expect(screen.getByTestId('operator-band-toggle').textContent).toBe(
      'band.awaitingPlan',
    )
    const ring = screen.getByTestId('operator-band-ring')
    expect(ring.dataset.indeterminate).toBe('false')
    expect(ring.getAttribute('class')).not.toContain('animate-spin')
    // 域 chip 是空闲那一副面孔 —— 等你定的时候不该退回去。
    expect(screen.queryByTestId('operator-domain-chip')).toBeNull()
  })

  /**
   * ⭐ 助手设置的**唯一**入口 = 带上那颗常驻齿轮（owner 2026-09-07）。
   *
   * ⚠ 这份桩把 ⋯ 菜单的内容**原地渲染**（见文件头那段 dropdown-menu mock），
   * 所以「菜单里还留着一项」会在这里表现为找到两个同名 testid —— 这正是这条
   * 断言拦得住「删了一个入口忘了删另一个」的原因（工程原则 1）。
   */
  it('⭐ 齿轮是常驻按钮，且⛔ ⋯ 菜单里不再有第二个「助手设置」', () => {
    const onOpenAssistantSettings = vi.fn()
    renderBand({ onOpenAssistantSettings })

    const gears = screen.getAllByTestId('operator-assistant-settings')
    expect(gears).toHaveLength(1)
    const gear = gears[0]!
    expect(gear.tagName).toBe('BUTTON')
    expect(gear.getAttribute('aria-label')).toBe('assistantSettings')
    // 命中区 32px（`ui-defaults.md §5`：fine 32/36）。
    expect(gear.className).toContain('size-8')
    // 收放法则的判据 —— 少了它，点齿轮会把面板一起收掉。
    expect(gear.hasAttribute('data-operator-keep')).toBe(true)

    fireEvent.click(gear)
    expect(onOpenAssistantSettings).toHaveBeenCalledTimes(1)
  })

  it('齿轮七态：hover / active / focus-visible / disabled 都有落点', () => {
    renderBand()
    const gear = screen.getByTestId('operator-assistant-settings')
    for (const state of [
      'hover:bg-accent',
      'active:bg-accent/80',
      'focus-visible:ring-2',
      'disabled:opacity-50',
      'motion-reduce:transition-none',
    ]) {
      expect(gear.className).toContain(state)
    }
  })
})

/**
 * 成本计数（切片 Y）—— 钉三件：一档都没有时**整块不渲染**（⛔ 不摆一份写着
 * 三个 0 的账单）、有计数时只写非零的那几档、hover 明细逐条列出来。
 */
describe('StudioOperatorProgressBand · 成本计数', () => {
  it('一档都没有时不画那一行', () => {
    renderBand()
    expect(screen.queryByTestId('operator-cost-counter')).toBeNull()
  })

  it('只写非零的那几档', () => {
    renderBand({ costs: { vision: 3, research: 0, llm: 7 } })
    const counter = screen.getByTestId('operator-cost-counter')
    expect(counter.textContent).toBe('cost.vision 3 · cost.llm 7')
    // ⛔ 零的那一档不出现 —— 一个恒等于 0 的计数只是噪音。
    expect(counter.textContent).not.toContain('cost.research')
  })

  it('hover 明细逐条列出来（含服务端给的那句标签）', () => {
    renderBand({
      costs: { vision: 2, research: 0, llm: 0 },
      costDetails: [
        { kind: 'vision', units: 1, label: '结果②' },
        { kind: 'vision', units: 1 },
      ],
    })
    expect(screen.getByTestId('operator-cost-counter').title).toBe(
      'cost.vision ×1 · 结果②\ncost.vision ×1',
    )
  })
})

/**
 * **有未完成计划**（第三期 · 断点续跑）—— 刷新之后唯一还看得见的续跑入口。
 */
describe('续跑入口', () => {
  it('缺席时⛔ 一颗按钮都不画', () => {
    renderBand({ working: false })
    expect(screen.queryByTestId('operator-band-resume')).toBeNull()
  })

  it('空闲时画出来，点了把命令交出去', () => {
    const onResume = vi.fn()
    renderBand({ working: false, resume: { stepNumber: 3, onResume } })
    const button = screen.getByTestId('operator-band-resume')
    expect(button.dataset.step).toBe('3')
    fireEvent.click(button)
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('⭐ 正在跑的时候不画：带子上写的是这一轮的进度，⛔ 不许再摆一颗「继续」', () => {
    renderBand({
      working: true,
      resume: { stepNumber: 3, onResume: vi.fn() },
    })
    expect(screen.queryByTestId('operator-band-resume')).toBeNull()
  })

  it('等计划确认的时候也不画（球在用户脚下，不是断点）', () => {
    renderBand({
      working: false,
      awaitingPlan: true,
      resume: { stepNumber: 3, onResume: vi.fn() },
    })
    expect(screen.queryByTestId('operator-band-resume')).toBeNull()
  })
})

it('uses the conversation title as the history trigger and confirms deletion without selecting the row', async () => {
  const session = {
    id: 'history-1',
    surface: 'IMAGE_STUDIO' as const,
    projectId: null,
    title: 'Saved conversation',
    updatedAt: '2026-09-09T00:00:00Z',
    messageCount: 2,
    operatorThread: true,
  }
  const selectSession = vi.fn()
  const deleteSession = vi.fn().mockResolvedValue(true)
  renderBand({
    history: {
      ...HISTORY,
      currentSessionId: session.id,
      sessions: [session],
      selectSession,
      deleteSession,
    },
  })
  expect(screen.getByTestId('operator-session-menu')).toHaveTextContent(
    'Saved conversation',
  )
  fireEvent.click(screen.getByRole('button', { name: 'history.deleteLabel' }))
  expect(deleteSession).not.toHaveBeenCalled()
  expect(selectSession).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'history.deleteCancel' }))
  expect(deleteSession).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'history.deleteLabel' }))
  fireEvent.click(screen.getByRole('button', { name: 'history.deleteConfirm' }))
  await waitFor(() => expect(deleteSession).toHaveBeenCalledWith(session))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
})
