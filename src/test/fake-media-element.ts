/**
 * jsdom 的 `<video>` / `<audio>` 不加载、不跳帧：这里在**原型**上替浏览器那一层，让抽帧
 * （`@/lib/video-frame-capture`）、读时长（`@/lib/media-probe`）等真代码照常跑。
 *
 * 与 `fake-video-element.ts` 的区别：那份换掉 `document.createElement`，React 渲染出来的
 * `<video>` 也会变成假的；这份不碰元素本身，界面上的 `<video>` 照常是真元素，可以和组件
 * 渲染测试放在一起用。
 *
 * - 用属性赋地址（`el.src = url`，抽帧 / 读时长那一路就是这么写的）时，按登记表派发
 *   `loadedmetadata`；没登记的地址派发 `error`。React 走 `setAttribute`，不触发。
 * - `currentTime` 赋值后派发 `seeked`，读回赋的值；每次赋值记进 `seeks`。
 * - `duration` / `videoWidth` / `videoHeight` 按登记表答（地址里的查询串不算）。
 * - `load` / `play` / `pause` 不报「未实现」。
 *
 * 用完 `vi.restoreAllMocks()`。
 */
import { vi } from 'vitest'

export interface FakeMedia {
  readonly duration: number
  readonly width?: number
  readonly height?: number
}

export interface FakeMediaElements {
  /** 每一次 `currentTime = …`（按先后）。 */
  readonly seeks: number[]
}

function withoutQuery(src: string): string {
  try {
    const url = new URL(src)
    url.search = ''
    return url.toString()
  } catch {
    return src
  }
}

export function installFakeMediaElements(
  table: Record<string, FakeMedia>,
): FakeMediaElements {
  const seeks: number[] = []
  const times = new WeakMap<HTMLMediaElement, number>()
  const specOf = (element: HTMLMediaElement) => {
    const src = element.getAttribute('src')
    return src ? table[withoutQuery(src)] : undefined
  }
  const media = HTMLMediaElement.prototype
  const video = HTMLVideoElement.prototype

  vi.spyOn(media, 'src', 'get').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    return this.getAttribute('src') ?? ''
  })
  vi.spyOn(media, 'src', 'set').mockImplementation(function (
    this: HTMLMediaElement,
    value: string,
  ) {
    this.setAttribute('src', value)
    const known = Boolean(specOf(this))
    setTimeout(() =>
      this.dispatchEvent(new Event(known ? 'loadedmetadata' : 'error')),
    )
  })
  vi.spyOn(media, 'duration', 'get').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    return specOf(this)?.duration ?? Number.NaN
  })
  vi.spyOn(media, 'currentTime', 'get').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    return times.get(this) ?? 0
  })
  vi.spyOn(media, 'currentTime', 'set').mockImplementation(function (
    this: HTMLMediaElement,
    value: number,
  ) {
    times.set(this, value)
    seeks.push(value)
    setTimeout(() => this.dispatchEvent(new Event('seeked')))
  })
  vi.spyOn(video, 'videoWidth', 'get').mockImplementation(function (
    this: HTMLVideoElement,
  ) {
    return specOf(this)?.width ?? 0
  })
  vi.spyOn(video, 'videoHeight', 'get').mockImplementation(function (
    this: HTMLVideoElement,
  ) {
    return specOf(this)?.height ?? 0
  })
  vi.spyOn(media, 'load').mockImplementation(() => {})
  vi.spyOn(media, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(media, 'pause').mockImplementation(() => {})

  return { seeks }
}
