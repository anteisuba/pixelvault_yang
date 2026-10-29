import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockCreateImported = vi.fn()
vi.mock('@/services/cards/character-card.service', () => ({
  createImportedCharacterCard: (...a: unknown[]) => mockCreateImported(...a),
}))

const mockGetObject = vi.fn()
const mockDelete = vi.fn()
const mockPresign = vi.fn()
vi.mock('@/services/storage/r2', () => ({
  getR2ObjectBuffer: (...a: unknown[]) => mockGetObject(...a),
  deleteFromR2: (...a: unknown[]) => mockDelete(...a),
  createPresignedR2PutUrl: (...a: unknown[]) => mockPresign(...a),
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: async () => ({ id: 'user_1' }),
}))

import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import {
  importTavernCard,
  prepareTavernCardUpload,
} from '@/services/cards/tavern-card-import.service'

const KEY = `${TAVERN_CARD.UPLOAD_KEY_PREFIX}/user_1/1-abc.png`

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

function stored(buffer: Buffer) {
  mockGetObject.mockResolvedValueOnce({ buffer })
}

describe('prepareTavernCardUpload', () => {
  it('签到这个人自己的 tavern-imports/ 下，PUT 带类型与不覆盖', async () => {
    mockPresign.mockResolvedValue('https://r2.example/put')
    const target = await prepareTavernCardUpload('clerk_1', {
      fileName: 'rei.png',
      mimeType: 'image/png',
      sizeBytes: 8_000_000,
    })
    expect(target.storageKey).toMatch(/^tavern-imports\/user_1\/.+\.png$/)
    expect(target.uploadUrl).toBe('https://r2.example/put')
    expect(target.headers).toEqual({
      'Content-Type': 'image/png',
      'If-None-Match': '*',
    })
  })
})

describe('importTavernCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateImported.mockResolvedValue({ id: 'card_new' })
    mockDelete.mockResolvedValue(undefined)
  })

  it('PNG 卡：从 R2 读回来，解析落格，图去掉文本块后交给建卡，读完删掉', async () => {
    stored(cardPng({ name: 'Rei', personality: 'calm' }))
    await importTavernCard('clerk_1', { fileName: 'rei.png', storageKey: KEY })

    expect(mockGetObject).toHaveBeenCalledWith({
      key: KEY,
      maxBytes: TAVERN_CARD.UPLOAD_MAX_BYTES,
    })
    const [clerkId, imported, image] = mockCreateImported.mock.calls[0]
    expect(clerkId).toBe('clerk_1')
    expect(imported).toMatchObject({
      name: 'Rei',
      persona: { behavior: 'calm' },
    })
    expect(image.mimeType).toBe('image/png')
    expect(image.data.includes(Buffer.from('chara'))).toBe(false)
    expect(mockDelete).toHaveBeenCalledWith(KEY)
  })

  it('JSON 卡：没有图', async () => {
    stored(
      Buffer.from(
        JSON.stringify({ spec: 'chara_card_v2', data: { name: 'Rei' } }),
      ),
    )
    await importTavernCard('clerk_1', { fileName: 'rei.json', storageKey: KEY })
    expect(mockCreateImported).toHaveBeenCalledWith(
      'clerk_1',
      expect.objectContaining({ name: 'Rei' }),
      null,
    )
  })

  it.each([
    ['坏 JSON', Buffer.from('{oops')],
    ['没有名字', Buffer.from('{"desc":"x"}')],
    ['普通 PNG', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ])(
    '%s：不是卡（带 i18nKey），⛔ 建卡，文件照样删',
    async (_label, buffer) => {
      stored(buffer)
      await expect(
        importTavernCard('clerk_1', { fileName: 'x', storageKey: KEY }),
      ).rejects.toMatchObject({ i18nKey: 'errors.tavernCard.notACard' })
      expect(mockCreateImported).not.toHaveBeenCalled()
      expect(mockDelete).toHaveBeenCalledWith(KEY)
    },
  )

  it('别人的 / 走出目录的 key：⛔ 去读', async () => {
    for (const storageKey of [
      'tavern-imports/user_2/1-abc.png',
      'tavern-imports/user_1/../user_2/x.png',
      'generations/user_1/image/x.png',
    ]) {
      await expect(
        importTavernCard('clerk_1', { fileName: 'x', storageKey }),
      ).rejects.toMatchObject({ i18nKey: 'errors.tavernCard.uploadMissing' })
    }
    expect(mockGetObject).not.toHaveBeenCalled()
  })

  it('超过上限：太大；读不到：没传上去（都删掉）', async () => {
    mockGetObject.mockRejectedValueOnce(
      new Error('R2 object exceeds maximum size of 1 bytes (declared 2).'),
    )
    await expect(
      importTavernCard('clerk_1', { fileName: 'big.png', storageKey: KEY }),
    ).rejects.toMatchObject({ i18nKey: 'errors.tavernCard.tooLarge' })

    mockGetObject.mockRejectedValueOnce(new Error('NoSuchKey'))
    await expect(
      importTavernCard('clerk_1', { fileName: 'gone.png', storageKey: KEY }),
    ).rejects.toMatchObject({ i18nKey: 'errors.tavernCard.uploadMissing' })
    expect(mockDelete).toHaveBeenCalledTimes(2)
  })
})
