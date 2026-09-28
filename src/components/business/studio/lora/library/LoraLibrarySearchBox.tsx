'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { History, Search, X } from '@/components/icons'
import { cn } from '@/lib/utils'

interface LoraLibrarySearchBoxProps {
  value: string
  onChange: (value: string) => void
  /** 回车 / 点放大镜。 */
  onSubmit: () => void
  /** 点一条「最近搜过」：直接搜这个词。 */
  onPickHistory: (term: string) => void
  history: readonly string[]
  onClearHistory: () => void
  /** 输入框里的字还没提交：放大镜变黑，提示回车才搜。 */
  pending: boolean
  /** 搜着：输入框底边一截黑线来回走（边即进度）。 */
  searching: boolean
  placeholder: string
}

/**
 * 库 B 那一行最左的搜索框（lora-library.md §3）：回车或点放大镜才搜，聚焦时下面
 * 列「最近搜过」。Civitai 与 Hugging Face 同一格，⛔ 各写一份。
 */
export function LoraLibrarySearchBox({
  value,
  onChange,
  onSubmit,
  onPickHistory,
  history,
  onClearHistory,
  pending,
  searching,
  placeholder,
}: LoraLibrarySearchBoxProps) {
  const t = useTranslations('LoraWorkbench')
  const tb = useTranslations('LoraWorkbench.browse')
  const [historyOpen, setHistoryOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!historyOpen) return
    const handler = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setHistoryOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [historyOpen])

  const submit = () => {
    onSubmit()
    setHistoryOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative min-w-0 flex-1">
      <div className="relative flex h-9 items-center gap-2 overflow-hidden rounded-xl border border-border bg-background px-3 transition-colors duration-fast ease-linear focus-within:border-foreground/40">
        <button
          type="button"
          onClick={submit}
          aria-label={t('communitySearchSubmit')}
          className={cn(
            'shrink-0 transition-colors duration-fast ease-linear hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            pending ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <Search className="size-3.5" aria-hidden />
        </button>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setHistoryOpen(true)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            submit()
          }}
          enterKeyHint="search"
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-full min-w-0 flex-1 bg-transparent text-2sm text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={tb('searchClear')}
            className="shrink-0 text-muted-foreground transition-colors duration-fast ease-linear hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
        {searching ? <span aria-hidden className="lora-search-run" /> : null}
      </div>
      {historyOpen && history.length > 0 ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-border bg-popover p-1 text-xs shadow-lg">
          <div className="flex items-center justify-between px-2 py-1 text-2xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <History className="size-3" aria-hidden />
              {t('searchHistoryTitle')}
            </span>
            <button
              type="button"
              onClick={() => {
                onClearHistory()
                setHistoryOpen(false)
              }}
              className="text-2xs text-muted-foreground hover:text-foreground"
            >
              {t('searchHistoryClear')}
            </button>
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {history.map((entry) => (
              <li key={entry}>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    onPickHistory(entry)
                    setHistoryOpen(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted"
                >
                  <Search
                    className="size-3 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="truncate">{entry}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
