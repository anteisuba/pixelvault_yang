'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'

import {
  PROMPT_TAG_AUTOCOMPLETE_DEBOUNCE_MS,
  PROMPT_TAG_AUTOCOMPLETE_MIN_QUERY_LENGTH,
  PROMPT_TAG_AUTOCOMPLETE_RESULT_LIMIT,
} from '@/constants/prompt-tags'
import {
  applyPromptTagSegmentReplacement,
  extractPromptTagSegment,
  getPromptTagPopularityTier,
  type PromptTagSegment,
} from '@/lib/prompt-tag-autocomplete'
import { searchPromptTags } from '@/lib/prompt-tag-search'
import { cn } from '@/lib/utils'
import type { PromptPolarity, PromptTagSearchResult } from '@/types/prompt-tags'

interface PromptTagAutocompletePosition {
  top: number
  left: number
  width: number
}

interface PromptTagAutocompleteProps {
  /** 已挂载的正文/负面 textarea——组件不渲染它，只挂监听 + 锚定浮层。 */
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (value: string) => void
  polarity: PromptPolarity
}

/**
 * lora-workbench.md §5：正文/负面 textarea 的 inline danbooru 补全。
 *
 * 设计取舍——不用 Popover/PopoverAnchor：Radix Popover 的 FocusScope /
 * dismissable-layer 会跟"焦点必须一直留在 textarea、方向键/Enter/Tab 由
 * textarea 原生 keydown 消费"这套组合键行为打架（Radix 习惯把 Escape/
 * outside-pointerdown 的处理权收进它自己的层）。这里改用最小自定义实现：
 * 组件不拥有 textarea 的 JSX，只拿一个已挂载 textarea 的 ref，用
 * addEventListener 挂 composition/keydown/blur，浮层本身 createPortal 到
 * document.body——一是脱离 `.studio-composer` 的局部反相作用域（该作用域
 * 重映射了 --foreground/--muted-foreground/--border，浮层要用"标准浮层
 * token"，见 §5），二是不必手算里层滚动容器的裁剪。
 */
export function PromptTagAutocomplete({
  textareaRef,
  value,
  onChange,
  polarity,
}: PromptTagAutocompleteProps) {
  const t = useTranslations('LoraWorkbench')
  const tTags = useTranslations('PromptTags')

  const [isComposing, setIsComposing] = useState(false)
  const [segment, setSegment] = useState<PromptTagSegment | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] =
    useState<PromptTagAutocompletePosition | null>(null)
  // Esc 关闭且"同词段抑制"：记住被 Esc 掉的词段文本。isOpen 的判定直接拿它
  // 跟当前词段比较（见下）——继续输入换了词段，文本不等就自然解除，不需要
  // 额外清空这个 state；真正清空只在"编辑会话明确结束"的几个时刻
  // （blur/点走/确认选中/开始拼音输入），由 closeDropdown 统一处理。
  const [suppressedText, setSuppressedText] = useState<string | null>(null)

  const results = useMemo<PromptTagSearchResult[]>(() => {
    if (!segment) return []
    const query = segment.text.trim()
    if (query.length < PROMPT_TAG_AUTOCOMPLETE_MIN_QUERY_LENGTH) return []
    return searchPromptTags({
      query,
      polarity,
      limit: PROMPT_TAG_AUTOCOMPLETE_RESULT_LIMIT,
    })
  }, [polarity, segment])

  const isOpen =
    segment !== null &&
    results.length > 0 &&
    segment.text.trim() !== suppressedText

  // 最新值镜像进 ref——keydown 监听只在 isOpen 翻转时重新挂载/卸载，内部读
  // ref 拿到当次触发时的最新 results/activeIndex/segment，不必每次结果变化
  // 都重挂监听。ref 写入放进 effect（不在 render 里改 ref.current，
  // react-hooks/refs 规则）；无依赖数组=每次 commit 后都同步，语义等价。
  const resultsRef = useRef(results)
  const activeIndexRef = useRef(activeIndex)
  const segmentRef = useRef(segment)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    resultsRef.current = results
    activeIndexRef.current = activeIndex
    segmentRef.current = segment
    valueRef.current = value
    onChangeRef.current = onChange
  })

  // 关闭浮层的唯一出口：段清空 + 抑制记录一并清掉。抑制记录只在这几个
  // "编辑会话明确结束"的时刻清——期间用户如果只是继续敲字（词段变了但没
  // 经过这里），isOpen 的不等式判定已经足够识别"新词段"，不用额外清空。
  const closeDropdown = useCallback(() => {
    setSegment(null)
    setSuppressedText(null)
  }, [])

  const confirmSelection = useCallback(
    (result: PromptTagSearchResult) => {
      const activeSegment = segmentRef.current
      if (!activeSegment) return
      const { value: nextValue, cursor } = applyPromptTagSegmentReplacement(
        valueRef.current,
        activeSegment,
        result.tag.promptText,
      )
      onChangeRef.current(nextValue)
      closeDropdown()
      const textarea = textareaRef.current
      if (textarea) {
        // 受控 textarea 的 value 要等这次 render 提交后才落地到 DOM，下一帧
        // 再摆光标，否则 setSelectionRange 会被新 value 的写入盖掉。
        requestAnimationFrame(() => {
          textarea.focus()
          textarea.setSelectionRange(cursor, cursor)
        })
      }
    },
    [closeDropdown, textareaRef],
  )

  // Composition 守卫：拼音上屏阶段不触发，开始输入拼音的瞬间就把已开着的
  // 浮层收起（避免残留上一词段的候选）；两处 setState 都在事件回调里，不在
  // effect body 里同步调用（react-hooks/set-state-in-effect）。
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const handleStart = () => {
      setIsComposing(true)
      closeDropdown()
    }
    const handleEnd = () => setIsComposing(false)
    el.addEventListener('compositionstart', handleStart)
    el.addEventListener('compositionend', handleEnd)
    return () => {
      el.removeEventListener('compositionstart', handleStart)
      el.removeEventListener('compositionend', handleEnd)
    }
  }, [textareaRef, closeDropdown])

  // 触发：value 变化（含 IME 结束后那次）→ debounce → 用当时光标位置解词段。
  // isComposing 时直接不排期——不在这里同步 setState，拼音期间"收起浮层"已
  // 经由上面 compositionstart 的事件回调处理过了。
  useEffect(() => {
    if (isComposing) return
    const timer = setTimeout(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      const cursor = textarea.selectionStart ?? value.length
      const next = extractPromptTagSegment(value, cursor)
      setSegment(next)
      setActiveIndex(0)
    }, PROMPT_TAG_AUTOCOMPLETE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [value, isComposing, textareaRef])

  // 浮层位置：锚定 textarea 底边（不做 caret 级定位，§5 工程简化）。open 时
  // 算一次，滚动/resize 时跟着重算——scroll 用 capture 挂在 window 上以捕获
  // 任意里层可滚容器（scroll 事件不冒泡，capture 阶段仍能收到）。关闭态不必
  // 主动清空 position——它只在 isOpen 时被读取，下次开启前 updatePosition()
  // 会先算一遍新值。
  useEffect(() => {
    if (!isOpen) return
    const updatePosition = () => {
      const textarea = textareaRef.current
      if (!textarea) return
      const rect = textarea.getBoundingClientRect()
      setPosition({ top: rect.bottom, left: rect.left, width: rect.width })
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen, textareaRef])

  // 键盘导航：只在 isOpen 时挂——关闭态完全不拦 textarea 的按键。
  useEffect(() => {
    if (!isOpen) return
    const el = textareaRef.current
    if (!el) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((current) =>
          Math.min(current + 1, resultsRef.current.length - 1),
        )
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((current) => Math.max(current - 1, 0))
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const picked = resultsRef.current[activeIndexRef.current]
        if (!picked) return
        event.preventDefault()
        confirmSelection(picked)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setSuppressedText(segmentRef.current?.text.trim() ?? null)
        return
      }
      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight' ||
        event.key === 'Home' ||
        event.key === 'End'
      ) {
        // 不拦截——光标该照常移动，只是移动等于"离开当前词段"，浮层不该
        // 停留在原地显示已经不对应光标位置的候选。
        closeDropdown()
      }
    }
    el.addEventListener('keydown', handleKeyDown)
    return () => el.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, textareaRef, confirmSelection, closeDropdown])

  // 失焦收起——但列表项点击用 onPointerDown+preventDefault 抢在 blur 之前
  // 拦下（搜索历史下拉同款手法），所以点候选项不会先触发这里。点击 textarea
  // 内部改光标位置（不经过 keydown）同样该收起——不然浮层可能停留在一个已经
  // 离开的词段上。
  useEffect(() => {
    if (!isOpen) return
    const el = textareaRef.current
    if (!el) return
    el.addEventListener('blur', closeDropdown)
    el.addEventListener('click', closeDropdown)
    return () => {
      el.removeEventListener('blur', closeDropdown)
      el.removeEventListener('click', closeDropdown)
    }
  }, [isOpen, textareaRef, closeDropdown])

  // aria-activedescendant 挂在真正持有焦点的 textarea 上（WAI-ARIA combobox
  // 惯例），不是挂在浮层容器——浮层容器本身拿不到焦点。
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    if (isOpen && results[activeIndex]) {
      el.setAttribute(
        'aria-activedescendant',
        `prompt-tag-autocomplete-option-${results[activeIndex].tag.id}`,
      )
    } else {
      el.removeAttribute('aria-activedescendant')
    }
  }, [activeIndex, isOpen, results, textareaRef])

  if (!isOpen || !position || typeof document === 'undefined') return null

  return createPortal(
    <div
      role="listbox"
      aria-label={t('generate.autocompleteAriaLabel')}
      style={{ top: position.top, left: position.left, width: position.width }}
      // 标准浮层 token（bg-popover/border-border/text-muted-foreground）：
      // 有意脱离 .studio-composer 的纸面反相作用域，见文件头注释。
      className="fixed z-50 mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-xs shadow-lg"
    >
      {results.map((result, index) => {
        const tier = getPromptTagPopularityTier(result.tag.popularity)
        const isActive = index === activeIndex
        return (
          <button
            key={result.tag.id}
            id={`prompt-tag-autocomplete-option-${result.tag.id}`}
            type="button"
            role="option"
            aria-selected={isActive}
            // mousedown 早于 blur——同 CivitaiLibraryPane 搜索历史下拉的手法，
            // 防止点候选时 textarea 先失焦把浮层收掉。
            onPointerDown={(event) => {
              event.preventDefault()
              confirmSelection(result)
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
              isActive ? 'bg-muted' : 'hover:bg-muted',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'size-1.5 shrink-0 rounded-full bg-muted-foreground',
                tier === 'low' && 'opacity-30',
                tier === 'mid' && 'opacity-60',
                tier === 'high' && 'opacity-100',
              )}
            />
            <span className="min-w-0 flex-1 truncate">{result.tag.label}</span>
            <span className="shrink-0 truncate font-mono text-2xs text-muted-foreground/70">
              {result.tag.promptText}
            </span>
            <span className="shrink-0 text-2xs text-muted-foreground">
              {tTags(`category.${result.tag.category}`)}
            </span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
