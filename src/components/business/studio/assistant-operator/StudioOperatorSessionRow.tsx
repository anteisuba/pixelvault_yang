'use client'

/**
 * 历史下拉里的**一条会话**（D7c ④ · 画板 `DesignD7cShell` 六态）。
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
 *  · **删除 = 原位两段**：垃圾桶就地撑成一颗红色「确认」药丸，再点一次才真删。
 *
 * ── D7c ④ 改了长相（owner 2026-09-20 确认画板）────────────────────
 *  · **一行两层**：标题 13px 单行截断，下面 11px「工作台 · 日期」用 `·` 连起来 ——
 *    ⛔ 不再是隔着一大格的两段（那一格 `gap-2` 让两样读起来像两栏表格）。
 *  · **图标按需**：改名 / 删除**默认不可见**，hover 或键盘聚焦才淡入（只动
 *    `opacity`）。⚠ 位子**常驻**：两态之间标题的截断点必须逐像素一致，⛔ 不做位移
 *    —— 会抖的行没法用指针瞄准。⚠ 触屏（`coarse:`）常显：那一档没有 hover，
 *    留一颗看不见却按得到的删除是陷阱（`ui-defaults.md §6`）。
 *  · **两段确认是一次宽度形变**：药丸由「按钮左右内距 + 那两个字的 `max-width`」
 *    一起过渡（⛔ 不是换一颗按钮）—— `width: auto` 过渡不了，这是它的替身。
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
 * ⚠ 编辑态**不淡入**（画板动效表）：要等动画才能打字的输入框是坏动画。
 */

import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, Trash2 } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { deriveAssistantConversationTitle } from '@/lib/assistant-conversation-title'
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

/**
 * 两颗行内图标钮的皮肤（画板：24px 见方、6px 圆角）。
 *
 * ⚠ ⛔ 不继承 `DropdownMenuItem` 的 `px-2 py-1.5`：那一档是给「一行文字菜单项」的，
 * 套在一枚图标上会把 44px 的行撑开。
 */
const ROW_ICON_BUTTON_CLASS =
  'flex h-6 shrink-0 items-center justify-center rounded-sm p-0 transition-[background-color,color,padding] duration-(--duration-fast) ease-standard motion-reduce:transition-none'

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
  /**
   * ⚠ 两个标题，⛔ 别合成一个（owner 2026-09-20 真机第 4 条）：
   *  · `title` = **库里那一份**，给读屏与改名的初值 —— 用户要改的是真名字；
   *  · `displayTitle` = 派生出来的短名，只给眼睛看，与头部胶囊共用同一个函数。
   */
  const title = session.title ?? t('history.untitled')
  const displayTitle =
    deriveAssistantConversationTitle(session.title) ?? t('history.untitled')
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

  const editing = draft !== null

  return (
    <div
      data-testid="operator-session-row"
      data-session-id={session.id}
      /* 44px 一行、8px 圆角（画板「静息 / hover」两态）。底色亮起的是**整行**
         而不是标题那一格 —— 右边两颗图标也属于这一行，⛔ 不让它们各亮各的。
         ⚠ `focus-within` 那一档是键盘路：Radix 菜单项被高亮时是真的拿到了焦点。 */
      className={cn(
        'group/row flex h-11 items-center gap-2 rounded-md pr-1.5 transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-within:bg-accent motion-reduce:transition-none',
        // 编辑态左边少 2px：输入框自己那条 1px 边把文字往里推了一格。
        editing ? 'pl-1.75' : 'pl-2.25',
      )}
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
      {editing ? (
        /* ⚠ 整格挡住菜单的 typeahead 与 Esc（见头注），⛔ 不是 `DropdownMenuItem`。 */
        <div
          className="flex min-w-0 flex-1 flex-col gap-0.5"
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
            /* 进来就**全选**（画板「改名中」）：用户按铅笔多半是要重写整句，
               先全选让「直接打字」就等于覆盖。 */
            onFocus={(event) => event.currentTarget.select()}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              // ⚠ Esc 只立起那面旗、让 blur 自己收尾（见 `cancelledRef` 头注）。
              if (event.key === 'Escape') {
                cancelledRef.current = true
                event.currentTarget.blur()
              }
            }}
            className="h-6 w-full rounded-sm border border-foreground bg-background px-1.75 text-2sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {/* 第二行换成这一句操作提示（画板「改名中」）——「工作台 · 日期」在
              编辑这一刻不回答任何问题。 */}
          <span
            data-testid="operator-session-rename-hint"
            className="truncate pl-0.5 text-3xs text-muted-foreground"
          >
            {renaming ? t('history.renaming') : t('history.renameHint')}
          </span>
        </div>
      ) : (
        <>
          <DropdownMenuItem
            /* ⚠ 菜单项自己那一层底色**关掉**：亮起来的是整行（见上）。 */
            className="min-w-0 flex-1 gap-1.5 rounded-sm p-0 focus:bg-transparent"
            disabled={selectDisabled}
            data-testid="operator-session-item"
            data-session-id={session.id}
            data-surface={session.surface}
            data-current={current ? 'true' : 'false'}
            onSelect={onSelect}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              {/* CSS `truncate` 只是兜底 —— 真正的上限在派生函数里。 */}
              <span className="block truncate text-2sm leading-snug">
                {displayTitle}
              </span>
              {/* ⚠ 一行两段用 `·` 连起来（画板），⛔ 不再是隔着 `gap-2` 的两栏。
                  ⚠ 日期单独一个 span 走等宽（`ui-defaults.md §1`：日期是机器串），
                    ⛔ 不给整行套 `font-mono` —— 「图片工作台」四个字会白付一次噪音。 */}
              {/* ⚠ `block` 不是 `flex`：flex 会把每个 span 的首尾空白**裁掉**，
                  表现是「图片工作台 ·09/10」—— 点号后面那一格空格没了。 */}
              <span className="block truncate text-2xs leading-snug text-muted-foreground">
                {domainLabel ? <span>{`${domainLabel} · `}</span> : null}
                <span className="font-mono tabular-nums">{dateLabel}</span>
              </span>
            </span>
            {current ? (
              <Check className="size-3.5 shrink-0" aria-hidden />
            ) : null}
          </DropdownMenuItem>

          {/* ── 两颗图标：默认透明、hover / 聚焦才淡入（画板动效表第 3 行）────
              ⚠ 整块**常驻占位**：`opacity` 之外一个盒模型属性都不动，所以标题的
                截断点在两态之间逐像素一致。
              ⚠ 确认态强制可见：此刻这一行正举着刀，⛔ 不许它随 hover 消失。 */}
          <span
            data-testid="operator-session-actions"
            className={cn(
              'flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-(--duration-fast) ease-standard group-hover/row:opacity-100 group-focus-within/row:opacity-100 coarse:opacity-100 motion-reduce:transition-none',
              confirming && 'opacity-100',
            )}
          >
            <DropdownMenuItem
              className={cn(ROW_ICON_BUTTON_CLASS, 'w-6 text-muted-foreground')}
              data-testid="operator-session-rename"
              aria-label={t('history.renameLabel', { title })}
              disabled={renaming || deleting}
              onSelect={(event) => {
                // ⛔ 不让菜单跟着关掉：接下来用户要在这一行里打字。
                event.preventDefault()
                setDraft(session.title ?? '')
              }}
            >
              <Pencil className="size-3.5 text-current" aria-hidden />
            </DropdownMenuItem>
            <DropdownMenuItem
              className={cn(
                ROW_ICON_BUTTON_CLASS,
                confirming
                  ? 'gap-0 bg-status-risk px-1.5 text-white focus:bg-status-risk focus:text-white'
                  : 'w-6 text-muted-foreground focus:text-status-risk',
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
              <Trash2 className="size-3.5 shrink-0 text-current" aria-hidden />
              {/* ⚠ 药丸是**撑出来**的：`width: auto` 过渡不了，所以让这两个字
                  自己从 `max-w-0` 长到 `max-w-20`，左内距写在里层（被裁掉）。 */}
              <span
                className={cn(
                  'overflow-hidden whitespace-nowrap transition-[max-width] duration-(--duration-fast) ease-standard motion-reduce:transition-none',
                  confirming ? 'max-w-20' : 'max-w-0',
                )}
              >
                <span className="pl-1 text-2xs font-medium">
                  {deleting
                    ? t('history.deleting')
                    : t('history.deleteConfirm')}
                </span>
              </span>
            </DropdownMenuItem>
          </span>
        </>
      )}

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
