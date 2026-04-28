import { describe, expect, it } from 'vitest'

import { ImageEditSchema } from './index'

describe('ImageEditSchema', () => {
  it('accepts a preview edit without persistence metadata', () => {
    const result = ImageEditSchema.parse({
      action: 'upscale',
      imageUrl: 'https://example.com/image.png',
    })

    expect(result).toEqual({
      action: 'upscale',
      imageUrl: 'https://example.com/image.png',
    })
  })

  it('requires generationId when persist is true', () => {
    const result = ImageEditSchema.safeParse({
      action: 'remove-background',
      imageUrl: 'https://example.com/image.png',
      persist: true,
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['generationId'])
  })

  it('accepts a persisted edit with source generationId', () => {
    const result = ImageEditSchema.parse({
      action: 'remove-background',
      imageUrl: 'https://example.com/image.png',
      persist: true,
      generationId: 'generation-1',
    })

    expect(result.generationId).toBe('generation-1')
  })
})
