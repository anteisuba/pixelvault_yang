import { describe, expect, it } from 'vitest'

import { GallerySearchSchema } from '@/types'

describe('GallerySearchSchema', () => {
  it('normalizes known model aliases in query params', () => {
    const result = GallerySearchSchema.parse({ model: 'veo-3' })

    expect(result.model).toBe('veo-3.1')
  })

  it('drops unknown model query params instead of filtering to nothing', () => {
    const result = GallerySearchSchema.parse({ model: 'not-a-model' })

    expect(result.model).toBeUndefined()
  })
})
