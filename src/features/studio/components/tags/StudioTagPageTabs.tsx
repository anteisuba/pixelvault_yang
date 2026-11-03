'use client'

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { springTransition } from '@/constants/motion'
import { cn } from '@/lib/utils'
import { MoreHorizontal } from '@/components/icons'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ResponsivePopoverContent } from '@/components/ui/responsive-popover'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioToolPopoverBaseClass,
  studioToolSurfaceMobileClass,
  useStudioChipPopoverMotion,
} from '@/components/business/studio-shared/primitives/tool-surface'

export interface StudioTagPageTab {
  /** 这一页有几格标签（页签上那个灰色小数）。 */
  readonly count: number
  /** 停用的角色（这次不出场）：页签变淡。 */
  readonly enabled?: boolean
  /** 查资料刚往这一位里加了标签：数字前亮一下小点。 */
  readonly flashing?: boolean
  /** 这一页的标签原文：悬停没选中的页签时浮出来看（owner 11-01：不切过去也能看别人写了什么）。 */
  readonly preview?: string
  /** 页签上叫什么（挑了角色是「爱弥斯 · 泳装」，可改名）；空 = 「角色 N」。 */
  readonly label?: string
  /** 和拷进来时那套造型比改过：名字旁亮一个淡点。 */
  readonly dirty?: boolean
  /** ⋯ 里排在「这次出场」前面的几项（改名 / 换造型 / 更新到造型…，宿主画）。 */
  readonly menuExtra?: ReactNode
}

/** 滚轮攒够这么多才切一格（触控板一次滑动会连发很多小 delta）。 */
const WHEEL_STEP_PX = 40
/** 切完一格后这段时间内的滚动不算（一格一个，⛔ 一下滑过好几个）。 */
const WHEEL_COOLDOWN_MS = 180

const tabClass =
  'relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-2xs whitespace-nowrap transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none'

/**
 * 标签台 A 的那一排页签（owner 2026-10-09「一个框 + 一排页签」）：
 * `整体 n · 角色 1 n ⋯ · 角色 2 n · ＋ ………… 负向 n`。
 *
 * - 下面那个框只放当前这一页的标签；换页 = 同一个框换内容。
 * - 选中底块是**同一个元素滑过去**（layoutId），⛔ 不是每格各自淡入淡出。
 * - 「加人」只有这一颗 ＋（构图面板里不再有第二套）。
 * - 停用 / 删除收进当前角色页签上的 ⋯（owner 2026-10-09 通过的默认）。
 * - 鼠标停在这一排上滚滚轮 = 在「整体 / 角色 1 / 角色 2…」之间挨个切（owner 11-01）：
 *   到头停住不回绕，负向不进（从负向滚 = 回到正面那一位旁边），上下 / 左右滑都算，
 *   一格切一个。只在这一排上生效，输入框里照常滚字。
 * - 悬停没选中的页签浮出那一页的标签（owner 11-01，补「一次只看一个」）。
 * - 负向是最右边单独一格，跟着当前页走（owner 2026-10-25）：选着角色 N 就写
 *   「角色 N 负向 n」，点了直接进她的负面，数字只数她的；进了负向，「写给谁」仍由框
 *   下面那一行切（宿主画）。
 */
export function StudioTagPageTabs({
  whole,
  characters,
  activeIndex,
  negative,
  negativeCount,
  addControl,
  disabled,
  onSelect,
  onNegative,
  onEnabledChange,
  onRemove,
}: {
  whole: StudioTagPageTab
  /** 空数组 = 这个模型没有角色（PixAI）：只剩「整体 · 负向」。 */
  characters: readonly StudioTagPageTab[]
  activeIndex: number | null
  negative: boolean
  /** 当前这一位（整体 / 角色 N）的负向有几个。 */
  negativeCount: number
  /** 「＋ 加角色 ▾」（宿主画）；null = 这个模型不能加人。 */
  addControl: ReactNode
  disabled: boolean
  onSelect: (index: number | null) => void
  onNegative: () => void
  onEnabledChange: (index: number, enabled: boolean) => void
  onRemove: (index: number) => void
}) {
  const t = useTranslations('StudioTags')
  const reducedMotion = useReducedMotion()
  const thumb = (on: boolean) =>
    on ? (
      <motion.span
        aria-hidden
        layoutId="studio-tag-page-thumb"
        className="absolute inset-0 rounded-lg bg-muted"
        transition={springTransition('slot', reducedMotion)}
      />
    ) : null
  const rowRef = useRef<HTMLDivElement>(null)
  const wheel = useRef({ acc: 0, until: 0 })
  // 滚轮切页：React 的 onWheel 是 passive，拦不住这一排自己的横滚，所以挂原生监听；
  // 读最新的 props 走 useEffectEvent，监听只挂一次。
  const handleWheel = useEffectEvent((event: WheelEvent) => {
    if (disabled || characters.length === 0 || event.ctrlKey) return
    event.preventDefault()
    const now = performance.now()
    const state = wheel.current
    if (now < state.until) return
    const delta =
      Math.abs(event.deltaY) >= Math.abs(event.deltaX)
        ? event.deltaY
        : event.deltaX
    const px = event.deltaMode === 1 ? delta * 16 : delta
    if (Math.sign(px) !== Math.sign(state.acc)) state.acc = 0
    state.acc += px
    if (Math.abs(state.acc) < WHEEL_STEP_PX) return
    const step = state.acc > 0 ? 1 : -1
    state.acc = 0
    state.until = now + WHEEL_COOLDOWN_MS
    // 整体 = 0，角色 N = N + 1；到头停住。
    const position = activeIndex === null ? 0 : activeIndex + 1
    const next = Math.min(Math.max(position + step, 0), characters.length)
    if (next === position && !negative) return
    onSelect(next === 0 ? null : next - 1)
  })
  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    const listener = (event: WheelEvent) => handleWheel(event)
    row.addEventListener('wheel', listener, { passive: false })
    return () => row.removeEventListener('wheel', listener)
  }, [])
  const tabTone = (on: boolean) =>
    on
      ? 'font-medium text-foreground'
      : 'text-muted-foreground hover:text-foreground'

  return (
    <TooltipProvider delayDuration={300}>
      <div
        ref={rowRef}
        role="tablist"
        aria-label={t('characterTitle')}
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
      >
        <TabPreview
          text={whole.preview}
          show={negative || activeIndex !== null}
        >
          <button
            type="button"
            role="tab"
            aria-selected={!negative && activeIndex === null}
            disabled={disabled}
            onClick={() => onSelect(null)}
            className={cn(tabClass, tabTone(!negative && activeIndex === null))}
          >
            {thumb(!negative && activeIndex === null)}
            <span className="relative">{t('wholeTab')}</span>
            <Count value={whole.count} />
          </button>
        </TabPreview>
        {characters.map((character, index) => {
          const on = !negative && activeIndex === index
          const who =
            character.label ||
            t('workbench.characterNumber', { number: index + 1 })
          return (
            <span key={index} className="relative inline-flex shrink-0">
              <TabPreview text={character.preview} show={!on}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={on}
                  disabled={disabled}
                  onClick={() => onSelect(index)}
                  className={cn(
                    tabClass,
                    tabTone(on),
                    on && 'pr-8',
                    character.enabled === false && 'opacity-50',
                  )}
                >
                  {thumb(on)}
                  {character.flashing ? (
                    <span
                      aria-hidden
                      className="relative size-1.5 rounded-full bg-foreground"
                    />
                  ) : null}
                  <span
                    className={cn(
                      'relative',
                      character.enabled === false && 'line-through',
                    )}
                  >
                    {who}
                  </span>
                  <Count value={character.count} />
                </button>
              </TabPreview>
              {on ? (
                <CharacterMenu
                  who={who}
                  index={index}
                  enabled={character.enabled !== false}
                  disabled={disabled}
                  onEnabledChange={onEnabledChange}
                  onRemove={onRemove}
                />
              ) : null}
            </span>
          )
        })}
        {addControl}
        <span className="min-w-2 flex-1" />
        <button
          type="button"
          role="tab"
          aria-selected={negative}
          disabled={disabled}
          onClick={onNegative}
          className={cn(tabClass, tabTone(negative))}
        >
          {thumb(negative)}
          <span className="relative">
            {activeIndex === null
              ? t('tabs.negative')
              : characters[activeIndex]?.label
                ? t('tabs.whoNegative', {
                    who: characters[activeIndex]?.label ?? '',
                  })
                : t('tabs.characterNegative', { number: activeIndex + 1 })}
          </span>
          <Count value={negativeCount} />
        </button>
      </div>
    </TooltipProvider>
  )
}

/** 悬停浮出这一页的标签；空页或正选着的页不浮。 */
function TabPreview({
  text,
  show,
  children,
}: {
  text: string | undefined
  show: boolean
  children: ReactNode
}) {
  const body = text?.trim()
  if (!show || !body) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="top"
        className="h-auto max-w-xs py-2 leading-relaxed whitespace-normal"
      >
        <span className="line-clamp-4 break-words">{body}</span>
      </TooltipContent>
    </Tooltip>
  )
}

function Count({ value }: { value: number }) {
  return (
    <span className="relative font-mono text-3xs tabular-nums text-muted-foreground">
      {value}
    </span>
  )
}

/** 当前角色页签上的 ⋯：这次出场（开关）· 删除（按钮拉长确认）。从 ⋯ 长出来。 */
function CharacterMenu({
  who,
  index,
  enabled,
  disabled,
  extra,
  onEnabledChange,
  onRemove,
}: {
  who: string
  index: number
  enabled: boolean
  disabled: boolean
  extra?: ReactNode
  onEnabledChange: (index: number, enabled: boolean) => void
  onRemove: (index: number) => void
}) {
  const t = useTranslations('StudioTags')
  const tFeedback = useTranslations('Feedback')
  const [open, setOpen] = useState(false)
  // 删角色的确认弹窗挂在弹层外面：弹层先关，弹窗再出（⛔ 弹层一关把弹窗一起卸掉）。
  const [confirmOpen, setConfirmOpen] = useState(false)
  const popoverMotion = useStudioChipPopoverMotion({
    side: 'top',
    align: 'start',
    sideOffset: 8,
  })
  return (
    <>
      <StudioToolSurface open={open} onOpenChange={setOpen}>
        <StudioToolSurfaceTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={t('tabs.more', { who })}
            className="absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors duration-fast ease-standard hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-background data-[state=open]:text-foreground"
          >
            <MoreHorizontal className="size-3.5" aria-hidden />
          </button>
        </StudioToolSurfaceTrigger>
        <ResponsivePopoverContent
          label={who}
          side="top"
          align="start"
          sideOffset={8}
          style={popoverMotion.style}
          className={cn(
            studioToolPopoverBaseClass,
            'w-56 p-2',
            popoverMotion.className,
          )}
          mobileClassName={studioToolSurfaceMobileClass.small}
        >
          <div className="flex flex-col gap-0.5">
            <span className="px-2 pt-1 pb-1.5 text-2xs font-semibold">
              {who}
            </span>
            {extra ? (
              <div
                className="flex flex-col gap-0.5"
                onClickCapture={(event) => {
                  // 点了里面的按钮（不是输入框）就收起弹层。
                  const target = event.target as HTMLElement
                  if (target.closest('button[data-close-menu]')) setOpen(false)
                }}
              >
                {extra}
              </div>
            ) : null}
            <label className="flex h-9 items-center justify-between gap-3 rounded-md px-2 text-2xs">
              {t('tabs.appear')}
              <Switch
                checked={enabled}
                onCheckedChange={(next) => onEnabledChange(index, next)}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setConfirmOpen(true)
              }}
              className="flex h-9 items-center justify-start rounded-md px-2 text-2xs text-status-risk hover:bg-status-risk-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t('tabs.remove', { who })}
            </button>
          </div>
        </ResponsivePopoverContent>
      </StudioToolSurface>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('tabs.removeTitleWho', { who })}
        description={t('tabs.removeDescription')}
        cancelLabel={tFeedback('deleteDialog.cancel')}
        confirmLabel={tFeedback('deleteDialog.confirm')}
        onConfirm={() => onRemove(index)}
      />
    </>
  )
}
