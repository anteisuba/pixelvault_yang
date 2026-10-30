import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(),
  cardFindFirst: vi.fn(),
  stickerFindFirst: vi.fn(),
  stickerFindMany: vi.fn(),
  stickerCreate: vi.fn(),
  stickerUpdate: vi.fn(),
  stickerDelete: vi.fn(),
  stickerDeleteMany: vi.fn(),
  detect: vi.fn(),
  upload: vi.fn(),
  deleteR2: vi.fn(),
  fetch: vi.fn(),
  after: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ after: mocks.after }))
vi.mock('@/services/user.service', () => ({ ensureUser: mocks.ensureUser }))
vi.mock('@/lib/db', () => ({
  db: {
    characterCard: { findFirst: mocks.cardFindFirst },
    characterSticker: {
      findFirst: mocks.stickerFindFirst,
      findMany: mocks.stickerFindMany,
      create: mocks.stickerCreate,
      update: mocks.stickerUpdate,
      delete: mocks.stickerDelete,
      deleteMany: mocks.stickerDeleteMany,
    },
  },
}))
vi.mock('@/services/storage/r2', () => ({
  detectTrustedImageMime: mocks.detect,
  uploadToR2: mocks.upload,
  deleteFromR2: mocks.deleteR2,
  fetchAsBuffer: mocks.fetch,
}))

import {
  addCharacterStickerFromFile,
  CharacterStickerUploadError,
  dedupeCharacterStickers,
  deleteCharacterSticker,
  listCharacterStickers,
  loadChatStickers,
  pruneCharacterStickers,
  resolveStickerTokens,
} from './character-sticker.service'

const row = {
  id: 's1',
  url: 'https://cdn/s1.png',
  storageKey: 'characters/u/c/stickers/mine/x.png',
  sourceUrl: null,
  whenToUse: '你喂给她的，觉得合适时发',
  isBlocked: false,
  createdAt: new Date('2026-10-29T00:00:00.000Z'),
  sentAt: null,
}

describe('她的表情包（4d）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ensureUser.mockResolvedValue({ id: 'u' })
    mocks.cardFindFirst.mockResolvedValue({ id: 'c' })
    mocks.stickerFindMany.mockResolvedValue([])
    mocks.deleteR2.mockResolvedValue(undefined)
  })

  it('别人的卡、删了的卡：列不出来（null → 404）', async () => {
    mocks.cardFindFirst.mockResolvedValue(null)
    expect(await listCharacterStickers('clerk', 'c')).toBeNull()
    expect(mocks.cardFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c', userId: 'u', isDeleted: false },
      }),
    )
  })

  it('你喂的那张：验过是图再存到 mine/ 路径，标成你喂的', async () => {
    mocks.detect.mockResolvedValue({
      format: 'png',
      mimeType: 'image/png',
      width: 200,
      height: 200,
    })
    mocks.upload.mockResolvedValue('https://cdn/s1.png')
    mocks.stickerCreate.mockResolvedValue(row)

    const sticker = await addCharacterStickerFromFile('clerk', 'c', {
      fileBuffer: Buffer.from('png'),
      whenToUse: '',
    })

    const upload = mocks.upload.mock.calls[0]?.[0] as { key: string }
    expect(upload.key).toMatch(/^characters\/u\/c\/stickers\/mine\/.+\.png$/)
    expect(mocks.stickerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          whenToUse: '你喂给她的，觉得合适时发',
        }),
      }),
    )
    expect(sticker?.fromCreator).toBe(true)
  })

  it('不是图就拒，太大就拒', async () => {
    mocks.detect.mockRejectedValue(new Error('bad'))
    await expect(
      addCharacterStickerFromFile('clerk', 'c', {
        fileBuffer: Buffer.from('x'),
        whenToUse: '',
      }),
    ).rejects.toBeInstanceOf(CharacterStickerUploadError)
    await expect(
      addCharacterStickerFromFile('clerk', 'c', {
        fileBuffer: Buffer.alloc(6 * 1024 * 1024),
        whenToUse: '',
      }),
    ).rejects.toMatchObject({ code: 'TOO_LARGE' })
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('删：只删自己的，连 R2 一起', async () => {
    mocks.stickerFindFirst.mockResolvedValueOnce(null)
    expect(await deleteCharacterSticker('clerk', 'x')).toBe(false)
    mocks.stickerFindFirst.mockResolvedValueOnce(row)
    expect(await deleteCharacterSticker('clerk', 's1')).toBe(true)
    expect(mocks.deleteR2).toHaveBeenCalledWith(row.storageKey)
  })

  it('超过 30 张：先删没发过的里最旧的', async () => {
    const all = Array.from({ length: 32 }, (_, n) => ({
      id: `s${n}`,
      storageKey: `k${n}`,
      sentAt: n < 3 ? new Date() : null,
    }))
    mocks.stickerFindMany.mockResolvedValue(all)
    await pruneCharacterStickers('c')
    expect(mocks.stickerDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['s3', 's4'] } },
    })
  })
})

describe('聊天里发（4d）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.stickerUpdate.mockResolvedValue({})
  })

  it('列出她没拉黑的表情包，编号是 id 前 6 位', async () => {
    mocks.stickerFindMany.mockResolvedValue([
      { id: 'ab12cd-0000', url: 'https://cdn/a.png', whenToUse: '被夸的时候' },
    ])
    const stickers = await loadChatStickers('u', 'c')
    expect(mocks.stickerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u', characterCardId: 'c', isBlocked: false },
      }),
    )
    expect(stickers.section).toContain('[表情·ab12cd] — when: 被夸的时候')
  })

  it('换成一行图片、记下发出时间；一轮只认第一张，认不出的去掉', async () => {
    const stickers = {
      byHandle: new Map([
        ['ab12cd', { id: 'ab12cd-0000', url: 'https://cdn/a.png' }],
        ['ef34gh', { id: 'ef34gh-0000', url: 'https://cdn/b.png' }],
      ]),
      section: '',
    }
    const text = await resolveStickerTokens(
      '诶？\n[表情·ab12cd]\n还有\n[表情·ef34gh]\n[表情·999999]',
      stickers,
    )
    expect(text).toBe('诶？\n\n![表情](https://cdn/a.png)\n\n还有')
    expect(mocks.stickerUpdate).toHaveBeenCalledWith({
      where: { id: 'ab12cd-0000' },
      data: { sentAt: expect.any(Date) },
    })
  })
})

describe('表情包去重（10-30「找了好多次重复的」）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ensureUser.mockResolvedValue({ id: 'u' })
    mocks.cardFindFirst.mockResolvedValue({ id: 'c' })
    mocks.deleteR2.mockResolvedValue(undefined)
  })

  it('补上指纹，同一张图只留最早那张；后来那张拉黑过就把拉黑带过去', async () => {
    mocks.stickerFindMany.mockResolvedValue([
      {
        id: 'a',
        url: 'https://cdn/a',
        storageKey: 'ka',
        contentHash: null,
        isBlocked: false,
      },
      {
        id: 'b',
        url: 'https://cdn/b',
        storageKey: 'kb',
        contentHash: null,
        isBlocked: true,
      },
      {
        id: 'c',
        url: 'https://cdn/c',
        storageKey: 'kc',
        contentHash: null,
        isBlocked: false,
      },
    ])
    mocks.fetch.mockImplementation(async (url: string) => ({
      buffer: Buffer.from(url.endsWith('/c') ? 'other' : 'same'),
      mimeType: 'image/png',
    }))

    await dedupeCharacterStickers('c')

    expect(mocks.stickerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a' },
        data: { isBlocked: true },
      }),
    )
    expect(mocks.stickerDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['b'] } },
    })
    expect(mocks.deleteR2).toHaveBeenCalledWith('kb')
  })

  it('你喂的那张已经有了：⛔ 再存一张，回已有的那张', async () => {
    mocks.detect.mockResolvedValue({
      format: 'png',
      mimeType: 'image/png',
      width: 200,
      height: 200,
    })
    mocks.stickerFindFirst.mockResolvedValueOnce(row)

    const sticker = await addCharacterStickerFromFile('clerk', 'c', {
      fileBuffer: Buffer.from('png'),
      whenToUse: '',
    })

    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.stickerCreate).not.toHaveBeenCalled()
    expect(sticker?.id).toBe('s1')
  })

  it('列表里还有没指纹的旧行：回完这次在后台去重', async () => {
    mocks.stickerFindMany.mockResolvedValue([{ ...row, contentHash: null }])
    await listCharacterStickers('clerk', 'c')
    expect(mocks.after).toHaveBeenCalledTimes(1)
  })
})
