import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

/**
 * **规划器的题型那一步**（§9.1 ①，2026-09-12）。
 *
 * 🔬 实测缺口：「新海诚式黄昏光怎么描述」改写出来的词是人物向的，命中的是
 * 导演生平条目，归纳只能说「来源未覆盖黄昏光的视觉特征与提示词术语」。
 * ⚠ 这一层要验的是「模型标的题型怎么用」，所以路由与 LLM 全桩掉，一个真请求都不发。
 */
const mockLlmTextCompletion = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
}))

const mockResolveNodePlannerRoute = vi.fn()
vi.mock('@/services/kernel/node-planner-route.service', () => ({
  resolveNodePlannerRoute: (...args: unknown[]) =>
    mockResolveNodePlannerRoute(...args),
}))

import {
  RESEARCH_QUESTION_TYPES,
  RESEARCH_STYLE_QUERY_MODIFIERS,
} from '@/constants/research'
import { planResearchWithLlm } from '@/services/research/research-planner.service'
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

function call(text: string) {
  return planResearchWithLlm({
    userId: 'clerk-1',
    text,
    heuristic: HEURISTIC,
    forced: true,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveNodePlannerRoute.mockResolvedValue({
    modelId: 'm',
    adapterType: 'openai',
    providerConfig: {},
    apiKey: 'k',
  })
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
