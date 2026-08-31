import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MEDIA_PROBE_TIMEOUT_MS } from '@/constants/media-probe'

import { readAudioFileMetadata } from './audio-metadata'

// jsdom 不解码真音频，所以元素生命周期由测试手动驱动：赋 `.src` 排一次
// onloadedmetadata。createElement 恒返回同一个假 <audio>，测试据此推进各阶段。
interface FakeAudio {
  preload: string
  src: string
  duration: number
  onloadedmetadata: (() => void) | null
  onerror: (() => void) | null
  removeAttribute: (name: string) => void
  load: () => void
  remove: () => void
}

function makeFakeAudio(overrides: Partial<FakeAudio> = {}): FakeAudio {
  // backing store 放闭包里（不是 `this._src`）：对象字面量里 TS 把 `this` 推成
  // `{}`，访问器体内写 `this._src` 会被拒。
  let srcValue = ''
  const audio: FakeAudio = {
    preload: '',
    duration: 12,
    onloadedmetadata: null,
    onerror: null,
    removeAttribute: vi.fn(),
    load: vi.fn(),
    remove: vi.fn(),
    get src() {
      return srcValue
    },
    set src(value: string) {
      srcValue = value
      // 赋 src → 下一拍元数据就绪。
      queueMicrotask(() => audio.onloadedmetadata?.())
    },
    ...overrides,
  } as unknown as FakeAudio
  return audio
}

function installDom(audio: FakeAudio) {
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'audio') return audio as unknown as HTMLAudioElement
    throw new Error(`unexpected createElement(${tag})`)
  }) as typeof document.createElement)
}

const file = new File(['bytes'], 'line.mp3', { type: 'audio/mpeg' })

beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('readAudioFileMetadata', () => {
  it('resolves the decoded duration', async () => {
    installDom(makeFakeAudio())
    await expect(readAudioFileMetadata(file)).resolves.toEqual({ duration: 12 })
  })

  it('omits a non-finite duration instead of reporting Infinity', async () => {
    installDom(makeFakeAudio({ duration: Number.POSITIVE_INFINITY }))
    await expect(readAudioFileMetadata(file)).resolves.toEqual({})
  })

  it('resolves null when the audio errors out', async () => {
    const audio = makeFakeAudio()
    // 覆盖 src：改成派发 onerror 而不是 onloadedmetadata。
    Object.defineProperty(audio, 'src', {
      configurable: true,
      get: () => '',
      set() {
        queueMicrotask(() => this.onerror?.())
      },
    })
    installDom(audio)

    await expect(readAudioFileMetadata(file)).resolves.toBeNull()
  })
})

/**
 * 真机 2026-08-30：标签页隐藏时 `<audio>` 的 loadedmetadata / error 一个都不派发
 * （探针回 `{"outcome":"TIMEOUT","log":[]}`，log 是空的）。这个探测函数原先靠这
 * 两个事件收尾，于是 `await` 永久挂住 —— 素材页的上传 chip 停在 0%。
 * 这一组锁的就是「事件永远不来」这一种输入，与 `video-thumbnail.test.ts` 同源。
 */
describe('probe time budget', () => {
  /** 一个装了 src 也什么都不派发的 `<audio>` —— 隐藏标签页的行为。 */
  function makeSilentAudio() {
    const audio = makeFakeAudio()
    Object.defineProperty(audio, 'src', {
      configurable: true,
      get: () => '',
      set: () => {},
    })
    return audio
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves null once the budget runs out', async () => {
    installDom(makeSilentAudio())
    const settled = vi.fn()
    const pending = readAudioFileMetadata(file).then((result) => {
      settled(result)
      return result
    })

    // 预算未到之前不许提前放弃：真实解码本来就可能要好几秒。
    await vi.advanceTimersByTimeAsync(MEDIA_PROBE_TIMEOUT_MS - 1)
    expect(settled).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toBeNull()
  })

  it('tears the element and its object URL down on timeout', async () => {
    // ⭐ 这条是「兜底必须在函数内部」的证据：调用处套 `Promise.race` 也能让
    // 上面那条过，但那时元素和 object URL 还挂着，每挂一次漏一份。
    const audio = makeSilentAudio()
    installDom(audio)
    const pending = readAudioFileMetadata(file)

    await vi.advanceTimersByTimeAsync(MEDIA_PROBE_TIMEOUT_MS)
    await pending

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake')
    expect(audio.remove).toHaveBeenCalled()
  })

  it('does not leave the budget timer armed after a normal finish', async () => {
    installDom(makeFakeAudio())

    await expect(readAudioFileMetadata(file)).resolves.toEqual({ duration: 12 })
    expect(vi.getTimerCount()).toBe(0)
  })
})
