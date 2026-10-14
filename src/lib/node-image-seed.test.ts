import { describe, expect, it } from 'vitest'

import { VARIANT_MAX_SEED } from '@/constants/studio'

import { randomImageSeed, shotSeed } from './node-image-seed'

describe('node-image-seed', () => {
  it('随机种子落在服务端收的范围里', () => {
    for (let i = 0; i < 50; i += 1) {
      const seed = randomImageSeed()
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThanOrEqual(VARIANT_MAX_SEED)
    }
  })

  it('第 n 张 = seed + n，越过上限绕回 0', () => {
    expect(shotSeed(10, 0)).toBe(10)
    expect(shotSeed(10, 3)).toBe(13)
    expect(shotSeed(VARIANT_MAX_SEED, 1)).toBe(0)
  })
})
