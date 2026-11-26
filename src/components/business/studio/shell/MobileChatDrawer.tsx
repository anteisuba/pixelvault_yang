'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  MOBILE_EDGE_SWIPE,
  MOBILE_TABS,
  isStudioChatPath,
} from '@/constants/navigation'
import { ROUTES } from '@/constants/routes'
import { STUDIO_SHELL_RAIL } from '@/constants/studio-shell'
import {
  ChevronRight,
  PanelLeft,
  Search,
  Sparkles,
  SquarePen,
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { MobileToolSheet } from '@/components/layout/MobileToolSheet'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import {
  StudioOperatorSessionDeleteDialog,
  StudioOperatorSessionRow,
} from '@/features/assistant'
import { useShellHistoryBuckets } from '@/components/business/studio/shell/ShellHistoryMenu'
import { useShellWorkHistory } from '@/components/business/studio/shell/StudioShellHistoryKeys'
import { useMyProfile } from '@/hooks/use-my-profile'
import { Link, usePathname } from '@/i18n/navigation'

const DRAWER_SKELETON_WIDTHS = ['w-3/5', 'w-1/2', 'w-7/10'] as const

/** 抽屉上方纵向通栏去处（去掉「对话」与沉底的「我的」，只留 素材 · 画廊 · 角色）。 */
const DRAWER_GO_ITEMS = MOBILE_TABS.filter(
  (item) => item.id !== 'chat' && item.id !== 'profile',
)

const NAV_ROW_CLASS =
  'touch-target-y flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * 手机全屏对话窗（C1 + 画法 B）左上角侧滑抽屉：
 * - 顶排：搜索对话 + 新对话（✎）
 * - 通栏大列表：打开创作台 › · 素材 · 画廊 · 角色（每行 44px 整宽，左右手大拇指皆可点）
 * - 中段滚动：今天 / 昨天 / 更早 对话历史（支持就地重命名与删除）
 * - 底栏常驻：我的主页 · 提示词 · 设置 ›
 * 同时支持在对话页从屏幕左缘向右滑动单手呼出。
 */
export function MobileChatDrawer() {
  const t = useTranslations()
  const tMobile = useTranslations('MobileNav')
  const tShell = useTranslations('StudioShell')
  const pathname = usePathname()
  const { profile } = useMyProfile()
  const { refresh, ...history } = useShellWorkHistory()

  const [open, setOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string } | null>(null)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      refresh()
    } else {
      setQuery('')
      setShowAll(false)
    }
  }

  // 对话页左缘右滑呼出侧栏（有其它弹层开着时不抢手势）。
  const inChat = isStudioChatPath(pathname)
  useEffect(() => {
    if (!inChat || open || toolsOpen) return
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
        refresh()
        setOpen(true)
      }
    }
    window.addEventListener('touchstart', down, { passive: true })
    window.addEventListener('touchend', up, { passive: true })
    return () => {
      window.removeEventListener('touchstart', down)
      window.removeEventListener('touchend', up)
    }
  }, [inChat, open, refresh, toolsOpen])

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

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        aria-label={tMobile('drawer.label')}
        data-testid="studio-mobile-drawer-trigger"
        className="touch-target grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill hover:text-foreground active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-5"
      >
        <PanelLeft />
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="left"
          showCloseButton={false}
          data-testid="studio-mobile-drawer"
          className="flex w-4/5 max-w-80 flex-col gap-0 border-r border-border bg-popover p-0 pt-safe-inset-top pb-safe-bottom lg:hidden"
        >
          <SheetTitle className="sr-only">{tMobile('drawer.label')}</SheetTitle>
          <SheetDescription className="sr-only">
            {tMobile('drawer.label')}
          </SheetDescription>

          {/* 顶部：搜索对话 + 新对话（✎） */}
          <div className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl bg-muted px-3 text-muted-foreground">
              <Search className="size-4 shrink-0" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tShell('historySearch')}
                aria-label={tShell('historySearch')}
                data-testid="studio-mobile-drawer-search"
                className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
            <button
              type="button"
              disabled={history.newDisabled}
              aria-label={tShell('newChat')}
              title={tShell('newChat')}
              data-testid="studio-mobile-drawer-new-chat"
              onClick={() => {
                handleOpenChange(false)
                history.onNew()
              }}
              className="touch-target grid size-10 shrink-0 place-items-center rounded-xl bg-foreground text-background transition-transform duration-fast ease-standard active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"
            >
              <SquarePen className="size-4.5" aria-hidden />
            </button>
          </div>

          {/* 画法 B：通栏大列表（打开创作台 · 素材 · 画廊 · 角色） */}
          <nav
            aria-label={tMobile('tabs.label')}
            className="flex shrink-0 flex-col gap-0.5 px-2 pb-2"
          >
            <button
              type="button"
              data-testid="studio-mobile-drawer-open-studios"
              onClick={() => {
                handleOpenChange(false)
                setToolsOpen(true)
              }}
              className={`touch-target-y ${NAV_ROW_CLASS}`}
            >
              <Sparkles
                className="size-4.5 shrink-0 text-foreground"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">
                {tMobile('drawer.openStudios')}
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </button>
            {DRAWER_GO_ITEMS.map((item) => {
              const Icon = item.icon
              const label =
                item.id === 'cards' ? tMobile('tabs.cards') : t(item.labelKey)
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  data-testid={`studio-mobile-drawer-link-${item.id}`}
                  onClick={() => handleOpenChange(false)}
                  className={NAV_ROW_CLASS}
                >
                  <Icon
                    className="size-4.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                </Link>
              )
            })}
          </nav>

          {/* 中段滚动：完整分组历史对话记录 */}
          <div
            data-testid="studio-mobile-drawer-history"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border/60 px-2 py-1.5"
          >
            {history.loading && history.items.length === 0
              ? DRAWER_SKELETON_WIDTHS.map((width) => (
                  <div key={width} className="flex h-10 items-center px-2.5">
                    <Skeleton className={`h-2.5 rounded-sm ${width}`} />
                  </div>
                ))
              : null}
            {buckets.map((bucket) => (
              <div key={bucket.id}>
                <p className="px-2.5 pt-2.5 pb-1 text-2xs font-normal text-muted-foreground">
                  {tShell(`historyBucket.${bucket.id}`)}
                </p>
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
                      history.deletingId === item.id || history.selectDisabled()
                    }
                    deleteDisabled={
                      history.deletingId !== null ||
                      history.deleteDisabled(item.id)
                    }
                    renaming={history.renamingId === item.id}
                    deleting={history.deletingId === item.id}
                    onSelect={() => {
                      handleOpenChange(false)
                      history.onSelect(item.id)
                    }}
                    onRename={(title) => history.onRename(item.id, title)}
                    onRequestDelete={() => setDeleteTarget(item)}
                  />
                ))}
              </div>
            ))}
            {needle && matches.length === 0 ? (
              <p className="px-2.5 py-4 text-center text-2sm text-muted-foreground">
                {tShell('historyNoMatch')}
              </p>
            ) : null}
            {!history.loading && history.items.length === 0 && !needle ? (
              <p className="px-2.5 py-4 text-2sm text-muted-foreground">
                {t('StudioOperator.history.empty')}
              </p>
            ) : null}
            {capped ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowAll(true)}
                className="mt-1 h-11 w-full justify-center rounded-xl text-2sm text-muted-foreground"
              >
                {tShell('historyAll')}
              </Button>
            ) : null}
            {history.error ? (
              <p className="px-2.5 py-2 text-2sm text-destructive">
                {history.error}
              </p>
            ) : null}
          </div>

          {/* 底栏固定：「我的（主页 · 提示词 · 设置）」 */}
          <div className="shrink-0 border-t border-border/60 p-2">
            <Link
              href={ROUTES.SETTINGS}
              data-testid="studio-mobile-drawer-me"
              onClick={() => handleOpenChange(false)}
              className="touch-target-y flex h-12 w-full items-center gap-2.5 rounded-xl px-2.5 transition-colors duration-fast ease-standard hover:bg-surface-fill active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ProfileAvatar
                avatarUrl={profile?.avatarUrl}
                name={profile?.displayName ?? profile?.username}
                size={32}
                className="size-8 shrink-0 ring-1 ring-foreground/12"
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

      <MobileToolSheet
        open={toolsOpen}
        onOpenChange={setToolsOpen}
        pathname={pathname}
        mode="create"
      />

      <StudioOperatorSessionDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDelete={history.onDelete}
      />
    </>
  )
}
