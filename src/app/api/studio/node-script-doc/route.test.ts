import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/node/node-script-doc.service', () => ({
  createNodeScriptDoc: vi.fn(),
}))

import { createNodeScriptDoc } from '@/services/node/node-script-doc.service'
import type { NodeScriptDocResponseData } from '@/types/script-doc'

import { POST } from './route'

const RESPONSE: NodeScriptDocResponseData = {
  kind: 'scriptDoc',
  scriptDoc: {
    title: 'Night Garden Signal',
    logline: 'A botanist chases a signal through a garden.',
    roles: [],
    shots: [],
  },
}

const VALID_BODY = {
  messages: [{ role: 'user', content: 'a botanist finds a signal' }],
  locale: 'en',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRateLimitAllowed()
})

describe('POST /api/studio/node-script-doc', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const response = await POST(
      createPOST('/api/studio/node-script-doc', VALID_BODY),
    )

    expect(response.status).toBe(401)
    const body = await parseJSON<{ success: boolean }>(response)
    expect(body.success).toBe(false)
  })

  it('returns 400 for invalid request body', async () => {
    mockAuthenticated()

    const response = await POST(
      createPOST('/api/studio/node-script-doc', { locale: 'en' }),
    )

    expect(response.status).toBe(400)
    const body = await parseJSON<{ success: boolean }>(response)
    expect(body.success).toBe(false)
  })

  it('returns the ScriptDoc on success', async () => {
    mockAuthenticated()
    vi.mocked(createNodeScriptDoc).mockResolvedValue(RESPONSE)

    const response = await POST(
      createPOST('/api/studio/node-script-doc', {
        messages: [{ role: 'user', content: 'a botanist finds a signal' }],
        locale: 'zh',
      }),
    )

    expect(response.status).toBe(200)
    const body = await parseJSON(response)
    expect(body).toEqual({ success: true, data: RESPONSE })
    expect(createNodeScriptDoc).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({ locale: 'zh' }),
    )
  })

  it('returns 500 when the service throws an unhandled error', async () => {
    mockAuthenticated()
    vi.mocked(createNodeScriptDoc).mockRejectedValue(new Error('LLM failed'))

    const response = await POST(
      createPOST('/api/studio/node-script-doc', VALID_BODY),
    )

    expect(response.status).toBe(500)
    const body = await parseJSON<{ success: boolean; error: string }>(response)
    expect(body.success).toBe(false)
    expect(body.error).toBeTruthy()
  })
})
