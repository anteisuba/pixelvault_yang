import { describe, expect, it } from 'vitest'

import { RESEARCH_RECEIPT_HEADER_MAX_BYTES } from '@/constants/research'
import {
  decodeResearchReceiptHeader,
  encodeResearchReceiptHeader,
} from '@/lib/research-receipt'
import type { ResearchReceipt } from '@/types/research'

const RECEIPT: ResearchReceipt = {
  runId: 'run_1',
  grounded: true,
  status: 'succeeded',
  perSource: [
    { sourceId: 'moegirl', status: 'ok', count: 3, tookMs: 210 },
    {
      sourceId: 'danbooru',
      status: 'failed',
      count: 0,
      tookMs: 120,
      error: '上游超时（中文错误信息）',
    },
    {
      sourceId: 'bilibili',
      status: 'ok',
      count: 1,
      tookMs: 900,
      via: 'serper-fallback',
    },
  ],
  queries: ['长离 发色'],
  evidenceCount: 4,
}

describe('research receipt header codec', () => {
  it('round-trips a receipt with non-ASCII error text', () => {
    // HTTP 头放不了非 ASCII —— 不编码的话整个响应会被拒，助手一个字都出不来
    const encoded = encodeResearchReceiptHeader(RECEIPT)
    expect(encoded).not.toBeNull()
    expect(encoded).toMatch(/^[A-Za-z0-9+/=]+$/)

    expect(decodeResearchReceiptHeader(encoded)).toEqual(RECEIPT)
  })

  it('drops error text rather than blowing the header size limit', () => {
    const fat: ResearchReceipt = {
      ...RECEIPT,
      perSource: Array.from({ length: 8 }, (_, index) => ({
        sourceId: 'web_search' as const,
        status: 'failed' as const,
        count: 0,
        tookMs: index,
        error: '错'.repeat(390),
      })),
    }

    const encoded = encodeResearchReceiptHeader(fat)
    expect(encoded).not.toBeNull()
    expect(encoded!.length).toBeLessThanOrEqual(
      RESEARCH_RECEIPT_HEADER_MAX_BYTES,
    )

    const decoded = decodeResearchReceiptHeader(encoded)
    // 状态和计数留下（UI 要渲染的是它们），错误原文被丢掉
    expect(decoded?.perSource).toHaveLength(8)
    expect(decoded?.perSource[0]?.error).toBeUndefined()
    expect(decoded?.status).toBe('succeeded')
  })

  it('treats a missing or corrupt header as "no receipt", never as an error', () => {
    expect(decodeResearchReceiptHeader(null)).toBeNull()
    expect(decodeResearchReceiptHeader('not-base64!!')).toBeNull()
    expect(decodeResearchReceiptHeader(btoa('{"nope":1}'))).toBeNull()
  })
})
