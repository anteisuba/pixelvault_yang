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
