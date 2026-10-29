'use client'

/**
 * 历史列表里的**一条会话**（三处宿主共用：标题 ▾ 下拉、手机历史键、白板历史列）。
 *
 * ── 方向 3「行上不放图标，像 Finder」（owner 2026-10-27，原型 artifact `Wzq2F1yqU9PLMb8x9S2u1p`）
 *  · 行上只有标题和时间。⛔ 悬停冒出铅笔 / 垃圾桶（那两颗挤掉时间、把标题截短）。
 *  · **当前那一行**常驻一颗 ⋯（顶替时间那一格，宽度不变）；**任意一行**右键 / 触屏长按 /
 *    键盘菜单键都开同一个小菜单：重命名 · 删除。菜单从**指针那一点**长出来（以一颗看不见的
 *    0×0 锚点当触发器，开合走 chip 那套放大 + 由糊变清，`getChipZoomMotion`）。
 *  · **改名就地**：标题那一格换成同尺寸输入框 —— 底色变白、一圈细线、光标落在句尾，⛔ 选中整句、
 *    ⛔ 提示行。回车 / 失焦保存，Esc 原样退回（`cancelledRef`：Esc 之后紧跟的那一拍 blur
 *    ⛔ 当成保存）。白板列里双击标题也进改名（像 Finder）；下拉里单击就选中并关菜单，那里只走菜单。
 *  · **删除 = 弹窗确认**（owner 10-27 选「像 Claude」）：菜单只交出 `onRequestDelete`，弹窗由宿主挂
 *    `StudioOperatorSessionDeleteDialog`；删掉 = 这一行收起（行高到 0 + 淡出），失败原样展开。
 *
 * ── 长相（D7c ④ 留下的）
 *  · 两层那一种：标题 13px 单行截断，下面 11px「工作台 · 日期」用 `·` 连起来。
 *  · 「哪条是当前」由行自己说：常驻浅填充 + 字重 medium + `aria-current`。三档底色走 HIG 填充
 *    （`--surface-fill` 4% / `-hover` 7% / `-track` 11%）：选中静息 < 任意行 hover < 选中且 hover。
 *
 * ⚠ **在 Radix 下拉里要挡两件事**：菜单的 typeahead 与 Esc 关菜单 —— 编辑态整格先
 *   `stopPropagation()`，回车 / Esc 自己收尾；编辑态那一格 ⛔ 是 `DropdownMenuItem`。
 * ⚠ 行菜单本身也是一个下拉：挂在宿主下拉里时，宿主的 `onInteractOutside` 要认得
 *   `SESSION_ROW_MENU_ATTR`，⛔ 点行菜单把整个历史下拉关掉。
 */

import {
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import { MoreHorizontal, Pencil, Trash2 } from '@/components/icons'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { DURATION_MS, EASE_STANDARD } from '@/constants/motion'
import { getChipZoomMotion } from '@/components/business/studio-shared/primitives/tool-surface'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTouchLongPress } from '@/hooks/use-touch-long-press'
import { deriveAssistantConversationTitle } from '@/lib/assistant-conversation-title'
import { ASSISTANT_CONVERSATION_LIMITS } from '@/types/assistant-conversation'
import type { AssistantConversationSummary } from '@/types/assistant-conversation'
import { cn } from '@/lib/utils'

/** 行菜单的内容带这个属性：宿主下拉的 `onInteractOutside` 认得它就不关自己（见头注）。 */
export const SESSION_ROW_MENU_ATTR = 'data-session-row-menu'

const ROW_MENU_MOTION = getChipZoomMotion({ side: 'bottom', align: 'start' })

interface RowItemProps {
  inMenu: boolean
  className?: string
  disabled?: boolean
  onSelect(event: Event | SyntheticEvent): void
  children: ReactNode
  'aria-label'?: string
  [data: `data-${string}`]: string | undefined
}

/**
 * 选中这一段的那一格：在下拉里是菜单项（键盘上下走、选了关菜单），摆在白板那一列就是普通按钮 ——
 * ⛔ 菜单项离了菜单会报错。两边同一套皮肤。
 */
function RowItem({
  inMenu,
  className,
  disabled,
  onSelect,
  children,
  ...rest
}: RowItemProps) {
  if (inMenu)
    return (
      <DropdownMenuItem
        className={className}
        disabled={disabled}
        onSelect={onSelect}
        {...rest}
      >
        {children}
      </DropdownMenuItem>
    )
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'relative flex cursor-default items-center text-left text-2sm outline-hidden select-none disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

interface StudioOperatorSessionRowProps {
  /** `false` = 摆在白板那一列（不在下拉菜单里）。默认在菜单里。 */
  inMenu?: boolean
  /** 助手的一段会话，或配音间的一段（用户 10-25：标题 ▾ 两边同一套行）。 */
  session: Pick<AssistantConversationSummary, 'id' | 'title'> & {
    surface?: AssistantConversationSummary['surface']
  }
  /** 改名上限（配音间房间名比会话标题短）；默认会话标题那一档。 */
  titleMaxLength?: number
  /** 一行一层：36 高、只有标题，时间靠右。缺省 = 两层（标题 + 「工作台 · 日期」）。 */
  compact?: boolean
  /** 标题前面那一格（群聊叠两颗头像）；只在 `compact` 里画。 */
  leading?: ReactNode
  /** 已经翻好的那两格注脚：域名（画布没有，给 null）与日期。 */
  domainLabel: string | null
  dateLabel: string
  current: boolean
  /** 这一行的「选中这段会话」此刻能不能点（在飞 / 正在载别的一段 / 正在删它）。 */
  selectDisabled: boolean
  /** 这一行的删除此刻能不能点（别处正在删 / 正在跑的当前会话）。 */
  deleteDisabled: boolean
  /** 这一行正在写库 —— 编辑态锁住输入框、删除时整行收起。 */
  renaming: boolean
  deleting: boolean
  onSelect(): void
  onRename(title: string): void
  /** 菜单里点了删除：宿主弹 `StudioOperatorSessionDeleteDialog`（见头注）。 */
  onRequestDelete(): void
}

export function StudioOperatorSessionRow({
  session,
  titleMaxLength = ASSISTANT_CONVERSATION_LIMITS.titleMaxLength,
  compact = false,
  inMenu = true,
  leading,
  domainLabel,
  dateLabel,
  current,
  selectDisabled,
  deleteDisabled,
  renaming,
  deleting,
  onSelect,
  onRename,
  onRequestDelete,
}: StudioOperatorSessionRowProps) {
  const t = useTranslations('StudioOperator')
  /**
   * 三个标题，⛔ 别合成一个（owner 2026-09-20 真机第 4 条）：`title` = 库里那一份（只给读屏），
   * `derivedTitle` = 派生短名（`null` = 本来就没标题），`displayTitle` = 眼睛看的那一份。
   * ⭐ 改名预填的是 `derivedTitle`；派生不出来填空串，⛔ 把「未命名会话」那句占位存成真标题。
   */
  const title = session.title ?? t('history.untitled')
  const derivedTitle = deriveAssistantConversationTitle(session.title)
  const displayTitle = derivedTitle ?? t('history.untitled')
  /** `null` = 不在编辑态。⛔ 不用一个布尔 + 一份文本：两格状态会漂。 */
  const [draft, setDraft] = useState<string | null>(null)
  const cancelledRef = useRef(false)
  /** 行菜单开着时的锚点（相对这一行的坐标）；`null` = 关着。 */
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const pressAt = useRef({ x: 0, y: 0 })
  const reducedMotion = useReducedMotion()
  const editing = draft !== null

  const openMenuAt = (clientX: number, clientY: number) => {
    const rect = rowRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuAt({ x: clientX - rect.left, y: clientY - rect.top })
  }
  const longPress = useTouchLongPress<null>(() =>
    openMenuAt(pressAt.current.x, pressAt.current.y),
  )
  const pressHandlers = longPress.bind(null)

  const startRename = () => {
    setMenuAt(null)
    // 见 `derivedTitle` 的头注：填看得见的那一句（不截短，⛔ 把「…」填进去），⛔ 库里那一份。
    setDraft(
      deriveAssistantConversationTitle(session.title, { clamp: false }) ?? '',
    )
  }

  const commitRename = () => {
    const cancelled = cancelledRef.current
    cancelledRef.current = false
    const value = (draft ?? '').trim()
    setDraft(null)
    if (cancelled || !value || value === session.title) return
    onRename(value.slice(0, titleMaxLength))
  }

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (editing) return
    event.preventDefault()
    event.stopPropagation()
    if (longPress.swallow())
      return openMenuAt(pressAt.current.x, pressAt.current.y)
    // 键盘菜单键 / Shift+F10 给的是 (0, 0)：落在行的左下角。
    if (event.clientX === 0 && event.clientY === 0) {
      const rect = event.currentTarget.getBoundingClientRect()
      return openMenuAt(rect.left + 8, rect.bottom)
    }
    openMenuAt(event.clientX, event.clientY)
  }

  const titleText = (
    <span
      className={cn(
        compact
          ? 'min-w-0 flex-1 truncate text-2sm'
          : 'block truncate text-2sm leading-snug',
        current && 'font-medium',
      )}
    >
      {displayTitle}
    </span>
  )

  return (
    /* 删除时整行收起（见头注）。⚠ `initial={false}`：打开菜单时各行 ⛔ 演一遍展开。 */
    <motion.div
      initial={false}
      animate={
        deleting ? { height: 0, opacity: 0 } : { height: 'auto', opacity: 1 }
      }
      transition={
        reducedMotion
          ? { duration: 0 }
          : { duration: DURATION_MS.base / 1000, ease: EASE_STANDARD }
      }
      className="overflow-hidden"
    >
      <div
        ref={rowRef}
        data-testid="operator-session-row"
        data-session-id={session.id}
        {...(current ? { 'aria-current': 'true' as const } : {})}
        className={cn(
          compact ? 'h-9' : 'h-11',
          'group/row relative flex items-center gap-2 rounded-md pr-1.5 pl-2.25 transition-[background-color,box-shadow] duration-fast ease-linear motion-reduce:transition-none',
          editing
            ? 'bg-background ring-1 ring-surface-fill-track ring-inset'
            : current
              ? 'bg-surface-fill hover:bg-surface-fill-track focus-within:bg-surface-fill-track'
              : 'hover:bg-surface-fill-hover focus-within:bg-surface-fill-hover',
          menuAt &&
            !editing &&
            (current ? 'bg-surface-fill-track' : 'bg-surface-fill-hover'),
        )}
        onContextMenu={onContextMenu}
        /* 白板列里双击进改名（像 Finder）；挂在整行上 —— 选中键在飞时是禁用的，禁用按钮收不到双击。 */
        onDoubleClick={inMenu || editing ? undefined : startRename}
        onPointerDown={(event) => {
          pressAt.current = { x: event.clientX, y: event.clientY }
          pressHandlers.onPointerDown(event)
        }}
        onPointerMove={pressHandlers.onPointerMove}
        onPointerUp={pressHandlers.onPointerUp}
        onPointerCancel={pressHandlers.onPointerCancel}
        onKeyDown={(event) => {
          if (event.key !== 'F2' || editing) return
          event.preventDefault()
          event.stopPropagation()
          startRename()
        }}
      >
        {editing ? (
          /* ⚠ 整格挡住菜单的 typeahead 与 Esc（见头注），⛔ 是 `DropdownMenuItem`。 */
          <div
            className={cn(
              'flex min-w-0 flex-1',
              compact ? 'items-center' : 'flex-col',
            )}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <input
              autoFocus
              type="text"
              data-testid="operator-session-rename-input"
              value={draft}
              disabled={renaming}
              maxLength={titleMaxLength}
              aria-label={t('history.renameLabel', { title })}
              onChange={(event) => setDraft(event.target.value)}
              /* 光标落在句尾，⛔ 选中整句（owner 10-27：选中后整块灰底看着像出错）。 */
              onFocus={(event) => {
                const end = event.currentTarget.value.length
                event.currentTarget.setSelectionRange(end, end)
              }}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') {
                  cancelledRef.current = true
                  event.currentTarget.blur()
                }
              }}
              className="h-6 w-full min-w-0 bg-transparent p-0 text-2sm text-foreground outline-none"
            />
            {compact ? null : (
              <span className="block truncate text-2xs leading-snug text-muted-foreground">
                {domainLabel ? <span>{`${domainLabel} · `}</span> : null}
                <span className="font-mono tabular-nums">{dateLabel}</span>
              </span>
            )}
          </div>
        ) : (
          <RowItem
            inMenu={inMenu}
            /* ⚠ 菜单项自己那一层底色**关掉**：亮起来的是整行（见上）。 */
            className="min-w-0 flex-1 gap-1.5 rounded-sm p-0 focus:bg-transparent"
            disabled={selectDisabled}
            data-testid="operator-session-item"
            data-session-id={session.id}
            data-surface={session.surface}
            data-current={current ? 'true' : 'false'}
            onSelect={onSelect}
          >
            {compact ? (
              <>
                {leading}
                {titleText}
              </>
            ) : (
              <span className="flex min-w-0 flex-1 flex-col">
                {titleText}
                {/* ⚠ `block` 不是 `flex`：flex 会把 span 首尾空白裁掉（「图片工作台 ·09/10」）。 */}
                <span className="block truncate text-2xs leading-snug text-muted-foreground">
                  {domainLabel ? <span>{`${domainLabel} · `}</span> : null}
                  <span className="font-mono tabular-nums">{dateLabel}</span>
                </span>
              </span>
            )}
          </RowItem>
        )}

        {/* 右边那一格：当前行 = ⋯，别的行 = 时间（两层那一种时间在第二行，不画）。 */}
        {editing ? null : current ? (
          <button
            type="button"
            data-testid="operator-session-more"
            aria-label={t('history.moreLabel', { title })}
            aria-haspopup="menu"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              openMenuAt(rect.left, rect.bottom + 4)
            }}
            className="grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors duration-fast ease-linear hover:bg-surface-fill-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </button>
        ) : compact ? (
          <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
            {dateLabel}
          </span>
        ) : null}

        <DropdownMenu
          modal={false}
          open={menuAt !== null}
          onOpenChange={(open) => {
            if (!open) setMenuAt(null)
          }}
        >
          <DropdownMenuTrigger asChild>
            <span
              aria-hidden
              tabIndex={-1}
              className="pointer-events-none absolute size-0"
              style={menuAt ? { left: menuAt.x, top: menuAt.y } : undefined}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            {...{ [SESSION_ROW_MENU_ATTR]: '' }}
            side="bottom"
            align="start"
            sideOffset={0}
            data-testid="operator-session-menu"
            className={cn('w-37', ROW_MENU_MOTION.className)}
            style={ROW_MENU_MOTION.style}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <DropdownMenuItem
              data-testid="operator-session-rename"
              disabled={renaming || deleting}
              onSelect={startRename}
              className="h-8 rounded-lg px-2.5 text-2sm"
            >
              <Pencil className="size-3.5 text-current" aria-hidden />
              {t('history.rename')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="operator-session-delete"
              disabled={deleteDisabled}
              onSelect={() => {
                setMenuAt(null)
                onRequestDelete()
              }}
              className="h-8 rounded-lg px-2.5 text-2sm text-status-risk focus:text-status-risk"
            >
              <Trash2 className="size-3.5 text-current" aria-hidden />
              {t('history.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  )
}

/**
 * 删一段会话的确认弹窗（owner 10-27 选「像 Claude」）：三处历史宿主（标题 ▾、手机历史键、
 * 白板历史列）共用。`target` 非空即开着；删不掉走底部黑条，⛔ 不再塞在列表最底下。
 */
export function StudioOperatorSessionDeleteDialog({
  target,
  onClose,
  onDelete,
}: {
  target: { id: string } | null
  onClose(): void
  /** 真删；`false` = 没删掉。 */
  onDelete(id: string): Promise<boolean>
}) {
  const t = useTranslations('StudioOperator')
  const tFeedback = useTranslations('Feedback')
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('history.deleteTitle')}
      description={tFeedback('deleteDialog.irreversible')}
      cancelLabel={tFeedback('deleteDialog.cancel')}
      confirmLabel={tFeedback('deleteDialog.confirm')}
      onConfirm={() => {
        if (!target) return
        onClose()
        void onDelete(target.id).then((deleted) => {
          if (!deleted) toast.error(t('history.deleteFailed'))
        })
      }}
    />
  )
}
