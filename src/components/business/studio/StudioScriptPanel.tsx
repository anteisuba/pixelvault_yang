'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'

import { useCreateVideoScript, useVideoScript } from '@/hooks/use-video-script'
import type { CreateVideoScriptInput } from '@/types/video-script'

import { ScriptEditor } from './ScriptEditor'
import { ScriptTopicInput } from './ScriptTopicInput'

interface StudioScriptPanelProps {
  className?: string
}

export function StudioScriptPanel({ className }: StudioScriptPanelProps) {
  const t = useTranslations('VideoScript')

  // Active script id — null = empty state (show topic input)
  const [activeId, setActiveId] = useState<string | null>(null)

  const {
    create,
    isLoading: isCreating,
    error: createError,
  } = useCreateVideoScript()

  const {
    script,
    isLoading: isLoadingScript,
    error: scriptError,
    save,
    confirm,
    remove,
  } = useVideoScript(activeId)

  const handleCreate = useCallback(
    async (input: CreateVideoScriptInput) => {
      const created = await create(input)
      if (created) {
        setActiveId(created.id)
      }
    },
    [create],
  )

  const handleRemove = useCallback(async () => {
    const ok = await remove()
    if (ok) setActiveId(null)
    return ok
  }, [remove])

  const handleRegenerate = useCallback(() => {
    // Phase 1 simple flow: drop active and start over from topic input.
    setActiveId(null)
  }, [])

  const showEditor = activeId != null && script != null

  return (
    <section className={className} aria-labelledby="studio-script-panel-title">
      <header className="mb-3">
        <h2
          id="studio-script-panel-title"
          className="font-display text-base font-medium"
        >
          {t('panelTitle')}
        </h2>
      </header>

      {!showEditor && (
        <ScriptTopicInput
          isGenerating={isCreating}
          error={createError}
          onSubmit={handleCreate}
        />
      )}

      {showEditor && (
        <ScriptEditor
          script={script}
          isBusy={isLoadingScript}
          error={scriptError}
          onSave={save}
          onConfirm={confirm}
          onDelete={handleRemove}
          onRegenerate={handleRegenerate}
        />
      )}
    </section>
  )
}
