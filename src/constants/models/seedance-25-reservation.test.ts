import { describe, expect, it } from 'vitest'

import { AI_MODELS, MODEL_OPTIONS } from '@/constants/models'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

/**
 * Seedance 2.5 is reserved, not shipped: 火山 published pricing and a model
 * detail page on 2026-07-31 but the API doc still says 「在线体验与 API 调用
 * 即将上线」and the model list carries no dated id.
 *
 * These tests are a tripwire, not a feature spec. The failure mode they guard
 * against is someone flipping `available: true` and shipping the placeholder
 * `doubao-seedance-2-5` family id straight into production — which is exactly
 * how the gemini-3-pro-image-preview outage happened.
 */

const RESERVED_IDS = [
  AI_MODELS.SEEDANCE_25_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
] as const

/** The published family id — an identifier, not a callable execution id. */
const PLACEHOLDER_EXTERNAL_ID = 'doubao-seedance-2-5'

const byId = new Map(MODEL_OPTIONS.map((model) => [model.id, model]))

describe('Seedance 2.5 reservation', () => {
  it('stays unavailable while the placeholder id is still in place', () => {
    for (const id of RESERVED_IDS) {
      const model = byId.get(id)
      expect(model, `${id} missing from MODEL_OPTIONS`).toBeDefined()

      // The real assertion: available and placeholder must never coexist.
      // Flip `available: true` without swapping in the dated id
      // (doubao-seedance-2-5-YYMMDD) and this fails loudly at gate time.
      if (model?.externalModelId === PLACEHOLDER_EXTERNAL_ID) {
        expect(
          model.available,
          `${id} is live but still points at the placeholder family id — swap in the dated model id first`,
        ).toBe(false)
      }
    }
  })

  it('routes to VolcEngine, the station that will open first', () => {
    // fal has a seedance-2.5 page but it is early-access with B2B-only terms
    // PixelVault cannot satisfy, so 火山 is the only realistic channel.
    for (const id of RESERVED_IDS) {
      expect(byId.get(id)?.adapterType).toBe(AI_ADAPTER_TYPES.VOLCENGINE)
    }
  })

  it('declares only the two resolutions 火山 actually prices', () => {
    // 火山's price table has no 1080p/4k tier for 2.5, unlike 2.0.
    for (const id of RESERVED_IDS) {
      expect(getVideoModelCapabilities(id).supportedResolutions).toEqual([
        '480p',
        '720p',
      ])
    }
  })

  it('inherits the Seedance send contract, reference face included', () => {
    const base = getVideoModelSendContract(
      AI_MODELS.SEEDANCE_25_VOLCENGINE,
      AI_ADAPTER_TYPES.VOLCENGINE,
    )
    expect(base.family).toBe('seedance')
    expect(base.referenceMode).toBe('text-or-first-frame')

    const reference = getVideoModelSendContract(
      AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
      AI_ADAPTER_TYPES.VOLCENGINE,
    )
    expect(reference.family).toBe('seedance')
    expect(reference.referenceMode).toBe('multimodal-reference')
    expect(reference.slots).toMatchObject({
      images: 9,
      videos: 3,
      audio: 3,
      total: 12,
      audioRequiresVisual: true,
    })
  })

  it('has a working execution path — only the missing model id blocks it', () => {
    // This assertion flipped on 2026-08-01. It used to read
    // 'execution-not-migrated' because VolcEngine video had no worker branch,
    // so 2.5 faced two gates. The worker migration closed that one, which is
    // what makes the GA story honest: swap in the dated model id, flip
    // `available`, done — no second integration waiting behind it.
    for (const id of RESERVED_IDS) {
      const contract = getVideoModelSendContract(
        id,
        AI_ADAPTER_TYPES.VOLCENGINE,
      )
      expect(contract.execution).toBe('ready')
    }
  })
})
