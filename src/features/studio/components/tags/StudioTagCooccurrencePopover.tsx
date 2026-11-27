'use client'

import { useEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'

import { Check, RefreshCw, X } from '@/components/icons'
import { Spinner } from '@/components/ui/spinner'
import { getDanbooruCooccurrenceAPI } from '@/lib/api-client/tag-assist'
import { displayDanbooruTag } from '@/lib/tag-lookup'
import { pickLocalizedTagName } from '@/lib/tag-recognition'
import { cn } from '@/lib/utils'
import type { DanbooruCooccurrenceResponse } from '@/types/tag-assist'

const POPOVER_MAX_HEIGHT = 280
const POPOVER_GAP = 6

export interface StudioTagCooccurrencePopoverProps {
  anchorRef: RefObject<HTMLElement | null>
  tags: readonly string[]
  existingKeys: ReadonlySet<string>
  onToggleTag: (promptTag: string) => void
  onClose: () => void
}

/**
 * Ctrl/⌘+拖选或选区微工具条触发的「共现标签」浮层（5B-4）：
 * 查询选定标签在 Danbooru 帖子中高频一同出现的关联标签，点一下即加入/移出当前标签框。
 */
export function StudioTagCooccurrencePopover({
  anchorRef,
  tags,
  existingKeys,
  onToggleTag,
  onClose,
}: StudioTagCooccurrencePopoverProps) {
  const locale = useLocale()
  const t = useTranslations('StudioTags.cooccurrence')
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{
    key: string
    data?: DanbooruCooccurrenceResponse
    error?: boolean
  }>({ key: '' })
  const [position, setPosition] = useState<{
    top?: number
    bottom?: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)

  const queryKey = `${tags.join('\u0000')}#${attempt}`

  useEffect(() => {
    if (tags.length === 0) return
    const controller = new AbortController()
    void getDanbooruCooccurrenceAPI(tags, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ key: queryKey, data })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ key: queryKey, error: true })
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `queryKey` encodes `tags` + `attempt`
  }, [queryKey])

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor || tags.length === 0) return
    const viewport = window.visualViewport
    const measure = () => {
      const rect = anchor.getBoundingClientRect()
      const viewportTop = viewport?.offsetTop ?? 0
      const viewportBottom =
        viewportTop + (viewport?.height ?? window.innerHeight)
      const below = Math.max(0, viewportBottom - rect.bottom - POPOVER_GAP)
      const above = Math.max(0, rect.top - viewportTop - POPOVER_GAP)
      const opensUp = below < POPOVER_MAX_HEIGHT && above > below
      const maxHeight = Math.min(
        POPOVER_MAX_HEIGHT,
        Math.max(160, opensUp ? above : below),
      )
      setPosition({
        ...(opensUp
          ? { bottom: window.innerHeight - rect.top + POPOVER_GAP }
          : { top: rect.bottom + POPOVER_GAP }),
        left: rect.left,
        width: Math.max(280, rect.width),
        maxHeight,
      })
    }
    const frame = requestAnimationFrame(measure)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [anchorRef, onClose, tags.length])

  if (!position || tags.length === 0) return null

  const current = state.key === queryKey ? state : undefined
  const loading = !current
  const data = current?.data
  const errored = Boolean(current?.error)

  return createPortal(
    <div
      role="dialog"
      aria-label={t('title')}
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
      className="pointer-events-auto fixed z-50 flex flex-col gap-2 overflow-hidden rounded-12 border border-border bg-popover p-2.5 shadow-pop"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-2xs font-semibold text-foreground">
            {t('header', {
              tags: (data?.queriedTags ?? tags.slice(0, 2))
                .map(displayDanbooruTag)
                .join(' + '),
            })}
          </div>
          {data && data.sampleSize > 0 ? (
            <div className="text-[11px] text-muted-foreground">
              {t('sampleHint', { count: data.sampleSize })}
              {data.truncated ? ` · ${t('limitTwoHint')}` : ''}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={t('close')}
          onClick={onClose}
          className="touch-target grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-2xs text-muted-foreground">
          <Spinner className="size-3.5" aria-hidden />
          {t('loading')}
        </div>
      ) : errored ? (
        <div className="flex items-center justify-between gap-2 py-3 text-2xs text-muted-foreground">
          <span>{t('error')}</span>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="touch-target-y inline-flex h-7 items-center gap-1 rounded-md bg-muted px-2 font-semibold text-foreground hover:bg-fill-strong"
          >
            <RefreshCw className="size-3" aria-hidden />
            {t('retry')}
          </button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="py-3 text-2xs text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto overscroll-contain pr-0.5">
          {data.items.map((item) => {
            const promptTag = displayDanbooruTag(item.tag)
            const added = existingKeys.has(promptTag.toLowerCase())
            const local = pickLocalizedTagName(item, locale)
            const percent = Math.round(item.ratio * 100)
            return (
              <button
                key={item.tag}
                type="button"
                aria-pressed={added}
                title={item.zhNote ?? undefined}
                onClick={() => onToggleTag(promptTag)}
                className={cn(
                  'touch-target-y inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-2xs transition-colors focus-visible:outline-none focus-visible:shadow-focus',
                  added
                    ? 'bg-foreground font-semibold text-background'
                    : 'bg-muted/80 text-foreground hover:bg-fill-strong',
                )}
              >
                {added ? (
                  <Check className="size-3 shrink-0" aria-hidden />
                ) : null}
                <span>{promptTag}</span>
                {local ? (
                  <span
                    className={cn(
                      'max-w-24 truncate',
                      added ? 'opacity-80' : 'text-muted-foreground',
                    )}
                  >
                    {local}
                  </span>
                ) : null}
                <span
                  className={cn(
                    'font-mono text-[10px] tabular-nums',
                    added ? 'opacity-80' : 'text-muted-foreground/80',
                  )}
                >
                  {percent}%
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>,
    document.body,
  )
}
