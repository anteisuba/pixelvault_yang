import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockResolveRoute = vi.fn()
vi.mock('@/services/kernel/node-planner-route.service', () => ({
  resolveNodePlannerRoute: (...args: unknown[]) => mockResolveRoute(...args),
}))

const mockLlm = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlm(...args),
}))

import {
  RESEARCH_FRESHNESS,
  RESEARCH_GOALS,
  RESEARCH_SOURCE_GROUPS,
} from '@/constants/research'
import { planResearchWithLlm } from '@/services/research/research-planner.service'
import type { ResearchPlan } from '@/types/research'

const HEURISTIC: ResearchPlan = {
  shouldSearch: true,
  sourceGroup: RESEARCH_SOURCE_GROUPS.ipCharacter,
  goal: RESEARCH_GOALS.factLookup,
  queries: [{ text: '无限大', lang: 'zh' }],
  freshness: RESEARCH_FRESHNESS.none,
  urls: [],
  reason: 'information request',
}

function params(
  overrides: Partial<Parameters<typeof planResearchWithLlm>[0]> = {},
) {
  return {
    userId: 'db_user_1',
    text: '我想要无限大的资料',
    heuristic: HEURISTIC,
    forced: false,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveRoute.mockResolvedValue({
    modelId: 'planner-model',
    adapterType: 'openai',
    providerConfig: {},
    apiKey: 'k',
  })
})

describe('planResearchWithLlm — 中英改写 + Fandom 站（2026-09-01 附录 B 缺口 ③ / ④）', () => {
  it('asks the planner for the English/romanized alias and an optional fandomHost', async () => {
    mockLlm.mockResolvedValue(
      JSON.stringify({ shouldSearch: true, sourceGroup: 'ip_character' }),
    )

    await planResearchWithLlm(params())

    const call = mockLlm.mock.calls[0]?.[0] as { systemPrompt: string }
    expect(call.systemPrompt).toContain('fandomHost')
    expect(call.systemPrompt).toMatch(/romani[sz]ed/i)
  })

  it('passes a well-formed fandomHost through to the plan', async () => {
    mockLlm.mockResolvedValue(
      JSON.stringify({
        shouldSearch: true,
        sourceGroup: 'ip_character',
        queries: [
          { text: '无限大', lang: 'zh' },
          { text: 'Ananta', lang: 'en' },
        ],
        fandomHost: 'ananta.fandom.com',
      }),
    )

    const plan = await planResearchWithLlm(params())

    expect(plan.fandomHost).toBe('ananta.fandom.com')
    expect(plan.queries.map((query) => query.text)).toEqual([
      '无限大',
      'Ananta',
    ])
  })

  it('drops a host that is not a fandom.com subdomain but keeps the rest of the plan', async () => {
    mockLlm.mockResolvedValue(
      JSON.stringify({
        shouldSearch: true,
        sourceGroup: 'ip_character',
        queries: [{ text: 'Ananta', lang: 'en' }],
        fandomHost: 'https://evil.example.com/api.php',
      }),
    )

    const plan = await planResearchWithLlm(params())

    expect(plan.fandomHost).toBeUndefined()
    expect(plan.queries[0]?.text).toBe('Ananta')
  })

  it('falls back to the heuristic plan (no fandomHost) when the planner is unreachable', async () => {
    mockResolveRoute.mockRejectedValue(new Error('no planner route'))

    const plan = await planResearchWithLlm(params())

    expect(plan).toEqual(HEURISTIC)
    expect(plan.fandomHost).toBeUndefined()
    expect(mockLlm).not.toHaveBeenCalled()
  })
})
