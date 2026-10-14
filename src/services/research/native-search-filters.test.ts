import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  nativeSearchRulesOutX,
  planNativeSearchDomains,
} from '@/services/research/native-search-filters'

describe('planNativeSearchDomains（来源名单 → 各家域名参数，2026-10-14）', () => {
  const none = { allow: [], block: [] }

  it('名单里没有域名：哪一家都照常', () => {
    expect(planNativeSearchDomains(AI_ADAPTER_TYPES.GEMINI, none)).toEqual({})
  })

  it('白名单在场只给白名单', () => {
    expect(
      planNativeSearchDomains(AI_ADAPTER_TYPES.ANTHROPIC, {
        allow: ['moegirl.org.cn'],
        block: ['zhihu.com'],
      }),
    ).toEqual({ domains: { mode: 'allow', domains: ['moegirl.org.cn'] } })
  })

  it('装不下就回 null：Gemini / DeepSeek 没有域名参数，GPT 没有黑名单，Grok 最多 5 个', () => {
    const block = { allow: [], block: ['zhihu.com'] }
    expect(planNativeSearchDomains(AI_ADAPTER_TYPES.GEMINI, block)).toBeNull()
    expect(planNativeSearchDomains(AI_ADAPTER_TYPES.DEEPSEEK, block)).toBeNull()
    expect(planNativeSearchDomains(AI_ADAPTER_TYPES.OPENAI, block)).toBeNull()
    expect(planNativeSearchDomains(AI_ADAPTER_TYPES.XAI, block)).toEqual({
      domains: { mode: 'block', domains: ['zhihu.com'] },
    })
    expect(
      planNativeSearchDomains(AI_ADAPTER_TYPES.XAI, {
        allow: ['a.test', 'b.test', 'c.test', 'd.test', 'e.test', 'f.test'],
        block: [],
      }),
    ).toBeNull()
  })
})

describe('nativeSearchRulesOutX', () => {
  it('白名单里没有 X、或黑名单里有 X，就不许搜 X', () => {
    expect(nativeSearchRulesOutX(undefined)).toBe(false)
    expect(
      nativeSearchRulesOutX({ mode: 'allow', domains: ['pixiv.net'] }),
    ).toBe(true)
    expect(nativeSearchRulesOutX({ mode: 'allow', domains: ['x.com'] })).toBe(
      false,
    )
    expect(
      nativeSearchRulesOutX({ mode: 'block', domains: ['twitter.com'] }),
    ).toBe(true)
    expect(
      nativeSearchRulesOutX({ mode: 'block', domains: ['zhihu.com'] }),
    ).toBe(false)
  })
})
