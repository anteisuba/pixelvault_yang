import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockUnauthenticated,
} from '@/test/api-helpers'
import { ApiKeyError } from '@/lib/errors'

vi.mock('@/services/image/image-edit.service', () => ({
  streamImageEdit: vi.fn(),
}))
import { streamImageEdit } from '@/services/image/image-edit.service'
import { POST } from './route'

const body = {
  action: 'inpaint',
  imageUrl: 'https://example.com/source.png',
  maskImageUrl: 'data:image/png;base64,mask',
  prompt: 'Change the sky',
  modelId: 'gpt-image-2.5-sunburst',
  options: { quality: 'max', preview: true },
}

describe('image edit stream route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockRateLimitAllowed()
  })
  it('requires authentication', async () => {
    mockUnauthenticated()
    expect(
      (await POST(createPOST('/api/image/edit-stream', body))).status,
    ).toBe(401)
    expect(streamImageEdit).not.toHaveBeenCalled()
  })
  it('rejects unsupported quality before invoking generation', async () => {
    expect(
      (
        await POST(
          createPOST('/api/image/edit-stream', {
            ...body,
            options: { quality: 'ultra' },
          }),
        )
      ).status,
    ).toBe(400)
    expect(streamImageEdit).not.toHaveBeenCalled()
  })
  it('returns the authenticated service stream', async () => {
    vi.mocked(streamImageEdit).mockResolvedValue(
      new Response('event: open\ndata: {}\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )
    const response = await POST(createPOST('/api/image/edit-stream', body))
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(streamImageEdit).toHaveBeenCalledWith(
      expect.any(String),
      body,
      expect.any(AbortSignal),
    )
  })
  it('preserves a missing-key failure before opening a stream', async () => {
    vi.mocked(streamImageEdit).mockRejectedValue(
      new ApiKeyError('missing', 'Missing key'),
    )
    const response = await POST(createPOST('/api/image/edit-stream', body))
    expect(response.status).toBe(400)
  })
})
