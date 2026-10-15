import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

/**
 * **规划器的题型那一步**（§9.1 ①，2026-09-12）。
 *
 * 🔬 实测缺口：「新海诚式黄昏光怎么描述」改写出来的词是人物向的，命中的是
 * 导演生平条目，归纳只能说「来源未覆盖黄昏光的视觉特征与提示词术语」。
 * ⚠ 这一层要验的是「模型标的题型怎么用」与「用的是哪一家」，所以只桩 LLM 那一跳，
 * 一个真请求都不发。⛔ 规划器自己不再找路由（路由由调用方交进来），没有别的可桩。
 */
const mockLlmTextCompletion = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
}))

import {
  RESEARCH_QUESTION_TYPES,
  RESEARCH_STYLE_QUERY_MODIFIERS,
} from '@/constants/research'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import type { ResolvedLlmTextRoute } from '@/services/llm-text.service'
import { planResearchWithLlm } from '@/services/research/research-planner.service'
import {
  expectSelectedProviderOnly,
  providerUsesOf,
} from '@/test/selected-provider-only'
import type { ResearchPlan } from '@/types/research'

const HEURISTIC: ResearchPlan = {
  shouldSearch: true,
  sourceGroup: 'general',
  goal: 'fact_lookup',
  queries: [{ text: '新海诚 黄昏', lang: 'zh' }],
  freshness: 'none',
  urls: [],
  reason: 'factual question',
}

function routeOf(adapterType: AI_ADAPTER_TYPES): ResolvedLlmTextRoute {
  return {
    adapterType,
    providerConfig: getDefaultProviderConfig(adapterType),
    apiKey: `${adapterType}-user-key`,
  }
}

const OPENAI_ROUTE = routeOf(AI_ADAPTER_TYPES.OPENAI)

function call(text: string, route: ResolvedLlmTextRoute = OPENAI_ROUTE) {
  return planResearchWithLlm({
    route,
    text,
    heuristic: HEURISTIC,
    forced: true,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('planResearchWithLlm · 题型（2026-09-12）', () => {
  it('⭐ 结构化输出里的 questionType 被解析出来并带进 plan', async () => {
    mockLlmTextCompletion.mockResolvedValue(
      JSON.stringify({
        shouldSearch: true,
        sourceGroup: 'general',
        questionType: 'style_technique',
        queries: [{ text: '新海诚 黄昏', lang: 'zh' }],
        freshness: 'none',
        reason: 'craft question',
      }),
    )

    const plan = await call('新海诚式黄昏光怎么描述')
    expect(plan.questionType).toBe(RESEARCH_QUESTION_TYPES.styleTechnique)
    // ⭐ 模型标类型、代码改词：限定词是这里补上的，⛔ 不指望模型自觉。
    expect(plan.queries[0]?.text).toContain(
      RESEARCH_STYLE_QUERY_MODIFIERS.zh[0],
    )
  })

  it('⚠ 模型不填题型就用确定性识别，⛔ 不留空', async () => {
    mockLlmTextCompletion.mockResolvedValue(
      JSON.stringify({
        shouldSearch: true,
        sourceGroup: 'general',
        queries: [{ text: '新海诚 黄昏', lang: 'zh' }],
        freshness: 'none',
      }),
    )

    const plan = await call('新海诚的光影怎么描述')
    expect(plan.questionType).toBe(RESEARCH_QUESTION_TYPES.styleTechnique)
    expect(plan.queries[0]?.text).toContain(
      RESEARCH_STYLE_QUERY_MODIFIERS.zh[0],
    )
  })

  it('⭐ 规划器挂了的回落路径**照样偏置** —— 挂的是加分项，不是这道偏置', async () => {
    mockLlmTextCompletion.mockRejectedValue(new Error('boom'))

    const plan = await call('新海诚式黄昏光怎么描述')
    expect(plan.questionType).toBe(RESEARCH_QUESTION_TYPES.styleTechnique)
    expect(plan.queries[0]?.text).toContain(
      RESEARCH_STYLE_QUERY_MODIFIERS.zh[0],
    )
  })

  it('⚠ 条目题一个字都不动', async () => {
    mockLlmTextCompletion.mockResolvedValue(
      JSON.stringify({
        shouldSearch: true,
        sourceGroup: 'ip_character',
        questionType: 'entity_facts',
        queries: [{ text: '无限大 时夜', lang: 'zh' }],
        freshness: 'none',
      }),
    )

    const plan = await call('无限大的时夜是谁')
    expect(plan.questionType).toBe(RESEARCH_QUESTION_TYPES.entityFacts)
    expect(plan.queries[0]?.text).toBe('无限大 时夜')
  })
})

/**
 * ⭐ **只用这一轮的那一家**（owner 2026-10-15「会自动扣其他模型的token，用户还不知道」）。
 * 此前规划器借画布规划器的路由，名册里只有 Gemini / DeepSeek / OpenAI —— 选了
 * Claude / Grok 的人，改写那一跳悄悄花的是别家的 key。
 */
describe('planResearchWithLlm · 只用所选那一家（2026-10-15）', () => {
  const PLANNED = JSON.stringify({
    shouldSearch: true,
    sourceGroup: 'ip_character',
    questionType: 'entity_facts',
    queries: [{ text: '无限大 时夜', lang: 'zh' }],
    freshness: 'none',
  })

  it.each([
    [AI_ADAPTER_TYPES.ANTHROPIC, LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5],
    [AI_ADAPTER_TYPES.XAI, undefined],
  ] as const)(
    '⭐ %s：改写那一跳打给的就是这一家、这把 key、这个型号',
    async (adapterType, modelId) => {
      mockLlmTextCompletion.mockResolvedValue(PLANNED)
      const route = routeOf(adapterType)

      const plan = await planResearchWithLlm({
        route,
        ...(modelId ? { modelId } : {}),
        text: '无限大的时夜是谁',
        heuristic: HEURISTIC,
        forced: true,
      })

      expect(plan.queries[0]?.text).toBe('无限大 时夜')
      expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
      expect(mockLlmTextCompletion.mock.calls[0]?.[0]).toMatchObject({
        adapterType,
        apiKey: route.apiKey,
        responseFormat: 'json_object',
        // P2 §2.6：子调用显式传档位 —— 磨搜索词用最低档。
        reasoningEffort: 'low',
      })
      // 没给型号 = 那一家的默认型号（llmTextCompletion 自己挑），⛔ 不带别家的型号名。
      expect(
        (mockLlmTextCompletion.mock.calls[0]?.[0] as { modelId?: string })
          .modelId,
      ).toBe(modelId)
      expectSelectedProviderOnly(
        providerUsesOf(mockLlmTextCompletion, 'research planner'),
        { adapterType, apiKey: route.apiKey },
      )
    },
  )

  it('⭐ Claude 包着代码围栏回 JSON 也解得开（它没有 response_format）', async () => {
    mockLlmTextCompletion.mockResolvedValue(
      `好的：\n\`\`\`json\n${PLANNED}\n\`\`\``,
    )

    const plan = await call(
      '无限大的时夜是谁',
      routeOf(AI_ADAPTER_TYPES.ANTHROPIC),
    )

    expect(plan.queries[0]?.text).toBe('无限大 时夜')
  })

  it('⚠ 所选那一家出不来 → 走确定性那份，⛔ 不换一家再试', async () => {
    mockLlmTextCompletion.mockRejectedValue(new Error('anthropic 529'))
    const route = routeOf(AI_ADAPTER_TYPES.ANTHROPIC)

    const plan = await call('无限大的时夜是谁', route)

    expect(plan.queries.map((query) => query.text)).toEqual(
      HEURISTIC.queries.map((query) => query.text),
    )
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
    expectSelectedProviderOnly(
      providerUsesOf(mockLlmTextCompletion, 'research planner'),
      { adapterType: route.adapterType, apiKey: route.apiKey },
    )
  })
})
