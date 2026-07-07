/**
 * Integration tests for the compression glue in ImageEditProvider —
 * verifies that `uploadSourceFile` routes oversized files through
 * `compressImageToLimit` instead of bouncing them, and surfaces the right
 * toast + banner error per failure code.
 *
 * Renders the real provider with a thin consumer component and mocks only
 * the boundary dependencies (compressor, upload API, sonner, next-intl,
 * next/navigation, useInpaint).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// vi.mock factories are hoisted above all other code, so any variable they
// reference must live inside vi.hoisted() — otherwise the factory sees an
// uninitialized binding at module-evaluation time.
const {
  toastMock,
  uploadImageFileAPI,
  compressImageToLimit,
  ImageCompressionError,
} = vi.hoisted(() => {
  class ImageCompressionError extends Error {
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
      loading: vi.fn(() => 'compressing-toast-id'),
      dismiss: vi.fn(),
    },
    uploadImageFileAPI: vi.fn(),
    compressImageToLimit: vi.fn(),
    ImageCompressionError,
  }
})

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, string>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('sonner', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/api-client', () => ({
  uploadImageFileAPI,
}))

vi.mock('@/lib/compress-image', () => ({
  compressImageToLimit,
  ImageCompressionError,
}))

vi.mock('@/hooks/image/use-inpaint', () => ({
  useInpaint: () => ({
    inpaint: vi.fn(),
    outpaint: vi.fn(),
    isLoading: false,
    error: null,
    result: null,
  }),
}))

// Imports below must come AFTER the mocks so the modules under test pick
// them up.
import { ImageEditProvider, useImageEdit } from '@/contexts/image-edit-context'
import { CLIENT_UPLOAD_MAX_BYTES } from '@/constants/uploads'

const EXPECTED_MAX_MB = String(CLIENT_UPLOAD_MAX_BYTES / 1024 / 1024)

function makeFile(name: string, type: string, size: number): File {
  // Build a real File then redefine .size so the test can simulate any
  // byte length without actually allocating that many bytes — FileReader
  // still resolves because we override that path globally below.
  const file = new File(['stub'], name, { type })
  Object.defineProperty(file, 'size', { value: size, configurable: true })
  return file
}

function ConsumerHarness({ file }: { file: File }) {
  const { uploadSourceFile, source, bannerError, isUploadingSource } =
    useImageEdit()
  return (
    <div>
      <button type="button" onClick={() => void uploadSourceFile(file)}>
        Upload
      </button>
      {source && <span data-testid="source-url">{source.imageUrl}</span>}
      {bannerError && <span data-testid="banner-error">{bannerError}</span>}
      {isUploadingSource && <span data-testid="busy">busy</span>}
    </div>
  )
}

function renderWithFile(file: File) {
  return render(
    <ImageEditProvider>
      <ConsumerHarness file={file} />
    </ImageEditProvider>,
  )
}

// jsdom ships a FileReader that handles real Blobs, but our stub files
// only carry a 4-byte 'stub' payload. That's fine — readAsDataURL just
// emits a tiny data URL we never inspect.

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ImageEditProvider — uploadSourceFile compression glue', () => {
  it('uploads small files directly without invoking the compressor', async () => {
    const file = makeFile('small.png', 'image/png', 1024)
    uploadImageFileAPI.mockResolvedValue({
      success: true,
      data: {
        generation: {
          id: 'g-small',
          url: 'https://cdn.example/g-small.png',
          width: 256,
          height: 256,
        },
      },
    })

    renderWithFile(file)
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => {
      expect(uploadImageFileAPI).toHaveBeenCalledTimes(1)
    })
    expect(compressImageToLimit).not.toHaveBeenCalled()
    expect(toastMock.loading).not.toHaveBeenCalled()
    // success path → source state updated, no banner error
    await waitFor(() => {
      expect(screen.getByTestId('source-url').textContent).toContain(
        'g-small.png',
      )
    })
    expect(screen.queryByTestId('banner-error')).toBeNull()
  })

  it('compresses oversized files and forwards the smaller blob to uploadImageFileAPI', async () => {
    const file = makeFile('big.png', 'image/png', 20 * 1024 * 1024)
    const compressedFile = makeFile('big.png', 'image/png', 2 * 1024 * 1024)
    compressImageToLimit.mockResolvedValue({
      file: compressedFile,
      originalBytes: 8 * 1024 * 1024,
      compressedBytes: 2 * 1024 * 1024,
      wasCompressed: true,
    })
    uploadImageFileAPI.mockResolvedValue({
      success: true,
      data: {
        generation: {
          id: 'g-big',
          url: 'https://cdn.example/g-big.png',
          width: 1024,
          height: 1024,
        },
      },
    })

    renderWithFile(file)
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => {
      expect(uploadImageFileAPI).toHaveBeenCalledTimes(1)
    })
    // Compressor was called with the original file + project size cap.
    expect(compressImageToLimit).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ maxBytes: CLIENT_UPLOAD_MAX_BYTES }),
    )
    // Loading toast appeared and was dismissed.
    expect(toastMock.loading).toHaveBeenCalledWith('uploadCompressing')
    expect(toastMock.dismiss).toHaveBeenCalledWith('compressing-toast-id')
    // Informational toast announces the size delta (8.0 → 2.0).
    expect(toastMock.message).toHaveBeenCalledOnce()
    expect(toastMock.message.mock.calls[0][0]).toMatch(/uploadCompressed/)
    expect(toastMock.message.mock.calls[0][0]).toMatch(/"from":"8.0"/)
    expect(toastMock.message.mock.calls[0][0]).toMatch(/"to":"2.0"/)
    // No error path triggered.
    expect(toastMock.error).not.toHaveBeenCalled()
    expect(screen.queryByTestId('banner-error')).toBeNull()
  })

  it('does not show the "compressed X → Y" toast when the file already fit', async () => {
    // wasCompressed=false signals the compressor decided no work was needed
    // (size <= cap). That branch should not surface a noisy toast.
    const file = makeFile('boundary.png', 'image/png', 6 * 1024 * 1024)
    compressImageToLimit.mockResolvedValue({
      file,
      originalBytes: 6 * 1024 * 1024,
      compressedBytes: 6 * 1024 * 1024,
      wasCompressed: false,
    })
    uploadImageFileAPI.mockResolvedValue({
      success: true,
      data: {
        generation: {
          id: 'g-boundary',
          url: 'https://cdn.example/g-boundary.png',
          width: 1,
          height: 1,
        },
      },
    })

    renderWithFile(file)
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => {
      expect(uploadImageFileAPI).toHaveBeenCalledTimes(1)
    })
    expect(toastMock.message).not.toHaveBeenCalled()
  })

  it('rejects oversized GIFs with uploadGifTooLarge and never calls uploadImageFileAPI', async () => {
    const file = makeFile('big.gif', 'image/gif', 20 * 1024 * 1024)
    compressImageToLimit.mockRejectedValue(
      new ImageCompressionError(
        'UNSUPPORTED_FORMAT',
        'GIF cannot be auto-compressed',
      ),
    )

    renderWithFile(file)
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledTimes(1)
    })
    expect(toastMock.error.mock.calls[0][0]).toMatch(/uploadGifTooLarge/)
    expect(toastMock.error.mock.calls[0][0]).toMatch(
      new RegExp(`"maxMb":"${EXPECTED_MAX_MB}"`),
    )
    expect(uploadImageFileAPI).not.toHaveBeenCalled()
    // Banner mirrors the toast for the persistent in-canvas error UI.
    await waitFor(() => {
      expect(screen.getByTestId('banner-error').textContent).toMatch(
        /uploadGifTooLarge/,
      )
    })
    // Compressing toast still cleaned up.
    expect(toastMock.dismiss).toHaveBeenCalledWith('compressing-toast-id')
  })

  it('falls back to uploadTooLarge when compression cannot get under the cap', async () => {
    const file = makeFile('huge.png', 'image/png', 50 * 1024 * 1024)
    compressImageToLimit.mockRejectedValue(
      new ImageCompressionError(
        'CANNOT_COMPRESS_ENOUGH',
        'still too big after 8 attempts',
      ),
    )

    renderWithFile(file)
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledTimes(1)
    })
    expect(toastMock.error.mock.calls[0][0]).toMatch(/uploadTooLarge/)
    expect(toastMock.error.mock.calls[0][0]).not.toMatch(/uploadGifTooLarge/)
    expect(uploadImageFileAPI).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByTestId('banner-error').textContent).toMatch(
        /uploadTooLarge/,
      )
    })
  })

  it('refuses unsupported MIME types up front (no compressor, no upload)', async () => {
    const file = makeFile('weird.tiff', 'image/tiff', 1024)

    renderWithFile(file)
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledTimes(1)
    })
    expect(toastMock.error.mock.calls[0][0]).toMatch(/uploadUnsupported/)
    expect(compressImageToLimit).not.toHaveBeenCalled()
    expect(uploadImageFileAPI).not.toHaveBeenCalled()
  })
})
