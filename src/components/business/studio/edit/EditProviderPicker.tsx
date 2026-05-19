'use client'

import { Check, ChevronDown, Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  EDIT_MODELS,
  getEditTaskMeta,
  type EditModelOption,
  type EditTaskProvider,
} from '@/constants/edit-tasks'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import type { EditTaskKind } from '@/contexts/image-edit-context'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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

function isProviderUnlocked(
  provider: EditTaskProvider,
  hasUserKey: (adapter: AI_ADAPTER_TYPES) => boolean,
): boolean {
  // fal has a platform fallback in resolveEditApiKey so its picker entries
  // never require BYOK. Gemini/OpenAI must show a lock until a user key
  // exists for that adapter.
  if (provider === 'fal') return true
  return hasUserKey(PROVIDER_ADAPTER[provider])
}

/**
 * Provider/model picker rendered above each task's tools. Phase 4 lights the
 * dropdown up with Gemini + GPT entries; entries whose adapter the user hasn't
 * configured show a lock icon and route to a setup flow instead of selecting.
 */
export function EditProviderPicker({
  task,
  value,
  onChange,
  disabled,
  onRequestSetup,
}: EditProviderPickerProps) {
  const t = useTranslations('StudioImageEdit')
  const { keys } = useApiKeysContext()
  const meta = getEditTaskMeta(task)
  const models = meta?.models ?? []
  const current = EDIT_MODELS[value] ?? EDIT_MODELS[models[0] ?? '']

  const hasUserKey = (adapter: AI_ADAPTER_TYPES) =>
    keys.some((k) => k.adapterType === adapter && k.isActive)

  const handleSelect = (option: EditModelOption) => {
    if (isProviderUnlocked(option.provider, hasUserKey)) {
      onChange(option.id)
      return
    }
    onRequestSetup?.({
      modelId: option.id,
      modelLabel: option.displayName,
      adapterType: PROVIDER_ADAPTER[option.provider],
    })
  }

  if (!current) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
        {t('picker.noModelsYet')}
      </div>
    )
  }

  if (models.length <= 1) {
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-between gap-2 rounded-lg"
          disabled={disabled}
        >
          <span className="inline-flex items-center gap-2 text-xs">
            <span className="font-medium text-foreground">
              {current.displayName}
            </span>
            <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {PROVIDER_LABEL[current.provider]}
            </span>
          </span>
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {models.map((modelId) => {
          const option = EDIT_MODELS[modelId]
          if (!option) return null
          const isActive = modelId === value
          const unlocked = isProviderUnlocked(option.provider, hasUserKey)
          return (
            <DropdownMenuItem
              key={modelId}
              onSelect={() => handleSelect(option)}
              className="flex items-center justify-between gap-3"
            >
              <span className="inline-flex items-center gap-2">
                <span className="text-sm font-medium">
                  {option.displayName}
                </span>
                <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {PROVIDER_LABEL[option.provider]}
                </span>
                {!unlocked ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-300">
                    <Lock className="size-3" />
                    {t('picker.needsKey')}
                  </span>
                ) : null}
              </span>
              <Check
                className={cn(
                  'size-4 text-primary',
                  isActive ? 'opacity-100' : 'opacity-0',
                )}
              />
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
