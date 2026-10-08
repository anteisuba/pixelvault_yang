'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { Check, ChevronDown, X } from '@/components/icons'
import { getChipZoomMotion } from '@/components/business/studio-shared/primitives/tool-surface'
import { BlurSwap } from '@/components/ui/blur-swap'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  DURATION,
  EASE_STANDARD,
  LIQUID_SPRING,
  LIQUID_TIMING,
  staggerDelay,
} from '@/constants/motion'
import { USER_UPLOAD_PROVIDER } from '@/constants/uploads'
import type { GalleryFilters } from '@/hooks/use-gallery'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'
import {
  GALLERY_SORT_OPTIONS,
  OUTPUT_TYPE_VALUES,
  type GallerySortOption,
  type GalleryTimeRange,
  type OutputTypeValue,
} from '@/types'

/**
 * 分面筛选栏 —— `docs/references/pages/assets.md` §3.1。
 *
 * 三条契约，改的时候别丢：
 * 1. **默认全部维度未选 = 全部素材**。「不选就是全部」，所以**没有「全部」这一档**
 *    （owner 2026-08-11：初始状态应是全部素材，图片默认不点击）。
 * 2. 触发器回显当前值：未选显示维度名（`类型`），选 1 项显示该项名（`图片`），
 *    选多项显示 `类型 2`。
 * 3. 生效的筛选**同时**渲染成可删 chip 行 + 「清除全部筛选」—— 一眼看全当前口径。
 */

/** 时间分面只露出四档；`all` 是「未选」而不是一个可点的选项。 */
const TIME_FACET_VALUES = ['today', 'week', 'month', 'year'] as const

interface AssetFacetBarProps {
  filters: GalleryFilters
  onFiltersChange: (next: GalleryFilters) => void
  /** 每种媒体类型的库存数（来自 section-counts 的 byType）。 */
  typeCounts: Partial<Record<OutputTypeValue, number>>
  /** 状态分面的库存数。 */
  statusCounts: { favorites?: number; published?: number }
  /**
   * 模型分面的选项表 —— 素材页**必须来自库存聚合**（`AssetSectionCounts.byModel`），
   * 不能拿模型目录充数：目录里几十个，库里实际只出现二十来个。画廊没有公开作品的
   * 聚合，传模型目录、计数留空（下拉里不写数）。
   */
  modelCounts: Record<string, number | undefined>
  /** 「状态」那一格（收藏 / 已发布 / 我上传的）。画廊没有，传 `false`。 */
  statusFacet?: boolean
  className?: string
}

export function AssetFacetBar({
  filters,
  onFiltersChange,
  typeCounts,
  statusCounts,
  modelCounts,
  statusFacet = true,
  className,
}: AssetFacetBarProps) {
  const t = useTranslations('AssetsPage')
  const tModels = useTranslations('Models')
  const reducedMotion = useReducedMotion()

  const statusValues = statusFacet ? getStatusValues(filters) : []
  const modelOptions = useMemo(
    () =>
      Object.entries(modelCounts)
        // 本地上传的行把 `model` 也写成 `user-upload`（见 constants/uploads），
        // 它不是模型 —— 那条轴由「状态 · 我上传的」负责，别在模型下拉里
        // 再露一个英文哨兵值。
        .filter(([id]) => id !== USER_UPLOAD_PROVIDER)
        .map(([id, count]) => ({
          id,
          count,
          label: getTranslatedModelLabel(tModels, id),
        }))
        .sort(
          (a, b) =>
            (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label),
        ),
    [modelCounts, tModels],
  )

  const typeLabels: Record<OutputTypeValue, string> = {
    image: t('sidebarImages'),
    video: t('sidebarVideos'),
    audio: t('sidebarAudio'),
    model_3d: t('sidebarModel3D'),
  }
  const statusLabels: Record<AssetStatusFacet, string> = {
    favorites: t('sidebarFavorites'),
    published: t('sidebarPublished'),
    uploads: t('sidebarUploads'),
  }
  const timeLabels: Record<(typeof TIME_FACET_VALUES)[number], string> = {
    today: t('facetTimeToday'),
    week: t('facetTimeWeek'),
    month: t('facetTimeMonth'),
    year: t('facetTimeYear'),
  }
  const sortLabels: Record<GallerySortOption, string> = {
    newest: t('facetSortNewest'),
    oldest: t('facetSortOldest'),
  }

  const summarize = (name: string, selected: string[]): string => {
    if (selected.length === 0) return name
    if (selected.length === 1) return selected[0]
    return t('facetSelectedCount', { name, count: selected.length })
  }

  const toggleType = (value: OutputTypeValue) => {
    const next = filters.types.includes(value)
      ? filters.types.filter((item) => item !== value)
      : [...filters.types, value]
    // 类型一变，模型选项表就换了一批（视频模型不该留在只看图片的口径里），
    // 已选模型跟着清掉，避免出现一个永远 0 结果的组合。
    onFiltersChange({ ...filters, types: next, models: [] })
  }

  const toggleStatus = (value: AssetStatusFacet) => {
    const on = !statusValues.includes(value)
    onFiltersChange({
      ...filters,
      liked: value === 'favorites' ? on : filters.liked,
      published: value === 'published' ? on : filters.published,
      provider:
        value === 'uploads'
          ? on
            ? USER_UPLOAD_PROVIDER
            : ''
          : filters.provider,
    })
  }

  const toggleModel = (id: string) => {
    const next = filters.models.includes(id)
      ? filters.models.filter((item) => item !== id)
      : [...filters.models, id]
    onFiltersChange({ ...filters, models: next })
  }

  const setTimeRange = (value: GalleryTimeRange) => {
    onFiltersChange({
      ...filters,
      timeRange: filters.timeRange === value ? 'all' : value,
    })
  }

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [
    ...filters.types.map((value) => ({
      key: `type:${value}`,
      label: typeLabels[value],
      onRemove: () => toggleType(value),
    })),
    ...statusValues.map((value) => ({
      key: `status:${value}`,
      label: statusLabels[value],
      onRemove: () => toggleStatus(value),
    })),
    ...filters.models.map((id) => ({
      key: `model:${id}`,
      label: getTranslatedModelLabel(tModels, id),
      onRemove: () => toggleModel(id),
    })),
    ...(filters.timeRange !== 'all'
      ? [
          {
            key: `time:${filters.timeRange}`,
            label:
              timeLabels[filters.timeRange as keyof typeof timeLabels] ??
              filters.timeRange,
            onRemove: () => setTimeRange('all'),
          },
        ]
      : []),
    ...(filters.search
      ? [
          {
            key: 'search',
            label: `“${filters.search}”`,
            onRemove: () => onFiltersChange({ ...filters, search: '' }),
          },
        ]
      : []),
  ]

  const clearAll = () => {
    onFiltersChange({
      ...filters,
      search: '',
      types: [],
      models: [],
      timeRange: 'all',
      liked: false,
      published: false,
      provider: '',
    })
  }

  return (
    <div className={cn('grid', className)}>
      <div className="flex flex-wrap items-center gap-0.5">
        <FacetPopover
          label={t('facetType')}
          summary={summarize(
            t('facetType'),
            filters.types.map((value) => typeLabels[value]),
          )}
          active={filters.types.length > 0}
        >
          {OUTPUT_TYPE_VALUES.map((value, index) => (
            <FacetOptionRow
              key={value}
              order={index}
              label={typeLabels[value]}
              count={typeCounts[value]}
              selected={filters.types.includes(value)}
              onSelect={() => toggleType(value)}
            />
          ))}
        </FacetPopover>

        {statusFacet ? (
          <FacetPopover
            label={t('facetStatus')}
            summary={summarize(
              t('facetStatus'),
              statusValues.map((value) => statusLabels[value]),
            )}
            active={statusValues.length > 0}
          >
            {ASSET_STATUS_FACETS.map((value, index) => (
              <FacetOptionRow
                key={value}
                order={index}
                label={statusLabels[value]}
                count={
                  value === 'favorites'
                    ? statusCounts.favorites
                    : value === 'published'
                      ? statusCounts.published
                      : undefined
                }
                selected={statusValues.includes(value)}
                onSelect={() => toggleStatus(value)}
              />
            ))}
          </FacetPopover>
        ) : null}

        <ModelFacetPopover
          label={t('facetModel')}
          summary={summarize(
            t('facetModel'),
            filters.models.map((id) => getTranslatedModelLabel(tModels, id)),
          )}
          active={filters.models.length > 0}
          options={modelOptions}
          selected={filters.models}
          onToggle={toggleModel}
          searchPlaceholder={t('facetModelSearch')}
          emptyLabel={t('facetModelEmpty')}
        />

        <FacetPopover
          label={t('facetTime')}
          summary={
            filters.timeRange === 'all'
              ? t('facetTime')
              : (timeLabels[filters.timeRange as keyof typeof timeLabels] ??
                t('facetTime'))
          }
          active={filters.timeRange !== 'all'}
        >
          {TIME_FACET_VALUES.map((value, index) => (
            <FacetOptionRow
              key={value}
              order={index}
              label={timeLabels[value]}
              selected={filters.timeRange === value}
              onSelect={() => setTimeRange(value)}
            />
          ))}
        </FacetPopover>

        <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />

        <FacetPopover
          label={t('facetSort')}
          summary={sortLabels[filters.sort]}
          active={false}
        >
          {GALLERY_SORT_OPTIONS.map((value, index) => (
            <FacetOptionRow
              key={value}
              order={index}
              label={sortLabels[value]}
              selected={filters.sort === value}
              onSelect={() => onFiltersChange({ ...filters, sort: value })}
            />
          ))}
        </FacetPopover>
      </div>

      {/* 生效的筛选 = 可删 chip 行，在同一个吸顶框里长出来 / 收回去；新 chip 由糊变清。 */}
      <AnimatePresence initial={false}>
        {activeChips.length > 0 && (
          <motion.div
            key="chips"
            initial={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={{
              height: 'auto',
              opacity: 1,
              transition: {
                height: LIQUID_SPRING.unfold,
                opacity: { duration: DURATION.fast, ease: EASE_STANDARD },
              },
            }}
            exit={{
              height: reducedMotion ? undefined : 0,
              opacity: 0,
              transition: {
                height: LIQUID_SPRING.retract,
                opacity: { duration: DURATION.fast, ease: EASE_STANDARD },
              },
            }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              {activeChips.map((chip) => (
                <motion.button
                  key={chip.key}
                  type="button"
                  initial={
                    reducedMotion
                      ? false
                      : {
                          opacity: 0,
                          filter: `blur(${LIQUID_TIMING.blurPx}px)`,
                        }
                  }
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  transition={{
                    duration: LIQUID_TIMING.swapInS,
                    ease: EASE_STANDARD,
                  }}
                  onClick={chip.onRemove}
                  aria-label={t('facetRemove', { name: chip.label })}
                  className="group inline-flex h-6.5 items-center gap-1 rounded-full bg-muted pl-2.5 pr-1.5 text-xs text-foreground"
                >
                  <span className="max-w-40 truncate">{chip.label}</span>
                  <X className="size-3 text-muted-foreground transition-colors duration-fast group-hover:text-foreground" />
                </motion.button>
              ))}
              <button
                type="button"
                onClick={clearAll}
                className="h-6.5 px-1.5 text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
              >
                {t('facetClearAll')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export const ASSET_STATUS_FACETS = [
  'favorites',
  'published',
  'uploads',
] as const
export type AssetStatusFacet = (typeof ASSET_STATUS_FACETS)[number]

/**
 * 状态分面读的是三个各自独立的引擎参数，叠加语义 = AND
 * （「我上传的 + 收藏的」）。
 */
function getStatusValues(filters: GalleryFilters): AssetStatusFacet[] {
  const values: AssetStatusFacet[] = []
  if (filters.liked) values.push('favorites')
  if (filters.published) values.push('published')
  if (filters.provider === USER_UPLOAD_PROVIDER) values.push('uploads')
  return values
}

interface FacetPopoverProps {
  label: string
  summary: string
  active: boolean
  children: React.ReactNode
  contentClassName?: string
  onOpenChange?: (open: boolean) => void
}

/**
 * 一格分面（素材页原型 S · 2026-10-08 定稿）：触发器是幽灵键（⛔ 描边），开着 / 生效时
 * 灰底；弹层从这颗键放大长出来（`getChipZoomMotion`），里面一行一项、照模型选择器那套行
 * （选中整行灰块 + 右侧勾从小顶出来），打开时一行行由糊变清地进来。
 */
function FacetPopover({
  label,
  summary,
  active,
  children,
  contentClassName,
  onOpenChange,
}: FacetPopoverProps) {
  const zoom = getChipZoomMotion({
    side: 'bottom',
    align: 'start',
    sideOffset: FACET_POPOVER_OFFSET,
  })
  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-active={active || undefined}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs text-foreground',
            'transition-colors duration-fast ease-standard motion-reduce:transition-none',
            'hover:bg-muted data-[state=open]:bg-muted',
            active && 'font-medium',
          )}
        >
          <BlurSwap swapKey={summary} className="max-w-32 min-w-0">
            <span className="truncate">{summary}</span>
          </BlurSwap>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={FACET_POPOVER_OFFSET}
        className={cn('w-56 rounded-xl p-1', zoom.className, contentClassName)}
        style={zoom.style}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}

const FACET_POPOVER_OFFSET = 6

interface FacetOptionRowProps {
  label: string
  count?: number
  selected: boolean
  onSelect: () => void
  /** 打开时第几行（错开由糊变清进来）。 */
  order: number
}

function FacetOptionRow({
  label,
  count,
  selected,
  onSelect,
  order,
}: FacetOptionRowProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onSelect}
      style={{
        animationDelay: `${Math.round(staggerDelay(order) * 1000 * 0.6)}ms`,
      }}
      className={cn(
        'picker-row-in flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-foreground',
        'transition-colors duration-base ease-standard motion-reduce:transition-none',
        'hover:outline hover:outline-1 hover:outline-border',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'bg-muted font-medium',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === 'number' && (
        <span className="shrink-0 font-mono text-2xs font-normal text-muted-foreground tabular-nums">
          {count}
        </span>
      )}
      {/* 勾常驻、只换状态：勾上时从小顶出来（同模型选择器的行）。 */}
      <Check
        aria-hidden
        className={cn(
          'size-3.5 shrink-0 transition-[opacity,scale,filter] duration-base ease-standard motion-reduce:transition-none',
          selected ? 'scale-100 opacity-100' : 'scale-50 opacity-0 blur-xs',
        )}
      />
    </button>
  )
}

interface ModelFacetPopoverProps {
  label: string
  summary: string
  active: boolean
  options: { id: string; label: string; count?: number }[]
  selected: string[]
  onToggle: (id: string) => void
  searchPlaceholder: string
  emptyLabel: string
}

function ModelFacetPopover({
  label,
  summary,
  active,
  options,
  selected,
  onToggle,
  searchPlaceholder,
  emptyLabel,
}: ModelFacetPopoverProps) {
  const [query, setQuery] = useState('')
  const visible = query.trim()
    ? options.filter((option) =>
        option.label.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : options

  return (
    <FacetPopover
      label={label}
      summary={summary}
      active={active}
      contentClassName="w-64"
      onOpenChange={(open) => !open && setQuery('')}
    >
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={searchPlaceholder}
        className="picker-row-in mb-1 h-8 rounded-lg border-0 bg-muted text-xs shadow-none"
      />
      <div className="studio-scrollbar max-h-64 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          visible.map((option, index) => (
            <FacetOptionRow
              key={option.id}
              order={index + 1}
              label={option.label}
              count={option.count}
              selected={selected.includes(option.id)}
              onSelect={() => onToggle(option.id)}
            />
          ))
        )}
      </div>
    </FacetPopover>
  )
}
