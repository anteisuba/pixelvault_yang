import { describe, expect, it } from 'vitest'

import { Model3DMultiViewImagesSchema } from '@/types'

describe('Model3DMultiViewImagesSchema', () => {
  it('accepts http(s) URLs', () => {
    expect(
      Model3DMultiViewImagesSchema.safeParse({
        backImageUrl: 'https://cdn.test/back.png',
      }).success,
    ).toBe(true)
  })

  it('rejects inline data: images (they used to bloat the job row)', () => {
    expect(
      Model3DMultiViewImagesSchema.safeParse({
        backImageUrl: 'data:image/png;base64,AAAA',
      }).success,
    ).toBe(false)
  })
})
