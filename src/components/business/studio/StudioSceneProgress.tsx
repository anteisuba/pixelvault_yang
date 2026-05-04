'use client'

import { memo } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Film,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { ErrorAlert } from '@/components/ui/error-alert'
import { Progress } from '@/components/ui/progress'
import { VideoScriptSceneStatus } from '@/lib/generated/prisma/enums'
import { cn } from '@/lib/utils'
import type { SceneOrchestratorStatus } from '@/types/video-script'

interface StudioSceneProgressProps {
  status: SceneOrchestratorStatus
  error?: string | null
  onAdvance: () => void
  onRetryScene: (sceneIndex: number) => void
}

const STATUS_LABEL_KEYS: Record<VideoScriptSceneStatus, string> = {
  [VideoScriptSceneStatus.PENDING]: 'pending',
  [VideoScriptSceneStatus.FRAME_GENERATING]: 'generatingFrame',
  [VideoScriptSceneStatus.FRAME_READY]: 'frameReady',
  [VideoScriptSceneStatus.CLIP_GENERATING]: 'generatingClip',
  [VideoScriptSceneStatus.CLIP_READY]: 'clipReady',
  [VideoScriptSceneStatus.FAILED]: 'failed',
}

const STATUS_CLASSES: Record<VideoScriptSceneStatus, string> = {
  [VideoScriptSceneStatus.PENDING]:
    'border-border bg-muted text-muted-foreground',
  [VideoScriptSceneStatus.FRAME_GENERATING]:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300',
  [VideoScriptSceneStatus.FRAME_READY]:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300',
  [VideoScriptSceneStatus.CLIP_GENERATING]:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  [VideoScriptSceneStatus.CLIP_READY]:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  [VideoScriptSceneStatus.FAILED]:
    'border-destructive/30 bg-destructive/10 text-destructive',
}

function isGenerating(status: VideoScriptSceneStatus): boolean {
  return (
    status === VideoScriptSceneStatus.FRAME_GENERATING ||
    status === VideoScriptSceneStatus.CLIP_GENERATING
  )
}

function isComplete(status: SceneOrchestratorStatus): boolean {
  return (
    status.progress >= 100 ||
    status.scenes.every(
      (scene) => scene.status === VideoScriptSceneStatus.CLIP_READY,
    )
  )
}

export const StudioSceneProgress = memo(function StudioSceneProgress({
  status,
  error = null,
  onAdvance,
  onRetryScene,
}: StudioSceneProgressProps) {
  const t = useTranslations('sceneProgress')
  const complete = isComplete(status)

  return (
    <section
      className="rounded-lg border border-border bg-card p-4"
      aria-labelledby="studio-scene-progress-title"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3
            id="studio-scene-progress-title"
            className="font-display text-sm font-medium text-foreground"
          >
            {t('title')}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {complete
              ? t('complete')
              : t('progress', { percent: status.progress })}
          </p>
        </div>
        <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {status.progress}%
        </span>
      </div>

      <Progress value={status.progress} className="mb-4 h-1.5" />

      {error && (
        <div className="mb-4">
          <ErrorAlert message={error} />
        </div>
      )}

      <ol className="flex flex-col gap-2">
        {status.scenes.map((scene) => {
          const generating = isGenerating(scene.status)

          return (
            <li
              key={scene.index}
              className="rounded-md border border-border bg-background/70 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {t('scene', { index: scene.index + 1 })}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium',
                        STATUS_CLASSES[scene.status],
                      )}
                    >
                      {generating ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : scene.status === VideoScriptSceneStatus.CLIP_READY ? (
                        <CheckCircle2 className="size-3" />
                      ) : scene.status === VideoScriptSceneStatus.FAILED ? (
                        <AlertCircle className="size-3" />
                      ) : (
                        <Film className="size-3" />
                      )}
                      {t(STATUS_LABEL_KEYS[scene.status])}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {scene.action}
                  </p>
                  {scene.errorMessage && (
                    <p className="mt-2 text-xs text-destructive" role="alert">
                      {scene.errorMessage}
                    </p>
                  )}
                </div>

                {scene.status === VideoScriptSceneStatus.FAILED && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5"
                    onClick={() => onRetryScene(scene.index)}
                  >
                    <RotateCcw className="size-3" />
                    {t('retry')}
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <Button
        type="button"
        variant="outline"
        className="mt-4 w-full gap-2"
        onClick={onAdvance}
        disabled={complete}
      >
        <Film className="size-4" />
        {complete ? t('complete') : t('advance')}
      </Button>
    </section>
  )
})
