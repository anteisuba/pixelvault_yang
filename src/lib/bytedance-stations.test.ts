import { describe, expect, it } from 'vitest'

import { AI_MODELS, getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getBytedanceStationTwin } from '@/lib/bytedance-stations'

describe('getBytedanceStationTwin', () => {
  it('同一型号两站互为同款', () => {
    expect(getBytedanceStationTwin(AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE)).toBe(
      AI_MODELS.SEEDREAM_50_PRO_BYTEPLUS,
    )
    expect(
      getBytedanceStationTwin(AI_MODELS.SEEDANCE_20_FAST_REFERENCE_BYTEPLUS),
    ).toBe(AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE)
  })

  it('只在一站有的型号、别家型号：没有同款', () => {
    expect(
      getBytedanceStationTwin(AI_MODELS.SEEDREAM_50_VOLCENGINE),
    ).toBeUndefined()
    expect(getBytedanceStationTwin(AI_MODELS.SEEDREAM_50_PRO)).toBeUndefined()
  })

  it('配上的每一对：一边火山一边 BytePlus，出图 / 出视频与端点角色一致', () => {
    for (const model of Object.values(AI_MODELS)) {
      const twinId = getBytedanceStationTwin(model)
      if (!twinId) continue
      const self = getModelById(model)
      const twin = getModelById(twinId)
      expect(self && twin, model).toBeTruthy()
      expect(new Set([self!.adapterType, twin!.adapterType]), model).toEqual(
        new Set([AI_ADAPTER_TYPES.VOLCENGINE, AI_ADAPTER_TYPES.BYTEPLUS]),
      )
      expect(twin!.outputType, model).toBe(self!.outputType)
      expect(twin!.videoKind, model).toBe(self!.videoKind)
      expect(twin!.imageKind, model).toBe(self!.imageKind)
      expect(twin!.requiresReferenceImage, model).toBe(
        self!.requiresReferenceImage,
      )
    }
  })
})
