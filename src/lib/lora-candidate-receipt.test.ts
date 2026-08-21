import { describe, expect, it } from 'vitest'

import {
  LORA_CANDIDATE_RECEIPT_HEADER_MAX_BYTES,
  LORA_CANDIDATE_RECEIPT_TIERS,
} from '@/constants/lora-candidate'
import {
  decodeLoraCandidateReceiptHeader,
  encodeLoraCandidateReceiptHeader,
} from '@/lib/lora-candidate-receipt'
import type {
  LoraCandidate,
  LoraCandidateSearchResult,
} from '@/types/lora-candidate'

/**
 * 候选下发编解码（切片 3）。守的是三条语义，不是字节数本身：
 *  1. 往返之后**卡面事实与导入载荷一字不差** —— 导入载荷变了形，一次确认就会
 *     把和卡上不一样的东西塞进用户的库。
 *  2. 降级是**逐级**的，而且每一级都是完整的候选：先丢样图，再丢到「只够解析
 *     picks」，仍然装不下才整批不发。⛔ 任何一级都不许出现半条数据。
 *  3. 头坏了/没有 = 「这一轮没有候选」，绝不是一次失败的对话。
 */

function candidate(over: Partial<LoraCandidate> = {}): LoraCandidate {
  return {
    candidateId: 'civitai:1023456:2034567',
    source: 'civitai',
    name: '长离 · 角色 LoRA',
    author: 'creator_name',
    license: {
      label: null,
      commercialUse: ['Image', 'Rent'],
      allowDerivatives: true,
      allowNoCredit: false,
      known: true,
    },
    baseModelFamily: 'Illustrious',
    type: 'subject',
    triggerWords: ['changli', 'wuthering waves'],
    sampleImageUrls: [
      'https://image.civitai.com/aaa/width=450/1.jpeg',
      'https://image.civitai.com/aaa/width=450/2.jpeg',
      'https://image.civitai.com/aaa/width=450/3.jpeg',
    ],
    fileSizeBytes: 223_344_556,
    pageUrl: 'https://civitai.com/models/1023456?modelVersionId=2034567',
    downloads: 12_345,
    metadataCompleteness: 'complete',
    importable: true,
    alreadyMounted: false,
    alreadyImported: false,
    importPayload: {
      name: '长离 · 角色 LoRA',
      triggerWord: 'changli, wuthering waves',
      loraUrl: 'https://civitai.com/api/download/models/2034567',
      type: 'subject',
      baseModelFamily: 'Illustrious',
      provider: 'civitai',
      coverImageUrl: 'https://image.civitai.com/aaa/width=450/1.jpeg',
      recommendedPrompt: 'masterpiece, best quality, changli',
      modelId: 1_023_456,
      modelVersionId: 2_034_567,
      fileHashAutoV3: 'A1B2C3D4E5F6',
      sourceSnapshot: {
        source: 'civitai',
        author: 'creator_name',
        license: {
          label: null,
          commercialUse: ['Image', 'Rent'],
          allowDerivatives: true,
          allowNoCredit: false,
          known: true,
        },
        pageUrl: 'https://civitai.com/models/1023456?modelVersionId=2034567',
        revision: null,
        retrievedAt: '2026-08-21T09:12:33.123Z',
        fileSizeBytes: 223_344_556,
        metadataCompleteness: 'complete',
      },
    },
    ...over,
  }
}

function result(
  over: Partial<LoraCandidateSearchResult> = {},
): LoraCandidateSearchResult {
  return {
    candidates: [candidate()],
    query: '鸣潮 长离 角色 lora',
    sources: [
      { source: 'civitai', status: 'ok', count: 1, tookMs: 812 },
      { source: 'huggingface', status: 'empty', count: 0, tookMs: 430 },
    ],
    ...over,
  }
}

/**
 * ⚠ 候选条数上限是 schema 定的 6（`LORA_CANDIDATE_LIMITS.maxCandidates`）——
 * 夹具超过 6 条会在**解码**那一步被判 invalid，测的就不是降级了。所以下面的
 * 「撑爆」一律靠单条变胖，不靠条数变多。
 */

/** 样图 URL 特别长的候选：第 1 档装不下、丢掉样图就能装下的那一档。 */
function longSampleCandidate(index: number): LoraCandidate {
  return {
    ...candidate(),
    candidateId: `civitai:10000${index}:20000${index}`,
    sampleImageUrls: [
      `https://image.civitai.com/${'a'.repeat(2600)}/${index}.jpeg`,
    ],
  }
}

/** 导入载荷特别胖的候选：真实上游的触发词能有 4000 字。 */
function fatCandidate(index: number): LoraCandidate {
  const base = candidate()
  return {
    ...base,
    candidateId: `civitai:10000${index}:20000${index}`,
    importPayload: base.importPayload
      ? { ...base.importPayload, triggerWord: '触发词'.repeat(600) }
      : null,
  }
}

describe('lora candidate header codec', () => {
  it('往返之后卡面事实与导入载荷一字不差（样图按下发上限截到 1 张）', () => {
    const encoded = encodeLoraCandidateReceiptHeader(result())
    expect(encoded.tier).toBe(LORA_CANDIDATE_RECEIPT_TIERS.full)
    expect(encoded.value).toMatch(/^[A-Za-z0-9+/=]+$/)

    const decoded = decodeLoraCandidateReceiptHeader(encoded.value)
    const [first] = decoded?.candidates ?? []
    expect(first).toBeDefined()
    // 样图只留 1 张 —— 一条 URL 约 110 字节，多留的几张换不来任何界面价值。
    expect(first?.sampleImageUrls).toEqual([
      'https://image.civitai.com/aaa/width=450/1.jpeg',
    ])
    // ⭐ 导入载荷必须原样过去：确认那一下直接用它调导入链，不再按 id 二次搜。
    expect(first?.importPayload).toEqual(candidate().importPayload)
    expect(first?.license).toEqual(candidate().license)
    expect(decoded?.query).toBe('鸣潮 长离 角色 lora')
    expect(decoded?.sources).toHaveLength(2)
  })

  it('第 2 档：装不下就先丢样图 URL，其余事实与导入载荷全留', () => {
    const wide = result({
      candidates: Array.from({ length: 6 }, (_, i) => longSampleCandidate(i)),
    })
    const encoded = encodeLoraCandidateReceiptHeader(wide)
    // 恰好停在第 2 档：第 1 档超限、丢了样图就装得下。
    expect(encoded.tier).toBe(LORA_CANDIDATE_RECEIPT_TIERS.noImages)
    expect(encoded.bytes).toBeLessThanOrEqual(
      LORA_CANDIDATE_RECEIPT_HEADER_MAX_BYTES,
    )

    const decoded = decodeLoraCandidateReceiptHeader(encoded.value)
    expect(decoded?.candidates).toHaveLength(6)
    expect(decoded?.candidates[0]?.sampleImageUrls).toEqual([])
    // 丢的只有图：事实和导入载荷全在，一次确认照样走得通。
    expect(decoded?.candidates[0]?.importPayload).toEqual(
      candidate().importPayload,
    )
    expect(decoded?.candidates[0]?.baseModelFamily).toBe('Illustrious')
    expect(decoded?.candidates[0]?.triggerWords).toEqual([
      'changli',
      'wuthering waves',
    ])
  })

  it('第 3 档：只剩「够解析 picks」的最小集，且不谎称候选不可导入', () => {
    const fat = result({
      candidates: Array.from({ length: 6 }, (_, i) => fatCandidate(i)),
    })
    const encoded = encodeLoraCandidateReceiptHeader(fat)
    expect(encoded.tier).toBe(LORA_CANDIDATE_RECEIPT_TIERS.minimal)

    const decoded = decodeLoraCandidateReceiptHeader(encoded.value)
    expect(decoded?.candidates).toHaveLength(6)
    const [first] = decoded?.candidates ?? []
    // 留下的：id / 名字 / 作者 / 许可 / 归属标注 —— 卡还能出，picks 还能配对。
    expect(first?.candidateId).toBe('civitai:100000:200000')
    expect(first?.name).toBe('长离 · 角色 LoRA')
    expect(first?.author).toBe('creator_name')
    expect(first?.license.known).toBe(true)
    // 丢掉的一律落到「不知道」的表示，不编值；完整度如实降到 minimal。
    expect(first?.baseModelFamily).toBeNull()
    expect(first?.fileSizeBytes).toBeNull()
    expect(first?.downloads).toBeNull()
    expect(first?.triggerWords).toEqual([])
    expect(first?.metadataCompleteness).toBe('minimal')
    // ⚠ `importable` 保留真值、载荷归 null —— 卡据此说「这条本来能导，但详情被
    // 裁掉了」，而不是谎称它不可导入。
    expect(first?.importable).toBe(true)
    expect(first?.importPayload).toBeNull()
    expect(encoded.bytes).toBeLessThanOrEqual(
      LORA_CANDIDATE_RECEIPT_HEADER_MAX_BYTES,
    )
  })

  it('最低档仍然装不下就整批不发，并把长度交给调用方去打日志', () => {
    const huge = result({
      candidates: Array.from({ length: 6 }, (_, i) => ({
        ...fatCandidate(i),
        // 名字进最小集，所以名字本身够胖时连最低档也装不下。
        name: '长'.repeat(3000),
      })),
    })
    const encoded = encodeLoraCandidateReceiptHeader(huge)
    expect(encoded.value).toBeNull()
    expect(encoded.tier).toBe(LORA_CANDIDATE_RECEIPT_TIERS.dropped)
    // ⛔ 绝不截断成半批 —— 差多少要说得出来，好据此调上限。
    expect(encoded.bytes).toBeGreaterThan(
      LORA_CANDIDATE_RECEIPT_HEADER_MAX_BYTES,
    )
  })

  it('头缺失或损坏 = 这一轮没有候选，不是一次失败的对话', () => {
    expect(decodeLoraCandidateReceiptHeader(null)).toBeNull()
    expect(decodeLoraCandidateReceiptHeader('not-base64!!')).toBeNull()
    expect(decodeLoraCandidateReceiptHeader(btoa('{"nope":1}'))).toBeNull()
    // 形状对不上时**不渲染**：半张卡比没有卡危险得多（它后面接着导入链）。
    expect(
      decodeLoraCandidateReceiptHeader(
        btoa(JSON.stringify({ candidates: [{ candidateId: 'x' }] })),
      ),
    ).toBeNull()
  })
})
