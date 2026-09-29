'use client'

import { createContext, useContext, type CSSProperties } from 'react'
import type * as React from 'react'

import { CHIP_POPOVER } from '@/constants/motion'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { ResponsiveDialogTitle } from '@/components/ui/responsive-dialog'
import { cn } from '@/lib/utils'

/**
 * Dialog 型工具面板的统一 chrome（决议 5 工具面板契约）。
 * 重型面板（多轮对话/大列表/多步表单）走居中 Dialog；轻面板走
 * StudioToolSurface 锚定 popover。两类共用同一套暗面外观与头部规范。
 */
export const studioDialogPaddingClass = '!gap-0 !p-0'
export const studioDialogMaxHeightClass = 'max-h-[85svh]'
export const studioDialogHeaderPaddingClass = 'px-5 py-3'
export const studioDialogBodyPaddingClass = 'px-5 pb-5 pt-1'
export const studioDialogBaseClass = cn(
  studioDialogPaddingClass,
  studioDialogMaxHeightClass,
  'overflow-hidden rounded-2xl border-border/40 bg-background shadow-2xl',
)
export const studioDialogBodyClass = cn(
  'overflow-y-auto',
  studioDialogBodyPaddingClass,
)
export const studioDialogHeaderClass = `flex items-center gap-2 border-b border-border/40 ${studioDialogHeaderPaddingClass} text-sm font-medium`

interface StudioPanelHeaderProps extends React.ComponentProps<
  typeof ResponsiveDialogTitle
> {
  icon?: React.ReactNode
}

export function StudioPanelHeader({
  icon,
  children,
  className,
  ...props
}: StudioPanelHeaderProps) {
  return (
    <ResponsiveDialogTitle
      className={cn(studioDialogHeaderClass, className)}
      {...props}
    >
      {icon}
      {children}
    </ResponsiveDialogTitle>
  )
}

export const studioToolTriggerClass = cn(
  'relative inline-flex h-11 items-center gap-2 rounded-full px-3.5 text-sm font-medium text-muted-foreground transition-colors duration-fast ease-standard sm:h-9',
  'hover:bg-muted/40 hover:text-foreground',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
  'disabled:pointer-events-none disabled:opacity-50',
)

export const studioChipActiveClass =
  'bg-primary/10 text-primary ring-1 ring-primary/30'

/**
 * 竖排参数栏里「模板 · 剧本」那一行的幽灵丸：两颗并排，⛔ 一颗带框一颗不带。
 * 开着（舞台上那块面板 / 剧本弹窗在）时换 `studioColumnChipOpenClass`。
 */
export const studioColumnChipClass =
  'flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-50'
export const studioColumnChipOpenClass = 'bg-muted/55 text-foreground'

export const studioToolPopoverAnchorSide = 'top' as const
export const studioToolPopoverAnchorAlign = 'center' as const
export const studioToolPopoverAnchorSideOffset = 12
export const studioToolPopoverAnchorCollisionPadding = 12

/**
 * chip 的两种外观（owner 2026-09-26 图片工作台底部输入框）：
 * - `ghost` = 参数栏 / 手机那颗无边框的幽灵丸（缺省，现有宿主不受影响）；
 * - `outline` = 底部输入框工具行的 32px 描边药丸，与 `SpecChip` 同一副形状 ——
 *   一整行 chip 长成同一种东西，规格那颗不再显得是外来的。
 * 由宿主用 `StudioChipLookProvider` 圈定，各 chip 用 `useStudioChipClasses()` 取类，
 * ⛔ 不在 chip 里判断自己住在哪个宿主。
 */
export type StudioChipLook = 'ghost' | 'outline'

const StudioChipLookContext = createContext<StudioChipLook>('ghost')

export const StudioChipLookProvider = StudioChipLookContext.Provider

/**
 * 只要「从 chip 放大」这一种开合、不换 chip 外观的宿主（节点画布，node-canvas-v2 §1
 * 第 12 条：chip 弹层与工作台同一颗）。⛔ 不借 `outline` 外观来开动效——那会把画布
 * 卡上的 chip 也换成工具行的描边药丸。
 */
const StudioChipZoomContext = createContext(false)

export const StudioChipZoomProvider = StudioChipZoomContext.Provider

/**
 * chip 与它弹层的尺寸档。`compact` = 节点画布（owner 2026-09-29「尺寸要做成适合画布
 * 的」）：画布卡下那条提示词栏比工作台的输入框小得多，挂一个工作台尺寸的弹层就又宽
 * 又大。由宿主圈定，模型弹层 / 规格弹层自己读，⛔ 不在四类卡上逐个传尺寸。
 */
export type StudioChipDensity = 'default' | 'compact'

const StudioChipDensityContext = createContext<StudioChipDensity>('default')

export const StudioChipDensityProvider = StudioChipDensityContext.Provider

export function useStudioChipDensity(): StudioChipDensity {
  return useContext(StudioChipDensityContext)
}

export const studioOutlineChipClass = cn(
  'relative inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background px-3 text-2sm font-medium text-foreground transition-colors duration-fast ease-standard',
  'hover:border-foreground/40',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'disabled:pointer-events-none disabled:opacity-50',
)

export interface StudioChipClasses {
  readonly look: StudioChipLook
  /** 触发器本身。 */
  readonly trigger: string
  /** 弹层开着（= 正在改它）。 */
  readonly open: string
  /** 挂了东西 / 改过（chip 上写着值）。 */
  readonly set: string
  /**
   * 弹层对齐。描边外观住在底部输入框工具行的左组：弹层从 chip **左沿**往右长
   * （原型 `popTarget`），⛔ 不居中 —— 居中会把宽弹层顶出输入框、盖到左侧导航上。
   * 右组的 chip（模型 / 规格 / 专属）由宿主自己传 `end`。
   */
  readonly popoverAlign: 'start' | 'center'
  readonly popoverSideOffset: number
  /**
   * 窄了收成图标（布局 A，owner 2026-09-26「参数被分割成两行」）：工具行左组那几颗
   * 加料 chip 在输入框卡变窄时（助手让位后）只留图标 + 数，整行保持一行。
   * `compact` 挂在触发器上、`compactLabel` 挂在字上；判据是输入框卡的宽度
   * （`@container/composer`，`StudioWorkbenchLayout` 的 `bottom` 分支），⛔ 不是视口。
   * 字收进 `sr-only`，读屏照旧念得到。幽灵外观不收（两者都是空串）。
   */
  readonly compact: string
  readonly compactLabel: string
}

const GHOST_CHIP_CLASSES: StudioChipClasses = {
  look: 'ghost',
  trigger: studioToolTriggerClass,
  open: studioChipActiveClass,
  set: studioChipActiveClass,
  popoverAlign: studioToolPopoverAnchorAlign,
  popoverSideOffset: studioToolPopoverAnchorSideOffset,
  compact: '',
  compactLabel: '',
}

/** 描边药丸「挂了东西 / 改过」那一档 —— 宿主自己画的 chip（负面词、模型）也用它。 */
export const studioOutlineChipSetClass =
  'border-transparent bg-muted hover:border-foreground/40'

/** 描边药丸「弹层开着（= 正在改它）」那一档 —— 宿主自己画的 chip（剧本、模型）也用它。 */
export const studioOutlineChipOpenClass = 'border-foreground ring-3 ring-muted'

/**
 * 描边 chip 窄了收成图标那一档（见 `StudioChipClasses.compact`）—— 宿主自己画的 chip
 * 也用它。两个门槛：自然语言台量输入框卡（`composer`，56rem）；标签台左组多两颗、
 * 右组的专属 chip 也更长，整行要到 ~1030 才放得下，所以它在自己的根上另挂一个
 * 容器（`tagrow`，72rem）—— 没有那个祖先的宿主，第二条永远不命中。
 */
export const studioOutlineChipCompactClass =
  '@max-4xl/composer:px-2 @max-6xl/tagrow:px-2'
export const studioOutlineChipCompactLabelClass =
  '@max-4xl/composer:sr-only @max-6xl/tagrow:sr-only'

const OUTLINE_CHIP_CLASSES: StudioChipClasses = {
  look: 'outline',
  trigger: studioOutlineChipClass,
  open: studioOutlineChipOpenClass,
  set: studioOutlineChipSetClass,
  popoverAlign: 'start',
  popoverSideOffset: 8,
  compact: studioOutlineChipCompactClass,
  compactLabel: studioOutlineChipCompactLabelClass,
}

export function useStudioChipClasses(): StudioChipClasses {
  return useContext(StudioChipLookContext) === 'outline'
    ? OUTLINE_CHIP_CLASSES
    : GHOST_CHIP_CLASSES
}

/**
 * 工具行 chip 弹层的开合 —— ②「从 chip 放大」（owner 2026-09-26 画板 PopZoom，
 * 替掉液态共享形状那一版）：弹层以 chip 中心为原点从 0.72 放大、带一点过冲进场，
 * 同时由糊变清；关上缩回 chip、先淡后缩。每颗弹层各开各的，⛔ 不跨弹层共享形状。
 *
 * - 节拍走既有 token：进场 = `spring-slot` 弹簧（340ms，轻过冲），退场 =
 *   `--duration-base` + `ease-in`；⛔ 不为它另开时长。
 * - 起止形态（缩放 · 模糊）写在 tw-animate 的 enter / exit 变量上（行内，压过弹层
 *   原语自带的 `zoom-in-95` 与 `slide-in-from-*`）；原点按对齐方式落在 chip 中心，
 *   用 Radix 给的触发器尺寸（`--radix-popper-anchor-*`）算，⛔ 不量 DOM。
 * - `transition-none`：弹层原语带 `duration-*` 却没有过渡属性，不关的话开合那一下
 *   会把别的属性也过渡一遍（09-26「打开后会闪一下」）。
 * - reduced motion 直接不动画。
 * 描边外观（底部输入框工具行）与 `StudioChipZoomProvider` 圈住的宿主（节点画布）接入；
 * 其余幽灵外观原样。
 */
const CHIP_POPOVER_CLASS =
  'transition-none data-[state=open]:duration-spring-slot data-[state=open]:ease-spring-slot data-[state=closed]:duration-base data-[state=closed]:ease-in motion-reduce:animate-none'

const CHIP_POPOVER_VARS = {
  '--tw-enter-scale': String(CHIP_POPOVER.fromScale),
  '--tw-exit-scale': String(CHIP_POPOVER.fromScale),
  '--tw-enter-blur': `${CHIP_POPOVER.blurPx}px`,
  '--tw-exit-blur': `${CHIP_POPOVER.blurPx}px`,
  '--tw-enter-translate-x': '0px',
  '--tw-enter-translate-y': '0px',
  '--tw-exit-translate-x': '0px',
  '--tw-exit-translate-y': '0px',
} as CSSProperties

interface StudioChipPopoverPlacement {
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
}

/**
 * 「从触发点放大」这一种开合的类与行内样式（纯函数）—— 工具行 chip 弹层走下面那颗
 * hook；别的「从一颗小按钮长出来」的浮层（模板卡上的 ⋯ 菜单）直接用它。
 */
export function getChipZoomMotion({
  side = 'top',
  align = 'center',
  sideOffset = 0,
}: StudioChipPopoverPlacement): { className: string; style: CSSProperties } {
  const x =
    align === 'start'
      ? 'calc(var(--radix-popper-anchor-width) / 2)'
      : align === 'end'
        ? 'calc(100% - var(--radix-popper-anchor-width) / 2)'
        : '50%'
  const y =
    side === 'bottom'
      ? `calc(-${sideOffset}px - var(--radix-popper-anchor-height) / 2)`
      : `calc(100% + ${sideOffset}px + var(--radix-popper-anchor-height) / 2)`
  return {
    className: CHIP_POPOVER_CLASS,
    style: { ...CHIP_POPOVER_VARS, transformOrigin: `${x} ${y}` },
  }
}

export function useStudioChipPopoverMotion(
  placement: StudioChipPopoverPlacement,
): {
  className: string
  style: CSSProperties | undefined
} {
  const outline = useContext(StudioChipLookContext) === 'outline'
  const zoom = useContext(StudioChipZoomContext)
  if (!outline && !zoom) return { className: '', style: undefined }
  return getChipZoomMotion(placement)
}

interface StudioChipBadgeProps {
  children: React.ReactNode
  className?: string
  title?: string
  ariaLabel?: string
}

export function StudioChipBadge({
  children,
  className,
  title,
  ariaLabel,
}: StudioChipBadgeProps) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold leading-none text-primary-foreground ring-1 ring-background',
        className,
      )}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </span>
  )
}

/**
 * StudioToolSurface / StudioToolSurfaceTrigger — 工具栏 chip 的统一披露根与
 * 触发器：桌面 = 锚定 Popover，移动端 = 底部 Drawer
 * （docs/references/frontend.md §覆层行为矩阵）。
 *
 * 新 chip 一律用这对原语，不要直接用 Popover —— 锚定 popover 在手机窄视口
 * 会被裁切。仍用裸 `Popover` 作根的旧宿主不受影响：`StudioToolPopoverContent`
 * 只有在 StudioToolSurface 根的上下文里才会切换成抽屉。
 */
export const StudioToolSurface = ResponsivePopover
export const StudioToolSurfaceTrigger = ResponsivePopoverTrigger

export type StudioToolSurfaceSize = 'small' | 'action' | 'medium'

export const studioToolPopoverMaxHeightClass = studioDialogMaxHeightClass
export const studioToolPopoverBaseClass = cn(
  'rounded-2xl border-border/70 bg-popover/95 shadow-2xl shadow-black/20 backdrop-blur-xl',
  'data-[state=open]:duration-150 data-[state=closed]:duration-100',
  'data-[side=top]:slide-in-from-bottom-1 data-[side=bottom]:slide-in-from-top-1',
)
export const studioToolPopoverWidthClass: Record<
  StudioToolSurfaceSize,
  string
> = {
  small: 'w-[min(280px,calc(100vw-2rem))]',
  action: 'w-[min(360px,calc(100vw-2rem))]',
  medium: 'w-[min(640px,calc(100vw-2rem))]',
}
export const studioToolPopoverPaddingClass: Record<
  StudioToolSurfaceSize,
  string
> = {
  small: 'p-3',
  action: 'p-2.5',
  medium: '!p-0',
}

export const studioToolSurfaceSizeClass: Record<StudioToolSurfaceSize, string> =
  {
    small: cn(
      studioToolPopoverWidthClass.small,
      studioToolPopoverPaddingClass.small,
    ),
    action: cn(
      studioToolPopoverWidthClass.action,
      studioToolPopoverPaddingClass.action,
    ),
    medium: cn(
      studioToolPopoverWidthClass.medium,
      studioToolPopoverPaddingClass.medium,
      'overflow-hidden',
    ),
  }

/** 移动端抽屉里宽度交给抽屉本身，只保留内边距语义。 */
export const studioToolSurfaceMobileClass: Record<
  StudioToolSurfaceSize,
  string
> = {
  small: '',
  action: '',
  medium: 'px-0 pt-0',
}

interface StudioToolPopoverContentProps extends Omit<
  React.ComponentProps<typeof ResponsivePopoverContent>,
  'label'
> {
  size?: StudioToolSurfaceSize
  /**
   * 浮层可访问名称（移动端抽屉标题 / 桌面 aria-label）。
   * 迁移到 StudioToolSurface 根的宿主必须传；仍用裸 Popover 根的旧宿主
   * 可暂缺（过渡期）。
   */
  label?: string
}

export function StudioToolPopoverContent({
  size = 'small',
  side = studioToolPopoverAnchorSide,
  align = studioToolPopoverAnchorAlign,
  sideOffset = studioToolPopoverAnchorSideOffset,
  collisionPadding = studioToolPopoverAnchorCollisionPadding,
  label,
  className,
  mobileClassName,
  style,
  ...props
}: StudioToolPopoverContentProps) {
  // 描边外观（底部输入框那一行）的弹层从 chip 放大出来。
  const motion = useStudioChipPopoverMotion({ side, align, sideOffset })
  return (
    <ResponsivePopoverContent
      data-studio-tool-popover=""
      label={label ?? ''}
      side={side}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        studioToolPopoverBaseClass,
        studioToolSurfaceSizeClass[size],
        className,
        motion.className,
      )}
      mobileClassName={cn(studioToolSurfaceMobileClass[size], mobileClassName)}
      style={{ ...style, ...motion.style }}
      {...props}
    />
  )
}

/**
 * 参数栏「触发器 + 浮层」里那一组药丸的样式（ParamIdiom 形态 2）。
 * 图片的「规格」与视频的「规格」共用一套，观感必须逐像素一致 —— 两处各写一份
 * 是漂移的起点。选中态用 `studioChipActiveClass`。
 */
export const studioSegButtonClass =
  'inline-flex min-w-14 flex-1 items-center justify-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-xs font-medium transition-colors duration-fast ease-standard'
export const studioSegInactiveClass =
  'border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground'

/**
 * 比例的线框缩略图 —— 光看「4:3 / 3:4」两个数字要在脑子里换算横竖，画一个
 * 同比例的小框就不用换算了。逐行带框能让**所有候选**一眼可比（旧的
 * `StudioAspectRatioPopover` 是在旁边单摆一个 96px 大预览，只显示当前选中那个）。
 */
export function StudioRatioGlyph({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(':').map(Number)
  const BOX = 12
  const scale = !w || !h ? 1 : w >= h ? BOX / w : BOX / h
  return (
    <span
      className="flex size-3.5 shrink-0 items-center justify-center"
      aria-hidden
    >
      <span
        className="rounded-[1.5px] border border-current"
        style={{
          width: `${(w || BOX) * scale}px`,
          height: `${(h || BOX) * scale}px`,
        }}
      />
    </span>
  )
}
