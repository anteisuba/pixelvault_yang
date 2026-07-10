import { afterEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import {
  submit3DAPI,
  submitLongVideoAPI,
  submitVideoAPI,
  uploadImageFileAPI,
} from '@/lib/api-client/generation'

const STRUCTURED_ERROR_PAYLOAD = {
  error: 'Provider rejected the request',
  errorCode: 'content_filtered',
  i18nKey: 'errors.provider.contentFiltered',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubStructuredErrorFetch() {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(STRUCTURED_ERROR_PAYLOAD), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('generation api-client submit errors', () => {
  it('preserves errorCode and i18nKey from video submit HTTP errors', async () => {
    const fetchMock = stubStructuredErrorFetch()

    const result = await submitVideoAPI({
      modelId: 'seedance-2.0',
      prompt: 'cinematic city flythrough',
      aspectRatio: '16:9',
      duration: 5,
    })

    expect(result).toEqual({
      success: false,
      ...STRUCTURED_ERROR_PAYLOAD,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      API_ENDPOINTS.GENERATE_VIDEO,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('preserves errorCode and i18nKey from 3D submit HTTP errors', async () => {
    const fetchMock = stubStructuredErrorFetch()

    const result = await submit3DAPI({
      modelId: 'hunyuan3d-2.1',
      imageUrl: 'https://cdn.test/source.png',
    })

    expect(result).toEqual({
      success: false,
      ...STRUCTURED_ERROR_PAYLOAD,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      API_ENDPOINTS.GENERATE_3D,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('preserves errorCode and i18nKey from long-video submit HTTP errors', async () => {
    const fetchMock = stubStructuredErrorFetch()

    const result = await submitLongVideoAPI({
      modelId: 'seedance-2.0',
      prompt: 'ten second travel montage',
      aspectRatio: '16:9',
      targetDuration: 10,
    })

    expect(result).toEqual({
      success: false,
      ...STRUCTURED_ERROR_PAYLOAD,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      API_ENDPOINTS.GENERATE_LONG_VIDEO,
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('uploadImageFileAPI direct R2 flow', () => {
  it('prepares, uploads to the presigned R2 URL, then completes the upload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              uploadUrl: 'https://r2.example.com/upload?signature=ok',
              storageKey: 'generations/db_user_123/image/2026-07-07_abc.png',
              publicUrl:
                'https://cdn.example.com/generations/db_user_123/image/2026-07-07_abc.png',
              headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' },
              expiresAt: new Date(Date.now() + 300_000).toISOString(),
              maxBytes: 15 * 1024 * 1024,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              generation: {
                id: 'gen_1',
                url: 'https://cdn.example.com/generations/db_user_123/image/2026-07-07_abc.png',
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' })
    const result = await uploadImageFileAPI(file, {
      note: 'holiday',
      projectId: 'proj-9',
    })

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      API_ENDPOINTS.UPLOAD_IMAGE_DIRECT,
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://r2.example.com/upload?signature=ok',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' },
        body: file,
      },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      API_ENDPOINTS.UPLOAD_IMAGE_DIRECT_COMPLETE,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('does not PUT bytes to R2 when the prepare step fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'too large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' })
    const result = await uploadImageFileAPI(file)

    expect(result).toEqual({ success: false, error: 'too large' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  const preparedR2Response = () =>
    new Response(
      JSON.stringify({
        success: true,
        data: {
          uploadUrl: 'https://r2.example.com/upload?signature=ok',
          storageKey: 'generations/db_user_123/image/2026-07-07_abc.png',
          publicUrl:
            'https://cdn.example.com/generations/db_user_123/image/2026-07-07_abc.png',
          headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' },
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          maxBytes: 15 * 1024 * 1024,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )

  it('tags a thrown R2 PUT (CORS/network) with a localizable reason, not raw "Failed to fetch"', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(preparedR2Response())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' })
    const result = await uploadImageFileAPI(file)

    expect(result.success).toBe(false)
    expect(result.i18nKey).toBe('errors.upload.storageUnreachable')
    // Never advanced to the complete step.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('tags a non-2xx R2 PUT with a localizable reason', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(preparedR2Response())
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' })
    const result = await uploadImageFileAPI(file)

    expect(result.success).toBe(false)
    expect(result.i18nKey).toBe('errors.upload.storageRejected')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
