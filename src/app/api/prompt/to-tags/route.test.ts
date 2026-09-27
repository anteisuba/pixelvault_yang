import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockAuthenticated,
  mockUnauthenticated,
  mockRateLimitAllowed,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/kernel/prompt-to-tags.service', () => ({
  translatePromptToTags: vi.fn(),
}))

import { ApiRequestError } from '@/lib/errors'
import { translatePromptToTags } from '@/services/kernel/prompt-to-tags.service'
import { POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mockRateLimitAllowed()
})

describe('POST /api/prompt/to-tags', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await POST(
      createPOST('/api/prompt/to-tags', { prompt: 'a girl in the rain' }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for an empty prompt', async () => {
    mockAuthenticated()
    const res = await POST(createPOST('/api/prompt/to-tags', { prompt: '  ' }))
    expect(res.status).toBe(400)
    expect(translatePromptToTags).not.toHaveBeenCalled()
  })

  it('returns the translated tags', async () => {
    mockAuthenticated()
    vi.mocked(translatePromptToTags).mockResolvedValue({
      tags: '1girl, solo, rain',
    })
    const res = await POST(
      createPOST('/api/prompt/to-tags', {
        prompt: 'a girl in the rain',
        modelId: 'nai-diffusion-4-5-full',
      }),
    )
    expect(res.status).toBe(200)
    expect(await parseJSON(res)).toEqual({
      success: true,
      data: { tags: '1girl, solo, rain' },
    })
    expect(translatePromptToTags).toHaveBeenCalledWith('clerk_test_user', {
      prompt: 'a girl in the rain',
      modelId: 'nai-diffusion-4-5-full',
    })
  })

  it('passes the unusable-output error through with its i18n key', async () => {
    mockAuthenticated()
    vi.mocked(translatePromptToTags).mockRejectedValue(
      new ApiRequestError(
        'PROMPT_TAGS_UNUSABLE',
        502,
        'errors.promptTags.unusable',
        'The model did not return a tag list',
      ),
    )
    const res = await POST(
      createPOST('/api/prompt/to-tags', { prompt: 'a girl in the rain' }),
    )
    expect(res.status).toBe(502)
    expect(await parseJSON(res)).toMatchObject({
      success: false,
      errorCode: 'PROMPT_TAGS_UNUSABLE',
      i18nKey: 'errors.promptTags.unusable',
    })
  })
})
