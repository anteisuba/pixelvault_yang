'use client'

import { useState } from 'react'
import Image from 'next/image'

import { NODE_V4_CHROME } from '@/constants/node-studio'
import { cn } from '@/lib/utils'

/**
 * `@` 引用那颗 16px 小缩略（选择器一行 · 正文胶囊 · 独立胶囊共用这一颗）。
 *
 * ⚠ 视频卡的 `url` 是 mp4 —— 喂给 `<img>` 只会是空白 / 裂图（owner 2026-09-29
 *   真机：「视频的预览图也是空白」）。有封面用封面；手传的片子没有封面，就用
 *   `<video>` 停在第一帧。读不出来退回灰块，⛔ 不露裂图（owner 09-28）。
 */
export function MentionMediaThumb({
  thumbnailUrl,
  videoUrl,
  className,
}: {
  readonly thumbnailUrl?: string | undefined
  readonly videoUrl?: string | undefined
  readonly className?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const size = NODE_V4_CHROME.mentionThumbSize
  if (thumbnailUrl && failed !== thumbnailUrl) {
    return (
      <Image
        src={thumbnailUrl}
        alt=""
        width={size}
        height={size}
        unoptimized
        onError={() => setFailed(thumbnailUrl)}
        className={cn('shrink-0 object-cover', className)}
      />
    )
  }
  if (videoUrl && failed !== videoUrl) {
    return (
      <video
        aria-hidden
        // `#t=` 让没有 poster 的片子也停在一帧画面上（Safari 不给 0 秒那一帧）。
        src={`${videoUrl}#t=0.1`}
        muted
        playsInline
        preload="metadata"
        onError={() => setFailed(videoUrl)}
        className={cn('shrink-0 object-cover', className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn('shrink-0 bg-surface-fill-track', className)}
    />
  )
}
