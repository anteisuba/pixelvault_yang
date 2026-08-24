import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

const mockCreateNodeAssistantStream = vi.fn()
vi.mock('@/services/node/node-assistant.service', () => ({
  createNodeAssistantStream: (...args: unknown[]) =>
    mockCreateNodeAssistantStream(...args),
}))

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { ApiRequestError } from '@/lib/errors'

import { POST } from './route'

/** service 现在交出的是文本增量；成帧（SSE）归路由那一层。 */
async function* createStream(text: string): AsyncIterable<string> {
  yield text
}

const REQUEST_BODY = {
  locale: 'en',
  selectedNodeIds: ['node-1'],
  messages: [{ role: 'user', content: 'hello' }],
  nodes: [
    {
      id: 'node-1',
      type: NODE_TYPE_IDS.composer,
      status: NODE_STATUS_IDS.idle,
      title: 'Composer',
      promptExcerpt: 'story idea',
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRateLimitAllowed()
})

describe('POST /api/studio/node-assistant', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const response = await POST(
      createPOST('/api/studio/node-assistant', REQUEST_BODY),
    )

    expect(response.status).toBe(401)
    const body = await parseJSON<{ success: boolean }>(response)
    expect(body.success).toBe(false)
  })

  it('returns 400 for invalid request body', async () => {
    mockAuthenticated()

    const response = await POST(
      createPOST('/api/studio/node-assistant', {
        messages: [],
        nodes: [],
        selectedNodeIds: [],
        locale: 'en',
      }),
    )

    expect(response.status).toBe(400)
    const body = await parseJSON<{ success: boolean }>(response)
    expect(body.success).toBe(false)
  })

  it('returns an SSE frame stream on success，且 open 帧排在最前', async () => {
    mockAuthenticated()
    mockCreateNodeAssistantStream.mockResolvedValue(createStream('ok'))

    const response = await POST(
      createPOST('/api/studio/node-assistant', REQUEST_BODY),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/event-stream')
    const body = await response.text()
    // ⭐ `open` 必须是第一帧：它产生的字节就是响应头得以 flush 的原因。挪到模型
    //    开口之后 = 把 2026-08-24 那个 504 又请回来。
    expect(body.indexOf('event: open')).toBe(0)
    expect(body).toContain('event: text\ndata: {"delta":"ok"}')
    expect(body).toContain('event: done')
    expect(mockCreateNodeAssistantStream).toHaveBeenCalledWith(
      'clerk_test_user',
      REQUEST_BODY,
    )
  })

  it('returns 500 when the service throws', async () => {
    mockAuthenticated()
    mockCreateNodeAssistantStream.mockRejectedValue(new Error('provider down'))

    const response = await POST(
      createPOST('/api/studio/node-assistant', REQUEST_BODY),
    )

    expect(response.status).toBe(500)
    const body = await parseJSON<{ success: boolean; error: string }>(response)
    expect(body.success).toBe(false)
    expect(body.error).toBeTruthy()
  })

  it('preserves structured provider errors for client localization', async () => {
    mockAuthenticated()
    mockCreateNodeAssistantStream.mockRejectedValue(
      new ApiRequestError(
        'PROVIDER_CONTEXT_LIMIT_EXCEEDED',
        400,
        'errors.provider.contextLimitExceeded',
        'The model context limit was exceeded.',
      ),
    )

    const response = await POST(
      createPOST('/api/studio/node-assistant', REQUEST_BODY),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'The model context limit was exceeded.',
      errorCode: 'PROVIDER_CONTEXT_LIMIT_EXCEEDED',
      i18nKey: 'errors.provider.contextLimitExceeded',
    })
  })
})
