'use client'

/**
 * 历史下拉里的**一条会话**（D7c ④ · 画板 `DesignD7cShell` 六态）。
 *
 * ── 改名就地、删除弹窗 ────────────────────────────────────────────
 *  · **编辑 = 就地**（owner 原话：「点击编辑后应该直接编辑」）：标题那一格换成
 *    `<input>`（回车保存 · Esc 取消 · 失焦保存），逐字沿用 56a 记忆列表那一套
 *    （`SettingsAssistantSection` 的 `MemoryRow`），连 `cancelledRef` 那一手都一样 ——
 *    Esc 之后紧跟着的那一拍 blur 不许当成保存。
 *  · **删除 = 弹窗确认**（owner 10-27 选「像 Claude」，推翻 09-20 的原位两段：红色药丸
 *    3 秒自己退回，点慢了就像没删）：垃圾桶只交出 `onRequestDelete`，弹窗由宿主挂
 *    `StudioOperatorSessionDeleteDialog`（行在下拉里，菜单一关行就卸了），失败走底部黑条。
 *
 * ── D7c ④ 改了长相（owner 2026-09-20 确认画板）────────────────────
 *  · **一行两层**：标题 13px 单行截断，下面 11px「工作台 · 日期」用 `·` 连起来 ——
 *    ⛔ 不再是隔着一大格的两段（那一格 `gap-2` 让两样读起来像两栏表格）。
 *  · **「哪条是当前」由行自己说**（owner 2026-09-20 真机：「选中不要有这个 ✅。
 *    直接做成选中态就可以了」）：那枚 ✓ 与铅笔、垃圾桶同尺寸同位置排在一条线上，
 *    看起来是第三颗按钮、实际按不了。现在当前那一行**常驻一层浅填充**、标题字重
 *    上到 medium，⛔ 不再塞一枚和操作按钮抢位置的字形。
 *    ⚠ 三档底色走 HIG 填充三档（`--surface-fill` 4% / `-hover` 7% / `-track` 11%，
 *    见 `globals.css`）：选中静息 < 任意行 hover < 选中且 hover。⛔ 别让选中与
 *    hover 撞成同一个值 —— 鼠标一划过就分不清哪条是当前。
 *    ⚠ **语义单独留着**：行上挂 `aria-current` —— ✓ 曾经是唯一告诉读屏「这是当前
 *    项」的东西，删了它就必须有人顶上，⛔ 选中态那层底色对读屏什么都没说。
 *  · **图标按需**：改名 / 删除**默认不可见**，hover 或键盘聚焦才淡入（只动
 *    `opacity`）。⚠ 位子**常驻**：两态之间标题的截断点必须逐像素一致，⛔ 不做位移
 *    —— 会抖的行没法用指针瞄准。⚠ 触屏（`coarse:`）常显：那一档没有 hover，
 *    留一颗看不见却按得到的删除是陷阱（`ui-defaults.md §6`）。
 *  · **删掉 = 这一行收起**：确认之后（请求在飞时）行高收到 0、同时淡出，删成功
 *    再从列表里摘掉；失败就原样展开回来。⛔ 不是瞬间消失 —— 列表会整块跳一下。
 *
 * ⚠ **输入框在 Radix 菜单里要挡住两件事**：菜单的 typeahead（任何可打印键都会
 * 跳到另一行）与 Esc 关菜单。所以编辑态整格 `onKeyDown` 先 `stopPropagation()`，
 * 回车 / Esc 由这里自己收尾。⛔ 编辑态那一格 ⛔ 不是 `DropdownMenuItem`：菜单项
 * 会在指针掠过时抢焦点，而那正是用户正在打字的地方。
 * ⚠ 编辑态**不淡入**（画板动效表）：要等动画才能打字的输入框是坏动画。
 */

import { useRef, useState, type ReactNode, type SyntheticEvent } from 'react'
import { Pencil, Trash2 } from '@/components/icons'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { DURATION_MS, EASE_STANDARD } from '@/constants/motion'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { deriveAssistantConversationTitle } from '@/lib/assistant-conversation-title'
import { ASSISTANT_CONVERSATION_LIMITS } from '@/types/assistant-conversation'
import type { AssistantConversationSummary } from '@/types/assistant-conversation'
import { cn } from '@/lib/utils'

/**
 * 两颗行内图标钮的皮肤（画板：24px 见方、6px 圆角）。
 *
 * ⚠ ⛔ 不继承 `DropdownMenuItem` 的 `px-2 py-1.5`：那一档是给「一行文字菜单项」的，
 * 套在一枚图标上会把 44px 的行撑开。
 */
const ROW_ICON_BUTTON_CLASS =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-sm p-0 text-muted-foreground transition-colors duration-fast ease-linear focus:bg-surface-fill-hover motion-reduce:transition-none'

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
 * 行里能点的那几格：在下拉里是菜单项（键盘上下走、选了关菜单），摆在框里那一列（用户 10-26
 * 历史列）就是普通按钮 —— ⛔ 菜单项离了菜单会报错。两边同一套皮肤。
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
  /** `false` = 摆在框里那一列（不在下拉菜单里）。默认在菜单里。 */
  inMenu?: boolean
  /** 助手的一段会话，或配音间的一段（用户 10-25：标题 ▾ 两边同一套行）。 */
  session: Pick<AssistantConversationSummary, 'id' | 'title'> & {
    surface?: AssistantConversationSummary['surface']
  }
  /** 改名上限（配音间房间名比会话标题短）；默认会话标题那一档。 */
  titleMaxLength?: number
  /** 标题右边那一格：进度「2/4」或「出好了没看」的小点（9f-3 从左栏列表挪来）。 */
  badge?: ReactNode
  /**
   * 一行一层（用户 10-25 定左栏两个浮层的样子）：36 高、只有标题，时间靠右；改名 / 删除在 hover 时
   * 顶替时间那一格（两样叠在同一格里，宽度不变，标题截断点不动）。缺省 = 原来那种两层。
   */
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
  /** 点了垃圾桶：宿主弹 `StudioOperatorSessionDeleteDialog`（见头注）。 */
  onRequestDelete(): void
}

export function StudioOperatorSessionRow({
  session,
  titleMaxLength = ASSISTANT_CONVERSATION_LIMITS.titleMaxLength,
  badge,
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
   * 三个标题，⛔ 别合成一个（owner 2026-09-20 真机第 4 条 + 改名预填那一条）：
   *  · `title` = **库里那一份**，只给读屏的那句 `aria-label`（「重命名 X」要说得出
   *    它在改哪一条，而库里那一份是它的真身份）；
   *  · `derivedTitle` = 派生出来的短名，`null` = 这条会话本来就没有标题；
   *  · `displayTitle` = 眼睛看的那一份，与头部胶囊共用同一个函数。
   *
   * ⭐ **改名预填的是 `derivedTitle`**（owner：「最好是总结的标题，就像 claude
   * 那样」）：行上写「分析这个图片的画风」、点开却出来
   * 「分析这个图片的画风reference image 1」，是把存量噪音倒回给用户去手删。
   * ⚠ 派生不出来时填**空串**，⛔ 不填 `history.untitled`：那是一句占位，用户一回车
   *   就会把「未命名会话」存成真标题。
   */
  const title = session.title ?? t('history.untitled')
  const derivedTitle = deriveAssistantConversationTitle(session.title)
  const displayTitle = derivedTitle ?? t('history.untitled')
  /** `null` = 不在编辑态。⛔ 不用一个布尔 + 一份文本：两格状态会漂。 */
  const [draft, setDraft] = useState<string | null>(null)
  /**
   * Esc 按下之后那一拍的 blur **不许当成保存**（判据与 56a 记忆行逐字同源）。
   * ⚠ 走 ref 不走 state：`setDraft(null)` 要到下一次渲染才生效，而 blur 就在
   * 这一拍紧接着发生。
   */
  const cancelledRef = useRef(false)

  const commitRename = () => {
    const cancelled = cancelledRef.current
    cancelledRef.current = false
    const value = (draft ?? '').trim()
    setDraft(null)
    if (cancelled || !value || value === session.title) return
    onRename(value.slice(0, titleMaxLength))
  }

  const editing = draft !== null
  const reducedMotion = useReducedMotion()

  /* ── 两颗图标：默认透明、hover / 聚焦才淡入（见下方渲染处的注释）。 */
  const actionButtons = (
    <span
      data-testid="operator-session-actions"
      className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-fast ease-linear group-hover/row:opacity-100 group-focus-within/row:opacity-100 coarse:opacity-100 motion-reduce:transition-none"
    >
      <RowItem
        inMenu={inMenu}
        className={cn(ROW_ICON_BUTTON_CLASS, 'focus:text-foreground')}
        data-testid="operator-session-rename"
        aria-label={t('history.renameLabel', { title })}
        disabled={renaming || deleting}
        onSelect={(event) => {
          // ⛔ 不让菜单跟着关掉：接下来用户要在这一行里打字。
          event.preventDefault()
          // 见 `derivedTitle` 的头注：填看得见的那一句，⛔ 不是库里那一份。
          setDraft(derivedTitle ?? '')
        }}
      >
        <Pencil className="size-3.5 text-current" aria-hidden />
      </RowItem>
      <RowItem
        inMenu={inMenu}
        className={cn(ROW_ICON_BUTTON_CLASS, 'focus:text-status-risk')}
        data-testid="operator-session-delete"
        aria-label={t('history.deleteLabel', { title })}
        disabled={deleteDisabled}
        // 在下拉里让菜单照常关掉：弹窗由宿主挂在菜单外面。
        onSelect={onRequestDelete}
      >
        <Trash2 className="size-3.5 shrink-0 text-current" aria-hidden />
      </RowItem>
    </span>
  )

  return (
    /* 删除时整行收起（见头注）。⚠ `initial={false}`：打开菜单时各行 ⛔ 不演一遍展开。 */
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
        data-testid="operator-session-row"
        data-session-id={session.id}
        /* 44px 一行、8px 圆角（画板「静息 / hover」两态）。底色亮起的是**整行**
         而不是标题那一格 —— 右边两颗图标也属于这一行，⛔ 不让它们各亮各的。
         ⚠ `focus-within` 那一档是键盘路：Radix 菜单项被高亮时是真的拿到了焦点。 */
        /* ⚠ 当前那一条的**语义**（见头注）：`aria-current` 是 ✓ 退场之后唯一还
         在说「这是当前项」的东西，⛔ 底色对读屏什么都没说。 */
        {...(current ? { 'aria-current': 'true' as const } : {})}
        className={cn(
          compact ? 'h-9' : 'h-11',
          'group/row flex items-center gap-2 rounded-md pr-1.5 transition-colors duration-fast ease-linear motion-reduce:transition-none',
          // 三档底色（见头注）：选中静息 4% < 任意行 hover 7% < 选中且 hover 11%。
          current
            ? 'bg-surface-fill hover:bg-surface-fill-track focus-within:bg-surface-fill-track'
            : 'hover:bg-surface-fill-hover focus-within:bg-surface-fill-hover',
          // 编辑态左边少 2px：输入框自己那条 1px 边把文字往里推了一格。
          editing ? 'pl-1.75' : 'pl-2.25',
        )}
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
              maxLength={titleMaxLength}
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
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-2sm',
                      current && 'font-medium',
                    )}
                  >
                    {displayTitle}
                  </span>
                </>
              ) : (
                <span className="flex min-w-0 flex-1 flex-col">
                  {/* CSS `truncate` 只是兜底 —— 真正的上限在派生函数里。
                    ⚠ 当前那一条字重上一档：底色之外再给一条线索，⛔ 状态不只靠
                    颜色（`forbidden.md`）。 */}
                  <span
                    className={cn(
                      'block truncate text-2sm leading-snug',
                      current && 'font-medium',
                    )}
                  >
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
              )}
              {badge}
            </RowItem>

            {/* ── 两颗图标：默认透明、hover / 聚焦才淡入（画板动效表第 3 行）────
              ⚠ 整块**常驻占位**：`opacity` 之外一个盒模型属性都不动，所以标题的
                截断点在两态之间逐像素一致。 */}
            {compact ? (
              /* 时间与两颗图标叠在同一格（`grid` 一格两层）：hover / 聚焦时时间淡出、图标淡入，宽度取两者大的那个，
                 ⛔ 不位移。 */
              <span className="grid shrink-0 items-center justify-items-end">
                <span className="col-start-1 row-start-1 font-mono text-2xs tabular-nums text-muted-foreground transition-opacity duration-fast ease-linear group-hover/row:opacity-0 group-focus-within/row:opacity-0 coarse:opacity-0 motion-reduce:transition-none">
                  {dateLabel}
                </span>
                <span className="col-start-1 row-start-1">{actionButtons}</span>
              </span>
            ) : (
              actionButtons
            )}
          </>
        )}
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
