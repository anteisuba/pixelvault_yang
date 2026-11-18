import { describe, expect, it } from 'vitest'

import { isLoraSampleVisible, loraSampleRating } from './lora-sample-rating'

describe('isLoraSampleVisible', () => {
  it('安全档只留 None / Soft，分级未知的也藏', () => {
    expect(isLoraSampleVisible(1, 'safe')).toBe(true)
    expect(isLoraSampleVisible(2, 'safe')).toBe(true)
    expect(isLoraSampleVisible(4, 'safe')).toBe(false)
    expect(isLoraSampleVisible(16, 'safe')).toBe(false)
    expect(isLoraSampleVisible(undefined, 'safe')).toBe(false)
  })

  it('不设限 / 仅 NSFW 不挡', () => {
    expect(isLoraSampleVisible(16, 'unrestricted')).toBe(true)
    expect(isLoraSampleVisible(undefined, 'unrestricted')).toBe(true)
    expect(isLoraSampleVisible(1, 'nsfwOnly')).toBe(true)
  })
})

describe('loraSampleRating', () => {
  it('模型标安全但样例里有露骨图 → 含成人内容', () => {
    expect(
      loraSampleRating({
        modelNsfw: false,
        sampleLevels: [1, 16],
        settled: true,
      }),
    ).toBe('mature')
  })

  it('样例还没取回时不写安全', () => {
    expect(
      loraSampleRating({ modelNsfw: false, sampleLevels: [], settled: false }),
    ).toBeNull()
  })

  it('有分级未知的样例时不写安全', () => {
    expect(
      loraSampleRating({
        modelNsfw: false,
        sampleLevels: [1, undefined],
        settled: true,
      }),
    ).toBeNull()
  })

  it('模型标安全、样例都在安全档 → 安全', () => {
    expect(
      loraSampleRating({
        modelNsfw: false,
        sampleLevels: [1, 2],
        settled: true,
      }),
    ).toBe('safe')
  })

  it('模型标了 NSFW → 含成人内容；没有模型级标记且样例都安全 → 不写', () => {
    expect(
      loraSampleRating({ modelNsfw: true, sampleLevels: [1], settled: true }),
    ).toBe('mature')
    expect(
      loraSampleRating({ modelNsfw: null, sampleLevels: [1], settled: true }),
    ).toBeNull()
  })
})
