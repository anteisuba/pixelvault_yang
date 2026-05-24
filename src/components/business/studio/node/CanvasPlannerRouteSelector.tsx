'use client'

import { useCallback, useMemo, useState } from 'react'
import { Check, ChevronDown, Key, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AI_ADAPTER_TYPES, getProviderLabel } from '@/constants/providers'
import {
  SCRIPT_BREAKDOWN_QUICK_SETUP_OPTION_PREFIX,
  SCRIPT_PLANNER_MODEL_OPTIONS,
  SCRIPT_PLANNER_PROVIDER_IDS,
  type ScriptPlannerConcreteProvider,
} from '@/constants/script-breakdown'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { QuickSetupDialog } from '@/components/business/studio/QuickSetupDialog'
import { ApiKeyHealthDot } from '@/components/business/ApiKeyHealthDot'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
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
  adapterType: AI_ADAPTER_TYPES
  modelId: string
  routeLabel: string
  modelLabel: string
  providerLabel: string
  maskedKey: string
}

interface LockedPlannerRouteOption {
  optionId: string
  plannerProvider: ScriptPlannerConcreteProvider
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

export function CanvasPlannerRouteSelector({
  value,
  onChange,
  className,
}: CanvasPlannerRouteSelectorProps) {
  const t = useTranslations('StudioNode.plannerRoute')
  const tSetup = useTranslations('QuickSetup')
  const tForm = useTranslations('StudioForm')
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
        adapterType: key.adapterType,
        modelId: plannerModel.modelId,
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
        plannerProvider: option.provider,
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
  const selectedLabel = selectedSavedRoute?.routeLabel ?? t('triggerLabel')
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
    (option: LockedPlannerRouteOption) => {
      setQuickSetup({
        open: true,
        modelId: option.modelId,
        modelLabel: option.modelLabel,
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={t('triggerLabel')}
            aria-expanded={open}
            className={cn(
              'inline-flex h-9 max-w-52 rounded-2xl border-node-panel-inner bg-node-panel-soft px-3 text-node-muted shadow-none hover:bg-node-panel-inner hover:text-node-foreground',
              className,
            )}
          >
            {selectedSavedRoute ? (
              <ApiKeyHealthDot status={selectedHealthStatus} />
            ) : (
              <Sparkles className="size-4 text-node-amber" />
            )}
            <span className="truncate text-xs font-medium">
              {isLoading ? tApiKeys('triggerLoading') : selectedLabel}
            </span>
            <ChevronDown
              className={cn(
                'size-3.5 shrink-0 transition-transform',
                open && 'rotate-180',
              )}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={10}
          collisionPadding={12}
          className="w-96 max-w-sm overflow-hidden rounded-3xl border-node-panel-inner bg-node-panel/95 p-0 text-node-foreground shadow-node-panel backdrop-blur-xl"
        >
          <Command className="bg-transparent text-node-foreground [&_[cmdk-group-heading]]:text-node-muted [&_[data-slot=command-input-wrapper]]:border-node-panel-inner [&_[data-slot=command-input]]:text-node-foreground [&_[data-slot=command-input]]:placeholder:text-node-subtle">
            <CommandInput
              placeholder={t('searchPlaceholder')}
              className="h-10 text-sm"
            />
            <CommandList className="max-h-80 overscroll-contain">
              <CommandEmpty>{tForm('modelSelector.emptySearch')}</CommandEmpty>
              {isLoading ? (
                <CommandItem disabled className="min-h-12 px-3 py-2.5">
                  {tApiKeys('loading')}
                </CommandItem>
              ) : null}

              {savedRoutes.length > 0 && (
                <CommandGroup heading={tSetup('available')}>
                  {savedRoutes.map((option) => {
                    const isSelected = option.apiKeyId === value?.apiKeyId
                    const searchValue = [
                      option.optionId,
                      option.routeLabel,
                      option.modelLabel,
                      option.providerLabel,
                      option.maskedKey,
                    ].join(' ')

                    return (
                      <CommandItem
                        key={option.optionId}
                        value={searchValue}
                        onSelect={() => handleSelectSavedRoute(option)}
                        className="group min-h-12 gap-3 rounded-2xl px-3 py-2.5 text-node-muted data-[selected=true]:bg-node-panel-inner data-[selected=true]:text-node-foreground"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-node-panel-inner text-node-muted transition-colors group-data-[selected=true]:text-node-foreground">
                          <Sparkles className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <ApiKeyHealthDot
                              status={healthMap[option.apiKeyId]}
                            />
                            <span className="truncate text-sm font-semibold text-node-foreground">
                              {option.routeLabel}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-node-muted">
                            {t('routeMeta', {
                              model: option.modelLabel,
                              provider: option.providerLabel,
                            })}
                          </span>
                        </span>
                        {isSelected ? (
                          <Check className="size-4 shrink-0 text-node-foreground" />
                        ) : null}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}

              <CommandGroup heading={tSetup('needsKey')}>
                {lockedRoutes.map((option) => (
                  <CommandItem
                    key={option.optionId}
                    value={[
                      option.optionId,
                      option.modelLabel,
                      option.providerLabel,
                    ].join(' ')}
                    onSelect={() => handleOpenQuickSetup(option)}
                    className="group min-h-12 gap-3 rounded-2xl px-3 py-2.5 text-node-muted data-[selected=true]:bg-node-panel-inner data-[selected=true]:text-node-foreground"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-node-panel-inner text-node-muted transition-colors group-data-[selected=true]:text-node-foreground">
                      <Key className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-node-foreground">
                        {option.modelLabel}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-node-muted">
                        {option.providerLabel}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
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
