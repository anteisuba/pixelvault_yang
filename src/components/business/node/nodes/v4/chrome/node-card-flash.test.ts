import { afterEach, describe, expect, it, vi } from 'vitest'

import { flashNodeCard } from './node-card-flash'

const TOUCH_CLASS = 'node-assistant-touched'

/** 与 v4 卡同一副骨架：ReactFlow 节点 → 名字行 + 卡面。 */
function mountCard(nodeId: string) {
  const wrapper = document.createElement('div')
  wrapper.className = 'react-flow__node'
  wrapper.setAttribute('data-id', nodeId)
  const nameRow = document.createElement('div')
  const surface = document.createElement('div')
  surface.setAttribute('data-node-card-surface', '')
  wrapper.append(nameRow, surface)
  document.body.append(wrapper)
  return { wrapper, nameRow, surface }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

// 方向 B（owner 2026-09-29）：连完 / 助手改完 / 清单里点到 —— 同一种一闪，只闪卡面。
describe('卡面闪一下', () => {
  it('只闪卡面，⛔ 不连名字行、⛔ 不闪整个节点', () => {
    const { wrapper, nameRow, surface } = mountCard('s_1')
    flashNodeCard('s_1')
    expect(surface.classList.contains(TOUCH_CLASS)).toBe(true)
    expect(wrapper.classList.contains(TOUCH_CLASS)).toBe(false)
    expect(nameRow.classList.contains(TOUCH_CLASS)).toBe(false)
  })

  it('给了延迟就等镜头停下再闪', () => {
    vi.useFakeTimers()
    const { surface } = mountCard('s_1')
    flashNodeCard('s_1', 420)
    expect(surface.classList.contains(TOUCH_CLASS)).toBe(false)
    vi.advanceTimersByTime(420)
    expect(surface.classList.contains(TOUCH_CLASS)).toBe(true)
  })

  it('画布上没有这张卡时什么都不做', () => {
    expect(() => flashNodeCard('missing')).not.toThrow()
  })
})
