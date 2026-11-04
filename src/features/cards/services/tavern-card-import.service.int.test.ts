/**
 * L2a 真库：导入酒馆卡（直传 R2 → 读回来拆卡 → 建卡 → 删掉上传的文件）。
 * 只假边界：R2（内存桶）、文字模型（导入后的整理；没配 key 时不会调到）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/fake-r2')).fakeR2Module(
    await importOriginal<typeof import('@/services/storage/r2')>(),
  ),
)
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: vi.fn(async () => {
    throw new Error('不该调模型')
  }),
}))

import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import {
  importTavernCard,
  prepareTavernCardUpload,
} from '@/features/cards/services/tavern-card-import.service'
import { db } from '@/lib/db'
import { r2Bucket } from '@/test/fake-r2'
import { createTestUser, resetDatabase } from '@/test/int/db'

/** 带一个 `chara` 文本块的最小 PNG（CRC 不校验，填 0）。 */
function cardPng(card: unknown): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)])
  }
  const text = Buffer.concat([
    Buffer.from('chara\0'),
    Buffer.from(Buffer.from(JSON.stringify(card)).toString('base64')),
  ])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', Buffer.alloc(13)),
    chunk('tEXt', text),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

let me: Awaited<ReturnType<typeof createTestUser>>
let key: string

beforeEach(async () => {
  r2Bucket.clear()
  await resetDatabase()
  me = await createTestUser()
  key = `${TAVERN_CARD.UPLOAD_KEY_PREFIX}/${me.id}/1-abc.png`
})

function stored(data: Buffer, storageKey = key) {
  r2Bucket.set(storageKey, { data, mimeType: 'application/octet-stream' })
}

const run = (storageKey = key, fileName = 'rei.png') =>
  importTavernCard(me.clerkId, { fileName, storageKey, locale: 'zh' })

async function cards() {
  return db.characterCard.findMany({
    where: { userId: me.id },
    include: { looks: true },
  })
}

describe('prepareTavernCardUpload', () => {
  it('签到这个人自己的 tavern-imports/ 下，PUT 带类型与不覆盖', async () => {
    const target = await prepareTavernCardUpload(me.clerkId, {
      fileName: 'rei.png',
      mimeType: 'image/png',
      sizeBytes: 8_000_000,
    })
    expect(target.storageKey).toMatch(
      new RegExp(`^tavern-imports/${me.id}/.+\\.png$`),
    )
    expect(target.uploadUrl).toContain(encodeURIComponent(target.storageKey))
    expect(target.headers).toEqual({
      'Content-Type': 'image/png',
      'If-None-Match': '*',
    })
  })
})

describe('importTavernCard', () => {
  it('PNG 卡：解析落格，图去掉文本块后上 R2 当主图，上传的原件读完删掉', async () => {
    stored(cardPng({ name: 'Rei', personality: 'calm' }))

    await run()

    const [card] = await cards()
    expect(card).toMatchObject({ name: 'Rei', persona: { behavior: 'calm' } })
    const slots = card!.looks[0]!.referenceSlots as Array<{ url: string }>
    expect(slots).toHaveLength(1)
    const imageKey = slots[0]!.url.replace('https://cdn.test/', '')
    const image = r2Bucket.get(imageKey)!
    expect(image.mimeType).toBe('image/png')
    expect(image.data.includes(Buffer.from('chara'))).toBe(false)
    expect(r2Bucket.has(key)).toBe(false)
  })

  it('JSON 卡：没有图', async () => {
    stored(
      Buffer.from(
        JSON.stringify({ spec: 'chara_card_v2', data: { name: 'Rei' } }),
      ),
    )
    await run(key, 'rei.json')

    const [card] = await cards()
    expect(card?.name).toBe('Rei')
    expect(card?.looks[0]?.referenceSlots).toEqual([])
    expect(r2Bucket.size).toBe(0)
  })

  it.each([
    ['坏 JSON', Buffer.from('{oops')],
    ['没有名字', Buffer.from('{"desc":"x"}')],
    ['普通 PNG', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ])('%s：不是卡（带 i18nKey），不建卡，文件照样删', async (_label, data) => {
    stored(data)
    await expect(run()).rejects.toMatchObject({
      i18nKey: 'errors.tavernCard.notACard',
    })
    expect(await db.characterCard.count()).toBe(0)
    expect(r2Bucket.has(key)).toBe(false)
  })

  it('别人的 / 走出目录的 key：不去读也不删', async () => {
    const theirs = [
      'tavern-imports/user_2/1-abc.png',
      `tavern-imports/${me.id}/../user_2/x.png`,
      `generations/${me.id}/image/x.png`,
    ]
    for (const storageKey of theirs) {
      stored(cardPng({ name: 'Rei' }), storageKey)
      await expect(run(storageKey)).rejects.toMatchObject({
        i18nKey: 'errors.tavernCard.uploadMissing',
      })
    }
    expect([...r2Bucket.keys()].sort()).toEqual([...theirs].sort())
    expect(await db.characterCard.count()).toBe(0)
  })

  it('超过上限：太大（删掉）；读不到：没传上去', async () => {
    stored(Buffer.alloc(TAVERN_CARD.UPLOAD_MAX_BYTES + 1))
    await expect(run()).rejects.toMatchObject({
      i18nKey: 'errors.tavernCard.tooLarge',
    })
    expect(r2Bucket.has(key)).toBe(false)

    await expect(run()).rejects.toMatchObject({
      i18nKey: 'errors.tavernCard.uploadMissing',
    })
    expect(await db.characterCard.count()).toBe(0)
  })
})
