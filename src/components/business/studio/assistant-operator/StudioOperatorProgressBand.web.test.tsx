// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
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
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
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
  error: null,
  selectSession: vi.fn(),
} as unknown as UseStudioOperatorHistoryResult

function renderBand(
  overrides: Partial<Parameters<typeof StudioOperatorProgressBand>[0]> = {},
) {
  render(
    <StudioOperatorProgressBand
      domain={ASSISTANT_PROTOCOL_DOMAIN_IDS.image}
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
})
