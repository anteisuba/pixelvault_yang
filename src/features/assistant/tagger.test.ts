import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const tagPicture = vi.fn()
vi.mock('@/services/image-tagger.service', () => ({
  tagPicture: (...args: unknown[]) => tagPicture(...args),
}))

import { readTaggerFor, renderTaggerReading } from './tagger'

const READING = {
  style: [
    ['wlop', 0.82],
    ['ask_(askzy)', 0.21],
  ] as [string, number][],
  character: [] as [string, number][],
  copyright: [['original', 0.91]] as [string, number][],
  general: [
    ['1girl', 0.99],
    ['elf', 0.82],
  ] as [string, number][],
  meta: [] as [string, number][],
  rating: [['rating:s', 0.9]] as [string, number][],
}

describe('renderTaggerReading', () => {
  it('lists artist tags with their confidence and content tags bare', () => {
    expect(renderTaggerReading('图_1610', READING)).toBe(
      [
        '图_1610 — tagger reading:',
        'artist / style: wlop 0.82, ask_(askzy) 0.21',
        'character: none recognised',
        'work: original 0.91',
        'content: 1girl, elf',
        'rating: sensitive',
      ].join('\n'),
    )
  })
})

describe('readTaggerFor', () => {
  beforeEach(() => tagPicture.mockReset())

  it('reads each picture once, and says which one failed instead of failing the look', async () => {
    tagPicture
      .mockResolvedValueOnce(READING)
      .mockRejectedValueOnce(new Error('Tagger failed (502)'))
    const text = await readTaggerFor('user-1', [
      { url: 'https://cdn/a.png', label: '图_1' },
      { url: 'https://cdn/a.png', label: '图_1 again' },
      { url: 'https://cdn/b.png', label: 'ref-1' },
    ])
    expect(tagPicture).toHaveBeenCalledTimes(2)
    expect(tagPicture).toHaveBeenCalledWith('user-1', 'https://cdn/a.png')
    expect(text).toContain('artist / style: wlop 0.82')
    expect(text).toContain(
      'ref-1 — the tagger could not read it this time (Tagger failed (502))',
    )
  })

  it('asks for a picture when there is nothing to read', async () => {
    expect(await readTaggerFor('user-1', [])).toContain('no picture to read')
    expect(tagPicture).not.toHaveBeenCalled()
  })
})
