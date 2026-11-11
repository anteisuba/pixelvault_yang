// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { downloadRemoteAsset, getErrorPayload } from '@/lib/api-client/shared'
import {
  ApiClientError,
  getThrownErrorFields,
} from '@/lib/api-client/error-fields'

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

  describe('on iPhone', () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>()

    beforeEach(() => {
      vi.stubGlobal('navigator', {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
        platform: 'iPhone',
        maxTouchPoints: 5,
        share,
        canShare: () => true,
      })
    })

    it('fetches our CDN copy and opens the share sheet instead of downloading', async () => {
      share.mockResolvedValue(undefined)
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              success: true,
              data: { downloadUrl: PRESIGNED_URL },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
        .mockResolvedValueOnce(
          new Response('bytes', {
            status: 200,
            headers: { 'Content-Type': 'video/mp4' },
          }),
        )

      const result = await downloadRemoteAsset(ASSET_URL, 'video.mp4')

      expect(result.success).toBe(true)
      expect(fetchMock).toHaveBeenLastCalledWith(
        `${ASSET_URL}?pv-cors=1`,
        expect.objectContaining({ mode: 'cors' }),
      )
      const [shared] = share.mock.calls[0]?.[0].files ?? []
      expect(shared?.name).toBe('video.mp4')
      expect(shared?.type).toBe('video/mp4')
      expect(assign).not.toHaveBeenCalled()
    })

    it('treats a dismissed share sheet as done, not as a failure', async () => {
      share.mockRejectedValue(new DOMException('cancel', 'AbortError'))
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
      expect(share).toHaveBeenCalledTimes(1)
    })

    it('falls back to the file download when the CDN copy cannot be read', async () => {
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              success: true,
              data: { downloadUrl: PRESIGNED_URL },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
        .mockRejectedValueOnce(new TypeError('Load failed'))

      const result = await downloadRemoteAsset(ASSET_URL, 'video.mp4')

      expect(result.success).toBe(true)
      expect(share).not.toHaveBeenCalled()
      expect(assign).toHaveBeenCalledWith(PRESIGNED_URL)
    })

    it('keeps audio as a file download', async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { downloadUrl: PRESIGNED_URL },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      await downloadRemoteAsset(ASSET_URL, 'voice.mp3')

      expect(share).not.toHaveBeenCalled()
      expect(assign).toHaveBeenCalledWith(PRESIGNED_URL)
    })
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
    )
    expect(payload).not.toHaveProperty('missingKey')
  })
})

describe('getErrorPayload：没有 JSON 原因时按 HTTP 状态打标（o-errors 第二轮）', () => {
  it.each([
    [401, 'TRANSPORT_SESSION_EXPIRED', 'errors.transport.sessionExpired'],
    [404, 'TRANSPORT_NOT_FOUND', 'errors.transport.notFound'],
    [413, 'TRANSPORT_TOO_LARGE', 'errors.transport.tooLarge'],
    [502, 'TRANSPORT_UNAVAILABLE', 'errors.transport.unavailable'],
    [504, 'TRANSPORT_TIMEOUT', 'errors.transport.timeout'],
  ])('空体 %i → %s', async (status, errorCode, i18nKey) => {
    const payload = await getErrorPayload(new Response('', { status }))
    expect(payload).toEqual({ error: `HTTP ${status}`, errorCode, i18nKey })
  })

  it('HTML 错页（网关）不当成服务商原话', async () => {
    const payload = await getErrorPayload(
      new Response('<html>An error occurred</html>', { status: 502 }),
    )
    expect(payload.i18nKey).toBe('errors.transport.unavailable')
  })

  it('服务端给了 JSON 原因就照用，不改写', async () => {
    const payload = await getErrorPayload(
      new Response(
        JSON.stringify({
          error: 'Please sign in',
          errorCode: 'UNAUTHORIZED',
          i18nKey: 'errors.auth.unauthorized',
        }),
        { status: 401 },
      ),
    )
    expect(payload).toEqual({
      error: 'Please sign in',
      errorCode: 'UNAUTHORIZED',
      i18nKey: 'errors.auth.unauthorized',
    })
  })
})

describe('getThrownErrorFields', () => {
  it('浏览器断网 → 网络连不上', () => {
    expect(getThrownErrorFields(new TypeError('Failed to fetch'))).toEqual({
      error: 'Failed to fetch',
      errorCode: 'TRANSPORT_NETWORK',
      i18nKey: 'errors.transport.network',
    })
  })

  it('前台等待上限到了 → 超时，不是「服务商超时」', () => {
    const err = new DOMException('The operation timed out.', 'TimeoutError')
    expect(getThrownErrorFields(err).errorCode).toBe('TRANSPORT_TIMEOUT')
  })

  it('ApiClientError 原样带回字段', () => {
    const err = new ApiClientError({
      error: 'HTTP 404',
      errorCode: 'TRANSPORT_NOT_FOUND',
      i18nKey: 'errors.transport.notFound',
    })
    expect(getThrownErrorFields(err).i18nKey).toBe('errors.transport.notFound')
  })

  it('我们自己的程序异常 → 意外错误', () => {
    expect(getThrownErrorFields(new SyntaxError('Unexpected token <'))).toEqual(
      {
        error: 'Unexpected token <',
        errorCode: 'CLIENT_ERROR',
        i18nKey: 'errors.common.unexpected',
      },
    )
  })
})
