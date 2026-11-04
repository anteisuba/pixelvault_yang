/**
 * jsdom 不会解码视频：这里替的是**浏览器**那一层（`<video>` 读元数据 / 跳帧、`<canvas>` 编码），
 * 让 `@/lib/video-frame-capture` 等真代码照常跑。按地址登记每段视频「读出来是什么样」。
 *
 * - `{ duration, width, height }`：能读；`frameChars` 是每帧 dataUrl 的长度（量预算用）。
 * - `'loadError'`：读不出来（含 CORS 重试那一次——地址带 `?…=1` 也照样按原地址查）。
 * - `'tainted'`：跨域画布被污染，`toDataURL` 抛 SecurityError。
 */
import { vi } from 'vitest'

export type FakeVideo =
  | { duration: number; width?: number; height?: number; frameChars?: number }
  | 'loadError'
  | 'tainted'

export interface FakeVideoDecoding {
  /** 改某段视频的样子（之后的读取按新的来）。 */
  set(url: string, video: FakeVideo): void
  /** 每个地址被 `<video>` 读了几次（不含 CORS 重试的查询串）。 */
  loads: Record<string, number>
}

function baseUrl(src: string): string {
  try {
    const url = new URL(src)
    url.search = ''
    return url.toString()
  } catch {
    return src
  }
}

export function installFakeVideoDecoding(
  initial: Record<string, FakeVideo> = {},
): FakeVideoDecoding {
  const videos = new Map<string, FakeVideo>(Object.entries(initial))
  const loads: Record<string, number> = {}
  const original = document.createElement.bind(document)

  vi.spyOn(document, 'createElement').mockImplementation(((
    tag: string,
    options?: ElementCreationOptions,
  ) => {
    if (tag === 'video') return fakeVideo()
    if (tag === 'canvas') return fakeCanvas()
    return original(tag, options)
  }) as typeof document.createElement)

  // 画布画的是哪段视频：编码结果按那段的样子来（几段同时抽也不串）。
  const specOf = new WeakMap<object, FakeVideo | undefined>()

  function fakeVideo(): HTMLVideoElement {
    const target = new EventTarget()
    let current = 0
    let spec: FakeVideo | undefined
    const element = Object.assign(target, {
      crossOrigin: null as string | null,
      preload: '',
      muted: false,
      playsInline: false,
      duration: Number.NaN,
      videoWidth: 0,
      videoHeight: 0,
      removeAttribute: () => {},
      load: () => {},
      remove: () => {},
    })
    Object.defineProperty(element, 'src', {
      set(src: string) {
        const key = baseUrl(src)
        loads[key] = (loads[key] ?? 0) + 1
        spec = videos.get(key)
        specOf.set(element, spec)
        queueMicrotask(() => {
          if (!spec || spec === 'loadError') {
            target.dispatchEvent(new Event('error'))
            return
          }
          const shape = spec === 'tainted' ? { duration: 4 } : spec
          element.duration = shape.duration
          element.videoWidth = shape.width ?? 1280
          element.videoHeight = shape.height ?? 720
          target.dispatchEvent(new Event('loadedmetadata'))
        })
      },
    })
    Object.defineProperty(element, 'currentTime', {
      get: () => current,
      set(time: number) {
        current = time
        queueMicrotask(() => target.dispatchEvent(new Event('seeked')))
      },
    })
    return element as unknown as HTMLVideoElement
  }

  function fakeCanvas(): HTMLCanvasElement {
    let drawn: FakeVideo | undefined
    return {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (source: object) => {
          drawn = specOf.get(source)
        },
      }),
      toDataURL: (type = 'image/png') => {
        if (drawn === 'tainted') {
          throw new DOMException('The canvas has been tainted', 'SecurityError')
        }
        const prefix = `data:${type};base64,`
        const chars =
          typeof drawn === 'object' && drawn.frameChars
            ? drawn.frameChars
            : prefix.length + 4
        return prefix + 'A'.repeat(Math.max(0, chars - prefix.length))
      },
    } as unknown as HTMLCanvasElement
  }

  return {
    set(url, video) {
      videos.set(baseUrl(url), video)
    },
    loads,
  }
}
