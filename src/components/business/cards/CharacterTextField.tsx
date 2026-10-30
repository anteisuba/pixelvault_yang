'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { Pin } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/**
 * 角色详情的长文格（owner 2026-10-15 选「乙 · 长文弹大编辑框」，并说所有多行的格都这样）。
 *
 * ⭐ 常态是正文：只露 3 行，「展开 / 收起」顺滑长开收回；点格名右边的「编辑」在正中弹出大编辑框
 *   （手机是底部抽屉），带字数，「保存」或 ⌘/Ctrl + 回车 存，Esc / 取消 放弃。
 *   （角色大项目第 ② 步，owner 10-30：每格右上一个「编辑」，替掉点正文就改。）
 * ⭐ 给了 `onPinnedChange` 就在「编辑」左边多一颗图钉：钉住的格她和助手都改不了。
 * ⭐ 页面本身不因为编辑变高 —— ⛔ 不在原地把输入框撑到全文那么长。
 * ⚠ 名字、标签这类一行的格照旧走 `CharacterInlineField` 原地改。
 */

type Save = (next: string) => Promise<boolean>

const EXPAND_MS = 240

export function CharacterTextField({
  label,
  value,
  onSave,
  limit,
  hint,
  badge,
  showLabel = true,
  clamp = true,
  placeholder,
  className,
  textClassName,
  editing: editingProp,
  onEditingChange,
  pinned = false,
  onPinnedChange,
}: {
  label: string
  value: string
  onSave: Save
  /** 字数上限（编辑框里显示 `n / limit`，超了不让存）。 */
  limit?: number
  /** 编辑框标题下的一行说明。 */
  hint?: ReactNode
  /** 格名右边的小标（如「必填」）。 */
  badge?: ReactNode
  showLabel?: boolean
  /** 只露 3 行 + 展开；关掉就整段显示（一句外观）。 */
  clamp?: boolean
  placeholder?: string
  className?: string
  textClassName?: string
  /** 外面要替它打开编辑框时（试读「不像」→ 直接去改说话方式）传这一对。 */
  editing?: boolean
  onEditingChange?(open: boolean): void
  /** 钉住了吗（第 ② 步）；和 `onPinnedChange` 一起给才有图钉。 */
  pinned?: boolean
  onPinnedChange?(pinned: boolean): void
}) {
  const t = useTranslations('CharacterRoster')
  const [editingState, setEditingState] = useState(false)
  const editing = editingProp ?? editingState
  const setEditing = (open: boolean) => {
    setEditingState(open)
    onEditingChange?.(open)
  }
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const textRef = useRef<HTMLDivElement>(null)
  const fromHeight = useRef<number | null>(null)

  // 只有真被截断才给「展开」。
  useLayoutEffect(() => {
    const el = textRef.current
    if (!el || !clamp || expanded) return
    setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [clamp, expanded, value])

  // 展开 / 收起：量出前后高度，用 WAAPI 补一段过渡（line-clamp 本身不能过渡）。
  useLayoutEffect(() => {
    const el = textRef.current
    const from = fromHeight.current
    fromHeight.current = null
    if (!el || from === null) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const to = el.offsetHeight
    el.animate(
      [
        { height: `${from}px`, overflow: 'hidden' },
        { height: `${to}px`, overflow: 'hidden' },
      ],
      { duration: EXPAND_MS, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.04)' },
    )
  }, [expanded])

  const toggle = () => {
    fromHeight.current = textRef.current?.offsetHeight ?? null
    setExpanded((open) => !open)
  }

  const empty = !value.trim()

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <div className="flex min-h-7 items-center gap-1.5 text-xs text-muted-foreground">
        {showLabel ? (
          <p className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{label}</span>
            {badge}
          </p>
        ) : null}
        <span className="flex-1" />
        {onPinnedChange ? (
          <button
            type="button"
            aria-pressed={pinned}
            aria-label={
              pinned
                ? t('unpinField', { field: label })
                : t('pinField', { field: label })
            }
            title={pinned ? t('pinnedHint') : t('pinHint')}
            onClick={() => onPinnedChange(!pinned)}
            className={cn(
              'grid size-7 place-items-center rounded-full transition-colors duration-fast ease-standard hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
              pinned && 'text-foreground',
            )}
          >
            <Pin
              weight={pinned ? 'fill' : 'regular'}
              className="size-3.5"
              aria-hidden
            />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={t('editField', { field: label })}
          onClick={() => setEditing(true)}
          className="h-7 rounded-full px-2 transition-colors duration-fast ease-standard hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
        >
          {t('editAction')}
        </button>
      </div>
      <div
        ref={textRef}
        className={cn(
          'whitespace-pre-wrap break-words text-base leading-relaxed lg:text-sm',
          clamp && !expanded && 'line-clamp-3',
          empty && 'text-muted-foreground',
          textClassName,
        )}
      >
        {empty ? (placeholder ?? t('emptyField')) : value}
      </div>
      {clamp && (overflows || expanded) ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="w-fit text-xs text-foreground underline underline-offset-4"
        >
          {expanded ? t('collapseText') : t('expandText')}
        </button>
      ) : null}

      <CharacterFieldEditor
        open={editing}
        label={label}
        value={value}
        limit={limit}
        hint={hint}
        onSave={onSave}
        onClose={() => setEditing(false)}
      />
    </div>
  )
}

export function CharacterFieldEditor({
  open,
  label,
  value,
  limit,
  hint,
  onSave,
  onClose,
}: {
  open: boolean
  label: string
  value: string
  limit?: number
  hint?: ReactNode
  onSave: Save
  onClose(): void
}) {
  const t = useTranslations('CharacterRoster')
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [opened, setOpened] = useState(open)

  // 每次打开都从当前值起（上次没存的草稿不带过来）。
  if (open !== opened) {
    setOpened(open)
    if (open) setDraft(value)
  }

  const tooLong = limit !== undefined && draft.length > limit

  const submit = async () => {
    if (saving || tooLong) return
    if (draft.trim() === value.trim()) {
      onClose()
      return
    }
    setSaving(true)
    const ok = await onSave(draft.trim())
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onClose()
      }}
    >
      <ResponsiveDialogContent className="flex flex-col gap-3 sm:h-7/10 sm:max-w-2xl">
        <ResponsiveDialogHeader className="gap-1 p-0 text-left">
          <ResponsiveDialogTitle className="text-base font-semibold">
            {label}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription
            className={cn('text-xs text-muted-foreground', !hint && 'sr-only')}
          >
            {hint ?? t('editorShortcut')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <textarea
          id="character-field-editor"
          aria-label={label}
          value={draft}
          autoFocus
          onFocus={(event) => event.currentTarget.setSelectionRange(0, 0)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              (event.metaKey || event.ctrlKey) &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              void submit()
            }
          }}
          placeholder={t('emptyField')}
          className="min-h-60 flex-1 resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              'font-mono text-xs tabular-nums text-muted-foreground',
              tooLong && 'text-status-risk',
            )}
          >
            {limit !== undefined
              ? t('editorCount', { count: draft.length, limit })
              : t('editorShortcut')}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={onClose}
            >
              {t('editorCancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving || tooLong}
              onClick={() => void submit()}
            >
              {saving ? <Spinner size="sm" /> : null}
              {t('editorSave')}
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
