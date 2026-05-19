import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FAKE_DB_USER,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/services/audio-reference.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/audio-reference.service')
  >('@/services/audio-reference.service')
  return {
    ...actual,
    uploadReferenceAudio: vi.fn(),
  }
})

import {
  REFERENCE_AUDIO_MAX_BYTES,
  uploadReferenceAudio,
} from '@/services/audio-reference.service'
import { ensureUser } from '@/services/user.service'

import { POST } from './route'

const mockEnsureUser = vi.mocked(ensureUser)
const mockUpload = vi.mocked(uploadReferenceAudio)

function createUploadPOST(formData: FormData) {
  return new NextRequest(
    new URL('/api/voices/upload-reference', 'http://localhost:3000'),
    {
      method: 'POST',
      body: formData,
    },
  )
}

function audioFile(name: string, bytes: number, type = 'audio/mpeg'): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

describe('POST /api/voices/upload-reference', () => {
  beforeEach(() => {
    mockEnsureUser.mockReset()
    mockUpload.mockReset()
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
  })

  it('rejects unauthenticated requests', async () => {
    mockUnauthenticated()
    const formData = new FormData()
    const file = audioFile('clip.mp3', 1024)
    formData.append('audio', file, file.name)
    const response = await POST(createUploadPOST(formData))
    expect(response.status).toBe(401)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('rejects requests without an audio file', async () => {
    const response = await POST(createUploadPOST(new FormData()))
    expect(response.status).toBe(400)
    const body = await parseJSON(response)
    expect(body).toMatchObject({ success: false })
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('rejects non-audio MIME types with a clear errorCode', async () => {
    const formData = new FormData()
    const file = audioFile('clip.txt', 1024, 'text/plain')
    formData.append('audio', file, file.name)
    const response = await POST(createUploadPOST(formData))
    expect(response.status).toBe(400)
    const body = await parseJSON(response)
    expect(body).toMatchObject({
      success: false,
      errorCode: 'UNSUPPORTED_AUDIO_TYPE',
    })
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('rejects oversized payloads from the Content-Length pre-check', async () => {
    // The route short-circuits before reading the body when Content-Length
    // is obviously over the limit. Build the request manually so we can set
    // the header without staging a 25MB buffer in test memory.
    const oversizedRequest = new NextRequest(
      new URL('/api/voices/upload-reference', 'http://localhost:3000'),
      {
        method: 'POST',
        body: 'placeholder',
        headers: {
          'content-length': String(REFERENCE_AUDIO_MAX_BYTES * 2),
        },
      },
    )
    const response = await POST(oversizedRequest)
    expect(response.status).toBe(413)
    const body = await parseJSON(response)
    expect(body).toMatchObject({
      success: false,
      errorCode: 'AUDIO_TOO_LARGE',
    })
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('uploads on the happy path and returns url + fileName', async () => {
    mockUpload.mockResolvedValue({
      url: 'https://cdn.example.com/audio-references/u1/abc.mp3',
      storageKey: 'audio-references/u1/abc.mp3',
      sizeBytes: 1024,
      mimeType: 'audio/mpeg',
    })

    const formData = new FormData()
    const file = audioFile('voice-sample.mp3', 1024)
    formData.append('audio', file, file.name)
    const response = await POST(createUploadPOST(formData))

    expect(response.status).toBe(200)
    const body = await parseJSON(response)
    expect(body).toMatchObject({
      success: true,
      data: {
        url: 'https://cdn.example.com/audio-references/u1/abc.mp3',
        sizeBytes: 1024,
        mimeType: 'audio/mpeg',
      },
    })
    // The undici FormData parser in Node strips the original file name on
    // some platforms; the route falls back to `reference.{ext}` in that
    // case. We just want `fileName` to be a non-empty string here.
    expect(typeof body.data.fileName).toBe('string')
    expect(body.data.fileName.length).toBeGreaterThan(0)
    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: FAKE_DB_USER.id,
        mimeType: 'audio/mpeg',
      }),
    )
  })

  it('returns 500 when the upload service throws', async () => {
    mockUpload.mockRejectedValue(new Error('R2 down'))

    const formData = new FormData()
    const file = audioFile('clip.mp3', 1024)
    formData.append('audio', file, file.name)
    const response = await POST(createUploadPOST(formData))

    expect(response.status).toBe(500)
    const body = await parseJSON(response)
    expect(body).toMatchObject({ success: false })
  })
})
