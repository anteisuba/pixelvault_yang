'use client'

/**
 * 面板**头部**（v2 §4.1）—— 一行：会话标题▾ · 续跑 · 设置 · 收起。
 *
 * ── 它替掉了什么 ────────────────────────────────────────────────
 * 顶部那条进度带（整文件删）。决策 14：它占了 40px
 * 的常驻高度去说一句「3/6」，而这句话在加载态那句状态词里顺带就说了
 * （「正在查 3 个来源…」本身就是进度，§3.6）。
 *
 * ⚠ 带上挂着的两样东西**各自找到了去处**（§3.6 那条 ⚠）：
 *  · 齿轮设置入口 → 这里（头部右上，§4.1）；
 *  · 续跑 chip → **暂挂在这里**。§3.6 写的是「结论记录块的尾部一行」，而结论记录
 *    块是 #13 才做的东西 —— 在它落地之前把这颗按钮扔掉，等于刷新之后「从第 N 步
 *    继续」一个入口都没有（它本来就是为「刷新之后」存在的）。#13 落地时搬走。
 *
 * ⚠ **本片只搬不改**（#4 是卡片收敛）：标题▾ / 重命名 / 删除 / 新会话那一套逐字
 * 来自进度带。§4.1 要的第二颗「历史图标」是 #6 的事，⛔ 这里不提前造。
 */

import { useState } from 'react'
import {
  Check,
  Pencil,
  MessageSquarePlus,
  ChevronDown,
  Trash2,
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

  const sessionTitle =
    history.sessions.find((item) => item.id === history.currentSessionId)
      ?.title ?? t('newThread')

  return (
    <div
      data-testid="operator-header"
      data-working={working ? 'true' : 'false'}
      className="shrink-0 border-b border-border bg-card"
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
          onOpenChange={(next) => {
            if (next) history.refreshSessions()
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="operator-session-menu"
              aria-label={t('history.heading')}
              title={sessionTitle}
              className="flex min-w-0 flex-1 items-center gap-1 rounded-md py-1 text-left text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 truncate">{sessionTitle}</span>
              <ChevronDown className="size-3.5 shrink-0" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-[60svh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
          >
            <DropdownMenuItem
              disabled={working || Boolean(history.loadingSessionId)}
              onSelect={() => onNewThread()}
            >
              <MessageSquarePlus className="size-4" aria-hidden />
              {t('newThread')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
                          {format.dateTime(new Date(session.updatedAt), {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
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

        {/* 助手设置（§8.1 主入口）—— ⚠ 带 `data-operator-keep`：点它弹层要开，
            而收放法则（拍板 7）会因为「点了面板外面」把面板收掉，判据就是这个属性。
            ⚠ 命中区 32px（`ui-defaults.md §5`：fine 32/36）：它比旁边两颗 28 大
            一档是有意的 —— 常驻入口先保命中，⛔ 不为了对齐把它缩回 `size-7`。 */}
        <button
          type="button"
          data-testid="operator-assistant-settings"
          aria-label={t('assistantSettings')}
          {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
          onClick={onOpenAssistantSettings}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground active:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
        >
          <Settings2 className="size-4" aria-hidden />
        </button>

        <button
          type="button"
          data-testid="operator-collapse"
          aria-label={t('collapse')}
          onClick={onCollapse}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground"
        >
          <PanelRightClose className="size-3.5" aria-hidden />
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
