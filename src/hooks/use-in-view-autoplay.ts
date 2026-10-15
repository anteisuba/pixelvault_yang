'use client'

import { useEffect, type RefObject } from 'react'

/**
 * 「进视野就动」（lora-library.md §3 视频样例，owner 2026-10-15 选 B）：视频
 * 60% 进视野就静音循环播放，出视野立刻暂停；同屏最多 6 段（手机 4 段），按阅读
 * 顺序取前几段，其余停在静帧。
 *
 * ⭐ 整页共用一个注册表：网格卡与详情页瀑布同时挂着时也只算一份上限。
 * ⚠ 系统「减少动态效果」时调用方传 `enabled = false`，一段都不自动播。
 */
const VISIBLE_RATIO = 0.6
const MAX_PLAYING = 6
const MAX_PLAYING_MOBILE = 4
const MOBILE_QUERY = '(max-width: 1023px)'

const registered = new Set<HTMLVideoElement>()
const visible = new Set<HTMLVideoElement>()
let observer: IntersectionObserver | null = null

function readingOrder(a: HTMLVideoElement, b: HTMLVideoElement): number {
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
    ? -1
    : 1
}

function sync() {
  const cap = window.matchMedia(MOBILE_QUERY).matches
    ? MAX_PLAYING_MOBILE
    : MAX_PLAYING
  const playing = new Set([...visible].sort(readingOrder).slice(0, cap))
  for (const video of registered) {
    if (playing.has(video)) {
      // 浏览器拒播（省电模式等）就停在静帧，⛔ 抛到控制台。
      if (video.paused) void video.play().catch(() => undefined)
    } else if (!video.paused) {
      video.pause()
    }
  }
}

function getObserver(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const video = entry.target as HTMLVideoElement
        if (entry.intersectionRatio >= VISIBLE_RATIO) visible.add(video)
        else visible.delete(video)
      }
      sync()
    },
    { threshold: [0, VISIBLE_RATIO] },
  )
  return observer
}

export function useInViewAutoplay(
  ref: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    const video = ref.current
    // 没有 IntersectionObserver（老浏览器 / 测试环境）就停在静帧。
    if (!video || !enabled || typeof IntersectionObserver === 'undefined') {
      return
    }
    registered.add(video)
    getObserver().observe(video)
    return () => {
      observer?.unobserve(video)
      registered.delete(video)
      visible.delete(video)
      video.pause()
      sync()
    }
  }, [ref, enabled])
}
