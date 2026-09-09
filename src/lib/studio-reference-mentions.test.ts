import { describe, expect, it } from 'vitest'

import {
  compileReferenceMentions,
  getReferenceMentionIndices,
  getReferenceImageAttachmentId,
  removeReferenceMentions,
} from './studio-reference-mentions'

describe('Studio reference mentions', () => {
  it('keeps attachment identity tied to the image URL instead of its current slot', () => {
    const first = getReferenceImageAttachmentId('https://cdn.test/a.png')
    expect(first).toBe(getReferenceImageAttachmentId('https://cdn.test/a.png'))
    expect(first).not.toBe(
      getReferenceImageAttachmentId('https://cdn.test/b.png'),
    )
    expect(first.length).toBeLessThan(128)
  })

  it('matches image positions next to Chinese text without matching emails or partial names', () => {
    expect(
      getReferenceMentionIndices(
        '采用@Image2画风，@Image12。@Image2 user@Image3.com @Image1abc',
      ),
    ).toEqual([1, 11])
  })

  it('removes only the deleted reference and renumbers subsequent references once', () => {
    expect(
      removeReferenceMentions('@Image1 身份，@Image2 姿势，@Image3 画风', 1),
    ).toBe('@Image1 身份， 姿势，@Image2 画风')
    expect(removeReferenceMentions('@Image1 @Image2 @Image12', 0)).toBe(
      ' @Image1 @Image11',
    )
  })

  it('clears mentions without deleting the surrounding user text', () => {
    expect(removeReferenceMentions('使用@Image1的角色，保留背景')).toBe(
      '使用的角色，保留背景',
    )
  })

  it('resolves the final provider position including card reference offsets', () => {
    expect(compileReferenceMentions('角色@Image2，风格@Image1', 3)).toBe(
      '角色reference image 5，风格reference image 4',
    )
  })
})
