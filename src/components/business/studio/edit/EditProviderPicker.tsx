'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

import type { StudioModelOption } from '@/components/business/ModelSelector'
import { BaseModelPickerPanel } from '@/components/business/studio-shared/pickers'
import {
  EDIT_MODELS,
  getEditTaskMeta,
  type EditModelOption,
  type EditTaskProvider,
} from '@/constants/edit-tasks'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import type { EditTaskKind } from '@/contexts/image-edit-context'

const PROVIDER_LABEL: Record<EditTaskProvider, string> = {
  fal: 'Fal',
  gemini: 'Gemini',
  openai: 'GPT',
}

const PROVIDER_ADAPTER: Record<EditTaskProvider, AI_ADAPTER_TYPES> = {
  fal: AI_ADAPTER_TYPES.FAL,
  gemini: AI_ADAPTER_TYPES.GEMINI,
  openai: AI_ADAPTER_TYPES.OPENAI,
}

interface EditProviderPickerProps {
  task: EditTaskKind
  value: string
  onChange: (modelId: string) => void
  disabled?: boolean
  /**
   * Invoked when the user clicks a model whose provider is BYOK-only and they
   * haven't configured a key yet. The picker doesn't switch the selection in
   * that case — it just signals upward so the host page can open the setup
   * dialog. fal models never trigger this (they have a platform fallback).
   */
  onRequestSetup?: (request: {
    modelId: string
    modelLabel: string
    adapterType: AI_ADAPTER_TYPES
  }) => void
}

function toPickerOption(
  modelOpt: EditModelOption,
  hasUserKey: boolean,
  userKey?: { id: string; label: string; maskedKey: string },
): StudioModelOption {
  const adapter = PROVIDER_ADAPTER[modelOpt.provider]
  const providerConfig = {
    label: PROVIDER_LABEL[modelOpt.provider],
    baseUrl: '',
  }
  if (modelOpt.provider === 'fal') {
    return {
      optionId: modelOpt.id,
      modelId: modelOpt.id,
      adapterType: adapter,
      providerConfig,
      requestCount: 0,
      isBuiltIn: false,
      freeTier: true,
      sourceType: 'workspace',
    }
  }
  if (hasUserKey && userKey) {
    return {
      optionId: modelOpt.id,
      modelId: modelOpt.id,
      adapterType: adapter,
      providerConfig,
      requestCount: 0,
      isBuiltIn: false,
      sourceType: 'saved',
      keyId: userKey.id,
      keyLabel: userKey.label,
      maskedKey: userKey.maskedKey,
    }
  }
  return {
    optionId: modelOpt.id,
    modelId: modelOpt.id,
    adapterType: adapter,
    providerConfig,
    requestCount: 0,
    isBuiltIn: false,
    freeTier: false,
    sourceType: 'workspace',
  }
}

/**
 * Provider/model picker rendered above each task's tools. Uses the shared
 * BaseModelPickerPanel so visual + grouping behavior stays consistent with
 * the rest of the picker family (T7 of picker-unification spec).
 */
export function EditProviderPicker({
  task,
  value,
  onChange,
  disabled,
  onRequestSetup,
}: EditProviderPickerProps) {
  const t = useTranslations('StudioImageEdit')
  const tForm = useTranslations('StudioForm')
  const { keys } = useApiKeysContext()
  const meta = getEditTaskMeta(task)
  const taskModelIds = useMemo(() => meta?.models ?? [], [meta])
  const current = EDIT_MODELS[value] ?? EDIT_MODELS[taskModelIds[0] ?? '']

  const options = useMemo<StudioModelOption[]>(() => {
    const result: StudioModelOption[] = []
    for (const modelId of taskModelIds) {
      const modelOpt = EDIT_MODELS[modelId]
      if (!modelOpt) continue
      const adapter = PROVIDER_ADAPTER[modelOpt.provider]
      const userKey = keys.find((k) => k.adapterType === adapter && k.isActive)
      result.push(toPickerOption(modelOpt, Boolean(userKey), userKey))
    }
    return result
  }, [taskModelIds, keys])

  const labelForOption = (option: StudioModelOption): string => {
    const modelOpt = EDIT_MODELS[option.modelId]
    return modelOpt?.displayName ?? option.modelId
  }

  if (!current) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
        {t('picker.noModelsYet')}
      </div>
    )
  }

  if (taskModelIds.length <= 1) {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-xs">
        <span className="font-medium text-foreground">
          {current.displayName}
        </span>
        <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {PROVIDER_LABEL[current.provider]}
        </span>
      </div>
    )
  }

  return (
    <BaseModelPickerPanel
      options={options}
      value={value}
      onChange={(option) => onChange(option.modelId)}
      onRequestSetup={(option) =>
        onRequestSetup?.({
          modelId: option.modelId,
          modelLabel: labelForOption(option),
          adapterType: option.adapterType,
        })
      }
      labelForOption={labelForOption}
      triggerEmptyLabel={current.displayName}
      searchPlaceholder={tForm('modelSelector.searchPlaceholder')}
      emptySearchText={tForm('modelSelector.emptySearch')}
      disabled={disabled}
      size="compact"
    />
  )
}
