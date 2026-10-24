'use client'

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { animate, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { EASE_STANDARD, SHELL_MOTION } from '@/constants/motion'
import { STUDIO_LIBRARY_ITEMS } from '@/constants/navigation'
import {
  STUDIO_LIBRARY_CATEGORY_IDS,
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

/**
 * 上一个叠层什么时候、哪一类收掉的：库里换类是软跳转，旧那一类卸掉、新那一类紧跟着挂上
 *（同一次提交里），挂上时看到「刚刚还有一类」= 换类（滑），否则 = 库刚盖上来（叠）。
 */
let lastFrameGone: { category: StudioShellOverlayId; at: number } | null = null
/** 卸掉到挂上隔这么久以内算「换类」。 */
const CATEGORY_SWITCH_WINDOW_MS = 250

function categoryIndex(category: StudioShellOverlayId): number {
  return (STUDIO_LIBRARY_CATEGORY_IDS as readonly string[]).indexOf(category)
}

/**
 * 叠层的「叠」与「滑」（9f-4）：库从左边列表那一侧盖到对话上、关掉时退回去；库里换类时
 * 正文按类在顶上的先后左右滑。台不动。
 */
function useLibraryFrameMotion(category: StudioShellOverlayId) {
  const reduceMotion = useReducedMotion()
  const frameRef = useRef<HTMLElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const frame = frameRef.current
    const body = bodyRef.current
    const before = lastFrameGone
    lastFrameGone = null
    if (frame && body && !reduceMotion) {
      if (
        before &&
        before.category !== category &&
        performance.now() - before.at < CATEGORY_SWITCH_WINDOW_MS
      ) {
        const dir =
          categoryIndex(category) >= categoryIndex(before.category) ? 1 : -1
        animate(
          body,
          { x: [dir * SHELL_MOTION.slideOffsetPx, 0], opacity: [0, 1] },
          { duration: SHELL_MOTION.slideS, ease: EASE_STANDARD },
        )
      } else {
        animate(
          frame,
          { x: ['-100%', '0%'] },
          { duration: SHELL_MOTION.stackS, ease: EASE_STANDARD },
        )
      }
    }
    return () => {
      lastFrameGone = { category, at: performance.now() }
    }
  }, [category, reduceMotion])

  /** 关：先退回左边，再回到进来之前那一页。 */
  const closeWith = async (close: () => void) => {
    const frame = frameRef.current
    if (frame && !reduceMotion) {
      await animate(
        frame,
        { x: '-100%' },
        { duration: SHELL_MOTION.stackS, ease: EASE_STANDARD },
      )
    }
    lastFrameGone = null
    close()
  }

  return { frameRef, bodyRef, closeWith }
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
  const { frameRef, bodyRef, closeWith } = useLibraryFrameMotion(category)

  return (
    <section
      ref={frameRef}
      aria-label={t('library')}
      data-testid="studio-library-overlay"
      data-category={category}
      className="flex size-full min-h-0 flex-col bg-background"
    >
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
        <button
          type="button"
          onClick={() => void closeWith(onClose)}
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
      <div
        ref={bodyRef}
        className="library-overlay-body min-h-0 flex-1 overflow-y-auto"
      >
        {children}
      </div>
    </section>
  )
}
