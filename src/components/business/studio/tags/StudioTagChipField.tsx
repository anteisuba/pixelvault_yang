'use client'

import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'

import { StudioTagChip } from '@/components/business/studio/tags/StudioTagChip'
import { StudioTagSuggestions } from '@/components/business/studio/tags/StudioTagSuggestions'
import {
  PROMPT_TAG_AUTOCOMPLETE_MIN_QUERY_LENGTH,
  PROMPT_TAG_AUTOCOMPLETE_RESULT_LIMIT,
} from '@/constants/prompt-tags'
import { searchPromptTags } from '@/lib/prompt-tag-search'
import { parseTagChips } from '@/lib/tag-composer'
import { cn } from '@/lib/utils'
import type { PromptPolarity } from '@/types/prompt-tags'
import type { TagChip } from '@/types/tag-composer'

interface StudioTagChipFieldProps {
  label: string
  /** 标题右边那行小字（负向栏用它说「NAI 叫 UC」）。 */
  note?: string
  polarity: PromptPolarity
  chips: readonly TagChip[]
  disabled?: boolean
  onChange: (chips: TagChip[]) => void
}

/**
 * 一栏标签 —— 正向与负向**同一颗组件**（D10 ④：负向栏在 NAI 语境里叫 UC，
 * 标题旁一行小字说明即可，⛔ 不为此分叉出两个组件）。
 *
 * 逗号 / 回车分隔成格；输入时给 danbooru 补全（本地词表，⛔ 本轮不接远程词库）；
 * 空输入框上按退格删掉最后一格。
 */
export function StudioTagChipField({
  label,
  note,
  polarity,
  chips,
  disabled,
  onChange,
}: StudioTagChipFieldProps) {
  const t = useTranslations('StudioTags')
  const boxRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listId = useId()
  const [draft, setDraft] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [focused, setFocused] = useState(false)

  const results = useMemo(() => {
    const query = draft.trim()
    if (!focused || query.length < PROMPT_TAG_AUTOCOMPLETE_MIN_QUERY_LENGTH) {
      return []
    }
    return searchPromptTags({
      query,
      polarity,
      limit: PROMPT_TAG_AUTOCOMPLETE_RESULT_LIMIT,
    })
  }, [draft, focused, polarity])

  /** 把一段文本收成格子：逗号切、去重（同一个词送两遍等于被悄悄加权）。 */
  const commit = (text: string) => {
    const incoming = parseTagChips(text)
    if (incoming.length === 0) return
    const seen = new Set(chips.map((chip) => chip.text.toLowerCase()))
    const added = incoming.filter((chip) => {
      const key = chip.text.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (added.length === 0) return
    onChange([...chips, ...added])
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (results.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((index) => (index + 1) % results.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((index) => (index - 1 + results.length) % results.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        const picked = results[activeIndex] ?? results[0]
        commit(picked.tag.promptText)
        setDraft('')
        setActiveIndex(0)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setDraft('')
        return
      }
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      commit(draft)
      setDraft('')
      return
    }
    // 空输入框上退格 = 删掉最后一格。有字时让它做本职工作。
    if (event.key === 'Backspace' && draft.length === 0 && chips.length > 0) {
      event.preventDefault()
      onChange(chips.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xs font-medium">{label}</span>
        <span className="truncate text-3xs text-muted-foreground">
          {note ?? t('tagCount', { count: chips.length })}
        </span>
      </div>
      <div
        ref={boxRef}
        onClick={() => inputRef.current?.focus()}
        className={cn(
          'flex min-h-18 flex-wrap content-start gap-1.5 rounded-lg border bg-background p-2 transition-colors duration-fast ease-standard',
          focused
            ? 'border-primary/40 ring-2 ring-primary/10'
            : 'border-border',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        {chips.map((chip, index) => (
          <StudioTagChip
            key={`${chip.text}-${index}`}
            chip={chip}
            disabled={disabled}
            onChange={(next) =>
              onChange(chips.map((item, i) => (i === index ? next : item)))
            }
            onRemove={() => onChange(chips.filter((_, i) => i !== index))}
          />
        ))}
        <input
          ref={inputRef}
          value={draft}
          disabled={disabled}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={label}
          placeholder={chips.length === 0 ? t('placeholder') : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            // 失焦时把半截的词收成一格 —— 否则用户以为已经加上了。
            commit(draft)
            setDraft('')
          }}
          onChange={(event) => {
            const next = event.target.value
            setActiveIndex(0)
            // 打到逗号就落格，最后一段留在输入框里继续写。
            if (next.includes(',')) {
              const pieces = next.split(',')
              commit(pieces.slice(0, -1).join(','))
              setDraft(pieces[pieces.length - 1].trimStart())
              return
            }
            setDraft(next)
          }}
          onKeyDown={handleKeyDown}
          // ⚠ <768 必须 ≥16px，否则 iOS 聚焦即放大整页。
          className="min-w-24 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/60 md:text-2xs"
        />
      </div>
      <StudioTagSuggestions
        anchorRef={boxRef}
        results={results}
        activeIndex={activeIndex}
        listId={listId}
        onPick={(result) => {
          commit(result.tag.promptText)
          setDraft('')
          setActiveIndex(0)
          inputRef.current?.focus()
        }}
      />
    </div>
  )
}
