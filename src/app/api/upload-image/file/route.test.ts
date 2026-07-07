import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FAKE_GENERATION,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { USER_UPLOAD_MAX_BYTES } from '@/constants/uploads'

vi.mock('server-only', () => ({}))

vi.mock('@/services/upload-image.service', () => ({
  uploadUserImageFile: vi.fn(),
}))

import { uploadUserImageFile } from '@/services/upload-image.service'
import { GenerateImageServiceError } from '@/services/image/generate-image.service'

import { POST } from './route'

const mockUpload = vi.mocked(uploadUserImageFile)

function createUploadPOST(formData: FormData) {
  return new NextRequest(
    new URL('/api/upload-image/file', 'http://localhost:3000'),
    { method: 'POST', body: formData },
  )
}

function imageFile(name = 'photo.png', bytes = 1024, type = 'image/png'): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

interface ErrorBody {
  success: false
  error?: string
  errorCode?: string
}

describe('POST /api/upload-image/file', () => {
  beforeEach(() => {
    mockUpload.mockReset()
    mockAuthenticated()
  })

  it('rejects unauthenticated requests', async () => {
    mockUnauthenticated()
    const formData = new FormData()
    formData.append('image', imageFile())
    const response = await POST(createUploadPOST(formData))
    expect(response.status).toBe(401)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('short-circuits oversized payloads from the Content-Length pre-check', async () => {
    const oversized = new NextRequest(
      new URL('/api/upload-image/file', 'http://localhost:3000'),
      {
        method: 'POST',
        body: 'placeholder',
        headers: { 'content-length': String(USER_UPLOAD_MAX_BYTES * 2) },
      },
    )
    const response = await POST(oversized)
    expect(response.status).toBe(413)
    const body = await parseJSON<ErrorBody>(response)
    expect(body).toMatchObject({ success: false, errorCode: 'IMAGE_TOO_LARGE' })
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('rejects requests without an image file', async () => {
    const response = await POST(createUploadPOST(new FormData()))
    expect(response.status).toBe(400)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('uploads on the happy path and returns the generation', async () => {
    mockUpload.mockResolvedValue({
      ...FAKE_GENERATION,
      url: 'https://cdn.example.com/r2/photo.png',
    })

    const formData = new FormData()
    formData.append('image', imageFile('photo.png', 2048))
    formData.append('note', 'a note')
    formData.append('projectId', 'proj-1')
    const response = await POST(createUploadPOST(formData))

    expect(response.status).toBe(200)
    const body = await parseJSON<{
      success: true
      data: { generation: { url: string } }
    }>(response)
    expect(body.success).toBe(true)
    expect(body.data.generation.url).toBe(
      'https://cdn.example.com/r2/photo.png',
    )
    expect(mockUpload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        claimedMimeType: 'image/png',
        note: 'a note',
        projectId: 'proj-1',
      }),
    )
    // The service receives raw bytes, never a base64 data URL.
    const [, input] = mockUpload.mock.calls[0]
    expect(Buffer.isBuffer(input.fileBuffer)).toBe(true)
  })

  it('maps a service validation error to its status code', async () => {
    mockUpload.mockRejectedValue(
      new GenerateImageServiceError('PROVIDER_ERROR', 'File too large', 400),
    )
    const formData = new FormData()
    formData.append('image', imageFile())
    const response = await POST(createUploadPOST(formData))
    expect(response.status).toBe(400)
    const body = await parseJSON<ErrorBody>(response)
    expect(body).toMatchObject({ success: false, error: 'File too large' })
  })

  it('returns 500 when the upload service throws unexpectedly', async () => {
    mockUpload.mockRejectedValue(new Error('R2 down'))
    const formData = new FormData()
    formData.append('image', imageFile())
    const response = await POST(createUploadPOST(formData))
    expect(response.status).toBe(500)
    const body = await parseJSON<ErrorBody>(response)
    expect(body).toMatchObject({ success: false })
  })
})
