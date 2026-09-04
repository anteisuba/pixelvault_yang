import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import { uploadLoraTrainingImageAPI } from '@/lib/api-client/lora-training'

const STORAGE_KEY = 'lora-training/user-1/1-abc.png'
const UPLOAD_URL = 'https://r2.example.com/upload?signature=ok'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function pngFile(): File {
  return new File([new Uint8Array(2048)], 'pick.png', { type: 'image/png' })
}

describe('uploadLoraTrainingImageAPI', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('presigns, PUTs to R2, then confirms', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            uploadUrl: UPLOAD_URL,
            storageKey: STORAGE_KEY,
            headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' },
            maxBytes: 8 * 1024 * 1024,
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            url: `https://cdn.test.com/${STORAGE_KEY}`,
            storageKey: STORAGE_KEY,
            mimeType: 'image/png',
            width: 512,
            height: 768,
            sizeBytes: 2048,
          },
        }),
      )

    const file = pngFile()
    const result = await uploadLoraTrainingImageAPI(file)

    expect(result.success).toBe(true)
    expect(result.data?.storageKey).toBe(STORAGE_KEY)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      API_ENDPOINTS.LORA_TRAINING_UPLOADS,
    )
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ mimeType: 'image/png', sizeBytes: 2048 }),
    )

    // The only request carrying bytes goes straight to R2.
    expect(fetchMock.mock.calls[1]?.[0]).toBe(UPLOAD_URL)
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'PUT',
      body: file,
    })

    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      API_ENDPOINTS.LORA_TRAINING_UPLOADS_COMPLETE,
    )
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBe(
      JSON.stringify({ storageKey: STORAGE_KEY, sizeBytes: 2048 }),
    )
  })

  it('stops at the prepare failure without touching storage', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, error: 'Too many requests' }, 429),
    )

    const result = await uploadLoraTrainingImageAPI(pngFile())

    expect(result).toEqual({ success: false, error: 'Too many requests' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports an R2 rejection without confirming', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            uploadUrl: UPLOAD_URL,
            storageKey: STORAGE_KEY,
            headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' },
            maxBytes: 8 * 1024 * 1024,
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 412 }))

    const result = await uploadLoraTrainingImageAPI(pngFile())

    expect(result.success).toBe(false)
    expect(result.error).toContain('412')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('surfaces the confirm-step error message', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            uploadUrl: UPLOAD_URL,
            storageKey: STORAGE_KEY,
            headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' },
            maxBytes: 8 * 1024 * 1024,
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse(
          { success: false, error: 'Unsupported or corrupted image file' },
          400,
        ),
      )

    const result = await uploadLoraTrainingImageAPI(pngFile())

    expect(result).toEqual({
      success: false,
      error: 'Unsupported or corrupted image file',
    })
  })
})
