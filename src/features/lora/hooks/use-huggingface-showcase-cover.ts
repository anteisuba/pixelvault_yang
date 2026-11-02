'use client'

import { useCallback, useEffect, useState } from 'react'

import {
  HUGGINGFACE_SHOWCASE_LAZY_LOAD_ROOT_MARGIN,
  isHuggingFaceSocialThumbnailCoverUrl,
} from '@/constants/lora'
import { fetchHuggingFaceShowcaseAPI } from '@/lib/api-client/lora-assets'

export interface UseHuggingFaceShowcaseCoverResult {
  /** Cover URL to render: the original cover when it's already a real image,
   *  `null` while the lazy showcase lookup is pending (render a skeleton,
   *  not the fallback banner), the README image once resolved, or the
   *  original social-thumbnail fallback when the lookup found nothing. */
  coverUrl: string | null
  /** True only while the card needs the showcase lookup and it hasn't
   *  resolved yet — drives the skeleton state so the banner never
   *  flashes before the real cover (or before falling back to it). */
  isPending: boolean
  /** Attach to the tile's DOM node so IntersectionObserver can tell when
   *  the card enters the viewport. No-op ref when no lookup is needed. */
  setObservedElement: (node: Element | null) => void
}

// 会话级缓存（进程/标签页生命周期内）：同一 repoId+revision 不重复请求，
// 哪怕它在多张卡之间被多次挂载/卸载观察（比如滚出视口又滚回来）。value
// 为 null 表示"已经问过 showcase 端点，README 里没有真图"——同样要缓存，
// 不然每次进视口都会重新问一遍已知没有答案的仓库。
const resolvedShowcaseCoverCache = new Map<string, string | null>()

function getCacheKey(repoId: string, revision: string): string {
  return `${repoId.toLowerCase()}@${revision}`
}

/**
 * HF 库卡片封面的渐进增强懒加载（库侧封面渐进增强，owner 2026-07-18 拍板
 * 方案 B）：只对「封面落到社交横幅兜底」的卡生效——这些卡在进入视口前
 * 保持 `isPending=true`（骨架），进视口后请求一次 showcase 端点，拿到真
 * 图就换、拿不到就落回原本的社交横幅兜底，全程没有「先闪横幅再变真图」
 * 的跳变。已经有真封面（前三级命中）的卡这个 hook 直接透传原样，不发
 * 任何请求。
 *
 * 观察的 DOM 节点存进 state（不是 `useRef`）：ref 回调触发的 state 更新
 * 让"元素挂载"这件事对 effect 依赖数组可见，不依赖"ref 回调一定先于
 * mount effect 提交"这种时序细节——组件树里 `<div ref={setObservedElement}>`
 * 和测试里手动调用 `setObservedElement(node)` 都能正确触发观察。
 */
export function useHuggingFaceShowcaseCover(
  repoId: string,
  revision: string,
  fallbackCoverUrl: string | null,
): UseHuggingFaceShowcaseCoverResult {
  const needsShowcase = isHuggingFaceSocialThumbnailCoverUrl(fallbackCoverUrl)
  const cacheKey = getCacheKey(repoId, revision)
  const cachedValue = needsShowcase
    ? resolvedShowcaseCoverCache.get(cacheKey)
    : undefined

  const [resolvedCover, setResolvedCover] = useState<string | null | undefined>(
    cachedValue,
  )
  const [element, setElement] = useState<Element | null>(null)

  // React 官方"渲染期间调整 state"写法（不是 setState-in-effect，react-hooks
  // 的 set-state-in-effect 规则不管这个）：同一个组件实例切到不同仓库
  // （cacheKey 变了——理论上父级列表用 `key={item.repoId}` 时不会发生，这
  // 里是防御）时，若新 repo 已经有缓存结果，渲染期间直接同步过去，不用
  // 再等一轮 effect + setState 的级联渲染。
  const [trackedCacheKey, setTrackedCacheKey] = useState(cacheKey)
  if (cacheKey !== trackedCacheKey) {
    setTrackedCacheKey(cacheKey)
    setResolvedCover(cachedValue)
  }

  useEffect(() => {
    if (!needsShowcase) return
    if (resolvedShowcaseCoverCache.has(cacheKey)) return
    // 渐进增强：老浏览器/测试环境（jsdom 不实现 IntersectionObserver）没
    // 有这个 API 就直接跳过懒加载，卡片保持原样的社交横幅兜底——不能因为
    // 缺这个 API 就让整张卡片卡在骨架态。
    if (typeof IntersectionObserver === 'undefined') return
    if (!element) return

    let cancelled = false
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        void fetchHuggingFaceShowcaseAPI({ repoId, revision }).then(
          (response) => {
            if (cancelled) return
            const firstImage =
              response.success && response.data
                ? (response.data.images[0] ?? null)
                : null
            resolvedShowcaseCoverCache.set(cacheKey, firstImage)
            setResolvedCover(firstImage)
          },
        )
      },
      { rootMargin: HUGGINGFACE_SHOWCASE_LAZY_LOAD_ROOT_MARGIN },
    )
    observer.observe(element)

    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [cacheKey, needsShowcase, repoId, revision, element])

  const setObservedElement = useCallback((node: Element | null) => {
    setElement(node)
  }, [])

  if (!needsShowcase) {
    return { coverUrl: fallbackCoverUrl, isPending: false, setObservedElement }
  }

  if (resolvedCover === undefined) {
    return { coverUrl: null, isPending: true, setObservedElement }
  }

  return {
    coverUrl: resolvedCover ?? fallbackCoverUrl,
    isPending: false,
    setObservedElement,
  }
}
