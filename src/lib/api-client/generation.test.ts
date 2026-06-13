import { afterEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import {
  submit3DAPI,
  submitLongVideoAPI,
  submitVideoAPI,
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
