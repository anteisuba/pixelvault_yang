import { describe, expect, it } from 'vitest'

import { GallerySearchSchema } from '@/types'

describe('GallerySearchSchema', () => {
  it('normalizes known model aliases in query params', () => {
    const result = GallerySearchSchema.parse({ model: 'veo-3' })

    expect(result.model).toEqual(['veo-3.1'])
  })

  it('drops unknown model query params instead of filtering to nothing', () => {
    const result = GallerySearchSchema.parse({ model: 'not-a-model' })

    // 空数组 = 不限模型。⛔ 不能变成「筛选出零条」—— 未知 id 是脏参数，
    // 不是用户真的想要一个空画廊。
    expect(result.model).toEqual([])
  })

  it('accepts several models at once and drops the unknown ones', () => {
    const result = GallerySearchSchema.parse({
      model: 'veo-3, not-a-model ,veo-3.1',
    })

    // 逐项过目录 + 去重：`veo-3` 归一后与 `veo-3.1` 是同一个。
    expect(result.model).toEqual(['veo-3.1'])
  })

  it('reads the media type as a list too', () => {
    expect(GallerySearchSchema.parse({ type: 'image,video' }).type).toEqual([
      'image',
      'video',
    ])
    expect(GallerySearchSchema.parse({ type: 'image,bogus' }).type).toEqual([
      'image',
    ])
    expect(GallerySearchSchema.parse({}).type).toEqual([])
  })
})
