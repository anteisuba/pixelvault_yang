import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createDELETE,
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import {
  FAVORITE_LORA_TRIGGER_WORD_MAX_LENGTH,
  type LoraAssetRecord,
} from '@/types'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock('@/services/lora-asset.service', () => ({
  favoriteExternalLora: vi.fn(),
  unfavoriteLora: vi.fn(),
}))

import {
  favoriteExternalLora,
  unfavoriteLora,
} from '@/services/lora-asset.service'

import { DELETE, POST } from './route'

const mockFavoriteExternalLora = vi.mocked(favoriteExternalLora)
const mockUnfavoriteLora = vi.mocked(unfavoriteLora)

const LONG_CIVITAI_TRIGGER_WORD = Array.from(
  { length: 180 },
  (_, index) => `tag_${index}`,
).join(',')

const VALID_FAVORITE_BODY = {
  name: 'Wuthering Waves Daniya',
  triggerWord: LONG_CIVITAI_TRIGGER_WORD,
  loraUrl: 'https://civitai.com/api/download/models/12345',
  type: 'subject',
  baseModelFamily: 'NoobAI',
  provider: 'civitai',
  coverImageUrl: 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/model.jpg',
}

const FAVORITED_RECORD: LoraAssetRecord = {
  id: 'asset_fav_1',
  styleCode: 'pv-c-wuthering-waves-ab12',
  name: VALID_FAVORITE_BODY.name,
  source: 'imported',
  type: 'subject',
  baseModelFamily: VALID_FAVORITE_BODY.baseModelFamily,
  provider: VALID_FAVORITE_BODY.provider,
  triggerWord: VALID_FAVORITE_BODY.triggerWord,
  loraUrl: VALID_FAVORITE_BODY.loraUrl,
  coverImageUrl: VALID_FAVORITE_BODY.coverImageUrl,
  previewImageUrls: [],
  defaultScale: 1,
  isPublic: false,
  isOwn: true,
  createdAt: '2026-05-23T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated('clerk_test_user')
  mockFavoriteExternalLora.mockResolvedValue(FAVORITED_RECORD)
  mockUnfavoriteLora.mockResolvedValue(true)
})

describe('POST /api/lora-assets/favorite', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const response = await POST(
      createPOST('/api/lora-assets/favorite', VALID_FAVORITE_BODY),
    )
    const body = await parseJSON<{ success: boolean }>(response)

    expect(response.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockFavoriteExternalLora).not.toHaveBeenCalled()
  })

  it('accepts long Civitai trigger words when favoriting external LoRAs', async () => {
    expect(LONG_CIVITAI_TRIGGER_WORD.length).toBeGreaterThan(500)

    const response = await POST(
      createPOST('/api/lora-assets/favorite', VALID_FAVORITE_BODY),
    )
    const body = await parseJSON<{ success: boolean; data: LoraAssetRecord }>(
      response,
    )

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.triggerWord).toBe(LONG_CIVITAI_TRIGGER_WORD)
    expect(mockFavoriteExternalLora).toHaveBeenCalledWith('clerk_test_user', {
      ...VALID_FAVORITE_BODY,
      type: 'subject',
    })
  })

  it('rejects unbounded trigger words', async () => {
    const response = await POST(
      createPOST('/api/lora-assets/favorite', {
        ...VALID_FAVORITE_BODY,
        triggerWord: 'x'.repeat(FAVORITE_LORA_TRIGGER_WORD_MAX_LENGTH + 1),
      }),
    )
    const body = await parseJSON<{ success: boolean; errorCode?: string }>(
      response,
    )

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.errorCode).toBe('INVALID_BODY')
    expect(mockFavoriteExternalLora).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/lora-assets/favorite', () => {
  it('requires assetId', async () => {
    const response = await DELETE(createDELETE('/api/lora-assets/favorite'))
    const body = await parseJSON<{ success: boolean; errorCode?: string }>(
      response,
    )

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.errorCode).toBe('INVALID_BODY')
    expect(mockUnfavoriteLora).not.toHaveBeenCalled()
  })
})
