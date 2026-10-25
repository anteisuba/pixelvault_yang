'use client'

import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'

import { StudioTagSuggestions } from '@/components/business/studio/tags/StudioTagSuggestions'
import { PROMPT_TAG_WEIGHT } from '@/constants/prompt-dialects'
import {
  PROMPT_TAG_AUTOCOMPLETE_MIN_QUERY_LENGTH,
  PROMPT_TAG_AUTOCOMPLETE_RESULT_LIMIT,
} from '@/constants/prompt-tags'
import { useNovelAiTagSuggestions } from '@/hooks/use-novelai-tag-suggestions'
import { NovelAiTagModelSchema } from '@/types/novelai-tags'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { searchPromptTags } from '@/lib/prompt-tag-search'
import {
  parseTagChips,
  serializeTagChips,
  splitTagRanges,
} from '@/lib/tag-composer'
import {
  deleteTagBefore,
  normalizeTagTextInput,
  replaceTagAt,
  stepTagWeightAt,
  tagQueryAt,
  tagRangeAt,
  type TagTextEdit,
} from '@/lib/tag-text-editing'
import { cn } from '@/lib/utils'
import type { PromptPolarity, PromptTagSearchResult } from '@/types/prompt-tags'
import type { TagChip } from '@/types/tag-composer'

interface StudioTagTextFieldProps {
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
   * `form` = 弹窗表单里（提示词页新建 / 编辑标签模板）：标题同表单别的栏、等宽字。
   * `bare` = 只有框、没有标题：标签台桌面输入框，写的是谁由上面那排页签说，
   * `label` 只给读屏。
   */
  variant?: 'stacked' | 'form' | 'composer' | 'bare'
  /** 空框里的那句提示；缺省「输入标签，逗号分隔…」。 */
  placeholder?: string
  /** 底下画一道线的那几个标签（小写比较）：人数提示正在说的 `1girl` 之类。 */
  markedTags?: readonly string[]
  /** 框底下那行状态（带过来的那一句正在翻成标签…）。 */
  status?: ReactNode
  /** Ctrl / ⌘ + 点一个标签：去标签库看它的详情（桌面标签台）。 */
  onLookup?: (chip: TagChip) => void
}

/**
 * 一栏标签 = **一段逗号分隔的纯文本**（owner 2026-10-24 ㉘「不做框了，直接纯文本」）。
 * 正向与负向同一颗组件。
 *
 * - 框里写的就是存储串：`1girl, rain:1.2, neon city`。权重就写在字里，⌘↑ / ⌘↓
 *   给光标所在的标签 ±0.05；发请求时照旧翻成 NAI `{}` / PixAI `()`。
 * - 删就是删字：拖选 ⌫、⌘A；双击选中整个标签；⌥⌫ 删掉光标前的整个标签。
 * - 补全按光标所在那一段查（NAI 官方 / 其余本地词表），选中整段替换并补 `, `。
 * - 平时素文字，权重后缀浅一档；光标所在的那个标签底下一层淡灰（㉘②，`fill-strong`）。
 *
 * ⚠ 做法是一层「镜像」垫在透明字的 textarea 下面：镜像画字和淡灰，textarea 只管光标
 * 与选区。两层的字号、行高、内边距必须同一套（`textLayer`），否则淡灰对不上字。
 */
export function StudioTagTextField({
  label,
  modelId,
  note,
  polarity,
  chips,
  disabled,
  onChange,
  variant = 'stacked',
  placeholder,
  markedTags,
  status,
  onLookup,
}: StudioTagTextFieldProps) {
  const t = useTranslations('StudioTags')
  const tModels = useTranslations('Models')
  const boxRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const listId = useId()
  const serialized = serializeTagChips(chips)
  const [text, setText] = useState(serialized)
  /**
   * 外面传进来的串一变（套模板、撤销、查资料加进来、助手改）且跟框里写的不是一回事，
   * 就整段换掉；是框里这段字本身（自己刚发出去的那一版）就不动 —— 打到一半的
   * `rain, ` / `rain:1.` 留在框里。
   */
  const [seen, setSeen] = useState(serialized)
  if (serialized !== seen) {
    setSeen(serialized)
    if (serialized !== serializeTagChips(parseTagChips(text)))
      setText(serialized)
  }
  const [caret, setCaret] = useState<{ start: number; end: number } | null>(
    null,
  )
  const [activeIndex, setActiveIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const focused = caret !== null

  const emit = (next: string) => {
    setText(next)
    const parsed = parseTagChips(next)
    if (serializeTagChips(parsed) !== serialized) onChange(parsed)
  }

  /** 整块改字后光标该落在哪：等 React 把新字写进 textarea 再摆（不然会跳到末尾）。 */
  const pendingSelection = useRef<{ start: number; end: number } | null>(null)
  useLayoutEffect(() => {
    const selection = pendingSelection.current
    if (!selection) return
    pendingSelection.current = null
    inputRef.current?.setSelectionRange(selection.start, selection.end)
  })
  const apply = (edit: TagTextEdit) => {
    emit(edit.text)
    setCaret(edit.selection)
    pendingSelection.current = edit.selection
  }

  const collapsed = caret !== null && caret.start === caret.end
  const query =
    collapsed && !dismissed && !disabled ? tagQueryAt(text, caret.end) : ''

  const parsedModel = NovelAiTagModelSchema.safeParse(modelId)
  const novelAiModel = parsedModel.success ? parsedModel.data : undefined
  const official = useNovelAiTagSuggestions(
    novelAiModel,
    query,
    focused && !disabled,
  )
  const localResults = useMemo(() => {
    if (novelAiModel || query.length < PROMPT_TAG_AUTOCOMPLETE_MIN_QUERY_LENGTH)
      return []
    return searchPromptTags({
      query,
      polarity,
      limit: PROMPT_TAG_AUTOCOMPLETE_RESULT_LIMIT,
    })
  }, [query, polarity, novelAiModel])
  const results: PromptTagSearchResult[] = !query
    ? []
    : novelAiModel
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

  const pick = (result: PromptTagSearchResult) => {
    apply(replaceTagAt(text, caret?.end ?? text.length, result.tag.promptText))
    setActiveIndex(0)
  }

  const readCaret = () => {
    const input = inputRef.current
    if (!input) return
    setCaret({ start: input.selectionStart, end: input.selectionEnd })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    const input = event.currentTarget
    const at = input.selectionEnd
    const mod = event.metaKey || event.ctrlKey
    if (mod && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      const edit = stepTagWeightAt(
        text,
        at,
        event.key === 'ArrowUp'
          ? PROMPT_TAG_WEIGHT.STEP
          : -PROMPT_TAG_WEIGHT.STEP,
      )
      if (edit) apply(edit)
      return
    }
    if (
      event.key === 'Backspace' &&
      event.altKey &&
      input.selectionStart === input.selectionEnd
    ) {
      const edit = deleteTagBefore(text, at)
      if (edit) {
        event.preventDefault()
        apply(edit)
      }
      return
    }
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
        pick(results[activeIndex] ?? results[0]!)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setDismissed(true)
        return
      }
    }
    // 标签串里不换行：回车只收起补全。
    if (event.key === 'Enter') event.preventDefault()
  }

  const composer = variant === 'composer'
  const form = variant === 'form'
  const bare = variant === 'bare'

  /** 两层共用：字号、行高、内边距、折行，差一点淡灰就对不上字。 */
  const textLayer = cn(
    'whitespace-pre-wrap break-words text-base leading-6',
    form ? 'font-mono md:text-xs md:leading-5' : 'md:text-2xs md:leading-5',
    bare || composer ? 'py-1.5' : 'p-2',
  )

  // ⚠ 镜像只在有焦点、光标没拖选时画淡灰；拖选时让浏览器自己的选区色说话。
  const current = collapsed ? tagRangeAt(text, caret.end) : null
  const marked = new Set(markedTags?.map((tag) => tag.toLowerCase()))
  const mirror = splitTagRanges(text).map((range, index) => {
    const segment = text.slice(range.start, range.end)
    const lead = segment.length - segment.trimStart().length
    const body = segment.trim()
    const start = range.start + lead
    const chip = body ? parseTagChips(body)[0] : undefined
    const isCurrent = current !== null && current.start === start
    const isMarked = chip ? marked.has(chip.text.toLowerCase()) : false
    return (
      <span key={index}>
        {index > 0 ? ',' : null}
        {segment.slice(0, lead)}
        {body ? (
          <span
            className={cn(
              'rounded-sm box-decoration-clone',
              isCurrent && 'bg-fill-strong',
              isMarked &&
                'underline decoration-foreground decoration-2 underline-offset-4',
            )}
          >
            {chip && chip.text.length < body.length ? (
              <>
                {chip.text}
                {/* 权重后缀浅一档：`blue hair:1.2`（ui-spec ㉘）。 */}
                <span className="text-muted-foreground">
                  {body.slice(chip.text.length)}
                </span>
              </>
            ) : (
              body
            )}
          </span>
        ) : null}
        {segment.slice(lead + body.length)}
      </span>
    )
  })

  return (
    <div className="flex flex-col gap-1.5">
      {bare ? null : (
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
      <div
        ref={boxRef}
        // ⚠ `contain-inline-size`：一整段很长的串（自然语言整句带过来）的最小内容宽度
        //   会沿 flex 链往上传，把整个工作台撑出视口（owner 2026-09-26 报）。
        className={cn(
          'relative min-w-0 contain-inline-size',
          bare
            ? 'max-h-32 min-h-9 overflow-y-auto'
            : composer
              ? 'max-h-24 min-h-8 flex-1 overflow-y-auto'
              : form
                ? cn(
                    'max-h-48 overflow-y-auto rounded-xl border bg-background transition-colors duration-fast ease-standard',
                    polarity === 'positive' ? 'min-h-28' : 'min-h-16',
                    focused ? 'border-foreground' : 'border-border',
                  )
                : cn(
                    'max-h-48 min-h-24 overflow-y-auto rounded-lg border bg-background transition-colors duration-fast ease-standard lg:max-h-none lg:min-h-18',
                    focused
                      ? 'border-primary/40 ring-2 ring-primary/10'
                      : 'border-border',
                  ),
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <div className="relative">
          {/* 末尾垫一个零宽字：最后一行是空的时候镜像也撑得出那一行的高。 */}
          <div aria-hidden className={cn(textLayer, 'pointer-events-none')}>
            {mirror}
            {'​'}
          </div>
          <textarea
            ref={inputRef}
            data-tag-polarity={polarity}
            value={text}
            disabled={disabled}
            rows={1}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-activedescendant={
              results.length
                ? `${listId}-${Math.min(activeIndex, results.length - 1)}`
                : undefined
            }
            aria-autocomplete="list"
            aria-label={label}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            placeholder={placeholder ?? t('placeholder')}
            onFocus={readCaret}
            onBlur={() => {
              setCaret(null)
              setDismissed(false)
            }}
            onSelect={readCaret}
            onChange={(event) => {
              setActiveIndex(0)
              setDismissed(false)
              emit(normalizeTagTextInput(event.target.value))
              setCaret({
                start: event.target.selectionStart,
                end: event.target.selectionEnd,
              })
            }}
            onKeyDown={handleKeyDown}
            onClick={(event) => {
              if (!onLookup || !(event.metaKey || event.ctrlKey)) return
              const range = tagRangeAt(text, event.currentTarget.selectionEnd)
              const chip = range
                ? parseTagChips(text.slice(range.start, range.end))[0]
                : undefined
              if (chip) onLookup(chip)
            }}
            onDoubleClick={(event) => {
              const range = tagRangeAt(text, event.currentTarget.selectionStart)
              if (!range) return
              event.currentTarget.setSelectionRange(range.start, range.end)
              setCaret(range)
            }}
            // ⚠ <768 必须 ≥16px（`text-base`），否则 iOS 聚焦即放大整页。
            className={cn(
              textLayer,
              'absolute inset-0 size-full resize-none overflow-hidden bg-transparent text-transparent caret-foreground outline-none placeholder:text-muted-foreground/60',
            )}
          />
        </div>
      </div>
      {novelAiModel && official.active && query ? (
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
      ) : null}
      {status}
      <StudioTagSuggestions
        anchorRef={boxRef}
        results={results}
        activeIndex={activeIndex}
        listId={listId}
        onPick={(result) => {
          pick(result)
          inputRef.current?.focus()
        }}
      />
    </div>
  )
}
