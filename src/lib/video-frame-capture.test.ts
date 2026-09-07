import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  VIDEO_FRAME_ENDPOINT_PLAN,
  VIDEO_FRAME_LIMITS,
  VIDEO_FRAME_PLAN,
} from '@/constants/video-analysis'
import {
  planVideoEndpointFrames,
  planVideoFrames,
} from '@/lib/video-frame-plan'
import {
  captureVideoEndpointFrames,
  captureVideoFrames,
} from '@/lib/video-frame-capture'

/**
 * jsdom 不解码视频，所以按 `video-thumbnail.test.ts` 那套手动驱动元素生命周期：
 * 赋 `src` → 下一拍触发 `loadedmetadata`；写 `currentTime` → 下一拍触发 `seeked`。
 */
interface FakeVideo {
  crossOrigin: string | null
  preload: string
  muted: boolean
  playsInline: boolean
  src: string
  currentTime: number
  videoWidth: number
  videoHeight: number
  duration: number
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
  removeAttribute: (name: string) => void
  load: () => void
  remove: () => void
  /** 按顺序记下每一次 seek 目标 —— 用来对计划。 */
  seeks: number[]
  /** `src` 被赋值那一刻 `crossOrigin` 是什么（顺序错了就拿不到干净画布）。 */
  crossOriginAtSrc: string | null
}

function makeFakeVideo(overrides: Partial<FakeVideo> = {}): FakeVideo {
  const listeners = new Map<string, Set<() => void>>()
  let srcValue = ''
  let currentTimeValue = 0
  const fire = (type: string) => {
    for (const listener of [...(listeners.get(type) ?? [])]) listener()
  }

  const video: FakeVideo = {
    crossOrigin: null,
    preload: '',
    muted: false,
    playsInline: false,
    videoWidth: 1920,
    videoHeight: 1080,
    duration: 80,
    seeks: [],
    crossOriginAtSrc: null,
    addEventListener: (type, listener) => {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener)
    },
    removeAttribute: vi.fn(),
    load: vi.fn(),
    remove: vi.fn(),
    get src() {
      return srcValue
    },
    set src(value: string) {
      srcValue = value
      video.crossOriginAtSrc = video.crossOrigin
      queueMicrotask(() => fire('loadedmetadata'))
    },
    get currentTime() {
      return currentTimeValue
    },
    set currentTime(value: number) {
      currentTimeValue = value
      video.seeks.push(value)
      queueMicrotask(() => fire('seeked'))
    },
    ...overrides,
  }
  return video
}

const canvasToDataUrl = vi.fn()
let lastCanvas: { width: number; height: number } | null = null

function installDom(video: FakeVideo) {
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'video') return video as unknown as HTMLVideoElement
    if (tag === 'canvas') {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toDataURL: canvasToDataUrl,
      }
      lastCanvas = canvas
      return canvas as unknown as HTMLCanvasElement
    }
    throw new Error(`unexpected createElement(${tag})`)
  }) as typeof document.createElement)
}

beforeEach(() => {
  lastCanvas = null
  canvasToDataUrl.mockReset()
  canvasToDataUrl.mockReturnValue('data:image/webp;base64,AAAA')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('captureVideoFrames', () => {
  const URL_SOURCE = 'https://cdn.anteisuba.com/clips/shot.mp4'

  it('按计划逐帧 seek，抽满整组', async () => {
    const video = makeFakeVideo()
    installDom(video)

    const result = await captureVideoFrames(URL_SOURCE)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.frames).toHaveLength(VIDEO_FRAME_PLAN.frameCount)
    expect(video.seeks).toEqual(
      planVideoFrames(80).entries.map((entry) => entry.timestampSeconds),
    )
    // 报的是**实际落点**，服务端要核对的就是「你真抽到了计划附近」。
    expect(result.frames.map((frame) => frame.timestampSeconds)).toEqual(
      video.seeks,
    )
    expect(result.frames[0].dataUrl).toBe('data:image/webp;base64,AAAA')
  })

  it('⚠ crossOrigin 必须在赋 src 之前打上，否则请求不带 Origin、画布照样被污染', async () => {
    const video = makeFakeVideo()
    installDom(video)

    await captureVideoFrames(URL_SOURCE)

    expect(video.crossOriginAtSrc).toBe('anonymous')
  })

  it('长边压到上限以内（视觉模型本来也会缩，多传是纯浪费）', async () => {
    installDom(makeFakeVideo({ videoWidth: 1920, videoHeight: 1080 }))

    await captureVideoFrames(URL_SOURCE)

    expect(lastCanvas).toMatchObject({ width: 1024, height: 576 })
  })

  it('画布被污染 → 单独认出来（修法是配 R2 CORS，不是换个视频重试）', async () => {
    installDom(makeFakeVideo())
    canvasToDataUrl.mockImplementation(() => {
      throw new Error('SecurityError: tainted canvas')
    })

    const result = await captureVideoFrames(URL_SOURCE)

    expect(result).toMatchObject({ ok: false, reason: 'tainted-canvas' })
  })

  it('⭐ 一帧失败 = 整组失败（半组帧已经不是那个计划的产物，复跑对不上）', async () => {
    installDom(makeFakeVideo())
    canvasToDataUrl
      .mockReturnValueOnce('data:image/webp;base64,AAAA')
      .mockReturnValueOnce('data:image/webp;base64,BBBB')
      .mockImplementation(() => {
        throw new Error('SecurityError')
      })

    const result = await captureVideoFrames(URL_SOURCE)

    expect(result.ok).toBe(false)
  })

  it('片长读不出来 → 明确的失败原因，⛔ 不返回空帧集当成功', async () => {
    installDom(makeFakeVideo({ duration: Number.NaN }))

    const result = await captureVideoFrames(URL_SOURCE)

    expect(result).toMatchObject({ ok: false, reason: 'unreadable-duration' })
  })
})

/**
 * 助手视频域评审卡的生产者（第二期最后一环）—— 与上面那支**共用同一段实现**，
 * 所以这里只验「换的是计划」以及三帧那一组自己的约束。
 */
describe('captureVideoEndpointFrames', () => {
  const URL_SOURCE = 'https://cdn.anteisuba.com/clips/shot.mp4'

  it('按 0 / 中 / 末三个时间点 seek，交出三帧 dataUrl', async () => {
    const video = makeFakeVideo({ duration: 6 })
    installDom(video)

    const result = await captureVideoEndpointFrames(URL_SOURCE)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.frames).toHaveLength(VIDEO_FRAME_ENDPOINT_PLAN.frameCount)
    expect(video.seeks).toEqual(
      planVideoEndpointFrames(6).entries.map((entry) => entry.timestampSeconds),
    )
    // 序号即语义（0=start / 1=mid / 2=end）—— 服务端按它挂标签。
    expect(result.frames.map((frame) => frame.index)).toEqual([0, 1, 2])
    expect(
      result.frames.every((frame) => frame.dataUrl.startsWith('data:image/')),
    ).toBe(true)
    // ⛔ 不是段中点那一组：三帧各绑一个位置，取中点会把首末各挪进画面 1/6。
    expect(video.seeks).not.toEqual(
      planVideoFrames(6).entries.map((entry) => entry.timestampSeconds),
    )
  })

  it('payload 上限：长边压到 maxEdgePixels 以内（三帧要一起进一次请求）', async () => {
    installDom(
      makeFakeVideo({ duration: 6, videoWidth: 3840, videoHeight: 2160 }),
    )

    await captureVideoEndpointFrames(URL_SOURCE)

    expect(lastCanvas?.width).toBe(VIDEO_FRAME_LIMITS.maxEdgePixels)
    expect(lastCanvas?.height).toBe(
      Math.round((VIDEO_FRAME_LIMITS.maxEdgePixels * 2160) / 3840),
    )
  })

  it('跨域被挡 → `tainted-canvas`（修法是配 R2 CORS，⛔ 不是换个视频重试）', async () => {
    installDom(makeFakeVideo({ duration: 6 }))
    canvasToDataUrl.mockImplementation(() => {
      throw new Error('SecurityError: tainted canvas')
    })

    const result = await captureVideoEndpointFrames(URL_SOURCE)

    expect(result).toMatchObject({ ok: false, reason: 'tainted-canvas' })
  })

  it('片长读不出来 → `unreadable-duration`，⛔ 不交半组帧', async () => {
    installDom(makeFakeVideo({ duration: Number.NaN }))

    const result = await captureVideoEndpointFrames(URL_SOURCE)

    expect(result).toMatchObject({ ok: false, reason: 'unreadable-duration' })
  })
})
