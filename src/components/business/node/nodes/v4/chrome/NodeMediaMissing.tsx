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
 * 小缩略图（参考轨 48px / @ 胶囊 16px / 列表 / 剪辑台）读不出来时的兜底：记下读
 * 失败的地址，调用方退回它本来就有的「没封面」那一档占位（没有占位的就不画这张图）。
 * ⛔ 不画裂图（owner 09-28：素材库删了，画布上哪儿都不许出裂图）。
 *
 * 大卡面用 `useMediaProblem`（它会问一次 CDN、说「已删除」并给去处）；缩略图太小装
 * 不下一句话，只负责不裂。
 */
export function useBrokenThumbs() {
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set())
  /** 这张能不能画：没有地址 / 读失败过 → `undefined`（走占位）。 */
  const usable = useCallback(
    (url: string | undefined): string | undefined =>
      url && !broken.has(url) ? url : undefined,
    [broken],
  )
  const markBroken = useCallback((url: string) => {
    setBroken((current) =>
      current.has(url) ? current : new Set(current).add(url),
    )
  }, [])
  return { usable, markBroken }
}

/**
 * 来源没了的卡面（画板「画布 · 角色 ④」S6）：灰底一句话 + 一个去处。
 * 已删除 →「从画布移除」；卡上还有别的版本时 →「去掉这一版」（`scope="version"`，
 * owner 2026-09-29：⛔ 连好的那几版一起删掉整张卡）；暂时读不到 →「重试」。
 * ⛔ 不画裂图、不抖、不红框。
 * `row` 给矮卡（音频）用：一行排开。
 */
export function NodeMediaMissing({
  kind,
  problem,
  onRemove,
  onRetry,
  scope = 'card',
  layout = 'stack',
  className,
  style,
}: {
  kind: MediaKind
  problem: MediaLoadProblem | 'checking'
  onRemove: () => void
  onRetry: () => void
  /** 「已删除」那颗键拿掉的是整张卡还是这一版（卡上不止一版时给 `version`）。 */
  scope?: 'card' | 'version'
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
            {gone
              ? t(scope === 'version' ? 'removeVersion' : 'remove')
              : t('retry')}
          </button>
        </>
      )}
    </div>
  )
}
