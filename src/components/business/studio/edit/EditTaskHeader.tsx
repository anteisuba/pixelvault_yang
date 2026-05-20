'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { EditTaskKind } from '@/contexts/image-edit-context'

import { EditProviderPicker } from './EditProviderPicker'
import { EditQuickSetupDialog } from './EditQuickSetupDialog'

interface EditTaskHeaderProps {
  task: EditTaskKind
  modelId: string
  onModelChange: (modelId: string) => void
  disabled?: boolean
}

interface SetupRequest {
  modelId: string
  modelLabel: string
  adapterType: AI_ADAPTER_TYPES
}

/**
 * Per-task title + provider picker pair. Owns the BYOK setup dialog so any
 * task that needs Gemini/OpenAI keys gets the popup for free without each
 * task page reinventing the modal state.
 */
export function EditTaskHeader({
  task,
  modelId,
  onModelChange,
  disabled,
}: EditTaskHeaderProps) {
  const t = useTranslations('StudioImageEdit')
  const [setupRequest, setSetupRequest] = useState<SetupRequest | null>(null)

  return (
    <div className="mb-3 space-y-2">
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
          onRequestSetup={setSetupRequest}
        />
      </div>

      {setupRequest ? (
        <EditQuickSetupDialog
          open
          onOpenChange={(next) => {
            if (!next) setSetupRequest(null)
          }}
          modelId={setupRequest.modelId}
          modelLabel={setupRequest.modelLabel}
          adapterType={setupRequest.adapterType}
          onVerified={(verifiedModelId) => {
            onModelChange(verifiedModelId)
          }}
        />
      ) : null}
    </div>
  )
}
