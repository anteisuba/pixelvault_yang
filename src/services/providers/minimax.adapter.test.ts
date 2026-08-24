import { describe, expect, it } from 'vitest'

import { AI_MODELS, MODEL_OPTIONS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'

describe('MiniMax H3 catalog wiring', () => {
  const MINIMAX_IDS = [
    AI_MODELS.MINIMAX_H3,
    AI_MODELS.MINIMAX_H3_REFERENCE,
    AI_MODELS.MINIMAX_H3_CN,
    AI_MODELS.MINIMAX_H3_REFERENCE_CN,
  ] as const

  it('routes each station to its own adapter type and base URL', () => {
    const byId = new Map(MODEL_OPTIONS.map((model) => [model.id, model]))

    expect(byId.get(AI_MODELS.MINIMAX_H3)?.adapterType).toBe(
      AI_ADAPTER_TYPES.MINIMAX,
    )
    expect(byId.get(AI_MODELS.MINIMAX_H3_CN)?.adapterType).toBe(
      AI_ADAPTER_TYPES.MINIMAX_CN,
    )
    expect(byId.get(AI_MODELS.MINIMAX_H3)?.providerConfig.baseUrl).toContain(
      'api.minimax.io',
    )
    expect(byId.get(AI_MODELS.MINIMAX_H3_CN)?.providerConfig.baseUrl).toContain(
      'api.minimaxi.com',
    )
  })

  it('declares 2K only — and never an empty resolution list', () => {
    // An empty supportedResolutions makes the server 400 outright, not merely
    // drop the picker, so this guard matters more than it looks.
    for (const id of MINIMAX_IDS) {
      const capabilities = getVideoModelCapabilities(id)
      expect(capabilities.supportedResolutions).toEqual(['2k'])
      expect(capabilities.supportedResolutions?.length).toBeGreaterThan(0)
    }
  })

  it('is sendable — the worker has a MiniMax branch', () => {
    for (const id of MINIMAX_IDS) {
      const adapterType = id.endsWith('-cn')
        ? AI_ADAPTER_TYPES.MINIMAX_CN
        : AI_ADAPTER_TYPES.MINIMAX
      const contract = getVideoModelSendContract(id, adapterType)
      expect(contract.family).toBe('minimax')
      expect(contract.execution).toBe('ready')
    }
  })

  it('exposes the 9/3/3-capped-at-12 slots only on the reference ids', () => {
    const reference = getVideoModelSendContract(
      AI_MODELS.MINIMAX_H3_REFERENCE,
      AI_ADAPTER_TYPES.MINIMAX,
    )
    expect(reference.slots).toMatchObject({
      images: 9,
      videos: 3,
      audio: 3,
      total: 12,
      audioRequiresVisual: true,
    })

    const base = getVideoModelSendContract(
      AI_MODELS.MINIMAX_H3,
      AI_ADAPTER_TYPES.MINIMAX,
    )
    expect(base.slots).toMatchObject({ images: 1, videos: 0, audio: 0 })
  })
})
