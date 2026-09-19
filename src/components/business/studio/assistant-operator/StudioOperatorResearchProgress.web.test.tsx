// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorResearchProgress } from './StudioOperatorResearchProgress'

/**
 * **调查那一行**的回归闸（56b 切片 2）。
 *
 * 钉三件事：
 *  ① 三态：跑着一行微光（`motion-reduce` 那一支由 `motion-reduce:animate-none`
 *     承担，类名在这里断言）· 点开展开步骤 · 跑完收成灰底一行；
 *  ② 两档写两句话 —— 快搜「搜了 N 条」/ 深档「深入调查 · 查了 N 条」；
 *  ③ 预估写在行里，⛔ 不是一张要人点的确认卡。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${values.count}` : key,
}))

function renderLine(
  props: Partial<
    React.ComponentProps<typeof StudioOperatorResearchProgress>
  > = {},
) {
  render(
    <StudioOperatorResearchProgress
      depth="quick"
      running={false}
      found={6}
      readPages={3}
      {...props}
    >
      <p data-testid="step-log">读了一页</p>
    </StudioOperatorResearchProgress>,
  )
}

describe('StudioOperatorResearchProgress', () => {
  it('⭐ 跑完是灰底一行「搜了 N 条 · 读了 M 页」', () => {
    renderLine()
    const line = screen.getByTestId('operator-research-progress')
    expect(line.dataset.state).toBe('done')
    expect(
      screen.getByTestId('operator-research-progress-label').textContent,
    ).toBe('researchProgress.doneQuick:6 · researchProgress.readPages:3')
  })

  it('⭐ 深档换一句话', () => {
    renderLine({ depth: 'deep', found: 20, readPages: 7 })
    expect(
      screen.getByTestId('operator-research-progress-label').textContent,
    ).toContain('researchProgress.doneDeep:20')
  })

  it('⭐ 跑着的时候一行微光，预估写在行里；`motion-reduce` 静止', () => {
    renderLine({ depth: 'deep', running: true })
    const toggle = screen.getByTestId('operator-research-progress-toggle')
    expect(toggle.className).toContain('animate-pulse')
    expect(toggle.className).toContain('motion-reduce:animate-none')
    expect(toggle.getAttribute('aria-busy')).toBe('true')
    expect(
      screen.getByTestId('operator-research-progress-label').textContent,
    ).toBe('researchProgress.runningDeep · researchProgress.estimateMinutes:1')
  })

  it('快搜的预估按秒写', () => {
    renderLine({ running: true })
    expect(
      screen.getByTestId('operator-research-progress-label').textContent,
    ).toContain('researchProgress.estimateSeconds:10')
  })

  it('⭐ 点那一行才展开步骤，再点收起', () => {
    renderLine()
    const toggle = screen.getByTestId('operator-research-progress-toggle')
    expect(screen.getByTestId('step-log').closest('[hidden]')).not.toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('step-log').closest('[hidden]')).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('失败摘要照旧长在行上面', () => {
    renderLine({ failure: <p data-testid="blocker">写不进去</p> })
    expect(
      screen.getByTestId('operator-research-progress-blocker').textContent,
    ).toBe('写不进去')
  })
})
