'use client'

import { Check, ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  EDIT_MODELS,
  getEditTaskMeta,
  type EditTaskProvider,
} from '@/constants/edit-tasks'
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

interface EditProviderPickerProps {
  task: EditTaskKind
  value: string
  onChange: (modelId: string) => void
  disabled?: boolean
}

/**
 * Provider/model picker rendered above each task's tools. Phase 3 each task
 * registers only one (fal) model so the trigger collapses to a non-interactive
 * badge; Phase 4 brings Gemini + GPT and the dropdown lights up.
 */
export function EditProviderPicker({
  task,
  value,
  onChange,
  disabled,
}: EditProviderPickerProps) {
  const t = useTranslations('StudioImageEdit')
  const meta = getEditTaskMeta(task)
  const models = meta?.models ?? []
  const current = EDIT_MODELS[value] ?? EDIT_MODELS[models[0] ?? '']

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
          return (
            <DropdownMenuItem
              key={modelId}
              onSelect={() => onChange(modelId)}
              className="flex items-center justify-between gap-3"
            >
              <span className="inline-flex items-center gap-2">
                <span className="text-sm font-medium">
                  {option.displayName}
                </span>
                <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {PROVIDER_LABEL[option.provider]}
                </span>
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
