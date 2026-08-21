import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LORA_CANDIDATE_CONFIRM_STEPS } from '@/constants/lora-candidate'
import type { LoraAssetRecord } from '@/types'
import type { LoraCandidate } from '@/types/lora-candidate'

vi.mock('@/lib/api-client/lora-assets', () => ({
  favoriteLoraAPI: vi.fn(),
}))

import { favoriteLoraAPI } from '@/lib/api-client/lora-assets'
import { useLoraCandidateConfirm } from './use-lora-candidate-confirm'

/**
 * 一次确认链（任务包 §5 的 D）。守四条：
 *  1. 一次点击**真的做三件事**：导入 → 挂载 → 触发词。
 *  2. 导入用候选**自带**的载荷，⛔ 不按 id 二次搜（上游会变）。
 *  3. 失败**报到步**，且已经成功的步骤如实标着 —— 挂载失败不等于没导进去。
 *  4. 宿主没有挂载栈时**不假装挂载**（图片/视频工作台拿不到 LoraStackProvider）。
 */

const ASSET: LoraAssetRecord = {
  id: 'asset-1',
  styleCode: 'changli',
  name: '长离 · 角色 LoRA',
  source: 'imported',
  type: 'subject',
  baseModelFamily: 'Illustrious',
  provider: 'civitai',
  triggerWord: 'changli, wuthering waves',
  loraUrl: 'https://civitai.com/api/download/models/2034567',
  coverImageUrl: null,
  previewImageUrls: [],
  defaultScale: 0.85,
  isPublic: false,
  isOwn: true,
  createdAt: '2026-08-21T09:00:00.000Z',
}

function candidate(over: Partial<LoraCandidate> = {}): LoraCandidate {
  return {
    candidateId: 'civitai:1023456:2034567',
    source: 'civitai',
    name: '长离 · 角色 LoRA',
    author: 'creator_name',
    license: {
      label: null,
      commercialUse: ['Image'],
      allowDerivatives: true,
      allowNoCredit: false,
      known: true,
    },
    baseModelFamily: 'Illustrious',
    type: 'subject',
    triggerWords: ['changli', 'wuthering waves'],
    sampleImageUrls: [],
    fileSizeBytes: 223_344_556,
    pageUrl: 'https://civitai.com/models/1023456',
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
      coverImageUrl: null,
      recommendedPrompt: null,
      modelId: 1_023_456,
      modelVersionId: 2_034_567,
      fileHashAutoV3: null,
      sourceSnapshot: {
        source: 'civitai',
        author: 'creator_name',
        license: {
          label: null,
          commercialUse: ['Image'],
          allowDerivatives: true,
          allowNoCredit: false,
          known: true,
        },
        pageUrl: 'https://civitai.com/models/1023456',
        revision: null,
        retrievedAt: '2026-08-21T09:12:33.123Z',
        fileSizeBytes: 223_344_556,
        metadataCompleteness: 'complete',
      },
    },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(favoriteLoraAPI).mockResolvedValue({ success: true, data: ASSET })
})

describe('useLoraCandidateConfirm · LoRA 装配台（三件事全做）', () => {
  it('一次点击完成导入 + 挂载 + 触发词，导入用的是候选自带的载荷', async () => {
    const mount = vi.fn()
    const applyTriggerWords = vi.fn()
    const { result } = renderHook(() =>
      useLoraCandidateConfirm({ mount, applyTriggerWords }),
    )
    expect(result.current.canMount).toBe(true)

    const target = candidate()
    const outcome = await result.current.confirm({
      candidate: target,
      suggestedWeight: 0.7,
    })

    // ⛔ 不按 id 二次搜：发出去的就是卡上那一版的载荷（含来源快照）。
    expect(favoriteLoraAPI).toHaveBeenCalledExactlyOnceWith(
      target.importPayload,
    )
    expect(mount).toHaveBeenCalledExactlyOnceWith(ASSET, 0.7)
    expect(applyTriggerWords).toHaveBeenCalledExactlyOnceWith(
      'changli, wuthering waves',
    )
    expect(outcome).toMatchObject({
      status: 'ok',
      imported: true,
      mounted: true,
      triggerWordsApplied: true,
    })
  })

  it('模型没给建议权重时用资产自己的默认值', async () => {
    const mount = vi.fn()
    const { result } = renderHook(() =>
      useLoraCandidateConfirm({ mount, applyTriggerWords: vi.fn() }),
    )

    await result.current.confirm({ candidate: candidate() })

    expect(mount).toHaveBeenCalledExactlyOnceWith(ASSET, ASSET.defaultScale)
  })

  it('没有触发词不算失败 —— 很多风格 LoRA 本来就不需要', async () => {
    const applyTriggerWords = vi.fn()
    const { result } = renderHook(() =>
      useLoraCandidateConfirm({ mount: vi.fn(), applyTriggerWords }),
    )

    const outcome = await result.current.confirm({
      candidate: candidate({ triggerWords: [] }),
    })

    expect(applyTriggerWords).not.toHaveBeenCalled()
    expect(outcome.status).toBe('ok')
    expect(outcome.triggerWordsApplied).toBe(false)
  })
})

describe('useLoraCandidateConfirm · 失败分开报', () => {
  it('导入失败：停在第一步，挂载与触发词一步都不走', async () => {
    vi.mocked(favoriteLoraAPI).mockResolvedValue({
      success: false,
      error: '上游 429',
    })
    const mount = vi.fn()
    const applyTriggerWords = vi.fn()
    const { result } = renderHook(() =>
      useLoraCandidateConfirm({ mount, applyTriggerWords }),
    )

    const outcome = await result.current.confirm({ candidate: candidate() })

    expect(outcome).toMatchObject({
      status: 'failed',
      failedStep: LORA_CANDIDATE_CONFIRM_STEPS.import,
      error: '上游 429',
      imported: false,
      mounted: false,
      triggerWordsApplied: false,
    })
    expect(mount).not.toHaveBeenCalled()
    expect(applyTriggerWords).not.toHaveBeenCalled()
  })

  it('挂载失败：如实说「已导入但没挂上」，⛔ 不把整件事说成失败', async () => {
    const mount = vi.fn(() => {
      throw new Error('stack exploded')
    })
    const applyTriggerWords = vi.fn()
    const { result } = renderHook(() =>
      useLoraCandidateConfirm({ mount, applyTriggerWords }),
    )

    const outcome = await result.current.confirm({ candidate: candidate() })

    expect(outcome).toMatchObject({
      status: 'failed',
      failedStep: LORA_CANDIDATE_CONFIRM_STEPS.mount,
      // 说成「失败」会让用户再导一遍，然后收到一条重复的库记录。
      imported: true,
      mounted: false,
    })
    expect(outcome.asset).toEqual(ASSET)
    expect(applyTriggerWords).not.toHaveBeenCalled()
  })

  it('触发词写入失败：前两步的成果如实保留', async () => {
    const applyTriggerWords = vi.fn(() => {
      throw new Error('prompt is readonly')
    })
    const { result } = renderHook(() =>
      useLoraCandidateConfirm({ mount: vi.fn(), applyTriggerWords }),
    )

    const outcome = await result.current.confirm({ candidate: candidate() })

    expect(outcome).toMatchObject({
      status: 'failed',
      failedStep: LORA_CANDIDATE_CONFIRM_STEPS.triggerWords,
      imported: true,
      mounted: true,
      triggerWordsApplied: false,
    })
  })

  it('载荷缺席（下发掉到最低档）：报导入失败，且一个请求都不发', async () => {
    const { result } = renderHook(() =>
      useLoraCandidateConfirm({
        mount: vi.fn(),
        applyTriggerWords: vi.fn(),
      }),
    )

    const outcome = await result.current.confirm({
      candidate: candidate({ importPayload: null }),
    })

    expect(favoriteLoraAPI).not.toHaveBeenCalled()
    expect(outcome.failedStep).toBe(LORA_CANDIDATE_CONFIRM_STEPS.import)
  })
})

describe('useLoraCandidateConfirm · 非 LoRA 宿主（没有挂载栈）', () => {
  it('canMount 为 false，只做导入 + 触发词，绝不假装挂载', async () => {
    const applyTriggerWords = vi.fn()
    const { result } = renderHook(() =>
      useLoraCandidateConfirm({ applyTriggerWords }),
    )

    // 图片/视频工作台在 LoraStackProvider 之外 —— 这是结构性缺席，不是漏传。
    expect(result.current.canMount).toBe(false)

    const outcome = await result.current.confirm({ candidate: candidate() })

    expect(favoriteLoraAPI).toHaveBeenCalledOnce()
    expect(applyTriggerWords).toHaveBeenCalledExactlyOnceWith(
      'changli, wuthering waves',
    )
    expect(outcome).toMatchObject({
      status: 'ok',
      imported: true,
      mounted: false,
      triggerWordsApplied: true,
    })
  })
})
