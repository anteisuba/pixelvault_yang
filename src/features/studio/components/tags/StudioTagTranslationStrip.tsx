'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'

import { X } from '@/components/icons'
import { SPRING } from '@/constants/motion'
import { formatTagWeight, isDefaultTagWeight } from '@/lib/tag-composer'
import { compactPostCount } from '@/lib/tag-lookup'
import {
  getNovelAiRecognitionTier,
  hasCjkOrNonAscii,
  pickLocalizedTagName,
  toDanbooruUnderscoreTag,
} from '@/lib/tag-recognition'
import { cn } from '@/lib/utils'
import type { DanbooruTagMetaEntry } from '@/types/tag-assist'
import type { TagChip } from '@/types/tag-composer'

export interface StudioTagTranslationStripProps {
  chips: readonly TagChip[]
  tagMeta: Readonly<Record<string, DanbooruTagMetaEntry>>
  loading?: boolean
  disabled?: boolean
  onSelectIndex?: (index: number) => void
  onLookup?: (chip: TagChip) => void
  onRemove: (index: number) => void
}

function isCheckableForUnknownBadge(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (hasCjkOrNonAscii(trimmed)) return false
  if (/^artist\s*:/i.test(trimmed)) return false
  if (/^year\s+\d{4}$/i.test(trimmed)) return false
  if (trimmed.includes('|') || trimmed.includes('{') || trimmed.includes('}')) {
    return false
  }
  return trimmed.split(/\s+/).length <= 5
}

/**
 * 5B-1 方案 A（owner 2026-11-27 拍板）：紧贴纯文本框下方的双行译文芯片带。
 *
 * - 上行：NAI/Danbooru 认知度圆点 + 英文原文 + 权重标（非 1× 时）+ × 删词；
 * - 下行：本地中文/日文释义（或英语界面下的热度/注释；词库未收录时以虚线框标灰提醒防写废词）；
 * - 纯展示同步，底层仍存 100% 纯英文原生串；点芯片定位该词、Ctrl/⌘+点查详情、点 × 删词。
 */
export function StudioTagTranslationStrip({
  chips,
  tagMeta,
  loading = false,
  disabled = false,
  onSelectIndex,
  onLookup,
  onRemove,
}: StudioTagTranslationStripProps) {
  const locale = useLocale()
  const t = useTranslations('StudioTags')
  const reducedMotion = Boolean(useReducedMotion())

  if (chips.length === 0) return null

  return (
    <div
      data-testid="tag-translation-strip"
      aria-label={t('translationStrip.ariaLabel')}
      className="flex flex-wrap items-stretch gap-1.5 border-t border-border/70 pt-2"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {chips.map((chip, index) => {
          const key = toDanbooruUnderscoreTag(chip.text)
          const meta = key ? tagMeta[key] : undefined
          const localized = meta ? pickLocalizedTagName(meta, locale) : null
          const recognition = meta
            ? getNovelAiRecognitionTier({
                count: meta.count,
                known: meta.known,
              })
            : undefined
          const showUnknown =
            recognition === 'unknown' && isCheckableForUnknownBadge(chip.text)
          const isNegative = chip.weight < 0
          const isZero = chip.weight === 0
          const hasWeight = !isDefaultTagWeight(chip.weight)
          const countText =
            meta && meta.count > 0 ? compactPostCount(meta.count, locale) : null
          const subText = localized
            ? localized
            : showUnknown
              ? t('recognition.unknownShort')
              : countText
                ? countText
                : loading && !meta
                  ? '…'
                  : '—'
          const tooltipParts = [
            meta?.zhNote ?? null,
            recognition ? t(`recognition.${recognition}`) : null,
            countText
              ? t('translationStrip.postsCount', { count: countText })
              : null,
          ].filter(Boolean)

          return (
            <motion.div
              key={`${index}:${chip.text}`}
              layout={!reducedMotion}
              initial={reducedMotion ? false : { opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0, scale: 0.92 }}
              transition={reducedMotion ? { duration: 0 } : SPRING.slot}
              title={
                tooltipParts.length > 0 ? tooltipParts.join(' · ') : undefined
              }
              className={cn(
                'group/tchip inline-flex max-w-full items-start gap-1 rounded-lg px-2 py-1 text-left transition-colors',
                isNegative
                  ? 'bg-status-risk/10 ring-1 ring-status-risk/25 ring-inset'
                  : showUnknown
                    ? 'border border-dashed border-muted-foreground/45 bg-card/60'
                    : 'bg-card shadow-seg',
                isZero && 'opacity-60',
              )}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={(event) => {
                  if ((event.metaKey || event.ctrlKey) && onLookup) {
                    onLookup(chip)
                    return
                  }
                  onSelectIndex?.(index)
                }}
                className="touch-target-y flex min-w-0 flex-col gap-0.5 text-left focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50"
              >
                <span className="flex items-center gap-1 text-2xs leading-tight font-semibold">
                  {recognition ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        recognition === 'high'
                          ? 'bg-foreground/85'
                          : recognition === 'mid'
                            ? 'bg-muted-foreground/65'
                            : recognition === 'low'
                              ? 'bg-muted-foreground/30'
                              : 'border border-muted-foreground/60 bg-transparent',
                      )}
                    />
                  ) : null}
                  <span
                    className={cn(
                      'max-w-44 truncate',
                      isNegative ? 'text-status-risk' : 'text-foreground',
                      isZero && 'line-through',
                    )}
                  >
                    {chip.text}
                  </span>
                  {hasWeight ? (
                    <span
                      className={cn(
                        'shrink-0 rounded px-1 font-mono text-[10px] font-semibold tabular-nums',
                        isNegative
                          ? 'bg-status-risk/15 text-status-risk'
                          : 'bg-muted text-foreground/85',
                      )}
                    >
                      {formatTagWeight(chip.weight)}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    'max-w-48 truncate text-[11px] leading-tight',
                    showUnknown
                      ? 'text-muted-foreground/80'
                      : 'text-muted-foreground',
                  )}
                >
                  {subText}
                </span>
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-label={t('translationStrip.removeTag', { tag: chip.text })}
                onClick={() => onRemove(index)}
                className="touch-target mt-0.5 grid size-4 shrink-0 place-items-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50"
              >
                <X className="size-3" aria-hidden />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
