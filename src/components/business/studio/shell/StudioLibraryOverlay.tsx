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
import { useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { SHELL_MOTION } from '@/constants/motion'
import { STUDIO_LIBRARY_ITEMS } from '@/constants/navigation'
import {
  STUDIO_LIBRARY_CATEGORY_IDS,
  STUDIO_LIBRARY_TAB_IDS,
  studioLibraryPath,
  type StudioShellOverlayId,
} from '@/constants/studio-shell'
import { StudioOperatorDetachedScope } from '@/contexts/studio-operator-host'
import { PanelLeft } from '@/components/icons'
import { AssistantAvatarGlyph } from '@/components/business/studio/assistant-operator/AssistantAvatarGlyph'
import { useAssistantPersona } from '@/hooks/use-assistant-persona'
import { useLibraryRailOpen } from '@/hooks/use-library-rail'
import {
  setLibraryViewCategory,
  takeLibraryOpenedByAssistant,
} from '@/hooks/use-library-view'
import { Link } from '@/i18n/navigation'
import { shellEnter } from '@/lib/studio-shell-motion'
import { cn } from '@/lib/utils'

/**
 * 库叠层（第 9f 步方向 E，9f-2a）：`/library/<类>` 的页面不在原地画，而是**传送**到外壳
 * 白板上的落点里 —— 库是整页（ui-spec §9「库 `LibraryPage`」）：盖满白板、台不卸载只是被盖住，
 * 对话收着，右上「助手」把对话从右边叫出来。
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
   * 就地画（<768 直接打开库，见 `StudioShell`）时地址上的那一样；⛔ 传送。库里换类是软跳转，
   * 上一类还留在 `children` 里，只画地址说的那一类，⛔ 两类叠着画。`null` = 照常传送。
   */
  inPlace: StudioShellOverlayId | null
  /**
   * `@library` 那一格里挂着库（拦截路由）。直接打开库之后再软跳转换类，旧那一类还留在
   * `children` 里，新那一类进了 `@library`：这时 `children` 那一份让位，⛔ 两类叠在同一个落点。
   */
  slotOverlayOpen: boolean
  /** `@library` 那一格里的库挂上时登记，返回撤销。 */
  registerSlotOverlay: () => () => void
  setOpenCategory: (category: StudioShellOverlayId | null) => void
  close: () => void
  /** 库里右上「助手」：对话从右边出来接着聊（ui-spec §9「库 + 助手」）。 */
  assistantOpen: boolean
  setAssistantOpen: (open: boolean) => void
}

export const StudioLibraryTargetContext =
  createContext<StudioLibraryTarget | null>(null)

/** 外壳把 `@library` 那一格包在这里面：库知道自己是拦截路由那一份还是 `children` 那一份。 */
export const StudioLibrarySlotContext = createContext(false)

export function StudioLibraryOverlay({
  category,
  children,
}: {
  category: StudioShellOverlayId
  children: ReactNode
}) {
  const slot = useContext(StudioLibraryTargetContext)
  const fromSlot = useContext(StudioLibrarySlotContext)
  const setOpenCategory = slot?.setOpenCategory
  const setAssistantOpen = slot?.setAssistantOpen
  const registerSlotOverlay = slot?.registerSlotOverlay
  // `@library` 那一份登记上了才算数、`children` 那一份同一拍让位：收与开落在同一次提交里
  //（先收后开），⛔ 旧那一份收的时候把新那一类记下的「开着哪类」清掉。
  const slotOverlayOpen = slot?.slotOverlayOpen ?? false
  const active =
    (fromSlot ? slotOverlayOpen : !slotOverlayOpen) &&
    (!slot?.inPlace || slot.inPlace === category)

  // 布局期登记：上屏之前就换好，⛔ 两类叠着、⛔ 空一帧。
  useLayoutEffect(() => {
    if (fromSlot && registerSlotOverlay) return registerSlotOverlay()
  }, [fromSlot, registerSlotOverlay])

  useEffect(() => {
    if (!setOpenCategory || !active) return
    setOpenCategory(category)
    setLibraryViewCategory(category)
    if (takeLibraryOpenedByAssistant()) setAssistantOpen?.(true)
    return () => {
      setOpenCategory(null)
      setLibraryViewCategory(null)
    }
  }, [active, category, setAssistantOpen, setOpenCategory])

  // 不在外壳里（不该发生）就原地画，⛔ 白屏。
  if (!slot) return <>{children}</>
  if (!active) return null
  if (slot.inPlace) return <>{children}</>
  if (!slot.target) return null

  return createPortal(
    <StudioOperatorDetachedScope>
      <StudioLibraryFrame
        category={category}
        assistantOpen={slot.assistantOpen}
        onToggleAssistant={() => slot.setAssistantOpen(!slot.assistantOpen)}
      >
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
 * 库的「叠」与「滑」（9f-4）：库从左栏那一侧盖满白板；库里换类时正文按类在顶上的先后左右滑。
 * 台不卸载，只是被盖住。
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
    // 同一类卸掉又马上挂上 = 「还在取」那一拍换成了真页面（`StudioLibraryLoading`），原地接上不再动。
    const sameCategoryRemount =
      before !== null &&
      before.category === category &&
      performance.now() - before.at < CATEGORY_SWITCH_WINDOW_MS
    if (frame && body && !reduceMotion && !sameCategoryRemount) {
      if (
        before &&
        before.category !== category &&
        performance.now() - before.at < CATEGORY_SWITCH_WINDOW_MS
      ) {
        const dir =
          categoryIndex(category) >= categoryIndex(before.category) ? 1 : -1
        shellEnter(
          body,
          { x: dir * SHELL_MOTION.slideOffsetPx, opacity: 0 },
          SHELL_MOTION.slideS,
        )
      } else {
        shellEnter(frame, { x: '-100%' }, SHELL_MOTION.stackS)
      }
    }
    return () => {
      lastFrameGone = { category, at: performance.now() }
    }
  }, [category, reduceMotion])

  return { frameRef, bodyRef }
}

function StudioLibraryFrame({
  category,
  assistantOpen,
  onToggleAssistant,
  children,
}: {
  category: StudioShellOverlayId
  assistantOpen: boolean
  onToggleAssistant: () => void
  children: ReactNode
}) {
  const t = useTranslations('StudioShell')
  const tAll = useTranslations()
  const { persona } = useAssistantPersona()
  const { frameRef, bodyRef } = useLibraryFrameMotion(category)
  const [railOpen, toggleRail] = useLibraryRailOpen()
  const hasRail = !NO_RAIL_CATEGORIES.includes(category)
  const pageItem = isLibraryTab(category)
    ? undefined
    : STUDIO_LIBRARY_ITEMS.find((item) => item.id === category)

  return (
    <section
      ref={frameRef}
      aria-label={t('library')}
      data-testid="studio-library-overlay"
      data-category={category}
      className="flex size-full min-h-0 flex-col bg-background"
    >
      <div className="flex h-13 shrink-0 items-center gap-1 px-3">
        {hasRail ? (
          // 左栏收起 / 展开（用户 10-25）：≥768 才有左栏，手机上各库用抽屉。
          <button
            type="button"
            aria-pressed={!railOpen}
            aria-label={railOpen ? t('libraryRailHide') : t('libraryRailShow')}
            title={railOpen ? t('libraryRailHide') : t('libraryRailShow')}
            data-testid="studio-library-rail-toggle"
            onClick={toggleRail}
            className="hidden size-8 shrink-0 place-items-center rounded-full text-ink-2 transition-colors duration-fast ease-standard hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus md:grid [&>svg]:size-4"
          >
            <PanelLeft aria-hidden />
          </button>
        ) : null}
        {pageItem ? (
          // 不算库的那几样（用户 10-25）：画廊 / 素材 / 角色 / 提示词各从左栏点开，整页，顶上只写名字。
          <h2 className="min-w-0 truncate px-2 text-sm font-semibold text-foreground">
            {tAll(pageItem.labelKey)}
          </h2>
        ) : category === 'profile' ? (
          <>
            <h2 className="min-w-0 truncate px-2 text-sm font-semibold text-foreground">
              {tAll('Navbar.links.profile')}
            </h2>
            <Link
              href={studioLibraryPath('assets')}
              replace
              data-testid="studio-profile-manage"
              className={TAB_CLASS}
            >
              {t('manageInLibrary')}
            </Link>
          </>
        ) : (
          <nav
            aria-label={t('library')}
            className="flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none"
          >
            {LIBRARY_TAB_ITEMS.map((item) => {
              const active = item.id === category
              return (
                <Link
                  key={item.id}
                  href={studioLibraryPath(item.id)}
                  replace
                  aria-current={active ? 'page' : undefined}
                  className={cn(TAB_CLASS, active && TAB_ACTIVE_CLASS)}
                >
                  {tAll(item.labelKey)}
                </Link>
              )
            })}
          </nav>
        )}
        <button
          type="button"
          aria-pressed={assistantOpen}
          data-testid="studio-library-assistant"
          onClick={onToggleAssistant}
          className={cn(
            'ml-auto hidden h-9 shrink-0 items-center gap-2 rounded-full pr-3.5 pl-1 text-2sm font-medium text-foreground transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus lg:flex',
            assistantOpen ? 'bg-fill-strong' : 'bg-raise shadow-soft',
          )}
        >
          <span className="grid size-7 place-items-center overflow-hidden rounded-full">
            <AssistantAvatarGlyph presetId={persona.avatarPreset ?? null} />
          </span>
          {t('libraryAssistant')}
        </button>
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

/**
 * 没有左栏的几页：顶上那颗收起键在这里是空按钮（10-25 用户在角色页点了没反应），⛔ 画。
 * 角色页照 #397 之前那版（#408），没有左栏。
 */
const NO_RAIL_CATEGORIES: readonly StudioShellOverlayId[] = [
  'gallery',
  'profile',
  'cards',
]

/** 顶上一排换类：库只放公开来源那几样（LoRA · 酒馆 · 标签 · 音色，用户 10-25）。 */
const LIBRARY_TAB_ITEMS = STUDIO_LIBRARY_ITEMS.filter((item) =>
  isLibraryTab(item.id),
)

function isLibraryTab(id: string): boolean {
  return (STUDIO_LIBRARY_TAB_IDS as readonly string[]).includes(id)
}

/** 顶上一排换类（样件 S13）：字，当前那一类浅灰底药丸。 */
const TAB_CLASS =
  'flex h-8 shrink-0 items-center rounded-full px-3 text-2sm text-ink-2 transition-colors duration-fast ease-standard hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus'

const TAB_ACTIVE_CLASS = 'bg-muted font-semibold text-foreground'

/**
 * 库里换类时新那一类还没到的那一拍（各类的 `loading.tsx`）：顶上页签当场换过去、正文先空着
 * 滑进来，到了再填上 —— 点下去立刻有反应，⛔ 停在旧那一类上干等服务器（2026-10-27）。
 * ⛔ 画骨架，同台的 `studio/loading.tsx`。
 */
export function StudioLibraryLoading({
  category,
}: {
  category: StudioShellOverlayId
}) {
  return (
    <StudioLibraryOverlay category={category}>
      <div aria-busy="true" className="h-full" />
    </StudioLibraryOverlay>
  )
}
