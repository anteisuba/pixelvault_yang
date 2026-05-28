'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'

import type { StudioModelOption } from '@/components/business/ModelSelector'
import { CanvasRoutePicker } from '@/components/business/studio-shared/pickers'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  SCRIPT_BREAKDOWN_QUICK_SETUP_OPTION_PREFIX,
  SCRIPT_PLANNER_MODEL_OPTIONS,
  SCRIPT_PLANNER_PROVIDER_IDS,
  type ScriptPlannerConcreteProvider,
} from '@/constants/script-breakdown'

export interface NodePlannerRouteSelection {
  optionId: string
  plannerProvider: ScriptPlannerConcreteProvider
  apiKeyId: string
}

interface CanvasPlannerRouteSelectorProps {
  value: NodePlannerRouteSelection | null
  onChange: (value: NodePlannerRouteSelection) => void
  className?: string
}

export function getPlannerKeyOptionId(keyId: string): string {
  return `${SCRIPT_BREAKDOWN_QUICK_SETUP_OPTION_PREFIX}:key:${keyId}`
}

function getPlannerProviderForAdapter(
  adapterType: AI_ADAPTER_TYPES,
): ScriptPlannerConcreteProvider | null {
  switch (adapterType) {
    case AI_ADAPTER_TYPES.GEMINI:
      return SCRIPT_PLANNER_PROVIDER_IDS.gemini
    case AI_ADAPTER_TYPES.DEEPSEEK:
      return SCRIPT_PLANNER_PROVIDER_IDS.deepseek
    case AI_ADAPTER_TYPES.OPENAI:
      return SCRIPT_PLANNER_PROVIDER_IDS.openai
    default:
      return null
  }
}

function getPlannerSetupLabelKey(
  adapterType: AI_ADAPTER_TYPES,
): 'setupChatGpt' | 'setupDeepSeek' | 'setupGemini' {
  switch (adapterType) {
    case AI_ADAPTER_TYPES.OPENAI:
      return 'setupChatGpt'
    case AI_ADAPTER_TYPES.DEEPSEEK:
      return 'setupDeepSeek'
    default:
      return 'setupGemini'
  }
}

interface QuickSetupState {
  open: boolean
  modelId: string
  modelLabel: string
  adapterType: AI_ADAPTER_TYPES
  optionId: string
}

/**
 * Thin wrapper that adapts the new shared CanvasRoutePicker (T9) to the
 * legacy NodePlannerRouteSelection contract used by Composer + Agent
 * inspectors. The wrapper:
 *   - maps NodePlannerRouteSelection.apiKeyId → CanvasRoutePicker.value
 *     using useLLMRoutePicker's `llm-route:planner:key:${keyId}` format
 *   - converts CanvasRoutePicker.onChange(StudioModelOption) back into
 *     NodePlannerRouteSelection (legacy optionId via getPlannerKeyOptionId
 *     stays byte-equivalent so existing node.data stays usable)
 *   - owns the QuickSetupDialog locally (same as pre-T10) — onRequestSetup
 *     and onVerified wire the saved route auto-selection
 *
 * Cutover commit T10 (spec §6 Step 7); wrapper is the soak-window
 * surface, deletion ≥7 days later at T13 per plan-eng-review D7.
 */
export function CanvasPlannerRouteSelector({
  value,
  onChange,
  className,
}: CanvasPlannerRouteSelectorProps) {
  const t = useTranslations('StudioNode.plannerRoute')
  const [quickSetup, setQuickSetup] = useState<QuickSetupState>({
    open: false,
    modelId: '',
    modelLabel: '',
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    optionId: '',
  })

  const handleSelect = useCallback(
    (option: StudioModelOption) => {
      const plannerProvider = getPlannerProviderForAdapter(option.adapterType)
      if (!plannerProvider || !option.keyId) return
      onChange({
        optionId: getPlannerKeyOptionId(option.keyId),
        plannerProvider,
        apiKeyId: option.keyId,
      })
    },
    [onChange],
  )

  const handleRequestSetup = useCallback(
    (option: StudioModelOption) => {
      setQuickSetup({
        open: true,
        modelId: option.modelId,
        modelLabel: t(getPlannerSetupLabelKey(option.adapterType)),
        adapterType: option.adapterType,
        optionId: option.optionId,
      })
    },
    [t],
  )

  const handleQuickSetupOpenChange = useCallback((nextOpen: boolean) => {
    setQuickSetup((current) => ({ ...current, open: nextOpen }))
  }, [])

  const handleQuickSetupVerified = useCallback(
    (modelId: string, keyId: string) => {
      const plannerModel = SCRIPT_PLANNER_MODEL_OPTIONS.find(
        (option) => option.modelId === modelId,
      )
      if (!plannerModel) return
      onChange({
        optionId: getPlannerKeyOptionId(keyId),
        plannerProvider: plannerModel.provider,
        apiKeyId: keyId,
      })
    },
    [onChange],
  )

  return (
    <>
      <CanvasRoutePicker
        variant="planner"
        value={value ? `llm-route:planner:key:${value.apiKeyId}` : null}
        onChange={handleSelect}
        onRequestSetup={handleRequestSetup}
        triggerLabel={t('fieldLabel')}
        badge={{ text: t('scopeLabel'), tone: 'amber' }}
        noticeDescription={t('scopeDescription')}
        addKeyLabel={t('addKey')}
        emptyLabel={t('triggerLabel')}
        className={className}
      />

      <QuickSetupDialog
        open={quickSetup.open}
        onOpenChange={handleQuickSetupOpenChange}
        modelId={quickSetup.modelId}
        modelLabel={quickSetup.modelLabel}
        adapterType={quickSetup.adapterType}
        optionId={quickSetup.optionId}
        onVerified={handleQuickSetupVerified}
      />
    </>
  )
}
