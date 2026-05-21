import { beforeEach, describe, expect, it, vi } from 'vitest'

const { toastMock, compressImageToLimitMock, ImageCompressionErrorStub } =
  vi.hoisted(() => {
    class ImageCompressionErrorStub extends Error {
      constructor(
        public readonly code:
          | 'UNSUPPORTED_FORMAT'
          | 'DECODE_FAILED'
          | 'CANNOT_COMPRESS_ENOUGH',
        message: string,
      ) {
        super(message)
        this.name = 'ImageCompressionError'
      }
    }
    return {
      toastMock: {
        success: vi.fn(),
        error: vi.fn(),
        message: vi.fn(),
        loading: vi.fn(() => 'loading-id'),
        dismiss: vi.fn(),
      },
      compressImageToLimitMock: vi.fn(),
      ImageCompressionErrorStub,
    }
  })

vi.mock('sonner', () => ({ toast: toastMock }))

vi.mock('@/lib/compress-image', () => ({
  compressImageToLimit: compressImageToLimitMock,
  ImageCompressionError: ImageCompressionErrorStub,
}))

import { prepareImageUpload } from '@/lib/prepare-image-upload'

function makeFile(name: string, type: string, size: number): File {
  const file = new File(['stub'], name, { type })
  Object.defineProperty(file, 'size', { value: size, configurable: true })
  return file
}

const messages = {
  compressing: 'Compressing…',
  compressed: ({ from, to }: { from: string; to: string }) =>
    `Compressed ${from} → ${to}`,
  gifTooLarge: 'GIF too large',
  tooLarge: 'File too large',
}

const FIVE_MB = 5 * 1024 * 1024

beforeEach(() => {
  vi.clearAllMocks()
})

describe('prepareImageUpload', () => {
  it('returns the original file untouched when it already fits under the cap', async () => {
    const file = makeFile('small.png', 'image/png', 1024)

    const result = await prepareImageUpload(file, {
      maxBytes: FIVE_MB,
      messages,
    })

    expect(result).toBe(file)
    expect(compressImageToLimitMock).not.toHaveBeenCalled()
    expect(toastMock.loading).not.toHaveBeenCalled()
    expect(toastMock.message).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('compresses oversized files and announces the size delta', async () => {
    const file = makeFile('big.png', 'image/png', 8 * 1024 * 1024)
    const compressed = makeFile('big.png', 'image/png', 2 * 1024 * 1024)
    compressImageToLimitMock.mockResolvedValue({
      file: compressed,
      originalBytes: 8 * 1024 * 1024,
      compressedBytes: 2 * 1024 * 1024,
      wasCompressed: true,
    })

    const result = await prepareImageUpload(file, {
      maxBytes: FIVE_MB,
      messages,
    })

    expect(result).toBe(compressed)
    expect(toastMock.loading).toHaveBeenCalledWith('Compressing…')
    expect(toastMock.dismiss).toHaveBeenCalledWith('loading-id')
    expect(toastMock.message).toHaveBeenCalledWith('Compressed 8.0 → 2.0')
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('skips the "compressed" message when the compressor reports no work was needed', async () => {
    // wasCompressed=false ⇒ source size was already fine even though the
    // caller-level branch still ran (size==cap edge case, or future tweaks
    // to the cap). Don't spam the user with a misleading delta toast.
    const file = makeFile('boundary.png', 'image/png', 6 * 1024 * 1024)
    compressImageToLimitMock.mockResolvedValue({
      file,
      originalBytes: file.size,
      compressedBytes: file.size,
      wasCompressed: false,
    })

    const result = await prepareImageUpload(file, {
      maxBytes: FIVE_MB,
      messages,
    })

    expect(result).toBe(file)
    expect(toastMock.message).not.toHaveBeenCalled()
  })

  it('surfaces gifTooLarge when the compressor refuses an animated GIF', async () => {
    const file = makeFile('big.gif', 'image/gif', 8 * 1024 * 1024)
    compressImageToLimitMock.mockRejectedValue(
      new ImageCompressionErrorStub('UNSUPPORTED_FORMAT', 'gif'),
    )
    const onError = vi.fn()

    const result = await prepareImageUpload(file, {
      maxBytes: FIVE_MB,
      messages,
      onError,
    })

    expect(result).toBeNull()
    expect(toastMock.error).toHaveBeenCalledWith('GIF too large')
    expect(toastMock.dismiss).toHaveBeenCalledWith('loading-id')
    // onError mirrors the toast for callers that show a persistent banner.
    expect(onError).toHaveBeenCalledWith('GIF too large')
  })

  it('falls back to tooLarge when compression cannot fit the file under the cap', async () => {
    const file = makeFile('huge.png', 'image/png', 50 * 1024 * 1024)
    compressImageToLimitMock.mockRejectedValue(
      new ImageCompressionErrorStub(
        'CANNOT_COMPRESS_ENOUGH',
        'still too big after 8 tries',
      ),
    )

    const result = await prepareImageUpload(file, {
      maxBytes: FIVE_MB,
      messages,
    })

    expect(result).toBeNull()
    expect(toastMock.error).toHaveBeenCalledWith('File too large')
    expect(toastMock.error).not.toHaveBeenCalledWith('GIF too large')
  })

  it('uses tooLarge (not gifTooLarge) for non-ImageCompressionError exceptions', async () => {
    // A defensive guard — if compressImageToLimit ever throws a plain Error
    // (e.g. canvas API blew up), we still want the user to see the generic
    // size error rather than a misleading GIF message.
    const file = makeFile('weird.png', 'image/png', 8 * 1024 * 1024)
    compressImageToLimitMock.mockRejectedValue(new Error('canvas exploded'))

    const result = await prepareImageUpload(file, {
      maxBytes: FIVE_MB,
      messages,
    })

    expect(result).toBeNull()
    expect(toastMock.error).toHaveBeenCalledWith('File too large')
  })

  it('does not call onError when the file does not need compression', async () => {
    const file = makeFile('small.png', 'image/png', 1024)
    const onError = vi.fn()

    await prepareImageUpload(file, {
      maxBytes: FIVE_MB,
      messages,
      onError,
    })

    expect(onError).not.toHaveBeenCalled()
  })
})
