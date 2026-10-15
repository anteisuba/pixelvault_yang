'use client'

/**
 * 图片卡提示词栏上的 **`⚙` 高级**（node-canvas-v2 §3，B1 owner 2026-10-14）。
 *
 * 一颗纯图标键，弹层（实底）里依次是：种子（当前值 · 🎲 换一个 · 🔒 锁住）·
 * 反向提示词 · 下面一段「这个模型专属」（画质、背景、风格、参考强度……即原来
 * chip `专属` 的内容，并进这里之后那颗 chip 已删）。
 *
 * - 模型不认的项**不出**，⛔ 灰着占位；一项都没有时整颗键不画。
 * - 任何一项离开默认值，键的右上角一颗小点。
 * - 画质仍存卡上的 `quality`，其余存 `params.advanced`；发出去之前由
 *   `generateNode` 逐项过 `AdvancedParamsSchema`。
 * - 种子锁住 = 存一个 `advanced.seed`；没锁 = 不存（每次由服务端随机）。一次
 *   多张时第 n 张用 `seed + n`，见 `shotSeed`。
 */

import { useTranslations } from 'next-intl'

import { Dices, Lock, LockOpen, Settings2 } from '@/components/icons'
import { PROMPT_TEXT_GUARD_MAX_CHARS } from '@/constants/config'
import { hasCapability } from '@/constants/provider-capabilities'
import { isAiAdapterType } from '@/constants/providers'
import { VARIANT_MAX_SEED } from '@/constants/studio'
import {
  getRunCapabilityChips,
  isCapabilityChipSet,
  isCapabilityChipVisible,
} from '@/lib/model-capability-chips'
import { randomImageSeed } from '@/lib/node-image-seed'
import { cn } from '@/lib/utils'
import type { AdvancedParams } from '@/types'
import type { NodeV4GenerationParams } from '@/types/node-workflow'
import { ModelCapabilityControlPanel } from '@/components/business/studio/StudioModelCapabilityChips'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { ChipPopover } from '../chrome/ChipPopover'

type AdvancedValues = NonNullable<NodeV4GenerationParams['advanced']>

export interface ImageAdvancedChipProps {
  readonly model: { adapterType: string; modelId: string } | undefined
  readonly params: NodeV4GenerationParams | undefined
  onParamsChange(next: NodeV4GenerationParams): void
  readonly hasReferenceImage: boolean
  readonly disabled?: boolean
}

/** 卡上存的 `quality` 与 `advanced` 合成专属面板认的形状。 */
function toCapabilityParams(
  params: NodeV4GenerationParams | undefined,
): AdvancedParams {
  return {
    ...params?.advanced,
    ...(params?.quality ? { quality: params.quality } : {}),
  } as AdvancedParams
}

const iconButtonClass =
  'flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50'

export function ImageAdvancedChip({
  model,
  params,
  onParamsChange,
  hasReferenceImage,
  disabled = false,
}: ImageAdvancedChipProps) {
  const t = useTranslations('StudioNode.v4.image.advanced')
  if (!model || !isAiAdapterType(model.adapterType)) return null
  const adapterType = model.adapterType
  const seedSupported = hasCapability(adapterType, 'seed', model.modelId)
  const negativeSupported = hasCapability(
    adapterType,
    'negativePrompt',
    model.modelId,
  )
  const capabilityParams = toCapabilityParams(params)
  const models = [{ adapterType, modelId: model.modelId }]
  const capabilityChips = getRunCapabilityChips(models).filter((chip) =>
    isCapabilityChipVisible(chip, capabilityParams, hasReferenceImage),
  )
  if (!seedSupported && !negativeSupported && capabilityChips.length === 0)
    return null

  const advanced: AdvancedValues = params?.advanced ?? {}
  const seed = seedSupported ? advanced.seed : undefined
  const locked = typeof seed === 'number'
  const negative =
    negativeSupported && typeof advanced.negativePrompt === 'string'
      ? advanced.negativePrompt
      : ''
  const changed =
    locked ||
    negative.trim().length > 0 ||
    capabilityChips.some((chip) => isCapabilityChipSet(chip, capabilityParams))

  /** 改 `advanced` 里的一个键；`undefined` = 删掉（回到默认）。 */
  const setAdvanced = (key: string, value: string | number | undefined) => {
    const rest = Object.fromEntries(
      Object.entries(advanced).filter(([name]) => name !== key),
    )
    onParamsChange({
      ...params,
      advanced: value === undefined ? rest : { ...rest, [key]: value },
    })
  }

  return (
    <ChipPopover
      width={320}
      ariaLabel={t('label')}
      trigger={
        <button
          type="button"
          disabled={disabled}
          aria-label={changed ? t('labelChanged') : t('label')}
          title={t('label')}
          data-image-advanced
          data-changed={changed ? 'true' : undefined}
          className={cn(
            'nodrag nopan relative flex size-7.5 shrink-0 items-center justify-center rounded-full bg-surface-fill text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-surface-fill-track',
          )}
        >
          <Settings2 aria-hidden className="size-4" />
          {changed ? (
            <span
              aria-hidden
              data-image-advanced-dot
              className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-foreground"
            />
          ) : null}
        </button>
      }
    >
      <div data-image-advanced-panel className="flex flex-col gap-3">
        {seedSupported ? (
          <div data-image-advanced-seed className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-foreground">
                {t('seed')}
              </span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={VARIANT_MAX_SEED}
                value={locked ? String(seed) : ''}
                placeholder={t('seedRandom')}
                aria-label={t('seed')}
                disabled={disabled}
                className="h-7 min-w-0 flex-1 font-mono"
                onChange={(event) => {
                  const raw = event.target.value
                  if (raw === '') {
                    setAdvanced('seed', undefined)
                    return
                  }
                  const next = Number.parseInt(raw, 10)
                  if (
                    Number.isInteger(next) &&
                    next >= 0 &&
                    next <= VARIANT_MAX_SEED
                  )
                    setAdvanced('seed', next)
                }}
              />
              <button
                type="button"
                aria-label={t('seedShuffle')}
                title={t('seedShuffle')}
                data-image-advanced-seed-shuffle
                disabled={disabled}
                className={iconButtonClass}
                onClick={() => setAdvanced('seed', randomImageSeed())}
              >
                <Dices aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                aria-pressed={locked}
                aria-label={locked ? t('seedUnlock') : t('seedLock')}
                title={locked ? t('seedUnlock') : t('seedLock')}
                data-image-advanced-seed-lock
                disabled={disabled}
                className={cn(iconButtonClass, locked && 'text-foreground')}
                onClick={() =>
                  setAdvanced('seed', locked ? undefined : randomImageSeed())
                }
              >
                {locked ? (
                  <Lock aria-hidden className="size-4" />
                ) : (
                  <LockOpen aria-hidden className="size-4" />
                )}
              </button>
            </div>
            {locked && (params?.count ?? 1) > 1 ? (
              <span className="pl-18 text-2xs text-muted-foreground">
                {t('seedBatchHint')}
              </span>
            ) : null}
          </div>
        ) : null}
        {negativeSupported ? (
          <label data-image-advanced-negative className="flex flex-col gap-1.5">
            <span className="text-xs text-foreground">{t('negative')}</span>
            <Textarea
              value={negative}
              rows={2}
              maxLength={PROMPT_TEXT_GUARD_MAX_CHARS}
              placeholder={t('negativePlaceholder')}
              disabled={disabled}
              className="nowheel min-h-14 resize-none"
              onChange={(event) =>
                setAdvanced(
                  'negativePrompt',
                  event.target.value.length > 0
                    ? event.target.value
                    : undefined,
                )
              }
            />
          </label>
        ) : null}
        {capabilityChips.length > 0 ? (
          <div
            className={cn(
              (seedSupported || negativeSupported) &&
                'border-t border-dashed border-border pt-2',
            )}
          >
            <ModelCapabilityControlPanel
              models={models}
              params={capabilityParams}
              hasReferenceImage={hasReferenceImage}
              disabled={disabled}
              onParamsChange={(next) => {
                const { quality, ...rest } = next as Record<
                  string,
                  string | number | boolean
                >
                // 面板带回的是整份（种子、反向词也在里面），画质拆回 `quality`。
                onParamsChange({
                  ...params,
                  ...(typeof quality === 'string' ? { quality } : {}),
                  advanced: rest,
                })
              }}
            />
          </div>
        ) : null}
      </div>
    </ChipPopover>
  )
}
