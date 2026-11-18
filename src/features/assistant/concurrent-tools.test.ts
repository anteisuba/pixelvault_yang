import { describe, expect, it } from 'vitest'

import { planToolBatches, runConcurrently } from './concurrent-tools'

const readOnly = (name: string) => name === 'find' || name === 'look'

describe('planToolBatches：连着的只读调用并成一串，其余照原顺序单独跑', () => {
  it('find / look 连着的并一串；edit 把前后隔开', () => {
    expect(
      planToolBatches(
        ['find', 'look', 'edit', 'look', 'find', 'generate', 'ask', 'open'],
        readOnly,
      ),
    ).toEqual([
      { concurrent: true, items: ['find', 'look'] },
      { concurrent: false, items: ['edit'] },
      { concurrent: true, items: ['look', 'find'] },
      { concurrent: false, items: ['generate'] },
      { concurrent: false, items: ['ask'] },
      { concurrent: false, items: ['open'] },
    ])
  })

  it('两个写的调用 ⛔ 并在一起；空的就是空', () => {
    expect(planToolBatches(['edit', 'edit'], readOnly)).toEqual([
      { concurrent: false, items: ['edit'] },
      { concurrent: false, items: ['edit'] },
    ])
    expect(planToolBatches([], readOnly)).toEqual([])
  })
})

/** 一个会先发「开始」、等一会儿、再发「结束」的生成器；记下自己什么时候开跑的。 */
function tool(name: string, ms: number, log: string[]) {
  return (async function* (): AsyncGenerator<string, string> {
    log.push(`start ${name}`)
    yield `${name}:running`
    await new Promise((resolve) => setTimeout(resolve, ms))
    yield `${name}:done`
    return `${name} result`
  })()
}

async function drain<E, R>(generator: AsyncGenerator<E, R>) {
  const events: E[] = []
  for (;;) {
    const step = await generator.next()
    if (step.done) return { events, result: step.value }
    events.push(step.value)
  }
}

describe('runConcurrently：一起跑、事件随到随交、结果按调用顺序', () => {
  it('慢的排在前面也一起开跑；结果照传进来的顺序；先跑完的事件先到', async () => {
    const log: string[] = []
    const { events, result } = await drain(
      runConcurrently([tool('slow', 40, log), tool('fast', 5, log)]),
    )
    // 两个都在任一个跑完之前就开跑了（串着跑会是 start slow → slow:done → start fast）。
    expect(log).toEqual(['start slow', 'start fast'])
    expect(events.indexOf('fast:done')).toBeLessThan(
      events.indexOf('slow:done'),
    )
    expect(events.indexOf('slow:running')).toBeLessThan(
      events.indexOf('fast:done'),
    )
    expect(result).toEqual(['slow result', 'fast result'])
  })

  it('一个抛错 = 整体抛错，另一个被收掉', async () => {
    let finished = false
    const ok = (async function* (): AsyncGenerator<string, string> {
      try {
        yield 'ok:running'
        await new Promise((resolve) => setTimeout(resolve, 30))
        yield 'ok:done'
        return 'ok'
      } finally {
        finished = true
      }
    })()
    const bad = (async function* (): AsyncGenerator<string, string> {
      await new Promise((resolve) => setTimeout(resolve, 5))
      throw new Error('boom')
    })()
    await expect(drain(runConcurrently([ok, bad]))).rejects.toThrow('boom')
    expect(finished).toBe(true)
  })

  it('一个都没有：直接交回空', async () => {
    expect(await drain(runConcurrently<string, string>([]))).toEqual({
      events: [],
      result: [],
    })
  })
})
