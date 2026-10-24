'use client'

import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'

import { STUDIO_LIBRARY_ITEMS } from '@/constants/navigation'
import {
  studioLibraryPath,
  type StudioShellOverlayId,
} from '@/constants/studio-shell'
import { StudioOperatorDetachedScope } from '@/contexts/studio-operator-host'
import { ChevronLeft } from '@/components/icons'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * 库叠层（第 9f 步方向 E，9f-2a）：`/library/<类>` 的页面不在原地画，而是**传送**到外壳
 * 中间那一栏上的落点里 —— 盖住对话、⛔ 盖住台。
 *
 * ⭐ 为什么传送：从外壳里点开库是软跳转，Next 把台留在 `children` 里不卸载，库走 `@library`
 *   那一格（拦截路由）；直接打开 / 刷新时库就是 `children` 本身。两种情况页面落在不同的位置，
 *   传送到同一个落点，长得就一样。
 * ⚠ 落点只在客户端有（外壳挂上之后），首帧不画库 —— 服务端画好的那一份等水化后接上。
 * 「我的主页」（`profile`，9f-2e）同一个落点：顶上不列库的各类，换成标题 +「去库里管理」。
 */
interface StudioLibraryTarget {
  target: HTMLElement | null
  /**
   * 就地画（<1024 直接打开库，见 `StudioShell`）时地址上的那一样；⛔ 传送。库里换类是软跳转，
   * 上一类还留在 `children` 里，只画地址说的那一类，⛔ 两类叠着画。`null` = 照常传送。
   */
  inPlace: StudioShellOverlayId | null
  setOpenCategory: (category: StudioShellOverlayId | null) => void
  close: () => void
}

export const StudioLibraryTargetContext =
  createContext<StudioLibraryTarget | null>(null)

export function StudioLibraryOverlay({
  category,
  children,
}: {
  category: StudioShellOverlayId
  children: ReactNode
}) {
  const slot = useContext(StudioLibraryTargetContext)
  const setOpenCategory = slot?.setOpenCategory

  useEffect(() => {
    if (!setOpenCategory) return
    setOpenCategory(category)
    return () => setOpenCategory(null)
  }, [category, setOpenCategory])

  // 不在外壳里（不该发生）就原地画，⛔ 白屏。
  if (!slot) return <>{children}</>
  if (slot.inPlace) return slot.inPlace === category ? <>{children}</> : null
  if (!slot.target) return null

  return createPortal(
    <StudioOperatorDetachedScope>
      <StudioLibraryFrame category={category} onClose={slot.close}>
        {children}
      </StudioLibraryFrame>
    </StudioOperatorDetachedScope>,
    slot.target,
  )
}

function StudioLibraryFrame({
  category,
  onClose,
  children,
}: {
  category: StudioShellOverlayId
  onClose: () => void
  children: ReactNode
}) {
  const t = useTranslations('StudioShell')
  const tAll = useTranslations()

  return (
    <section
      aria-label={t('library')}
      data-testid="studio-library-overlay"
      data-category={category}
      className="flex size-full min-h-0 flex-col bg-background"
    >
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('backToChat')}
          data-testid="studio-library-close"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-4"
        >
          <ChevronLeft />
        </button>
        {category === 'profile' ? (
          <>
            <h2 className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-foreground">
              {tAll('Navbar.links.profile')}
            </h2>
            <Link
              href={studioLibraryPath('assets')}
              replace
              data-testid="studio-profile-manage"
              className="flex h-8 shrink-0 items-center rounded-md px-2.5 text-sm text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('manageInLibrary')}
            </Link>
          </>
        ) : (
          <nav
            aria-label={t('library')}
            className="flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none"
          >
            {STUDIO_LIBRARY_ITEMS.map((item) => {
              const active = item.id === category
              return (
                <Link
                  key={item.id}
                  href={studioLibraryPath(item.id)}
                  replace
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-8 shrink-0 items-center rounded-md px-2.5 text-sm text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground',
                    active && 'bg-muted font-medium text-foreground',
                  )}
                >
                  {tAll(item.labelKey)}
                </Link>
              )
            })}
          </nav>
        )}
      </div>
      <div className="library-overlay-body min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </section>
  )
}
