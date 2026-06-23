'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  Bookmark,
  Check,
  IdCard,
  Library,
  Loader2,
  Mic2,
  Music2,
  Trash2,
  Upload,
  WandSparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  NODE_STUDIO_AUDIO_INPUT,
  NODE_STUDIO_PLACEHOLDER_TOAST,
  NODE_STUDIO_VOICE_EMOTION_IDS,
  NODE_STUDIO_VOICE_EMOTIONS,
  NODE_STUDIO_VOICE_PROFILE,
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS,
} from '@/constants/node-studio'
import { TTS_SPEED_RANGE, TTS_VOLUME_RANGE } from '@/constants/audio-options'
import { AUDIO_GENERATION } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import { NODE_STATUS_IDS } from '@/constants/node-types'
import {
  VOICE_CARD_DEFAULT_PACE,
  VOICE_CARD_PROVIDER,
} from '@/constants/voice-cards'
import {
  checkAudioStatusAPI,
  createVoiceCardAPI,
  generateAudioAPI,
  updateVoiceCardAPI,
  uploadReferenceAudioAPI,
} from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { useVoiceCards } from '@/hooks/cards/use-voice-cards'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { ParamSlider } from '@/components/ui/param-slider'
import type { GenerationRecord } from '@/types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { FishVoiceLibraryDialog } from '../FishVoiceLibraryDialog'
import type { SelectedVoice } from '../VoiceSelector'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeActionButton, NodeModelSelector } from '../nodes/NodeCardControls'
import type { NodeDetailBodyProps } from './registry'

function stopCanvasKeyboardEvent(event: ReactKeyboardEvent<HTMLElement>): void {
  event.stopPropagation()
}

function hasVoiceContent(data: NodeWorkflowNodeData): boolean {
  return Boolean(
    data.voiceName ||
    data.voiceId ||
    data.voiceReferenceAudioUrl ||
    data.voiceEmotion,
  )
}

function isSupportedAudioFile(file: File): boolean {
  if (file.type.startsWith(NODE_STUDIO_AUDIO_INPUT.mimePrefix)) return true
  const fileName = file.name.toLowerCase()
  return NODE_STUDIO_AUDIO_INPUT.fileExtensions.some((extension) =>
    fileName.endsWith(extension),
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForGeneratedSample(
  jobId: string,
): Promise<GenerationRecord | null> {
  for (
    let attempt = 0;
    attempt < AUDIO_GENERATION.MAX_POLL_ATTEMPTS;
    attempt += 1
  ) {
    const statusResponse = await checkAudioStatusAPI(jobId)
    if (!statusResponse.success || !statusResponse.data) return null
    if (statusResponse.data.status === 'COMPLETED') {
      return statusResponse.data.generation
    }
    if (statusResponse.data.status === 'FAILED') return null
    await delay(AUDIO_GENERATION.POLL_INTERVAL_MS)
  }
  return null
}

const SECTION_LABEL =
  'text-2xs font-semibold uppercase tracking-nav-dense text-node-muted'

/**
 * Detail body for voice (声音) nodes. The node is a **voice identity / 音色身份**
 * builder — NOT a place to write spoken lines. There is no 台词 input: the
 * exact dialogue lives in the script / downstream video nodes (剧本后置). Here
 * the user picks/uploads a voice, optionally overrides its cover image,
 * auditions a single representative sample, tunes delivery (speed / volume /
 * emotion), and saves the profile into the reusable voice library (素材 =
 * VoiceCard) so it can be pulled back later from the library picker.
 */
export function VoiceDetailBody({ nodeId, type, data }: NodeDetailBodyProps) {
  const t = useTranslations('StudioNode.voiceDetail')
  const tVoice = useTranslations('StudioNode.voiceProfile')
  const { updateNodeData } = useNodeWorkflowActions()
  const voiceCards = useVoiceCards()

  const inputRef = useRef<HTMLInputElement>(null)
  // Tracks the currently-selected voice so an in-flight audition (the poll can
  // run up to ~200s) can drop its result if the user switches voices mid-flight
  // — otherwise the old voice's sample would land on the new voice. Mirrors the
  // request-id guard in VoiceSelector.
  const activeVoiceIdRef = useRef(data.voiceId)
  useEffect(() => {
    activeVoiceIdRef.current = data.voiceId
  }, [data.voiceId])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [audioAssetDialogOpen, setAudioAssetDialogOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isGeneratingSample, setIsGeneratingSample] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  // Track the failed cover URL (not a boolean) so picking a new voice with a
  // valid cover recovers instead of staying stuck on the icon fallback.
  const [erroredCover, setErroredCover] = useState<string | null>(null)
  const [activeSource, setActiveSource] = useState(
    data.voiceSource === NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio
      ? NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio
      : NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio,
  )

  const applyPatch = useCallback(
    (patch: Partial<NodeWorkflowNodeData>) => {
      const next = { ...data, ...patch }
      updateNodeData(nodeId, {
        ...patch,
        status: hasVoiceContent(next)
          ? NODE_STATUS_IDS.ready
          : NODE_STATUS_IDS.idle,
      })
    },
    [data, nodeId, updateNodeData],
  )

  const handleSelectVoiceId = useCallback(
    (voice: SelectedVoice) => {
      applyPatch({
        voiceId: voice.voiceId,
        voiceName: voice.name,
        voiceCoverImage: voice.coverImage ?? undefined,
        voiceProvider:
          data.voiceProvider || NODE_STUDIO_VOICE_PROFILE.providerDefault,
        voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio,
        // The sample belongs to the previous voice — drop it so the new voice
        // re-auditions cleanly.
        voiceSampleUrl: undefined,
      })
      setErroredCover(null)
      setActiveSource(NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio)
      setLibraryOpen(false)
    },
    [applyPatch, data.voiceProvider],
  )

  const handleUpload = useCallback(
    async (file: File) => {
      if (!isSupportedAudioFile(file)) {
        toast.error(tVoice('toasts.unsupportedAudio'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }
      setIsUploading(true)
      const result = await uploadReferenceAudioAPI(file)
      setIsUploading(false)
      if (!result.success || !result.data) {
        toast.error(result.error ?? tVoice('toasts.uploadFailed'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }
      applyPatch({
        voiceReferenceAudioUrl: result.data.url,
        voiceReferenceAudioName: result.data.fileName.slice(
          0,
          NODE_STUDIO_VOICE_PROFILE.maxAudioNameLength,
        ),
        voiceReferenceAudioMimeType: result.data.mimeType,
        voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
      })
    },
    [applyPatch, tVoice],
  )

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (inputRef.current) inputRef.current.value = ''
      if (file) void handleUpload(file)
    },
    [handleUpload],
  )

  const handleClearReferenceAudio = useCallback(() => {
    applyPatch({
      voiceReferenceAudioUrl: undefined,
      voiceReferenceAudioName: undefined,
      voiceReferenceAudioMimeType: undefined,
      voiceReferenceCoverImage: undefined,
      voiceSource: data.voiceId
        ? NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio
        : NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.manual,
    })
  }, [applyPatch, data.voiceId])

  const handleSelectReferenceAsset = useCallback(
    (generation: GenerationRecord) => {
      setErroredCover(null)
      applyPatch({
        voiceReferenceAudioUrl: generation.url,
        voiceReferenceAudioName: tVoice('referenceAudioFallback'),
        voiceReferenceAudioMimeType: NODE_STUDIO_AUDIO_INPUT.assetMimeType,
        // The node only FOLLOWS the asset's cover (configured in the asset
        // library). Stored in its OWN field so it never clobbers the system
        // voice's cover when the user toggles sources.
        voiceReferenceCoverImage:
          generation.previewUrl ?? generation.thumbnailUrl ?? undefined,
        voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
      })
      setAudioAssetDialogOpen(false)
    },
    [applyPatch, tVoice],
  )

  const handleGenerateSample = useCallback(async () => {
    if (!data.voiceId) {
      toast.error(tVoice('toasts.referenceGenerateNoVoice'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }
    const requestedVoiceId = data.voiceId
    setIsGeneratingSample(true)
    const response = await generateAudioAPI({
      prompt: NODE_STUDIO_VOICE_PROFILE.referenceSampleText,
      modelId: data.model?.modelId ?? AI_MODELS.FISH_AUDIO_S2_PRO,
      voiceId: requestedVoiceId,
      apiKeyId: data.model?.apiKeyId,
    })
    if (!response.success || !response.data) {
      setIsGeneratingSample(false)
      toast.error(response.error ?? tVoice('toasts.referenceGenerateFailed'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }
    const generation = await waitForGeneratedSample(response.data.jobId)
    setIsGeneratingSample(false)
    // The user switched voices while we were polling — discard this stale
    // sample so it never lands on the now-current (different) voice.
    if (activeVoiceIdRef.current !== requestedVoiceId) return
    if (!generation) {
      toast.error(tVoice('toasts.referenceGenerateFailed'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }
    applyPatch({ voiceSampleUrl: generation.url })
    toast.success(tVoice('toasts.sampleGenerated'), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }, [data.voiceId, data.model, applyPatch, tVoice])

  const selectedEmotion = (
    NODE_STUDIO_VOICE_EMOTIONS as readonly string[]
  ).includes(data.voiceEmotion ?? '')
    ? (data.voiceEmotion as string)
    : NODE_STUDIO_VOICE_EMOTION_IDS.none

  // Never surface the raw voiceId — it reads as gibberish. Name, then provider.
  const selectedVoiceName =
    data.voiceName?.trim() ||
    data.voiceProvider?.trim() ||
    NODE_STUDIO_VOICE_PROFILE.providerDefault
  const selectedVoiceProvider =
    data.voiceProvider?.trim() || NODE_STUDIO_VOICE_PROFILE.providerDefault
  const isFishSource =
    activeSource === NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio
  // The cover follows the ACTIVE source — the system voice keeps its own cover
  // in `voiceCoverImage`, the my-voice keeps its in `voiceReferenceCoverImage`,
  // so toggling sources never shows the other's image.
  const activeCover = isFishSource
    ? data.voiceCoverImage
    : data.voiceReferenceCoverImage
  const showVoiceCover = Boolean(activeCover) && erroredCover !== activeCover
  const savedCard = voiceCards.cards.find(
    (card) =>
      card.voiceId === data.voiceId &&
      card.provider === VOICE_CARD_PROVIDER.FISH_AUDIO,
  )
  // Whether the saved card's cover already matches the node's. Drives the save
  // button between "in library" (idle) and "sync cover" (actionable) so a cover
  // set after favoriting still carries over to 素材.
  const coverInSync =
    !data.voiceCoverImage || savedCard?.coverImage === data.voiceCoverImage

  const handleSaveToAssets = useCallback(async () => {
    if (!data.voiceId) return
    // Already in the library → sync the cover into the existing card when it
    // changed, so the picture set on the node carries over to 素材 (Bug: a
    // saved favorite never received the node's cover).
    if (savedCard) {
      if (
        data.voiceCoverImage &&
        savedCard.coverImage !== data.voiceCoverImage
      ) {
        setIsSaving(true)
        const updated = await updateVoiceCardAPI(savedCard.id, {
          coverImage: data.voiceCoverImage,
        })
        setIsSaving(false)
        if (!updated.success) {
          toast.error(updated.error ?? tVoice('toasts.saveToAssetsFailed'), {
            duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
            position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
          })
          return
        }
        await voiceCards.refresh()
        toast.success(tVoice('toasts.coverSynced'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
      } else {
        toast.success(tVoice('toasts.alreadySaved'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
      }
      return
    }
    setIsSaving(true)
    const result = await createVoiceCardAPI({
      name: selectedVoiceName,
      provider: VOICE_CARD_PROVIDER.FISH_AUDIO,
      modelId: AI_MODELS.FISH_AUDIO_S2_PRO,
      voiceId: data.voiceId,
      coverImage: data.voiceCoverImage ?? undefined,
      tone: [],
      pace: VOICE_CARD_DEFAULT_PACE,
      pronunciationDictionary: {},
    })
    setIsSaving(false)
    if (!result.success) {
      toast.error(result.error ?? tVoice('toasts.saveToAssetsFailed'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }
    await voiceCards.refresh()
    toast.success(tVoice('toasts.savedToAssets'), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }, [
    data.voiceId,
    data.voiceCoverImage,
    savedCard,
    selectedVoiceName,
    voiceCards,
    tVoice,
  ])

  // Read-only cover thumbnail. The cover belongs to the source — a Fish voice's
  // built-in cover, or the picked audio asset's cover (configured in the asset
  // library). The node only DISPLAYS it; it never configures a cover itself.
  const coverThumbnail = (
    <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-node-port-voice/15 text-node-port-voice">
      {showVoiceCover && activeCover ? (
        <>
          {/* Third-party cover images come from arbitrary hosts; raw img with icon fallback. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeCover}
            alt=""
            className="size-full object-cover"
            onError={() => setErroredCover(activeCover ?? null)}
          />
        </>
      ) : (
        <Mic2 className="size-7" />
      )}
    </span>
  )

  return (
    <div className="space-y-4">
      {/* §A 音色身份 (台词 removed — spoken lines belong to the script / 剧本) */}
      <div className="space-y-2">
        <span className={SECTION_LABEL}>{t('timbreLabel')}</span>
        <div className="flex gap-1 rounded-xl border border-node-panel-inner bg-node-panel-soft p-1">
          {(
            [
              {
                id: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio,
                label: t('sourceSystem'),
              },
              {
                id: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
                label: t('sourceMine'),
              },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setActiveSource(option.id)}
              onKeyDownCapture={stopCanvasKeyboardEvent}
              className={cn(
                'nodrag flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                activeSource === option.id
                  ? 'bg-node-foreground text-node-canvas'
                  : 'text-node-muted hover:text-node-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {isFishSource ? (
          data.voiceId ? (
            <div className="flex items-center gap-3 rounded-xl border border-node-panel-inner bg-node-panel-soft p-2.5">
              {coverThumbnail}
              {/* Name + source → reopen the library (从素材拿). */}
              <button
                type="button"
                onClick={() => setLibraryOpen(true)}
                onKeyDownCapture={stopCanvasKeyboardEvent}
                className="nodrag min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-semibold text-node-foreground">
                  {selectedVoiceName}
                </span>
                <span className="mt-0.5 block truncate text-xs text-node-muted">
                  {selectedVoiceProvider}
                </span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              onKeyDownCapture={stopCanvasKeyboardEvent}
              className="nodrag flex w-full items-center gap-2 rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 py-2.5 text-left text-sm text-node-foreground transition-colors hover:bg-node-panel-inner"
            >
              <IdCard className="size-4 shrink-0 text-node-muted" />
              <span className="min-w-0 flex-1 truncate">
                {tVoice('chooseVoice')}
              </span>
            </button>
          )
        ) : (
          <div className="space-y-2">
            <input
              ref={inputRef}
              type="file"
              accept={NODE_STUDIO_AUDIO_INPUT.accept}
              className="hidden"
              onChange={handleFileInputChange}
            />
            {data.voiceReferenceAudioUrl ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-xl border border-node-panel-inner bg-node-panel-soft p-2.5">
                  {coverThumbnail}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Music2 className="size-3.5 shrink-0 text-node-muted" />
                      <span className="truncate text-sm font-semibold text-node-foreground">
                        {data.voiceReferenceAudioName ??
                          tVoice('referenceAudioFallback')}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-node-muted">
                      {t('sourceMine')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearReferenceAudio}
                    onKeyDownCapture={stopCanvasKeyboardEvent}
                    aria-label={tVoice('clearAudio')}
                    title={tVoice('clearAudio')}
                    className="nodrag flex size-7 shrink-0 items-center justify-center rounded-full text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <audio
                  src={data.voiceReferenceAudioUrl}
                  controls
                  className="nodrag w-full"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onKeyDownCapture={stopCanvasKeyboardEvent}
                  disabled={isUploading}
                  className="nodrag flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-node-panel-inner bg-node-panel-soft px-3 text-center text-node-muted transition-colors hover:border-node-focus-ring/40 hover:text-node-foreground disabled:opacity-60"
                >
                  {isUploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  <span className="text-xs font-semibold">
                    {tVoice('uploadAudio')}
                  </span>
                </button>
                {/* Reuse a generated voice clip already saved in the asset
                    library (素材) instead of uploading a new file. */}
                <button
                  type="button"
                  onClick={() => setAudioAssetDialogOpen(true)}
                  onKeyDownCapture={stopCanvasKeyboardEvent}
                  className="nodrag flex w-full items-center justify-center gap-2 rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-xs font-semibold text-node-foreground transition-colors hover:bg-node-panel-inner"
                >
                  <Library className="size-3.5 text-node-muted" />
                  {tVoice('referenceFromAssets')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* §B 音频模型 — also the API-key gate: an unconfigured model routes to
          QuickSetup (Hard Rule 8). Required before 试听/生成 can run. */}
      <NodeModelSelector nodeId={nodeId} type={type} data={data} />

      {/* §C 代表音频 — audition one representative clip of the picked voice. */}
      {isFishSource && data.voiceId ? (
        <div className="space-y-2">
          <span className={SECTION_LABEL}>{t('sampleLabel')}</span>
          {data.voiceSampleUrl ? (
            <audio
              src={data.voiceSampleUrl}
              controls
              className="nodrag w-full"
            />
          ) : null}
          <button
            type="button"
            onClick={() => void handleGenerateSample()}
            onKeyDownCapture={stopCanvasKeyboardEvent}
            disabled={isGeneratingSample}
            className="nodrag flex w-full items-center justify-center gap-2 rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-xs font-semibold text-node-foreground transition-colors hover:bg-node-panel-inner disabled:opacity-60"
          >
            {isGeneratingSample ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <WandSparkles className="size-4" />
            )}
            {t('generateSample')}
          </button>
        </div>
      ) : null}

      {/* §C 基础调节 */}
      <div className="nodrag nopan nowheel space-y-3">
        <span className={SECTION_LABEL}>{t('paramsLabel')}</span>
        <ParamSlider
          label={t('speedLabel')}
          value={data.voiceSpeed ?? TTS_SPEED_RANGE.default}
          onChange={(value) => applyPatch({ voiceSpeed: value })}
          min={TTS_SPEED_RANGE.min}
          max={TTS_SPEED_RANGE.max}
          step={TTS_SPEED_RANGE.step}
          formatValue={(value) => `${value.toFixed(1)}×`}
        />
        <ParamSlider
          label={t('volumeLabel')}
          value={data.voiceVolume ?? TTS_VOLUME_RANGE.default}
          onChange={(value) => applyPatch({ voiceVolume: value })}
          min={TTS_VOLUME_RANGE.min}
          max={TTS_VOLUME_RANGE.max}
          step={TTS_VOLUME_RANGE.step}
          formatValue={(value) => `${value > 0 ? '+' : ''}${value}`}
        />
      </div>

      {/* §D 情绪 */}
      <div className="space-y-2">
        <span className={SECTION_LABEL}>{t('emotionLabel')}</span>
        <div className="flex flex-wrap gap-1.5">
          {NODE_STUDIO_VOICE_EMOTIONS.map((emotion) => (
            <button
              key={emotion}
              type="button"
              onClick={() =>
                applyPatch({
                  voiceEmotion:
                    emotion === NODE_STUDIO_VOICE_EMOTION_IDS.none
                      ? ''
                      : emotion,
                })
              }
              onKeyDownCapture={stopCanvasKeyboardEvent}
              className={cn(
                'nodrag rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                selectedEmotion === emotion
                  ? 'bg-node-foreground text-node-canvas'
                  : 'border border-node-panel-inner bg-node-panel-soft text-node-muted hover:text-node-foreground',
              )}
            >
              {t(`emotions.${emotion}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Clarify the node's role: lines belong to the script, not here. */}
      <p className="text-2xs leading-5 text-node-subtle">
        {tVoice('outputHint')}
      </p>

      {/* §E 收藏进素材 — save this profile as a reusable VoiceCard. */}
      {isFishSource && data.voiceId ? (
        <NodeActionButton
          disabled={isSaving || (Boolean(savedCard) && coverInSync)}
          onClick={() => void handleSaveToAssets()}
        >
          {isSaving ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : savedCard && coverInSync ? (
            <Check className="mr-1.5 size-4" />
          ) : (
            <Bookmark className="mr-1.5 size-4" />
          )}
          {savedCard
            ? coverInSync
              ? t('savedToAssets')
              : t('syncCoverToAssets')
            : t('saveToAssets')}
        </NodeActionButton>
      ) : null}

      <FishVoiceLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        selectedVoiceId={data.voiceId ?? null}
        onSelectVoiceId={handleSelectVoiceId}
        onVoiceSelectComplete={() => setLibraryOpen(false)}
      />

      <AssetSelectorDialog
        open={audioAssetDialogOpen}
        onOpenChange={setAudioAssetDialogOpen}
        title={tVoice('referenceDialogTitle')}
        description={tVoice('referenceDialogDescription')}
        mediaType="audio"
        onSelect={handleSelectReferenceAsset}
      />
    </div>
  )
}
