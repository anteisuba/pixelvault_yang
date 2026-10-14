import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockCreateImported = vi.fn()
vi.mock('@/services/cards/character-card.service', () => ({
  createImportedCharacterCard: (...a: unknown[]) => mockCreateImported(...a),
}))

import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import { importTavernCard } from '@/services/cards/tavern-card-import.service'

function dataUrl(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString('base64')}`
}

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

describe('importTavernCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateImported.mockResolvedValue({ id: 'card_new' })
  })

  it('PNG 卡：解析落格，图去掉文本块后交给建卡', async () => {
    await importTavernCard('clerk_1', {
      fileName: 'rei.png',
      data: dataUrl('image/png', cardPng({ name: 'Rei', personality: 'calm' })),
    })

    const [clerkId, imported, image] = mockCreateImported.mock.calls[0]
    expect(clerkId).toBe('clerk_1')
    expect(imported).toMatchObject({
      name: 'Rei',
      persona: { behavior: 'calm' },
    })
    expect(image.mimeType).toBe('image/png')
    expect(Buffer.isBuffer(image.data)).toBe(true)
    expect(image.data.includes(Buffer.from('chara'))).toBe(false)
  })

  it('JSON 卡：没有图', async () => {
    await importTavernCard('clerk_1', {
      fileName: 'rei.json',
      data: dataUrl(
        'application/json',
        Buffer.from(
          JSON.stringify({ spec: 'chara_card_v2', data: { name: 'Rei' } }),
        ),
      ),
    })

    expect(mockCreateImported).toHaveBeenCalledWith(
      'clerk_1',
      expect.objectContaining({ name: 'Rei' }),
      null,
    )
  })

  it.each([
    ['坏 JSON', dataUrl('application/json', Buffer.from('{oops'))],
    ['没有名字', dataUrl('application/json', Buffer.from('{"desc":"x"}'))],
    ['普通 PNG', dataUrl('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))],
  ])('%s：不是卡（带 i18nKey），⛔ 不建卡', async (_label, data) => {
    await expect(
      importTavernCard('clerk_1', { fileName: 'x', data }),
    ).rejects.toMatchObject({ i18nKey: 'errors.tavernCard.notACard' })
    expect(mockCreateImported).not.toHaveBeenCalled()
  })

  it('超过上限：太大（带 i18nKey）', async () => {
    const big = Buffer.alloc(TAVERN_CARD.MAX_FILE_BYTES + 1)
    await expect(
      importTavernCard('clerk_1', {
        fileName: 'big.json',
        data: dataUrl('application/json', big),
      }),
    ).rejects.toMatchObject({ i18nKey: 'errors.tavernCard.tooLarge' })
  })
})
