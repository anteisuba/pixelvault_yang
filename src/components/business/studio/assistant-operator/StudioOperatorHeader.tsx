'use client'

/**
 * 面板**头部**（v2 §4.1 / 画板 Main 头部 · BCards「头部」两态）—— 一行：
 * 左边会话标题▾，右边两颗 32px 图标（历史 · 设置）。
 *
 * ── 它替掉了什么 ────────────────────────────────────────────────
 * 顶部那条进度带（整文件删）。决策 14：它占了 40px
 * 的常驻高度去说一句「3/6」，而这句话在加载态那句状态词里顺带就说了
 * （「正在查 3 个来源…」本身就是进度，§3.6）。
 *
 * ⚠ 带上挂着的两样东西**各自找到了去处**（§3.6 那条 ⚠）：
 *  · 齿轮设置入口 → 这里（头部右上，§4.1）；
 *  · 续跑 chip → **已搬到结论记录块的尾部**（§3.6，commit #13）。这里留着的是
 *    **回落档**：一条结论记录都没有时（会话从没结过账）它还得有个落点 ——
 *    这颗按钮本来就是为「刷新之后」存在的，而刷新之后恰恰可能什么都没载回来。
 *    ⚠ 挂不挂由面板判（`resumeHost`），⛔ 这里不再自己决定。
 *
 * ── 历史图标为什么和标题▾ 开的是**同一个下拉**（§4.1）──────────────
 * v1 把它们合并过一次（2026-09-09），结论是对的：用户找「上次那个会话」时脑子里
 * 想的就是「换一个标题」。所以这里是**一个受控的 `DropdownMenu`**，标题是它的
 * 触发器兼锚点，图标只是第二条路 —— ⛔ 不开第二个菜单实例（两份菜单内容必然漂）。
 * ⚠ 图标要能**再点一下关掉**：Radix 会先因为「点了菜单外面」把 open 置回 false，
 *   于是 onClick 里的取反永远只看得到 false。判据因此写在 `onInteractOutside` 上
 *   （点到的是这颗图标就不当外部点击），⛔ 别改成 pointerdown 去猜。
 *
 * ⚠ 收起钮（`onCollapse`）画板上没有，这里**保留**：收放法则（拍板 7）那条
 * 「点工作台就收」只有指针走得通，键盘用户在画板那版里一个收起的路都没有。
 * 它与那两颗同宽（32px），⛔ 不是第三种尺寸。
 */

import { useState } from 'react'
import {
  Check,
  Pencil,
  MessageSquarePlus,
  ChevronDown,
  Trash2,
  History,
  PanelRightClose,
  Settings2,
} from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import {
  STUDIO_OPERATOR_KEEP_OPEN_ATTR,
  STUDIO_OPERATOR_SHELL,
} from '@/constants/studio-assistant-operator'
import type { AssistantOperatorDomain } from '@/constants/assistant-operator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'
import { Input } from '@/components/ui/input'
import { ASSISTANT_CONVERSATION_LIMITS } from '@/types/assistant-conversation'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import {
  ASSISTANT_SURFACE_IDS,
  type AssistantSurfaceId,
  type AssistantConversationSummary,
} from '@/types/assistant-conversation'

/**
 * 会话行上那枚域标签读哪条词条。
 *
 * ⚠ `Record<Surface, …>`：surface 表加一档而这里没跟上，编译期就红 ——
 * 漏掉的表现是菜单上一枚印着 `undefined` 的标签。
 * ⚠ 画布不是操作员的域，`domainName` 里也没有它的词条 —— 不画标签。
 */
/**
 * 历史图标身上的标记 —— 菜单的 `onInteractOutside` 靠它认出「点的是我自己的
 * 第二个入口」（见头注）。⚠ 用属性不用 `data-testid`：testid 是给用例的，
 * ⛔ 不让运行时逻辑依赖它。
 */
const HISTORY_BUTTON_ATTR = 'data-operator-history-trigger'

/** 一天的毫秒数 —— 只给下面那个「今天 / 昨天」的日差用。 */
const MS_PER_DAY = 86_400_000

/**
 * 右上那两颗（＋保留的收起）图标钮的共用皮肤（§4.1：32px）。
 *
 * ⚠ 命中区 32px 是 `ui-defaults.md §5` 的 fine 档底线，⛔ 别为了挤下更多东西
 * 缩到 28 —— 它们是常驻入口，先保命中。
 */
const HEADER_ICON_BUTTON_CLASS =
  'grid size-8 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground active:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none'

const SESSION_DOMAIN_BY_SURFACE: Record<
  AssistantSurfaceId,
  AssistantOperatorDomain | null
> = {
  [ASSISTANT_SURFACE_IDS.imageStudio]: ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
  [ASSISTANT_SURFACE_IDS.videoStudio]: ASSISTANT_PROTOCOL_DOMAIN_IDS.video,
  [ASSISTANT_SURFACE_IDS.lora]: ASSISTANT_PROTOCOL_DOMAIN_IDS.lora,
  [ASSISTANT_SURFACE_IDS.nodeCanvas]: null,
}

interface StudioOperatorHeaderProps {
  domain: AssistantOperatorDomain
  /**
   * 这一轮还在跑 —— 会话切换 / 新会话在这一档**不可点**（换会话 = 换语境，
   * 而流正读着旧那一份）。
   * ⚠ ⛔ 它不再决定头部长什么样：进度带删了（决策 14），进度由状态词说（§3.6）。
   */
  working: boolean
  history: UseStudioOperatorHistoryResult
  onNewThread(): void
  /**
   * 「助手设置」（§4.1 右上那颗齿轮）。
   *
   * ⚠ 弹层住在外壳（`StudioOperatorDock`）：收放法则（拍板 7）随时会把面板卸载，
   * 弹层跟着面板走的下场是它自己突然消失。
   */
  onOpenAssistantSettings(): void
  onCollapse(): void
  /**
   * **有未完成计划**（第三期 · 断点续跑）—— 刷新之后唯一还看得见的入口。
   *
   * ⭐ 它必须在头部而不是只在流里：刷新之后线程是从库里载回来的**只读历史**，
   * checkpoint 薄卡那一档在历史类型里根本不存在 —— 于是「从第 N 步继续」在最需要
   * 它的那一刻（刚刷新完）一个入口都没有。
   * ⚠ 只在**空闲**时露脸：正在跑的时候再挤一颗「继续」会让人以为要开第二条流。
   * ⚠ 缺席 = 没有没跑完的计划，⛔ 不画停用态。
   */
  resume?: {
    /** 1 起数。 */
    stepNumber: number
    onResume(): void
  }
}

export function StudioOperatorHeader({
  domain,
  working,
  history,
  onNewThread,
  onOpenAssistantSettings,
  onCollapse,
  resume,
}: StudioOperatorHeaderProps) {
  const t = useTranslations('StudioOperator')
  const format = useFormatter()
  const [deleteTarget, setDeleteTarget] =
    useState<AssistantConversationSummary | null>(null)

  const [renameTarget, setRenameTarget] =
    useState<AssistantConversationSummary | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  /** 标题▾ 与历史图标共开的那一个菜单（见头注），⛔ 不是两个实例。 */
  const [menuOpen, setMenuOpen] = useState(false)

  const sessionTitle =
    history.sessions.find((item) => item.id === history.currentSessionId)
      ?.title ?? t('newThread')

  /**
   * 会话行右边那枚日期（画板 BCards：`今天` / `昨天` / `09-05`）。
   *
   * ⚠ 日差按**本地零点**算不按 24 小时算：`23:50` 与次日 `00:10` 差 20 分钟，
   * 按毫秒除会得出「今天」，而用户看到的是两个日子。
   * ⚠ 更早的那一档走 `format.dateTime` 而不是手拼 `MM-DD`：分隔符是地区的事
   *   （ja 是 `09/05`），⛔ 不在这里替三种语言拿主意。
   */
  const sessionDateLabel = (iso: string): string => {
    const date = new Date(iso)
    const midnight = (value: Date) =>
      new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
    const days = Math.round(
      (midnight(new Date()) - midnight(date)) / MS_PER_DAY,
    )
    if (days <= 0) return t('history.today')
    if (days === 1) return t('history.yesterday')
    return format.dateTime(date, { month: '2-digit', day: '2-digit' })
  }

  return (
    <div
      data-testid="operator-header"
      data-working={working ? 'true' : 'false'}
      /* ⚠ 头部**不铺自己的底**（§12.1）：它坐在面板那层玻璃上，给它一层
         `bg-card` 等于在玻璃上又糊一块不透明白 —— 分层交给那条下边线。 */
      className="shrink-0 border-b border-border"
    >
      <div
        style={{ height: `${STUDIO_OPERATOR_SHELL.headerHeightPx}px` }}
        className="flex items-center gap-2 px-3"
      >
        <span data-testid="operator-domain-chip" className="sr-only">
          {t(`domainName.${domain}`)}
        </span>

        <DropdownMenu
          modal={false}
          open={menuOpen}
          onOpenChange={(next) => {
            setMenuOpen(next)
            if (next) history.refreshSessions()
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="operator-session-menu"
              aria-label={t('history.heading')}
              title={sessionTitle}
              /* 画板 BCards「头部 · 静止」：标题是一颗 `bg-muted` 的浅片，
                 不是一行裸字 —— 那颗片就是「这里可以点开历史」的形状。
                 ⚠ 展开时压深一档（`data-[state=open]`），⛔ 不换色相。 */
              className="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-md bg-muted px-2.5 text-left text-sm font-medium text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent data-[state=open]:bg-surface-fill-track focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <span className="min-w-0 truncate">{sessionTitle}</span>
              <ChevronDown className="size-3.5 shrink-0" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            onInteractOutside={(event) => {
              // 点历史图标不算「点了外面」—— 否则它永远关不掉菜单（见头注）。
              if (
                event.target instanceof Element &&
                event.target.closest(`[${HISTORY_BUTTON_ATTR}]`)
              )
                event.preventDefault()
            }}
            /* ── 三层玻璃③：**浮层**（§12.1）。唯一真正半透 + 模糊的一层，
               配强投影；14px 圆角走区间上限一侧。 */
            className="max-h-[60svh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl assistant-glass-overlay shadow-assistant-overlay"
          >
            <DropdownMenuLabel className="text-2sm font-normal text-muted-foreground">
              {t('history.heading')}
            </DropdownMenuLabel>
            {history.isHydrating ? (
              <DropdownMenuItem disabled className="text-2sm">
                {t('history.loading')}
              </DropdownMenuItem>
            ) : null}
            {!history.isHydrating && history.sessions.length === 0 ? (
              <DropdownMenuItem disabled className="text-2sm">
                {t('history.empty')}
              </DropdownMenuItem>
            ) : null}
            {history.sessions.map((session) => {
              /* ⚠ 域标签读的是 `surface`（线程**起始**域）—— 一条线程后来切去
                 哪儿只在它自己的域标记里，列表这一层看不到，也不该猜。
                 ⚠ 先取出来再判：直接把索引表达式塞进模板串，`null` 会一起进
                 `t()` 的键类型里（编译期就红）。 */
              const sessionDomain = SESSION_DOMAIN_BY_SURFACE[session.surface]
              return (
                <div key={session.id} className="flex items-center gap-1">
                  <DropdownMenuItem
                    className="min-w-0 flex-1"
                    disabled={
                      working ||
                      Boolean(history.loadingSessionId) ||
                      history.deletingSessionId === session.id
                    }
                    data-testid="operator-session-item"
                    data-session-id={session.id}
                    data-surface={session.surface}
                    data-current={
                      session.id === history.currentSessionId ? 'true' : 'false'
                    }
                    onSelect={() => history.selectSession(session)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {session.title ?? t('history.untitled')}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-2sm text-muted-foreground">
                        {sessionDomain ? (
                          <span>{t(`domainName.${sessionDomain}`)}</span>
                        ) : null}
                        <span className="font-mono tabular-nums">
                          {sessionDateLabel(session.updatedAt)}
                        </span>
                      </span>
                    </span>
                    {session.id === history.currentSessionId ? (
                      <Check className="size-3.5 shrink-0" aria-hidden />
                    ) : null}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="shrink-0 p-2 text-muted-foreground"
                    aria-label={t('history.renameLabel', {
                      title: session.title ?? t('history.untitled'),
                    })}
                    disabled={
                      Boolean(history.renamingSessionId) ||
                      Boolean(history.deletingSessionId)
                    }
                    onSelect={() => {
                      setRenameTarget(session)
                      setRenameTitle(session.title ?? '')
                    }}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="shrink-0 p-2 text-muted-foreground focus:text-destructive"
                    aria-label={t('history.deleteLabel', {
                      title: session.title ?? t('history.untitled'),
                    })}
                    disabled={
                      Boolean(history.deletingSessionId) ||
                      (working && session.id === history.currentSessionId)
                    }
                    onSelect={() => setDeleteTarget(session)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </DropdownMenuItem>
                </div>
              )
            })}
            {history.error ? (
              <DropdownMenuItem disabled className="text-2sm text-destructive">
                {history.error}
              </DropdownMenuItem>
            ) : null}
            {/* 「新会话」在**底部**（画板 BCards「历史下拉展开」）：列表是来找
                旧东西的，新建是找不到时的兜底 —— 摆在最上面等于每次翻历史都先
                跨过一颗会把当前会话换掉的按钮。 */}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="operator-new-thread"
              disabled={working || Boolean(history.loadingSessionId)}
              onSelect={() => onNewThread()}
            >
              <MessageSquarePlus className="size-4" aria-hidden />
              {t('newThread')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ── 有未完成计划（第三期 · 断点续跑）───────────────────────
            ⚠ 长在标题右边、成本计数左边：它是一个**动作**，而右边那两样是注脚
              与常驻入口 —— 动作排在注脚前面。
            ⚠ `busy` 时整块不渲染（见 prop 头注）。 */}
        {resume && !working ? (
          <button
            type="button"
            data-testid="operator-band-resume"
            data-step={resume.stepNumber}
            onClick={resume.onResume}
            className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-2sm font-medium text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('resume.band', { step: resume.stepNumber })}
          </button>
        ) : null}

        {/* ── 右上两颗 32px 图标（§4.1 / 画板 BCards「头部 · 静止」）────────
            ⚠ 历史这一颗与标题▾ 开的是**同一个菜单**（见头注）：它只是给「不知道
              标题可以点」的人的第二条路。 */}
        <button
          type="button"
          data-testid="operator-history-button"
          aria-label={t('history.heading')}
          aria-expanded={menuOpen}
          {...{ [HISTORY_BUTTON_ATTR]: '' }}
          {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
          onClick={() => setMenuOpen((current) => !current)}
          className={HEADER_ICON_BUTTON_CLASS}
        >
          <History className="size-4" aria-hidden />
        </button>

        {/* 助手设置（§8.1 主入口）—— ⚠ 带 `data-operator-keep`：点它弹层要开，
            而收放法则（拍板 7）会因为「点了面板外面」把面板收掉，判据就是这个属性。 */}
        <button
          type="button"
          data-testid="operator-assistant-settings"
          aria-label={t('assistantSettings')}
          {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
          onClick={onOpenAssistantSettings}
          className={HEADER_ICON_BUTTON_CLASS}
        >
          <Settings2 className="size-4" aria-hidden />
        </button>

        {/* 收起 —— 画板上没有这一颗，保留的理由见头注（键盘可达）。 */}
        <button
          type="button"
          data-testid="operator-collapse"
          aria-label={t('collapse')}
          onClick={onCollapse}
          className={HEADER_ICON_BUTTON_CLASS}
        >
          <PanelRightClose className="size-4" aria-hidden />
        </button>
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next && !history.deletingSessionId) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('history.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('history.deleteDescription', {
                title: deleteTarget?.title ?? t('history.untitled'),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {history.error && (
            <p role="alert" className="text-sm text-destructive">
              {history.error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(history.deletingSessionId)}>
              {t('history.deleteCancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(history.deletingSessionId)}
              onClick={(event) => {
                event.preventDefault()
                if (deleteTarget)
                  void history.deleteSession(deleteTarget).then((deleted) => {
                    if (deleted) setDeleteTarget(null)
                  })
              }}
            >
              {history.deletingSessionId
                ? t('history.deleting')
                : t('history.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(renameTarget)}
        onOpenChange={(next) => {
          if (!next && !history.renamingSessionId) setRenameTarget(null)
        }}
      >
        <AlertDialogContent {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('history.renameTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('history.renameDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            autoFocus
            aria-label={t('history.renameTitle')}
            value={renameTitle}
            maxLength={ASSISTANT_CONVERSATION_LIMITS.titleMaxLength}
            disabled={Boolean(history.renamingSessionId)}
            onChange={(event) => setRenameTitle(event.target.value)}
          />
          {history.error ? (
            <p role="alert" className="text-sm text-destructive">
              {history.error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(history.renamingSessionId)}>
              {t('history.deleteCancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !renameTitle.trim() || Boolean(history.renamingSessionId)
              }
              onClick={(event) => {
                event.preventDefault()
                if (renameTarget)
                  void history
                    .renameSession(renameTarget, renameTitle)
                    .then((saved) => {
                      if (saved) setRenameTarget(null)
                    })
              }}
            >
              {history.renamingSessionId
                ? t('history.renaming')
                : t('history.renameConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
