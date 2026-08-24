import { describe, expect, it } from 'vitest'

import { VIDEO_NODE_MODES } from '@/constants/video-node-modes'

import { resolveReferenceRailSlot } from './reference-rail-slot'

describe('resolveReferenceRailSlot', () => {
  it('⭐ 视频关键帧档 = 首帧，不是「参考图」', () => {
    expect(resolveReferenceRailSlot('video', 'keyframe')).toBe('first-frame')
  })

  it('⭐ 视频其余两档 = 内容参考 —— 同一张图，语义完全不同', () => {
    expect(resolveReferenceRailSlot('video', 'image-reference')).toBe(
      'content-reference',
    )
    expect(resolveReferenceRailSlot('video', 'multimodal')).toBe(
      'content-reference',
    )
  })

  it('非视频模态一律是老意义上的参考图，用途档不参与', () => {
    for (const mode of VIDEO_NODE_MODES) {
      expect(resolveReferenceRailSlot('image', mode)).toBe('image-reference')
      expect(resolveReferenceRailSlot('audio', mode)).toBe('image-reference')
    }
  })

  it('目录里每一档都有归属 —— 新增用途档时这条会先红', () => {
    const slots = VIDEO_NODE_MODES.map((mode) =>
      resolveReferenceRailSlot('video', mode),
    )
    expect(slots).toEqual([
      'first-frame',
      'content-reference',
      'content-reference',
    ])
  })
})
