import { describe, expect, it } from 'vitest'

import { getLlmTokenPrice } from '@/constants/models/llm-prices'

import { pointsOfLlmUsage, usdToPoints } from './points'

describe('usdToPoints', () => {
  it('1 点 = 1 美分', () => {
    expect(usdToPoints(1)).toBe(100)
    expect(usdToPoints(0.0123456)).toBe(1.235)
  })
})

describe('pointsOfLlmUsage', () => {
  it('输入里命中缓存的那部分按缓存价，输出按输出价', () => {
    // gpt-6.1-sol：$2 输入 · $0.10 缓存 · $10 输出 / 百万
    const points = pointsOfLlmUsage('gpt-6.1-sol', {
      inputTokens: 100_000,
      cachedInputTokens: 60_000,
      outputTokens: 2_000,
    })
    // 40k×2 + 60k×0.1 + 2k×10 = 0.08 + 0.006 + 0.02 = $0.106
    expect(points).toBe(10.6)
  })

  it('没有核实过的单价、或 provider 没报 token → null（不当 0）', () => {
    expect(pointsOfLlmUsage('unknown-model', { inputTokens: 10 })).toBeNull()
    expect(pointsOfLlmUsage('gpt-6.1-sol', null)).toBeNull()
    expect(pointsOfLlmUsage('gpt-6.1-sol', {})).toBeNull()
  })

  it('推出价按日期分段', () => {
    expect(
      getLlmTokenPrice('gemini-4-argon', new Date('2026-11-30T23:00:00Z'))
        ?.input,
    ).toBe(2)
    expect(
      getLlmTokenPrice('gemini-4-argon', new Date('2026-12-01T00:00:00Z'))
        ?.input,
    ).toBe(4)
  })
})

describe('LLM 单价表覆盖', () => {
  it('助手路由表里每个型号都有核实过的单价（缺价 = 账本 points 留空）', async () => {
    const { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } =
      await import('@/constants/node-studio')
    const missing = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.map(
      (model) => model.modelId,
    ).filter((modelId) => getLlmTokenPrice(modelId) === null)
    expect(missing).toEqual([])
  })
})
