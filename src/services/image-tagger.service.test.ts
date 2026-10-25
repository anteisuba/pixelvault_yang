import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const queryRaw = vi.fn()
const executeRaw = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    $executeRaw: (...args: unknown[]) => executeRaw(...args),
  },
}))
const tagImageViaWorker = vi.fn()
vi.mock('@/services/execution-worker.service', () => ({
  tagImageViaWorker: (...args: unknown[]) => tagImageViaWorker(...args),
}))

import { IMAGE_TAGGER } from '@/constants/image-tagger'

import { tagPicture } from './image-tagger.service'

const RESULT = {
  style: [['wlop', 0.8]],
  character: [],
  copyright: [],
  general: [['1girl', 0.99]],
  meta: [],
  rating: [['rating:g', 0.9]],
}

describe('tagPicture', () => {
  beforeEach(() => {
    queryRaw.mockReset()
    executeRaw.mockReset().mockResolvedValue(1)
    tagImageViaWorker.mockReset().mockResolvedValue(RESULT)
  })

  it('reads a library picture from its original, not the thumbnail, and keeps the reading', async () => {
    queryRaw.mockResolvedValue([
      { id: 'gen-1', url: 'https://cdn/original.png', tagger: null },
    ])
    expect(await tagPicture('user-1', 'https://cdn/thumb.webp')).toEqual(RESULT)
    expect(tagImageViaWorker).toHaveBeenCalledWith(
      'https://cdn/original.png',
      IMAGE_TAGGER.TIMEOUT_MS,
    )
    expect(executeRaw).toHaveBeenCalledTimes(1)
  })

  it('does not run the tagger again for a picture it already read', async () => {
    queryRaw.mockResolvedValue([
      {
        id: 'gen-1',
        url: 'https://cdn/original.png',
        tagger: { version: IMAGE_TAGGER.MODEL_VERSION, result: RESULT },
      },
    ])
    expect(await tagPicture('user-1', 'https://cdn/original.png')).toEqual(
      RESULT,
    )
    expect(tagImageViaWorker).not.toHaveBeenCalled()
  })

  it('reads a picture outside the library without storing it', async () => {
    queryRaw.mockResolvedValue([])
    await tagPicture('user-1', 'https://example.com/web.jpg')
    expect(tagImageViaWorker).toHaveBeenCalledWith(
      'https://example.com/web.jpg',
      IMAGE_TAGGER.TIMEOUT_MS,
    )
    expect(executeRaw).not.toHaveBeenCalled()
  })
})
