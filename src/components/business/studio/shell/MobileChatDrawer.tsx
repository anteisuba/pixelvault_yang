'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  MOBILE_EDGE_SWIPE,
  MOBILE_TABS,
  SHELL_NAV_TOOLS,
  activeShellTool,
  isShellNavItemActive,
  isStudioChatPath,
  type ShellNavItem,
} from '@/constants/navigation'
import { ROUTES } from '@/constants/routes'
import { STUDIO_SHELL_RAIL } from '@/constants/studio-shell'
import {
  ChevronDown,
  ChevronRight,
  Search,
  Sparkles,
  SquarePen,
  X,
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import {
  StudioOperatorSessionDeleteDialog,
  StudioOperatorSessionRow,
} from '@/features/assistant'
import { useShellHistoryBuckets } from '@/components/business/studio/shell/ShellHistoryMenu'
import { useShellWorkHistory } from '@/components/business/studio/shell/StudioShellHistoryKeys'
import {
  setMobileDrawerOpen,
  useMobileDrawerOpen,
} from '@/hooks/use-mobile-drawer'
import {
  useLastChatPath,
  useLastStudioToolId,
} from '@/hooks/use-mobile-nav-memory'
import { useMyProfile } from '@/hooks/use-my-profile'
import { useStudioOperatorSelector } from '@/hooks/use-studio-operator-store'
import { Link, usePathname } from '@/i18n/navigation'
import { studioBenchHref } from '@/lib/studio-shell-route'
import { cn } from '@/lib/utils'

const DRAWER_SKELETON_WIDTHS = ['w-3/5', 'w-1/2', 'w-7/10'] as const

const CHAT_TAB_ITEM = MOBILE_TABS.find((item) => item.id === 'chat')!
const PROFILE_TAB_ITEM = MOBILE_TABS.find((item) => item.id === 'profile')!
const DRAWER_GO_ITEMS = MOBILE_TABS.filter(
  (item) => item.id !== 'chat' && item.id !== 'profile',
)

const INSET_CARD_CLASS = 'rounded-2xl bg-card p-1.5 shadow-ring dark:bg-popover'

function SpaceRow({
  href,
  label,
  icon: Icon,
  active,
  testId,
  onSelect,
}: {
  href: string
  label: string
  icon: ShellNavItem['icon']
  active: boolean
  testId: string
  onSelect: () => void
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      data-testid={testId}
      onClick={onSelect}
      className={cn(
        'touch-target-y flex h-11 w-full items-center gap-3 rounded-xl px-2.5 text-sm transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-row-selected font-semibold text-foreground'
          : 'font-medium text-foreground/90 hover:bg-surface-fill active:bg-muted',
      )}
    >
      <Icon
        className={cn(
          'size-4.5 shrink-0',
          active ? 'text-foreground' : 'text-ink-2',
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  )
}

/**
 * 手机全站统一 Apple HIG 分组侧滑抽屉（S1 暖石底 + 浮白圆角分组卡 + 一体顺滑竖滚）：
 * - **顶部磨砂条**：全圆纯白搜索胶囊 + 黑色圆形新对话键（与全站 `rounded-full` 控件同源）；
 * - **一体滚动主体**：
 *   1. 白卡 1 · 主空间（对话 · 素材 · 画廊 · 角色）；
 *   2. 白卡 2 · 创作台原生折叠组（在创作台上自动展开、平时收起只占一行并展示最近台胶囊，展开为对称双列 7 台，带 `?c=` 同会话继承）；
 *   3. 分组白卡 · 历史对话（今天 / 昨天 / 更早；输入搜索词时自动隐藏上方导航聚焦结果）；
 * - **底部磨砂栏**：常驻纯白「我的（主页 · 提示词 · 设置）」卡片。
 */
export function MobileChatDrawer() {
  const t = useTranslations()
  const tMobile = useTranslations('MobileNav')
  const tShell = useTranslations('StudioShell')
  const pathname = usePathname()
  const lastChatPath = useLastChatPath()
  const lastToolId = useLastStudioToolId()
  const sessionId = useStudioOperatorSelector((state) => state.sessionId)
  const { profile } = useMyProfile()
  const { refresh, ...history } = useShellWorkHistory()

  const open = useMobileDrawerOpen()
  const activeTool = activeShellTool(pathname) ?? null
  const activeToolId = activeTool?.id ?? null
  const [studiosOpen, setStudiosOpen] = useState(Boolean(activeToolId))
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string } | null>(null)

  const handleOpenChange = (next: boolean) => {
    setMobileDrawerOpen(next)
    if (next) {
      setStudiosOpen(Boolean(activeToolId))
      refresh()
    } else {
      setQuery('')
      setShowAll(false)
    }
  }

  // 当抽屉由外部（MobileDrawerTrigger / 左缘右滑）打开时同步折叠态并拉取最新历史。
  useEffect(() => {
    if (!open) return
    setStudiosOpen(Boolean(activeToolId))
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeToolId])

  // 全站手机页支持从屏幕左缘右滑单手呼出侧栏（有弹窗/查看器开着时不抢手势）。
  useEffect(() => {
    if (open) return
    let start: { x: number; y: number } | null = null
    const down = (event: TouchEvent) => {
      if (document.querySelector('[role="dialog"]')) return
      const touch = event.touches[0]
      start =
        event.touches.length === 1 &&
        touch.clientX <= MOBILE_EDGE_SWIPE.edgePx + 4
          ? { x: touch.clientX, y: touch.clientY }
          : null
    }
    const up = (event: TouchEvent) => {
      if (!start) return
      const touch = event.changedTouches[0]
      const dx = touch.clientX - start.x
      const dy = Math.abs(touch.clientY - start.y)
      start = null
      if (dx >= 64 && dy <= MOBILE_EDGE_SWIPE.slopPx) {
        setMobileDrawerOpen(true)
      }
    }
    window.addEventListener('touchstart', down, { passive: true })
    window.addEventListener('touchend', up, { passive: true })
    return () => {
      window.removeEventListener('touchstart', down)
      window.removeEventListener('touchend', up)
    }
  }, [open])

  const needle = query.trim().toLocaleLowerCase()
  const matches = needle
    ? history.items.filter((item) =>
        (item.title ?? '').toLocaleLowerCase().includes(needle),
      )
    : history.items
  const limit = STUDIO_SHELL_RAIL.historyRecentLimit
  const capped = !needle && !showAll && matches.length > limit
  const shown = capped ? matches.slice(0, limit) : matches
  const buckets = useShellHistoryBuckets(shown)

  const displayName =
    profile?.displayName ?? profile?.username ?? tMobile('tabs.profile')

  const chatActive = isStudioChatPath(pathname)
  const chatHref = lastChatPath ?? CHAT_TAB_ITEM.href
  const profileActive = isShellNavItemActive(PROFILE_TAB_ITEM, pathname)
  const closeDrawer = () => handleOpenChange(false)

  const badgeTool =
    activeTool ??
    SHELL_NAV_TOOLS.find((item) => item.id === lastToolId) ??
    SHELL_NAV_TOOLS[0]

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="left"
          showCloseButton={false}
          data-testid="studio-mobile-drawer"
          className="flex w-5/6 max-w-82 flex-col gap-0 border-r border-border/60 bg-bubble p-0 dark:bg-background lg:hidden"
        >
          <SheetTitle className="sr-only">{tMobile('drawer.label')}</SheetTitle>
          <SheetDescription className="sr-only">
            {tMobile('drawer.label')}
          </SheetDescription>

          {/* 顶部磨砂操作条：全圆纯白搜索胶囊 + 黑色圆形新对话 */}
          <div className="shrink-0 border-b border-border/40 bg-bubble/90 px-3 pt-safe-inset-top backdrop-blur-md dark:bg-background/90">
            <div className="flex items-center gap-2 py-2.5">
              <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-card px-3.5 text-muted-foreground shadow-ring dark:bg-popover">
                <Search className="size-4 shrink-0" aria-hidden />
                <input
                  type="text"
                  inputMode="search"
                  role="searchbox"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={tShell('historySearch')}
                  aria-label={tShell('historySearch')}
                  data-testid="studio-mobile-drawer-search"
                  className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label={t('Feedback.clearSearch')}
                    onClick={() => setQuery('')}
                    className="touch-target grid size-5 shrink-0 place-items-center rounded-full bg-fill-strong text-ink-2 transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                ) : null}
              </label>
              <button
                type="button"
                disabled={history.newDisabled}
                aria-label={tShell('newChat')}
                title={tShell('newChat')}
                data-testid="studio-mobile-drawer-new-chat"
                onClick={() => {
                  closeDrawer()
                  history.onNew()
                }}
                className="touch-target grid size-10 shrink-0 place-items-center rounded-full bg-foreground text-background shadow-soft transition-transform duration-fast ease-standard active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"
              >
                <SquarePen className="size-4.5" aria-hidden />
              </button>
            </div>
          </div>

          {/* 整页一体竖滚主体（Apple Notes / Files 分组白卡规范） */}
          <div className="scrollbar-none min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3">
            {needle ? null : (
              <>
                {/* 白卡 1：主空间（对话 · 素材 · 画廊 · 角色） */}
                <nav
                  aria-label={tMobile('tabs.label')}
                  data-testid="studio-mobile-drawer-nav"
                  className={cn(INSET_CARD_CLASS, 'flex flex-col gap-0.5')}
                >
                  <SpaceRow
                    href={chatHref}
                    label={t(CHAT_TAB_ITEM.labelKey)}
                    icon={CHAT_TAB_ITEM.icon}
                    active={chatActive}
                    testId="studio-mobile-drawer-link-chat"
                    onSelect={closeDrawer}
                  />
                  {DRAWER_GO_ITEMS.map((item) => {
                    const label =
                      item.id === 'cards'
                        ? tMobile('tabs.cards')
                        : t(item.labelKey)
                    return (
                      <SpaceRow
                        key={item.id}
                        href={item.href}
                        label={label}
                        icon={item.icon}
                        active={isShellNavItemActive(item, pathname)}
                        testId={`studio-mobile-drawer-link-${item.id}`}
                        onSelect={closeDrawer}
                      />
                    )
                  })}
                </nav>

                {/* 白卡 2：创作台原生折叠组（7 台对称双列，带当前会话 ?c=） */}
                <section
                  aria-label={tMobile('drawer.studios')}
                  className={INSET_CARD_CLASS}
                >
                  <button
                    type="button"
                    aria-expanded={studiosOpen}
                    data-testid="studio-mobile-drawer-studios-toggle"
                    onClick={() => setStudiosOpen((prev) => !prev)}
                    className={cn(
                      'touch-target-y flex h-11 w-full items-center gap-3 rounded-xl px-2.5 text-left text-sm transition-colors duration-fast ease-standard hover:bg-surface-fill active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      activeToolId
                        ? 'font-semibold text-foreground'
                        : 'font-medium text-foreground/90',
                    )}
                  >
                    <Sparkles
                      className={cn(
                        'size-4.5 shrink-0',
                        activeToolId ? 'text-foreground' : 'text-ink-2',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {tMobile('drawer.studios')}
                    </span>
                    {!studiosOpen && badgeTool ? (
                      <span className="max-w-24 truncate rounded-full bg-muted px-2.5 py-0.5 text-2xs font-medium text-ink-2">
                        {t(badgeTool.labelKey)}
                      </span>
                    ) : null}
                    <ChevronDown
                      className={cn(
                        'size-4 shrink-0 text-muted-foreground transition-transform duration-base ease-standard',
                        studiosOpen && 'rotate-180',
                      )}
                      aria-hidden
                    />
                  </button>

                  <div
                    className="mobile-drawer-disclosure"
                    data-open={studiosOpen ? 'true' : 'false'}
                  >
                    <div inert={!studiosOpen}>
                      <div
                        data-testid="studio-mobile-drawer-studios-grid"
                        className="grid grid-cols-2 gap-1.5 px-1 pt-1.5 pb-1"
                      >
                        {SHELL_NAV_TOOLS.map((item, index) => {
                          const Icon = item.icon
                          const active = activeToolId === item.id
                          const spanFull =
                            index === SHELL_NAV_TOOLS.length - 1 &&
                            SHELL_NAV_TOOLS.length % 2 === 1
                          return (
                            <Link
                              key={item.id}
                              href={studioBenchHref(item.href, sessionId)}
                              aria-current={active ? 'page' : undefined}
                              data-testid={`studio-mobile-drawer-tool-${item.id}`}
                              onClick={closeDrawer}
                              className={cn(
                                'touch-target-y flex h-10 items-center gap-2 rounded-xl px-3 text-2sm transition-[background-color,color,transform] duration-fast ease-standard active:scale-98 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                spanFull && 'col-span-2',
                                active
                                  ? 'bg-foreground font-semibold text-background shadow-soft'
                                  : 'bg-muted/80 font-medium text-foreground hover:bg-muted',
                              )}
                            >
                              <Icon
                                className={cn(
                                  'size-4 shrink-0',
                                  active ? 'text-background' : 'text-ink-2',
                                )}
                                aria-hidden
                              />
                              <span className="min-w-0 truncate">
                                {t(item.labelKey)}
                              </span>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* 区块 3：最近对话（按时间分桶的纯白圆角卡） */}
            <div
              data-testid="studio-mobile-drawer-history"
              className="space-y-2.5"
            >
              {history.loading && history.items.length === 0 ? (
                <div className={INSET_CARD_CLASS}>
                  {DRAWER_SKELETON_WIDTHS.map((width) => (
                    <div key={width} className="flex h-10 items-center px-2.5">
                      <Skeleton className={`h-2.5 rounded-sm ${width}`} />
                    </div>
                  ))}
                </div>
              ) : null}

              {buckets.map((bucket) => (
                <div key={bucket.id}>
                  <p className="px-2.5 pb-1 text-2xs font-medium text-muted-foreground">
                    {tShell(`historyBucket.${bucket.id}`)}
                  </p>
                  <div className="rounded-2xl bg-card p-1 shadow-ring dark:bg-popover">
                    {bucket.items.map((item) => (
                      <StudioOperatorSessionRow
                        key={item.id}
                        compact
                        inMenu={false}
                        session={{ id: item.id, title: item.title }}
                        leading={item.leading}
                        domainLabel={null}
                        dateLabel={bucket.timeLabel(item.updatedAt)}
                        current={item.id === history.currentId}
                        selectDisabled={
                          history.deletingId === item.id ||
                          history.selectDisabled()
                        }
                        deleteDisabled={
                          history.deletingId !== null ||
                          history.deleteDisabled(item.id)
                        }
                        renaming={history.renamingId === item.id}
                        deleting={history.deletingId === item.id}
                        onSelect={() => {
                          closeDrawer()
                          history.onSelect(item.id)
                        }}
                        onRename={(title) => history.onRename(item.id, title)}
                        onRequestDelete={() => setDeleteTarget(item)}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {!history.loading && needle && matches.length === 0 ? (
                <p className="rounded-2xl bg-card px-3 py-5 text-center text-2sm text-muted-foreground shadow-ring dark:bg-popover">
                  {tShell('historyNoMatch')}
                </p>
              ) : null}
              {!history.loading && history.items.length === 0 && !needle ? (
                <p className="rounded-2xl bg-card px-3 py-4 text-center text-2sm text-muted-foreground shadow-ring dark:bg-popover">
                  {t('StudioOperator.history.empty')}
                </p>
              ) : null}
              {capped ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowAll(true)}
                  className="h-10 w-full justify-center rounded-2xl bg-card text-2sm font-medium text-ink-2 shadow-ring hover:bg-card/80 dark:bg-popover"
                >
                  {tShell('historyAll')}
                </Button>
              ) : null}
              {history.error ? (
                <p className="rounded-2xl bg-card px-3 py-2.5 text-2sm text-destructive shadow-ring dark:bg-popover">
                  {history.error}
                </p>
              ) : null}
            </div>
          </div>

          {/* 底部磨砂栏：常驻纯白「我的」卡片 */}
          <div className="shrink-0 border-t border-border/40 bg-bubble/90 px-3 pt-2 pb-safe-bottom backdrop-blur-md dark:bg-background/90">
            <Link
              href={ROUTES.SETTINGS}
              aria-current={profileActive ? 'page' : undefined}
              data-testid="studio-mobile-drawer-me"
              onClick={closeDrawer}
              className={cn(
                'touch-target-y flex h-13 w-full items-center gap-2.5 rounded-2xl bg-card px-2.5 shadow-ring transition-colors duration-fast ease-standard active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-popover',
                profileActive && 'ring-1 ring-foreground/20',
              )}
            >
              <ProfileAvatar
                avatarUrl={profile?.avatarUrl}
                name={profile?.displayName ?? profile?.username}
                size={34}
                className="size-8.5 shrink-0 ring-1 ring-foreground/10"
                iconClassName="size-4"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {displayName}
                </span>
                <span className="block truncate text-2xs text-muted-foreground">
                  {tMobile('drawer.meSubtitle')}
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </Link>
          </div>
        </SheetContent>
      </Sheet>

      <StudioOperatorSessionDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDelete={history.onDelete}
      />
    </>
  )
}
