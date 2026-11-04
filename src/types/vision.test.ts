/** L1：视觉断言的 schema 规则（纯 zod）。 */
import { describe, expect, it } from 'vitest'

import { VISION_TASKS } from '@/constants/vision'
import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'
import {
  VisionAnalyzeRequestSchema,
  VisionClaimSchema,
  VisionCompareSchema,
  VisionNamedClaimSchema,
  VisionQualityReviewSchema,
} from '@/types/vision'

const IMAGE_A = 'https://cdn.test.com/a.png'

// ─── schema 规则（纯 zod，不打网络）─────────────────────────────

describe('vision claim schemas', () => {
  it('rejects an "inference" claim that carries a concrete number', () => {
    // 🔬 切片 0 的真实坏样本：先声明不确定，再给出「大约 1,500 到 2,500」。
    const parsed = VisionClaimSchema.safeParse({
      label: 'particle count',
      text: 'roughly 1,500 particles in the background',
      basis: 'inference',
    })

    expect(parsed.success).toBe(false)
  })

  it('accepts the same numeric text when it is an observation', () => {
    const parsed = VisionClaimSchema.safeParse({
      label: 'characters',
      text: '3 characters are visible',
      basis: 'observation',
    })

    expect(parsed.success).toBe(true)
  })

  it('accepts a non-numeric inference', () => {
    const parsed = VisionClaimSchema.safeParse({
      label: 'mood',
      text: 'reads as a melancholy evening scene',
      basis: 'inference',
    })

    expect(parsed.success).toBe(true)
  })

  it('gives named claims no "inference" slot at all', () => {
    // 名称类断言的闸不是正则，是**枚举里根本没有这一档**。
    const parsed = VisionNamedClaimSchema.safeParse({
      label: 'hair colour',
      text: 'probably lavender',
      basis: 'inference',
    })

    expect(parsed.success).toBe(false)
  })

  it('rejects an unknown defect category', () => {
    const parsed = VisionQualityReviewSchema.safeParse({
      defects: [
        {
          category: 'vibes',
          severity: 'high',
          text: 'something feels off',
          basis: 'observation',
        },
      ],
    })

    expect(parsed.success).toBe(false)
  })

  it('applies the numeric rule to comparison points too', () => {
    const parsed = VisionCompareSchema.safeParse({
      differences: [
        {
          aspect: 'character count',
          perImage: [{ imageIndex: 0, text: 'about 4 figures' }],
          basis: 'inference',
        },
      ],
    })

    expect(parsed.success).toBe(false)
  })

  it('requires at least two images for the compare task at the request boundary', () => {
    const parsed = VisionAnalyzeRequestSchema.safeParse({
      task: VISION_TASKS.compare,
      mediaUrls: [IMAGE_A],
      surface: ASSISTANT_SURFACE_IDS.imageStudio,
    })

    expect(parsed.success).toBe(false)
  })

  it('rejects data: URLs at the request boundary', () => {
    // 内联图进不了证据（imageUrl 上限 2000 字符），所以不许从这条路进来。
    const parsed = VisionAnalyzeRequestSchema.safeParse({
      task: VISION_TASKS.characterIdentity,
      mediaUrls: ['data:image/png;base64,AAAA'],
      surface: ASSISTANT_SURFACE_IDS.imageStudio,
    })

    expect(parsed.success).toBe(false)
  })
})
