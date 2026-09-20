'use client'

/**
 * 历史下拉里的**一条会话**（owner 2026-09-20 真机第 3 条）。
 *
 * ── 它替掉了什么 ────────────────────────────────────────────────
 * 铅笔开一张 `AlertDialog` 改名、垃圾桶开另一张 `AlertDialog` 确认删除。
 * owner 原话：「点击编辑后应该直接编辑；点击删除后按钮切换成确认删除的按钮，
 * 再点一次才删」。两张弹层整块退场 —— 一次改名要穿过一层浮层、一次删除要读一段
 * 说明文字，而这两件事都只有一个可能的对象：手指底下这一行。
 *
 *  · **编辑 = 就地**：标题那一格换成 `<input>`（回车保存 · Esc 取消 · 失焦保存），
 *    逐字沿用 56a 记忆列表那一套（`SettingsAssistantSection` 的 `MemoryRow`），
 *    连 `cancelledRef` 那一手都一样 —— Esc 之后紧跟着的那一拍 blur 不许当成保存。
 *  · **删除 = 原位两段**：垃圾桶就地换成「确认删除」（`status-risk`），再点一次
 *    才真删。命中区一格不变，⛔ 不换尺寸：位置跳一下的按钮会让第二下点空。
 *
 * ── 退回确认态的三条路 ─────────────────────────────────────────
 * 3 秒无操作 · 指针离开这一行 · 焦点离开这一行。三条都退回，因为「举着一把刀」
 * 不该是列表的常态；⛔ 也不靠点别处冒泡来退（下拉里点别处会顺手关掉整个菜单）。
 * **同一列表同时只有一行能进确认态**：那一格状态住在父级（`confirming` 是 prop，
 * 不是自己的 state），⛔ 不让每行各记各的 —— 各记各的表现是一屏红字。
 *
 * ⚠ **输入框在 Radix 菜单里要挡住两件事**：菜单的 typeahead（任何可打印键都会
 * 跳到另一行）与 Esc 关菜单。所以编辑态整格 `onKeyDown` 先 `stopPropagation()`，
 * 回车 / Esc 由这里自己收尾。⛔ 编辑态那一格 ⛔ 不是 `DropdownMenuItem`：菜单项
 * 会在指针掠过时抢焦点，而那正是用户正在打字的地方。
 */

import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, Trash2 } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { ASSISTANT_CONVERSATION_LIMITS } from '@/types/assistant-conversation'
import type { AssistantConversationSummary } from '@/types/assistant-conversation'
import { cn } from '@/lib/utils'

/**
 * 确认态自己退回去要多久。
 *
 * ⚠ ⛔ 不走 `constants/motion` 的四档：那四档说的是**过渡多长**（120–500ms），
 * 这是一段**停留** —— 手指从垃圾桶挪到同一个位置再点一次要多久。
 * 3 秒是 owner 在批注里写死的数。
 */
const DELETE_CONFIRM_DWELL_MS = 3000

interface StudioOperatorSessionRowProps {
  session: AssistantConversationSummary
  /** 已经翻好的那两格注脚：域名（画布没有，给 null）与日期。 */
  domainLabel: string | null
  dateLabel: string
  current: boolean
  /** 这一行的「选中这段会话」此刻能不能点（在飞 / 正在载别的一段 / 正在删它）。 */
  selectDisabled: boolean
  /** 这一行的删除此刻能不能点（别处正在删 / 正在跑的当前会话）。 */
  deleteDisabled: boolean
  /** 这一行正在写库 —— 编辑态锁住输入框、删除态写「删除中…」。 */
  renaming: boolean
  deleting: boolean
  /** 确认态的真值住在父级：同一列表一次只有一行（见头注）。 */
  confirming: boolean
  onSelect(): void
  onRename(title: string): void
  onRequestDelete(): void
  onCancelDelete(): void
  onConfirmDelete(): void
}

export function StudioOperatorSessionRow({
  session,
  domainLabel,
  dateLabel,
  current,
  selectDisabled,
  deleteDisabled,
  renaming,
  deleting,
  confirming,
  onSelect,
  onRename,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: StudioOperatorSessionRowProps) {
  const t = useTranslations('StudioOperator')
  const title = session.title ?? t('history.untitled')
  /** `null` = 不在编辑态。⛔ 不用一个布尔 + 一份文本：两格状态会漂。 */
  const [draft, setDraft] = useState<string | null>(null)
  /**
   * Esc 按下之后那一拍的 blur **不许当成保存**（判据与 56a 记忆行逐字同源）。
   * ⚠ 走 ref 不走 state：`setDraft(null)` 要到下一次渲染才生效，而 blur 就在
   * 这一拍紧接着发生。
   */
  const cancelledRef = useRef(false)

  /** 3 秒无操作自己退回去。⚠ 卸载 / 退出确认态时清掉定时器。 */
  useEffect(() => {
    if (!confirming) return
    const timer = window.setTimeout(onCancelDelete, DELETE_CONFIRM_DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [confirming, onCancelDelete])

  const commitRename = () => {
    const cancelled = cancelledRef.current
    cancelledRef.current = false
    const value = (draft ?? '').trim()
    setDraft(null)
    if (cancelled || !value || value === session.title) return
    onRename(value.slice(0, ASSISTANT_CONVERSATION_LIMITS.titleMaxLength))
  }

  return (
    <div
      data-testid="operator-session-row"
      data-session-id={session.id}
      className="flex items-center gap-1"
      /* 指针离开 / 焦点离开都退回确认态（见头注的三条路）。 */
      onPointerLeave={confirming ? onCancelDelete : undefined}
      onBlur={
        confirming
          ? (event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                onCancelDelete()
            }
          : undefined
      }
    >
      {draft === null ? (
        <DropdownMenuItem
          className="min-w-0 flex-1"
          disabled={selectDisabled}
          data-testid="operator-session-item"
          data-session-id={session.id}
          data-surface={session.surface}
          data-current={current ? 'true' : 'false'}
          onSelect={onSelect}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate">{title}</span>
            <span className="mt-0.5 flex items-center gap-2 text-2sm text-muted-foreground">
              {domainLabel ? <span>{domainLabel}</span> : null}
              <span className="font-mono tabular-nums">{dateLabel}</span>
            </span>
          </span>
          {current ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
        </DropdownMenuItem>
      ) : (
        /* ⚠ 整格挡住菜单的 typeahead 与 Esc（见头注），⛔ 不是 `DropdownMenuItem`。 */
        <div
          className="min-w-0 flex-1 px-2 py-1.5"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <input
            autoFocus
            type="text"
            data-testid="operator-session-rename-input"
            value={draft}
            disabled={renaming}
            maxLength={ASSISTANT_CONVERSATION_LIMITS.titleMaxLength}
            aria-label={t('history.renameLabel', { title })}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              // ⚠ Esc 只立起那面旗、让 blur 自己收尾（见 `cancelledRef` 头注）。
              if (event.key === 'Escape') {
                cancelledRef.current = true
                event.currentTarget.blur()
              }
            }}
            className="h-7 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}

      {draft === null ? (
        <>
          <DropdownMenuItem
            className="shrink-0 p-2 text-muted-foreground"
            data-testid="operator-session-rename"
            aria-label={t('history.renameLabel', { title })}
            disabled={renaming || deleting}
            onSelect={(event) => {
              // ⛔ 不让菜单跟着关掉：接下来用户要在这一行里打字。
              event.preventDefault()
              setDraft(session.title ?? '')
            }}
          >
            <Pencil className="size-4" aria-hidden />
          </DropdownMenuItem>
          <DropdownMenuItem
            className={cn(
              // ⚠ 两态**同一格尺寸** `p-2`：位置跳一下的按钮会让第二下点空。
              'shrink-0 p-2',
              confirming
                ? 'text-status-risk focus:text-status-risk'
                : 'text-muted-foreground focus:text-destructive',
            )}
            data-testid="operator-session-delete"
            data-confirming={confirming ? 'true' : 'false'}
            aria-label={
              confirming
                ? t('history.deleteConfirmInline', { title })
                : t('history.deleteLabel', { title })
            }
            disabled={deleteDisabled}
            onSelect={(event) => {
              // 两段都不关菜单：第一下要留在原地等第二下，第二下之后列表还要刷新。
              event.preventDefault()
              if (confirming) onConfirmDelete()
              else onRequestDelete()
            }}
          >
            {confirming ? (
              <span className="text-2sm font-medium whitespace-nowrap">
                {deleting ? t('history.deleting') : t('history.deleteConfirm')}
              </span>
            ) : (
              <Trash2 className="size-4" aria-hidden />
            )}
          </DropdownMenuItem>
        </>
      ) : null}

      {/* 确认态说给读屏听的那一句（`forbidden.md`：状态不许只靠颜色）。 */}
      <span
        role="status"
        aria-live="polite"
        data-testid="operator-session-delete-live"
        className="sr-only"
      >
        {confirming ? t('history.deleteConfirmInline', { title }) : ''}
      </span>
    </div>
  )
}
