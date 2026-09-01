import { describe, expect, it } from 'vitest'

import {
  MODEL_OPTIONS,
  getModelFamily,
  getModelVariant,
} from '@/constants/models'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'

/**
 * 模型选择器三层钻取（系列 → 型号 → 渠道）的数据不变量。
 *
 * 设计见 `docs/references/pages/canvas-video-card.md` §6.3。四个维度里
 * 只有型号是新数据，其余三个复用既有的 MODEL_FAMILIES / adapterType /
 * referenceMode —— 所以这里守的主要是「新数据与既有三者对得上」。
 */

const VIDEO_OPTIONS = MODEL_OPTIONS.filter((m) => m.outputType === 'VIDEO')

describe('model picker three-tier data', () => {
  it('gives every video model a family and a variant', () => {
    // 少一个就会在选择器里掉出分组，落进无标题的散装区。
    for (const model of VIDEO_OPTIONS) {
      expect(
        getModelFamily(model.id),
        `${model.id} missing family`,
      ).toBeTruthy()
      expect(
        getModelVariant(model.id),
        `${model.id} missing variant`,
      ).toBeTruthy()
    }
  })

  it('never lets one variant span two families', () => {
    // 型号是系列的下级，跨系列说明其中一张表填错了。
    const familyOfVariant = new Map<string, string>()
    for (const model of VIDEO_OPTIONS) {
      const variant = getModelVariant(model.id)
      const family = getModelFamily(model.id)
      if (!variant || !family) continue
      const seen = familyOfVariant.get(variant)
      if (seen) {
        expect(
          family,
          `variant ${variant} spans families ${seen} and ${family}`,
        ).toBe(seen)
      } else {
        familyOfVariant.set(variant, family)
      }
    }
  })

  it('resolves (variant, channel, mode) to exactly one model', () => {
    // ⭐ 整套设计的地基：用户选完型号和渠道、节点定了模式之后，必须能唯一定位
    // 一个 AI_MODELS 条目。撞车说明有两条目除了 id 之外完全同构 —— 那时模式
    // 切换会随机挑一个，出图走哪个端点全看 MODEL_OPTIONS 的数组顺序。
    const seen = new Map<string, string>()
    for (const model of VIDEO_OPTIONS) {
      const variant = getModelVariant(model.id)
      if (!variant) continue
      const mode = getVideoModelSendContract(
        model.id,
        model.adapterType,
      ).referenceMode
      const key = `${variant}::${model.adapterType}::${mode}`
      const collision = seen.get(key)
      expect(
        collision,
        `${key} claimed by both ${collision} and ${model.id}`,
      ).toBeUndefined()
      seen.set(key, model.id)
    }
  })

  it('keeps every variant reachable from at least one channel', () => {
    const variants = new Set(
      VIDEO_OPTIONS.map((m) => getModelVariant(m.id)).filter(Boolean),
    )
    // 纯粹的健全性检查：表里不该有指向零条目的孤儿型号。
    expect(variants.size).toBeGreaterThan(0)
    for (const variant of variants) {
      const owners = VIDEO_OPTIONS.filter(
        (m) => getModelVariant(m.id) === variant,
      )
      expect(owners.length, `variant ${variant} has no model`).toBeGreaterThan(
        0,
      )
    }
  })
})
