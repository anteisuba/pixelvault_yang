import { afterEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import {
  chatPromptAssistantAPI,
  submit3DAPI,
  submitLongVideoAPI,
  submitVideoAPI,
  uploadAudioFileAPI,
  uploadImageFileAPI,
  uploadVideoFileAPI,
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
  it('preserves structured prompt-assistant errors for localized UI copy', async () => {
    const fetchMock = stubStructuredErrorFetch()

    const result = await chatPromptAssistantAPI({
      messages: [{ role: 'user', content: 'Improve this prompt' }],
    })

    expect(result).toEqual({
      success: false,
      ...STRUCTURED_ERROR_PAYLOAD,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      API_ENDPOINTS.PROMPT_ASSISTANT,
      expect.objectContaining({ method: 'POST' }),
    )
  })

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

  // S4（2026-07-27，canvas-image-card.md §3 硬要求①）: when a caller passes
  // `onProgress`, the R2 PUT step must go over XHR (for real upload-progress
  // events) instead of `fetch`. A minimal fake XHR stands in for the browser
  // API — jsdom's real XMLHttpRequest would attempt a genuine network call.
  class FakeXHR {
    static instances: FakeXHR[] = []
    method = ''
    url = ''
    status = 200
    requestHeaders: Record<string, string> = {}
    upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
      onprogress: null,
    }
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    onabort: (() => void) | null = null
    private aborted = false

    open(method: string, url: string) {
      this.method = method
      this.url = url
    }

    setRequestHeader(key: string, value: string) {
      this.requestHeaders[key] = value
    }

    send() {
      FakeXHR.instances.push(this)
    }

    abort() {
      this.aborted = true
      this.onabort?.()
    }

    // Test helper — not part of the real XHR surface — to drive the fake
    // through a successful upload from outside.
    resolve(status: number) {
      if (this.aborted) return
      this.status = status
      this.onload?.()
    }
  }

  // The prepare step is `await fetch(...)` + `await response.json()` before
  // `putFileWithProgress` ever constructs an XHR — a fixed tick count is
  // fragile, so poll microtasks until the fake actually shows up (all
  // synchronous/microtask work, no real timers, so this settles immediately).
  async function waitForFakeXhr(): Promise<FakeXHR> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (FakeXHR.instances.length > 0) return FakeXHR.instances[0]
      await Promise.resolve()
    }
    throw new Error('XHR was never constructed')
  }

  it('reports real upload progress over XHR when onProgress is provided, and every other caller keeps using fetch untouched', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(preparedR2Response())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              generation: { id: 'gen_3', url: 'https://cdn.example.com/y.png' },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    FakeXHR.instances = []
    vi.stubGlobal('XMLHttpRequest', FakeXHR as unknown as typeof XMLHttpRequest)

    const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' })
    const progressUpdates: number[] = []
    const resultPromise = uploadImageFileAPI(file, {
      onProgress: (percent) => progressUpdates.push(percent),
    })

    const xhr = await waitForFakeXhr()
    expect(xhr.method).toBe('PUT')
    expect(xhr.url).toBe('https://r2.example.com/upload?signature=ok')
    xhr.upload.onprogress?.({
      lengthComputable: true,
      loaded: 50,
      total: 100,
    } as ProgressEvent)
    xhr.upload.onprogress?.({
      lengthComputable: true,
      loaded: 100,
      total: 100,
    } as ProgressEvent)
    xhr.resolve(200)

    const result = await resultPromise

    expect(result.success).toBe(true)
    expect(progressUpdates).toEqual([50, 100])
    // Only the two JSON round trips (prepare + complete) went through fetch —
    // the byte-carrying PUT went over XHR instead.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('lets the caller abort an in-flight XHR upload via signal', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(preparedR2Response())
    vi.stubGlobal('fetch', fetchMock)
    FakeXHR.instances = []
    vi.stubGlobal('XMLHttpRequest', FakeXHR as unknown as typeof XMLHttpRequest)

    const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' })
    const controller = new AbortController()
    const resultPromise = uploadImageFileAPI(file, {
      onProgress: () => {},
      signal: controller.signal,
    })

    await waitForFakeXhr()
    controller.abort()

    const result = await resultPromise
    expect(result.success).toBe(false)
    // Never reached the complete step.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('uploadVideoFileAPI direct R2 flow', () => {
  it('prepares, uploads, and completes a video as an asset', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              uploadUrl: 'https://r2.example.com/video?signature=ok',
              storageKey: 'generations/db_user_123/video/2026-08-29_abc.mp4',
              publicUrl: 'https://cdn.example.com/video.mp4',
              headers: { 'Content-Type': 'video/mp4', 'If-None-Match': '*' },
              expiresAt: new Date(Date.now() + 300_000).toISOString(),
              maxBytes: 50 * 1024 * 1024,
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
                id: 'video-gen-1',
                outputType: 'VIDEO',
                url: 'https://cdn.example.com/video.mp4',
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['video-bytes'], 'clip.mp4', { type: 'video/mp4' })
    const result = await uploadVideoFileAPI(file, {
      width: 1920,
      height: 1080,
      duration: 8.5,
    })

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      API_ENDPOINTS.UPLOAD_VIDEO_DIRECT,
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://r2.example.com/video?signature=ok',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4', 'If-None-Match': '*' },
        body: file,
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      API_ENDPOINTS.UPLOAD_VIDEO_DIRECT_COMPLETE,
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('uploadAudioFileAPI direct R2 flow', () => {
  it('prepares, uploads, and completes audio as an asset', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              uploadUrl: 'https://r2.example.com/audio?signature=ok',
              storageKey: 'generations/db_user_123/audio/2026-08-30_abc.mp3',
              publicUrl: 'https://cdn.example.com/audio.mp3',
              headers: { 'Content-Type': 'audio/mpeg', 'If-None-Match': '*' },
              expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
              maxBytes: 5 * 1024 * 1024 * 1024,
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
                id: 'audio-gen-1',
                outputType: 'AUDIO',
                url: 'https://cdn.example.com/audio.mp3',
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['audio-bytes'], 'track.mp3', {
      type: 'audio/mpeg',
    })
    const result = await uploadAudioFileAPI(file, { duration: 120.5 })

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      API_ENDPOINTS.UPLOAD_AUDIO_DIRECT,
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://r2.example.com/audio?signature=ok',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'audio/mpeg', 'If-None-Match': '*' },
        body: file,
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      API_ENDPOINTS.UPLOAD_AUDIO_DIRECT_COMPLETE,
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
