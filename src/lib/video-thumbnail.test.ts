import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { captureVideoThumbnail } from './video-thumbnail'

// jsdom doesn't decode real video/canvas, so we drive the element lifecycle by
// hand: assigning `.src` schedules onloadedmetadata, setting `.currentTime`
// schedules onseeked. A single fake <video> instance is returned by
// createElement so the test can push it through each stage.
interface FakeVideo {
  preload: string
  muted: boolean
  playsInline: boolean
  src: string
  currentTime: number
  videoWidth: number
  videoHeight: number
  duration: number
  onloadedmetadata: (() => void) | null
  onseeked: (() => void) | null
  onerror: (() => void) | null
  removeAttribute: (name: string) => void
  load: () => void
  remove: () => void
}

function makeFakeVideo(overrides: Partial<FakeVideo> = {}): FakeVideo {
  // Backing store lives in the closure (not `this._src`) so the accessor
  // bodies don't rely on TS inferring an augmented `this` type for the
  // object literal — it infers `{}` there and rejects `this._src`.
  let srcValue = ''
  const video: FakeVideo = {
    preload: '',
    muted: false,
    playsInline: false,
    videoWidth: 640,
    videoHeight: 360,
    duration: 10,
    currentTime: 0,
    onloadedmetadata: null,
    onseeked: null,
    onerror: null,
    removeAttribute: vi.fn(),
    load: vi.fn(),
    remove: vi.fn(),
    get src() {
      return srcValue
    },
    set src(value: string) {
      srcValue = value
      // Assigning src → metadata is ready on the next tick.
      queueMicrotask(() => video.onloadedmetadata?.())
    },
    ...overrides,
  } as unknown as FakeVideo
  return video
}

const canvasToBlob = vi.fn()

function installDom(video: FakeVideo) {
  const seekingVideo = video as FakeVideo & { _currentTime?: number }
  Object.defineProperty(seekingVideo, 'currentTime', {
    configurable: true,
    get() {
      return this._currentTime ?? 0
    },
    set(value: number) {
      this._currentTime = value
      // Setting currentTime → seek completes on the next tick.
      queueMicrotask(() => this.onseeked?.())
    },
  })

  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'video') return video as unknown as HTMLVideoElement
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: canvasToBlob,
      } as unknown as HTMLCanvasElement
    }
    throw new Error(`unexpected createElement(${tag})`)
  }) as typeof document.createElement)
}

beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  })
  canvasToBlob.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('captureVideoThumbnail', () => {
  const file = new File(['bytes'], 'clip.mp4', { type: 'video/mp4' })

  it('draws a seeked frame and resolves the encoded webp blob', async () => {
    const blob = new Blob(['poster'], { type: 'image/webp' })
    canvasToBlob.mockImplementation((cb: (b: Blob) => void) => cb(blob))
    installDom(makeFakeVideo())

    await expect(captureVideoThumbnail(file)).resolves.toBe(blob)
    expect(canvasToBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/webp',
      0.8,
    )
  })

  it('resolves null when the video errors out', async () => {
    const video = makeFakeVideo()
    // Override src to fire onerror instead of metadata.
    Object.defineProperty(video, 'src', {
      configurable: true,
      set() {
        queueMicrotask(() => this.onerror?.())
      },
      get() {
        return ''
      },
    })
    installDom(video)

    await expect(captureVideoThumbnail(file)).resolves.toBeNull()
  })

  it('resolves null when the frame has no dimensions', async () => {
    installDom(makeFakeVideo({ videoWidth: 0, videoHeight: 0 }))
    await expect(captureVideoThumbnail(file)).resolves.toBeNull()
  })

  it('resolves null when toBlob yields nothing', async () => {
    canvasToBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(null))
    installDom(makeFakeVideo())
    await expect(captureVideoThumbnail(file)).resolves.toBeNull()
  })
})
