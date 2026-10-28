import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import { readPngTextChunks } from '@/lib/png-text-chunks'
import { shrinkTavernCardPng } from '@/lib/tavern-card-shrink'
import { png, tEXt } from '@/test/png-fixture'

const compress = vi.hoisted(() => vi.fn())
vi.mock('@/lib/compress-image', () => ({ compressImageToLimit: compress }))

function fileOf(bytes: Uint8Array): File {
  return new File([Uint8Array.from(bytes)], 'card.png', { type: 'image/png' })
}

const PAYLOAD = Buffer.from('{"name":"时夜"}', 'utf8').toString('base64')

describe('shrinkTavernCardPng', () => {
  beforeEach(() => {
    compress.mockReset()
    compress.mockImplementation(async () => ({ file: fileOf(png()) }))
  })

  it('图缩好后把装卡的块原样写回去', async () => {
    const result = await shrinkTavernCardPng(fileOf(png(tEXt('ccv3', PAYLOAD))))
    expect(result.kind).toBe('file')
    if (result.kind !== 'file') return
    const bytes = new Uint8Array(await result.file.arrayBuffer())
    expect(readPngTextChunks(bytes)).toEqual([
      { keyword: 'ccv3', text: PAYLOAD },
    ])
    expect(compress.mock.calls[0][1].maxBytes).toBeLessThan(
      TAVERN_CARD.MAX_FILE_BYTES - PAYLOAD.length,
    )
  })

  it('图里没有卡：notACard，不去缩', async () => {
    const result = await shrinkTavernCardPng(fileOf(png(tEXt('Comment', 'hi'))))
    expect(result).toEqual({ kind: 'notACard' })
    expect(compress).not.toHaveBeenCalled()
  })

  it('图缩不进：tooLarge', async () => {
    compress.mockRejectedValueOnce(new Error('CANNOT_COMPRESS_ENOUGH'))
    const stuck = await shrinkTavernCardPng(fileOf(png(tEXt('chara', PAYLOAD))))
    expect(stuck).toEqual({ kind: 'tooLarge' })
  })
})
