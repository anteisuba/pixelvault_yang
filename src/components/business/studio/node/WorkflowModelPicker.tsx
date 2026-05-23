'use client'

import { KeyRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import {
  ModelSelector,
  type StudioModelOption,
} from '@/components/business/ModelSelector'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { NodeWorkflowModelSelection } from '@/types'

function modelSelectionFromOption(
  option: StudioModelOption,
): NodeWorkflowModelSelection {
  return {
    optionId: option.optionId,
    modelId: option.modelId,
    adapterType: option.adapterType,
    providerConfig: option.providerConfig,
    ...(option.keyId ? { apiKeyId: option.keyId } : {}),
    ...(option.keyLabel ? { label: option.keyLabel } : {}),
  }
}

interface WorkflowModelPickerProps {
  value: string
  options: StudioModelOption[]
  onChange: (model: NodeWorkflowModelSelection) => void
  variant?: 'full' | 'chip'
}

export function WorkflowModelPicker({
  value,
  options,
  onChange,
  variant = 'full',
}: WorkflowModelPickerProps) {
  const t = useTranslations('StudioNode')
  const [open, setOpen] = useState(false)
  const selectedOption = options.find((option) => option.optionId === value)
  const isChip = variant === 'chip'

  const handleChange = (optionId: string) => {
    const option = options.find((item) => item.optionId === optionId)
    if (!option) return

    onChange(modelSelectionFromOption(option))
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn(
          isChip
            ? 'nodrag inline-flex h-7 max-w-[180px] items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#22211f] px-2.5 text-[11px] font-semibold text-[#a6a098] hover:bg-[#2d2b28] hover:text-foreground'
            : 'h-9 w-full justify-between rounded-full px-3',
        )}
        onClick={() => setOpen(true)}
      >
        {isChip && <KeyRound className="size-3 shrink-0 text-[#a6a098]" />}
        <span className="min-w-0 truncate">
          {selectedOption
            ? (selectedOption.keyLabel ?? selectedOption.modelId)
            : t('modelPicker.select')}
        </span>
        {!isChip && (
          <KeyRound className="size-4 shrink-0 text-muted-foreground" />
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          closeLabel={t('closeEditor')}
          className="max-h-[calc(100vh-4rem)] overflow-hidden p-0 sm:max-w-2xl"
        >
          <DialogHeader className="border-b border-border/60 px-5 py-4">
            <DialogTitle>{t('modelPicker.title')}</DialogTitle>
            <DialogDescription>
              {t('modelPicker.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-5 pb-5">
            <ModelSelector
              value={value}
              onChange={handleChange}
              options={options}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
