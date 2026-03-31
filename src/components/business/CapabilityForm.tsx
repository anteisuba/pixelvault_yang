'use client'

import { useTranslations } from 'next-intl'
import { Plus, X } from 'lucide-react'

import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getCapabilityConfig,
  getCapabilityFieldType,
  type ProviderCapability,
  type CapabilityConfig,
} from '@/constants/provider-capabilities'
import type { AdvancedParams } from '@/types'

import { Button } from '@/components/ui/button'
import { CollapsiblePanel } from '@/components/ui/collapsible-panel'
import { Input } from '@/components/ui/input'
import { OptionGroup } from '@/components/ui/option-group'
import { ParamSlider } from '@/components/ui/param-slider'
import { SeedInput } from '@/components/ui/seed-input'
import { Textarea } from '@/components/ui/textarea'

// Capabilities that expose user-visible form controls (excludes internal flags like imageAnalysis)
const USER_CONFIGURABLE: ProviderCapability[] = [
  'negativePrompt',
  'guidanceScale',
  'steps',
  'referenceStrength',
  'seed',
  'quality',
  'background',
  'style',
  'lora',
]

interface CapabilityFormProps {
  adapterType: AI_ADAPTER_TYPES
  params: AdvancedParams
  onChange: (params: AdvancedParams) => void
  /** Conditionally show referenceStrength field */
  hasReferenceImage?: boolean
  disabled?: boolean
}

function isQualityValue(
  value: string,
): value is NonNullable<AdvancedParams['quality']> {
  return (
    value === 'auto' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high'
  )
}

/**
 * Data-driven advanced settings panel.
 * Iterates ADAPTER_CAPABILITIES[adapterType].capabilities and renders
 * the appropriate field component for each capability type.
 * Adding a new model only requires updating ADAPTER_CAPABILITIES — zero UI changes.
 */
export function CapabilityForm({
  adapterType,
  params,
  onChange,
  hasReferenceImage = false,
  disabled = false,
}: CapabilityFormProps) {
  const t = useTranslations('AdvancedSettings')
  const config = getCapabilityConfig(adapterType)

  const renderableCaps = config.capabilities.filter(
    (cap) =>
      USER_CONFIGURABLE.includes(cap) &&
      getCapabilityFieldType(cap) !== null &&
      !(cap === 'referenceStrength' && !hasReferenceImage),
  )

  if (renderableCaps.length === 0) return null

  const update = (patch: Partial<AdvancedParams>) =>
    onChange({ ...params, ...patch })

  return (
    <CollapsiblePanel title={t('title')} description={t('description')}>
      <div className="space-y-5">
        {renderableCaps.map((cap) => (
          <CapabilityField
            key={cap}
            cap={cap}
            config={config}
            params={params}
            update={update}
            disabled={disabled}
          />
        ))}
      </div>
    </CollapsiblePanel>
  )
}

// ─── Per-capability field renderer ────────────────────────────

interface CapabilityFieldProps {
  cap: ProviderCapability
  config: CapabilityConfig
  params: AdvancedParams
  update: (patch: Partial<AdvancedParams>) => void
  disabled: boolean
}

function CapabilityField({
  cap,
  config,
  params,
  update,
  disabled,
}: CapabilityFieldProps) {
  const t = useTranslations('AdvancedSettings')

  switch (cap) {
    case 'negativePrompt':
      return (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {t('negativePrompt')}
          </label>
          <p className="text-xs text-muted-foreground">
            {t('negativePromptHint')}
          </p>
          <Textarea
            placeholder={t('negativePromptPlaceholder')}
            value={params.negativePrompt ?? ''}
            onChange={(e) =>
              update({ negativePrompt: e.target.value || undefined })
            }
            rows={2}
            maxLength={2000}
            disabled={disabled}
            className="min-h-16 resize-none rounded-xl border-border/75 bg-background/72 px-3 py-2 font-serif text-sm"
          />
        </div>
      )

    case 'guidanceScale':
      if (!config.guidanceScale) return null
      return (
        <ParamSlider
          label={t('guidanceScale')}
          hint={t('guidanceScaleHint')}
          value={params.guidanceScale ?? config.guidanceScale.default}
          onChange={(v) => update({ guidanceScale: v })}
          min={config.guidanceScale.min}
          max={config.guidanceScale.max}
          step={config.guidanceScale.step}
          disabled={disabled}
        />
      )

    case 'steps':
      if (!config.steps) return null
      return (
        <ParamSlider
          label={t('steps')}
          hint={t('stepsHint')}
          value={params.steps ?? config.steps.default}
          onChange={(v) => update({ steps: v })}
          min={config.steps.min}
          max={config.steps.max}
          step={config.steps.step}
          disabled={disabled}
        />
      )

    case 'referenceStrength':
      if (!config.referenceStrength) return null
      return (
        <ParamSlider
          label={t('referenceStrength')}
          hint={t('referenceStrengthHint')}
          value={params.referenceStrength ?? config.referenceStrength.default}
          onChange={(v) => update({ referenceStrength: v })}
          min={config.referenceStrength.min}
          max={config.referenceStrength.max}
          step={config.referenceStrength.step}
          disabled={disabled}
          formatValue={(v) => `${Math.round(v * 100)}%`}
        />
      )

    case 'seed':
      return (
        <SeedInput
          label={t('seed')}
          hint={t('seedHint')}
          value={params.seed}
          onChange={(v) => update({ seed: v })}
          randomLabel={t('seedRandom')}
          disabled={disabled}
        />
      )

    case 'quality':
      if (!config.qualityOptions) return null
      return (
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground">
            {t('quality')}
          </span>
          <p className="text-xs text-muted-foreground">{t('qualityHint')}</p>
          <OptionGroup
            options={config.qualityOptions.map((v) => ({
              value: v,
              label: t(`qualityOption.${v}`),
            }))}
            value={params.quality ?? 'auto'}
            onChange={(value) => {
              if (!isQualityValue(value)) return
              update({ quality: value })
            }}
            disabled={disabled}
          />
        </div>
      )

    case 'background':
      if (!config.backgroundOptions) return null
      return (
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground">
            {t('background')}
          </span>
          <p className="text-xs text-muted-foreground">{t('backgroundHint')}</p>
          <OptionGroup
            options={config.backgroundOptions.map((v) => ({
              value: v,
              label: t(`backgroundOption.${v}`),
            }))}
            value={params.background ?? 'auto'}
            onChange={(v) => update({ background: v })}
            disabled={disabled}
          />
        </div>
      )

    case 'style':
      if (!config.styleOptions) return null
      return (
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground">
            {t('style')}
          </span>
          <p className="text-xs text-muted-foreground">{t('styleHint')}</p>
          <OptionGroup
            options={config.styleOptions.map((v) => ({
              value: v,
              label: t(`styleOption.${v}`),
            }))}
            value={params.style ?? 'vivid'}
            onChange={(v) => update({ style: v })}
            disabled={disabled}
          />
        </div>
      )

    case 'lora':
      return (
        <LoraField
          config={config}
          params={params}
          update={update}
          disabled={disabled}
        />
      )

    default:
      return null
  }
}

// ─── LoRA field (complex — dynamic list with sub-sliders) ──────

function LoraField({
  config,
  params,
  update,
  disabled,
}: {
  config: CapabilityConfig
  params: AdvancedParams
  update: (patch: Partial<AdvancedParams>) => void
  disabled: boolean
}) {
  const t = useTranslations('AdvancedSettings')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-foreground">
            {t('lora')}
          </span>
          <p className="text-xs text-muted-foreground">{t('loraHint')}</p>
        </div>
        {(params.loras?.length ?? 0) < (config.maxLoras ?? 1) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              update({
                loras: [
                  ...(params.loras ?? []),
                  { url: '', scale: config.loraScale?.default ?? 1 },
                ],
              })
            }
            disabled={disabled}
            className="h-7 gap-1 rounded-lg px-2 text-xs"
          >
            <Plus className="size-3" />
            {t('loraAdd')}
          </Button>
        )}
      </div>

      {params.loras?.map((lora, index) => (
        <div
          key={index}
          className="space-y-2 rounded-xl border border-border/60 bg-background/50 p-3"
        >
          <div className="flex items-center gap-2">
            <Input
              placeholder={t('loraUrlPlaceholder')}
              value={lora.url}
              onChange={(e) => {
                const updated = [...(params.loras ?? [])]
                updated[index] = { ...updated[index], url: e.target.value }
                update({ loras: updated })
              }}
              disabled={disabled}
              className="h-8 rounded-lg border-border/75 bg-background/72 font-mono text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const updated = (params.loras ?? []).filter(
                  (_, i) => i !== index,
                )
                update({ loras: updated.length > 0 ? updated : undefined })
              }}
              disabled={disabled}
              className="size-8 shrink-0 rounded-lg p-0 text-muted-foreground hover:text-destructive"
            >
              <X className="size-3.5" />
            </Button>
          </div>
          {config.loraScale && (
            <ParamSlider
              label={t('loraScale')}
              value={lora.scale ?? config.loraScale.default}
              onChange={(v) => {
                const updated = [...(params.loras ?? [])]
                updated[index] = { ...updated[index], scale: v }
                update({ loras: updated })
              }}
              min={config.loraScale.min}
              max={config.loraScale.max}
              step={config.loraScale.step}
              disabled={disabled}
            />
          )}
        </div>
      ))}
    </div>
  )
}
