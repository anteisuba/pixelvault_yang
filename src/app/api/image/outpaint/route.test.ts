import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createPOST,
  FAKE_DB_USER,
  FAKE_GENERATION,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/services/image-edit.service', () => ({
  outpaintImage: vi.fn(),
  persistEditedImage: vi.fn(),
  resolveFalImageEditApiKey: vi.fn(),
}))

import { POST } from './route'
import {
  outpaintImage,
  persistEditedImage,
  resolveFalImageEditApiKey,
} from '@/services/image-edit.service'
import { ensureUser } from '@/services/user.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockOutpaintImage = vi.mocked(outpaintImage)
const mockPersistEditedImage = vi.mocked(persistEditedImage)
const mockResolveFalImageEditApiKey = vi.mocked(resolveFalImageEditApiKey)

const VALID_BODY = {
  imageUrl: 'https://example.com/source.png',
  padding: { top: 64, right: 128, bottom: 64, left: 128 },
  prompt: 'extend the background',
  negativePrompt: 'blur',
  apiKeyId: 'key-1',
  sourceGenerationId: 'gen-source',
}

const EDIT_RESULT = {
  imageUrl: 'https://cdn.example.com/outpainted.png',
  width: 1280,
  height: 1152,
}

describe('POST /api/image/outpaint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
    mockResolveFalImageEditApiKey.mockResolvedValue('fal-key')
    mockOutpaintImage.mockResolvedValue(EDIT_RESULT)
    mockPersistEditedImage.mockResolvedValue(FAKE_GENERATION)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/image/outpaint', VALID_BODY)

    const res = await POST(req)
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('returns 400 for invalid padding', async () => {
    const req = createPOST('/api/image/outpaint', {
      ...VALID_BODY,
      padding: { ...VALID_BODY.padding, top: 700 },
    })

    const res = await POST(req)
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(mockOutpaintImage).not.toHaveBeenCalled()
  })

  it('returns persisted generation on success', async () => {
    const req = createPOST('/api/image/outpaint', VALID_BODY)

    const res = await POST(req)
    const json = await parseJSON<{
      success: boolean
      data: typeof EDIT_RESULT & { generation: typeof FAKE_GENERATION }
    }>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toMatchObject({
      ...EDIT_RESULT,
      generation: {
        id: FAKE_GENERATION.id,
        url: FAKE_GENERATION.url,
      },
    })
    expect(mockResolveFalImageEditApiKey).toHaveBeenCalledWith(
      FAKE_DB_USER.id,
      'key-1',
    )
    expect(mockOutpaintImage).toHaveBeenCalledWith({
      imageUrl: VALID_BODY.imageUrl,
      padding: VALID_BODY.padding,
      prompt: VALID_BODY.prompt,
      apiKey: 'fal-key',
      negativePrompt: VALID_BODY.negativePrompt,
    })
    expect(mockPersistEditedImage).toHaveBeenCalledWith({
      userId: FAKE_DB_USER.id,
      resultUrl: EDIT_RESULT.imageUrl,
      sourceGenerationId: VALID_BODY.sourceGenerationId,
      action: 'outpaint',
      width: EDIT_RESULT.width,
      height: EDIT_RESULT.height,
    })
  })
})
