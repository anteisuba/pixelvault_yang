/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EASE_STANDARD_CSS, NODE_DROP_FADE_MOTION } from '@/constants/motion'
import {
  fadeInNodeCards,
  flashAssistantTouchedNode,
} from '@/hooks/node/node-ingest-dom'

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

describe('fadeInNodeCards', () => {
  /** 手动推帧：新卡什么时候进 DOM 由测试决定，⛔ 不靠真的 rAF 时序。 */
  let frames: FrameRequestCallback[] = []
  const animate = vi.fn()

  function mountWrapper(nodeId: string): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'react-flow__node'
    wrapper.setAttribute('data-id', nodeId)
    document.body.append(wrapper)
    return wrapper
  }

  function flushFrame(): void {
    const pending = frames
    frames = []
    pending.forEach((callback) => callback(0))
  }

  function stubReducedMotion(matches: boolean): void {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches }) as unknown as MediaQueryList),
    )
  }

  beforeEach(() => {
    frames = []
    animate.mockReset()
    // jsdom 没有 WAAPI —— 挂一只假的，断言它收到的 keyframes / timing。
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      writable: true,
      value: animate,
    })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function delaysByNode(): Record<string, unknown> {
    return Object.fromEntries(
      animate.mock.contexts.map((element, call) => [
        (element as HTMLElement).getAttribute('data-id'),
        (animate.mock.calls[call]![1] as KeyframeAnimationOptions).delay,
      ]),
    )
  }

  /** ⭐ 动效表「逐张淡入（错开 40）」：按落下的顺序 0 / 40 / 80。 */
  it('⭐ 按落下的顺序逐张淡入，每张错开 40', () => {
    mountWrapper('a')
    mountWrapper('b')
    mountWrapper('c')
    fadeInNodeCards(['a', 'b', 'c'])
    expect(animate).not.toHaveBeenCalled()

    flushFrame()
    expect(animate).toHaveBeenCalledTimes(3)
    expect(delaysByNode()).toEqual({ a: 0, b: 40, c: 80 })
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], {
      duration: NODE_DROP_FADE_MOTION.durationMs,
      delay: 0,
      easing: EASE_STANDARD_CSS,
      fill: 'backwards',
    })
  })

  /** ⚠ reduced motion：直接落位 + fast 档淡入，⛔ 不错开。 */
  it('reduced motion 下一律 fast 档、不错开', () => {
    stubReducedMotion(true)
    mountWrapper('a')
    mountWrapper('b')
    mountWrapper('c')
    fadeInNodeCards(['a', 'b', 'c'])
    flushFrame()

    expect(delaysByNode()).toEqual({ a: 0, b: 0, c: 0 })
    for (const [, options] of animate.mock.calls) {
      expect((options as KeyframeAnimationOptions).duration).toBe(
        NODE_DROP_FADE_MOTION.reducedDurationMs,
      )
    }
  })

  /** ⚠ 卡晚一帧才进 DOM 时照样淡，延迟仍按落下的顺序（⛔ 不按被找到的先后）。 */
  it('卡晚几帧才出现也照样淡入，延迟按落下的顺序', () => {
    mountWrapper('a')
    fadeInNodeCards(['a', 'b'])
    flushFrame()
    expect(delaysByNode()).toEqual({ a: 0 })

    mountWrapper('b')
    flushFrame()
    expect(delaysByNode()).toEqual({ a: 0, b: 40 })
    expect(frames).toHaveLength(0)
  })

  /** ⛔ 画布上一直没有这张卡（手机镜头带）：等满上限就停，不抛、不空转。 */
  it('⛔ 卡一直不出现时有限帧后停下', () => {
    fadeInNodeCards(['missing'])
    for (let frame = 0; frame < 20 && frames.length > 0; frame += 1) {
      flushFrame()
    }
    expect(frames).toHaveLength(0)
    expect(animate).not.toHaveBeenCalled()
  })
})
