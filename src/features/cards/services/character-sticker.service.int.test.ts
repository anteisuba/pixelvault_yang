/**
 * L2a 真库：她的表情包（4d：收 / 删 / 上限 / 聊天里发；去重；第 ⑨ 步相似图）。
 * 只假 R2（内存桶）和 Next 的 `after`（记下回完之后要做的事，测试里手动跑）。
 */
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const afterTasks = vi.hoisted(() => [] as Array<() => unknown>)

vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({
  after: (task: () => unknown) => afterTasks.push(task),
}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/fake-r2')).fakeR2Module(
    await importOriginal<typeof import('@/services/storage/r2')>(),
  ),
)

import { CHARACTER_STICKERS } from '@/constants/character-browse'
import { db } from '@/lib/db'
import { R2_PUBLIC_BASE, r2Bucket } from '@/test/fake-r2'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'

import {
  addCharacterStickerFromFile,
  CharacterStickerUploadError,
  dedupeCharacterStickers,
  deleteCharacterSticker,
  listCharacterStickers,
  loadChatStickers,
  placeSticker,
  pruneCharacterStickers,
  resolveStickerTokens,
  stickerContentHash,
  stickerLook,
  stickerLookDistance,
} from './character-sticker.service'

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

let me: Awaited<ReturnType<typeof createTestUser>>
let cardId: string

beforeEach(async () => {
  r2Bucket.clear()
  afterTasks.length = 0
  await resetDatabase()
  me = await createTestUser()
  cardId = (await createTestCard(me.id, { name: 'Denia' })).id
})

let seq = 0
/** 桶里放一张、库里记一行。 */
async function sticker(
  data: Partial<{
    id: string
    whenToUse: string
    isBlocked: boolean
    sentAt: Date | null
    createdAt: Date
    contentHash: string | null
    visualHash: string | null
    pixels: number | null
    image: Buffer
  }> = {},
) {
  seq += 1
  const { image, ...columns } = data
  const storageKey = `characters/${me.id}/${cardId}/stickers/s${seq}.png`
  if (image) r2Bucket.set(storageKey, { data: image, mimeType: 'image/png' })
  return db.characterSticker.create({
    data: {
      userId: me.id,
      characterCardId: cardId,
      storageKey,
      url: `${R2_PUBLIC_BASE}/${storageKey}`,
      whenToUse: '被夸的时候',
      ...columns,
    },
  })
}

const rows = () =>
  db.characterSticker.findMany({ orderBy: { createdAt: 'asc' } })

describe('她的表情包（4d）', () => {
  it('别人的卡、删了的卡：列不出来（null → 404）', async () => {
    const other = await createTestUser()
    const gone = await createTestCard(me.id, { isDeleted: true })
    expect(await listCharacterStickers(other.clerkId, cardId)).toBeNull()
    expect(await listCharacterStickers(me.clerkId, gone.id)).toBeNull()
  })

  it('你喂的那张：验过是图再存到 mine/ 路径，标成你喂的', async () => {
    const result = await addCharacterStickerFromFile(me.clerkId, cardId, {
      fileBuffer: await drawing(200),
      whenToUse: '',
    })

    const [key] = [...r2Bucket.keys()]
    expect(key).toMatch(
      new RegExp(`^characters/${me.id}/${cardId}/stickers/mine/.+\\.png$`),
    )
    expect(await rows()).toEqual([
      expect.objectContaining({
        storageKey: key,
        whenToUse: CHARACTER_STICKERS.defaultWhen,
        pixels: 200 * 200,
      }),
    ])
    expect(result?.fromCreator).toBe(true)
  })

  it('不是图就拒，太大就拒', async () => {
    await expect(
      addCharacterStickerFromFile(me.clerkId, cardId, {
        fileBuffer: Buffer.from('x'),
        whenToUse: '',
      }),
    ).rejects.toBeInstanceOf(CharacterStickerUploadError)
    await expect(
      addCharacterStickerFromFile(me.clerkId, cardId, {
        fileBuffer: Buffer.alloc(CHARACTER_STICKERS.maxBytes + 1),
        whenToUse: '',
      }),
    ).rejects.toMatchObject({ code: 'TOO_LARGE' })
    expect(r2Bucket.size).toBe(0)
    expect(await rows()).toEqual([])
  })

  it('删：只删自己的，连 R2 一起', async () => {
    const mine = await sticker({ image: await drawing(32) })
    const other = await createTestUser()

    expect(await deleteCharacterSticker(other.clerkId, mine.id)).toBe(false)
    expect(await deleteCharacterSticker(me.clerkId, 'missing')).toBe(false)
    expect(await deleteCharacterSticker(me.clerkId, mine.id)).toBe(true)

    expect(await rows()).toEqual([])
    expect(r2Bucket.has(mine.storageKey)).toBe(false)
  })

  it('超过上限：先删没发过的里最旧的', async () => {
    const total = CHARACTER_STICKERS.perCard + 2
    const all = []
    for (let n = 0; n < total; n += 1)
      all.push(
        await sticker({
          createdAt: new Date(Date.UTC(2026, 9, 1, 0, n)),
          sentAt: n < 3 ? new Date() : null,
        }),
      )

    await pruneCharacterStickers(cardId)

    const left = (await rows()).map((row) => row.id)
    expect(left).toHaveLength(CHARACTER_STICKERS.perCard)
    expect(left).not.toContain(all[3]!.id)
    expect(left).not.toContain(all[4]!.id)
    expect(left).toContain(all[0]!.id)
  })
})

describe('聊天里发（4d）', () => {
  it('列出她没拉黑的表情包，编号是 id 前几位', async () => {
    await sticker({ id: 'ab12cd-0000', whenToUse: '被夸的时候' })
    await sticker({ id: 'zz99zz-0000', isBlocked: true })

    const stickers = await loadChatStickers(me.id, cardId)

    expect([...stickers.byHandle.keys()]).toEqual(['ab12cd'])
    expect(stickers.section).toContain('[表情·ab12cd] — when: 被夸的时候')
    expect(stickers.section).not.toContain('zz99zz')
  })

  it('换成一行图片、记下发出时间；一轮只认第一张，认不出的去掉', async () => {
    const a = await sticker({ id: 'ab12cd-0000' })
    const b = await sticker({ id: 'ef34gh-0000' })
    const stickers = await loadChatStickers(me.id, cardId)

    const text = await resolveStickerTokens(
      '诶？\n[表情·ab12cd]\n还有\n[表情·ef34gh]\n[表情·999999]',
      stickers,
    )

    expect(text).toBe(`诶？\n\n![表情](${a.url})\n\n还有`)
    const after = await rows()
    expect(after.find((row) => row.id === a.id)?.sentAt).toBeInstanceOf(Date)
    expect(after.find((row) => row.id === b.id)?.sentAt).toBeNull()
  })
})

describe('表情包去重（10-30「找了好多次重复的」）', () => {
  it('补上指纹，同一张图只留最早那张；后来那张拉黑过就把拉黑带过去', async () => {
    const same = await drawing(64)
    const a = await sticker({
      image: same,
      createdAt: new Date('2026-10-01T00:00:00Z'),
    })
    const b = await sticker({
      image: same,
      isBlocked: true,
      createdAt: new Date('2026-10-02T00:00:00Z'),
    })
    const c = await sticker({
      image: await drawing(64, true),
      createdAt: new Date('2026-10-03T00:00:00Z'),
    })

    await dedupeCharacterStickers(cardId)

    const left = await rows()
    expect(left.map((row) => row.id)).toEqual([a.id, c.id])
    expect(left[0]).toMatchObject({
      isBlocked: true,
      contentHash: stickerContentHash(same),
    })
    expect(left[1]?.visualHash).toEqual(expect.any(String))
    expect(r2Bucket.has(b.storageKey)).toBe(false)
  })

  it('你喂的那张已经有了：⛔ 再存一张，回已有的那张', async () => {
    const image = await drawing(200)
    const existing = await sticker({
      contentHash: stickerContentHash(image),
    })

    const result = await addCharacterStickerFromFile(me.clerkId, cardId, {
      fileBuffer: image,
      whenToUse: '',
    })

    expect(result?.id).toBe(existing.id)
    expect(r2Bucket.size).toBe(0)
    expect(await rows()).toHaveLength(1)
  })

  it('列表里还有没指纹的旧行：回完这次在后台去重', async () => {
    const image = await drawing(64)
    const old = await sticker({ image })

    await listCharacterStickers(me.clerkId, cardId)

    expect(afterTasks).toHaveLength(1)
    await afterTasks[0]!()
    expect(
      (await db.characterSticker.findUniqueOrThrow({ where: { id: old.id } }))
        .contentHash,
    ).toBe(stickerContentHash(image))
  })
})

describe('表情包相似图（第 ⑨ 步）', () => {
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

  async function placeNew(data: Buffer) {
    r2Bucket.set('new-key', { data, mimeType: 'image/png' })
    return placeSticker({
      userId: me.id,
      cardId,
      key: 'new-key',
      url: `${R2_PUBLIC_BASE}/new-key`,
      sourceUrl: null,
      whenToUse: 'x',
      data,
    })
  }

  it('长得像的已经有了、新的更清楚：那一行换成新图，旧图删掉', async () => {
    const oldImage = await drawing(96)
    const look = (await stickerLook(oldImage))!
    const existing = await sticker({
      image: oldImage,
      visualHash: look.visualHash,
      pixels: look.pixels,
      isBlocked: true,
    })

    const result = await placeNew(await drawing(256))

    expect(result.created).toBe(false)
    expect(await rows()).toEqual([
      expect.objectContaining({
        id: existing.id,
        storageKey: 'new-key',
        pixels: 256 * 256,
        // 拉黑、那句「什么时候发」都留着
        isBlocked: true,
        whenToUse: existing.whenToUse,
      }),
    ])
    expect(r2Bucket.has(existing.storageKey)).toBe(false)
    expect(r2Bucket.has('new-key')).toBe(true)
  })

  it('长得像的已经有了、新的没它清楚：不收，删掉刚传的', async () => {
    const oldImage = await drawing(256)
    const look = (await stickerLook(oldImage))!
    const existing = await sticker({
      image: oldImage,
      visualHash: look.visualHash,
      pixels: look.pixels,
    })

    const result = await placeNew(await drawing(96))

    expect(result).toEqual({
      row: expect.objectContaining({ id: existing.id }),
      created: false,
    })
    expect(await rows()).toEqual([
      expect.objectContaining({
        id: existing.id,
        storageKey: existing.storageKey,
      }),
    ])
    expect(r2Bucket.has('new-key')).toBe(false)
    expect(r2Bucket.has(existing.storageKey)).toBe(true)
  })
})
