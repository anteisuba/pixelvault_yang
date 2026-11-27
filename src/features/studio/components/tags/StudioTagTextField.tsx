'use client'

import {
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { StudioTagCooccurrencePopover } from '@/features/studio/components/tags/StudioTagCooccurrencePopover'
import { StudioTagSuggestions } from '@/features/studio/components/tags/StudioTagSuggestions'
import { PROMPT_TAG_WEIGHT } from '@/constants/prompt-dialects'
import {
  PROMPT_TAG_AUTOCOMPLETE_MIN_QUERY_LENGTH,
  PROMPT_TAG_AUTOCOMPLETE_RESULT_LIMIT,
} from '@/constants/prompt-tags'
import { useBilingualTagSuggestions } from '@/hooks/use-bilingual-tag-suggestions'
import { useNovelAiTagSuggestions } from '@/hooks/use-novelai-tag-suggestions'
import { useTagMetaLookup } from '@/hooks/use-tag-meta-lookup'
import {
  NovelAiTagModelSchema,
  type NovelAiTagSuggestion,
} from '@/types/novelai-tags'
import type { DanbooruTagMetaEntry } from '@/types/tag-assist'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { searchPromptTags } from '@/lib/prompt-tag-search'
import {
  parseTagChips,
  parseWeightedSegment,
  serializeTagChips,
  splitTagRanges,
} from '@/lib/tag-composer'
import { compactPostCount } from '@/lib/tag-lookup'
import {
  getNovelAiRecognitionTier,
  hasCjkOrNonAscii,
  pickLocalizedTagName,
  toDanbooruUnderscoreTag,
} from '@/lib/tag-recognition'
import {
  deleteTagBefore,
  flipTagWeightAt,
  normalizeTagTextInput,
  replaceTagAt,
  selectedTagsInRange,
  stepTagWeightAt,
  tagQueryAt,
  tagRangeAt,
  type TagTextEdit,
} from '@/lib/tag-text-editing'
import { cn } from '@/lib/utils'
import type { PromptPolarity, PromptTagSearchResult } from '@/types/prompt-tags'
import type { TagChip } from '@/types/tag-composer'

export interface StudioTagTextFieldHandle {
  /** 选中第 `index` 个标签并把焦点移回输入框（供 5B-1 译文芯片带点击定位用）。 */
  focusTagAt: (index: number) => void
}

interface StudioTagTextFieldProps {
  fieldRef?: Ref<StudioTagTextFieldHandle>
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
  /**
   * 仅桌面工作台左侧列使用：
   * - `panel` = 左栏主正向框（更高、支持更多行）
   * - `panel-compact` = 左栏负向框（13px、更紧凑）
   */
  panelDensity?: 'panel' | 'panel-compact'
  /** 聚焦在某个标签上时，展示就地微调权重键（− / 当前倍率 / + / 负权），鼠标党无需背快捷键。 */
  showWeightControls?: boolean
  /** 允许 Ctrl/⌘+拖选或选区按钮查看 Danbooru 共现标签（5B-4）。 */
  enableCooccurrence?: boolean
  /** 外部共享的标签元信息缓存（供 5B-1 原位中文对照与聚焦条复用，避免重复请求）。 */
  tagMeta?: Readonly<Record<string, DanbooruTagMetaEntry>>
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
  fieldRef,
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
  panelDensity,
  showWeightControls = false,
  enableCooccurrence = false,
  tagMeta,
}: StudioTagTextFieldProps) {
  const locale = useLocale()
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
  /**
   * 补全只为**正在打字**开（owner 11-21 真机：套模板后光标被放进框末尾，最后一个
   * 标签被当成查询词，整块补全自己弹开）。聚焦 / 摆光标 / 外面整段换字（套模板、
   * 做同款、撤销、助手改）都不算打字；只有框里真的改了字（`onChange`）才开，
   * 失焦、Esc、外面换字时收起。
   */
  const [typing, setTyping] = useState(false)
  const [seen, setSeen] = useState(serialized)
  if (serialized !== seen) {
    setSeen(serialized)
    if (serialized !== serializeTagChips(parseTagChips(text))) {
      setText(serialized)
      setTyping(false)
    }
  }
  const [caret, setCaret] = useState<{ start: number; end: number } | null>(
    null,
  )
  const [activeIndex, setActiveIndex] = useState(0)
  const [cooccurrenceTags, setCooccurrenceTags] = useState<string[]>([])
  const focused = caret !== null

  useImperativeHandle(fieldRef, () => ({
    focusTagAt(index: number) {
      const input = inputRef.current
      if (!input) return
      const nonEmptyRanges = splitTagRanges(text)
        .map((range) => {
          let s = range.start
          let e = range.end
          while (s < e && /\s/.test(text[s]!)) s++
          while (e > s && /\s/.test(text[e - 1]!)) e--
          return { start: s, end: e }
        })
        .filter((range) => range.start < range.end)
      const target = nonEmptyRanges[index]
      if (!target) return
      input.focus()
      input.setSelectionRange(target.start, target.end)
      setCaret({ start: target.start, end: target.end })
      setTyping(false)
    },
  }))

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
    collapsed && typing && !disabled ? tagQueryAt(text, caret.end) : ''

  const parsedModel = NovelAiTagModelSchema.safeParse(modelId)
  const novelAiModel = parsedModel.success ? parsedModel.data : undefined
  const queryIsNonAscii = hasCjkOrNonAscii(query)
  const official = useNovelAiTagSuggestions(
    novelAiModel,
    query,
    focused && !disabled,
  )
  const localResults = useMemo(() => {
    if (
      novelAiModel ||
      queryIsNonAscii ||
      query.length < PROMPT_TAG_AUTOCOMPLETE_MIN_QUERY_LENGTH
    )
      return []
    return searchPromptTags({
      query,
      polarity,
      limit: PROMPT_TAG_AUTOCOMPLETE_RESULT_LIMIT,
    })
  }, [query, queryIsNonAscii, polarity, novelAiModel])

  const useBilingualFallback =
    !novelAiModel &&
    focused &&
    !disabled &&
    Boolean(query) &&
    (queryIsNonAscii || (localResults.length === 0 && query.length >= 4))
  const bilingual = useBilingualTagSuggestions(query, useBilingualFallback)

  const mapServerSuggestion = (
    item: NovelAiTagSuggestion,
    idPrefix: string,
  ): PromptTagSearchResult => {
    const localized = pickLocalizedTagName(item, locale)
    const matchSource = item.source ?? 'official'
    const hasMetrics =
      typeof item.count === 'number' ||
      typeof item.confidence === 'number' ||
      matchSource !== 'official'
    return {
      tag: {
        id: `${idPrefix}:${item.tag}`,
        promptText: item.tag,
        label: localized ?? item.tag,
        source: matchSource === 'official' ? 'model_keyword' : 'danbooru',
        confidence: matchSource === 'official' ? 'official' : 'inferred',
        type: 'subject',
        aliases: [],
        category: novelAiModel ? 'novelai' : 'danbooru',
        polarity,
        modelFamilies: [novelAiModel ? 'novelai' : 'any'],
        ...(novelAiModel ? { modelIds: [novelAiModel] } : {}),
        orderGroup: 40,
      },
      score: 0,
      isSelected: false,
      postCount: item.count,
      recognition: hasMetrics
        ? getNovelAiRecognitionTier({
            count: item.count,
            confidence: item.confidence,
            source: matchSource,
          })
        : undefined,
      matchSource,
      note: item.zhNote ?? null,
    }
  }

  const results: PromptTagSearchResult[] = !query
    ? []
    : novelAiModel
      ? official.tags
          .slice(0, PROMPT_TAG_AUTOCOMPLETE_RESULT_LIMIT)
          .map((item) => mapServerSuggestion(item, `novelai:${novelAiModel}`))
      : localResults.length > 0
        ? localResults
        : bilingual.tags
            .slice(0, PROMPT_TAG_AUTOCOMPLETE_RESULT_LIMIT)
            .map((item) => mapServerSuggestion(item, 'danbooru'))

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
      const step = event.shiftKey
        ? PROMPT_TAG_WEIGHT.COARSE_STEP
        : PROMPT_TAG_WEIGHT.STEP
      const edit = stepTagWeightAt(
        text,
        at,
        event.key === 'ArrowUp' ? step : -step,
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
        setTyping(false)
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
    form
      ? 'font-mono md:text-2sm md:leading-5'
      : panelDensity === 'panel-compact'
        ? 'md:text-2sm md:leading-relaxed'
        : 'md:text-md md:leading-reading', // 输入框里的标签 = 提示词 15 / 1.7（ui-spec §4，owner 2026-11-11 小样 4 选 C）
    bare || composer ? 'py-1' : 'p-2',
  )

  // ⚠ 镜像只在有焦点、光标没拖选时画淡灰；拖选时让浏览器自己的选区色说话。
  const current = collapsed ? tagRangeAt(text, caret.end) : null
  const selectedTags = useMemo(
    () =>
      enableCooccurrence && caret && caret.start !== caret.end
        ? selectedTagsInRange(text, caret.start, caret.end)
        : [],
    [caret, enableCooccurrence, text],
  )
  const existingTagKeys = useMemo(
    () => new Set(chips.map((chip) => chip.text.trim().toLowerCase())),
    [chips],
  )
  const toggleCooccurringTag = (promptTag: string) => {
    const key = promptTag.trim().toLowerCase()
    const next = existingTagKeys.has(key)
      ? chips.filter((chip) => chip.text.trim().toLowerCase() !== key)
      : [...chips, { text: promptTag, weight: PROMPT_TAG_WEIGHT.DEFAULT }]
    onChange(next)
  }
  const activeWeightChip =
    current !== null
      ? parseWeightedSegment(text.slice(current.start, current.end).trim())
      : null
  const activeTagKey = activeWeightChip
    ? toDanbooruUnderscoreTag(activeWeightChip.text)
    : ''
  const activeLookupList = activeTagKey && !tagMeta ? [activeTagKey] : []
  const singleMetaLookup = useTagMetaLookup(
    activeLookupList,
    Boolean(
      showWeightControls && focused && !disabled && !tagMeta && activeTagKey,
    ),
  )
  const activeMeta = activeTagKey
    ? (tagMeta?.[activeTagKey] ?? singleMetaLookup.items[activeTagKey])
    : undefined
  const activeLocalizedName = activeMeta
    ? pickLocalizedTagName(activeMeta, locale)
    : null
  const activeRecognition = activeMeta
    ? getNovelAiRecognitionTier({
        count: activeMeta.count,
        known: activeMeta.known,
      })
    : null
  const marked = new Set(markedTags?.map((tag) => tag.toLowerCase()))
  const mirror = splitTagRanges(text).map((range, index) => {
    const segment = text.slice(range.start, range.end)
    const lead = segment.length - segment.trimStart().length
    const body = segment.trim()
    const start = range.start + lead
    const parsed = body ? parseWeightedSegment(body) : undefined
    const isCurrent = current !== null && current.start === start
    const isMarked = parsed ? marked.has(parsed.text.toLowerCase()) : false
    const isNegative = Boolean(parsed && parsed.weight < 0)
    const isZero = Boolean(parsed && parsed.weight === 0)
    const hasSyntaxAffix = Boolean(
      parsed && (parsed.prefix.length > 0 || parsed.suffix.length > 0),
    )
    return (
      <span key={index}>
        {index > 0 ? ',' : null}
        {segment.slice(0, lead)}
        {body ? (
          <span
            className={cn(
              'rounded-sm box-decoration-clone',
              isNegative
                ? isCurrent
                  ? 'bg-status-risk/20 text-status-risk'
                  : 'bg-status-risk/10 text-status-risk'
                : isCurrent && 'bg-fill-strong',
              isZero && 'text-muted-foreground line-through',
              isMarked &&
                'underline decoration-foreground decoration-2 underline-offset-4',
            )}
          >
            {parsed && hasSyntaxAffix ? (
              <>
                {parsed.prefix ? (
                  <span
                    className={
                      isNegative ? 'opacity-75' : 'text-muted-foreground'
                    }
                  >
                    {parsed.prefix}
                  </span>
                ) : null}
                {parsed.core}
                {parsed.suffix ? (
                  <span
                    className={
                      isNegative ? 'opacity-75' : 'text-muted-foreground'
                    }
                  >
                    {parsed.suffix}
                  </span>
                ) : null}
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

  const boxHeightClass =
    bare && panelDensity === 'panel'
      ? 'studio-subtle-scroll max-h-44 min-h-20 overflow-x-hidden overflow-y-auto pr-1'
      : bare && panelDensity === 'panel-compact'
        ? 'studio-subtle-scroll max-h-28 min-h-14 overflow-x-hidden overflow-y-auto pr-1'
        : bare
          ? 'studio-subtle-scroll max-h-32 min-h-9 overflow-x-hidden overflow-y-auto pr-1'
          : composer
            ? 'studio-subtle-scroll max-h-24 min-h-8 flex-1 overflow-x-hidden overflow-y-auto pr-1'
            : form
              ? cn(
                  'studio-subtle-scroll max-h-48 overflow-x-hidden overflow-y-auto rounded-xl border bg-background transition-colors duration-fast ease-standard',
                  polarity === 'positive' ? 'min-h-28' : 'min-h-16',
                  focused ? 'border-foreground' : 'border-border',
                )
              : cn(
                  'studio-subtle-scroll max-h-48 min-h-24 overflow-x-hidden overflow-y-auto rounded-lg border bg-background transition-colors duration-fast ease-standard lg:max-h-none lg:min-h-18',
                  focused
                    ? 'border-primary/40 ring-2 ring-primary/10'
                    : 'border-border',
                )

  return (
    <div className="flex flex-col gap-1.5">
      {bare ? null : (
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={
              form
                ? 'text-2xs font-semibold text-muted-foreground'
                : 'text-2sm font-semibold lg:text-2xs'
            }
          >
            {label}
          </span>
          <span className="truncate text-2xs text-muted-foreground">
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
          boxHeightClass,
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
              setTyping(false)
            }}
            onSelect={readCaret}
            onChange={(event) => {
              setActiveIndex(0)
              setTyping(true)
              emit(normalizeTagTextInput(event.target.value))
              setCaret({
                start: event.target.selectionStart,
                end: event.target.selectionEnd,
              })
            }}
            onKeyDown={handleKeyDown}
            onClick={(event) => {
              if (!onLookup || !(event.metaKey || event.ctrlKey)) return
              if (
                event.currentTarget.selectionStart !==
                event.currentTarget.selectionEnd
              )
                return
              const range = tagRangeAt(text, event.currentTarget.selectionEnd)
              const chip = range
                ? parseTagChips(text.slice(range.start, range.end))[0]
                : undefined
              if (chip) onLookup(chip)
            }}
            onMouseUp={(event) => {
              if (!enableCooccurrence || !(event.metaKey || event.ctrlKey))
                return
              const start = event.currentTarget.selectionStart
              const end = event.currentTarget.selectionEnd
              if (start === end) return
              const picked = selectedTagsInRange(text, start, end)
              if (picked.length > 0) {
                setCooccurrenceTags(picked.map((chip) => chip.text))
              }
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
      {showWeightControls &&
      focused &&
      activeWeightChip &&
      caret &&
      !disabled ? (
        <div
          className="flex items-center justify-between gap-2 text-2xs text-muted-foreground"
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="truncate font-medium text-foreground/85">
              {activeWeightChip.text}
            </span>
            {activeLocalizedName ? (
              <span
                className="truncate text-muted-foreground"
                title={activeMeta?.zhNote ?? undefined}
              >
                · {activeLocalizedName}
              </span>
            ) : null}
            {activeMeta && activeMeta.count > 0 ? (
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/80">
                {compactPostCount(activeMeta.count, locale)}
              </span>
            ) : activeRecognition === 'unknown' &&
              !hasCjkOrNonAscii(activeWeightChip.text) &&
              !/^year \d{4}$/i.test(activeWeightChip.text) &&
              !activeWeightChip.text.includes('|') ? (
              <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                {t('recognition.unknownShort')}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={t('weightControls.decrease')}
              onClick={() => {
                const edit = stepTagWeightAt(
                  text,
                  caret.end,
                  -PROMPT_TAG_WEIGHT.STEP,
                )
                if (edit) apply(edit)
              }}
              className="touch-target grid size-5 place-items-center rounded-full bg-background text-foreground shadow-seg transition-colors hover:bg-fill-strong focus-visible:outline-none focus-visible:shadow-focus"
            >
              −
            </button>
            <span
              className={cn(
                'min-w-9 text-center font-mono font-semibold tabular-nums',
                activeWeightChip.weight < 0
                  ? 'text-status-risk'
                  : 'text-foreground',
              )}
            >
              {Number(activeWeightChip.weight.toFixed(2))}
            </span>
            <button
              type="button"
              aria-label={t('weightControls.increase')}
              onClick={() => {
                const edit = stepTagWeightAt(
                  text,
                  caret.end,
                  PROMPT_TAG_WEIGHT.STEP,
                )
                if (edit) apply(edit)
              }}
              className="touch-target grid size-5 place-items-center rounded-full bg-background text-foreground shadow-seg transition-colors hover:bg-fill-strong focus-visible:outline-none focus-visible:shadow-focus"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => {
                const edit = flipTagWeightAt(text, caret.end)
                if (edit) apply(edit)
              }}
              className={cn(
                'touch-target-y h-5 rounded-full px-2 text-2xs font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-focus',
                activeWeightChip.weight < 0
                  ? 'bg-status-risk text-background'
                  : 'bg-fill-strong text-foreground hover:bg-muted',
              )}
            >
              {activeWeightChip.weight < 0
                ? t('weightControls.toPositive')
                : t('weightControls.toNegative')}
            </button>
          </div>
        </div>
      ) : enableCooccurrence &&
        focused &&
        selectedTags.length > 0 &&
        !disabled ? (
        <div
          className="flex items-center justify-between gap-2 text-2xs text-muted-foreground"
          onMouseDown={(event) => event.preventDefault()}
        >
          <span className="truncate">
            {selectedTags.map((chip) => chip.text).join(' + ')}
          </span>
          <button
            type="button"
            onClick={() =>
              setCooccurrenceTags(selectedTags.map((chip) => chip.text))
            }
            className="touch-target-y h-5 shrink-0 rounded-full bg-fill-strong px-2 text-2xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:shadow-focus"
          >
            {t('cooccurrence.trigger', { count: selectedTags.length })}
          </button>
        </div>
      ) : null}
      {novelAiModel && official.active && query ? (
        <p role="status" className="text-2xs text-muted-foreground">
          {official.loading
            ? t(
                queryIsNonAscii
                  ? 'bilingualTagsLoading'
                  : 'officialTagsLoading',
              )
            : official.error
              ? t(
                  official.error === 'MISSING_API_KEY'
                    ? 'officialTagsKeyRequired'
                    : 'officialTagsError',
                )
              : queryIsNonAscii
                ? t(
                    official.tags.length
                      ? 'bilingualTagsSource'
                      : 'bilingualTagsEmpty',
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
      ) : !novelAiModel &&
        bilingual.active &&
        localResults.length === 0 &&
        query ? (
        <p role="status" className="text-2xs text-muted-foreground">
          {bilingual.loading
            ? t('bilingualTagsLoading')
            : t(
                bilingual.tags.length
                  ? 'bilingualTagsSource'
                  : 'bilingualTagsEmpty',
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
      {enableCooccurrence && cooccurrenceTags.length > 0 ? (
        <StudioTagCooccurrencePopover
          anchorRef={boxRef}
          tags={cooccurrenceTags}
          existingKeys={existingTagKeys}
          onToggleTag={toggleCooccurringTag}
          onClose={() => setCooccurrenceTags([])}
        />
      ) : null}
    </div>
  )
}
