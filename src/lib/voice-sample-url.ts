/**
 * 音色试听地址的两条判据（2026-09-29 owner 真机：音色弹层按不响、「用这段」落进卡
 * 之后「这段音频暂时读不到」）。
 *
 * Fish 的示例音频有两种地址：`platform.r2.fish.audio/…` 是公开的，一直能读；
 * `…r2.cloudflarestorage.com/…?X-Amz-Expires=3600…` 是**一小时就过期**的签名链接。
 * 收藏音色时把后者原样存进 `sampleAudioUrl`、「用这段」再把它原样落进卡，一小时后
 * 两处一起读不到 —— 所以：试听遇到它就现取一条新的，落卡一律先存进自己的存储。
 */

/** 带过期签名的地址（S3 / R2 预签名、CloudFront 签名）—— ⛔ 不能存下来当长期地址。 */
export function isExpiringMediaUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const params = parsed.searchParams
  return (
    params.has('X-Amz-Expires') ||
    params.has('X-Amz-Signature') ||
    params.has('Expires')
  )
}

/** 能直接拿来试听 / 存下来的地址：有，而且不会过期。 */
export function durableSampleUrl(
  url: string | null | undefined,
): string | null {
  return url && !isExpiringMediaUrl(url) ? url : null
}
