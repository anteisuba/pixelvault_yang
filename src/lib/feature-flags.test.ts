import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * 开关在模块加载时从环境变量读：每例先设好环境变量，再重新加载真的
 * `@/constants/feature-flags` + `feature-flags`（不替开关表）。
 */
async function load(env: Record<string, string>) {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
  vi.resetModules()
  return (await import('./feature-flags')).isFeatureEnabledForUser
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isFeatureEnabledForUser', () => {
  it('总开关关着：一律 false，放量比例也救不回来', async () => {
    const isOn = await load({
      NEXT_PUBLIC_FF_MULTI_COMPARE: 'false',
      NEXT_PUBLIC_FF_MULTI_COMPARE_ROLLOUT: '100',
    })
    expect(isOn('multiModelCompare', 'user_1')).toBe(false)
  })

  it('开着、没设放量比例：true', async () => {
    const isOn = await load({
      NEXT_PUBLIC_FF_SMART_PROMPT: 'true',
      NEXT_PUBLIC_FF_SMART_PROMPT_ROLLOUT: '',
    })
    expect(isOn('smartPrompt', 'user_1')).toBe(true)
  })

  it('放量 100 → true；放量 0 → false', async () => {
    let isOn = await load({
      NEXT_PUBLIC_FF_VARIANT_GEN: 'true',
      NEXT_PUBLIC_FF_VARIANT_GEN_ROLLOUT: '100',
    })
    expect(isOn('variantGeneration', 'user_1')).toBe(true)

    isOn = await load({
      NEXT_PUBLIC_FF_VARIANT_GEN: 'true',
      NEXT_PUBLIC_FF_VARIANT_GEN_ROLLOUT: '0',
    })
    expect(isOn('variantGeneration', 'user_1')).toBe(false)
  })

  it('同一个人结果不变；匿名用户进不了部分放量', async () => {
    const isOn = await load({
      NEXT_PUBLIC_FF_VARIANT_GEN: 'true',
      NEXT_PUBLIC_FF_VARIANT_GEN_ROLLOUT: '50',
    })
    expect(isOn('variantGeneration', 'user_X')).toBe(
      isOn('variantGeneration', 'user_X'),
    )
    expect(isOn('variantGeneration', null)).toBe(false)
    expect(isOn('variantGeneration', undefined)).toBe(false)
  })

  it('一批人大致按放量比例切开', async () => {
    const isOn = await load({
      NEXT_PUBLIC_FF_VARIANT_GEN: 'true',
      NEXT_PUBLIC_FF_VARIANT_GEN_ROLLOUT: '25',
    })
    let enabled = 0
    for (let i = 0; i < 1000; i++) {
      if (isOn('variantGeneration', `user_${i}`)) enabled++
    }
    // 25% target, allow ±10pp band on a 1k sample
    expect(enabled).toBeGreaterThan(150)
    expect(enabled).toBeLessThan(350)
  })
})
