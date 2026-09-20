'use client'

import { useEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import { getPromptTagPopularityTier } from '@/lib/prompt-tag-autocomplete'
import { cn } from '@/lib/utils'
import type { PromptTagSearchResult } from '@/types/prompt-tags'

interface StudioTagSuggestionsProps {
  /** 锚点 —— 补全浮层贴着这一块的下沿。 */
  anchorRef: RefObject<HTMLElement | null>
  results: readonly PromptTagSearchResult[]
  activeIndex: number
  onPick: (result: PromptTagSearchResult) => void
  listId: string
}

/**
 * 标签补全浮层。词库与打分复用既有的那一套（`searchPromptTags` +
 * `PROMPT_TAG_DEFINITIONS`，本地词表），⛔ 本轮不接远程词库。
 *
 * ⚠ 走 portal 而不是绝对定位：编辑器主区是一条 `overflow-y-auto` 的列，
 * 贴在里面的浮层会被那条滚动容器裁掉半截。定位按锚点的视口矩形算，
 * 滚动与窗口变化时重算。
 * ⚠ 不用 Radix Popover：焦点必须一直留在输入框里（方向键 / Enter 由它消费），
 * 而 Popover 的 FocusScope 会把焦点收进浮层 —— 与 LoRA 台那颗内联补全同一个
 * 取舍，见 `PromptTagAutocomplete` 的头注。
 */
export function StudioTagSuggestions({
  anchorRef,
  results,
  activeIndex,
  onPick,
  listId,
}: StudioTagSuggestionsProps) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor || results.length === 0) return
    const measure = () => setRect(anchor.getBoundingClientRect())
    // ⚠ 量在下一帧而不是 effect 里同步 setState —— 同步写会触发级联渲染
    // （eslint `set-state-in-effect`）。代价是浮层晚一帧出现，看不出来。
    const frame = requestAnimationFrame(measure)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [anchorRef, results.length])

  if (!rect || results.length === 0) return null

  return createPortal(
    <ul
      id={listId}
      role="listbox"
      style={{ top: rect.bottom + 4, left: rect.left, width: rect.width }}
      className="fixed z-50 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      {results.map((result, index) => {
        const tier = getPromptTagPopularityTier(result.tag.popularity)
        return (
          <li key={result.tag.id}>
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              // ⚠ mousedown 而不是 click：click 之前输入框已经 blur，
              // 而 blur 会收起浮层 —— 那一下点击就永远落空。
              onMouseDown={(event) => {
                event.preventDefault()
                onPick(result)
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-2xs transition-colors duration-fast ease-standard',
                index === activeIndex ? 'bg-accent' : 'hover:bg-accent/60',
              )}
            >
              {/* 熟悉度圆点 —— 无彩，靠 opacity 分三档（守颜料纪律）。 */}
              <span
                aria-hidden="true"
                className={cn(
                  'size-1.5 shrink-0 rounded-full bg-muted-foreground',
                  tier === 'high'
                    ? 'opacity-100'
                    : tier === 'mid'
                      ? 'opacity-60'
                      : 'opacity-25',
                )}
              />
              <span className="min-w-0 flex-1 truncate">
                {result.tag.promptText}
              </span>
              {result.tag.label !== result.tag.promptText ? (
                <span className="shrink-0 truncate text-3xs text-muted-foreground">
                  {result.tag.label}
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>,
    document.body,
  )
}
