'use client'

import { useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'

import type { StudioModelOption } from '@/components/business/ModelSelector'
import { BaseModelPickerPanel } from '@/components/business/studio-shared/pickers'
import {
  NODE_MEDIA_KIND_IDS,
  type NodeWorkflowMediaKind,
} from '@/constants/node-types'
import { cn } from '@/lib/utils'
import type {
  NodeWorkflowModelOption,
  NodeWorkflowModelSelection,
} from '@/types/node-workflow'

type WorkflowModelPickerKind = Exclude<
  NodeWorkflowMediaKind,
  typeof NODE_MEDIA_KIND_IDS.text
>

interface WorkflowModelPickerProps {
  value: NodeWorkflowModelSelection | undefined
  options: NodeWorkflowModelOption[]
  onChange(value: NodeWorkflowModelSelection): void
  /**
   * Called when the user clicks a model that needs an API key (no saved key,
   * not freeTier). Parent should open QuickSetupDialog. Falls back to a no-op
   * if the parent doesn't wire it.
   */
  onClickLocked?(option: NodeWorkflowModelOption): void
  kind?: NodeWorkflowMediaKind
  className?: string
}

function normalizePickerKind(
  kind: NodeWorkflowMediaKind | undefined,
): WorkflowModelPickerKind {
  switch (kind) {
    case NODE_MEDIA_KIND_IDS.video:
    case NODE_MEDIA_KIND_IDS.audio:
      return kind
    default:
      return NODE_MEDIA_KIND_IDS.image
  }
}

function toStudioOption(option: NodeWorkflowModelOption): StudioModelOption {
  return {
    optionId: option.optionId,
    modelId: option.modelId,
    adapterType: option.adapterType,
    providerConfig: option.providerConfig,
    requestCount: option.requestCount,
    isBuiltIn: option.sourceType === 'workspace',
    freeTier: option.freeTier,
    sourceType: option.sourceType,
    keyId: option.apiKeyId,
    keyLabel: option.keyLabel,
    maskedKey: option.maskedKey,
  }
}

/**
 * Thin wrapper around BaseModelPickerPanel for Node-canvas media node
 * inspectors (T10, spec §6 Step 7). Parent inspectors curate which
 * NodeWorkflowModelOption[] to show (per node type via
 * modelOptionsByType), so we keep the `options` prop instead of routing
 * through CanvasRoutePicker variant="media" / MainModelPicker — those
 * delegate to use{Image,Video,Audio}ModelOptions hooks, which would
 * ignore the parent's curation.
 *
 * Behavior:
 *   - options: NodeWorkflowModelOption[] → StudioModelOption[] via
 *     toStudioOption (rename apiKeyId → keyId; flip sourceType to
 *     isBuiltIn for the workspace-vs-saved bucketing in
 *     useSplitModelOptions)
 *   - onChange: StudioModelOption → NodeWorkflowModelSelection
 *   - onRequestSetup → onClickLocked (with original
 *     NodeWorkflowModelOption preserved via lookup by optionId)
 *
 * Cutover commit T10; legacy props interface intact.
 */
export function WorkflowModelPicker({
  value,
  options,
  onChange,
  onClickLocked,
  kind,
  className,
}: WorkflowModelPickerProps) {
  const t = useTranslations('StudioNode.workflowModelPicker')
  const pickerKind = normalizePickerKind(kind)

  const studioOptions = useMemo(() => options.map(toStudioOption), [options])

  const handleSelect = useCallback(
    (studioOption: StudioModelOption) => {
      const original = options.find((o) => o.optionId === studioOption.optionId)
      if (!original) return
      onChange({
        optionId: original.optionId,
        modelId: original.modelId,
        adapterType: original.adapterType,
        providerConfig: original.providerConfig,
        apiKeyId: original.apiKeyId,
      })
    },
    [options, onChange],
  )

  const handleRequestSetup = useCallback(
    (studioOption: StudioModelOption) => {
      const original = options.find((o) => o.optionId === studioOption.optionId)
      if (!original || !onClickLocked) return
      onClickLocked(original)
    },
    [options, onClickLocked],
  )

  return (
    <BaseModelPickerPanel
      options={studioOptions}
      value={value?.optionId ?? null}
      onChange={handleSelect}
      onRequestSetup={handleRequestSetup}
      triggerEmptyLabel={t(`labels.${pickerKind}`)}
      searchPlaceholder={t('searchPlaceholder')}
      emptySearchText={t(`noOptions.${pickerKind}`)}
      size="compact"
      className={cn(className)}
    />
  )
}
