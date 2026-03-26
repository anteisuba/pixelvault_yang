'use client'

import { useTranslations } from 'next-intl'

import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getCapabilityConfig,
  hasCapability,
  type ProviderCapability,
} from '@/constants/provider-capabilities'
import type { AdvancedParams } from '@/types'

import { CollapsiblePanel } from '@/components/ui/collapsible-panel'
import { OptionGroup } from '@/components/ui/option-group'
import { ParamSlider } from '@/components/ui/param-slider'
import { SeedInput } from '@/components/ui/seed-input'
import { Textarea } from '@/components/ui/textarea'

interface AdvancedSettingsProps {
  adapterType: AI_ADAPTER_TYPES
  params: AdvancedParams
  onChange: (params: AdvancedParams) => void
  /** Whether a reference image is attached (shows referenceStrength) */
  hasReferenceImage?: boolean
  disabled?: boolean
}

/**
 * Capability-aware advanced settings panel.
 * Renders only the controls supported by the current adapter.
 * Reusable across GenerateForm, ArenaForm, etc.
 */
export function AdvancedSettings({
  adapterType,
  params,
  onChange,
  hasReferenceImage = false,
  disabled = false,
}: AdvancedSettingsProps) {
  const t = useTranslations('AdvancedSettings')
  const config = getCapabilityConfig(adapterType)
  const has = (cap: Parameters<typeof hasCapability>[1]) =>
    hasCapability(adapterType, cap)

  // Only show panel if adapter has user-configurable capabilities (not just imageAnalysis)
  const USER_CONFIGURABLE: ProviderCapability[] = [
    'negativePrompt',
    'guidanceScale',
    'steps',
    'seed',
    'referenceStrength',
    'quality',
    'background',
    'style',
  ]
  const hasConfigurableCapability = config.capabilities.some((cap) =>
    USER_CONFIGURABLE.includes(cap),
  )
  if (!hasConfigurableCapability) return null

  const update = (patch: Partial<AdvancedParams>) =>
    onChange({ ...params, ...patch })

  return (
    <CollapsiblePanel title={t('title')} description={t('description')}>
      <div className="space-y-5">
        {/* ─── Negative Prompt ─────────────────────────────── */}
        {has('negativePrompt') && (
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
        )}

        {/* ─── Guidance Scale (CFG) ───────────────────────── */}
        {has('guidanceScale') && config.guidanceScale && (
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
        )}

        {/* ─── Inference Steps ────────────────────────────── */}
        {has('steps') && config.steps && (
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
        )}

        {/* ─── Reference Image Strength ───────────────────── */}
        {has('referenceStrength') &&
          hasReferenceImage &&
          config.referenceStrength && (
            <ParamSlider
              label={t('referenceStrength')}
              hint={t('referenceStrengthHint')}
              value={
                params.referenceStrength ?? config.referenceStrength.default
              }
              onChange={(v) => update({ referenceStrength: v })}
              min={config.referenceStrength.min}
              max={config.referenceStrength.max}
              step={config.referenceStrength.step}
              disabled={disabled}
              formatValue={(v) => `${Math.round(v * 100)}%`}
            />
          )}

        {/* ─── Seed ───────────────────────────────────────── */}
        {has('seed') && (
          <SeedInput
            label={t('seed')}
            hint={t('seedHint')}
            value={params.seed}
            onChange={(v) => update({ seed: v })}
            randomLabel={t('seedRandom')}
            disabled={disabled}
          />
        )}

        {/* ─── OpenAI: Quality ────────────────────────────── */}
        {has('quality') && config.qualityOptions && (
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
              onChange={(v) => update({ quality: v })}
              disabled={disabled}
            />
          </div>
        )}

        {/* ─── OpenAI: Background ─────────────────────────── */}
        {has('background') && config.backgroundOptions && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground">
              {t('background')}
            </span>
            <p className="text-xs text-muted-foreground">
              {t('backgroundHint')}
            </p>
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
        )}

        {/* ─── OpenAI: Style ──────────────────────────────── */}
        {has('style') && config.styleOptions && (
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
        )}
      </div>
    </CollapsiblePanel>
  )
}
