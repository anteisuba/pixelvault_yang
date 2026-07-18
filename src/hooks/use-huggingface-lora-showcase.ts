'use client'

import { useEffect, useState } from 'react'

import { fetchHuggingFaceShowcaseAPI } from '@/lib/api-client/lora-assets'
import type { HuggingFaceLoraSource } from '@/lib/huggingface-lora-source'
import type { HuggingFaceRepoShowcase } from '@/types'

export interface UseHuggingFaceLoraShowcaseResult {
  images: readonly string[]
  prompts: readonly string[]
  isLoading: boolean
}

const EMPTY_SHOWCASE: HuggingFaceRepoShowcase = { images: [], prompts: [] }

// 会话级缓存（进程/标签页生命周期内）：同一 repoId+revision 挂载/卸载/
// 重新挂载多次也只抓一次 README——与库侧封面渐进增强的缓存
// （use-huggingface-showcase-cover.ts）分开维护，那份只存首图，这里要保留
// 完整 images+prompts 供横滚条 + 提示词列表消费。
const sessionShowcaseCache = new Map<string, HuggingFaceRepoShowcase>()

function getCacheKey(repoId: string, revision: string): string {
  return `${repoId.toLowerCase()}@${revision}`
}

/**
 * H1 生成侧「样例参考」（lora-workbench.md §13）：挂载 HF LoRA 时懒取
 * README 全量图 + 启发式提取的候选提示词。`source` 为 null（未挂载 HF
 * LoRA，或当前分组挂载不是 HF 资产）时直接返回空、不发请求。
 */
export function useHuggingFaceLoraShowcase(
  source: HuggingFaceLoraSource | null,
): UseHuggingFaceLoraShowcaseResult {
  const cacheKey = source ? getCacheKey(source.repoId, source.revision) : null
  const cached = cacheKey ? sessionShowcaseCache.get(cacheKey) : undefined

  const [result, setResult] = useState<HuggingFaceRepoShowcase | undefined>(
    cached,
  )
  // React 官方"渲染期间调整 state"写法（同 use-huggingface-showcase-cover.ts
  // 的先例）：切到另一个已缓存过的仓库时，渲染期间直接同步过去，不用再等
  // 一轮 effect + setState 的级联渲染。
  const [trackedCacheKey, setTrackedCacheKey] = useState(cacheKey)
  if (cacheKey !== trackedCacheKey) {
    setTrackedCacheKey(cacheKey)
    setResult(cached)
  }

  useEffect(() => {
    if (!source || !cacheKey) return
    if (sessionShowcaseCache.has(cacheKey)) return

    let cancelled = false
    void fetchHuggingFaceShowcaseAPI(source).then((response) => {
      if (cancelled) return
      const value =
        response.success && response.data ? response.data : EMPTY_SHOWCASE
      sessionShowcaseCache.set(cacheKey, value)
      setResult(value)
    })

    return () => {
      cancelled = true
    }
  }, [cacheKey, source])

  if (!source) {
    return { images: [], prompts: [], isLoading: false }
  }

  if (result === undefined) {
    return { images: [], prompts: [], isLoading: true }
  }

  return { images: result.images, prompts: result.prompts, isLoading: false }
}
