import { describe, it, expect, vi } from 'vitest'

import { createAssistantTypewriter } from '@/lib/assistant-typewriter'
import { ASSISTANT_TYPEWRITER } from '@/constants/assistant'

/** 手动驱动的时钟 —— 打字机的行为必须逐拍可断言，不能靠 sleep 猜。 */
function fakeScheduler() {
  let handler: (() => void) | null = null
  return {
    scheduler: {
      setInterval: (fn: () => void) => {
        handler = fn
        return 1 as unknown as ReturnType<typeof setInterval>
      },
      clearInterval: () => {
        handler = null
      },
    },
    tick(times = 1) {
      for (let i = 0; i < times; i += 1) handler?.()
    },
    get running() {
      return handler !== null
    },
  }
}

describe('createAssistantTypewriter', () => {
  it('一个字一个字吐，不是一次蹦完', () => {
    const clock = fakeScheduler()
    const onUpdate = vi.fn()
    const writer = createAssistantTypewriter({
      onUpdate,
      scheduler: clock.scheduler,
    })

    writer.push('abcdefghij')
    expect(writer.visible()).toBe('')

    clock.tick()
    const afterOne = writer.visible()
    expect(afterOne.length).toBeGreaterThan(0)
    expect(afterOne.length).toBeLessThan(10)
    expect(onUpdate).toHaveBeenCalledWith(afterOne)
  })

  it('缓冲式 provider 一次塞一整段也照样逐拍吐', () => {
    const clock = fakeScheduler()
    const writer = createAssistantTypewriter({
      onUpdate: () => {},
      scheduler: clock.scheduler,
    })

    // DeepSeek 那种：整段一次到手
    writer.push('x'.repeat(600))

    const lengths: number[] = []
    for (let i = 0; i < 5; i += 1) {
      clock.tick()
      lengths.push(writer.visible().length)
    }

    // 单调递增且没有一次到底 —— 这就是「统一标准」要保证的事
    expect(lengths[0]).toBeGreaterThan(0)
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b))
    expect(lengths.at(-1)).toBeLessThan(600)
  })

  it('积压再大也不超过 maxCharsPerTick —— 这条决定「像打字」而不是「像跳字」', () => {
    const clock = fakeScheduler()
    const writer = createAssistantTypewriter({
      onUpdate: () => {},
      scheduler: clock.scheduler,
    })

    // 常见长度（几百字）：owner 2026-08-18 反馈「字跳得太快」的就是这个场景
    writer.push('x'.repeat(500))

    let prev = 0
    for (let i = 0; i < 10; i += 1) {
      clock.tick()
      const step = writer.visible().length - prev
      expect(step).toBeLessThanOrEqual(ASSISTANT_TYPEWRITER.maxCharsPerTick)
      expect(step).toBeGreaterThanOrEqual(ASSISTANT_TYPEWRITER.minCharsPerTick)
      prev = writer.visible().length
    }
  })

  it('超长回答走时长兜底：允许放大步长，不让人干等几十秒', () => {
    const clock = fakeScheduler()
    const writer = createAssistantTypewriter({
      onUpdate: () => {},
      scheduler: clock.scheduler,
    })

    const huge = 20_000
    writer.push('x'.repeat(huge))
    clock.tick()

    // 常态上限挡不住它 —— 这正是兜底该生效的地方
    expect(writer.visible().length).toBeGreaterThan(
      ASSISTANT_TYPEWRITER.maxCharsPerTick,
    )

    // 且确实能在有界时间内跑完。步长随积压缩小而递减，尾巴会多花几拍，所以
    // 界放在预算的两倍 —— 要证的是「不会拖到几十秒」，不是掐秒表。
    const budgetTicks = Math.floor(
      ASSISTANT_TYPEWRITER.maxDrainMs / ASSISTANT_TYPEWRITER.tickMs,
    )
    const ceiling = budgetTicks * 2
    let ticks = 1
    while (
      clock.running &&
      writer.visible().length < huge &&
      ticks <= ceiling
    ) {
      clock.tick()
      ticks += 1
    }
    expect(writer.visible().length).toBe(huge)
    expect(ticks).toBeLessThanOrEqual(ceiling)
  })

  it('至少保证 minCharsPerTick，短回复也有打字感', () => {
    const clock = fakeScheduler()
    const writer = createAssistantTypewriter({
      onUpdate: () => {},
      scheduler: clock.scheduler,
    })

    writer.push('abc')
    clock.tick()

    expect(writer.visible().length).toBe(ASSISTANT_TYPEWRITER.minCharsPerTick)
  })

  it('finish() 是「不再有新输入，但继续打完」，不是「立刻全部倒出来」', async () => {
    const clock = fakeScheduler()
    const onUpdate = vi.fn()
    const writer = createAssistantTypewriter({
      onUpdate,
      scheduler: clock.scheduler,
    })

    writer.push('x'.repeat(500))
    clock.tick()
    expect(writer.visible().length).toBeLessThan(500)

    const drained = writer.finish()

    // ⚠ 关键回归：owner 2026-08-18 看到「字跳得太快」，根因就是这里以前直接把剩下
    // 的全塞出去 —— provider 两秒传完，打字机才跳两拍就被倒完。
    expect(writer.visible().length).toBeLessThan(500)
    expect(clock.running).toBe(true)

    while (clock.running) clock.tick()
    await drained

    expect(writer.visible()).toBe('x'.repeat(500))
    expect(onUpdate).toHaveBeenLastCalledWith('x'.repeat(500))
  })

  it('已经打完时 finish() 直接 resolve', async () => {
    const clock = fakeScheduler()
    const writer = createAssistantTypewriter({
      onUpdate: () => {},
      scheduler: clock.scheduler,
    })

    writer.push('ab')
    while (clock.running && writer.visible() !== 'ab') clock.tick()

    await writer.finish()
    expect(writer.visible()).toBe('ab')
  })

  it('cancel() 放行等在 finish() 上的调用方，不让它永远挂着', async () => {
    const clock = fakeScheduler()
    const writer = createAssistantTypewriter({
      onUpdate: () => {},
      scheduler: clock.scheduler,
    })

    writer.push('x'.repeat(500))
    clock.tick()
    const drained = writer.finish()
    writer.cancel()

    await expect(drained).resolves.toBeUndefined()
    expect(clock.running).toBe(false)
  })

  it('cancel() 停表但保留已显示的部分 —— 错误尾巴要接在这后面', () => {
    const clock = fakeScheduler()
    const writer = createAssistantTypewriter({
      onUpdate: () => {},
      scheduler: clock.scheduler,
    })

    writer.push('x'.repeat(100))
    clock.tick(2)
    const shown = writer.visible()
    expect(shown.length).toBeGreaterThan(0)

    writer.cancel()

    expect(writer.visible()).toBe(shown)
    expect(clock.running).toBe(false)
    // 停了就不该再动
    clock.tick(5)
    expect(writer.visible()).toBe(shown)
  })

  it('追平后自动停表，不空转烧渲染', () => {
    const clock = fakeScheduler()
    const onUpdate = vi.fn()
    const writer = createAssistantTypewriter({
      onUpdate,
      scheduler: clock.scheduler,
    })

    writer.push('ab')
    // 跑到追平为止 —— 具体几拍取决于 min/max 调参，测试不该绑死那个数
    while (clock.running && writer.visible() !== 'ab') clock.tick()
    expect(writer.visible()).toBe('ab')

    clock.tick()
    expect(clock.running).toBe(false)

    const callsAfterDrain = onUpdate.mock.calls.length
    clock.tick(3)
    expect(onUpdate.mock.calls.length).toBe(callsAfterDrain)
  })

  it('停表后又来新 chunk 会重新起表', () => {
    const clock = fakeScheduler()
    const writer = createAssistantTypewriter({
      onUpdate: () => {},
      scheduler: clock.scheduler,
    })

    writer.push('ab')
    while (clock.running && writer.visible() !== 'ab') clock.tick()
    clock.tick()
    expect(clock.running).toBe(false)

    writer.push('cd')
    expect(clock.running).toBe(true)
    while (clock.running && writer.visible() !== 'abcd') clock.tick()
    expect(writer.visible()).toBe('abcd')
  })

  it('raw() 给的是收到的全文，visible() 给的是已显示的', () => {
    const clock = fakeScheduler()
    const writer = createAssistantTypewriter({
      onUpdate: () => {},
      scheduler: clock.scheduler,
    })

    writer.push('x'.repeat(300))
    clock.tick()

    expect(writer.raw()).toBe('x'.repeat(300))
    expect(writer.visible().length).toBeLessThan(300)
  })

  it('空 chunk 不起表', () => {
    const clock = fakeScheduler()
    const writer = createAssistantTypewriter({
      onUpdate: () => {},
      scheduler: clock.scheduler,
    })

    writer.push('')

    expect(clock.running).toBe(false)
    expect(writer.visible()).toBe('')
  })
})
