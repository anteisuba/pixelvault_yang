import sharp from 'sharp'
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
  placeSticker,
  stickerLook,
  stickerLookDistance,
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

/** 一张有内容的小图：左亮右暗的斜条，`size` 边长，`mark` 角上加一块「水印」。 */
async function drawing(size: number, flip = false, mark = false) {
  const pixels = Buffer.alloc(size * size * 3)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = Math.round(((x + y * 0.5) / (size * 1.5)) * 255)
      const value = flip ? 255 - v : v
      const inMark = mark && x > size * 0.85 && y > size * 0.85
      pixels.fill(
        inMark ? 255 : value,
        (y * size + x) * 3,
        (y * size + x) * 3 + 3,
      )
    }
  return sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer()
}

describe('表情包相似图（第 ⑨ 步）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('缩放、加小水印的同一张认得出，反过来的那张不算', async () => {
    const big = (await stickerLook(await drawing(256)))!
    const small = (await stickerLook(await drawing(96, false, true)))!
    const other = (await stickerLook(await drawing(256, true)))!
    expect(big.pixels).toBe(256 * 256)
    expect(
      stickerLookDistance(big.visualHash, small.visualHash),
    ).toBeLessThanOrEqual(10)
    expect(
      stickerLookDistance(big.visualHash, other.visualHash),
    ).toBeGreaterThan(10)
  })

  it('长得像的已经有了、新的更清楚：那一行换成新图，旧图删掉', async () => {
    const look = (await stickerLook(await drawing(96)))!
    mocks.stickerFindFirst.mockResolvedValue(null)
    mocks.stickerFindMany.mockResolvedValue([
      { ...row, visualHash: look.visualHash, pixels: look.pixels },
    ])
    mocks.stickerUpdate.mockResolvedValue(row)
    const result = await placeSticker({
      userId: 'u',
      cardId: 'c',
      key: 'new-key',
      url: 'https://cdn/new.png',
      sourceUrl: null,
      whenToUse: 'x',
      data: await drawing(256),
    })
    expect(result.created).toBe(false)
    expect(mocks.stickerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        data: expect.objectContaining({
          storageKey: 'new-key',
          pixels: 256 * 256,
        }),
      }),
    )
    expect(mocks.deleteR2).toHaveBeenCalledWith(row.storageKey)
    expect(mocks.stickerCreate).not.toHaveBeenCalled()
  })

  it('长得像的已经有了、新的没它清楚：不收，删掉刚传的', async () => {
    const look = (await stickerLook(await drawing(256)))!
    mocks.stickerFindFirst.mockResolvedValue(null)
    mocks.stickerFindMany.mockResolvedValue([
      { ...row, visualHash: look.visualHash, pixels: look.pixels },
    ])
    const result = await placeSticker({
      userId: 'u',
      cardId: 'c',
      key: 'new-key',
      url: 'https://cdn/new.png',
      sourceUrl: null,
      whenToUse: 'x',
      data: await drawing(96),
    })
    expect(result).toEqual({
      row: expect.objectContaining({ id: 's1' }),
      created: false,
    })
    expect(mocks.deleteR2).toHaveBeenCalledWith('new-key')
    expect(mocks.stickerUpdate).not.toHaveBeenCalled()
    expect(mocks.stickerCreate).not.toHaveBeenCalled()
  })
})
