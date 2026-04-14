'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getCapabilityConfig,
  hasCapability,
  type ProviderCapability,
} from '@/constants/provider-capabilities'
import type { AdvancedParams } from '@/types'

import { Button } from '@/components/ui/button'
import { CollapsiblePanel } from '@/components/ui/collapsible-panel'
import { Input } from '@/components/ui/input'
import { OptionGroup } from '@/components/ui/option-group'
import { ParamSlider } from '@/components/ui/param-slider'
import { SeedInput } from '@/components/ui/seed-input'
import { Textarea } from '@/components/ui/textarea'

interface AdvancedSettingsProps {
  adapterType: AI_ADAPTER_TYPES
  /** Optional model ID for per-model capability overrides */
  modelId?: string
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
  modelId,
  params,
  onChange,
  hasReferenceImage = false,
  disabled = false,
}: AdvancedSettingsProps) {
  const t = useTranslations('AdvancedSettings')
  const config = getCapabilityConfig(adapterType, modelId)
  const has = (cap: Parameters<typeof hasCapability>[1]) =>
    hasCapability(adapterType, cap, modelId)
  const [techOpen, setTechOpen] = useState(false)

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
    'lora',
  ]
  const hasConfigurableCapability = config.capabilities.some((cap) =>
    USER_CONFIGURABLE.includes(cap),
  )
  if (!hasConfigurableCapability) {
    return (
      <p className="text-xs text-muted-foreground text-center py-2">
        {t('noConfigurable')}
      </p>
    )
  }

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

        {/* ─── Technical Parameters (collapsed by default) ── */}
        {(has('guidanceScale') || has('steps')) && (
          <div className="border-t border-border/40 pt-3">
            <button
              type="button"
              onClick={() => setTechOpen((p) => !p)}
              className="flex w-full items-center justify-between text-xs text-muted-foreground"
            >
              <span>{t('technicalParams')}</span>
              <ChevronDown
                className={cn(
                  'size-3.5 transition-transform duration-300 ease-out',
                  techOpen && 'rotate-180',
                )}
              />
            </button>
            <div
              className={cn(
                'grid transition-[grid-template-rows] duration-300 ease-out',
                techOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              )}
            >
              <div className="overflow-hidden">
                <div className="space-y-5 pt-4">
                  {has('guidanceScale') && config.guidanceScale && (
                    <ParamSlider
                      label={t('guidanceScale')}
                      hint={t('guidanceScaleHint')}
                      value={
                        params.guidanceScale ?? config.guidanceScale.default
                      }
                      onChange={(v) => update({ guidanceScale: v })}
                      min={config.guidanceScale.min}
                      max={config.guidanceScale.max}
                      step={config.guidanceScale.step}
                      disabled={disabled}
                    />
                  )}
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
                </div>
              </div>
            </div>
          </div>
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
              onChange={(v) =>
                update({
                  quality: v as 'auto' | 'low' | 'medium' | 'high',
                })
              }
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

        {/* ─── LoRA Models ─────────────────────────────────── */}
        {has('lora') && (
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
                      updated[index] = {
                        ...updated[index],
                        url: e.target.value,
                      }
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
                      update({
                        loras: updated.length > 0 ? updated : undefined,
                      })
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
        )}
      </div>
    </CollapsiblePanel>
  )
}
