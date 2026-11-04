/**
 * jsdom 不会解码视频、画布也画不出像素：这里把浏览器的媒体边界换成可控的假的，
 * 让真的抽帧代码（`src/lib/video-frame-capture.ts`）照常跑——建 `<video>`、等
 * `loadedmetadata`、逐帧 seek、画到画布、`toDataURL`。
 *
 * 用完 `vi.restoreAllMocks()`。
 */
import { vi } from 'vitest'

export interface FakeVideoOptions {
  duration?: number
  width?: number
  height?: number
  /** 加载失败（片子拿不到 / CORS 挡了）。 */
  loadFails?: boolean
  /** 画布被跨域视频污染：`toDataURL` 抛 SecurityError。 */
  tainted?: boolean
  /** 给了就等它兑现才发 `loadedmetadata`（看「抽帧中」那一刻）。 */
  metadataGate?: Promise<unknown>
}

export function installFakeVideo(options: FakeVideoOptions = {}) {
  const {
    duration = 16,
    width = 1920,
    height = 1080,
    loadFails = false,
    tainted = false,
    metadataGate,
  } = options
  const loadedSources: string[] = []
  const realCreate = document.createElement.bind(document)

  vi.spyOn(document, 'createElement').mockImplementation(((
    tag: string,
    elementOptions?: ElementCreationOptions,
  ) => {
    const element = realCreate(tag, elementOptions)
    if (tag === 'video') {
      let currentTime = 0
      Object.defineProperties(element, {
        duration: { get: () => duration },
        videoWidth: { get: () => width },
        videoHeight: { get: () => height },
        currentTime: {
          get: () => currentTime,
          set: (value: number) => {
            currentTime = value
            setTimeout(() => element.dispatchEvent(new Event('seeked')), 0)
          },
        },
        src: {
          get: () => element.getAttribute('src') ?? '',
          set: (value: string) => {
            element.setAttribute('src', value)
            loadedSources.push(value)
            void Promise.resolve(metadataGate).then(() =>
              setTimeout(() =>
                element.dispatchEvent(
                  new Event(loadFails ? 'error' : 'loadedmetadata'),
                ),
              ),
            )
          },
        },
        load: { value: () => {} },
      })
    }
    if (tag === 'canvas') {
      Object.defineProperties(element, {
        getContext: { value: () => ({ drawImage: () => {} }) },
        toDataURL: {
          value: () => {
            if (tainted) {
              throw new DOMException(
                'The canvas has been tainted by cross-origin data.',
                'SecurityError',
              )
            }
            return 'data:image/webp;base64,AAAA'
          },
        },
      })
    }
    return element
  }) as typeof document.createElement)

  return { loadedSources }
}
