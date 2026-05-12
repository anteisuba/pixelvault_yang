'use client'

import { useCallback, useState } from 'react'

import { useCreateVideoScript, useVideoScript } from '@/hooks/use-video-script'
import { useSceneOrchestrator } from '@/hooks/use-scene-orchestrator'
import {
  VideoScriptSceneStatus,
  VideoScriptStatus,
} from '@/lib/generated/prisma/enums'
import type { CreateVideoScriptInput } from '@/types/video-script'

import { ScriptEditor } from './ScriptEditor'
import { ScriptTopicInput } from './ScriptTopicInput'
import type { SceneFeedbackAction } from './StudioSceneFeedback'

interface StudioScriptPanelProps {
  className?: string
}

export function StudioScriptPanel({ className }: StudioScriptPanelProps) {
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
  const sceneScriptId =
    script && script.status !== VideoScriptStatus.DRAFT ? activeId : null
  const {
    status: sceneStatus,
    isLoading: isLoadingSceneStatus,
    isStarting,
    isAdvancing,
    isRetrying,
    error: sceneError,
    start,
    advance,
    retry,
  } = useSceneOrchestrator(sceneScriptId)

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

  const handleAdvanceScene = useCallback(async () => {
    const hasStartedScene = sceneStatus?.scenes.some(
      (scene) => scene.status !== VideoScriptSceneStatus.PENDING,
    )

    if (hasStartedScene) {
      await advance()
    } else {
      await start()
    }
  }, [advance, sceneStatus, start])

  const handleRetryScene = useCallback(
    (sceneIndex: number) => {
      void retry(sceneIndex)
    },
    [retry],
  )

  const handleSceneFeedback = useCallback(
    (sceneIndex: number, action: SceneFeedbackAction) => {
      void sceneIndex
      void action
      // TODO(B.2a-2): wire scene-level feedback into video-pipeline extend
      // and last-frame reference flows once those scene APIs are exposed.
    },
    [],
  )

  const showEditor = activeId != null && script != null

  return (
    <section className={className}>
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
          sceneStatus={sceneStatus}
          sceneError={sceneError}
          isSceneBusy={
            isLoadingSceneStatus || isStarting || isAdvancing || isRetrying
          }
          onAdvanceScene={handleAdvanceScene}
          onRetryScene={handleRetryScene}
          onSceneFeedback={handleSceneFeedback}
        />
      )}
    </section>
  )
}
