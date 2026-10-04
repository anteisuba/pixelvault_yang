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

vi.mock('@/services/image/image-edit.service', () => ({
  inpaintImage: vi.fn(),
  persistEditedImage: vi.fn(),
  resolveEditApiKey: vi.fn(),
  submitIdeogramImageEdit: vi.fn(),
}))

import { POST } from './route'
import {
  inpaintImage,
  persistEditedImage,
  resolveEditApiKey,
  submitIdeogramImageEdit,
} from '@/services/image/image-edit.service'
import { ensureUser } from '@/services/user.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockInpaintImage = vi.mocked(inpaintImage)
const mockPersistEditedImage = vi.mocked(persistEditedImage)
const mockResolveEditApiKey = vi.mocked(resolveEditApiKey)

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
  it('returns an asynchronous Ideogram job without persisting a second generation', async () => {
    vi.mocked(submitIdeogramImageEdit).mockResolvedValue({
      jobId: 'edit-job',
      requestId: 'edit-job',
    })
    const response = await POST(
      createPOST('/api/image/inpaint', {
        ...VALID_BODY,
        modelId: 'ideogram-4.5',
        referenceImages: ['https://example.com/ref.png'],
      }),
    )
    expect(await parseJSON(response)).toMatchObject({
      data: { jobId: 'edit-job', requestId: 'edit-job' },
    })
    expect(submitIdeogramImageEdit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        apiKeyId: 'key-1',
        modelId: 'ideogram-4.5',
        referenceImages: ['https://example.com/ref.png'],
      }),
    )
    expect(persistEditedImage).not.toHaveBeenCalled()
    expect(inpaintImage).not.toHaveBeenCalled()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
    mockResolveEditApiKey.mockResolvedValue('fal-key')
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
    expect(mockResolveEditApiKey).toHaveBeenCalledWith(
      FAKE_DB_USER.id,
      undefined,
      'key-1',
    )
    expect(mockInpaintImage).toHaveBeenCalledWith({
      imageUrl: VALID_BODY.imageUrl,
      maskImageUrl: VALID_BODY.maskImageUrl,
      prompt: VALID_BODY.prompt,
      apiKey: 'fal-key',
      negativePrompt: VALID_BODY.negativePrompt,
      modelId: undefined,
    })
    expect(mockPersistEditedImage).toHaveBeenCalledWith({
      userId: FAKE_DB_USER.id,
      resultUrl: EDIT_RESULT.imageUrl,
      sourceGenerationId: VALID_BODY.sourceGenerationId,
      action: 'inpaint',
      modelId: undefined,
      prompt: VALID_BODY.prompt,
      width: EDIT_RESULT.width,
      height: EDIT_RESULT.height,
    })
  })
})
