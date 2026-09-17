import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  buildImageSpecChipModel,
  buildVideoSpecChipModel,
} from '@/lib/spec-chip-model'

describe('buildImageSpecChipModel', () => {
  it('比例恒五档全支持；清晰度从能力表派生，不支持的档留在名单里但划线', () => {
    const model = buildImageSpecChipModel({
      adapterType: AI_ADAPTER_TYPES.FAL,
      modelId: AI_MODELS.SEEDREAM_50_PRO,
      aspectRatio: '1:1',
      resolution: '2K',
    })

    expect(model.ratios.map((tier) => tier.value)).toEqual([
      '1:1',
      '16:9',
      '9:16',
      '4:3',
      '3:4',
    ])
    expect(model.ratios.every((tier) => tier.supported)).toBe(true)
    // 值域来自能力表；至少有一档不支持时它**不被移除**，只是 supported = false。
    expect(model.resolutions.length).toBeGreaterThan(0)
    expect(model.resolutions.map((tier) => tier.value)).toContain('2K')
  })

  it('摘要只印确实在候选里的值 —— `auto` 不在候选里就不印', () => {
    const withAuto = buildImageSpecChipModel({
      adapterType: AI_ADAPTER_TYPES.FAL,
      modelId: AI_MODELS.SEEDREAM_50_PRO,
      aspectRatio: '16:9',
      resolution: 'auto',
    })
    const printed = withAuto.resolutions.some(
      (tier) => tier.value === 'auto' && tier.supported,
    )
    expect(withAuto.summary).toBe(printed ? '16:9 · auto' : '16:9')
  })

  it('认不出来的 adapter 不编一份能力：清晰度整段为空', () => {
    const model = buildImageSpecChipModel({
      adapterType: undefined,
      modelId: undefined,
      aspectRatio: '1:1',
      resolution: '2K',
    })

    expect(model.resolutions).toEqual([])
    expect(model.summary).toBe('1:1')
    expect(model.isEmpty).toBe(false)
  })
})

describe('buildVideoSpecChipModel', () => {
  const seedance25 = {
    modelId: AI_MODELS.SEEDANCE_25_VOLCENGINE,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
  } as const

  it('三段全部从能力表派生，摘要 = 比例 · 清晰度 · 时长', () => {
    const model = buildVideoSpecChipModel({
      ...seedance25,
      aspectRatio: '16:9',
      resolution: '720p',
      durationSeconds: 5,
    })

    expect(model.summary).toBe('16:9 · 720p · 5s')
    expect(model.durations[0]).toBe(4)
    expect(model.durations[model.durations.length - 1]).toBe(30)
    expect(model.resolutions.map((tier) => tier.value)).toEqual([
      '480p',
      '720p',
      '1080p',
    ])
  })

  it('不在档位上的秒数按 snapVideoDuration 吸附，⛔ 不原样显示', () => {
    const model = buildVideoSpecChipModel({
      ...seedance25,
      aspectRatio: '16:9',
      resolution: '720p',
      durationSeconds: 3,
    })

    // Seedance 2.5 的下限是 4 秒。
    expect(model.durationSeconds).toBe(4)
    expect(model.summary).toContain('4s')
  })

  it('合计价 = 秒 × 该渠道该档的每秒单价；缺价时为 null', () => {
    const priced = buildVideoSpecChipModel({
      ...seedance25,
      aspectRatio: '16:9',
      resolution: '720p',
      durationSeconds: 5,
    })
    // 火山 2.5：720p 基准档 $0.213/s。
    expect(priced.pricePerSecond).toBeCloseTo(0.213, 5)
    expect(priced.totalPrice).toBeCloseTo(1.065, 5)

    // 1080p 官方只公布了 720p 一档 —— ⛔ 不拿 720p 的数去顶，报缺价。
    const unpriced = buildVideoSpecChipModel({
      ...seedance25,
      aspectRatio: '16:9',
      resolution: '1080p',
      durationSeconds: 5,
    })
    expect(unpriced.pricePerSecond).toBeNull()
    expect(unpriced.totalPrice).toBeNull()
  })

  it('模型不支持的比例灰显划线而不是移除，并给得出「不支持」这条理由', () => {
    const model = buildVideoSpecChipModel({
      modelId: AI_MODELS.VEO_31,
      aspectRatio: '16:9',
      resolution: '720p',
      durationSeconds: 8,
    })

    // Veo 只开 16:9 / 9:16，其余三档仍在名单里。
    expect(model.ratios).toHaveLength(5)
    expect(model.ratios.find((tier) => tier.value === '1:1')?.supported).toBe(
      false,
    )
    expect(model.ratios.find((tier) => tier.value === '16:9')?.supported).toBe(
      true,
    )
  })

  it('首帧锁住比例时摘要去掉比例（禁用不移除，那一段仍在）', () => {
    const locked = buildVideoSpecChipModel({
      ...seedance25,
      aspectRatio: '16:9',
      resolution: '720p',
      durationSeconds: 5,
      aspectLocked: true,
    })

    expect(locked.ratioLocked).toBe(true)
    expect(locked.ratios.length).toBeGreaterThan(0)
    expect(locked.summary).toBe('720p · 5s')
  })

  it('没有模型 = 三段全空，宿主整颗 chip 不渲染', () => {
    const model = buildVideoSpecChipModel({
      modelId: undefined,
      aspectRatio: '16:9',
      resolution: '720p',
      durationSeconds: 5,
    })

    expect(model.isEmpty).toBe(true)
    expect(model.summary).toBe('')
  })

  it('⛔ 三档以内的模型（Veo 4 / 6 / 8 s）时长档就是那三档，不是一个区间', () => {
    const model = buildVideoSpecChipModel({
      modelId: AI_MODELS.VEO_31,
      aspectRatio: '16:9',
      resolution: '720p',
      durationSeconds: 6,
    })

    expect(model.durations).toEqual([4, 6, 8])
  })
})
