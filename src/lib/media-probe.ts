import { MEDIA_PROBE_TIMEOUT_MS } from '@/constants/media-probe'

/**
 * 一张媒体读不出来时，分清「源文件没了」和「暂时读不到」（owner 09-27：素材库删了图，
 * 画布上是一张裂图）。
 *
 * ⭐ 问一次 CDN：404 / 410 = 源文件已删（素材库删除是硬删，连 R2 对象一起清）；
 *   其余一律算暂时读不到 —— 网络断了、5xx、跨域没放行都不能说成「已删除」。
 */
export type MediaLoadProblem = 'gone' | 'unreachable'

export async function probeMediaProblem(
  url: string,
): Promise<MediaLoadProblem> {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    return response.status === 404 || response.status === 410
      ? 'gone'
      : 'unreachable'
  } catch {
    return 'unreachable'
  }
}

/**
 * 读一段线上音视频的时长（秒），只拉元数据，不下整段。
 *
 * 用在发送前校验（参考视频 / 音频有时长上限）：手传进画布的片子身上没有
 * `durationSec`，只能现读。**读不到就返回 `null`**，调用方按「不知道」放行 ——
 * ⛔ 不拿一个没读出来的数去拦用户。
 * ⚠ 超时兜底在函数内部（见 `MEDIA_PROBE_TIMEOUT_MS` 头注：标签页隐藏时
 *   `loadedmetadata` 与 `error` 一个都不来）。
 */
export function probeMediaDuration(
  url: string,
  kind: 'video' | 'audio',
): Promise<number | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)

  return new Promise<number | null>((resolve) => {
    const element = document.createElement(kind)
    let settled = false

    const finish = (seconds: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      element.removeAttribute('src')
      element.load()
      element.remove()
      resolve(seconds)
    }

    const timer = setTimeout(() => finish(null), MEDIA_PROBE_TIMEOUT_MS)

    element.preload = 'metadata'
    element.muted = true
    element.onloadedmetadata = () => {
      const seconds = element.duration
      finish(Number.isFinite(seconds) && seconds > 0 ? seconds : null)
    }
    element.onerror = () => finish(null)
    element.src = url
  })
}
