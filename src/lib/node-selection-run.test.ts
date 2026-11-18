import { describe, expect, it } from 'vitest'

import { NODE_SLOT_IDS, NODE_SLOT_OUTPUT_IDS } from '@/constants/node-slots'
import {
  buildSelectionRunDeps,
  runSelectionInOrder,
  summarizeSelectionCost,
} from '@/lib/node-selection-run'
import type { NodeWorkflowEdgeV4 } from '@/types/node-workflow'

function edge(source: string, target: string): NodeWorkflowEdgeV4 {
  return {
    id: `${source}-${target}`,
    source,
    sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
    target,
    slot: NODE_SLOT_IDS.firstFrame,
  }
}

/** 手动放行的 run：记录开始顺序与同时在跑的峰值。 */
function controllableRun(results: Record<string, boolean>) {
  const started: string[] = []
  const waiters = new Map<string, () => void>()
  let active = 0
  let peak = 0
  const run = (id: string) => {
    started.push(id)
    active += 1
    peak = Math.max(peak, active)
    return new Promise<boolean>((resolve) => {
      waiters.set(id, () => {
        active -= 1
        resolve(results[id] ?? true)
      })
    })
  }
  const finish = async (id: string) => {
    waiters.get(id)!()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }
  return { run, started, finish, peak: () => peak }
}

describe('buildSelectionRunDeps', () => {
  it('只看选中集合内部；没选的中间卡照样传递依赖', () => {
    const deps = buildSelectionRunDeps(
      ['a', 'c', 'd'],
      [edge('a', 'b'), edge('b', 'c'), edge('x', 'd')],
    )
    expect(deps.get('c')).toEqual(['a'])
    expect(deps.get('a')).toEqual([])
    // x 没选：d 不等它
    expect(deps.get('d')).toEqual([])
  })
})

describe('runSelectionInOrder', () => {
  it('下游等上游出结果再发', async () => {
    const ctl = controllableRun({})
    const done = runSelectionInOrder({
      nodeIds: ['b', 'a'],
      deps: buildSelectionRunDeps(['b', 'a'], [edge('a', 'b')]),
      limit: 4,
      run: ctl.run,
    })
    expect(ctl.started).toEqual(['a'])
    await ctl.finish('a')
    expect(ctl.started).toEqual(['a', 'b'])
    await ctl.finish('b')
    const outcome = await done
    expect(Object.fromEntries(outcome)).toEqual({ a: 'done', b: 'done' })
  })

  it('上游失败：下游（含间接下游）不发并报上来，无关的卡照常发', async () => {
    const ctl = controllableRun({ a: false })
    const skipped: [string, readonly string[]][] = []
    const ids = ['a', 'b', 'c', 'z']
    const done = runSelectionInOrder({
      nodeIds: ids,
      deps: buildSelectionRunDeps(ids, [edge('a', 'b'), edge('b', 'c')]),
      limit: 4,
      run: ctl.run,
      onSkip: (id, failed) => skipped.push([id, failed]),
    })
    expect(ctl.started).toEqual(['a', 'z'])
    await ctl.finish('a')
    await ctl.finish('z')
    const outcome = await done
    expect(ctl.started).toEqual(['a', 'z'])
    expect(Object.fromEntries(outcome)).toEqual({
      a: 'failed',
      b: 'skipped',
      c: 'skipped',
      z: 'done',
    })
    expect(skipped.map(([id]) => id).sort()).toEqual(['b', 'c'])
  })

  it('并发不超过上限', async () => {
    const ctl = controllableRun({})
    const ids = ['1', '2', '3', '4', '5', '6']
    const done = runSelectionInOrder({
      nodeIds: ids,
      deps: buildSelectionRunDeps(ids, []),
      limit: 2,
      run: ctl.run,
    })
    expect(ctl.started).toEqual(['1', '2'])
    for (const id of ids) await ctl.finish(id)
    await done
    expect(ctl.started).toEqual(ids)
    expect(ctl.peak()).toBe(2)
  })

  it('run 抛错按失败算，⛔ 不卡死', async () => {
    const outcome = await runSelectionInOrder({
      nodeIds: ['a', 'b'],
      deps: buildSelectionRunDeps(['a', 'b'], [edge('a', 'b')]),
      limit: 4,
      run: (id) =>
        id === 'a' ? Promise.reject(new Error('x')) : Promise.resolve(true),
    })
    expect(Object.fromEntries(outcome)).toEqual({ a: 'failed', b: 'skipped' })
  })

  it('有环不死等：环里的卡放行', async () => {
    const outcome = await runSelectionInOrder({
      nodeIds: ['a', 'b'],
      deps: buildSelectionRunDeps(['a', 'b'], [edge('a', 'b'), edge('b', 'a')]),
      limit: 4,
      run: () => Promise.resolve(true),
    })
    expect(Object.fromEntries(outcome)).toEqual({ a: 'done', b: 'done' })
  })
})

describe('summarizeSelectionCost', () => {
  it('估得出的加起来，估不出的数张数', () => {
    expect(summarizeSelectionCost([0.04, null, 0.5])).toEqual({
      total: 0.54,
      unpriced: 1,
    })
  })
})
