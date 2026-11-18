import { describe, expect, it } from 'vitest'

import type { ActiveRun, RunItem } from '@/types'

import { hasNewRunItem } from './studio-run-submission'

const item = (id: string, status: RunItem['status'] = 'generating'): RunItem =>
  ({ id, modelId: 'm', status, generation: null, error: null }) as RunItem

const run = (
  id: string,
  items: RunItem[],
  outputType: ActiveRun['outputType'] = 'IMAGE',
): ActiveRun => ({
  id,
  mode: 'single',
  items,
  selectedItemId: null,
  prompt: '',
  startedAt: 0,
  outputType,
})

/**
 * 舞台面板（构图 / 模板 / 查资料 / 角色）在「这一拍有新提交」时收回结果
 * （11-17 标签台真机：停在构图面板上发送，进度卡与结果藏在面板后面）。
 */
describe('hasNewRunItem', () => {
  it('第一次提交（之前没有批次）算', () => {
    expect(hasNewRunItem(null, run('r1', [item('a')]))).toBe(true)
  })

  it('图片再提交一次：新批次、新条目，算', () => {
    expect(
      hasNewRunItem(
        run('r1', [item('a', 'completed')]),
        run('r2', [item('b')]),
      ),
    ).toBe(true)
  })

  it('视频排队：同一批多了一条，算', () => {
    const before = run('v', [item('a')], 'VIDEO')
    expect(
      hasNewRunItem(before, run('v', [item('a'), item('b')], 'VIDEO')),
    ).toBe(true)
  })

  it('轮询改状态 / 取消摘条 / 清空批次都不算（⛔ 用户开着面板时被收走）', () => {
    const before = run('r1', [item('a'), item('b')])
    expect(
      hasNewRunItem(before, run('r1', [item('a', 'completed'), item('b')])),
    ).toBe(false)
    expect(hasNewRunItem(before, run('r1', [item('a')]))).toBe(false)
    expect(hasNewRunItem(before, null)).toBe(false)
    expect(hasNewRunItem(before, before)).toBe(false)
  })
})
