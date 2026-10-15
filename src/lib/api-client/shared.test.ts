import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { downloadRemoteAsset, getErrorPayload } from '@/lib/api-client/shared'

const ASSET_URL = 'https://cdn.test.com/generations/video.mp4'
const PRESIGNED_URL =
  'https://account.r2.cloudflarestorage.com/bucket/generations/video.mp4?X-Amz-Signature=abc'

describe('downloadRemoteAsset', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const assign = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    // jsdom's real `location.assign` throws "Not implemented".
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('navigates to the presigned URL when the endpoint answers with JSON', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { downloadUrl: PRESIGNED_URL } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const result = await downloadRemoteAsset(ASSET_URL, 'video.mp4')

    expect(result.success).toBe(true)
    expect(assign).toHaveBeenCalledWith(PRESIGNED_URL)
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/download?url=${encodeURIComponent(ASSET_URL)}&filename=video.mp4`,
    )
  })

  it('fails cleanly when the JSON envelope carries no URL', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await downloadRemoteAsset(ASSET_URL, 'video.mp4')

    expect(result.success).toBe(false)
    expect(assign).not.toHaveBeenCalled()
  })

  it('falls back to a blob download for a proxied provider stream', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    })
    fetchMock.mockResolvedValue(
      new Response('bytes', {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    )

    const result = await downloadRemoteAsset(
      'https://v3b.fal.media/files/b/x/upscaled.png',
      'upscaled.png',
    )

    expect(result.success).toBe(true)
    expect(createObjectURL).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
    expect(assign).not.toHaveBeenCalled()
  })

  it('surfaces the endpoint error payload', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: 'Download URL is not allowed',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const result = await downloadRemoteAsset(
      'https://example.com/video.mp4',
      'video.mp4',
    )

    expect(result).toEqual({
      success: false,
      error: 'Download URL is not allowed',
      errorCode: undefined,
      i18nKey: undefined,
    })
    expect(assign).not.toHaveBeenCalled()
  })
})

describe('getErrorPayload', () => {
  it('带上 missingKey（选定的助手模型缺 key 时）', async () => {
    const payload = await getErrorPayload(
      new Response(
        JSON.stringify({
          success: false,
          error: 'no key',
          errorCode: 'ASSISTANT_MODEL_KEY_MISSING',
          missingKey: {
            adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
            modelId: 'claude-sonnet-5-5',
          },
        }),
        { status: 400 },
      ),
      'fallback',
    )
    expect(payload.missingKey).toEqual({
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      modelId: 'claude-sonnet-5-5',
    })
  })

  it('形状不对的 missingKey 不往下传', async () => {
    const payload = await getErrorPayload(
      new Response(
        JSON.stringify({
          success: false,
          error: 'no key',
          missingKey: { adapterType: 'not-a-provider', modelId: '' },
        }),
        { status: 400 },
      ),
      'fallback',
    )
    expect(payload).not.toHaveProperty('missingKey')
  })
})
