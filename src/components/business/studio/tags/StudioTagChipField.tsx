'use client'

import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { StudioTagChip } from '@/components/business/studio/tags/StudioTagChip'
import { StudioTagSuggestions } from '@/components/business/studio/tags/StudioTagSuggestions'
import { DURATION, EASE_STANDARD } from '@/constants/motion'
import {
  PROMPT_TAG_AUTOCOMPLETE_MIN_QUERY_LENGTH,
  PROMPT_TAG_AUTOCOMPLETE_RESULT_LIMIT,
} from '@/constants/prompt-tags'
import { useNovelAiTagSuggestions } from '@/hooks/use-novelai-tag-suggestions'
import { NovelAiTagModelSchema } from '@/types/novelai-tags'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { searchPromptTags } from '@/lib/prompt-tag-search'
import { parseTagChips } from '@/lib/tag-composer'
import { cn } from '@/lib/utils'
import type { PromptPolarity, PromptTagSearchResult } from '@/types/prompt-tags'
import type { TagChip } from '@/types/tag-composer'

interface StudioTagChipFieldProps {
  label: string
  modelId?: string
  /** 标题右边那行小字（负向栏用它说「NAI 叫 UC」）。 */
  note?: string
  polarity: PromptPolarity
  chips: readonly TagChip[]
  disabled?: boolean
  onChange: (chips: TagChip[]) => void
  /**
   * `stacked` = 标题在上 + 一个描边框（参数栏 / 手机，缺省）。
   * `inline` = 标题在左、格子直接排在输入框卡里，⛔ 不再套一个框（桌面底部输入框，
   * owner 2026-09-26 原型）。
   * `form` = 弹窗表单里（提示词页新建 / 编辑标签模板，画板 `TgA_New`）：标题同表单
   * 别的栏、格子浅底等宽，正向那一栏高一些。
   */
  variant?: 'stacked' | 'inline' | 'form' | 'composer'
  /** 格子底下那行状态（带过来的那一句正在翻成标签…）。 */
  status?: ReactNode
}

/**
 * 一栏标签 —— 正向与负向**同一颗组件**（D10 ④：负向栏在 NAI 语境里叫 UC，
 * 标题旁一行小字说明即可，⛔ 不为此分叉出两个组件）。
 *
 * 逗号 / 回车分隔成格；NAI 使用官方补全，其余模型使用本地词表；
 * 空输入框上按退格删掉最后一格。
 */
export function StudioTagChipField({
  label,
  modelId,
  note,
  polarity,
  chips,
  disabled,
  onChange,
  variant = 'stacked',
  status,
}: StudioTagChipFieldProps) {
  const t = useTranslations('StudioTags')
  const tModels = useTranslations('Models')
  const reducedMotion = useReducedMotion()
  const boxRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listId = useId()
  const [draft, setDraft] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [focused, setFocused] = useState(false)
  /**
   * 每格按「字 + 第几次出现」认身份，⛔ 不按下标：往最前面插一格时别的格才不会被当成
   * 新的重挂一遍。第一次画出来时就在的那些格不演落进来的动画（换页 / 刷新不闪）。
   */
  const chipKeys = useMemo(() => {
    const seen = new Map<string, number>()
    return chips.map((chip) => {
      const n = seen.get(chip.text) ?? 0
      seen.set(chip.text, n + 1)
      return `${chip.text}\u0000${n}`
    })
  }, [chips])
  const [firstKeys] = useState(() => new Set(chipKeys))
  /**
   * 用户亲手删的那一格（× / 退格）才演退场：缩小淡出，后面几格滑过去补位（`TgMotion`）。
   * 整排被换掉（套用模板 · 撤销）时旧的直接拿掉 —— ⛔ 几十格一起淡出叠在新的上面。
   */
  const [removedKey, setRemovedKey] = useState<string | null>(null)
  const removeAt = (index: number) => {
    setRemovedKey(chipKeys[index] ?? null)
    onChange(chips.filter((_, i) => i !== index))
  }
  const chipLayout = reducedMotion ? false : ('position' as const)
  const chipTransition = {
    layout: { duration: DURATION.base, ease: EASE_STANDARD },
  }
  const chipExit = (own: boolean) =>
    !own
      ? { opacity: 0, transition: { duration: 0 } }
      : reducedMotion
        ? {
            opacity: 0,
            transition: { duration: DURATION.fast, ease: 'linear' as const },
          }
        : {
            opacity: 0,
            scale: 0.9,
            transition: { duration: DURATION.fast, ease: EASE_STANDARD },
          }

  const parsedModel = NovelAiTagModelSchema.safeParse(modelId)
  const novelAiModel = parsedModel.success ? parsedModel.data : undefined
  const official = useNovelAiTagSuggestions(
    novelAiModel,
    draft,
    focused && !disabled,
  )
  const localResults = useMemo(() => {
    const query = draft.trim()
    if (
      novelAiModel ||
      !focused ||
      query.length < PROMPT_TAG_AUTOCOMPLETE_MIN_QUERY_LENGTH
    ) {
      return []
    }
    return searchPromptTags({
      query,
      polarity,
      limit: PROMPT_TAG_AUTOCOMPLETE_RESULT_LIMIT,
    })
  }, [draft, focused, polarity, novelAiModel])
  const results: PromptTagSearchResult[] = novelAiModel
    ? official.tags
        .slice(0, PROMPT_TAG_AUTOCOMPLETE_RESULT_LIMIT)
        .map((item) => ({
          tag: {
            id: `novelai:${novelAiModel}:${item.tag}`,
            promptText: item.tag,
            label: item.tag,
            source: 'model_keyword',
            confidence: 'official',
            type: 'subject',
            aliases: [],
            category: 'novelai',
            polarity,
            modelFamilies: ['novelai'],
            modelIds: [novelAiModel],
            orderGroup: 40,
          },
          score: 0,
          isSelected: false,
        }))
    : localResults

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
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
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
      removeAt(chips.length - 1)
    }
  }

  const composer = variant === 'composer'
  const inline = variant === 'inline'
  const form = variant === 'form'

  return (
    <div
      className={inline ? 'flex items-start gap-2.5' : 'flex flex-col gap-1.5'}
    >
      {inline ? (
        <span
          title={note}
          // 行高 = 格子第一行（`h-8`）：标题与占位字 / 第一排标签落在同一条中线上，
          // ⛔ 别用 `pt-*` 凑 —— 占位字那一行只有一行字高，凑出来的是错位。
          className="w-18 shrink-0 text-2xs leading-8 font-medium text-muted-foreground"
        >
          {label}
        </span>
      ) : (
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={
              form
                ? 'text-xs font-semibold text-muted-foreground'
                : 'text-sm font-medium lg:text-2xs'
            }
          >
            {label}
          </span>
          <span
            className={cn(
              'truncate text-muted-foreground',
              form ? 'text-2xs' : 'text-xs lg:text-3xs',
            )}
          >
            {note ?? t('tagCount', { count: chips.length })}
          </span>
        </div>
      )}
      {/* 行内那一版：格子与官方补全那行小字叠成一列，排在标题右边。 */}
      <div
        className={inline ? 'flex min-w-0 flex-1 flex-col gap-1' : 'contents'}
      >
        <div
          ref={boxRef}
          onClick={(event) => {
            if (
              event.target instanceof Element &&
              (!event.currentTarget.contains(event.target) ||
                event.target.closest('button'))
            )
              return
            inputRef.current?.focus()
          }}
          // ⚠ `contain-inline-size`：一颗超长的格（自然语言整段带过来）的最小内容
          //   宽度会沿 flex 链一路往上传，把整个工作台撑出视口（owner 2026-09-26
          //   报）。这一栏的宽度只听外面的，里面再长也只在栏内截断。
          // `relative`：删掉的那一格退场时脱开排版（popLayout），按这一块定位。
          className={cn(
            'relative contain-inline-size',
            inline || composer
              ? 'flex max-h-24 min-h-8 min-w-0 flex-1 flex-wrap content-start items-center gap-1.5 overflow-y-auto'
              : form
                ? cn(
                    'flex max-h-48 flex-wrap content-start gap-1 overflow-y-auto rounded-xl border bg-background p-2 transition-colors duration-fast ease-standard',
                    polarity === 'positive' ? 'min-h-28' : 'min-h-16',
                    focused ? 'border-foreground' : 'border-border',
                  )
                : cn(
                    'flex max-h-48 min-h-24 overflow-y-auto lg:min-h-18 lg:max-h-none flex-wrap content-start gap-1.5 rounded-lg border bg-background p-2 transition-colors duration-fast ease-standard',
                    focused
                      ? 'border-primary/40 ring-2 ring-primary/10'
                      : 'border-border',
                  ),
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          <AnimatePresence initial={false} mode="popLayout" custom={removedKey}>
            {chips.map((chip, index) => {
              const key = chipKeys[index]!
              return (
                <motion.span
                  key={key}
                  layout={chipLayout}
                  transition={chipTransition}
                  variants={{
                    exit: (removed: string | null) => chipExit(removed === key),
                  }}
                  exit="exit"
                  className="inline-flex min-w-0 max-w-full"
                >
                  <StudioTagChip
                    look={form ? 'plain' : 'bench'}
                    landing={!firstKeys.has(key)}
                    chip={chip}
                    disabled={disabled}
                    onChange={(next) =>
                      onChange(
                        chips.map((item, i) => (i === index ? next : item)),
                      )
                    }
                    onRemove={() => removeAt(index)}
                  />
                </motion.span>
              )
            })}
          </AnimatePresence>
          <motion.input
            layout={chipLayout}
            transition={chipTransition}
            ref={inputRef}
            data-tag-polarity={polarity}
            value={draft}
            disabled={disabled}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-activedescendant={
              results.length
                ? `${listId}-${Math.min(activeIndex, results.length - 1)}`
                : undefined
            }
            aria-autocomplete="list"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="enter"
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
              if (
                next.includes(',') &&
                !next.includes('::') &&
                !/[{}\[\]]/.test(next)
              ) {
                const pieces = next.split(',')
                commit(pieces.slice(0, -1).join(','))
                setDraft(pieces[pieces.length - 1].trimStart())
                return
              }
              setDraft(next)
            }}
            onKeyDown={handleKeyDown}
            // ⚠ <768 必须 ≥16px，否则 iOS 聚焦即放大整页。
            className={cn(
              'min-h-11 min-w-24 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/60 lg:min-h-0',
              form ? 'h-5.5 font-mono md:text-xs' : 'md:text-2xs',
              inline && 'h-8',
            )}
          />
        </div>
        {novelAiModel && official.active && (
          <p role="status" className="text-3xs text-muted-foreground">
            {official.loading
              ? t('officialTagsLoading')
              : official.error
                ? t(
                    official.error === 'MISSING_API_KEY'
                      ? 'officialTagsKeyRequired'
                      : 'officialTagsError',
                  )
                : t(
                    official.tags.length
                      ? 'officialTagsSource'
                      : 'officialTagsEmpty',
                    {
                      model: getTranslatedModelLabel(tModels, novelAiModel),
                    },
                  )}
          </p>
        )}
        {status}
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
