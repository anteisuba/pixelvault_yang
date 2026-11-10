'use client'

import { createContext, useContext } from 'react'

import { cn } from '@/lib/utils'

/**
 * 药丸 `Chip`（ui-spec.md §9「药丸」㉕）的类名与外观上下文。
 * 弹层（开合动效、锚定、尺寸档）不在这里，在
 * `business/studio-shared/primitives/tool-surface.tsx`。
 */

export const studioToolTriggerClass = cn(
  'relative inline-flex h-11 items-center gap-2 rounded-full bg-muted px-3.5 text-2sm font-medium text-ink-2 transition-[background-color,color,box-shadow] duration-fast ease-standard sm:h-9',
  'hover:tint-hover hover:text-foreground',
  'focus-visible:outline-none focus-visible:shadow-focus',
  'disabled:pointer-events-none disabled:opacity-45',
)

export const studioChipActiveClass = 'bg-fill-strong text-foreground'

/**
 * 竖排参数栏里「模板 · 剧本」那一行的幽灵丸：两颗并排，⛔ 一颗带框一颗不带。
 * 开着（舞台上那块面板 / 剧本弹窗在）时换 `studioColumnChipOpenClass`。
 */
export const studioColumnChipClass =
  'flex h-9 items-center gap-2 rounded-full bg-muted px-3 text-2sm font-medium text-ink-2 transition-[background-color,color,box-shadow] duration-fast ease-standard hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-45'
export const studioColumnChipOpenClass = 'bg-fill-strong text-foreground'

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
 * 药丸（ui-spec.md §9「药丸」㉕）：浅灰（`fill`）无边、32 高、全圆，和搜索框一家；
 * 点开时深一档（`fill-strong`，⛔ 变黑）；设好了写名字、字变正文色（⛔ 换强调色）。
 */
export const studioOutlineChipClass = cn(
  'touch-target-y relative inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-3 text-2sm font-medium text-ink-2 transition-[background-color,color,box-shadow] duration-fast ease-standard [&_svg:not([class*=size-])]:size-3.75',
  'hover:tint-hover hover:text-foreground',
  'focus-visible:outline-none focus-visible:shadow-focus',
  'disabled:pointer-events-none disabled:opacity-45',
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
   * 加料 chip 在工具行带字放不下时只留图标 + 数，整行保持一行。
   * `compact` 挂在触发器上、`compactLabel` 挂在字上；判据是这一行自己量出来的
   * （`useStudioToolRow` → 行上 `data-compact`），⛔ 不是视口、⛔ 不是写死的容器门槛。
   * 字收进 `sr-only`，读屏照旧念得到。幽灵外观不收（两者都是空串）。
   */
  readonly compact: string
  readonly compactLabel: string
}

/** 幽灵外观的弹层锚定 = `tool-surface.tsx` 的缺省（居中、离 chip 12）。 */
const GHOST_CHIP_CLASSES: StudioChipClasses = {
  look: 'ghost',
  trigger: studioToolTriggerClass,
  open: studioChipActiveClass,
  set: studioChipActiveClass,
  popoverAlign: 'center',
  popoverSideOffset: 12,
  compact: '',
  compactLabel: '',
}

/** 描边药丸「挂了东西 / 改过」那一档 —— 宿主自己画的 chip（负面词、模型）也用它。 */
export const studioOutlineChipSetClass = 'bg-muted text-foreground'

/** 描边药丸「弹层开着（= 正在改它）」那一档 —— 宿主自己画的 chip（剧本、模型）也用它。 */
export const studioOutlineChipOpenClass = 'bg-fill-strong text-foreground'

/**
 * 描边 chip 窄了收成图标那一档（见 `StudioChipClasses.compact`）—— 宿主自己画的 chip
 * 也用它。判据只有一条（owner 2026-11-04，四个台统一）：工具行带字放不下才收，由
 * `useStudioToolRow` 量出来写在行的 `data-compact` 上（行带 `group/toolrow`）。
 * ⛔ 再按容器宽写死门槛（以前自然语言台 56rem、标签台 72rem，同宽一个带字一个不带）。
 */
export const studioOutlineChipCompactClass = 'group-data-compact/toolrow:px-2'
export const studioOutlineChipCompactLabelClass =
  'group-data-compact/toolrow:sr-only'
/** 工具行本身：药丸的收字档认的是它。 */
export const studioToolRowClass = 'group/toolrow'

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
