'use client'

import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { EditTaskKind } from '@/contexts/image-edit-context'
import { Link } from '@/i18n/navigation'

import { EditProviderPicker } from './EditProviderPicker'

interface EditTaskHeaderProps {
  task: EditTaskKind
  modelId: string
  onModelChange: (modelId: string) => void
  disabled?: boolean
}

/** Per-task title + provider picker pair reused at the top of each task page. */
export function EditTaskHeader({
  task,
  modelId,
  onModelChange,
  disabled,
}: EditTaskHeaderProps) {
  const t = useTranslations('StudioImageEdit')
  return (
    <div className="mb-3 space-y-2">
      <Link
        href="/studio/edit"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        {t('placeholder.backToGrid')}
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {t(`tasks.${task}.label`)}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(`tasks.${task}.description`)}
          </p>
        </div>
        <EditProviderPicker
          task={task}
          value={modelId}
          onChange={onModelChange}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
