'use client'

import { memo, useCallback, useEffect, useState } from 'react'
import { Key } from 'lucide-react'
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
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
} from '@/components/ui/responsive-dialog'
import { Spinner } from '@/components/ui/spinner'
import {
  StudioPanelHeader,
  studioDialogBaseClass,
  studioDialogBodyClass,
} from '@/components/business/studio-shared/primitives/tool-surface'
import type { SelectedVoice } from '@/components/business/node/VoiceSelector'
import { useStudioAudioParamsProps } from '@/hooks/use-studio-audio-params'

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
      <Spinner size="lg" className="text-muted-foreground" />
    </div>
  )
}

const FishVoiceLibraryDialog = dynamic(
  () =>
    import('@/components/business/node/FishVoiceLibraryDialog').then(
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
const StudioScriptPanel = dynamic(
  () =>
    import('@/components/business/studio/StudioScriptPanel').then(
      (mod) => mod.StudioScriptPanel,
    ),
  { loading: () => <PanelLoadingFallback /> },
)
const StudioVideoAudioPanel = dynamic(
  () =>
    import('@/components/business/studio/StudioVideoAudioPanel').then(
      (mod) => mod.StudioVideoAudioPanel,
    ),
  { loading: () => <PanelLoadingFallback /> },
)

// Krea-aligned panel dialog sizing — centred, capped width, vertical scroll
// inside the content area. Each panel picks the closest fit so the dialog
// doesn't feel oversized for short controls (civitai = one input) or
// cramped for longer flows (voice selector + audio params).
// Chrome 类来自 tool-surface（决议 5 工具面板契约），与助手等 Dialog 型面板共用。
const DIALOG_BASE = studioDialogBaseClass
const DIALOG_BODY = studioDialogBodyClass

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
  // 那 40 个受控 props 的拼装搬进了 hook —— 参数面板现在有三个宿主
  // （音色库这一份 + 参数栏的浮层与折叠行），拼装留在宿主里就会被复制三遍。
  const audioParamsProps = useStudioAudioParamsProps()
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
  // Route by outputType: video models go through the video surface so
  // model-specific multi-reference limits override the FAL adapter default.
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
    (voice: SelectedVoice) => {
      if (!speakerVoiceSelectionTarget) return

      const nextSpeakerVoiceIds = [...state.audioSpeakerVoiceIds]
      if (speakerVoiceSelectionTarget.mode === 'append') {
        nextSpeakerVoiceIds.push(voice.voiceId)
      } else {
        nextSpeakerVoiceIds[speakerVoiceSelectionTarget.index] = voice.voiceId
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
      <ResponsiveDialog
        open={state.panels.civitai}
        onOpenChange={(open) => {
          if (!open) closePanel('civitai')
        }}
      >
        <ResponsiveDialogContent className={`${DIALOG_BASE} !max-w-md`}>
          <StudioPanelHeader icon={<Key className="size-3.5 text-primary" />}>
            {tPanels('civitai')}
            {civitai.hasToken && (
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                {t('tokenSaved')}
              </span>
            )}
          </StudioPanelHeader>
          <ResponsiveDialogDescription className="sr-only">
            {tPanels('civitai')}
          </ResponsiveDialogDescription>
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
        </ResponsiveDialogContent>
      </ResponsiveDialog>

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
            {...audioParamsProps}
            section="voice"
            onRequestSpeakerVoiceSelect={requestSpeakerVoiceSelect}
            isSelectingSpeakerVoice={isSelectingSpeakerVoice}
            activeSpeakerVoiceIndex={activeSpeakerVoiceIndex}
          />
        }
      />

      {/* ── Voice Trainer (audio mode) ────────────────────────── */}
      <ResponsiveDialog
        open={state.panels.voiceTrainer}
        onOpenChange={(open) => {
          if (!open) closePanel('voiceTrainer')
        }}
      >
        <ResponsiveDialogContent className={`${DIALOG_BASE} !max-w-xl`}>
          <StudioPanelHeader>{tBar('clone')}</StudioPanelHeader>
          <ResponsiveDialogDescription className="sr-only">
            {tBar('clone')}
          </ResponsiveDialogDescription>
          <div className={DIALOG_BODY}>
            {/* 选中态由工作台自己接——组件不再直接碰 StudioContext。 */}
            <VoiceTrainer
              onCreated={({ cardId, voiceId }) => {
                dispatch({ type: 'SET_VOICE_CARD_ID', payload: cardId })
                dispatch({ type: 'SET_VOICE_ID', payload: voiceId })
              }}
            />
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* ── Audio Transcribe (audio mode) ─────────────────────── */}
      <ResponsiveDialog
        open={state.panels.audioTranscribe}
        onOpenChange={(open) => {
          if (!open) closePanel('audioTranscribe')
        }}
      >
        <ResponsiveDialogContent className={`${DIALOG_BASE} !max-w-xl`}>
          <StudioPanelHeader>{tBar('transcribe')}</StudioPanelHeader>
          <ResponsiveDialogDescription className="sr-only">
            {tBar('transcribe')}
          </ResponsiveDialogDescription>
          <div className={DIALOG_BODY}>
            <AudioTranscribeDialog
              onComplete={() => closePanel('audioTranscribe')}
            />
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* ⚠ 「高级设置」对话框（seed 锁定 + 负面提示词）已于 2026-08-23 切片 A
          整条删除。它自 2026-08-18 图片模态改走横向工作台起就**不可达** ——
          唯一的宿主是当时的 `StudioBottomDock`，而图片不挂载它；负面提示词
          已由参数栏的折叠行承担（owner 2026-08-22），seed 则是 owner 同日
          明确「不介入」。切片 A 把这个宿主挂到了 `StudioWorkspaceUI` 上，
          不删它就等于凭空复活一个被否掉的 seed 入口 + 第二个负面输入框。
          ⚠ `advancedParams.seed` 字段与生成管线都还在，删的只是 UI 门。 */}

      {/* ⚠ 「视频设置」对话框已于 2026-08-23 切片 B 退役：时长 / 分辨率 / 宽高比
          并进参数栏的「规格」浮层（`StudioVideoSpecPopover`，与图片同一形态），
          反向提示词并进参数栏的折叠行。参数常驻可见，不用点开才知道当前值。 */}

      {/* ── Video audio references (video mode) ─────────────────
          台账 A（owner 2026-08-29）：工作台此前完全没有挂音频的地方，而后端
          三层（schema / service / worker）早就通了。面板宿主与「剧本」同款。 */}
      <ResponsiveDialog
        open={state.panels.videoAudio}
        onOpenChange={(open) => {
          if (!open) closePanel('videoAudio')
        }}
      >
        <ResponsiveDialogContent className={`${DIALOG_BASE} !max-w-lg`}>
          <StudioPanelHeader>{tPanels('videoAudio')}</StudioPanelHeader>
          <ResponsiveDialogDescription className="sr-only">
            {tPanels('videoAudio')}
          </ResponsiveDialogDescription>
          <div className={DIALOG_BODY}>
            <StudioVideoAudioPanel />
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* ── Video Script (video mode) ─────────────────────────── */}
      <ResponsiveDialog
        open={state.panels.script}
        onOpenChange={(open) => {
          if (!open) closePanel('script')
        }}
      >
        <ResponsiveDialogContent className={`${DIALOG_BASE} !max-w-2xl`}>
          <StudioPanelHeader>{tPanels('script')}</StudioPanelHeader>
          <ResponsiveDialogDescription className="sr-only">
            {tPanels('script')}
          </ResponsiveDialogDescription>
          <div className={DIALOG_BODY}>
            <StudioScriptPanel />
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  )
})
