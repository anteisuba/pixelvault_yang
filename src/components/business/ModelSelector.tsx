'use client'

import { useLocale, useTranslations } from 'next-intl'

import { getAvailableModels, getModelMessageKey } from '@/constants/models'
import { isCjkLocale } from '@/i18n/routing'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface ModelSelectorProps {
  /** Currently selected model ID */
  value: string
  /** Callback when the selected model changes */
  onChange: (value: string) => void
}

/**
 * Dropdown selector for choosing an AI image generation model.
 * Only displays models that are currently available.
 */
export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const availableModels = getAvailableModels()
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('StudioForm.modelSelector')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="text-sm font-semibold text-foreground">
          {t('label')}
        </label>
        <p className="text-sm leading-6 text-muted-foreground">{t('hint')}</p>
      </div>

      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11 w-full rounded-xl bg-background">
          <SelectValue placeholder={t('placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {availableModels.map((model) => {
            const modelMessageKey = getModelMessageKey(model.id)

            return (
              <SelectItem key={model.id} value={model.id}>
                <div className="flex w-full items-start justify-between gap-3 py-0.5 pr-4">
                  <div className="space-y-1">
                    <span className="block font-medium text-foreground">
                      {tModels(`${modelMessageKey}.label`)}
                    </span>
                    <span className="block text-xs leading-5 text-muted-foreground">
                      {tModels(`${modelMessageKey}.description`)}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <span className="text-xs font-medium text-foreground">
                      {tCommon('creditCount', { count: model.cost })}
                    </span>
                    <span
                      className={cn(
                        'text-xs text-muted-foreground',
                        isDenseLocale && 'tracking-normal normal-case',
                      )}
                    >
                      {model.provider}
                    </span>
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
