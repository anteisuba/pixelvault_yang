/**
 * GIF 动图输出在这里收口：判断一条 URL / MIME 是不是 GIF。
 *
 * ⚠ 本文件被 worker（`workers/execution`）按相对路径直接引用 —— ⛔ 不要加 `@/`
 * 别名导入或任何 Node 依赖。
 *
 * 为什么要认 GIF：改图 / 视频参考图 / 看图模型都只看一帧。前端遇到 GIF 先弹
 * 「用首帧继续？」把首帧转成 PNG 新作品；服务端在没有前端拦截的入口（助手 @、
 * 画布、API 直调）按这里的判断拦成 400「先取首帧」。
 */

export const GIF_MIME_TYPE = 'image/gif'

export function isGifMimeType(mimeType: string | null | undefined): boolean {
  return (mimeType ?? '').toLowerCase().split(';')[0].trim() === GIF_MIME_TYPE
}

/** 我们自己存的 GIF 一律以 `.gif` 结尾；外部 data URL 看 MIME 头。 */
export function isGifImageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  if (/^data:image\/gif[;,]/i.test(url)) return true
  try {
    return /\.gif$/i.test(new URL(url, 'https://local.invalid').pathname)
  } catch {
    return false
  }
}
