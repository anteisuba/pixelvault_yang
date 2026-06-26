'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'

import type { StudioModelOption } from '@/components/business/ModelSelector'
import { MainModelPicker } from '@/components/business/studio-shared/pickers'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS } from '@/constants/node-studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

export interface NodeAssistantRouteSelection {
  optionId: string
  apiKeyId?: string
}

interface CanvasAssistantRouteSelectorProps {
  value: NodeAssistantRouteSelection
  onChange(value: NodeAssistantRouteSelection): void
}

export function getAssistantRouteKeyOptionId(keyId: string): string {
  return `${NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS.keyPrefix}:${keyId}`
}

function getSetupLabelKey(
  adapterType: AI_ADAPTER_TYPES,
): 'setupChatGpt' | 'setupDeepSeek' | 'setupGemini' | 'setupQwen' {
  switch (adapterType) {
    case AI_ADAPTER_TYPES.OPENAI:
      return 'setupChatGpt'
    case AI_ADAPTER_TYPES.DEEPSEEK:
      return 'setupDeepSeek'
    case AI_ADAPTER_TYPES.DASHSCOPE:
      return 'setupQwen'
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
 * Adapts the shared two-step MainModelPicker (厂商 → 模型 — the same picker the
 * canvas image/video/audio nodes use) to the NodeAssistantRouteSelection
 * contract. `modality="llm_assist"` + `llmCapability="assistant"` feeds the
 * assistant-scoped LLM text routes (NODE_STUDIO_ASSISTANT_ROUTE_MODELS) through
 * the picker, so the script selector matches the media pickers exactly — only
 * the model set differs.
 *
 * No "auto route" entry: selection is always an explicit 厂商 → 模型 pick
 * (parity with the image picker). Leaving the picker untouched keeps apiKeyId
 * undefined, which the assistant service still resolves via its own
 * gateway/platform fallback — so zero-config sending is unaffected.
 *
 * The wrapper:
 *   - maps NodeAssistantRouteSelection.apiKeyId →
 *     `llm-route:assistant:key:${keyId}` for the picker value
 *   - converts the picked StudioModelOption back into
 *     NodeAssistantRouteSelection via getAssistantRouteKeyOptionId
 *   - routes needs-key providers to the locally-owned QuickSetupDialog
 */
export function CanvasAssistantRouteSelector({
  value,
  onChange,
}: CanvasAssistantRouteSelectorProps) {
  const t = useTranslations('StudioNode.assistantRoute')
  const [quickSetup, setQuickSetup] = useState<QuickSetupState>({
    open: false,
    optionId: '',
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    modelId: '',
    modelLabel: '',
  })

  const handleSelect = useCallback(
    (option: StudioModelOption) => {
      if (!option.keyId) return
      onChange({
        optionId: getAssistantRouteKeyOptionId(option.keyId),
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
        modelLabel: t(getSetupLabelKey(option.adapterType)),
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
    (_modelId: string, keyId: string) => {
      onChange({
        optionId: getAssistantRouteKeyOptionId(keyId),
        apiKeyId: keyId,
      })
    },
    [onChange],
  )

  return (
    <>
      <MainModelPicker
        modality="llm_assist"
        llmCapability="assistant"
        value={
          value.apiKeyId ? `llm-route:assistant:key:${value.apiKeyId}` : null
        }
        onChange={handleSelect}
        onRequestSetup={handleRequestSetup}
        triggerEmptyLabel={t('fieldLabel')}
        size="compact"
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
