'use client'

import { useCallback, useRef, useState, type ChangeEvent } from 'react'
import {
  ExternalLink,
  IdCard,
  Loader2,
  Mic2,
  Music2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { FishVoiceLibraryDialog } from '@/components/business/node/FishVoiceLibraryDialog'
import type { SelectedVoice } from '@/components/business/node/VoiceSelector'
import { Button } from '@/components/ui/button'
import { IMEAwareInput, IMEAwareTextarea } from './IMEAwareField'
import { AUDIO_GENERATION } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import {
  NODE_STUDIO_AUDIO_INPUT,
  NODE_STUDIO_PLACEHOLDER_TOAST,
  NODE_STUDIO_VOICE_PROFILE,
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS,
} from '@/constants/node-studio'
import {
  NODE_STATUS_IDS,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowFieldId,
} from '@/constants/node-types'
import { ROUTES } from '@/constants/routes'
import { useRouter } from '@/i18n/navigation'
import {
  checkAudioStatusAPI,
  generateAudioAPI,
  uploadReferenceAudioAPI,
} from '@/lib/api-client'
import type { GenerationRecord } from '@/types'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { InspectorField } from './InspectorField'

interface VoiceInspectorProps {
  node: NodeWorkflowNode
}

function isSupportedAudioFile(file: File): boolean {
  if (file.type.startsWith(NODE_STUDIO_AUDIO_INPUT.mimePrefix)) {
    return true
  }

  const fileName = file.name.toLowerCase()
  return NODE_STUDIO_AUDIO_INPUT.fileExtensions.some((extension) =>
    fileName.endsWith(extension),
  )
}

function hasVoiceProfileData(data: NodeWorkflowNodeData): boolean {
  return Boolean(
    data.voiceName ||
    data.voiceId ||
    data.voiceReferenceAudioUrl ||
    data.voiceStyle ||
    data.voiceEmotion,
  )
}

function getVoiceStatus(
  data: NodeWorkflowNodeData,
): typeof NODE_STATUS_IDS.ready | typeof NODE_STATUS_IDS.idle {
  return hasVoiceProfileData(data)
    ? NODE_STATUS_IDS.ready
    : NODE_STATUS_IDS.idle
}

function truncateAudioName(name: string): string {
  return name.trim().slice(0, NODE_STUDIO_VOICE_PROFILE.maxAudioNameLength)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForGeneratedReferenceAudio(
  jobId: string,
): Promise<GenerationRecord | null> {
  for (
    let attempt = 0;
    attempt < AUDIO_GENERATION.MAX_POLL_ATTEMPTS;
    attempt += 1
  ) {
    const statusResponse = await checkAudioStatusAPI(jobId)
    if (!statusResponse.success || !statusResponse.data) {
      return null
    }

    if (statusResponse.data.status === 'COMPLETED') {
      return statusResponse.data.generation
    }

    if (statusResponse.data.status === 'FAILED') {
      return null
    }

    await delay(AUDIO_GENERATION.POLL_INTERVAL_MS)
  }

  return null
}

export function VoiceInspector({ node }: VoiceInspectorProps) {
  const t = useTranslations('StudioNode.voiceProfile')
  const tFields = useTranslations('StudioNode.workflowFields')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isGeneratingReference, setIsGeneratingReference] = useState(false)
  // Track the failed cover URL (not a boolean) so picking a new voice with a
  // valid cover recovers instead of staying stuck on the icon fallback.
  const [erroredCover, setErroredCover] = useState<string | null>(null)
  const { updateNodeData } = useNodeWorkflowActions()
  const hasReferenceAudio = Boolean(node.data.voiceReferenceAudioUrl)
  const hasFishVoiceId =
    typeof node.data.voiceId === 'string' && node.data.voiceId.length > 0
  const coverImage =
    typeof node.data.voiceCoverImage === 'string'
      ? node.data.voiceCoverImage
      : null
  const showCover = Boolean(coverImage) && erroredCover !== coverImage

  const handleFieldChange = useCallback(
    (fieldId: NodeWorkflowFieldId, value: string) => {
      const nextData = {
        ...node.data,
        [fieldId]: value,
      }

      updateNodeData(node.id, {
        [fieldId]: value,
        status: getVoiceStatus(nextData),
      })
    },
    [node.data, node.id, updateNodeData],
  )

  const handleSelectVoiceId = useCallback(
    (voice: SelectedVoice) => {
      const nextData = {
        ...node.data,
        voiceId: voice.voiceId,
        voiceName: voice.name,
        voiceCoverImage: voice.coverImage ?? undefined,
        voiceProvider:
          node.data.voiceProvider || NODE_STUDIO_VOICE_PROFILE.providerDefault,
      }

      updateNodeData(node.id, {
        voiceId: voice.voiceId,
        voiceName: voice.name,
        voiceCoverImage: voice.coverImage ?? undefined,
        voiceProvider: nextData.voiceProvider,
        voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio,
        status: getVoiceStatus(nextData),
      })
      setLibraryOpen(false)
      toast.success(t('toasts.voiceSelected'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [node.data, node.id, t, updateNodeData],
  )

  const handleUploadReferenceAudio = useCallback(
    async (file: File) => {
      if (!isSupportedAudioFile(file)) {
        toast.error(t('toasts.unsupportedAudio'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      setIsUploading(true)
      const result = await uploadReferenceAudioAPI(file)
      setIsUploading(false)

      if (!result.success || !result.data) {
        toast.error(result.error ?? t('toasts.uploadFailed'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      const nextData = {
        ...node.data,
        voiceReferenceAudioUrl: result.data.url,
        voiceReferenceAudioName: truncateAudioName(result.data.fileName),
        voiceReferenceAudioMimeType: result.data.mimeType,
      }

      updateNodeData(node.id, {
        voiceReferenceAudioUrl: nextData.voiceReferenceAudioUrl,
        voiceReferenceAudioName: nextData.voiceReferenceAudioName,
        voiceReferenceAudioMimeType: nextData.voiceReferenceAudioMimeType,
        voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
        status: getVoiceStatus(nextData),
      })
      toast.success(t('toasts.referenceUploaded'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [node.data, node.id, t, updateNodeData],
  )

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (inputRef.current) {
        inputRef.current.value = ''
      }
      if (!file) {
        return
      }

      void handleUploadReferenceAudio(file)
    },
    [handleUploadReferenceAudio],
  )

  const handleGenerateReferenceAudio = useCallback(async () => {
    const voiceId = node.data.voiceId
    if (typeof voiceId !== 'string' || voiceId.length === 0) {
      toast.error(t('toasts.referenceGenerateNoVoice'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }

    setIsGeneratingReference(true)
    const response = await generateAudioAPI({
      prompt: NODE_STUDIO_VOICE_PROFILE.referenceSampleText,
      modelId: AI_MODELS.FISH_AUDIO_S2_PRO,
      voiceId,
    })
    setIsGeneratingReference(false)

    if (!response.success || !response.data) {
      toast.error(response.error ?? t('toasts.referenceGenerateFailed'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }

    const generation = await waitForGeneratedReferenceAudio(response.data.jobId)
    if (!generation) {
      toast.error(t('toasts.referenceGenerateFailed'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }

    const nextData = {
      ...node.data,
      voiceReferenceAudioUrl: generation.url,
      voiceReferenceAudioName: NODE_STUDIO_VOICE_PROFILE.referenceSampleName,
      voiceReferenceAudioMimeType: 'audio/mpeg',
    }

    updateNodeData(node.id, {
      voiceReferenceAudioUrl: nextData.voiceReferenceAudioUrl,
      voiceReferenceAudioName: nextData.voiceReferenceAudioName,
      voiceReferenceAudioMimeType: nextData.voiceReferenceAudioMimeType,
      voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
      status: getVoiceStatus(nextData),
    })

    toast.success(t('toasts.referenceGenerated'), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }, [node.data, node.id, t, updateNodeData])

  const handleClearReferenceAudio = useCallback(() => {
    const nextData = {
      ...node.data,
      voiceReferenceAudioUrl: undefined,
      voiceReferenceAudioName: undefined,
      voiceReferenceAudioMimeType: undefined,
    }

    updateNodeData(node.id, {
      voiceReferenceAudioUrl: undefined,
      voiceReferenceAudioName: undefined,
      voiceReferenceAudioMimeType: undefined,
      voiceSource: node.data.voiceId
        ? NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio
        : NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.manual,
      status: getVoiceStatus(nextData),
    })
  }, [node.data, node.id, updateNodeData])

  const handleOpenAudioStudio = useCallback(() => {
    router.push(ROUTES.STUDIO_AUDIO)
  }, [router])

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-node-panel-inner bg-node-panel-soft p-4">
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-node-panel-inner text-node-muted">
            {showCover && coverImage ? (
              <>
                {/* Third-party cover images come from arbitrary hosts; raw img with icon fallback. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverImage}
                  alt=""
                  className="size-full object-cover"
                  onError={() => setErroredCover(coverImage)}
                />
              </>
            ) : (
              <Mic2 className="size-5" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-node-foreground">
              {t('title')}
            </p>
            <p className="mt-1 text-xs leading-5 text-node-muted">
              {t('description')}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {[
            NODE_WORKFLOW_FIELD_IDS.voiceName,
            NODE_WORKFLOW_FIELD_IDS.voiceProvider,
            NODE_WORKFLOW_FIELD_IDS.voiceId,
          ].map((fieldId) => (
            <InspectorField
              key={fieldId}
              label={tFields(`${fieldId}.label`)}
              statusDotClassName="bg-node-muted"
            >
              <IMEAwareInput
                value={
                  typeof node.data[fieldId] === 'string'
                    ? node.data[fieldId]
                    : ''
                }
                onValueChange={(next) => handleFieldChange(fieldId, next)}
                aria-label={tFields(`${fieldId}.label`)}
                placeholder={tFields(`${fieldId}.placeholder`)}
                className="h-10 w-full rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 text-sm leading-6 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
              />
            </InspectorField>
          ))}

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={() => setLibraryOpen(true)}
              className="h-10 rounded-xl bg-node-foreground text-node-canvas hover:bg-node-foreground/90"
            >
              <IdCard className="size-3.5" />
              {t('chooseVoice')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenAudioStudio}
              className="h-10 rounded-xl border-node-panel-inner bg-node-panel-soft text-xs text-node-foreground hover:bg-node-panel-inner"
            >
              <ExternalLink className="size-3.5" />
              {t('openAudioStudio')}
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-node-panel-inner bg-node-panel-soft p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-node-foreground">
                {t('referenceAudioTitle')}
              </p>
              <p className="mt-1 text-xs leading-5 text-node-muted">
                {t('referenceAudioDescription')}
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={NODE_STUDIO_AUDIO_INPUT.accept}
              className="hidden"
              onChange={handleFileInputChange}
            />
            <div className="flex shrink-0 items-center gap-1.5">
              {hasFishVoiceId ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={() => void handleGenerateReferenceAudio()}
                  disabled={isGeneratingReference || isUploading}
                  aria-label={t('generateReferenceAudio')}
                  title={t('generateReferenceAudio')}
                  className="rounded-xl border-node-panel-inner bg-node-panel text-node-muted hover:bg-node-panel-inner hover:text-node-foreground disabled:opacity-60"
                >
                  {isGeneratingReference ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading || isGeneratingReference}
                aria-label={
                  hasReferenceAudio ? t('replaceAudio') : t('uploadAudio')
                }
                className="rounded-xl border-node-panel-inner bg-node-panel text-node-muted hover:bg-node-panel-inner hover:text-node-foreground disabled:opacity-60"
              >
                {isUploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
              </Button>
            </div>
          </div>

          {node.data.voiceReferenceAudioUrl ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-xl border border-node-panel-inner bg-node-panel p-2">
                <Music2 className="size-4 shrink-0 text-node-muted" />
                <p className="min-w-0 flex-1 truncate text-xs font-semibold text-node-foreground">
                  {node.data.voiceReferenceAudioName ??
                    t('referenceAudioFallback')}
                </p>
                <button
                  type="button"
                  onClick={handleClearReferenceAudio}
                  aria-label={t('clearAudio')}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <audio
                src={node.data.voiceReferenceAudioUrl}
                controls
                className="w-full"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-node-panel-inner bg-node-panel px-3 text-center text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground"
            >
              <Upload className="size-4 text-node-muted" />
              <span className="text-xs font-semibold">{t('uploadAudio')}</span>
              <span className="text-2xs">{t('uploadAudioMeta')}</span>
            </button>
          )}
        </div>

        <div className="space-y-3">
          {[
            NODE_WORKFLOW_FIELD_IDS.voiceStyle,
            NODE_WORKFLOW_FIELD_IDS.voiceEmotion,
          ].map((fieldId) => (
            <InspectorField
              key={fieldId}
              label={tFields(`${fieldId}.label`)}
              statusDotClassName="bg-node-muted"
            >
              <IMEAwareTextarea
                value={
                  typeof node.data[fieldId] === 'string'
                    ? node.data[fieldId]
                    : ''
                }
                onValueChange={(next) => handleFieldChange(fieldId, next)}
                aria-label={tFields(`${fieldId}.label`)}
                placeholder={tFields(`${fieldId}.placeholder`)}
                className="min-h-20 w-full resize-none rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-sm leading-6 text-node-foreground shadow-none outline-none placeholder:text-node-subtle focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
              />
            </InspectorField>
          ))}
        </div>

        <div className="rounded-xl border border-node-panel-inner bg-node-panel-soft p-3 text-xs leading-5 text-node-foreground">
          {t('outputHint')}
        </div>
      </div>

      <FishVoiceLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        selectedVoiceId={node.data.voiceId ?? null}
        onSelectVoiceId={handleSelectVoiceId}
        onVoiceSelectComplete={() => setLibraryOpen(false)}
      />
    </>
  )
}
