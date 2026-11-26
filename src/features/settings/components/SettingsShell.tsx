'use client'

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { useSearchParams, useSelectedLayoutSegment } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowLeft,
  Gauge,
  KeyRound,
  Link2,
  LogOut,
  MessagesSquare,
  SlidersHorizontal,
  type Icon,
} from '@/components/icons'

import {
  DURATION,
  SETTINGS_SECTION_SWAP,
  springTransition,
} from '@/constants/motion'
import { ROUTES, safeReturnPath, settingsPath } from '@/constants/routes'
import {
  SETTINGS_SECTIONS,
  SETTINGS_SECTION_ROUTES,
  isSettingsSection,
  type SettingsSection,
} from '@/features/settings/constants'
import { useSignOut } from '@/hooks/use-sign-out'
import { Link, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

import { useBlurSwapIn } from '@/components/ui/blur-swap'
import { FeedbackButton } from '@/components/ui/feedback-button'

/**
 * 布局层的入口：按 URL 的分区段决定套不套外壳。⚠ 不是分区（一级列表 `/settings`、
 * 404 的 section）就原样放行 —— 一级列表是手机的页，404 要走全站那一张。
 */
export function SettingsLayoutFrame({
  children,
}: {
  children: React.ReactNode
}) {
  const segment = useSelectedLayoutSegment()
  if (!segment || !isSettingsSection(segment)) return children
  return <SettingsShell section={segment}>{children}</SettingsShell>
}

interface SettingsShellProps {
  section: SettingsSection
  children: React.ReactNode
}

/**
 * `/settings` 的外壳（D3 ④ 画板；owner 2026-10-08 设置页原型 v1 只换皮加动效）。
 *
 * 桌面：灰底上一整块白板（与 `/studio` 外壳同一副：右上下留 8、圆角 20、`ring`，
 * ui-spec §1，板里不再套卡）= 左 200px 分区导航（最底一行「退出登录」）+ 右内容。手机：⛔ 没有导航列，只有二级页——顶部一行「← 分区名」，返回键回一级
 * 列表（`/settings`）。
 *
 * 换分区时右边内容糊一下再清（`SETTINGS_SECTION_SWAP`）；首次进来不糊。
 */
export function SettingsShell({ section, children }: SettingsShellProps) {
  const t = useTranslations('Settings')
  const searchParams = useSearchParams()
  const from = safeReturnPath(searchParams.get('from'))
  const swap = useBlurSwapIn(section, SETTINGS_SECTION_SWAP)

  return (
    <main className="min-h-svh bg-bubble pb-safe-bottom dark:bg-background lg:flex lg:h-svh lg:flex-col lg:overflow-hidden lg:bg-surface-sunken lg:p-2 lg:pl-0">
      <div className="flex w-full lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:rounded-20 lg:bg-background lg:shadow-ring">
        <SettingsNav section={section} from={from} />
        <div className="min-w-0 flex-1 lg:overflow-y-auto lg:px-10 lg:py-8">
          <header className="sticky top-0 z-30 flex h-12 items-center border-b border-border/50 bg-bubble/90 px-3 backdrop-blur-md dark:bg-background/90 lg:hidden">
            <Link
              href={settingsPath(ROUTES.SETTINGS, from)}
              aria-label={t('backToList')}
              className="touch-target grid size-9 shrink-0 place-items-center rounded-lg text-foreground transition-colors duration-fast active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-5" />
            </Link>
            <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-md font-semibold text-foreground">
              {t(`sections.${section}`)}
            </h1>
          </header>
          {/* 阅读宽度封顶 768（Tailwind 默认 `max-w-3xl`），靠左（2026-11-19 真机走查：
              铺满 1300px+ 时标签在最左、控件在最右，一行要扫过整块屏）。五个分区共用这一处；
              手机宽度本来就不到 768，不受影响。 */}
          <motion.div
            key={section}
            {...swap}
            data-testid="settings-section-content"
            className="w-full max-lg:px-4 max-lg:pt-3 max-lg:pb-8 lg:max-w-3xl"
          >
            {children}
          </motion.div>
        </div>
      </div>
    </main>
  )
}

interface SlotRect {
  top: number
  height: number
}

/**
 * 左栏：**一块**选中灰块在行与行之间弹簧滑（`SPRING.slot`），一块更浅的悬停块跟着
 * 鼠标（`SPRING.press`，无过冲）；行自己⛔ 不再各画背景。↑ / ↓ 在行上直接换分区。
 * 悬停块划过当前行时让位（灰块赢）；触屏没有悬停块。
 */
const SETTINGS_NAV_ICONS: Record<SettingsSection, Icon> = {
  keys: KeyRound,
  usage: Gauge,
  preferences: SlidersHorizontal,
  assistant: MessagesSquare,
  connections: Link2,
}

function SettingsNav({
  section,
  from,
}: {
  section: SettingsSection
  from: string | null
}) {
  const t = useTranslations('Settings')
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const linkRefs = useRef(new Map<SettingsSection, HTMLAnchorElement>())
  const [active, setActive] = useState<SlotRect | null>(null)
  const [hover, setHover] = useState<{
    rect: SlotRect
    visible: boolean
    jumped: boolean
  } | null>(null)

  useLayoutEffect(() => {
    const link = linkRefs.current.get(section)
    if (!link) return
    setActive({ top: link.offsetTop, height: link.offsetHeight })
  }, [section])

  const onPointerOver = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse') return
      const link = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-settings-nav-item]',
      )
      if (!link || link.dataset.settingsNavItem === section) {
        setHover((current) =>
          current ? { ...current, visible: false } : current,
        )
        return
      }
      const rect = { top: link.offsetTop, height: link.offsetHeight }
      setHover((current) => ({
        rect,
        visible: true,
        jumped: !current?.visible,
      }))
    },
    [section],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      const next =
        SETTINGS_SECTIONS[
          (index + step + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length
        ]
      if (!next) return
      linkRefs.current.get(next)?.focus()
      router.push(settingsPath(SETTINGS_SECTION_ROUTES[next], from))
    },
    [from, router],
  )

  const slide = springTransition('slot', reduceMotion)
  const follow = springTransition('press', reduceMotion)
  const fade = { duration: reduceMotion ? 0 : DURATION.fast }

  return (
    <nav
      aria-label={t('title')}
      onPointerOver={onPointerOver}
      onPointerLeave={() =>
        setHover((current) =>
          current ? { ...current, visible: false } : current,
        )
      }
      className="relative hidden w-settings-nav shrink-0 flex-col gap-0.5 border-r border-border/70 bg-surface-companion/75 px-3.5 py-6 lg:flex"
    >
      {hover ? (
        <motion.span
          aria-hidden
          data-testid="settings-nav-hover"
          className="pointer-events-none absolute inset-x-3.5 top-0 rounded-lg bg-fill-strong/60"
          initial={false}
          animate={{
            y: hover.rect.top,
            height: hover.rect.height,
            opacity: hover.visible ? 1 : 0,
          }}
          transition={{
            y: hover.jumped ? { duration: 0 } : follow,
            height: hover.jumped ? { duration: 0 } : follow,
            opacity: fade,
          }}
        />
      ) : null}
      {active ? (
        <motion.span
          aria-hidden
          data-testid="settings-nav-active"
          className="pointer-events-none absolute inset-x-3.5 top-0 rounded-lg bg-background shadow-ring dark:bg-raise"
          initial={false}
          animate={{ y: active.top, height: active.height }}
          transition={slide}
        />
      ) : null}
      <h1 className="relative px-2.5 pb-4 text-lg font-semibold tracking-tight">
        {t('title')}
      </h1>
      {SETTINGS_SECTIONS.map((item, index) => {
        const SectionIcon = SETTINGS_NAV_ICONS[item]
        return (
          <Link
            key={item}
            ref={(node: HTMLAnchorElement | null) => {
              if (node) linkRefs.current.set(item, node)
              else linkRefs.current.delete(item)
            }}
            href={settingsPath(SETTINGS_SECTION_ROUTES[item], from)}
            data-settings-nav-item={item}
            aria-current={item === section ? 'page' : undefined}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-2sm transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              item === section
                ? 'font-semibold text-foreground'
                : 'text-ink-2 hover:text-foreground',
            )}
          >
            <SectionIcon
              className={cn(
                'size-4 shrink-0',
                item === section ? 'text-foreground' : 'text-muted-foreground',
              )}
              aria-hidden
            />
            {t(`sections.${item}`)}
          </Link>
        )
      })}
      <div className="flex-1" />
      <SettingsSignOutButton className="relative px-2.5 py-2" />
    </nav>
  )
}

/**
 * 退出登录那一颗（桌面左栏最底 · 手机一级列表最底）。按下去键里转圈写「正在退出」，
 * 直到页面被带走（`progress` 档不自己缩回）。⛔ 不做二次确认：退出不丢数据。
 */
export function SettingsSignOutButton({ className }: { className?: string }) {
  const t = useTranslations('Settings')
  // 退出登录只有一条路（`use-sign-out.ts`），侧栏账号菜单调的是同一支。
  const handleSignOut = useSignOut()
  const [signingOut, setSigningOut] = useState(false)

  return (
    <FeedbackButton
      type="button"
      disabled={signingOut}
      feedback={
        signingOut ? { label: t('signingOut'), tone: 'progress' } : null
      }
      onClick={() => {
        setSigningOut(true)
        handleSignOut()
      }}
      className={cn(
        'inline-flex items-center gap-2 self-start rounded-md text-sm text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default data-[feedback]:rounded-full',
        className,
      )}
    >
      <LogOut className="size-4" />
      {t('signOut')}
    </FeedbackButton>
  )
}
