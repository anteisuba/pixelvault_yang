'use client'

import { useCallback, useMemo, useState } from 'react'
import { Check, ChevronDown, Plus, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AI_ADAPTER_TYPES, getProviderLabel } from '@/constants/providers'
import {
  SCRIPT_BREAKDOWN_QUICK_SETUP_OPTION_PREFIX,
  SCRIPT_PLANNER_MODEL_OPTIONS,
  SCRIPT_PLANNER_PROVIDER_IDS,
  type ScriptPlannerConcreteProvider,
} from '@/constants/script-breakdown'
import type { ApiKeyHealthStatus } from '@/types'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { QuickSetupDialog } from '@/components/business/studio/QuickSetupDialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

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

interface SavedPlannerRouteOption extends NodePlannerRouteSelection {
  routeLabel: string
  modelLabel: string
  providerLabel: string
  maskedKey: string
}

interface LockedPlannerRouteOption {
  optionId: string
  adapterType: AI_ADAPTER_TYPES
  modelId: string
  modelLabel: string
  providerLabel: string
}

interface QuickSetupState {
  open: boolean
  modelId: string
  modelLabel: string
  adapterType: AI_ADAPTER_TYPES
  optionId: string
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

export function getPlannerKeyOptionId(keyId: string): string {
  return `${SCRIPT_BREAKDOWN_QUICK_SETUP_OPTION_PREFIX}:key:${keyId}`
}

function getPlannerSetupOptionId(modelId: string): string {
  return `${SCRIPT_BREAKDOWN_QUICK_SETUP_OPTION_PREFIX}:setup:${modelId}`
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

export function CanvasPlannerRouteSelector({
  value,
  onChange,
  className,
}: CanvasPlannerRouteSelectorProps) {
  const t = useTranslations('StudioNode.plannerRoute')
  const tApiKeys = useTranslations('StudioApiKeys')
  const { keys, healthMap, isLoading } = useApiKeysContext()
  const [open, setOpen] = useState(false)
  const [quickSetup, setQuickSetup] = useState<QuickSetupState>({
    open: false,
    modelId: '',
    modelLabel: '',
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    optionId: '',
  })

  const savedRoutes = useMemo<SavedPlannerRouteOption[]>(() => {
    const routes: SavedPlannerRouteOption[] = []

    for (const key of keys) {
      if (!key.isActive) {
        continue
      }

      const plannerProvider = getPlannerProviderForAdapter(key.adapterType)
      if (!plannerProvider) {
        continue
      }

      const plannerModel = SCRIPT_PLANNER_MODEL_OPTIONS.find(
        (option) => option.provider === plannerProvider,
      )
      if (!plannerModel) {
        continue
      }

      routes.push({
        optionId: getPlannerKeyOptionId(key.id),
        plannerProvider,
        apiKeyId: key.id,
        routeLabel: key.label,
        modelLabel: plannerModel.label,
        providerLabel: getProviderLabel(key.providerConfig),
        maskedKey: key.maskedKey,
      })
    }

    return routes
  }, [keys])

  const lockedRoutes = useMemo<LockedPlannerRouteOption[]>(
    () =>
      SCRIPT_PLANNER_MODEL_OPTIONS.map((option) => ({
        optionId: getPlannerSetupOptionId(option.modelId),
        adapterType: option.adapterType,
        modelId: option.modelId,
        modelLabel: option.label,
        providerLabel: option.label,
      })),
    [],
  )

  const selectedSavedRoute = value
    ? savedRoutes.find((option) => option.apiKeyId === value.apiKeyId)
    : undefined
  const selectedLabel = selectedSavedRoute
    ? t('savedMeta', {
        model: selectedSavedRoute.providerLabel,
        key: selectedSavedRoute.maskedKey,
      })
    : t('triggerLabel')
  const selectedHealthStatus = selectedSavedRoute
    ? healthMap[selectedSavedRoute.apiKeyId]
    : undefined

  const handleSelectSavedRoute = useCallback(
    (option: SavedPlannerRouteOption) => {
      onChange({
        optionId: option.optionId,
        plannerProvider: option.plannerProvider,
        apiKeyId: option.apiKeyId,
      })
      setOpen(false)
    },
    [onChange],
  )

  const handleOpenQuickSetup = useCallback(
    (option: LockedPlannerRouteOption, modelLabel: string) => {
      setQuickSetup({
        open: true,
        modelId: option.modelId,
        modelLabel,
        adapterType: option.adapterType,
        optionId: option.optionId,
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
    (modelId: string, keyId: string) => {
      const plannerModel = SCRIPT_PLANNER_MODEL_OPTIONS.find(
        (option) => option.modelId === modelId,
      )
      if (!plannerModel) {
        return
      }

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
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('triggerLabel')}
            aria-expanded={open}
            className={cn(
              'group flex h-11 w-full min-w-0 items-center gap-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 text-left text-node-muted shadow-none transition-colors hover:border-node-amber/40 hover:bg-node-panel-inner hover:text-node-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-node-amber/35 data-[state=open]:border-node-amber/70 data-[state=open]:bg-node-panel-inner',
              selectedSavedRoute && 'border-node-amber/70',
              className,
            )}
          >
            <span className="relative flex size-6 shrink-0 items-center justify-center text-node-amber">
              <Sparkles className="size-4 text-node-amber" />
              {selectedSavedRoute ? (
                <span
                  className={cn(
                    'absolute right-0 top-1 size-1.5 rounded-full ring-2 ring-node-panel-soft',
                    getHealthDotClass(selectedHealthStatus),
                  )}
                />
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-2xs font-medium leading-3 text-node-muted">
                {t('fieldLabel')}
              </span>
              <span className="block truncate text-xs font-semibold leading-4 text-node-foreground">
                {isLoading ? tApiKeys('triggerLoading') : selectedLabel}
              </span>
            </span>
            <ChevronDown
              className={cn(
                'size-3.5 shrink-0 transition-transform',
                open && 'rotate-180',
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-2xl border-node-panel-inner bg-node-panel/96 p-0 text-node-foreground shadow-node-panel backdrop-blur-xl"
        >
          <div className="border-b border-node-panel-inner px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-node-foreground">
                {t('fieldLabel')}
              </p>
              <span className="shrink-0 text-2xs font-semibold text-node-amber">
                {t('scopeLabel')}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-node-muted">
              {t('scopeDescription')}
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto overscroll-contain p-2">
            {isLoading ? (
              <div className="rounded-xl px-3 py-2 text-xs text-node-muted">
                {tApiKeys('loading')}
              </div>
            ) : null}

            {savedRoutes.length > 0 && (
              <div className="space-y-1">
                <p className="px-2 py-1 text-2xs font-semibold text-node-muted">
                  {t('configured')}
                </p>
                {savedRoutes.map((option) => {
                  const isSelected = option.apiKeyId === value?.apiKeyId
                  const healthStatus = healthMap[option.apiKeyId]
                  const healthLabelKey = getHealthLabelKey(healthStatus)

                  return (
                    <button
                      key={option.optionId}
                      type="button"
                      onClick={() => handleSelectSavedRoute(option)}
                      className={cn(
                        'group relative flex min-h-14 w-full items-center gap-3 overflow-hidden rounded-xl border px-3 py-2 text-left transition-colors',
                        isSelected
                          ? 'border-node-amber/25 bg-node-panel-soft'
                          : 'border-transparent bg-node-panel hover:border-node-panel-inner hover:bg-node-panel-inner',
                      )}
                    >
                      {isSelected ? (
                        <span className="absolute bottom-3 left-0 top-3 w-1 rounded-r-full bg-node-amber" />
                      ) : null}
                      <span
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-full text-node-muted transition-colors group-hover:text-node-foreground',
                          isSelected
                            ? 'bg-amber-500/15 text-node-amber'
                            : 'bg-node-panel-inner',
                        )}
                      >
                        <Sparkles className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-semibold text-node-foreground">
                            {option.routeLabel}
                          </span>
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
                              model: option.providerLabel,
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
            )}

            <div className={cn(savedRoutes.length > 0 && 'mt-2')}>
              <p className="px-2 py-1 text-2xs font-semibold text-node-muted">
                {t('addKey')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {lockedRoutes.map((option) => {
                  const setupLabel = t(
                    getPlannerSetupLabelKey(option.adapterType),
                  )

                  return (
                    <button
                      key={option.optionId}
                      type="button"
                      onClick={() => handleOpenQuickSetup(option, setupLabel)}
                      className="group flex min-w-0 items-center gap-2 rounded-xl border border-node-panel-inner bg-node-panel-soft px-2 py-2 text-left transition-colors hover:border-node-amber/35 hover:bg-node-panel-inner"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-node-panel-inner text-node-foreground transition-colors group-hover:text-node-amber">
                        <Plus className="size-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-node-foreground">
                          {setupLabel}
                        </span>
                        <span className="block truncate text-2xs text-node-muted">
                          {option.providerLabel}
                        </span>
                      </span>
                    </button>
                  )
                })}
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
