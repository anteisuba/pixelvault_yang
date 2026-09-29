'use client'

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { ChevronRight, ImageIcon } from '@/components/icons'
import { DURATION, EASE_STANDARD } from '@/constants/motion'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { cn } from '@/lib/utils'

export type LoraSourceBandMode = 'hidden' | 'open' | 'line'

export interface LoraSourceBandGroup {
  readonly id: string
  readonly name: string
  /** 这把 LoRA 的封面（与装配列那一行同一张）；没有时画一格占位。 */
  readonly cover: string | null
}

interface LoraSourceBandProps {
  /** `hidden` = 没挂 LoRA；`open` = 整条；`line` = 出过图后收成的一行。 */
  mode: LoraSourceBandMode
  onExpand: () => void
  onFold: () => void
  /** 出过图才能收起（没出过图时整条就是舞台上的主角）。 */
  canFold: boolean
  /**
   * 出过图之后点开 = 浮层（lora-generate.md §2.2，owner 2026-09-29 第二轮 A）：
   * 版面里始终只占那一行，整条内容画成盖在结果图上的浮层卡，⛔ 推图。
   */
  overlay?: boolean
  /** 浮层开着时点外面 / Esc 收回；样例大图开着时交给大图（不收）。 */
  dismissible?: boolean
  groups: readonly LoraSourceBandGroup[]
  activeGroupId: string | null
  onSelectGroup: (id: string) => void
  /** 当前那组出过几张；还在取的时候是 `null`。 */
  count: number | null
  /** 标题右边那一句（配方：点一张看完整配方 · 做同款；样例：点一张看大图）。 */
  note: string
  /** 收成一行时左边那三张小图。 */
  lineThumbs: readonly string[]
  /** 整条里的内容（缩略图排 / 样例与提示词 / 没有样例那一句）。 */
  children: ReactNode
}

/**
 * 来源图带（lora-generate.md §2.2）：出图前是整条（标题 + 分组 + 大缩略图），出过图
 * 收成一行「「{名}」出过的图 N ›」，点它长回整条。
 *
 * ⭐ 同一个外框换高度（320 · ease-standard），整条与那一行叠在里面交叉淡：收起那一块
 *   120 淡出，另一块等 120 再 200 淡入。高度按两块各自量出来的自然高 —— Hugging Face
 *   的样例带着提示词列表，比配方那一排高，⛔ 不写死一个高度。
 * ⚠ 看不见的那一块挂 `inert`。
 * ⚠ 从没有到有（刷新后挂载栈读回来、第一次挂上 LoRA）直接落到自然高、只淡入 ——
 *   ⛔ 不从 0 长出来（刷新页面时来源图不该自己「展开」一遍）。
 */
export function LoraSourceBand({
  mode,
  onExpand,
  onFold,
  canFold,
  overlay = false,
  dismissible = true,
  groups,
  activeGroupId,
  onSelectGroup,
  count,
  note,
  lineThumbs,
  children,
}: LoraSourceBandProps) {
  const t = useTranslations('LoraWorkbench.generate.band')
  const reducedMotion = useReducedMotion()
  const openRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const height = useMotionValue(0)
  const previousMode = useRef<LoraSourceBandMode | null>(null)
  // 两块内容的自然高一变（缩略图到了、换了一组、提示词列表长出来）就重新落位。
  const [measure, setMeasure] = useState(0)

  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setMeasure((value) => value + 1))
    if (openRef.current) observer.observe(openRef.current)
    if (lineRef.current) observer.observe(lineRef.current)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const target =
      mode === 'open' && !overlay
        ? (openRef.current?.offsetHeight ?? 0)
        : mode === 'line' || mode === 'open'
          ? (lineRef.current?.offsetHeight ?? 0)
          : 0
    const previous = previousMode.current
    previousMode.current = mode
    // 从没有到有（刷新后挂载栈读回来、第一次挂上 LoRA）只淡入、⛔ 不从 0 长高；
    // 整条 ↔ 一行、以及卸光最后一个 LoRA 收走，才走高度。
    if (previous === null || previous === 'hidden' || reducedMotion) {
      height.jump(target)
      return
    }
    const controls = animate(height, target, {
      duration: DURATION.slow,
      ease: EASE_STANDARD,
    })
    return () => controls.stop()
  }, [height, measure, mode, overlay, reducedMotion])

  // 浮层开着：点外面、按 Esc 收回那一行（样例大图开着时不收，交给大图）。
  const wrapperRef = useRef<HTMLDivElement>(null)
  const floating = overlay && mode === 'open'
  useEffect(() => {
    if (!floating || !dismissible) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) onFold()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onFold()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [dismissible, floating, onFold])

  const activeName =
    groups.find((group) => group.id === activeGroupId)?.name ??
    groups[0]?.name ??
    ''
  const showOpen = mode === 'open' && !overlay
  const showLine = mode === 'line' || floating
  const layerClass = (shown: boolean) =>
    cn(
      'absolute inset-x-0 top-0 transition-opacity ease-linear',
      shown
        ? 'opacity-100 delay-120 duration-base motion-reduce:delay-0 motion-reduce:duration-fast'
        : 'pointer-events-none opacity-0 duration-fast',
    )

  // 整条那块内容（标题 · 分组 · 张数 · 收起 + 缩略图等）：没出过图时摆在版面里，
  // 出过图之后点开画进浮层卡 —— 同一份，⛔ 两处各写一遍。
  const openContent = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <b className="shrink-0 text-xs font-semibold text-foreground/80">
          {t('title')}
        </b>
        {/* 分组 = 挂着的那几把，靠封面认（名字常常很长、截掉一半）；选中的那一格
          浅底，⛔ 不用近黑实底 —— 那一档留给页头的分段控件。张数写在组外面，
          ⛔ 不跟在被截断的名字后面。 */}
        <div
          role="group"
          aria-label={t('groupsLabel')}
          className="lora-scrollbar-hide flex min-w-0 gap-1 overflow-x-auto"
        >
          {groups.map((group) => {
            const active = group.id === (activeGroupId ?? groups[0]?.id)
            return (
              <button
                key={group.id}
                type="button"
                aria-pressed={active}
                title={group.name}
                onClick={() => onSelectGroup(group.id)}
                className={cn(
                  'inline-flex h-7 max-w-44 shrink-0 items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-muted font-medium text-foreground ring-1 ring-inset ring-foreground/15'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                {group.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proxyCivitaiImageUrl(group.cover)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      'size-6 shrink-0 rounded-full bg-muted object-cover transition-opacity duration-fast',
                      !active && 'opacity-70',
                    )}
                  />
                ) : (
                  <span
                    aria-hidden
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
                  >
                    <ImageIcon className="size-3" />
                  </span>
                )}
                <span className="min-w-0 truncate">{group.name}</span>
              </button>
            )
          })}
        </div>
        {count !== null ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {t('groupCount', { count })}
          </span>
        ) : null}
        <span className="grow" />
        <span className="shrink-0 truncate text-xs text-muted-foreground">
          {note}
        </span>
        {canFold ? (
          <button
            type="button"
            onClick={onFold}
            className="shrink-0 text-xs text-muted-foreground underline underline-offset-3 transition-colors duration-fast hover:text-foreground"
          >
            {t('fold')}
          </button>
        ) : null}
      </div>
      {children}
    </>
  )

  return (
    <div ref={wrapperRef} className="relative z-20 shrink-0">
      <motion.div
        style={{ height }}
        data-testid="lora-source-band"
        data-mode={mode}
        data-floating={floating ? 'true' : 'false'}
        className="relative overflow-hidden"
      >
        <div
          ref={openRef}
          aria-hidden={!showOpen}
          inert={!showOpen}
          className={cn(
            layerClass(showOpen),
            'flex flex-col gap-2.5 px-6 pt-4.5',
          )}
        >
          {overlay ? null : openContent}
        </div>

        <div
          ref={lineRef}
          aria-hidden={!showLine}
          inert={!showLine}
          className={cn(layerClass(showLine), 'px-6 pt-3.5')}
        >
          <button
            type="button"
            onClick={floating ? onFold : onExpand}
            aria-expanded={overlay ? floating : undefined}
            className={cn(
              'flex h-8 max-w-full items-center gap-2 rounded-lg pl-1.5 pr-2.5 text-xs text-foreground/75 transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              floating && 'bg-muted',
            )}
          >
            {lineThumbs.slice(0, 3).map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                loading="lazy"
                className="h-6.5 w-5 shrink-0 rounded-sm bg-muted object-cover"
              />
            ))}
            <span className="truncate">
              <b className="font-semibold text-foreground">
                {t('lineName', { name: activeName })}
              </b>
              {count === 0
                ? t('lineEmpty')
                : t('lineCount', { count: count ?? 0 })}
            </span>
            <ChevronRight
              className={cn(
                'size-3 shrink-0 transition-transform duration-base ease-standard motion-reduce:transition-none',
                floating && 'rotate-90',
              )}
              aria-hidden
            />
          </button>
        </div>
      </motion.div>

      {/* 出过图之后点开：从那一行长出来的浮层卡，盖在结果图上半截（⛔ 推图）。
          长出 = 下落 8px + 0.96 放大 + 由糊变清；收回反过来。看不见时挂 inert。 */}
      {overlay ? (
        <div
          role="dialog"
          aria-label={t('title')}
          aria-hidden={!floating}
          inert={!floating}
          data-testid="lora-source-band-overlay"
          className={cn(
            'absolute inset-x-6 top-full mt-1.5 flex origin-top-left flex-col gap-2.5 rounded-2xl bg-card px-4 pt-3.5 pb-4 shadow-overlay ring-1 ring-border/60 transition-[opacity,translate,scale,filter] duration-base ease-standard motion-reduce:transition-opacity',
            floating
              ? 'translate-y-0 scale-100 opacity-100 blur-none'
              : 'pointer-events-none -translate-y-2 scale-96 opacity-0 blur-xs',
          )}
        >
          {openContent}
        </div>
      ) : null}
    </div>
  )
}
