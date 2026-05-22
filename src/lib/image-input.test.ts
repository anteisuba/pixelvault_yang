import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  getImageFileFromDataTransfer,
  getRemoteImageUrlFromDataTransfer,
  isRemoteImageUrl,
  readImageFileAsBase64,
} from './image-input'

function makeFile(
  name: string,
  type: string,
  size: number,
  payload = 'x',
): File {
  // jsdom's Blob honors `.size` only when we feed real bytes; padding the
  // payload here lets size-cap tests run without allocating MB-sized buffers.
  const padded = payload.padEnd(size, 'x')
  return new File([padded], name, { type })
}

function makeDataTransfer({
  files = [],
  textData,
}: {
  files?: File[]
  textData?: string
}): DataTransfer {
  return {
    files: files as unknown as FileList,
    getData: (key: string) => (key === 'text' ? (textData ?? '') : ''),
  } as unknown as DataTransfer
}

describe('isRemoteImageUrl', () => {
  it('accepts http/https URLs', () => {
    expect(isRemoteImageUrl('https://example.com/a.png')).toBe(true)
    expect(isRemoteImageUrl('http://example.com/a.png')).toBe(true)
  })

  it('rejects data: URLs, relative paths, and garbage', () => {
    expect(isRemoteImageUrl('data:image/png;base64,abc')).toBe(false)
    expect(isRemoteImageUrl('/foo/bar.png')).toBe(false)
    expect(isRemoteImageUrl('not a url')).toBe(false)
  })
})

describe('getImageFileFromDataTransfer', () => {
  it('returns the first image file', () => {
    const txt = makeFile('a.txt', 'text/plain', 5)
    const png = makeFile('b.png', 'image/png', 5)
    const dt = makeDataTransfer({ files: [txt, png] })
    expect(getImageFileFromDataTransfer(dt)).toBe(png)
  })

  it('returns null when no image is present', () => {
    const dt = makeDataTransfer({ files: [makeFile('a.txt', 'text/plain', 5)] })
    expect(getImageFileFromDataTransfer(dt)).toBeNull()
  })
})

describe('getRemoteImageUrlFromDataTransfer', () => {
  it('returns trimmed remote URL pastes', () => {
    const dt = makeDataTransfer({ textData: '  https://x.com/i.png  ' })
    expect(getRemoteImageUrlFromDataTransfer(dt)).toBe('https://x.com/i.png')
  })

  it('rejects non-remote text pastes', () => {
    const dt = makeDataTransfer({ textData: 'hello world' })
    expect(getRemoteImageUrlFromDataTransfer(dt)).toBeNull()
  })
})

describe('readImageFileAsBase64', () => {
  // Patch the global Image so dimension checks resolve deterministically
  // without ever decoding real pixels. Tests opt in via stubImage().
  const originalImage = globalThis.Image
  afterEach(() => {
    globalThis.Image = originalImage
  })

  function stubImage(width: number, height: number, fail = false) {
    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      width = width
      height = height
      set src(_value: string) {
        queueMicrotask(() => {
          if (fail) this.onerror?.()
          else this.onload?.()
        })
      }
    }
    globalThis.Image = FakeImage as unknown as typeof Image
  }

  it('rejects when MIME is not in acceptedTypes', async () => {
    const file = makeFile('a.gif', 'image/gif', 10)
    const res = await readImageFileAsBase64(file, {
      acceptedTypes: ['image/png', 'image/jpeg'],
    })
    expect(res).toEqual({ ok: false, reason: 'type' })
  })

  it('rejects non-image MIME when acceptedTypes is omitted', async () => {
    const file = makeFile('a.txt', 'text/plain', 10)
    const res = await readImageFileAsBase64(file)
    expect(res).toEqual({ ok: false, reason: 'type' })
  })

  it('rejects when file exceeds maxFileSize', async () => {
    const file = makeFile('a.png', 'image/png', 100)
    const res = await readImageFileAsBase64(file, { maxFileSize: 50 })
    expect(res).toEqual({ ok: false, reason: 'size' })
  })

  it('rejects when image dimensions exceed maxDimension', async () => {
    stubImage(4096, 2000)
    const file = makeFile('big.png', 'image/png', 10)
    const res = await readImageFileAsBase64(file, { maxDimension: 2048 })
    expect(res).toEqual({ ok: false, reason: 'dimension' })
  })

  it('returns base64 when all checks pass', async () => {
    stubImage(1024, 1024)
    const file = makeFile('ok.png', 'image/png', 10)
    const res = await readImageFileAsBase64(file, {
      acceptedTypes: ['image/png'],
      maxFileSize: 1024,
      maxDimension: 2048,
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.base64).toMatch(/^data:image\/png/)
  })

  it('skips dimension check when maxDimension is omitted', async () => {
    const setSpy = vi.fn()
    // Image constructor should NOT be called; we'd notice via spy reaching.
    class TrackedImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      width = 9999
      height = 9999
      set src(value: string) {
        setSpy(value)
      }
    }
    globalThis.Image = TrackedImage as unknown as typeof Image

    const file = makeFile('ok.png', 'image/png', 10)
    const res = await readImageFileAsBase64(file, {
      acceptedTypes: ['image/png'],
      maxFileSize: 1024,
    })
    expect(res.ok).toBe(true)
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('reports read failure when dimension probe errors', async () => {
    stubImage(0, 0, true)
    const file = makeFile('broken.png', 'image/png', 10)
    const res = await readImageFileAsBase64(file, { maxDimension: 1024 })
    expect(res).toEqual({ ok: false, reason: 'read' })
  })
})
