import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  compressImageToLimit,
  ImageCompressionError,
} from '@/lib/compress-image'

// jsdom does not implement createImageBitmap / canvas.toBlob, so each test
// installs lightweight stubs that mimic just enough to exercise the
// branching we care about.

interface CanvasStub {
  width: number
  height: number
  toBlob: (cb: (blob: Blob | null) => void, type: string) => void
}

function installCanvasStub(stub: CanvasStub) {
  const original = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
    if (tagName === 'canvas') {
      return {
        ...stub,
        getContext: () => ({ drawImage: () => {} }),
      } as unknown as HTMLCanvasElement
    }
    return original(tagName)
  }) as typeof document.createElement)
}

function makeFile(name: string, type: string, size: number): File {
  const buffer = new Uint8Array(size)
  return new File([buffer], name, { type })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('compressImageToLimit', () => {
  it('passes through files already under the limit without touching them', async () => {
    const file = makeFile('small.png', 'image/png', 1024)

    const result = await compressImageToLimit(file, { maxBytes: 5 * 1024 })

    expect(result.wasCompressed).toBe(false)
    expect(result.file).toBe(file)
    expect(result.originalBytes).toBe(1024)
    expect(result.compressedBytes).toBe(1024)
  })

  it('refuses GIFs that exceed the limit so animation is not silently lost', async () => {
    const file = makeFile('big.gif', 'image/gif', 10 * 1024 * 1024)

    await expect(
      compressImageToLimit(file, { maxBytes: 5 * 1024 * 1024 }),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
    })
  })

  it('reencodes PNG → PNG (preserves alpha) and returns a smaller file', async () => {
    const file = makeFile('photo.png', 'image/png', 8 * 1024 * 1024)
    const compressedBlob = new Blob([new Uint8Array(2 * 1024 * 1024)], {
      type: 'image/png',
    })

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({
        width: 4000,
        height: 3000,
        close: () => {},
      })),
    )

    installCanvasStub({
      width: 0,
      height: 0,
      toBlob: (cb) => cb(compressedBlob),
    })

    const result = await compressImageToLimit(file, {
      maxBytes: 5 * 1024 * 1024,
    })

    expect(result.wasCompressed).toBe(true)
    expect(result.file.type).toBe('image/png')
    expect(result.file.name).toBe('photo.png')
    expect(result.compressedBytes).toBeLessThanOrEqual(5 * 1024 * 1024)
  })

  it('reencodes non-PNG as JPEG to maximise size savings', async () => {
    const file = makeFile('photo.webp', 'image/webp', 8 * 1024 * 1024)
    const compressedBlob = new Blob([new Uint8Array(2 * 1024 * 1024)], {
      type: 'image/jpeg',
    })

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({
        width: 4000,
        height: 3000,
        close: () => {},
      })),
    )

    installCanvasStub({
      width: 0,
      height: 0,
      toBlob: (cb) => cb(compressedBlob),
    })

    const result = await compressImageToLimit(file, {
      maxBytes: 5 * 1024 * 1024,
    })

    expect(result.wasCompressed).toBe(true)
    expect(result.file.type).toBe('image/jpeg')
    expect(result.file.name).toBe('photo.jpg')
  })

  it('gives up with CANNOT_COMPRESS_ENOUGH when every attempt is still oversized', async () => {
    const file = makeFile('huge.png', 'image/png', 50 * 1024 * 1024)
    // toBlob always returns a still-oversized blob to force every retry to
    // fail until the attempt budget is exhausted.
    const stillTooBig = new Blob([new Uint8Array(10 * 1024 * 1024)], {
      type: 'image/png',
    })

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({
        width: 8000,
        height: 6000,
        close: () => {},
      })),
    )

    installCanvasStub({
      width: 0,
      height: 0,
      toBlob: (cb) => cb(stillTooBig),
    })

    await expect(
      compressImageToLimit(file, { maxBytes: 5 * 1024 * 1024 }),
    ).rejects.toMatchObject({ code: 'CANNOT_COMPRESS_ENOUGH' })
  })

  it('throws DECODE_FAILED when createImageBitmap rejects', async () => {
    const file = makeFile('corrupt.png', 'image/png', 8 * 1024 * 1024)

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('bad image')
      }),
    )

    await expect(
      compressImageToLimit(file, { maxBytes: 5 * 1024 * 1024 }),
    ).rejects.toBeInstanceOf(ImageCompressionError)
  })
})
