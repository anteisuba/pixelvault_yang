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
  inpaintImage: vi.fn(),
  persistEditedImage: vi.fn(),
  resolveFalImageEditApiKey: vi.fn(),
}))

import { POST } from './route'
import {
  inpaintImage,
  persistEditedImage,
  resolveFalImageEditApiKey,
} from '@/services/image-edit.service'
import { ensureUser } from '@/services/user.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockInpaintImage = vi.mocked(inpaintImage)
const mockPersistEditedImage = vi.mocked(persistEditedImage)
const mockResolveFalImageEditApiKey = vi.mocked(resolveFalImageEditApiKey)

const VALID_BODY = {
  imageUrl: 'https://example.com/source.png',
  maskImageUrl: 'data:image/png;base64,mask',
  prompt: 'replace the sky',
  negativePrompt: 'low quality',
  apiKeyId: 'key-1',
  sourceGenerationId: 'gen-source',
}

const EDIT_RESULT = {
  imageUrl: 'https://cdn.example.com/inpainted.png',
  width: 1024,
  height: 1024,
}

describe('POST /api/image/inpaint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
    mockResolveFalImageEditApiKey.mockResolvedValue('fal-key')
    mockInpaintImage.mockResolvedValue(EDIT_RESULT)
    mockPersistEditedImage.mockResolvedValue(FAKE_GENERATION)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/image/inpaint', VALID_BODY)

    const res = await POST(req)
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('returns 400 for invalid input', async () => {
    const req = createPOST('/api/image/inpaint', {
      ...VALID_BODY,
      prompt: '',
    })

    const res = await POST(req)
    const json = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(mockInpaintImage).not.toHaveBeenCalled()
  })

  it('returns persisted generation on success', async () => {
    const req = createPOST('/api/image/inpaint', VALID_BODY)

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
    expect(mockInpaintImage).toHaveBeenCalledWith({
      imageUrl: VALID_BODY.imageUrl,
      maskImageUrl: VALID_BODY.maskImageUrl,
      prompt: VALID_BODY.prompt,
      apiKey: 'fal-key',
      negativePrompt: VALID_BODY.negativePrompt,
    })
    expect(mockPersistEditedImage).toHaveBeenCalledWith({
      userId: FAKE_DB_USER.id,
      resultUrl: EDIT_RESULT.imageUrl,
      sourceGenerationId: VALID_BODY.sourceGenerationId,
      action: 'inpaint',
      width: EDIT_RESULT.width,
      height: EDIT_RESULT.height,
    })
  })
})
