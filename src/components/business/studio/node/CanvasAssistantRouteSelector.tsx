'use client'

import { useCallback, useMemo, useState } from 'react'
import { Bot, Check, ChevronDown, KeyRound, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_STUDIO_ASSISTANT_ROUTE_MODELS,
  NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS,
} from '@/constants/node-studio'
import { AI_ADAPTER_TYPES, getProviderLabel } from '@/constants/providers'
import type { ApiKeyHealthStatus, UserApiKeyRecord } from '@/types'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface NodeAssistantRouteSelection {
  optionId: string
  apiKeyId?: string
}

interface CanvasAssistantRouteSelectorProps {
  value: NodeAssistantRouteSelection
  onChange(value: NodeAssistantRouteSelection): void
}

interface SavedAssistantRouteOption extends NodeAssistantRouteSelection {
  apiKeyId: string
  routeLabel: string
  providerLabel: string
  modelLabel: string
  maskedKey: string
}

interface SetupAssistantRouteOption {
  optionId: string
  adapterType: AI_ADAPTER_TYPES
  modelId: string
  modelLabel: string
}

interface QuickSetupState extends SetupAssistantRouteOption {
  open: boolean
}

export function getAssistantRouteKeyOptionId(keyId: string): string {
  return `${NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS.keyPrefix}:${keyId}`
}

function getAssistantRouteSetupOptionId(modelId: string): string {
  return `${NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS.setupPrefix}:${modelId}`
}

function getAssistantRouteModel(
  adapterType: AI_ADAPTER_TYPES,
): (typeof NODE_STUDIO_ASSISTANT_ROUTE_MODELS)[number] | undefined {
  return NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
    (option) => option.adapterType === adapterType,
  )
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

function getHealthDotClass(status: ApiKeyHealthStatus | undefined): string {
  switch (status) {
    case 'available':
      return 'bg-emerald-400'
    case 'no_key':
      return 'bg-amber-400'
    case 'failed':
      return 'bg-red-400'
    case 'unknown':
      return 'bg-node-muted/45'
    default:
      return 'bg-transparent'
  }
}

function getHealthLabelKey(
  status: ApiKeyHealthStatus | undefined,
): 'available' | 'failed' | 'noKey' | 'unknown' | null {
  switch (status) {
    case 'available':
      return 'available'
    case 'failed':
      return 'failed'
    case 'no_key':
      return 'noKey'
    case 'unknown':
      return 'unknown'
    default:
      return null
  }
}

function toSavedRouteOption(
  key: UserApiKeyRecord,
): SavedAssistantRouteOption | null {
  const model = getAssistantRouteModel(key.adapterType)
  if (!model || !key.isActive) {
    return null
  }

  return {
    optionId: getAssistantRouteKeyOptionId(key.id),
    apiKeyId: key.id,
    routeLabel: key.label,
    providerLabel: getProviderLabel(key.providerConfig),
    modelLabel: model.label,
    maskedKey: key.maskedKey,
  }
}

export function CanvasAssistantRouteSelector({
  value,
  onChange,
}: CanvasAssistantRouteSelectorProps) {
  const t = useTranslations('StudioNode.assistantRoute')
  const tApiKeys = useTranslations('StudioApiKeys')
  const { keys, healthMap, isLoading } = useApiKeysContext()
  const [open, setOpen] = useState(false)
  const [quickSetup, setQuickSetup] = useState<QuickSetupState>({
    open: false,
    optionId: '',
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    modelId: '',
    modelLabel: '',
  })

  const savedRoutes = useMemo(
    () =>
      keys
        .map(toSavedRouteOption)
        .filter((option): option is SavedAssistantRouteOption =>
          Boolean(option),
        ),
    [keys],
  )

  const setupRoutes = useMemo<SetupAssistantRouteOption[]>(
    () =>
      NODE_STUDIO_ASSISTANT_ROUTE_MODELS.map((option) => ({
        optionId: getAssistantRouteSetupOptionId(option.modelId),
        adapterType: option.adapterType,
        modelId: option.modelId,
        modelLabel: option.label,
      })),
    [],
  )

  const selectedSavedRoute = value.apiKeyId
    ? savedRoutes.find((option) => option.apiKeyId === value.apiKeyId)
    : undefined
  const selectedHealthStatus = selectedSavedRoute
    ? healthMap[selectedSavedRoute.apiKeyId]
    : undefined
  const selectedLabel = selectedSavedRoute
    ? t('savedTrigger', {
        provider: selectedSavedRoute.providerLabel,
        key: selectedSavedRoute.maskedKey,
      })
    : t('autoLabel')

  const handleSelectAuto = useCallback(() => {
    onChange({
      optionId: NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS.auto,
    })
    setOpen(false)
  }, [onChange])

  const handleSelectSavedRoute = useCallback(
    (option: SavedAssistantRouteOption) => {
      onChange({
        optionId: option.optionId,
        apiKeyId: option.apiKeyId,
      })
      setOpen(false)
    },
    [onChange],
  )

  const handleOpenQuickSetup = useCallback(
    (option: SetupAssistantRouteOption) => {
      setQuickSetup({
        ...option,
        open: true,
      })
      setOpen(false)
    },
    [],
  )

  const handleQuickSetupOpenChange = useCallback((nextOpen: boolean) => {
    setQuickSetup((current) => ({
      ...current,
      open: nextOpen,
    }))
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
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('triggerLabel')}
            aria-expanded={open}
            className="group flex h-8 max-w-24 items-center gap-1 rounded-2xl px-1.5 text-xs text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-node-amber/35 sm:max-w-40 sm:gap-1.5 sm:px-2"
          >
            <span className="relative flex size-4 shrink-0 items-center justify-center">
              <Bot className="size-3.5 text-node-amber" />
              {selectedSavedRoute ? (
                <span
                  className={cn(
                    'absolute -right-0.5 top-0 size-1.5 rounded-full ring-1 ring-node-panel',
                    getHealthDotClass(selectedHealthStatus),
                  )}
                />
              ) : null}
            </span>
            <span className="hidden min-w-0 truncate sm:inline">
              {selectedLabel}
            </span>
            <ChevronDown
              className={cn(
                'size-3 shrink-0 transition-transform',
                open && 'rotate-180',
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="w-80 overflow-hidden rounded-2xl border-node-panel-inner bg-node-panel/96 p-0 text-node-foreground shadow-node-panel backdrop-blur-xl"
        >
          <div className="border-b border-node-panel-inner px-4 py-3">
            <p className="text-sm font-semibold text-node-foreground">
              {t('title')}
            </p>
            <p className="mt-1 text-xs leading-5 text-node-muted">
              {t('description')}
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            <button
              type="button"
              onClick={handleSelectAuto}
              className={cn(
                'group relative flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                !value.apiKeyId
                  ? 'border-node-amber/25 bg-node-panel-soft'
                  : 'border-transparent bg-node-panel hover:border-node-panel-inner hover:bg-node-panel-inner',
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-node-panel-inner text-node-amber">
                <Bot className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-node-foreground">
                  {t('autoLabel')}
                </span>
                <span className="mt-0.5 block truncate text-xs text-node-muted">
                  {t('autoDescription')}
                </span>
              </span>
              {!value.apiKeyId ? (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-lime-500/15 text-lime-300">
                  <Check className="size-3.5" />
                </span>
              ) : null}
            </button>

            <div className="mt-2 space-y-1">
              <p className="px-2 py-1 text-2xs font-semibold text-node-muted">
                {t('configured')}
              </p>
              {isLoading ? (
                <div className="rounded-xl px-3 py-2 text-xs text-node-muted">
                  {tApiKeys('loading')}
                </div>
              ) : null}
              {!isLoading && savedRoutes.length === 0 ? (
                <div className="rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 py-3 text-xs leading-5 text-node-muted">
                  {t('emptyConfigured')}
                </div>
              ) : null}
              {savedRoutes.map((option) => {
                const isSelected = option.apiKeyId === value.apiKeyId
                const healthStatus = healthMap[option.apiKeyId]
                const healthLabelKey = getHealthLabelKey(healthStatus)

                return (
                  <button
                    key={option.optionId}
                    type="button"
                    onClick={() => handleSelectSavedRoute(option)}
                    className={cn(
                      'group relative flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                      isSelected
                        ? 'border-node-amber/25 bg-node-panel-soft'
                        : 'border-transparent bg-node-panel hover:border-node-panel-inner hover:bg-node-panel-inner',
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-node-panel-inner text-node-muted transition-colors group-hover:text-node-foreground">
                      <KeyRound className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-node-foreground">
                        {option.routeLabel}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-node-muted">
                        {healthLabelKey ? (
                          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                            <span
                              className={cn(
                                'size-1.5 rounded-full',
                                getHealthDotClass(healthStatus),
                              )}
                            />
                            {tApiKeys(`health.${healthLabelKey}`)}
                          </span>
                        ) : null}
                        <span className="min-w-0 truncate">
                          {t('savedMeta', {
                            provider: option.providerLabel,
                            key: option.maskedKey,
                          })}
                        </span>
                      </span>
                    </span>
                    {isSelected ? (
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-lime-500/15 text-lime-300">
                        <Check className="size-3.5" />
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            <div className="mt-2 border-t border-node-panel-inner pt-2">
              <p className="px-2 py-1 text-2xs font-semibold text-node-muted">
                {t('addKey')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {setupRoutes.map((option) => (
                  <button
                    key={option.optionId}
                    type="button"
                    onClick={() => handleOpenQuickSetup(option)}
                    className="group flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-node-panel-inner bg-node-panel-soft px-2 py-2 text-center transition-colors hover:border-node-amber/35 hover:bg-node-panel-inner"
                  >
                    <Plus className="size-4 text-node-amber" />
                    <span className="max-w-full truncate text-2xs font-semibold text-node-foreground">
                      {t(getSetupLabelKey(option.adapterType))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

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
