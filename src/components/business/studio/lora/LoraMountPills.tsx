'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { ImageIcon, Plus } from '@/components/icons'
import type { LoraBaseModel } from '@/constants/lora-base-models'
import type { NumericRange } from '@/constants/provider-capabilities'
import type { LoraAssetRecord } from '@/types'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  studioOutlineChipOpenClass,
  studioToolPopoverBaseClass,
  useStudioChipPopoverMotion,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { isLoraBaseModelMountCompatible } from '@/lib/lora-model-compatibility'
import { cn } from '@/lib/utils'

/** 家族 slug → `LoraWorkbench.familyLabel.*`；表外的原样显示。 */
const FAMILY_LABEL_KEYS: Record<string, string> = {
  illustrious: 'illustrious',
  flux: 'flux',
  sdxl: 'sdxl',
  pony: 'pony',
  sd15: 'sd15',
  anima: 'anima',
  'anima-dit': 'anima',
  krea2: 'krea2',
  qwen: 'qwen',
  'z-image': 'zImage',
  chroma: 'chroma',
}

const SOURCE_LABEL_KEYS: Record<LoraAssetRecord['source'], string> = {
  trained: 'sourceTrained',
  imported: 'sourceImported',
  curated: 'sourceCurated',
}

interface LoraMountPillsProps {
  selectedBase: LoraBaseModel | null
  /** 底模给的权重值域；不给时小卡里只写权重、没有滑杆。 */
  loraScaleConfig: NumericRange | undefined
  /** 「+ LoRA」：弹挑 LoRA 的框（锁「和当前底模装得上」）。 */
  onAddLora: () => void
  disabled?: boolean
}

/**
 * LoRA 收进输入框（ui-spec ㊲ `LoraBench`）：挂上的每把一颗药丸 —— 小图 + 名字 + 权重
 * （等宽灰字），关掉的变淡、⛔ 藏；最后一颗「+ LoRA」是这一行唯一的描边药丸。
 * 点一颗从上方弹出小卡（`LoraPill`）：开关、权重、触发词、卸下。
 * ⚠ 挂载栈自取（与手机装配抽屉同一份 `useActiveLoraStack`）。
 */
export function LoraMountPills({
  selectedBase,
  loraScaleConfig,
  onAddLora,
  disabled = false,
}: LoraMountPillsProps) {
  const t = useTranslations('LoraWorkbench')
  const stack = useActiveLoraStack()
  // 刚挂上的那一颗弹一下：只认这一行在场之后才发生的挂载，⛔ 刷新读回的也跟着弹。
  const [seenMountAt] = useState(() => stack.mountEvent?.at ?? 0)
  const freshId =
    stack.mountEvent && stack.mountEvent.at > seenMountAt
      ? stack.mountEvent.assetId
      : null
  return (
    <div
      data-assistant-field="loras"
      data-testid="lora-mount-pills"
      className="flex min-w-0 flex-wrap items-center gap-1.5"
    >
      {stack.items.map((item) => (
        <LoraPill
          key={item.asset.id}
          asset={item.asset}
          fresh={item.asset.id === freshId}
          scale={item.scale ?? item.asset.defaultScale}
          enabled={item.enabled !== false}
          compatible={
            selectedBase
              ? isLoraBaseModelMountCompatible(
                  item.asset.baseModelFamily,
                  selectedBase.family,
                )
              : null
          }
          loraScaleConfig={loraScaleConfig}
          disabled={disabled}
          onEnabledChange={(value) => stack.setEnabled(item.asset.id, value)}
          onScaleChange={(value) => stack.setScale(item.asset.id, value)}
          onRemove={() => stack.remove(item.asset.id)}
        />
      ))}
      <button
        type="button"
        onClick={onAddLora}
        aria-label={t('pill.addLabel')}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-2sm text-ink-2 transition-colors duration-fast ease-standard hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
      >
        <Plus className="size-3.5" aria-hidden />
        {t('pill.add')}
      </button>
    </div>
  )
}

interface LoraPillProps {
  asset: LoraAssetRecord
  fresh: boolean
  scale: number
  enabled: boolean
  /** `null` = 底模未定，不说装不装得上。 */
  compatible: boolean | null
  loraScaleConfig: NumericRange | undefined
  disabled: boolean
  onEnabledChange: (enabled: boolean) => void
  onScaleChange: (scale: number) => void
  onRemove: () => void
}

function LoraPill({
  asset,
  fresh,
  scale,
  enabled,
  compatible,
  loraScaleConfig,
  disabled,
  onEnabledChange,
  onScaleChange,
  onRemove,
}: LoraPillProps) {
  const t = useTranslations('LoraWorkbench')
  const [open, setOpen] = useState(false)
  const motion = useStudioChipPopoverMotion({
    side: 'top',
    align: 'start',
    sideOffset: 8,
  })
  const bad = compatible === false
  const familyKey = FAMILY_LABEL_KEYS[asset.baseModelFamily]
  const family = familyKey
    ? t(`familyLabel.${familyKey}`)
    : asset.baseModelFamily
  const triggers = asset.triggerWord
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean)

  const cover = (sizeClass: string) =>
    asset.coverImageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxyCivitaiImageUrl(asset.coverImageUrl)}
        alt=""
        loading="lazy"
        decoding="async"
        className={cn(sizeClass, 'shrink-0 bg-muted object-cover')}
      />
    ) : (
      <span
        aria-hidden
        className={cn(
          sizeClass,
          'grid shrink-0 place-items-center bg-muted text-muted-foreground',
        )}
      >
        <ImageIcon className="size-3" />
      </span>
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={t('pill.openLabel', {
            name: asset.name,
            scale: scale.toFixed(1),
          })}
          title={asset.name}
          className={cn(
            'inline-flex h-8 min-w-0 max-w-56 shrink-0 items-center gap-1.5 rounded-full bg-muted pr-3 pl-1 text-2sm font-medium text-foreground transition-[background-color,opacity] duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none',
            open && studioOutlineChipOpenClass,
            !enabled && 'opacity-50',
            fresh &&
              'animate-in fade-in zoom-in-75 duration-spring-slot ease-spring-slot motion-reduce:animate-none',
          )}
        >
          {cover('size-6 rounded-full')}
          <span className="min-w-0 truncate">{asset.name}</span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {scale.toFixed(1)}
          </span>
          {bad ? (
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-status-warning"
            />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        style={motion.style}
        className={cn(
          studioToolPopoverBaseClass,
          'flex w-75 flex-col gap-3 p-3.5',
          motion.className,
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {cover('size-9 rounded-md')}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {asset.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {t(`pill.${SOURCE_LABEL_KEYS[asset.source]}`)} · {family}
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={onEnabledChange}
            aria-label={t(enabled ? 'spine.disableLora' : 'spine.enableLora', {
              name: asset.name,
            })}
          />
        </div>
        {bad ? (
          <p className="text-xs text-status-warning">
            {t('spine.incompatibleLine', { family })}
          </p>
        ) : null}
        <div className="flex items-center gap-3 text-2sm">
          <span className="w-12 shrink-0 text-muted-foreground">
            {t('pill.weight')}
          </span>
          {loraScaleConfig ? (
            <Slider
              look="bar"
              aria-label={t('spine.weightBarLabel', { name: asset.name })}
              min={loraScaleConfig.min}
              max={loraScaleConfig.max}
              step={loraScaleConfig.step}
              value={[scale]}
              onValueChange={([value]) => {
                if (value !== undefined) onScaleChange(value)
              }}
              disabled={!enabled}
            />
          ) : (
            <span className="flex-1" />
          )}
          <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
            {scale.toFixed(2)}
          </span>
        </div>
        {triggers.length > 0 ? (
          <div className="flex items-start gap-3 text-2sm">
            <span className="w-12 shrink-0 pt-0.5 text-muted-foreground">
              {t('pill.triggers')}
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap gap-1">
              {triggers.map((word) => (
                <span
                  key={word}
                  className="max-w-full truncate rounded-sm bg-highlight-soft px-1.5 py-0.5 font-mono text-xs text-highlight"
                >
                  {word}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onRemove()
            }}
            className="rounded-full px-2 py-1 text-2sm text-ink-2 transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
          >
            {t('pill.remove')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
