'use client'

import { useCallback, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'

import type { SearchGroundingSource } from '@/types'
import { ArrowUpRight, Globe, ImageIcon, Info } from '@/components/icons'
import { SearchSuggestions } from '@/components/business/studio-shared/search-grounding/SearchSuggestions'
import type { SearchGroundingView } from '@/lib/search-grounding'
import { cn } from '@/lib/utils'

/** 卡的进场序号（错开支线与落下的延迟），由 CSS 读 `--search-i`。 */
type IndexedStyle = CSSProperties & { '--search-i': number }

/** 支线伸出去多长、出线在主干右边多远拐弯（画板：16 / 16）。 */
const WIRE_STUB_PX = 16

export type SearchGroundingSourcesLayout = 'column' | 'strip'

interface SearchGroundingSourcesProps {
  /**
   * `column` = 图左边一列（桌面图片台 / 画布卡），梳子连线汇进图的输入口；
   * `strip` = 图上方一条横排（手机 / 助手结果行），一条短竖线指向图。
   */
  layout: SearchGroundingSourcesLayout
  /** `searching` = 出图中（三张骨架）；`done` = 出图那一刻。 */
  phase: 'searching' | 'done'
  /** 出图当下交回的来源与搜索建议；`done` 却没有它 = 什么都不画。 */
  view?: SearchGroundingView
  /**
   * 图墙同跑时出线只接开着搜索的那一格：给一个找那一格的函数，出线在主干右边
   * 拐一个弯描过去；不给 = 出线水平伸到列的右沿（单张图就贴在那里）。
   */
  wireTarget?: () => HTMLElement | null
  /** 图墙的格子顺序一变（两行换位）就按新位置重描出线。 */
  wireKey?: string
  className?: string
}

/**
 * 「先搜再画」的资料（B 定稿「资料在左」）：头一行 → 骨架 / 来源卡 / 降级说明 →
 * Google 搜索建议条。来源与建议条**同进同出**：搜索出错时两样都没有；没搜到时
 * 只有建议条。⛔ 不存 —— 这一份只活在出图当下的运行状态里。
 */
export function SearchGroundingSources({
  layout,
  phase,
  view,
  wireTarget,
  wireKey,
  className,
}: SearchGroundingSourcesProps) {
  const t = useTranslations('SearchGrounding')
  if (phase === 'done' && !view) return null

  const grounded = phase === 'done' && view?.status === 'grounded'
  const suggestions =
    phase === 'done' && view && view.status !== 'error'
      ? view.suggestionsHtml
      : []
  const isColumn = layout === 'column'

  return (
    <section
      aria-label={grounded ? t('used') : t('fallbackHead')}
      aria-live="polite"
      data-status={phase === 'searching' ? 'searching' : view?.status}
      className={cn(
        'search-sources relative flex flex-col',
        isColumn ? 'w-73 gap-2.5 pr-13' : 'w-full gap-2 pb-1',
        className,
      )}
    >
      <p className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {phase === 'searching'
            ? t('reserved')
            : grounded
              ? t('used')
              : t('fallbackHead')}
        </span>
        {grounded && view ? (
          <span className="font-mono text-2xs tabular-nums">
            {view.sources.length}
          </span>
        ) : null}
      </p>

      {phase === 'searching' ? (
        <div
          aria-hidden
          className={cn(
            isColumn ? 'flex flex-col gap-2' : 'flex gap-1.5 overflow-hidden',
          )}
        >
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={cn(
                'flex h-15 items-center gap-2.5 rounded-lg border border-border bg-card pr-2.5 pl-2',
                !isColumn && 'w-47 shrink-0',
              )}
            >
              <i className="size-7 shrink-0 animate-pulse rounded-md bg-muted" />
              <span className="flex flex-1 flex-col gap-1.5">
                <b className="block h-2 w-1/2 animate-pulse rounded-sm bg-muted" />
                <b className="block h-2 w-11/12 animate-pulse rounded-sm bg-muted" />
              </span>
            </span>
          ))}
        </div>
      ) : grounded && view ? (
        isColumn ? (
          <SearchComb
            sources={view.sources}
            wireTarget={wireTarget}
            wireKey={wireKey}
          />
        ) : (
          <div className="search-sources__cards--slide search-sources-row flex gap-1.5 overflow-x-auto pb-0.5">
            {view.sources.map((source, index) => (
              <SearchSourceCard
                key={source.url}
                source={source}
                index={index}
                className="w-47 shrink-0"
              />
            ))}
          </div>
        )
      ) : view ? (
        <div className="rounded-lg bg-muted px-3 py-2.5">
          <p className="flex items-start gap-2 text-xs leading-4.5 text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{view.status === 'error' ? t('error') : t('empty')}</span>
          </p>
        </div>
      ) : null}

      {suggestions.map((html) => (
        <div
          key={html}
          className="animate-in fade-in-0 duration-base ease-standard motion-reduce:animate-none"
        >
          <SearchSuggestions html={html} />
        </div>
      ))}

      {!isColumn && grounded ? (
        <span aria-hidden className="flex flex-col items-center">
          <span className="search-strip-down mt-0.5 block h-4 w-px bg-foreground/35" />
          <span className="search-strip-dot" />
        </span>
      ) : null}
    </section>
  )
}

/**
 * 梳子：每张卡一段支线 → 一根主干 → 一条出线 → 图的输入口。出线默认水平伸到
 * 列的右沿；给了 `wireTarget` 就改由一条 SVG 在主干右边拐弯、描到那一格的左沿中点。
 */
function SearchComb({
  sources,
  wireTarget,
  wireKey,
}: {
  sources: SearchGroundingSource[]
  wireTarget?: () => HTMLElement | null
  wireKey?: string
}) {
  const combRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const portRef = useRef<SVGCircleElement>(null)

  // 量出来的几何直接写进 SVG 属性（⛔ 不经 state：随尺寸变化要重描很多次）。
  const route = useCallback(() => {
    const comb = combRef.current
    const svg = svgRef.current
    const target = wireTarget?.()
    if (!comb || !svg || !pathRef.current || !portRef.current) return
    if (!target) {
      svg.style.visibility = 'hidden'
      return
    }
    const c = comb.getBoundingClientRect()
    const tile = target.getBoundingClientRect()
    const x0 = c.width + WIRE_STUB_PX
    const turn = x0 + WIRE_STUB_PX
    const x1 = tile.left - c.left
    const y0 = c.height / 2
    const y1 = tile.top - c.top + tile.height / 2
    const dy = y1 - y0
    const r = Math.min(6, Math.abs(dy) / 2)
    const dir = dy > 0 ? 1 : -1
    pathRef.current.setAttribute(
      'd',
      Math.abs(dy) < 1
        ? `M${x0} ${y0}H${x1}`
        : `M${x0} ${y0}H${turn - r}Q${turn} ${y0} ${turn} ${y0 + dir * r}V${y1 - dir * r}Q${turn} ${y1} ${turn + r} ${y1}H${x1}`,
    )
    portRef.current.setAttribute('cx', String(x1 - 4.25))
    portRef.current.setAttribute('cy', String(y1))
    svg.style.visibility = ''
  }, [wireTarget])

  useLayoutEffect(() => {
    if (!wireTarget) return
    route()
    // 列宽 / 卡高随弹簧落定，两行换位也要重描：量一次不够，盯着尺寸变化。
    const observer = new ResizeObserver(route)
    const comb = combRef.current
    const target = wireTarget()
    if (comb) observer.observe(comb)
    if (target?.parentElement) observer.observe(target.parentElement)
    const settle = window.setTimeout(route, 520)
    window.addEventListener('resize', route)
    return () => {
      observer.disconnect()
      window.clearTimeout(settle)
      window.removeEventListener('resize', route)
    }
  }, [route, wireTarget, wireKey])

  return (
    <div
      ref={combRef}
      data-external-wire={wireTarget ? 'true' : undefined}
      className="search-comb search-sources__cards--drop flex flex-col gap-2"
    >
      {sources.map((source, index) => (
        <SearchSourceCard key={source.url} source={source} index={index} />
      ))}
      {wireTarget ? (
        <svg
          ref={svgRef}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 size-full overflow-visible"
        >
          <path ref={pathRef} className="search-wire-path" pathLength={1} />
          <circle ref={portRef} className="search-wire-port" r={3.5} />
        </svg>
      ) : (
        <span aria-hidden className="search-comb__port" />
      )}
    </div>
  )
}

/** 一张文字来源卡：左边一格标出「网页 / 图片搜索」，标题 + 域名，点一下直达原网页。 */
function SearchSourceCard({
  source,
  index,
  className,
}: {
  source: SearchGroundingSource
  index: number
  className?: string
}) {
  const t = useTranslations('SearchGrounding')
  const KindIcon = source.kind === 'image' ? ImageIcon : Globe
  const showDomain = source.domain && source.domain !== source.title
  const style: IndexedStyle = { '--search-i': index }
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={t('openSource', { title: source.title })}
      style={style}
      className={cn(
        'search-source-card flex h-15 min-w-0 items-center gap-2.5 rounded-lg border border-border bg-card pr-2.5 pl-2 transition-colors duration-fast ease-standard hover:border-foreground/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        className,
      )}
    >
      <span
        className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"
        title={source.kind === 'image' ? t('kindImage') : t('kindWeb')}
      >
        <KindIcon className="size-3.5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {showDomain ? (
          <span className="truncate font-mono text-2xs leading-3.5 text-muted-foreground">
            {source.domain}
          </span>
        ) : null}
        <span className="line-clamp-2 text-2sm leading-4.25 text-foreground">
          {source.title}
        </span>
      </span>
      <ArrowUpRight
        className="mt-2.75 size-3 shrink-0 self-start text-muted-foreground opacity-75"
        aria-hidden
      />
    </a>
  )
}
