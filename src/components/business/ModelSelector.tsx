'use client'

import { Gift, KeyRound, Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { API_USAGE } from '@/constants/config'
import { getModelMessageKey, isBuiltInModel } from '@/constants/models'
import {
  getProviderLabel,
  type AI_ADAPTER_TYPES,
  type ProviderConfig,
} from '@/constants/providers'
import { isCjkLocale } from '@/i18n/routing'

import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface StudioModelOption {
  optionId: string
  modelId: string
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  requestCount: number
  isBuiltIn: boolean
  freeTier?: boolean
  sourceType: 'workspace' | 'saved'
  keyId?: string
  keyLabel?: string
  maskedKey?: string
}

interface ModelSelectorProps {
  value: string
  onChange: (value: string) => void
  options: StudioModelOption[]
}

function getOptionMessageId(modelId: string): string {
  return isBuiltInModel(modelId) ? getModelMessageKey(modelId) : modelId
}

function getModelLabel(
  option: StudioModelOption,
  tModels: (key: string) => string,
): string {
  return isBuiltInModel(option.modelId)
    ? tModels(`${getOptionMessageId(option.modelId)}.label`)
    : option.modelId
}

export function ModelSelector({
  value,
  onChange,
  options,
}: ModelSelectorProps) {
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('StudioForm.modelSelector')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')
  const selectedOption = options.find((option) => option.optionId === value)

  return (
    <div className="space-y-4" data-onboarding="model">
      <div className="space-y-1">
        <label className="text-sm font-semibold text-foreground">
          {t('label')}
        </label>
        <p className="font-serif text-sm leading-6 text-muted-foreground">
          {t('hint')}
        </p>
      </div>

      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-16 w-full overflow-hidden rounded-3xl border-border/75 bg-background/72 px-4 text-left shadow-none">
          <SelectValue
            placeholder={t('placeholder')}
            aria-label={selectedOption?.modelId ?? t('placeholder')}
          >
            {selectedOption ? (
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {getModelLabel(selectedOption, tModels)}
                  </p>
                  <p className="truncate font-serif text-xs text-muted-foreground">
                    {getProviderLabel(selectedOption.providerConfig)} ·{' '}
                    {t(`routeSources.${selectedOption.sourceType}`)}
                  </p>
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                  {selectedOption.freeTier &&
                  selectedOption.sourceType === 'workspace' ? (
                    <Badge
                      variant="outline"
                      className="rounded-full border-chart-3/40 px-2 py-0 text-[11px] text-chart-3"
                    >
                      <Gift className="size-3" />
                      {t('freeBadge')}
                    </Badge>
                  ) : (
                    <Badge
                      variant={
                        selectedOption.sourceType === 'saved'
                          ? 'secondary'
                          : 'outline'
                      }
                      className="rounded-full px-2 py-0 text-[11px]"
                    >
                      {selectedOption.sourceType === 'saved' ? (
                        <KeyRound className="size-3" />
                      ) : (
                        <Sparkles className="size-3" />
                      )}
                      {selectedOption.sourceType === 'saved'
                        ? t('savedRouteBadge')
                        : t('workspaceRouteBadge')}
                    </Badge>
                  )}
                  {!selectedOption.isBuiltIn ? (
                    <Badge
                      variant="outline"
                      className="rounded-full px-2 py-0 text-[11px] text-muted-foreground"
                    >
                      {t('customBadge')}
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="rounded-3xl border-border/80 bg-card/98 p-1">
          {options.map((option) => {
            const isBuiltIn = isBuiltInModel(option.modelId)

            return (
              <SelectItem key={option.optionId} value={option.optionId}>
                <div className="flex w-full items-start justify-between gap-3 py-2 pr-4">
                  <div className="min-w-0 space-y-1">
                    <span className="block truncate font-medium text-foreground">
                      {getModelLabel(option, tModels)}
                    </span>
                    <span className="block font-serif text-xs leading-5 text-muted-foreground">
                      {isBuiltIn
                        ? tModels(
                            `${getOptionMessageId(option.modelId)}.description`,
                          )
                        : t('customDescription', {
                            provider: getProviderLabel(option.providerConfig),
                          })}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground/90">
                      {getProviderLabel(option.providerConfig)} ·{' '}
                      {option.providerConfig.baseUrl}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    {option.freeTier && option.sourceType === 'workspace' ? (
                      <Badge
                        variant="outline"
                        className="rounded-full border-chart-3/40 px-2 py-0 text-[11px] text-chart-3"
                      >
                        <Gift className="size-3" />
                        {t('freeBadge')}
                      </Badge>
                    ) : (
                      <span className="text-xs font-medium text-foreground">
                        {tCommon('creditCount', {
                          count:
                            option.requestCount ??
                            API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
                        })}
                      </span>
                    )}
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <Badge
                        variant={
                          option.sourceType === 'saved'
                            ? 'secondary'
                            : 'outline'
                        }
                        className={cn(
                          'rounded-full px-2 py-0 text-[11px]',
                          isDenseLocale && 'tracking-normal normal-case',
                        )}
                      >
                        {option.sourceType === 'saved' ? (
                          <KeyRound className="size-3" />
                        ) : (
                          <Sparkles className="size-3" />
                        )}
                        {option.sourceType === 'saved'
                          ? t('savedRouteBadge')
                          : t('workspaceRouteBadge')}
                      </Badge>
                      {!option.isBuiltIn ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            'rounded-full px-2 py-0 text-[11px] text-muted-foreground',
                            isDenseLocale && 'tracking-normal normal-case',
                          )}
                        >
                          <Sparkles className="size-3" />
                          {t('customBadge')}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </div>
  )
}
