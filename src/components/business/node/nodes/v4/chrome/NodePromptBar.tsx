'use client'

/**
 * 卡下那条**提示词栏**（spec §1.5，画板 `PromptBar.dc.html` / `Main.dc.html`）。
 *
 * 一条 44px 玻璃胶囊：`+` 圆钮 · 正文 · 最多 3 颗 chip · 发送圆钮。
 * 正文超一行**原地长高**到 4 行（此时圆角从胶囊退成 20px 方块、`+` 与 chip 挪到
 * 底行），再多就是内部滚动 + 右下角字数——⛔ 不弹大编辑器（长词该去文本节点写完
 * 再连过来，画板上写死的话）。
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

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowRight, Plus, X } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NODE_V4_CHROME } from '@/constants/node-studio'
import { cn } from '@/lib/utils'

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
  ariaLabel,
  className,
  textareaProps,
  inputRef,
  onSelectionChange,
  renderValue,
}: NodePromptBarProps) {
  const t = useTranslations('StudioNode.v4.chrome')
  const sizerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState(1)

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

  const expanded = lines > 1
  const overflowing = lines > NODE_V4_CHROME.promptMaxLines
  const visibleChips = (chips ?? []).slice(0, NODE_V4_CHROME.promptChipMax)
  const textareaHeight =
    Math.min(lines, NODE_V4_CHROME.promptMaxLines) * LINE_HEIGHT_PX

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
    'text-sm leading-5',
    overflowing ? 'overflow-y-auto' : 'overflow-hidden',
    // 收起态是**一行不折行**（画板的 `white-space:nowrap` + 截断），⛔ 不让被
    // chip 挤窄的 textarea 自己折行——那会让「一句话」看起来像「一段话」。
    expanded ? 'whitespace-pre-wrap' : 'overflow-x-hidden whitespace-pre',
  )

  const textarea = (
    <textarea
      ref={inputRef}
      rows={1}
      value={value}
      readOnly={generating}
      placeholder={placeholder}
      aria-label={ariaLabel}
      data-prompt-bar-input
      onChange={(event) => {
        onValueChange(event.target.value)
        reportSelection(event.currentTarget)
      }}
      onSelect={(event) => reportSelection(event.currentTarget)}
      onClick={(event) => reportSelection(event.currentTarget)}
      onKeyUp={(event) => reportSelection(event.currentTarget)}
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
      className={cn(
        'relative min-w-0',
        // 长高态：`basis-full` 逼出一次换行 = 正文独占首行、`+` 与 chip 落到底行。
        // ⚠ 这是**同一份 DOM 换类**，⛔ 不换成两套 JSX 分支：React 会把 textarea
        // 搬到另一个父节点上重挂，重挂那一下 inline height 当场丢掉（真机实测）。
        expanded ? 'order-first basis-full' : 'flex-1',
      )}
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
      data-expanded={expanded ? 'true' : 'false'}
      data-generating={generating ? 'true' : 'false'}
      className={cn(
        'relative surface-glass shadow-node-chrome transition-[border-radius] duration-spring-slot ease-spring-slot',
        expanded
          ? 'rounded-node corner-squircle py-3 pr-2 pl-3.5'
          : 'h-11 rounded-full px-2',
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
      <div
        className={cn(
          'flex h-full flex-wrap items-center gap-x-2.5',
          expanded && 'gap-y-2',
        )}
      >
        {addButton}
        {field}
        <div
          className={cn(
            'flex items-center gap-1.5',
            expanded ? 'min-w-0 flex-1' : 'shrink-0',
          )}
        >
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
