'use client'

import { useCallback, useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'

import { probeMediaProblem, type MediaLoadProblem } from '@/lib/media-probe'
import { cn } from '@/lib/utils'

type MediaKind = 'image' | 'video' | 'audio'

/**
 * 卡上的媒体读不出来时的判定（owner 09-27：素材库删了图，画布上是一张裂图）。
 *
 * ⭐ 加载失败先问一次 CDN（`probeMediaProblem`）：确认 404 才说「已删除」，其余说
 *   「暂时读不到」+ 重试。判定期间 `problem = 'checking'`：先铺灰底，⛔ 不露裂图。
 * ⚠ 只认当前这个 url 的结果：换了一版 / 回填了新图，旧判定自动作废。
 * ⚠ `attempt` 给媒体元素当 key：重试 = 重新挂载，浏览器才会再请求一次。
 */
export function useMediaProblem(url: string | undefined) {
  const [state, setState] = useState<{
    url: string
    problem: MediaLoadProblem | 'checking'
  } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const problem = state && state.url === url ? state.problem : null

  const onError = useCallback(() => {
    if (!url) return
    setState({ url, problem: 'checking' })
    void probeMediaProblem(url).then((next) =>
      setState((current) =>
        current && current.url === url ? { url, problem: next } : current,
      ),
    )
  }, [url])

  const retry = useCallback(() => {
    setState(null)
    setAttempt((count) => count + 1)
  }, [])

  return { problem, onError, retry, attempt }
}

/**
 * 来源没了的卡面（画板「画布 · 角色 ④」S6）：灰底一句话 + 一个去处。
 * 已删除 →「从画布移除」；暂时读不到 →「重试」。⛔ 不画裂图、不抖、不红框。
 * `row` 给矮卡（音频）用：一行排开。
 */
export function NodeMediaMissing({
  kind,
  problem,
  onRemove,
  onRetry,
  layout = 'stack',
  className,
  style,
}: {
  kind: MediaKind
  problem: MediaLoadProblem | 'checking'
  onRemove: () => void
  onRetry: () => void
  layout?: 'stack' | 'row'
  className?: string
  style?: CSSProperties
}) {
  const t = useTranslations('StudioNode.v4.chrome.mediaMissing')
  const gone = problem === 'gone'
  return (
    <div
      data-media-missing={problem}
      role={problem === 'checking' ? undefined : 'status'}
      className={cn(
        'flex items-center justify-center rounded-node bg-surface-fill-track text-center corner-squircle',
        layout === 'row' ? 'gap-3 px-4' : 'flex-col gap-2.5 px-4',
        className,
      )}
      style={style}
    >
      {problem === 'checking' ? null : (
        <>
          <p className="text-sm leading-5 text-foreground/80">
            {t(`${problem}.${kind}`)}
          </p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              if (gone) onRemove()
              else onRetry()
            }}
            onDoubleClick={(event) => event.stopPropagation()}
            className="nodrag nopan inline-flex h-8 shrink-0 items-center rounded-full border border-border bg-background px-3.5 text-xs font-medium text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {gone ? t('remove') : t('retry')}
          </button>
        </>
      )}
    </div>
  )
}
