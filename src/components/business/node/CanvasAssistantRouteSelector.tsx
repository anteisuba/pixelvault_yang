'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'

import type { StudioModelOption } from '@/components/business/ModelSelector'
import { CanvasRoutePicker } from '@/components/business/studio-shared/pickers'
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
 * legacy NodeAssistantRouteSelection contract used by the assistant
 * dock. The wrapper:
 *   - exposes the "auto route" (no apiKeyId) via CanvasRoutePicker's
 *     topOption slot — preserves pre-T10 behavior where the Auto entry
 *     sits above the saved-key list
 *   - maps NodeAssistantRouteSelection.apiKeyId →
 *     `llm-route:assistant:key:${keyId}` for CanvasRoutePicker.value
 *   - converts StudioModelOption back into NodeAssistantRouteSelection
 *     using legacy getAssistantRouteKeyOptionId — keeps node.data
 *     plannerRouteOptionId byte-equivalent
 *   - owns the QuickSetupDialog locally (unchanged behavior)
 *
 * Cutover commit T10 (spec §6 Step 7).
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

  const handleSelectAuto = useCallback(() => {
    onChange({ optionId: NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS.auto })
  }, [onChange])

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
      <CanvasRoutePicker
        variant="assistant"
        value={
          value.apiKeyId ? `llm-route:assistant:key:${value.apiKeyId}` : null
        }
        onChange={handleSelect}
        onRequestSetup={handleRequestSetup}
        triggerLabel={t('fieldLabel')}
        badge={{ text: t('autoLabel'), tone: 'sky' }}
        noticeDescription={t('autoDescription')}
        addKeyLabel={t('addKey')}
        emptyLabel={t('triggerLabel')}
        topOption={{
          label: t('autoLabel'),
          description: t('autoDescription'),
          isSelected: !value.apiKeyId,
          onSelect: handleSelectAuto,
        }}
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
