import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  creatorAsksToWatchXVideos,
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

describe('creatorAsksToWatchXVideos（「看看视频」才看视频，owner 2026-10-15）', () => {
  it.each([
    '帮我看看这个视频里她穿的什么',
    '视频也看一下，动作是怎么做的',
    '搜一下 X 上的新 PV，看完视频告诉我节奏',
    'その動画を見て、振り付けを教えて',
    'Can you watch the video and tell me the camera moves?',
    'check out their clips on X',
  ])('明说要看：%s', (text) => {
    expect(creatorAsksToWatchXVideos(text)).toBe(true)
  })

  it.each([
    'X 上大家怎么评价这部新番',
    '找几张她的官方立绘',
    '不用看视频，看封面就行',
    '别看视频了，太贵',
    '動画は見なくていいです',
    "Don't watch the videos, the thumbnails are enough",
    'What do people on X think of the trailer?',
    '',
  ])('没明说（或说了不要）：%s', (text) => {
    expect(creatorAsksToWatchXVideos(text)).toBe(false)
  })
})
