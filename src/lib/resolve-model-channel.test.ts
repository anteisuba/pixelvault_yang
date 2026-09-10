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
    hasFreeQuota: false,
    unitPrice: null,
    ...overrides,
  }
}

describe('resolveModelChannel', () => {
  it('returns null for an empty channel list', () => {
    expect(resolveModelChannel([])).toBeNull()
  })

  it('prefers the user own key over platform quota and price', () => {
    const result = resolveModelChannel([
      channel('free', { hasFreeQuota: true, unitPrice: 0 }),
      channel('cheap', { unitPrice: 0.01 }),
      channel('mine', { hasUserKey: true, unitPrice: 0.5 }),
    ])
    expect(result?.channel.channelId).toBe('mine')
    expect(result?.reason).toBe('userKey')
  })

  it('prefers platform free quota over the cheapest paid channel', () => {
    const result = resolveModelChannel([
      channel('cheap', { unitPrice: 0.001 }),
      channel('free', { hasFreeQuota: true, unitPrice: 0.2 }),
    ])
    expect(result?.channel.channelId).toBe('free')
    expect(result?.reason).toBe('freeQuota')
  })

  it('falls back to the cheapest channel when nothing is configured', () => {
    const result = resolveModelChannel([
      channel('volc', { unitPrice: 0.085 }),
      channel('fal', { unitPrice: 0.0675 }),
    ])
    expect(result?.channel.channelId).toBe('fal')
    expect(result?.reason).toBe('cheapest')
  })

  it('compares price INSIDE a tier — two own keys still pick the cheaper', () => {
    const result = resolveModelChannel([
      channel('volc', { hasUserKey: true, unitPrice: 0.085 }),
      channel('fal', { hasUserKey: true, unitPrice: 0.0675 }),
    ])
    expect(result?.channel.channelId).toBe('fal')
    expect(result?.reason).toBe('userKey')
  })

  it('ranks a healthy key above a failed one before comparing price', () => {
    const result = resolveModelChannel([
      channel('failed', {
        hasUserKey: true,
        unitPrice: 0.01,
        health: 'failed',
      }),
      channel('ok', { hasUserKey: true, unitPrice: 0.5, health: 'available' }),
    ])
    expect(result?.channel.channelId).toBe('ok')
  })

  it('treats a missing price as most expensive, never as free', () => {
    const result = resolveModelChannel([
      channel('unknown-price', { unitPrice: null }),
      channel('priced', { unitPrice: 9.99 }),
    ])
    expect(result?.channel.channelId).toBe('priced')
  })

  it('keeps list order on a dead tie and reports how many tied', () => {
    const result = resolveModelChannel([
      channel('first', { unitPrice: 0.05 }),
      channel('second', { unitPrice: 0.05 }),
      channel('third', { unitPrice: 0.05 }),
    ])
    expect(result?.channel.channelId).toBe('first')
    expect(result?.tiedWith).toBe(2)
  })

  it('reports no tie when the winner is strictly better', () => {
    const result = resolveModelChannel([
      channel('a', { unitPrice: 0.01 }),
      channel('b', { unitPrice: 0.02 }),
    ])
    expect(result?.tiedWith).toBe(0)
  })

  it('lets a remembered manual pick win over every automatic rule', () => {
    const result = resolveModelChannel(
      [
        channel('mine', { hasUserKey: true, unitPrice: 0.01 }),
        channel('volc', { hasUserKey: true, unitPrice: 0.085 }),
      ],
      'volc',
    )
    expect(result?.channel.channelId).toBe('volc')
    expect(result?.reason).toBe('manual')
  })

  /**
   * owner 2026-09-10 真机第二条：视频卡的模型弹层里「VolcEngine · 需要 API key」
   * 是**选中态**。缺 key 的渠道一条都不许被自动规则或记忆选上。
   */
  it('never lands on a channel with neither a key nor free quota', () => {
    const result = resolveModelChannel([
      channel('volc-no-key', { unitPrice: 0.001 }),
      channel('byteplus', { hasUserKey: true, unitPrice: 0.121 }),
    ])
    expect(result?.channel.channelId).toBe('byteplus')
  })

  it('recomputes when the remembered channel has since lost its key', () => {
    const result = resolveModelChannel(
      [
        channel('volc', { unitPrice: 0.001 }),
        channel('byteplus', { hasUserKey: true, unitPrice: 0.121 }),
      ],
      'volc',
    )
    expect(result?.channel.channelId).toBe('byteplus')
    expect(result?.reason).toBe('userKey')
  })

  it('still answers when the whole list is missing keys (the chip needs a name)', () => {
    const result = resolveModelChannel([
      channel('volc', { unitPrice: 0.085 }),
      channel('fal', { unitPrice: 0.0675 }),
    ])
    expect(result?.channel.channelId).toBe('fal')
    expect(result?.reason).toBe('cheapest')
  })

  it('honours a remembered channel that is the only kind left — all locked', () => {
    const result = resolveModelChannel(
      [
        channel('volc', { unitPrice: 0.085 }),
        channel('fal', { unitPrice: 0.06 }),
      ],
      'volc',
    )
    expect(result?.channel.channelId).toBe('volc')
    expect(result?.reason).toBe('manual')
  })

  it('falls back to the automatic rules when the remembered channel is gone', () => {
    const result = resolveModelChannel(
      [channel('mine', { hasUserKey: true, unitPrice: 0.01 })],
      'retired-channel',
    )
    expect(result?.channel.channelId).toBe('mine')
    expect(result?.reason).toBe('userKey')
  })
})
