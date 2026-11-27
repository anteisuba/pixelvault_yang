import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Copy, Download, Eye, Trash2 } from '@/components/icons'

import {
  NodeCornerActions,
  computeCornerOrbPositions,
  type NodeCornerAction,
} from './NodeCornerActions'

describe('computeCornerOrbPositions', () => {
  it('围绕卡片右上角 -45° 对角线对称分布，且相邻球心距离大于球径（无重叠）', () => {
    for (const count of [2, 3, 4]) {
      const positions = computeCornerOrbPositions(count)
      expect(positions).toHaveLength(count)

      // 首尾对称：关于 y = -x 镜像 → x_last ≈ -y_first 且 y_last ≈ -x_first
      const first = positions[0]!
      const last = positions[count - 1]!
      expect(Math.abs(last.x + first.y)).toBeLessThan(0.5)
      expect(Math.abs(last.y + first.x)).toBeLessThan(0.5)

      // 相邻两颗球心距 ≥ 34px（球径 30px，至少保留 4px 缝隙）
      for (let i = 1; i < positions.length; i += 1) {
        const a = positions[i - 1]!
        const b = positions[i]!
        const dist = Math.hypot(b.x - a.x, b.y - a.y)
        expect(dist).toBeGreaterThanOrEqual(34)
      }
    }
  })

  it('0 颗返回空数组', () => {
    expect(computeCornerOrbPositions(0)).toEqual([])
  })
})

describe('NodeCornerActions', () => {
  const makeActions = (): readonly NodeCornerAction[] => [
    { id: 'quickLook', label: '快速看', icon: Eye, onSelect: vi.fn() },
    { id: 'duplicate', label: '复制', icon: Copy, onSelect: vi.fn() },
    { id: 'download', label: '下载', icon: Download, onSelect: vi.fn() },
    {
      id: 'delete',
      label: '删除',
      icon: Trash2,
      danger: true,
      onSelect: vi.fn(),
    },
  ]

  it('open=false 不渲染动作球；open=true 渲染全部动作并按 1/zoom 反向缩放', () => {
    const actions = makeActions()
    const { container, rerender } = render(
      <NodeCornerActions actions={actions} open={false} zoom={0.5} />,
    )
    expect(container.querySelectorAll('[data-corner-action]')).toHaveLength(0)

    rerender(<NodeCornerActions actions={actions} open zoom={0.5} />)
    const orbs = container.querySelectorAll('[data-corner-action]')
    expect(orbs).toHaveLength(4)
    const root = container.querySelector(
      '[data-node-chrome="corner-actions"]',
    ) as HTMLElement
    expect(root.style.transform).toBe('scale(2)')
  })

  it('点击动作球触发回调、通知收起且阻止冒泡到卡片单击/双击', () => {
    const actions = makeActions()
    const parentClick = vi.fn()
    const parentDoubleClick = vi.fn()
    const onActionTriggered = vi.fn()

    const { container } = render(
      <div onClick={parentClick} onDoubleClick={parentDoubleClick}>
        <NodeCornerActions
          actions={actions}
          open
          onActionTriggered={onActionTriggered}
        />
      </div>,
    )

    const delButton = container.querySelector('[data-corner-action="delete"]')!
    fireEvent.click(delButton)
    fireEvent.doubleClick(delButton)

    expect(actions[3]!.onSelect).toHaveBeenCalledTimes(1)
    expect(onActionTriggered).toHaveBeenCalledTimes(1)
    expect(parentClick).not.toHaveBeenCalled()
    expect(parentDoubleClick).not.toHaveBeenCalled()
  })
})
