import { describe, expect, it } from 'vitest'

import {
  buildMessageImageReferences,
  compileReferenceMentions,
  getReferenceMentionIndices,
  getReferenceImageAttachmentId,
  removeReferenceMentions,
  normalizeReferenceMentions,
} from './studio-reference-mentions'

describe('Studio reference mentions', () => {
  it('turns assistant-written image numbers into thumbnail mentions', () => {
    expect(
      normalizeReferenceMentions(
        'Image 1 角色，参考图2衣服，图 3动作，reference image 4画风，@Image4面部',
      ),
    ).toBe('@Image1 角色，@Image2衣服，@Image3动作，@Image4画风，@Image4面部')
  })

  it('does not rewrite URLs, email addresses or partial identifiers', () => {
    const text = 'https://cdn.test/Image1.png user@Image3.com Image2abc'
    expect(normalizeReferenceMentions(text)).toBe(text)
  })
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

describe('canvas reference identity', () => {
  it('resolves canvas names before any numeric suffix and prefers the longest name', () => {
    expect(
      normalizeReferenceMentions('以「生成图」为布局，以「生成图3」为画风', [
        { name: '生成图', referenceImageIndex: 1 },
        { name: '生成图3', referenceImageIndex: 3 },
      ]),
    ).toBe('以「@Image2」为布局，以「@Image4」为画风')
  })
  it('does not guess an index for duplicate names or nodes without images', () => {
    expect(
      normalizeReferenceMentions('生成图3，生成图7', [
        { name: '生成图3', referenceImageIndex: 0 },
        { name: '生成图3', referenceImageIndex: 1 },
        { name: '生成图7' },
      ]),
    ).toBe('生成图3，生成图7')
  })
  it('binds historical aliases to their original URLs, not current order; renames use the canvas name', () => {
    const entries = [
      {
        id: 'u1',
        kind: 'user',
        attachments: [{ kind: 'image', label: 'reference image 4', url: 'a' }],
      },
      { id: 'm1', kind: 'message' },
      {
        id: 'u2',
        kind: 'user',
        attachments: [{ kind: 'image', label: 'reference image 4', url: 'b' }],
      },
      { id: 'm2', kind: 'message' },
    ]
    const refs = buildMessageImageReferences(entries, [
      { url: 'b', name: '生成图' },
      { url: 'a', name: '时夜原图' },
    ])
    expect(
      refs.get('m1')?.find((ref) => ref.aliases.includes('reference image 4')),
    ).toMatchObject({ url: 'a', name: '时夜原图' })
    expect(
      refs.get('m2')?.find((ref) => ref.aliases.includes('reference image 4')),
    ).toMatchObject({ url: 'b', name: '生成图' })
  })
  it('does not create guessed thumbnails for unbound numbers or ambiguous names', () => {
    const refs = buildMessageImageReferences(
      [{ id: 'm', kind: 'message' }],
      [
        { url: 'a', name: '重复' },
        { url: 'b', name: '重复' },
      ],
    ).get('m')!
    expect(refs.flatMap((ref) => ref.aliases)).toEqual([])
  })
})
