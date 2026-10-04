'use client'

import { useEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import { getPromptTagPopularityTier } from '@/lib/prompt-tag-autocomplete'
import { cn } from '@/lib/utils'
import type { PromptTagSearchResult } from '@/types/prompt-tags'

const SUGGESTIONS_MAX_HEIGHT = 240
const SUGGESTIONS_GAP = 4

/** 联想浮层身上的标记：模态弹窗据此不把点联想当成「点外面」。 */
export const TAG_SUGGESTIONS_ATTR = 'data-tag-suggestions'

/** 这一下点在标签联想上（弹窗的 `onPointerDownOutside` 用）。 */
export function isTagSuggestionsTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(`[${TAG_SUGGESTIONS_ATTR}]`) !== null
  )
}

interface StudioTagSuggestionsProps {
  /** 锚点 —— 补全浮层贴着这一块的下沿。 */
  anchorRef: RefObject<HTMLElement | null>
  results: readonly PromptTagSearchResult[]
  activeIndex: number
  onPick: (result: PromptTagSearchResult) => void
  listId: string
}

/**
 * 标签补全浮层，接收编辑器提供的官方或本地候选。
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
  const [position, setPosition] = useState<{
    top?: number
    bottom?: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor || results.length === 0) return
    const viewport = window.visualViewport
    const measure = () => {
      const rect = anchor.getBoundingClientRect()
      const viewportTop = viewport?.offsetTop ?? 0
      const viewportBottom =
        viewportTop + (viewport?.height ?? window.innerHeight)
      const below = Math.max(0, viewportBottom - rect.bottom - SUGGESTIONS_GAP)
      const above = Math.max(0, rect.top - viewportTop - SUGGESTIONS_GAP)
      const opensUp = below < SUGGESTIONS_MAX_HEIGHT && above > below
      const maxHeight = Math.min(
        SUGGESTIONS_MAX_HEIGHT,
        opensUp ? above : below,
      )
      setPosition({
        ...(opensUp
          ? { bottom: window.innerHeight - rect.top + SUGGESTIONS_GAP }
          : { top: rect.bottom + SUGGESTIONS_GAP }),
        left: rect.left,
        width: rect.width,
        maxHeight,
      })
    }
    // ⚠ 量在下一帧而不是 effect 里同步 setState —— 同步写会触发级联渲染
    // （eslint `set-state-in-effect`）。代价是浮层晚一帧出现，看不出来。
    const frame = requestAnimationFrame(measure)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    viewport?.addEventListener('resize', measure)
    viewport?.addEventListener('scroll', measure)
    const observer = new ResizeObserver(measure)
    observer.observe(anchor)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
      viewport?.removeEventListener('resize', measure)
      viewport?.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [anchorRef, results.length])

  if (!position || results.length === 0) return null

  /**
   * ⚠ 在模态弹窗里（提示词页新建 / 编辑标签模板）：Radix 把 body 设成不接指针、点弹窗
   *   外面就关 —— 这一层挂在 body 上，所以自己接回指针（`pointer-events-auto`），并留一个
   *   标记让弹窗认出「点的是联想」（`TAG_SUGGESTIONS_ATTR`）。
   */
  return createPortal(
    <ul
      id={listId}
      role="listbox"
      {...{ [TAG_SUGGESTIONS_ATTR]: '' }}
      style={position}
      className="pointer-events-auto fixed z-50 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      {results.map((result, index) => {
        const tier = getPromptTagPopularityTier(result.tag.popularity)
        return (
          <li key={result.tag.id}>
            <button
              type="button"
              role="option"
              id={`${listId}-${index}`}
              tabIndex={-1}
              aria-selected={index === activeIndex}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onPick(result)}
              className={cn(
                'flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-fast ease-standard lg:min-h-0 lg:text-2xs',
                index === activeIndex ? 'bg-accent' : 'hover:bg-accent/60',
              )}
            >
              {result.tag.confidence !== 'official' && (
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
              )}
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
