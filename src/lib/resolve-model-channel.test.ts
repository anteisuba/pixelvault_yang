import { describe, it, expect } from 'vitest'

import {
  resolveModelChannel,
  type ModelChannelCandidate,
} from '@/lib/resolve-model-channel'

function channel(
  channelId: string,
  overrides: Partial<ModelChannelCandidate> = {},
): ModelChannelCandidate {
  return {
    channelId,
    channelLabel: channelId,
    hasUserKey: false,
    unitPrice: null,
    ...overrides,
  }
}

/**
 * D2 Q1（owner 2026-09-17）：**没有「自动」渠道**。这一组用例锁的就是那条决定 ——
 * 只有「手选记住的」与「只有一条」两种情况成立，其余一律未选。
 */
describe('resolveModelChannel', () => {
  it('returns null for an empty channel list', () => {
    expect(resolveModelChannel([])).toBeNull()
  })

  it('auto-selects the only channel a model has', () => {
    const result = resolveModelChannel([channel('fal', { unitPrice: 0.01 })])
    expect(result?.channel.channelId).toBe('fal')
    expect(result?.reason).toBe('only')
  })

  it('leaves a multi-channel model unselected until the user picks', () => {
    expect(
      resolveModelChannel([
        channel('fal', { unitPrice: 0.473 }),
        channel('volc', { unitPrice: 0.213 }),
      ]),
    ).toBeNull()
  })

  /** ⛔ 便宜不再是理由 —— 「自动 = 最便宜」随「自动」一起删了。 */
  it('never falls back to the cheapest channel', () => {
    expect(
      resolveModelChannel([
        channel('volc', { unitPrice: 0.085 }),
        channel('fal', { unitPrice: 0.0675 }),
      ]),
    ).toBeNull()
  })

  /** ⛔ 有 key 也不再是理由：配了 key 只是那颗点变绿，不代表他选了这条。 */
  it('never falls back to the channel that happens to have a key', () => {
    expect(
      resolveModelChannel([
        channel('fal', { hasUserKey: true, unitPrice: 0.5 }),
        channel('volc', { unitPrice: 0.01 }),
      ]),
    ).toBeNull()
  })

  it('honours the remembered manual channel', () => {
    const result = resolveModelChannel(
      [channel('fal', { unitPrice: 0.473 }), channel('volc')],
      'volc',
    )
    expect(result?.channel.channelId).toBe('volc')
    expect(result?.reason).toBe('manual')
  })

  /**
   * key 失效不改选 —— 点变黄、价格位清空，但它仍然是这个型号选中的渠道
   * （owner D2 Q1：「key 失效时该渠道点变黄、价格位清空」）。
   */
  it('keeps the remembered channel even when its key is gone', () => {
    const result = resolveModelChannel(
      [
        channel('fal', { hasUserKey: true, unitPrice: 0.473 }),
        channel('volc', { hasUserKey: false }),
      ],
      'volc',
    )
    expect(result?.channel.channelId).toBe('volc')
    expect(result?.reason).toBe('manual')
  })

  /** 记忆里的渠道已经不在清单里（下架 / 被模式过滤掉）→ 静默回到未选。 */
  it('falls back to unselected when the remembered channel left the list', () => {
    expect(
      resolveModelChannel([channel('fal'), channel('volc')], 'byteplus'),
    ).toBeNull()
  })

  it('still selects the single channel even when memory points elsewhere', () => {
    const result = resolveModelChannel([channel('fal')], 'gone')
    expect(result?.channel.channelId).toBe('fal')
    expect(result?.reason).toBe('only')
  })
})
