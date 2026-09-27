'use client'

import { forwardRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { Plus, X } from '@/components/icons'
import { cn } from '@/lib/utils'

/**
 * **点哪改哪**（owner 09-27 从原型选 B）：角色详情上每一格本身就是输入框。
 *
 * ⭐ 常态看起来是正文：没有边框、没有底色；悬停浅一层底，点进去白底 + 描边，
 *   位置与字号一点不动。离开这一格就存（`onCommit`），没改不存。
 * ⭐ 单行（名字 / 作品 / 触发词）回车即离开；多行 ⌘/Ctrl + 回车离开。Esc 放弃这次改动
 *   并 `preventDefault`，⛔ 不连带收起整页详情。
 * ⚠ 存失败就退回改之前的字（错误提示由角色页的更新统一弹）。
 */

const SURFACE =
  '-mx-2 -my-1 w-full rounded-lg bg-transparent px-2 py-1 outline-none transition-colors duration-fast ease-standard placeholder:text-muted-foreground hover:bg-muted focus:bg-background focus:ring-1 focus:ring-foreground motion-reduce:transition-none'

type Commit = (next: string) => Promise<boolean>

export const CharacterInlineField = forwardRef<
  HTMLTextAreaElement,
  {
    value: string
    placeholder: string
    /** 读屏用的格名（格名本身画在外面）。 */
    label: string
    onCommit: Commit
    multiline?: boolean
    /** 点进去时才出现的一行小字。 */
    hint?: ReactNode
    /** 一出现就把光标放进来（「新角色」草稿的名字格）。 */
    autoFocus?: boolean
    className?: string
  }
>(function CharacterInlineField(
  {
    value,
    placeholder,
    label,
    onCommit,
    multiline = false,
    hint,
    autoFocus,
    className,
  },
  ref,
) {
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? value

  const commit = async () => {
    if (draft === null) return
    const next = draft.trim()
    if (next === value.trim()) {
      setDraft(null)
      return
    }
    // 成功后角色记录会带着新值回来；失败就退回原来的字 —— 两种都是清掉草稿。
    await onCommit(next)
    setDraft(null)
  }

  const onKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
  ) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(null)
      // 等草稿清掉那一帧再离开，离开时就不会把刚放弃的字存进去。
      const field = event.currentTarget
      requestAnimationFrame(() => field.blur())
      return
    }
    if (
      event.key === 'Enter' &&
      !event.nativeEvent.isComposing &&
      (!multiline || event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  const shared = {
    'aria-label': label,
    value: text,
    placeholder,
    onChange: (
      event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>,
    ) => setDraft(event.target.value),
    onBlur: () => void commit(),
    onKeyDown,
    autoFocus,
  }

  return (
    <span className="flex min-w-0 flex-col gap-1">
      {multiline ? (
        <textarea
          ref={ref}
          rows={1}
          {...shared}
          className={cn(SURFACE, 'field-sizing-content resize-none', className)}
        />
      ) : (
        <input type="text" {...shared} className={cn(SURFACE, className)} />
      )}
      {hint && draft !== null ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </span>
  )
})

/**
 * 一排标签：悬停一枚露出 ×；行尾「+ 标签」点开是一个小输入，回车加（逗号可一次加几枚）。
 * 触屏没有悬停，× 与「+」常显；一枚都没有时「+」也常显（不然这一行是空白）。
 */
export function CharacterTagChips({
  tags,
  addLabel,
  removeLabel,
  onCommit,
}: {
  tags: string[]
  addLabel: string
  removeLabel(tag: string): string
  onCommit(next: string[]): Promise<boolean>
}) {
  const [adding, setAdding] = useState<string | null>(null)

  const add = async () => {
    const fresh = (adding ?? '')
      .split(/[,，\n]/)
      .map((tag) => tag.trim())
      .filter((tag) => tag && !tags.includes(tag))
    setAdding(null)
    if (fresh.length) await onCommit([...tags, ...fresh])
  }

  return (
    <div className="group/tags flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="group/tag inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs"
        >
          {tag}
          <button
            type="button"
            aria-label={removeLabel(tag)}
            onClick={() => void onCommit(tags.filter((item) => item !== tag))}
            className="text-muted-foreground opacity-0 transition-opacity duration-fast hover:text-foreground focus-visible:opacity-100 group-hover/tag:opacity-100 pointer-coarse:opacity-100"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      {adding !== null ? (
        <input
          autoFocus
          type="text"
          aria-label={addLabel}
          value={adding}
          onChange={(event) => setAdding(event.target.value)}
          onBlur={() => void add()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setAdding(null)
            } else if (
              event.key === 'Enter' &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          className="w-40 rounded-md bg-background px-2 py-0.5 font-mono text-xs outline-none ring-1 ring-foreground"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding('')}
          className={cn(
            'inline-flex items-center gap-0.5 rounded-md border border-dashed border-border px-2 py-0.5 font-mono text-xs text-muted-foreground transition-opacity duration-fast hover:text-foreground',
            tags.length &&
              'opacity-0 focus-visible:opacity-100 group-hover/tags:opacity-100 pointer-coarse:opacity-100',
          )}
        >
          <Plus className="size-3" aria-hidden />
          {addLabel}
        </button>
      )}
    </div>
  )
}
