'use client'

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  IdCard,
  Loader2,
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
import { NODE_STATUS_IDS } from '@/constants/node-types'
import { uploadReferenceAudioAPI } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { ParamSlider } from '@/components/ui/param-slider'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { FishVoiceLibraryDialog } from '../FishVoiceLibraryDialog'
import { IMEAwareTextarea } from '../inspector/IMEAwareField'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeActionButton, NodeModelSelector } from '../nodes/NodeCardControls'
import type { NodeDetailBodyProps } from './registry'

function stopCanvasKeyboardEvent(event: ReactKeyboardEvent<HTMLElement>): void {
  event.stopPropagation()
}

function hasVoiceContent(data: NodeWorkflowNodeData): boolean {
  return Boolean(
    data.dialogue?.trim() ||
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

const SECTION_LABEL =
  'text-2xs font-semibold uppercase tracking-nav-dense text-node-muted'

/**
 * Detail body for voice (声音) nodes (b3 draft): 台词 → 音色 (system / mine
 * source segment + library picker + reference preview) → 情绪 chips → 生成.
 * Built fresh (neutral, no amber); the speed/pitch/volume sliders are omitted
 * because no backing fields exist yet. Emotion is stored as metadata on
 * `voiceEmotion`; the green generate speaks the 台词 via `generateMediaNode`.
 */
export function VoiceDetailBody({ nodeId, type, data }: NodeDetailBodyProps) {
  const t = useTranslations('StudioNode.voiceDetail')
  const tVoice = useTranslations('StudioNode.voiceProfile')
  const tFields = useTranslations('StudioNode.workflowFields')
  const tDetail = useTranslations('StudioNode.nodeDetail')
  const { updateNodeData, generateMediaNode } = useNodeWorkflowActions()

  const inputRef = useRef<HTMLInputElement>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
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
    (voiceId: string) => {
      applyPatch({
        voiceId,
        voiceProvider:
          data.voiceProvider || NODE_STUDIO_VOICE_PROFILE.providerDefault,
        voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio,
      })
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
      voiceSource: data.voiceId
        ? NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio
        : NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.manual,
    })
  }, [applyPatch, data.voiceId])

  const selectedEmotion = (
    NODE_STUDIO_VOICE_EMOTIONS as readonly string[]
  ).includes(data.voiceEmotion ?? '')
    ? (data.voiceEmotion as string)
    : NODE_STUDIO_VOICE_EMOTION_IDS.none

  const voiceTriggerLabel =
    data.voiceName?.trim() || data.voiceId?.trim() || tVoice('chooseVoice')

  return (
    <div className="space-y-4">
      {/* §A 台词 */}
      <label className="block space-y-2">
        <span className={SECTION_LABEL}>{tFields('dialogue.label')}</span>
        <IMEAwareTextarea
          value={data.dialogue ?? ''}
          onValueChange={(next) => applyPatch({ dialogue: next })}
          onKeyDownCapture={stopCanvasKeyboardEvent}
          onKeyUpCapture={stopCanvasKeyboardEvent}
          aria-label={tFields('dialogue.label')}
          placeholder={tFields('dialogue.placeholder')}
          className="nodrag nopan nowheel min-h-20 w-full resize-y rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-sm leading-6 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
        />
      </label>

      {/* §B 音色 */}
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

        {activeSource === NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio ? (
          <button
            type="button"
            onClick={() => setLibraryOpen(true)}
            onKeyDownCapture={stopCanvasKeyboardEvent}
            className="nodrag flex w-full items-center gap-2 rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 py-2.5 text-left text-sm text-node-foreground transition-colors hover:bg-node-panel-inner"
          >
            <IdCard className="size-4 shrink-0 text-node-muted" />
            <span className="min-w-0 flex-1 truncate">{voiceTriggerLabel}</span>
          </button>
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
                <div className="flex items-center gap-2 rounded-xl border border-node-panel-inner bg-node-panel-soft p-2">
                  <Music2 className="size-4 shrink-0 text-node-muted" />
                  <p className="min-w-0 flex-1 truncate text-xs font-semibold text-node-foreground">
                    {data.voiceReferenceAudioName ??
                      tVoice('referenceAudioFallback')}
                  </p>
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
            )}
          </div>
        )}
      </div>

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

      {/* §E 生成 */}
      <NodeModelSelector nodeId={nodeId} type={type} data={data} />
      <NodeActionButton
        disabled={!data.dialogue?.trim()}
        onClick={() => void generateMediaNode?.(nodeId)}
      >
        <WandSparkles className="mr-1.5 size-4" />
        {tDetail('generate')}
      </NodeActionButton>

      <FishVoiceLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        selectedVoiceId={data.voiceId ?? null}
        onSelectVoiceId={handleSelectVoiceId}
        onVoiceSelectComplete={() => setLibraryOpen(false)}
      />
    </div>
  )
}
