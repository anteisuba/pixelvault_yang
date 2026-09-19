import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { useCanvasOperatorRequests } from '@/hooks/node/use-canvas-operator-requests'
import { requestCanvasRerunDownstream } from '@/lib/canvas-rerun-request'
import { requestTimelinePlan } from '@/lib/timeline-plan-request'
import { requestCanvasTextAssist } from '@/components/business/node/nodes/v4/text/text-assist-request'

function mount(domain = ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas) {
  const send = vi.fn()
  renderHook(() =>
    useCanvasOperatorRequests({
      domain,
      send,
      nodeName: (nodeId) => (nodeId === 'node-1' ? 'S02·首帧' : nodeId),
    }),
  )
  return send
}

/**
 * ⭐ 这三条用例守的是**同一件事**：画布上那三个入口点得动之后真的有事发生。
 * 旧 dock 退场之后它们的消费方消失了，而失效的表现是「照样点得动、照样有动画、
 * 什么都不发生」—— 三绿而功能全失效，本仓最难发现的那一类。
 */
describe('useCanvasOperatorRequests', () => {
  it('⭐ 右键「重跑下游」→ 发一句只要名单不要跑的话', () => {
    const send = mount()
    requestCanvasRerunDownstream('node-1')
    expect(send).toHaveBeenCalledTimes(1)
    const sentence = send.mock.calls[0]?.[0] as string
    // 句子里写**名字**不是 id —— 用户看着画布认得的是名字。
    expect(sentence).toContain('S02·首帧')
    expect(sentence).toContain('别跑')
  })

  it('⭐ 文本卡续写 / 重写各译成一句，chip 的动作写进话里', () => {
    const send = mount()
    requestCanvasTextAssist({
      nodeId: 'node-1',
      action: 'continue',
      prompt: '天黑下来',
    })
    expect(send.mock.calls[0]?.[0]).toBe(
      '把「S02·首帧」这段接着往下写：天黑下来',
    )

    requestCanvasTextAssist({ nodeId: 'node-1', action: 'rewrite', prompt: '' })
    expect(send.mock.calls[1]?.[0]).toBe('把「S02·首帧」这段重写。')
  })

  it('⭐ 剪辑台排片栏那一句照样送到面板', () => {
    const send = mount()
    requestTimelinePlan({ prompt: '按对白切三段' })
    expect(send).toHaveBeenCalledWith('按对白切三段')
  })

  /**
   * ⚠ 便条**取走即消费**：留着它，面板每次重挂都会再发一遍同一句话。
   * 这里顺带证明了那条 —— 第二次订阅时队列已经空了。
   */
  it('便条取走即消费，⛔ 不会重发', () => {
    const first = mount()
    requestCanvasRerunDownstream('node-1')
    expect(first).toHaveBeenCalledTimes(1)
    const second = mount()
    expect(second).not.toHaveBeenCalled()
  })

  /** ⛔ 别的工作台上一张便条都不取 —— 那里收到画布便条只会发出一句谁都看不懂的话。 */
  it('⛔ 非画布域一张便条都不取', () => {
    const send = mount(ASSISTANT_PROTOCOL_DOMAIN_IDS.image)
    requestCanvasRerunDownstream('node-1')
    requestCanvasTextAssist({ nodeId: 'node-1', prompt: 'x' })
    requestTimelinePlan({ prompt: 'y' })
    expect(send).not.toHaveBeenCalled()
  })
})
