import { describe, expect, it } from 'vitest'

import {
  mergeSearchGroundingResults,
  searchGroundingForRun,
  searchGroundingForRunItem,
  withoutSearchGrounding,
} from '@/lib/search-grounding'
import type { RunItem, SearchGroundingResult } from '@/types'

const web = (n: number) => ({
  kind: 'web' as const,
  url: `https://example.com/${n}`,
  title: `example ${n}`,
})

describe('withoutSearchGrounding', () => {
  it('只去掉暂放的来源，其余元数据原样', () => {
    expect(
      withoutSearchGrounding(
        JSON.stringify({ a: 1, searchGrounding: { status: 'empty' } }),
      ),
    ).toBe('{"a":1}')
    expect(withoutSearchGrounding('not json')).toBe('not json')
  })
})

describe('searchGroundingForRunItem', () => {
  it('参数开着、型号支持才算这一格开着搜索', () => {
    expect(
      searchGroundingForRunItem('gemini-nano-banana-2.1', {
        searchGrounding: true,
      }),
    ).toEqual({ searchGrounding: {} })
    expect(
      searchGroundingForRunItem('gemini-3-pro-image-preview', {
        searchGrounding: true,
      }),
    ).toEqual({})
    expect(searchGroundingForRunItem('gemini-nano-banana-2.1', {})).toEqual({})
  })
})

describe('mergeSearchGroundingResults', () => {
  it('来源按链接去重，相同的建议条只画一次', () => {
    const a: SearchGroundingResult = {
      status: 'grounded',
      sources: [web(1), web(2)],
      suggestionsHtml: '<a>s</a>',
    }
    const b: SearchGroundingResult = {
      status: 'grounded',
      sources: [web(2), web(3)],
      suggestionsHtml: '<a>s</a>',
    }
    expect(mergeSearchGroundingResults([a, b])).toEqual({
      status: 'grounded',
      sources: [web(1), web(2), web(3)],
      suggestionsHtml: ['<a>s</a>'],
    })
  })

  it('一份来源都没有：全出错才算出错，出错那份不带建议条', () => {
    expect(
      mergeSearchGroundingResults([{ status: 'error', sources: [] }]),
    ).toEqual({ status: 'error', sources: [], suggestionsHtml: [] })
    expect(
      mergeSearchGroundingResults([
        { status: 'error', sources: [], suggestionsHtml: '<a>x</a>' },
        { status: 'empty', sources: [], suggestionsHtml: '<a>s</a>' },
      ]),
    ).toEqual({ status: 'empty', sources: [], suggestionsHtml: ['<a>s</a>'] })
    expect(mergeSearchGroundingResults([])).toBeUndefined()
  })
})

describe('searchGroundingForRun', () => {
  const item = (patch: Partial<RunItem>): RunItem =>
    ({
      id: 'i',
      modelId: 'gemini-nano-banana-2.1',
      status: 'completed',
      generation: { id: 'g' },
      error: null,
      ...patch,
    }) as RunItem

  it('没开搜索的一轮 = null；还有格子在跑 = searching', () => {
    expect(searchGroundingForRun([item({})])).toBeNull()
    expect(
      searchGroundingForRun([
        item({ searchGrounding: {}, status: 'generating', generation: null }),
      ]),
    ).toEqual({ phase: 'searching' })
  })

  it('都跑完了：合并交回的那几份；一份都没交回就没有 view', () => {
    const result: SearchGroundingResult = {
      status: 'grounded',
      sources: [web(1)],
    }
    expect(
      searchGroundingForRun([item({ searchGrounding: { result } })]),
    ).toEqual({
      phase: 'done',
      view: { status: 'grounded', sources: [web(1)], suggestionsHtml: [] },
    })
    expect(searchGroundingForRun([item({ searchGrounding: {} })])).toEqual({
      phase: 'done',
      view: undefined,
    })
  })
})
