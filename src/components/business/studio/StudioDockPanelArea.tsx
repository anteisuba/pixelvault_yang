'use client'

import { memo, useCallback, useEffect, useState } from 'react'
import { Key, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'

import {
  useStudioForm,
  useStudioData,
  type PanelName,
} from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getReferenceCapability,
  getReferenceCapabilityMax,
} from '@/constants/reference-image-capabilities'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Shared spinner for panel bodies that ship as separate chunks. Without
 * this, the dialog mounts with an empty white box for the ~500ms it takes
 * to download the chunk (most visible on the Script panel, which is the
 * largest). The fallback matches the layout — same vertical rhythm as
 * the dialog body so the dialog doesn't visibly jump when the real panel
 * arrives.
 */
function PanelLoadingFallback() {
  return (
    <div className="flex h-40 items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

const ReferenceImageSection = dynamic(
  () =>
    import('@/components/ui/reference-image-section').then(
      (mod) => mod.ReferenceImageSection,
    ),
  { loading: () => <PanelLoadingFallback /> },
)
const LayerDecomposePanel = dynamic(
  () =>
    import('@/components/business/LayerDecomposePanel').then(
      (mod) => mod.LayerDecomposePanel,
    ),
  { loading: () => <PanelLoadingFallback /> },
)
const FishVoiceLibraryDialog = dynamic(
  () =>
    import('@/components/business/studio/FishVoiceLibraryDialog').then(
      (mod) => mod.FishVoiceLibraryDialog,
    ),
  { loading: () => <PanelLoadingFallback /> },
)
const StudioAudioParams = dynamic(
  () =>
    import('@/components/business/studio/StudioAudioParams').then(
      (mod) => mod.StudioAudioParams,
    ),
  { loading: () => <PanelLoadingFallback /> },
)
const VoiceTrainer = dynamic(
  () =>
    import('@/components/business/studio/VoiceTrainer').then(
      (mod) => mod.VoiceTrainer,
    ),
  { loading: () => <PanelLoadingFallback /> },
)
const AudioTranscribeDialog = dynamic(
  () =>
    import('@/components/business/studio/AudioTranscribeDialog').then(
      (mod) => mod.AudioTranscribeDialog,
    ),
  { loading: () => <PanelLoadingFallback /> },
)
const StudioVideoParams = dynamic(
  () =>
    import('@/components/business/studio/StudioVideoParams').then(
      (mod) => mod.StudioVideoParams,
    ),
  { loading: () => <PanelLoadingFallback /> },
)
const StudioScriptPanel = dynamic(
  () =>
    import('@/components/business/studio/StudioScriptPanel').then(
      (mod) => mod.StudioScriptPanel,
    ),
  { loading: () => <PanelLoadingFallback /> },
)

// Krea-aligned panel dialog sizing — centred, capped width, vertical scroll
// inside the content area. Each panel picks the closest fit so the dialog
// doesn't feel oversized for short controls (civitai = one input) or
// cramped for longer flows (voice selector + audio params).
const DIALOG_BASE =
  '!gap-0 !p-0 max-h-[85vh] overflow-hidden border-border/40 bg-background shadow-2xl'
const DIALOG_BODY = 'overflow-y-auto px-5 pb-5 pt-1'
const DIALOG_HEADER =
  'flex items-center gap-2 border-b border-border/40 px-5 py-3 font-display text-sm font-medium'

type SpeakerVoiceSelectionTarget =
  | { mode: 'append' }
  | { mode: 'replace'; index: number }
  | null

/**
 * StudioDockPanelArea — Krea-style centred dialogs for every toolbar pill
 * that used to dock into the bottom-right 40% column. Each panel is its
 * own Dialog wired to `state.panels.X` and dispatches CLOSE_PANEL when
 * dismissed (overlay click, Esc, X button). No grid layout, no drawer —
 * one consistent floating surface across image / video / audio modes.
 *
 * Panels that already had their own popovers/dialogs (enhance, reverse,
 * transform, aspectRatio, refImage chip, style preset) intentionally
 * still live in their own files; this component owns only the ones that
 * used to render inline in the dock.
 */
export const StudioDockPanelArea = memo(function StudioDockPanelArea() {
  const { state, dispatch } = useStudioForm()
  const { imageUpload, civitai, styles } = useStudioData()
  const t = useTranslations('StudioV2')
  const tPanels = useTranslations('StudioPanels')
  const tBar = useTranslations('StudioToolbar')
  const { selectedModel: imageModel } = useImageModelOptions()
  const { selectedModel: videoModel } = useVideoModelOptions(
    state.selectedOptionId ?? '',
  )
  const isVideoMode = state.outputType === 'video'
  // Surface drives both the capability lookup *and* which model pool we read.
  // Video models live in useVideoModelOptions; otherwise we stay on the
  // image pool (style cards retain image-only semantics).
  const surfaceSelectedModel = isVideoMode ? videoModel : imageModel
  const [speakerVoiceSelectionTarget, setSpeakerVoiceSelectionTarget] =
    useState<SpeakerVoiceSelectionTarget>(null)

  const selectedStyleCard = styles.activeCard
  const adapterType =
    state.workflowMode === 'quick' && surfaceSelectedModel
      ? surfaceSelectedModel.adapterType
      : ((selectedStyleCard?.adapterType as AI_ADAPTER_TYPES) ??
        AI_ADAPTER_TYPES.FAL)
  const modelId =
    state.workflowMode === 'quick' && surfaceSelectedModel
      ? surfaceSelectedModel.modelId
      : (selectedStyleCard?.modelId ?? undefined)
  // Step 3 routes by outputType: video models go through the video surface so
  // Veo 3.1 reference-to-video gets its real 3-image capacity instead of the
  // FAL adapter default (1).
  const referenceCapability = getReferenceCapability(
    isVideoMode ? 'video' : 'image',
    adapterType,
    modelId,
  )
  const maxRefImages = getReferenceCapabilityMax(referenceCapability)

  useEffect(() => {
    imageUpload.setMaxImages(maxRefImages)
  }, [maxRefImages, imageUpload])

  const closePanel = useCallback(
    (panel: PanelName) => {
      dispatch({ type: 'CLOSE_PANEL', payload: panel })
    },
    [dispatch],
  )

  const requestSpeakerVoiceSelect = useCallback((index: number | null) => {
    setSpeakerVoiceSelectionTarget(
      index === null ? { mode: 'append' } : { mode: 'replace', index },
    )
  }, [])

  // Speaker voice IDs are normalized by the reducer
  // (`SET_AUDIO_SPEAKER_VOICE_IDS`), so this handler stays focused on append
  // vs. replace semantics and trusts the reducer for de-dup / cap / trim.
  const handleSpeakerVoiceSelect = useCallback(
    (voiceId: string) => {
      if (!speakerVoiceSelectionTarget) return

      const nextSpeakerVoiceIds = [...state.audioSpeakerVoiceIds]
      if (speakerVoiceSelectionTarget.mode === 'append') {
        nextSpeakerVoiceIds.push(voiceId)
      } else {
        nextSpeakerVoiceIds[speakerVoiceSelectionTarget.index] = voiceId
      }

      dispatch({
        type: 'SET_AUDIO_SPEAKER_VOICE_IDS',
        payload: nextSpeakerVoiceIds,
      })
      setSpeakerVoiceSelectionTarget(null)
    },
    [dispatch, speakerVoiceSelectionTarget, state.audioSpeakerVoiceIds],
  )

  const handleVoiceSelectComplete = useCallback(() => {
    setSpeakerVoiceSelectionTarget(null)
    closePanel('voiceSelector')
  }, [closePanel])

  const handleSaveToken = useCallback(async () => {
    if (!state.tokenInput.trim()) return
    const ok = await civitai.save(state.tokenInput.trim())
    if (ok) {
      dispatch({ type: 'SET_TOKEN_INPUT', payload: '' })
    }
  }, [state.tokenInput, civitai, dispatch])

  const activeSpeakerVoiceIndex =
    speakerVoiceSelectionTarget?.mode === 'replace'
      ? speakerVoiceSelectionTarget.index
      : null
  const selectedSpeakerVoiceId =
    activeSpeakerVoiceIndex === null
      ? null
      : (state.audioSpeakerVoiceIds[activeSpeakerVoiceIndex] ?? null)
  const isSelectingSpeakerVoice = speakerVoiceSelectionTarget !== null

  return (
    <>
      {/* ── Civitai Token ────────────────────────────────────── */}
      <Dialog
        open={state.panels.civitai}
        onOpenChange={(open) => {
          if (!open) closePanel('civitai')
        }}
      >
        <DialogContent className={`${DIALOG_BASE} !max-w-md`}>
          <DialogTitle className={DIALOG_HEADER}>
            <Key className="size-3.5 text-primary" />
            {tPanels('civitai')}
            {civitai.hasToken && (
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                {t('tokenSaved')}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {tPanels('civitai')}
          </DialogDescription>
          <div className={DIALOG_BODY}>
            <div className="flex flex-col gap-2">
              <input
                type="password"
                value={state.tokenInput}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_TOKEN_INPUT',
                    payload: e.target.value,
                  })
                }
                placeholder={t('tokenPlaceholder')}
                className="w-full rounded-md border border-border/60 bg-background px-2.5 py-2 text-xs font-mono focus:border-primary/40 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveToken}
                  disabled={!state.tokenInput.trim()}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40"
                >
                  {t('save')}
                </button>
                {civitai.hasToken && (
                  <button
                    type="button"
                    onClick={() => civitai.remove()}
                    className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/5"
                  >
                    {t('removeToken')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Reference Image ──────────────────────────────────── */}
      <Dialog
        open={state.panels.refImage}
        onOpenChange={(open) => {
          if (!open) closePanel('refImage')
        }}
      >
        <DialogContent className={`${DIALOG_BASE} !max-w-xl`}>
          <DialogTitle className={DIALOG_HEADER}>
            {tPanels('reference')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {tPanels('reference')}
          </DialogDescription>
          <div className={DIALOG_BODY}>
            <ReferenceImageSection
              entries={imageUpload.referenceEntries}
              maxImages={maxRefImages}
              isDragging={imageUpload.isDragging}
              fileInputRef={imageUpload.fileInputRef}
              onDrop={imageUpload.handleDrop}
              onDragEnter={imageUpload.handleDragEnter}
              onDragOver={imageUpload.handleDragOver}
              onDragLeave={imageUpload.handleDragLeave}
              onOpenFilePicker={imageUpload.openFilePicker}
              onInputChange={imageUpload.handleInputChange}
              onRemoveImage={imageUpload.removeReferenceImage}
              onClearAll={imageUpload.clearAllImages}
              previewAlt={t('referenceImage')}
              removeLabel={t('cancel')}
              uploadLabel={t('referenceImage')}
              formatsLabel="JPG · PNG · WEBP"
              counterLabel={`${imageUpload.referenceImages.length} / ${maxRefImages}`}
              overLimitTooltip={tPanels('referenceDisabledOverLimit', {
                max: maxRefImages,
              })}
              unsupportedTooltip={tPanels('referenceDisabledUnsupported')}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Layer Decompose ───────────────────────────────────── */}
      <Dialog
        open={state.panels.layerDecompose}
        onOpenChange={(open) => {
          if (!open) closePanel('layerDecompose')
        }}
      >
        <DialogContent className={`${DIALOG_BASE} !max-w-xl`}>
          <DialogTitle className={DIALOG_HEADER}>
            {tPanels('layers')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {tPanels('layers')}
          </DialogDescription>
          <div className={DIALOG_BODY}>
            <LayerDecomposePanel onAddAsReference={imageUpload.addFromUrl} />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Voice Selector + Audio Params (audio mode) ────────── */}
      <FishVoiceLibraryDialog
        open={state.panels.voiceSelector}
        onOpenChange={(open) => {
          if (!open) {
            setSpeakerVoiceSelectionTarget(null)
            closePanel('voiceSelector')
          }
        }}
        selectedVoiceId={selectedSpeakerVoiceId}
        onSelectVoiceId={
          isSelectingSpeakerVoice ? handleSpeakerVoiceSelect : undefined
        }
        onVoiceSelectComplete={handleVoiceSelectComplete}
        sidePanel={
          <StudioAudioParams
            voiceCardId={state.voiceCardId}
            pace={state.audioPace}
            pauseMarkers={state.audioPauseMarkers}
            advanced={{
              style: state.audioEmotion,
              volume: state.audioVolume,
              normalizeLoudness: state.audioNormalizeLoudness,
              normalizeText: state.audioNormalizeText,
              withTimestamps: state.audioWithTimestamps,
              format: state.audioFormat,
              sampleRate: state.audioSampleRate,
              mp3Bitrate: state.audioMp3Bitrate,
              opusBitrate: state.audioOpusBitrate,
              latency: state.audioLatency,
              temperature: state.audioTemperature,
              topP: state.audioTopP,
              chunkLength: state.audioChunkLength,
              repetitionPenalty: state.audioRepetitionPenalty,
              speakerVoiceIds: state.audioSpeakerVoiceIds,
            }}
            onChangePace={(pace) =>
              dispatch({ type: 'SET_AUDIO_PACE', payload: pace })
            }
            onChangePauseMarkers={(markers) =>
              dispatch({
                type: 'SET_AUDIO_PAUSE_MARKERS',
                payload: markers,
              })
            }
            onChangeAdvanced={(settings) => {
              if (settings.style !== undefined) {
                dispatch({
                  type: 'SET_AUDIO_EMOTION',
                  payload: settings.style,
                })
              }
              if (settings.volume !== undefined) {
                dispatch({
                  type: 'SET_AUDIO_VOLUME',
                  payload: settings.volume,
                })
              }
              if (settings.normalizeLoudness !== undefined) {
                dispatch({
                  type: 'SET_AUDIO_NORMALIZE_LOUDNESS',
                  payload: settings.normalizeLoudness,
                })
              }
              if (settings.normalizeText !== undefined) {
                dispatch({
                  type: 'SET_AUDIO_NORMALIZE_TEXT',
                  payload: settings.normalizeText,
                })
              }
              if (settings.withTimestamps !== undefined) {
                dispatch({
                  type: 'SET_AUDIO_WITH_TIMESTAMPS',
                  payload: settings.withTimestamps,
                })
              }
              if (settings.format !== undefined) {
                dispatch({
                  type: 'SET_AUDIO_FORMAT',
                  payload: settings.format,
                })
              }
              if (settings.sampleRate !== undefined) {
                dispatch({
                  type: 'SET_AUDIO_SAMPLE_RATE',
                  payload: settings.sampleRate,
                })
              }
              if (settings.mp3Bitrate !== undefined) {
                dispatch({
                  type: 'SET_AUDIO_MP3_BITRATE',
                  payload: settings.mp3Bitrate,
                })
              }
              if (settings.opusBitrate !== undefined) {
                dispatch({
                  type: 'SET_AUDIO_OPUS_BITRATE',
                  payload: settings.opusBitrate,
                })
              }
              if (settings.latency !== undefined) {
                dispatch({
                  type: 'SET_AUDIO_LATENCY',
                  payload: settings.latency,
                })
              }
              if (settings.temperature !== undefined) {
                dispatch({
                  type: 'SET_AUDIO_TEMPERATURE',
                  payload: settings.temperature,
                })
              }
              if (settings.topP !== undefined) {
                dispatch({
                  type: 'SET_AUDIO_TOP_P',
                  payload: settings.topP,
                })
              }
              if (settings.chunkLength !== undefined) {
                dispatch({
                  type: 'SET_AUDIO_CHUNK_LENGTH',
                  payload: settings.chunkLength,
                })
              }
              if (settings.repetitionPenalty !== undefined) {
                dispatch({
                  type: 'SET_AUDIO_REPETITION_PENALTY',
                  payload: settings.repetitionPenalty,
                })
              }
              if (settings.speakerVoiceIds !== undefined) {
                dispatch({
                  type: 'SET_AUDIO_SPEAKER_VOICE_IDS',
                  payload: settings.speakerVoiceIds,
                })
              }
            }}
            onRequestSpeakerVoiceSelect={requestSpeakerVoiceSelect}
            isSelectingSpeakerVoice={isSelectingSpeakerVoice}
            activeSpeakerVoiceIndex={activeSpeakerVoiceIndex}
            audioReferenceUrl={state.audioReferenceUrl}
            audioReferenceFileName={state.audioReferenceFileName}
            audioReferenceText={state.audioReferenceText}
            onChangeAudioReferenceUpload={(payload) =>
              dispatch({
                type: 'SET_AUDIO_REFERENCE_UPLOAD',
                payload,
              })
            }
            onChangeAudioReferenceText={(text) =>
              dispatch({
                type: 'SET_AUDIO_REFERENCE_TEXT',
                payload: text,
              })
            }
          />
        }
      />

      {/* ── Voice Trainer (audio mode) ────────────────────────── */}
      <Dialog
        open={state.panels.voiceTrainer}
        onOpenChange={(open) => {
          if (!open) closePanel('voiceTrainer')
        }}
      >
        <DialogContent className={`${DIALOG_BASE} !max-w-xl`}>
          <DialogTitle className={DIALOG_HEADER}>{tBar('clone')}</DialogTitle>
          <DialogDescription className="sr-only">
            {tBar('clone')}
          </DialogDescription>
          <div className={DIALOG_BODY}>
            <VoiceTrainer />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Audio Transcribe (audio mode) ─────────────────────── */}
      <Dialog
        open={state.panels.audioTranscribe}
        onOpenChange={(open) => {
          if (!open) closePanel('audioTranscribe')
        }}
      >
        <DialogContent className={`${DIALOG_BASE} !max-w-xl`}>
          <DialogTitle className={DIALOG_HEADER}>
            {tBar('transcribe')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {tBar('transcribe')}
          </DialogDescription>
          <div className={DIALOG_BODY}>
            <AudioTranscribeDialog
              onComplete={() => closePanel('audioTranscribe')}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Video Params (video mode) ─────────────────────────── */}
      <Dialog
        open={state.panels.videoParams}
        onOpenChange={(open) => {
          if (!open) closePanel('videoParams')
        }}
      >
        <DialogContent className={`${DIALOG_BASE} !max-w-xl`}>
          <DialogTitle className={DIALOG_HEADER}>
            {tPanels('videoSettings')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {tPanels('videoSettings')}
          </DialogDescription>
          <div className={DIALOG_BODY}>
            <StudioVideoParams />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Video Script (video mode) ─────────────────────────── */}
      <Dialog
        open={state.panels.script}
        onOpenChange={(open) => {
          if (!open) closePanel('script')
        }}
      >
        <DialogContent className={`${DIALOG_BASE} !max-w-2xl`}>
          <DialogTitle className={DIALOG_HEADER}>
            {tPanels('script')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {tPanels('script')}
          </DialogDescription>
          <div className={DIALOG_BODY}>
            <StudioScriptPanel />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
})
