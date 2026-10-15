'use client'

import { useCallback, useState } from 'react'

import { thirdPartyImageSources } from '@/lib/third-party-image-url'

/**
 * 一张**第三方网图**在面板里的 `<img>`：不带我们的 Referer，取不到就换下一个地址
 * （热链代理 → 直连 → 调用方给的退路，见 `thirdPartyImageSources`）。
 *
 * 用法：`src` 为 `null`（`exhausted`）= 全都取不到，调用方画占位，⛔ 不出破图标。
 * 摊到 `<img>` / `next/image` 上的是 `src` · `onError` · `referrerPolicy`。
 *
 * ⚠ 只给第三方图用：自家 R2 / CDN 的图不需要这一层（也不该被改写）。
 */
export function useThirdPartyImage(
  ...urls: readonly (string | null | undefined)[]
): {
  src: string | null
  exhausted: boolean
  onError: () => void
  referrerPolicy: 'no-referrer'
} {
  const sources = thirdPartyImageSources(...urls)
  // 入参换了（同一格换成另一张图）就从第一个地址重来；⛔ 不在 effect 里同步。
  const key = sources.join('\n')
  const [attempt, setAttempt] = useState({ key, index: 0 })
  if (attempt.key !== key) setAttempt({ key, index: 0 })
  const index = attempt.key === key ? attempt.index : 0
  const onError = useCallback(() => {
    setAttempt((previous) =>
      previous.key === key ? { key, index: previous.index + 1 } : previous,
    )
  }, [key])
  const src = sources[index] ?? null
  return {
    src,
    exhausted: src === null,
    onError,
    referrerPolicy: 'no-referrer',
  }
}
