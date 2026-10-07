import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  addNodeSearchGroundingResult,
  clearNodeSearchGrounding,
  finishNodeSearchGrounding,
  startNodeSearchGrounding,
  useNodeSearchGrounding,
} from '@/hooks/node/use-node-search-grounding'

const source = (n: number) => ({
  kind: 'web' as const,
  url: `https://example.com/${n}`,
  title: `example ${n}`,
})

describe('useNodeSearchGrounding（只在内存里的那一份）', () => {
  it('开始 → 正在搜；每一枪交回的合起来；收起 = 没有', () => {
    const { result } = renderHook(() => useNodeSearchGrounding('n1'))
    expect(result.current).toBeNull()

    act(() => startNodeSearchGrounding('n1'))
    expect(result.current).toEqual({ phase: 'searching' })

    act(() => {
      addNodeSearchGroundingResult('n1', {
        status: 'grounded',
        sources: [source(1)],
      })
      addNodeSearchGroundingResult('n1', {
        status: 'grounded',
        sources: [source(1), source(2)],
      })
      finishNodeSearchGrounding('n1')
    })
    expect(result.current).toEqual({
      phase: 'done',
      view: {
        status: 'grounded',
        sources: [source(1), source(2)],
        suggestionsHtml: [],
      },
    })

    act(() => clearNodeSearchGrounding('n1'))
    expect(result.current).toBeNull()
  })

  it('一份都没交回：done 但没有 view；别的卡不受影响', () => {
    const { result } = renderHook(() => ({
      a: useNodeSearchGrounding('a'),
      b: useNodeSearchGrounding('b'),
    }))
    act(() => {
      startNodeSearchGrounding('a')
      finishNodeSearchGrounding('a')
    })
    expect(result.current.a).toEqual({ phase: 'done', view: undefined })
    expect(result.current.b).toBeNull()
  })
})
