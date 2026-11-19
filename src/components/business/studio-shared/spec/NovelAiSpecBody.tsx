'use client'

import { useState, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'

import { ArrowLeftRight } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { StudioRatioGlyph } from '@/components/business/studio-shared/primitives/tool-surface'
import {
  NOVELAI_DIMENSION_MAX,
  NOVELAI_DIMENSION_MIN,
  NOVELAI_DIMENSION_STEP,
  NOVELAI_MAX_PIXELS,
  NOVELAI_RESOLUTION_TIERS,
  findNovelAiResolutionPreset,
  getNovelAiPresetsForTier,
  isValidNovelAiDimensions,
  pickNovelAiPresetForTier,
  snapNovelAiDimension,
  type NovelAiOpusCost,
  type NovelAiResolutionTier,
} from '@/constants/novelai'
import { cn } from '@/lib/utils'

export interface NovelAiSpecBodyProps {
  readonly width: number
  readonly height: number
  onChange(next: { width: number; height: number }): void
  /** Opus 计费提示（free / usageLimited / metered）；不传时不画计费标签。 */
  readonly opusCost?: NovelAiOpusCost
  readonly disabled?: boolean
  /** 遮罩重绘锁定底图原尺寸时为 true。 */
  readonly locked?: boolean
  readonly lockedHint?: string
  readonly compact?: boolean
}

const OPUS_COST_KEY = {
  free: 'novelAi.opusFree',
  usageLimited: 'novelAi.opusUsageLimited',
  metered: 'novelAi.opusMetered',
} as const satisfies Record<NovelAiOpusCost, string>

function clampOppositeToMaxPixels(edited: number, other: number): number {
  if (edited * other <= NOVELAI_MAX_PIXELS) return edited
  const maxForEdited =
    Math.floor(NOVELAI_MAX_PIXELS / other / NOVELAI_DIMENSION_STEP) *
    NOVELAI_DIMENSION_STEP
  return Math.max(NOVELAI_DIMENSION_MIN, maxForEdited)
}

/**
 * NovelAI 专属规格选择器（方案 1）：
 * 1. 顶部四档预设条（Small / Normal / Large / Wallpaper），切档位自动保持横 / 竖 / 方方向；
 * 2. 中间 2–3 颗方向按钮（带等比图形 + 等宽像素）；
 * 3. 底部常驻「宽 ⇄ 高」自定义输入（64 倍数、一键互换、实时 Opus 提示）。
 *
 * ⚠ 纯受控组件，不认识 StudioContext 或画布节点 —— 工作台与画布图片卡共用这一份。
 */
export function NovelAiSpecBody({
  width,
  height,
  onChange,
  opusCost,
  disabled = false,
  locked = false,
  lockedHint,
  compact = false,
}: NovelAiSpecBodyProps) {
  const t = useTranslations('StudioSpecChip')
  const matched = findNovelAiResolutionPreset(width, height)
  const [selectedTier, setSelectedTier] = useState<NovelAiResolutionTier>(
    matched?.tier ?? 'normal',
  )
  const [draft, setDraft] = useState({
    seenW: width,
    seenH: height,
    w: String(width),
    h: String(height),
    error: null as string | null,
  })

  // 外部受控值变了（点预设、点互换、导入配方、重置）→ 渲染期直接同步草稿。
  if (draft.seenW !== width || draft.seenH !== height) {
    setDraft({
      seenW: width,
      seenH: height,
      w: String(width),
      h: String(height),
      error: null,
    })
  }

  const activeTier = matched?.tier ?? selectedTier
  const tierPresets = getNovelAiPresetsForTier(activeTier)
  const isBlocked = disabled || locked
  const matchedKey = matched ? `${matched.width}x${matched.height}` : ''

  const handleTierChange = (nextTier: NovelAiResolutionTier) => {
    if (isBlocked) return
    setSelectedTier(nextTier)
    const picked = pickNovelAiPresetForTier(nextTier, width, height)
    onChange({ width: picked.width, height: picked.height })
  }

  const handlePresetSelect = (key: string) => {
    if (isBlocked) return
    const picked = tierPresets.find(
      (preset) => `${preset.width}x${preset.height}` === key,
    )
    if (!picked) return
    setSelectedTier(picked.tier)
    onChange({ width: picked.width, height: picked.height })
  }

  const handleDraftChange = (axis: 'w' | 'h', raw: string) => {
    if (isBlocked) return
    const nextW = axis === 'w' ? raw : draft.w
    const nextH = axis === 'h' ? raw : draft.h
    const parsedW = Number(nextW)
    const parsedH = Number(nextH)

    if (
      nextW.trim() !== '' &&
      nextH.trim() !== '' &&
      Number.isInteger(parsedW) &&
      Number.isInteger(parsedH)
    ) {
      if (isValidNovelAiDimensions(parsedW, parsedH)) {
        setDraft((prev) => ({
          ...prev,
          w: nextW,
          h: nextH,
          error: null,
        }))
        onChange({ width: parsedW, height: parsedH })
        return
      }
      if (
        parsedW >= NOVELAI_DIMENSION_MIN &&
        parsedW <= NOVELAI_DIMENSION_MAX &&
        parsedH >= NOVELAI_DIMENSION_MIN &&
        parsedH <= NOVELAI_DIMENSION_MAX &&
        parsedW * parsedH > NOVELAI_MAX_PIXELS
      ) {
        setDraft((prev) => ({
          ...prev,
          w: nextW,
          h: nextH,
          error: t('novelAi.maxPixelsError'),
        }))
        return
      }
    }
    setDraft((prev) => ({ ...prev, w: nextW, h: nextH, error: null }))
  }

  const commitDraft = (axis: 'w' | 'h') => {
    if (isBlocked) return
    const parsedW = Number(draft.w)
    const parsedH = Number(draft.h)
    let snappedW =
      draft.w.trim() === '' || !Number.isFinite(parsedW)
        ? width
        : snapNovelAiDimension(parsedW)
    let snappedH =
      draft.h.trim() === '' || !Number.isFinite(parsedH)
        ? height
        : snapNovelAiDimension(parsedH)

    if (snappedW * snappedH > NOVELAI_MAX_PIXELS) {
      if (axis === 'w') {
        snappedW = clampOppositeToMaxPixels(snappedW, snappedH)
      } else {
        snappedH = clampOppositeToMaxPixels(snappedH, snappedW)
      }
    }

    setDraft((prev) => ({
      ...prev,
      w: String(snappedW),
      h: String(snappedH),
      error: null,
    }))
    if (snappedW !== width || snappedH !== height) {
      onChange({ width: snappedW, height: snappedH })
    }
  }

  const handleKeyDown = (
    axis: 'w' | 'h',
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft(axis)
    }
  }

  const handleSwap = () => {
    if (isBlocked) return
    onChange({ width: height, height: width })
  }

  const tierHeaderNote = locked
    ? lockedHint
    : !matched
      ? t('novelAi.customTag')
      : activeTier === 'large' || activeTier === 'wallpaper'
        ? t('novelAi.anlasBadge')
        : null

  return (
    <div
      data-novelai-spec-body
      className={cn(
        'flex flex-col',
        compact ? 'gap-2.5' : 'gap-3',
        locked && 'opacity-60',
      )}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xs text-muted-foreground/70">
            {t('novelAi.presetLabel')}
          </span>
          {tierHeaderNote ? (
            <span
              className={cn(
                'text-2xs',
                !locked &&
                  matched &&
                  (activeTier === 'large' || activeTier === 'wallpaper')
                  ? 'text-status-warning'
                  : 'text-muted-foreground',
              )}
            >
              {tierHeaderNote}
            </span>
          ) : null}
        </div>
        <LiquidSegmented
          items={NOVELAI_RESOLUTION_TIERS.map((tier) => ({
            value: tier,
            label: t(`novelAi.tier.${tier}`),
          }))}
          value={matched ? matched.tier : ('' as NovelAiResolutionTier)}
          onChange={handleTierChange}
          ariaLabel={t('novelAi.presetLabel')}
          disabled={isBlocked}
          semantics="radio"
          size="xs"
          fill
          reselect
        />
        <LiquidSegmented
          items={tierPresets.map((preset) => ({
            value: `${preset.width}x${preset.height}`,
            label: `${preset.width}×${preset.height}`,
            title: `${t(`novelAi.orientation.${preset.orientation}`)} · ${preset.width}×${preset.height}`,
            icon: (
              <StudioRatioGlyph ratio={`${preset.width}:${preset.height}`} />
            ),
          }))}
          value={matchedKey}
          onChange={handlePresetSelect}
          ariaLabel={t('novelAi.orientationLabel')}
          disabled={isBlocked}
          semantics="radio"
          size="stack"
          fill
          reselect
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xs text-muted-foreground/70">
            {t('novelAi.customLabel')}
          </span>
          {opusCost ? (
            <span
              data-novelai-opus-cost={opusCost}
              className={cn(
                'text-2xs',
                opusCost === 'metered'
                  ? 'text-status-warning'
                  : 'text-muted-foreground',
              )}
            >
              {t(OPUS_COST_KEY[opusCost])}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            inputMode="numeric"
            min={NOVELAI_DIMENSION_MIN}
            max={NOVELAI_DIMENSION_MAX}
            step={NOVELAI_DIMENSION_STEP}
            value={draft.w}
            disabled={isBlocked}
            aria-label={t('novelAi.widthLabel')}
            onChange={(event) => handleDraftChange('w', event.target.value)}
            onBlur={() => commitDraft('w')}
            onKeyDown={(event) => handleKeyDown('w', event)}
            className="h-8 min-w-0 flex-1 rounded-full px-3 text-center font-mono text-2sm tabular-nums"
          />
          <button
            type="button"
            disabled={isBlocked}
            onClick={handleSwap}
            title={t('novelAi.swapDimensions')}
            aria-label={t('novelAi.swapDimensions')}
            className="touch-target-y inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors duration-fast ease-standard hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-45"
          >
            <ArrowLeftRight className="size-3.5" aria-hidden />
          </button>
          <Input
            type="number"
            inputMode="numeric"
            min={NOVELAI_DIMENSION_MIN}
            max={NOVELAI_DIMENSION_MAX}
            step={NOVELAI_DIMENSION_STEP}
            value={draft.h}
            disabled={isBlocked}
            aria-label={t('novelAi.heightLabel')}
            onChange={(event) => handleDraftChange('h', event.target.value)}
            onBlur={() => commitDraft('h')}
            onKeyDown={(event) => handleKeyDown('h', event)}
            className="h-8 min-w-0 flex-1 rounded-full px-3 text-center font-mono text-2sm tabular-nums"
          />
        </div>
        {draft.error ? (
          <p role="alert" className="text-2xs text-status-risk">
            {draft.error}
          </p>
        ) : locked && lockedHint ? (
          <p className="text-2xs text-muted-foreground">{lockedHint}</p>
        ) : (
          <p className="text-2xs text-muted-foreground">
            {t('novelAi.stepHint')}
          </p>
        )}
      </div>
    </div>
  )
}
