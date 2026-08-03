import { cleanup, render, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { STATUS_COLORS } from '@/constants/node-tokens'
import { NODE_STATUS_IDS, NODE_STATUSES } from '@/constants/node-types'

import { NodeStatusBadge } from './NodeStatusBadge'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

/**
 * 台账 §17.3（owner 2026-08-03 拍板）：状态编码按「这个状态出现时用户需不需要
 * 停下来」排强度。这组用例守的是那条梯度本身，不是某个具体色值。
 */
describe('NodeStatusBadge · 强度梯度', () => {
  it('idle 与 done 都不盖章', () => {
    // idle = 素卡（原本就是）；done = 拍板①新增 —— 完成的证据是卡上那张图，
    // 再盖一枚是同一件事说两遍。
    for (const status of [
      NODE_STATUS_IDS.idle,
      NODE_STATUS_IDS.done,
    ] as const) {
      const { container } = render(<NodeStatusBadge status={status} />)
      expect(container).toBeEmptyDOMElement()
    }
  })

  it('ready / running / failed 都盖章', () => {
    for (const status of [
      NODE_STATUS_IDS.ready,
      NODE_STATUS_IDS.running,
      NODE_STATUS_IDS.failed,
    ] as const) {
      const { container } = render(<NodeStatusBadge status={status} />)
      expect(container).not.toBeEmptyDOMElement()
      expect(within(container).getByText(status)).toBeInTheDocument()
      cleanup()
    }
  })

  // ⚠ 这条是 running 存在的全部理由：它此前与 ready/done 同色（--node-paint
  // 被 canvas.css 重映射给连线，ΔE-ok 0.029），唯一的区分手段就是这颗点。
  it('只有 running 带那颗会动的点，且点不跟 currentColor', () => {
    const { container: run } = render(
      <NodeStatusBadge status={NODE_STATUS_IDS.running} />,
    )
    const dot = run.querySelector('.canvas-status-dot')
    expect(dot).not.toBeNull()
    expect(dot).toHaveClass('animate-pulse')
    // 点靠 .canvas-status-dot 由 canvas.css 上石绿；若退回 bg-current，
    // 它会跟着墨色的章文变成墨色，running 就又只剩文案的差别了。
    expect(dot).not.toHaveClass('bg-current')

    for (const status of [
      NODE_STATUS_IDS.ready,
      NODE_STATUS_IDS.failed,
    ] as const) {
      const { container } = render(<NodeStatusBadge status={status} />)
      expect(container.querySelector('.canvas-status-dot')).toBeNull()
    }
  })

  it('running 挂上专属类，好让 canvas.css 给它上石绿描边', () => {
    const { container } = render(
      <NodeStatusBadge status={NODE_STATUS_IDS.running} />,
    )
    expect(container.firstElementChild).toHaveClass(
      'canvas-status-badge--running',
    )
  })
})

describe('STATUS_COLORS · 编码表本身', () => {
  it('八个状态一个不缺（枚举与色表同步）', () => {
    // 枚举值不能删（老项目 JSON 里可能存着），所以色表必须始终覆盖全枚举。
    for (const status of NODE_STATUSES) {
      expect(STATUS_COLORS).toHaveProperty(status)
    }
  })

  // 曾经的 bug：ready 与 done 的值**逐字符相同**，两个语义相反的态同一枚章；
  // stale 与 disabled 同样。拍板后 done 不盖章，另三个走同一条中性兜底
  // （那是有意的，不是这条要防的重复）。
  it('ready 与 done 不再共用同一份编码', () => {
    expect(STATUS_COLORS.done).toBe('')
    expect(STATUS_COLORS.ready).not.toBe(STATUS_COLORS.done)
  })

  // ⚠ --node-subtle 在三个底色预设上最差只有 3.44，不够 12px 文字的 4.5。
  // canvas.css 给它的注释原话就是「只在卡背上用，别放画布底」，而这枚章
  // 恰恰画在画布底上。
  it('没有任何一个状态还在用不达标的 text-node-subtle', () => {
    for (const [status, value] of Object.entries(STATUS_COLORS)) {
      expect(
        value,
        `${status} 用了对比度 3.44 的 text-node-subtle`,
      ).not.toContain('text-node-subtle')
    }
  })

  // running 不能再搭 --node-paint 那趟车 —— 它在 .domain-canvas 里被重映射成
  // 连线色 #2a2a2a，与 ready/done 的 #26231e 是同色。
  it('running 不再走被重映射的 --node-paint', () => {
    expect(STATUS_COLORS.running).not.toContain('node-paint')
  })
})
