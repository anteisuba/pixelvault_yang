'use client'

import { useCallback, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CAMERA_SHOTS,
  SCENE_DURATION_RANGE,
  type CameraShot,
} from '@/constants/video-script'
import { VideoScriptStatus } from '@/lib/generated/prisma/client'
import type { VideoScriptRecord, VideoScriptScene } from '@/types/video-script'

interface ScriptEditorProps {
  script: VideoScriptRecord
  isBusy: boolean
  error: string | null
  onSave: (scenes: VideoScriptScene[]) => Promise<boolean>
  onConfirm: () => Promise<boolean>
  onDelete: () => Promise<boolean>
  onRegenerate: () => void
}

const CAMERA_SHOT_KEY: Record<CameraShot, string> = {
  'close-up': 'cameraShotCloseUp',
  medium: 'cameraShotMedium',
  wide: 'cameraShotWide',
  establishing: 'cameraShotEstablishing',
  'over-the-shoulder': 'cameraShotOverTheShoulder',
}

export function ScriptEditor({
  script,
  isBusy,
  error,
  onSave,
  onConfirm,
  onDelete,
  onRegenerate,
}: ScriptEditorProps) {
  const t = useTranslations('VideoScript')
  const [scenes, setScenes] = useState<VideoScriptScene[]>(script.scenes)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const totalDuration = useMemo(
    () => scenes.reduce((sum, s) => sum + s.duration, 0),
    [scenes],
  )
  const target = script.targetDuration
  const durationMismatch = totalDuration !== target

  const allRequiredFilled = useMemo(
    () =>
      scenes.every(
        (s) => s.cameraShot && s.action.trim().length > 0 && s.duration > 0,
      ),
    [scenes],
  )

  const canConfirm = allRequiredFilled && !durationMismatch && !isBusy
  const isConfirmed = script.status === VideoScriptStatus.SCRIPT_READY

  const patchScene = useCallback(
    (index: number, patch: Partial<VideoScriptScene>) => {
      setScenes((prev) =>
        prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      )
    },
    [],
  )

  const handleSave = useCallback(() => {
    void onSave(scenes)
  }, [onSave, scenes])

  return (
    <div className="flex flex-col gap-4">
      {/* Header row: status + total duration */}
      <div className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3 text-sm">
          <span
            className={
              isConfirmed ? 'text-accent font-medium' : 'text-muted-foreground'
            }
          >
            {isConfirmed ? t('statusScriptReady') : t('statusDraft')}
          </span>
          <span className="text-muted-foreground">
            {totalDuration}s / {target}s
          </span>
        </div>
        {durationMismatch && (
          <span className="text-xs text-destructive" role="alert">
            {t('totalDurationMismatch', { sum: totalDuration, target })}
          </span>
        )}
      </div>

      {/* Scene list */}
      <ul className="flex flex-col gap-3">
        {scenes.map((scene, idx) => (
          <li
            key={scene.id ?? `scene-${idx}`}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {t('sceneIndex', { n: idx + 1 })}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label>{t('sceneFieldCameraShot')}</Label>
                <Select
                  value={scene.cameraShot}
                  onValueChange={(v) =>
                    patchScene(idx, { cameraShot: v as CameraShot })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMERA_SHOTS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(CAMERA_SHOT_KEY[c] as 'cameraShotWide')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <Label>{t('sceneFieldDuration')}</Label>
                <input
                  type="number"
                  min={SCENE_DURATION_RANGE.min}
                  max={SCENE_DURATION_RANGE.max}
                  value={scene.duration}
                  onChange={(e) =>
                    patchScene(idx, {
                      duration: Number(e.target.value) || 0,
                    })
                  }
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label>{t('sceneFieldAction')}</Label>
              <Textarea
                value={scene.action}
                onChange={(e) => patchScene(idx, { action: e.target.value })}
                rows={2}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label>{t('sceneFieldDialogue')}</Label>
              <Textarea
                value={scene.dialogue ?? ''}
                onChange={(e) =>
                  patchScene(idx, { dialogue: e.target.value || null })
                }
                rows={1}
                maxLength={500}
              />
            </div>
          </li>
        ))}
      </ul>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={onRegenerate} disabled={isBusy}>
          {t('regenerateButton')}
        </Button>
        <Button onClick={handleSave} disabled={isBusy}>
          {isBusy ? t('savingButton') : t('saveDraftButton')}
        </Button>
        <Button
          variant="default"
          onClick={() => void onConfirm()}
          disabled={!canConfirm || isConfirmed}
        >
          {isBusy ? t('confirmingButton') : t('confirmButton')}
        </Button>
        <Button
          variant="destructive"
          onClick={() => setConfirmingDelete(true)}
          disabled={isBusy}
          className="ml-auto"
        >
          {t('deleteButton')}
        </Button>
      </div>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteConfirmBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('deleteButton')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmingDelete(false)
                void onDelete()
              }}
            >
              {t('deleteButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
