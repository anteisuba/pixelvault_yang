'use client'

/**
 * 卡下那条**提示词栏**（spec §1.5，画板 `PromptBar.dc.html` / `Main.dc.html`）。
 *
 * 一片玻璃：正文一行、`+` 与 chip 与发送钮一行。正文**最小两行**
 * （`NODE_V4_CHROME.promptMinLines`，2026-09-10 owner 真机反馈第一条：一行的编辑
 * 区太小），随字数原地长高到 4 行，再多就是内部滚动 + 右下角字数——⛔ 不弹大编辑
 * 器（长词该去文本节点写完再连过来，画板上写死的话）。
 *
 * ⚠ 44px 单行胶囊那一形态已随「最小两行」**整个退役**：两行的正文塞不进 44 的
 * 胶囊，留着就是一条永远走不到的分支。
 *
 * 生成中：整条变灰、正文只读、发送钮换成取消（spec §1.9「提示词栏收起变灰并可取消」）。
 *
 * 键盘：`Enter` 发送 · `Shift+Enter` 换行 · IME 组字期间的 `Enter` 一律放行
 * （CJK 用它确认候选词，不挡就会把半截缓冲区提交掉——与 `NodeV4EditableLabel`
 * 同一条判据）。
 *
 * **纯呈现 + 受控**：不认识节点、不发 op、不知道模型。chip 内容与 `+` 菜单项都由
 * 调用方传。
 */

import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'
import { ArrowRight, Plus, X } from '@/components/icons'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NODE_V4_CHROME } from '@/constants/node-studio'
import { cn } from '@/lib/utils'

import {
  MentionPicker,
  matchMentionOptions,
  readMentionQuery,
  type MentionPickerOption,
} from './MentionPicker'

export interface NodePromptBarProps {
  readonly value: string
  onValueChange(next: string): void
  onSubmit(): void
  /** 生成中：整条变灰、正文只读、发送换取消。 */
  readonly generating?: boolean
  onCancel?(): void
  readonly placeholder: string
  /**
   * chip 区。⚠ 超过 `NODE_V4_CHROME.promptChipMax`（3）的会被**丢掉**而不是挤进去
   * ——上限是 spec §1.5 的硬约束，挤进去会把正文压没。
   */
  readonly chips?: readonly ReactNode[]
  /** `+` 的菜单项（用 `DropdownMenuItem` 拼）。不给就不渲染 `+`。 */
  readonly addMenu?: ReactNode
  /**
   * **栏内首行**（画板 `VideoSelected.dc.html`：已挂的首帧 / 尾帧 / 语音那排小
   * chip 就在栏里、正文之上，同一片玻璃）。
   *
   * ⚠ 有内容才占这一行（`null` / `false` / 空数组都当没有）。
   */
  readonly leadingRow?: ReactNode
  readonly ariaLabel: string
  readonly className?: string
  readonly textareaProps?: {
    readonly onKeyDown?: (
      event: React.KeyboardEvent<HTMLTextAreaElement>,
    ) => void
  }
  /**
   * 正文那只 textarea。插标记 / 插 @ 的调用方要用它把焦点与光标放回来
   * （⛔ 不再靠从键盘事件里捡 `event.currentTarget`——没敲过键就一直是 null）。
   */
  readonly inputRef?: React.Ref<HTMLTextAreaElement>
  /** 光标 / 选区变了（点击、方向键、输入、`select` 都会报）。 */
  onSelectionChange?(range: PromptBarSelection): void
  /**
   * **输入框内部**的富渲染层（画板：`[愤怒]` 与 `@莫宁` 是栏里的 chip，不是栏上
   * 方另一行）。
   *
   * 做法是**等距镜像 overlay**：textarea 字色透明只留光标与选区，同一段文字由这个
   * 函数在下面再画一遍，chip 只是给字符段加底色。⛔ 渲染出来的字符必须与 `value`
   * **逐字符相同**（要藏的字符用 `text-transparent`，⛔ 不删、不换、不加 padding）
   * ——少一个字符，光标就与看到的字错位。
   */
  readonly renderValue?: (value: string) => ReactNode
  /**
   * `@` 候选（spec §1.7）。给了就在正文里键 `@` 时弹列表：↑↓ 选、↵ / Tab 落成
   * `@名字 `、Esc 关。⛔ 不给的卡不弹 —— 空列表比没有更糟。
   *
   * 落字是**这一层**做的（纯文本替换 + 光标复位），调用方只在 `onMentionSelect`
   * 里做副作用（比如把这一项挂到槽上）。
   */
  readonly mentionOptions?: readonly MentionPickerOption[]
  onMentionSelect?(option: MentionPickerOption): void
}

export interface PromptBarSelection {
  readonly start: number
  readonly end: number
}

/** 正文行高 20px（`text-sm` 的 `leading-5`）——长高与滚动都按它算。 */
const LINE_HEIGHT_PX = 20

export function NodePromptBar({
  value,
  onValueChange,
  onSubmit,
  generating = false,
  onCancel,
  placeholder,
  chips,
  addMenu,
  leadingRow,
  ariaLabel,
  className,
  textareaProps,
  inputRef,
  onSelectionChange,
  renderValue,
  mentionOptions,
  onMentionSelect,
}: NodePromptBarProps) {
  const t = useTranslations('StudioNode.v4.chrome')
  const sizerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  /** 落完一颗 `@` 之后光标该去哪 —— 由下面那个 layout effect 兑现。 */
  const pendingCaretRef = useRef<number | null>(null)
  const [lines, setLines] = useState(1)
  const [caret, setCaret] = useState(0)
  /** Esc 关掉的是**这一个** `@`（下标）——再键一个字不该又弹回来。 */
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  /**
   * 正文那只 textarea 分给两边：内部量光标，调用方（插标记 / 插 `@`）拿去聚焦。
   * ⛔ 不手写「把 element 塞进调用方的 ref」——那是在改 props。
   */
  useImperativeHandle(
    inputRef,
    () => textareaRef.current as HTMLTextAreaElement,
  )

  // 行数**不量 textarea 本身，量一份等宽的隐藏镜像**。
  // ⚠ 收起态里 textarea 被 `+`、三颗 chip 和发送钮挤到只剩几十像素宽，量它得到的
  // 永远是「好几行」——那样任何一句话都会把栏撑开。判据应该是「按**长高后的整条
  // 宽度**排，这段话要几行」，镜像正好就是那个宽度。顺带也断开了「量 textarea →
  // 改 textarea 高 → 再量」的回路（真机上它把 React 的更新深度打爆过）。
  useLayoutEffect(() => {
    const el = sizerRef.current
    if (!el) return
    setLines(Math.max(1, Math.round(el.scrollHeight / LINE_HEIGHT_PX)))
  }, [value])

  /**
   * 正文一变就把光标位置对齐：自己落完 `@` 走 `pendingCaretRef`（顺带把焦点抢
   * 回来），其余情况（外部改 `value`、`+` 菜单里插一个 `@`）从 DOM 读。
   * ⚠ 光标不同步，`@` 就永远弹不出来 —— 判据完全靠它。
   */
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const pending = pendingCaretRef.current
    if (pending !== null) {
      pendingCaretRef.current = null
      el.focus()
      el.setSelectionRange(pending, pending)
      setCaret(pending)
      return
    }
    setCaret(el.selectionStart)
  }, [value])

  const mentionQuery =
    mentionOptions && mentionOptions.length > 0 && !generating
      ? readMentionQuery(value, caret)
      : null
  const mentionMatches =
    mentionQuery && mentionQuery.start !== dismissedAt
      ? matchMentionOptions(mentionOptions ?? [], mentionQuery.query)
      : []
  const mentionOpen = mentionMatches.length > 0
  const activeIndex = Math.max(
    0,
    mentionMatches.findIndex((option) => option.id === activeId),
  )
  const activeOption = mentionMatches[activeIndex]

  /** 把 `@查询` 整段换成 `@名字 `，光标落在空格之后。 */
  const commitMention = (option: MentionPickerOption) => {
    if (!mentionQuery) return
    const head = value.slice(0, mentionQuery.start)
    const tail = value.slice(caret)
    pendingCaretRef.current = mentionQuery.start + option.name.length + 2
    setActiveId(null)
    onValueChange(`${head}@${option.name} ${tail}`)
    onMentionSelect?.(option)
  }

  /**
   * 栏内首行有内容？⚠ `Boolean(节点)` 不够 —— 调用方常传一个「没东西时自己返回
   * `null`」的组件元素，那颗元素本身是 truthy。所以只认「渲染出来的确实是空」的
   * 三种字面空值，其余一律当有。
   */
  const hasLeadingRow =
    leadingRow !== undefined &&
    leadingRow !== null &&
    leadingRow !== false &&
    !(Array.isArray(leadingRow) && leadingRow.length === 0)
  const overflowing = lines > NODE_V4_CHROME.promptMaxLines
  const visibleChips = (chips ?? []).slice(0, NODE_V4_CHROME.promptChipMax)
  /** 两行起、四行封顶 —— 中间随字数长高。 */
  const bodyLines = Math.min(
    Math.max(lines, NODE_V4_CHROME.promptMinLines),
    NODE_V4_CHROME.promptMaxLines,
  )
  const textareaHeight = bodyLines * LINE_HEIGHT_PX

  const addButton = addMenu ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('add')}
          data-prompt-bar-add
          disabled={generating}
          className="nodrag nopan flex size-7.5 shrink-0 items-center justify-center rounded-full bg-surface-fill text-foreground transition-colors duration-fast hover:bg-surface-fill-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          <Plus aria-hidden className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="min-w-44">
        {addMenu}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null

  const trailingButton = generating ? (
    <button
      type="button"
      aria-label={t('cancel')}
      data-prompt-bar-cancel
      onClick={() => onCancel?.()}
      className="nodrag nopan flex size-7.5 shrink-0 items-center justify-center rounded-full bg-surface-fill-track text-foreground transition-colors duration-fast hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <X aria-hidden className="size-4" />
    </button>
  ) : (
    <button
      type="button"
      aria-label={t('send')}
      data-prompt-bar-send
      disabled={value.trim().length === 0}
      onClick={onSubmit}
      className="nodrag nopan flex size-7.5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[background-color,transform] duration-spring-press ease-spring-press active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
    >
      <ArrowRight aria-hidden className="size-4" />
    </button>
  )

  /** 选区回调的唯一出口 —— 点击 / 方向键 / 输入 / `select` 都从这里报。 */
  const reportSelection = (element: HTMLTextAreaElement) => {
    onSelectionChange?.({
      start: element.selectionStart,
      end: element.selectionEnd,
    })
  }

  // 正文与 overlay 的排版类必须**逐条相同**，否则同一段字在两层里断行的位置不一样。
  const typography = cn(
    'text-sm leading-5 whitespace-pre-wrap',
    overflowing ? 'overflow-y-auto' : 'overflow-hidden',
  )

  const textarea = (
    <textarea
      ref={textareaRef}
      rows={1}
      value={value}
      readOnly={generating}
      placeholder={placeholder}
      aria-label={ariaLabel}
      data-prompt-bar-input
      onChange={(event) => {
        setCaret(event.currentTarget.selectionStart)
        setDismissedAt(null)
        onValueChange(event.target.value)
        reportSelection(event.currentTarget)
      }}
      onSelect={(event) => {
        setCaret(event.currentTarget.selectionStart)
        reportSelection(event.currentTarget)
      }}
      onClick={(event) => {
        setCaret(event.currentTarget.selectionStart)
        reportSelection(event.currentTarget)
      }}
      onKeyUp={(event) => {
        setCaret(event.currentTarget.selectionStart)
        reportSelection(event.currentTarget)
      }}
      // overlay 是另一层 DOM，滚动不会跟着 textarea 走 —— 手动对齐。
      onScroll={(event) => {
        const overlay = overlayRef.current
        if (!overlay) return
        overlay.scrollTop = event.currentTarget.scrollTop
        overlay.scrollLeft = event.currentTarget.scrollLeft
      }}
      onKeyDown={(event) => {
        textareaProps?.onKeyDown?.(event)
        if (event.defaultPrevented) return
        if (event.nativeEvent.isComposing) return
        // `@` 候选开着时键盘归它 —— ⛔ 这一段必须在「Enter = 发送」之前，
        // 否则选候选那一下会把半截提示词发出去。
        if (mentionOpen && mentionQuery) {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const step = event.key === 'ArrowDown' ? 1 : -1
            const next =
              (activeIndex + step + mentionMatches.length) %
              mentionMatches.length
            setActiveId(mentionMatches[next]?.id ?? null)
            return
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault()
            if (activeOption) commitMention(activeOption)
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setDismissedAt(mentionQuery.start)
            return
          }
        }
        if (event.key !== 'Enter' || event.shiftKey) return
        event.preventDefault()
        if (generating || value.trim().length === 0) return
        onSubmit()
      }}
      style={{ height: textareaHeight }}
      className={cn(
        'nodrag nopan nowheel absolute inset-0 size-full resize-none bg-transparent placeholder:text-muted-foreground focus-visible:outline-none',
        typography,
        // 有 overlay 时正文字色透明：字由下面那层画，textarea 只留光标与选区。
        // ⚠ `caret-foreground` 必须显式给 —— 透明字色会把光标也一起透明掉。
        renderValue ? 'text-transparent caret-foreground' : 'text-foreground',
      )}
    />
  )

  const field = (
    <div
      data-prompt-bar-field
      style={{ height: textareaHeight }}
      // `basis-full` 逼出一次换行 = 正文独占首行、`+` 与 chip 落到底行。
      className="relative order-first min-w-0 basis-full"
    >
      {renderValue ? (
        <div
          ref={overlayRef}
          aria-hidden
          data-prompt-bar-overlay
          className={cn(
            'pointer-events-none absolute inset-0 size-full text-foreground',
            typography,
          )}
        >
          {renderValue(value)}
        </div>
      ) : null}
      {textarea}
    </div>
  )

  return (
    <div
      data-node-chrome="prompt-bar"
      data-generating={generating ? 'true' : 'false'}
      // 栏里双击（选词、双击 chip）**不冒泡到卡片** —— 卡片的双击是「展开」，
      // 在栏里选个词就把画中框顶出来是 2026-09-10 owner 真机反馈的第五条。
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        'relative rounded-node surface-glass shadow-node-chrome corner-squircle py-3 pr-2 pl-3.5',
        generating && 'opacity-60',
        className,
      )}
    >
      {/* 等宽隐藏镜像——只用来量行数，见上面的注释。`aria-hidden` + 不可选中，
          屏幕阅读器与光标都碰不到它。 */}
      <div
        ref={sizerRef}
        aria-hidden
        data-prompt-bar-sizer
        className="pointer-events-none invisible absolute inset-x-0 text-sm leading-5 break-words whitespace-pre-wrap"
      >
        {value}
        {'\u200b'}
      </div>
      {mentionOpen ? (
        <MentionPicker
          options={mentionMatches}
          activeId={activeOption?.id ?? null}
          onActiveChange={setActiveId}
          onSelect={commitMention}
          ariaLabel={t('mentionPicker')}
          emptyLabel={t('emptyHint')}
        />
      ) : null}
      {hasLeadingRow ? (
        <div
          data-prompt-bar-leading
          style={{ minHeight: NODE_V4_CHROME.promptLeadingRowMinHeight }}
          className="flex flex-wrap items-center gap-1.5"
        >
          {leadingRow}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        {addButton}
        {field}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {visibleChips}
        </div>
        {overflowing && (
          <span
            data-prompt-bar-count
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
          >
            {t('charCount', { count: value.length })}
          </span>
        )}
        {trailingButton}
      </div>
    </div>
  )
}
