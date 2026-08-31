import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MEDIA_PROBE_TIMEOUT_MS } from '@/constants/media-probe'

import { captureVideoThumbnail, readVideoFileMetadata } from './video-thumbnail'

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

describe('readVideoFileMetadata', () => {
  const file = new File(['bytes'], 'clip.mp4', { type: 'video/mp4' })

  it('resolves the decoded dimensions and duration', async () => {
    installDom(makeFakeVideo())
    await expect(readVideoFileMetadata(file)).resolves.toEqual({
      width: 640,
      height: 360,
      duration: 10,
    })
  })

  it('omits a non-finite duration instead of reporting Infinity', async () => {
    installDom(makeFakeVideo({ duration: Number.POSITIVE_INFINITY }))
    await expect(readVideoFileMetadata(file)).resolves.toEqual({
      width: 640,
      height: 360,
    })
  })

  it('resolves null when the metadata carries no dimensions', async () => {
    installDom(makeFakeVideo({ videoWidth: 0, videoHeight: 0 }))
    await expect(readVideoFileMetadata(file)).resolves.toBeNull()
  })
})

/**
 * 真机 2026-08-30：标签页隐藏时 `<video>` 的 loadedmetadata / seeked / error
 * 一个都不派发（探针回 `{"outcome":"TIMEOUT","log":[]}`，log 是空的）。两个探测
 * 函数原先靠这三个事件收尾，于是 `await` 永久挂住 —— 上传 chip 停在 0%。
 * 这一组锁的就是「事件永远不来」这一种输入。
 */
describe('probe time budget', () => {
  const file = new File(['bytes'], 'clip.mp4', { type: 'video/mp4' })

  /** 一个装了 src 也什么都不派发的 `<video>` —— 隐藏标签页的行为。 */
  function makeSilentVideo() {
    const video = makeFakeVideo()
    Object.defineProperty(video, 'src', {
      configurable: true,
      get: () => '',
      set: () => {},
    })
    return video
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves captureVideoThumbnail null once the budget runs out', async () => {
    installDom(makeSilentVideo())
    const settled = vi.fn()
    const pending = captureVideoThumbnail(file).then((result) => {
      settled(result)
      return result
    })

    // 预算未到之前不许提前放弃：真实解码本来就可能要好几秒。
    await vi.advanceTimersByTimeAsync(MEDIA_PROBE_TIMEOUT_MS - 1)
    expect(settled).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toBeNull()
  })

  it('resolves readVideoFileMetadata null once the budget runs out', async () => {
    installDom(makeSilentVideo())
    const pending = readVideoFileMetadata(file)

    await vi.advanceTimersByTimeAsync(MEDIA_PROBE_TIMEOUT_MS)
    await expect(pending).resolves.toBeNull()
  })

  it('tears the element and its object URL down on timeout', async () => {
    // ⭐ 这条是「兜底必须在函数内部」的证据：调用处套 `Promise.race` 也能让
    // 上面两条过，但那时元素和 object URL 还挂着，每挂一次漏一份。
    const video = makeSilentVideo()
    installDom(video)
    const pending = readVideoFileMetadata(file)

    await vi.advanceTimersByTimeAsync(MEDIA_PROBE_TIMEOUT_MS)
    await pending

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake')
    expect(video.remove).toHaveBeenCalled()
  })

  it('does not leave the budget timer armed after a normal finish', async () => {
    canvasToBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(null))
    installDom(makeFakeVideo())

    await expect(captureVideoThumbnail(file)).resolves.toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
