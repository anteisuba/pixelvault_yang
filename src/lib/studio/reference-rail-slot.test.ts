import { describe, expect, it } from 'vitest'

import { resolveReferenceRailSlot } from './reference-rail-slot'

/**
 * ⛔ **`'first-frame'` 那一档在第二期删掉了**：关键帧档的图不再走这条轨，
 * 它们住在具名槽（首帧 / 尾帧各一格）。旧那套整条轨都写着「首帧」，而第二张
 * 其实是尾帧 —— 位置承载语义的典型代价。
 */
describe('resolveReferenceRailSlot', () => {
  it('⭐ 视频 = 内容参考 —— 关键帧档的图已经不在这条轨上了', () => {
    expect(resolveReferenceRailSlot('video')).toBe('content-reference')
  })

  it('非视频模态一律是老意义上的参考图', () => {
    expect(resolveReferenceRailSlot('image')).toBe('image-reference')
    expect(resolveReferenceRailSlot('audio')).toBe('image-reference')
  })
})
