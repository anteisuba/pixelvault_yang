import { describe, expect, it } from 'vitest'

import { ImageEditSchema } from './index'

describe('ImageEditSchema', () => {
  it('defaults persist to true so results are always captured', () => {
    const result = ImageEditSchema.parse({
      action: 'upscale',
      imageUrl: 'https://example.com/image.png',
    })

    expect(result).toEqual({
      action: 'upscale',
      imageUrl: 'https://example.com/image.png',
      persist: true,
    })
  })

  it('accepts a preview-only edit when persist is explicitly false', () => {
    const result = ImageEditSchema.parse({
      action: 'remove-background',
      imageUrl: 'https://example.com/image.png',
      persist: false,
    })

    expect(result.persist).toBe(false)
  })

  it('accepts a persisted edit with optional source generationId', () => {
    const result = ImageEditSchema.parse({
      action: 'remove-background',
      imageUrl: 'https://example.com/image.png',
      generationId: 'generation-1',
    })

    expect(result.persist).toBe(true)
    expect(result.generationId).toBe('generation-1')
  })
})
