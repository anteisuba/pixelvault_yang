'use client'

import { useEffect, type RefObject } from 'react'

interface UseLoadMoreOnScrollOptions {
  /** 滚动的那一层（观察的 root）。 */
  scrollRef: RefObject<HTMLElement | null>
  /** 列表最底下那个 1px 的哨兵。 */
  sentinelRef: RefObject<HTMLElement | null>
  hasNextPage: boolean
  /** 已经接了几个 —— 变了就重新观察一次。 */
  itemCount: number
  loadMore: () => void
}

/**
 * 库 B 的往下滚（lora-library.md §3）：离底 1.5 屏就取下一段。接完一段重新观察一次 ——
 * 结果不满一屏时哨兵还在视野里，不重挂就收不到第二次「进入视野」。
 */
export function useLoadMoreOnScroll({
  scrollRef,
  sentinelRef,
  hasNextPage,
  itemCount,
  loadMore,
}: UseLoadMoreOnScrollOptions): void {
  useEffect(() => {
    const root = scrollRef.current
    const target = sentinelRef.current
    if (!root || !target || typeof IntersectionObserver === 'undefined') return
    if (!hasNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { root, rootMargin: '0px 0px 150% 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasNextPage, itemCount, loadMore, scrollRef, sentinelRef])
}
