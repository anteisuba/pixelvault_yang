import { describe, expect, it } from 'vitest'

import { clampVideoSpecToModel } from './clamp-video-spec'

const base = {
  durations: [3, 5, 10] as readonly number[],
  resolutions: ['480p', '720p'] as readonly string[],
  aspectRatios: ['16:9', '9:16'] as readonly string[],
  fallbackAspectRatio: '16:9',
}

describe('clampVideoSpecToModel', () => {
  it('全都在档位里时一个字段都不返回 —— 调用方据此不派发', () => {
    expect(
      clampVideoSpecToModel({
        ...base,
        current: { duration: 5, resolution: '720p', aspectRatio: '16:9' },
      }),
    ).toEqual({})
  })

  it('⭐ 换到档位更窄的型号时把时长收到最接近的一档，堵住静默 400', () => {
    expect(
      clampVideoSpecToModel({
        ...base,
        current: { duration: 24, resolution: '720p', aspectRatio: '16:9' },
      }).duration,
    ).toBe(10)
  })

  it('并列时取小的那一档', () => {
    // 4 到 3 和到 5 一样近
    expect(
      clampVideoSpecToModel({
        ...base,
        current: { duration: 4, resolution: null, aspectRatio: '16:9' },
      }).duration,
    ).toBe(3)
  })

  it('⭐ 分辨率不猜相邻值，直接清空交给 provider —— 猜一档等于替用户改画质', () => {
    const patch = clampVideoSpecToModel({
      ...base,
      current: { duration: 5, resolution: '1080p', aspectRatio: '16:9' },
    })
    expect(patch.resolution).toBeNull()
  })

  it('分辨率本来就是 null（provider 默认）时不动它', () => {
    expect(
      clampVideoSpecToModel({
        ...base,
        current: { duration: 5, resolution: null, aspectRatio: '16:9' },
      }),
    ).toEqual({})
  })

  it('比例不在候选里时回默认；默认也不在候选里就取第一个', () => {
    expect(
      clampVideoSpecToModel({
        ...base,
        current: { duration: 5, resolution: '720p', aspectRatio: '4:3' },
      }).aspectRatio,
    ).toBe('16:9')

    expect(
      clampVideoSpecToModel({
        ...base,
        aspectRatios: ['9:16', '1:1'],
        current: { duration: 5, resolution: '720p', aspectRatio: '4:3' },
      }).aspectRatio,
    ).toBe('9:16')
  })

  it('⚠ 新型号一个档位都没声明时不乱动 —— 空数组是「这个参数不适用」，不是「都不支持」', () => {
    expect(
      clampVideoSpecToModel({
        durations: [],
        resolutions: [],
        aspectRatios: [],
        fallbackAspectRatio: '16:9',
        current: { duration: 24, resolution: '1080p', aspectRatio: '4:3' },
      }),
    ).toEqual({})
  })
})
