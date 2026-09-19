/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'

import { flashAssistantTouchedNode } from '@/hooks/node/node-ingest-dom'

const TOUCH_CLASS = 'node-assistant-touched'

function mountNode(nodeId: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'react-flow__node'
  wrapper.setAttribute('data-id', nodeId)
  const card = document.createElement('div')
  card.className = 'node-card-paper'
  wrapper.append(card)
  document.body.append(wrapper)
  return card
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('flashAssistantTouchedNode', () => {
  /**
   * ⭐ 回执的第二只眼（进度表 22 · D7 Q4）：面板那行「已改 N 项」说多少，
   * 这一闪说哪几个。断的是 class 真的挂上了 —— 闪不闪得起来在 jsdom 里看不到，
   * 但「class 压根没挂」是唯一会让它彻底失效的那一种失败。
   */
  it('⭐ 给被改的那张卡挂上闪一次的 class', () => {
    const card = mountNode('node-1')
    flashAssistantTouchedNode('node-1')
    expect(card.classList.contains(TOUCH_CLASS)).toBe(true)
  })

  /** ⚠ 动画跑完自己摘掉 —— 留着的话第二次改同一张卡就不会再闪。 */
  it('动画结束后自己摘掉，第二次改还能再闪', () => {
    const card = mountNode('node-1')
    flashAssistantTouchedNode('node-1')
    card.dispatchEvent(new Event('animationend'))
    expect(card.classList.contains(TOUCH_CLASS)).toBe(false)

    flashAssistantTouchedNode('node-1')
    expect(card.classList.contains(TOUCH_CLASS)).toBe(true)
  })

  /** ⚠ 卡不在 DOM 里（折叠的镜 / 手机镜头带）时静默跳过，⛔ 不抛。 */
  it('⛔ 画布上没有这张卡时什么都不做', () => {
    expect(() => flashAssistantTouchedNode('missing')).not.toThrow()
  })
})
