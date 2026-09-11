import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ASSISTANT_OPERATOR_VERB_IDS,
  ASSISTANT_OPERATOR_VERBS,
} from '@/constants/assistant-operator'

import { StudioOperatorVerbStrip } from './StudioOperatorVerbStrip'

/**
 * 五动词小标签条的回归闸（v2 §4.6 / 画板 BMobile，commit #21）。
 *
 * 钉五件事：
 *  ① 五颗都在、顺序就是 `ASSISTANT_OPERATOR_VERBS`（⛔ 不在组件里另排一遍）；
 *  ② 当前动词**直接读 `step.verb`**（⛔ 不按工具名反查对照表）；
 *  ③ 「本轮」= 最后一条步所在的那一轮 —— 上一轮跑过的动词不算数；
 *  ④ 状态不只靠颜色：当前那颗近黑实底 + 白字 + 加粗 + `aria-current="step"`；
 *  ⑤ **只在移动端**（`lg:hidden`）—— 桌面靠头像旁那句状态词说同一件事。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const entries: {
  kind: string
  id: string
  runKey: string
  step: { verb: string; status: string }
}[] = []

vi.mock('@/hooks/use-studio-operator-store', () => ({
  useStudioOperatorState: () => ({ entries }),
}))

function setEntries(
  next: readonly [runKey: string, verb: string, status: string][],
) {
  entries.length = 0
  next.forEach(([runKey, verb, status], index) => {
    entries.push({
      kind: 'step',
      id: `s${index}`,
      runKey,
      step: { verb, status },
    })
  })
}

function pill(verb: string): HTMLElement {
  return screen
    .getAllByTestId('operator-verb-pill')
    .find((node) => node.dataset.verb === verb)!
}

describe('StudioOperatorVerbStrip', () => {
  beforeEach(() => {
    entries.length = 0
  })

  it('五颗动词都在，顺序与 `ASSISTANT_OPERATOR_VERBS` 逐条对上', () => {
    render(<StudioOperatorVerbStrip />)
    const pills = screen.getAllByTestId('operator-verb-pill')
    expect(pills.map((node) => node.dataset.verb)).toEqual([
      ...ASSISTANT_OPERATOR_VERBS,
    ])
  })

  it('⭐ 只在移动端画（`lg:hidden`）：桌面那一档由状态词承担', () => {
    render(<StudioOperatorVerbStrip />)
    expect(screen.getByTestId('operator-verb-strip').className).toContain(
      'lg:hidden',
    )
  })

  it('一步都没跑时五颗都是 idle —— ⛔ 不默认点亮第一颗', () => {
    render(<StudioOperatorVerbStrip />)
    for (const verb of ASSISTANT_OPERATOR_VERBS) {
      expect(pill(verb).dataset.state).toBe('idle')
    }
  })

  it('⭐ 当前动词读的是 `step.verb` 的 running 那一条，跑完的那几颗是 visited', () => {
    setEntries([
      ['r1', ASSISTANT_OPERATOR_VERB_IDS.look, 'done'],
      ['r1', ASSISTANT_OPERATOR_VERB_IDS.research, 'running'],
    ])
    render(<StudioOperatorVerbStrip />)
    expect(pill(ASSISTANT_OPERATOR_VERB_IDS.research).dataset.state).toBe(
      'active',
    )
    expect(pill(ASSISTANT_OPERATOR_VERB_IDS.look).dataset.state).toBe('visited')
    expect(pill(ASSISTANT_OPERATOR_VERB_IDS.apply).dataset.state).toBe('idle')
  })

  it('⭐ 「本轮」只数最后那一轮：上一轮跑过的动词⛔ 不留在条上', () => {
    setEntries([
      ['r1', ASSISTANT_OPERATOR_VERB_IDS.apply, 'done'],
      ['r2', ASSISTANT_OPERATOR_VERB_IDS.look, 'running'],
    ])
    render(<StudioOperatorVerbStrip />)
    expect(pill(ASSISTANT_OPERATOR_VERB_IDS.look).dataset.state).toBe('active')
    expect(pill(ASSISTANT_OPERATOR_VERB_IDS.apply).dataset.state).toBe('idle')
  })

  it('当前那颗状态不只靠颜色：实底 + 白字 + 加粗 + `aria-current`', () => {
    setEntries([['r1', ASSISTANT_OPERATOR_VERB_IDS.ask, 'running']])
    render(<StudioOperatorVerbStrip />)
    const active = pill(ASSISTANT_OPERATOR_VERB_IDS.ask)
    expect(active.getAttribute('aria-current')).toBe('step')
    expect(active.className).toContain('bg-foreground')
    expect(active.className).toContain('text-background')
    expect(active.className).toContain('font-medium')
    // ⛔ 不用 `--primary`：那一支被工作台的生成键占着（§12.2）。
    expect(active.className).not.toContain('bg-primary')
  })
})
