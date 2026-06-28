import { describe, it, expect } from 'vitest'

import { GenerationSourceSurfaceSchema, StudioGenerateSchema } from '@/types'

describe('GenerationSourceSurfaceSchema', () => {
  it('accepts the four known surfaces', () => {
    for (const v of ['IMAGE_STUDIO', 'LORA_WORKBENCH', 'CANVAS', 'EDIT']) {
      expect(GenerationSourceSurfaceSchema.safeParse(v).success).toBe(true)
    }
  })

  it('rejects unknown surfaces', () => {
    expect(GenerationSourceSurfaceSchema.safeParse('STUDIO').success).toBe(
      false,
    )
    expect(GenerationSourceSurfaceSchema.safeParse('').success).toBe(false)
  })
})

describe('StudioGenerateSchema sourceSurface', () => {
  it('accepts an explicit sourceSurface', () => {
    const result = StudioGenerateSchema.safeParse({
      modelId: 'flux-lora',
      sourceSurface: 'LORA_WORKBENCH',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sourceSurface).toBe('LORA_WORKBENCH')
    }
  })

  it('is optional (omitting it stays valid)', () => {
    const result = StudioGenerateSchema.safeParse({ modelId: 'flux-lora' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sourceSurface).toBeUndefined()
    }
  })

  it('rejects an invalid sourceSurface value', () => {
    const result = StudioGenerateSchema.safeParse({
      modelId: 'flux-lora',
      sourceSurface: 'nope',
    })
    expect(result.success).toBe(false)
  })
})
