import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createTestUser, resetDatabase } from '@/test/int/db'
import { createTestGeneration } from '@/test/int/generations'
import { stubFetch } from '@/test/fake-fetch'

import { readTaggerFor, renderTaggerReading } from './tagger'

/**
 * 认图走真 `tagPicture`（真库：库里的图认一次就记在 snapshot 上）；只假网络——
 * execution worker 的 `/tag-image` 那一跳。
 */

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

describe('readTaggerFor（真库 + 假 worker）', () => {
  let userId = ''
  let worker: ReturnType<typeof stubFetch>
  const taggedUrls = () =>
    worker.mock.calls.map(
      ([, init]) =>
        (JSON.parse(String(init?.body)) as { imageUrl: string }).imageUrl,
    )

  beforeEach(async () => {
    await resetDatabase()
    userId = (await createTestUser()).id
    vi.stubEnv('EXECUTION_WORKER_BASE_URL', 'https://worker.test')
    vi.stubEnv('INTERNAL_CALLBACK_SECRET', 'test-callback-secret')
    worker = stubFetch((_url, init) => {
      const { imageUrl } = JSON.parse(String(init?.body)) as {
        imageUrl: string
      }
      return imageUrl.endsWith('/b.png')
        ? new Response('bad gateway', { status: 502 })
        : Response.json(READING)
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('reads each picture once, and says which one failed instead of failing the look', async () => {
    const text = await readTaggerFor(userId, [
      { url: 'https://cdn/a.png', label: '图_1' },
      { url: 'https://cdn/a.png', label: '图_1 again' },
      { url: 'https://cdn/b.png', label: 'ref-1' },
    ])
    expect(taggedUrls()).toEqual(['https://cdn/a.png', 'https://cdn/b.png'])
    expect(text).toContain('artist / style: wlop 0.82')
    expect(text).toContain(
      'ref-1 — the tagger could not read it this time (Tagger failed (502)',
    )
  })

  it('库里的图认原图、认一次就记下：下次不再叫 worker', async () => {
    await createTestGeneration(userId, {
      url: 'https://cdn/full.png',
      thumbnailUrl: 'https://cdn/thumb.webp',
    })

    const first = await readTaggerFor(userId, [
      { url: 'https://cdn/thumb.webp', label: '图_1' },
    ])
    const again = await readTaggerFor(userId, [
      { url: 'https://cdn/thumb.webp', label: '图_1' },
    ])

    expect(taggedUrls()).toEqual(['https://cdn/full.png'])
    expect(again).toBe(first)
    expect(first).toContain('artist / style: wlop 0.82')
  })

  it('asks for a picture when there is nothing to read', async () => {
    expect(await readTaggerFor(userId, [])).toContain('no picture to read')
    expect(worker).not.toHaveBeenCalled()
  })
})
