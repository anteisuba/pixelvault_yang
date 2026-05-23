'use client'

import { FileText, Save } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type HTMLAttributes, type ReactNode } from 'react'
import { toast } from 'sonner'

import { SCRIPT_BREAKDOWN_LIMITS } from '@/constants/script-breakdown'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { ScriptBreakdownResult } from '@/types'

type CharacterDraft = ScriptBreakdownResult['characters'][number]
type SceneDraft = ScriptBreakdownResult['scenes'][number]
type ActionDraft = ScriptBreakdownResult['actions'][number]
type BeatDraft = ScriptBreakdownResult['beats'][number]
type ShotDraft = ScriptBreakdownResult['shots'][number]

interface ScriptBreakdownEditorDialogProps {
  breakdown: ScriptBreakdownResult
  open: boolean
  onOpenChange: (open: boolean) => void
  onBreakdownChange: (breakdown: ScriptBreakdownResult) => void
}

export function ScriptBreakdownEditorDialog({
  breakdown,
  open,
  onOpenChange,
  onBreakdownChange,
}: ScriptBreakdownEditorDialogProps) {
  const t = useTranslations('StudioNode')

  const updateRootField = (field: 'title' | 'logline', value: string): void => {
    onBreakdownChange({ ...breakdown, [field]: value })
  }

  const updateReferenceField = (
    field: 'summary' | 'rewriteGuidance',
    value: string,
  ): void => {
    onBreakdownChange({
      ...breakdown,
      referenceIntent: {
        ...breakdown.referenceIntent,
        [field]: value,
      },
    })
  }

  const updateCharacterField = (
    index: number,
    field: keyof CharacterDraft,
    value: string,
  ): void => {
    onBreakdownChange({
      ...breakdown,
      characters: breakdown.characters.map((character, currentIndex) =>
        currentIndex === index ? { ...character, [field]: value } : character,
      ),
    })
  }

  const updateSceneField = (
    index: number,
    field: keyof SceneDraft,
    value: string,
  ): void => {
    onBreakdownChange({
      ...breakdown,
      scenes: breakdown.scenes.map((scene, currentIndex) =>
        currentIndex === index ? { ...scene, [field]: value } : scene,
      ),
    })
  }

  const updateActionField = (
    index: number,
    field: keyof ActionDraft,
    value: string,
  ): void => {
    onBreakdownChange({
      ...breakdown,
      actions: breakdown.actions.map((action, currentIndex) =>
        currentIndex === index ? { ...action, [field]: value } : action,
      ),
    })
  }

  const updateBeatTextField = (
    index: number,
    field: Exclude<keyof BeatDraft, 'durationSec' | 'orderIndex'>,
    value: string,
  ): void => {
    onBreakdownChange({
      ...breakdown,
      beats: breakdown.beats.map((beat, currentIndex) =>
        currentIndex === index ? { ...beat, [field]: value } : beat,
      ),
    })
  }

  const updateBeatDuration = (index: number, value: string): void => {
    const nextDuration = Number.parseInt(value, 10)
    if (Number.isNaN(nextDuration)) return

    onBreakdownChange({
      ...breakdown,
      beats: breakdown.beats.map((beat, currentIndex) =>
        currentIndex === index
          ? {
              ...beat,
              durationSec: Math.min(
                SCRIPT_BREAKDOWN_LIMITS.MAX_BEAT_DURATION_SEC,
                Math.max(
                  SCRIPT_BREAKDOWN_LIMITS.MIN_BEAT_DURATION_SEC,
                  nextDuration,
                ),
              ),
            }
          : beat,
      ),
    })
  }

  const updateShotField = (
    index: number,
    field: keyof ShotDraft,
    value: string,
  ): void => {
    onBreakdownChange({
      ...breakdown,
      shots: breakdown.shots.map((shot, currentIndex) =>
        currentIndex === index ? { ...shot, [field]: value } : shot,
      ),
    })
  }

  const handleSave = (): void => {
    onOpenChange(false)
    toast.success(t('toasts.saved'))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('closeEditor')}
        className="max-h-[calc(100vh-4rem)] overflow-hidden p-0 sm:max-w-5xl"
      >
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            {t('editorTitle')}
          </DialogTitle>
          <DialogDescription>{t('editorDescription')}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="min-h-0 px-5 pb-5">
          <TabsList className="h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
            <TabsTrigger value="characters">{t('tabs.characters')}</TabsTrigger>
            <TabsTrigger value="scenes">{t('tabs.scenes')}</TabsTrigger>
            <TabsTrigger value="actions">{t('tabs.actions')}</TabsTrigger>
            <TabsTrigger value="beats">{t('tabs.beats')}</TabsTrigger>
            <TabsTrigger value="shots">{t('tabs.shots')}</TabsTrigger>
          </TabsList>

          <div className="mt-4 max-h-[calc(100vh-15rem)] overflow-y-auto pr-1">
            <TabsContent value="overview" className="grid gap-4">
              <EditableField
                label={t('fields.title')}
                value={breakdown.title}
                onChange={(value) => updateRootField('title', value)}
              />
              <EditableField
                label={t('fields.logline')}
                value={breakdown.logline}
                multiline
                onChange={(value) => updateRootField('logline', value)}
              />
              <EditableField
                label={t('fields.referenceSummary')}
                value={breakdown.referenceIntent.summary}
                multiline
                onChange={(value) => updateReferenceField('summary', value)}
              />
              <EditableField
                label={t('fields.rewriteGuidance')}
                value={breakdown.referenceIntent.rewriteGuidance}
                multiline
                onChange={(value) =>
                  updateReferenceField('rewriteGuidance', value)
                }
              />
            </TabsContent>

            <TabsContent value="characters" className="grid gap-3">
              {breakdown.characters.map((character, index) => (
                <EditorItem key={character.id} title={character.label}>
                  <EditableField
                    label={t('fields.name')}
                    value={character.nameSuggestion}
                    onChange={(value) =>
                      updateCharacterField(index, 'nameSuggestion', value)
                    }
                  />
                  <EditableField
                    label={t('fields.role')}
                    value={character.role}
                    onChange={(value) =>
                      updateCharacterField(index, 'role', value)
                    }
                  />
                  <EditableField
                    label={t('fields.visualSeed')}
                    value={character.visualSeed}
                    multiline
                    onChange={(value) =>
                      updateCharacterField(index, 'visualSeed', value)
                    }
                  />
                  <EditableField
                    label={t('fields.functionInStory')}
                    value={character.functionInStory}
                    multiline
                    onChange={(value) =>
                      updateCharacterField(index, 'functionInStory', value)
                    }
                  />
                  <EditableField
                    label={t('fields.personality')}
                    value={character.personality}
                    multiline
                    onChange={(value) =>
                      updateCharacterField(index, 'personality', value)
                    }
                  />
                  <EditableField
                    label={t('fields.goal')}
                    value={character.goal}
                    multiline
                    onChange={(value) =>
                      updateCharacterField(index, 'goal', value)
                    }
                  />
                </EditorItem>
              ))}
            </TabsContent>

            <TabsContent value="scenes" className="grid gap-3">
              {breakdown.scenes.map((scene, index) => (
                <EditorItem key={scene.id} title={scene.label}>
                  <EditableField
                    label={t('fields.label')}
                    value={scene.label}
                    onChange={(value) =>
                      updateSceneField(index, 'label', value)
                    }
                  />
                  <EditableField
                    label={t('fields.locationType')}
                    value={scene.locationType}
                    onChange={(value) =>
                      updateSceneField(index, 'locationType', value)
                    }
                  />
                  <EditableField
                    label={t('fields.timeOfDay')}
                    value={scene.timeOfDay}
                    onChange={(value) =>
                      updateSceneField(index, 'timeOfDay', value)
                    }
                  />
                  <EditableField
                    label={t('fields.mood')}
                    value={scene.mood}
                    onChange={(value) => updateSceneField(index, 'mood', value)}
                  />
                  <EditableField
                    label={t('fields.lighting')}
                    value={scene.lighting}
                    onChange={(value) =>
                      updateSceneField(index, 'lighting', value)
                    }
                  />
                  <EditableField
                    label={t('fields.visualSeed')}
                    value={scene.visualSeed}
                    multiline
                    onChange={(value) =>
                      updateSceneField(index, 'visualSeed', value)
                    }
                  />
                </EditorItem>
              ))}
            </TabsContent>

            <TabsContent value="actions" className="grid gap-3">
              {breakdown.actions.map((action, index) => (
                <EditorItem key={action.id} title={action.id}>
                  <EditableField
                    label={t('fields.verb')}
                    value={action.verb}
                    onChange={(value) =>
                      updateActionField(index, 'verb', value)
                    }
                  />
                  <EditableField
                    label={t('fields.object')}
                    value={action.object}
                    onChange={(value) =>
                      updateActionField(index, 'object', value)
                    }
                  />
                  <EditableField
                    label={t('fields.consequence')}
                    value={action.consequence}
                    multiline
                    onChange={(value) =>
                      updateActionField(index, 'consequence', value)
                    }
                  />
                </EditorItem>
              ))}
            </TabsContent>

            <TabsContent value="beats" className="grid gap-3">
              {breakdown.beats.map((beat, index) => (
                <EditorItem
                  key={beat.id}
                  title={t('beatIndex', { index: beat.orderIndex + 1 })}
                >
                  <EditableField
                    label={t('fields.title')}
                    value={beat.title}
                    onChange={(value) =>
                      updateBeatTextField(index, 'title', value)
                    }
                  />
                  <EditableField
                    label={t('fields.duration')}
                    value={String(beat.durationSec)}
                    inputMode="numeric"
                    onChange={(value) => updateBeatDuration(index, value)}
                  />
                  <EditableField
                    label={t('fields.visibleAction')}
                    value={beat.visibleAction}
                    multiline
                    onChange={(value) =>
                      updateBeatTextField(index, 'visibleAction', value)
                    }
                  />
                  <EditableField
                    label={t('fields.emotionalTurn')}
                    value={beat.emotionalTurn}
                    multiline
                    onChange={(value) =>
                      updateBeatTextField(index, 'emotionalTurn', value)
                    }
                  />
                  <EditableField
                    label={t('fields.consequence')}
                    value={beat.consequence}
                    multiline
                    onChange={(value) =>
                      updateBeatTextField(index, 'consequence', value)
                    }
                  />
                </EditorItem>
              ))}
            </TabsContent>

            <TabsContent value="shots" className="grid gap-3">
              {breakdown.shots.map((shot, index) => (
                <EditorItem
                  key={shot.id}
                  title={`${t(`shotTypes.${shot.shotType}`)} · ${shot.cameraMotion}`}
                >
                  <EditableField
                    label={t('fields.cameraMotion')}
                    value={shot.cameraMotion}
                    onChange={(value) =>
                      updateShotField(index, 'cameraMotion', value)
                    }
                  />
                  <EditableField
                    label={t('fields.startState')}
                    value={shot.startState}
                    multiline
                    onChange={(value) =>
                      updateShotField(index, 'startState', value)
                    }
                  />
                  <EditableField
                    label={t('fields.endState')}
                    value={shot.endState}
                    multiline
                    onChange={(value) =>
                      updateShotField(index, 'endState', value)
                    }
                  />
                </EditorItem>
              ))}
            </TabsContent>
          </div>

          <DialogFooter className="border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('closeEditor')}
            </Button>
            <Button type="button" onClick={handleSave}>
              <Save className="size-4" />
              {t('saveNode')}
            </Button>
          </DialogFooter>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

interface EditorItemProps {
  title: string
  children: ReactNode
}

function EditorItem({ title, children }: EditorItemProps) {
  return (
    <section className="grid gap-3 rounded-lg border border-border/60 bg-card/60 p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  )
}

interface EditableFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
}

function EditableField({
  label,
  value,
  onChange,
  multiline = false,
  inputMode,
}: EditableFieldProps) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </span>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-24 resize-y rounded-lg border-border/70 bg-background/80 text-sm leading-6 shadow-none"
        />
      ) : (
        <Input
          value={value}
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 rounded-lg border-border/70 bg-background/80 shadow-none"
        />
      )}
    </label>
  )
}
