import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import {
  AUDIO_KINDS,
  DEFAULT_AUDIO_KIND,
  isAudioKind,
  type AudioKind,
} from '@/constants/audio-options'
import type { StudioFormState } from '@/contexts/studio-context'
import type {
  AssistantOperatorAudioPatch,
  AssistantOperatorSnapshot,
} from '@/types/assistant-operator'
import type { StudioAction } from '@/contexts/studio-context'
import type { StudioModelOption } from '@/types/model-option'

/**
 * 配音台的快照与落笔（第 9b 步）。纯函数：宿主把表单与三档模型清单喂进来。
 *
 * ⭐ 模型给的是**选项 id**（表单存的就是它），三档全给：换档时模型要跟着换到那一档。
 * ⭐ 同一个型号多条线路只留一条（有 key 的那条优先）：线路由模型选择器管，助手只换型号。
 */

export type StudioAudioForm = Pick<
  StudioFormState,
  | 'prompt'
  | 'audioKind'
  | 'voiceId'
  | 'voiceCardId'
  | 'audioSpeakerVoiceIds'
  | 'pronunciationDictionary'
  | 'audioReferenceUrl'
  | 'audioReferenceFileName'
  | 'audioReferenceText'
  | 'audioEmotion'
  | 'audioExpressiveness'
  | 'audioPace'
  | 'audioPauseMarkers'
  | 'audioSfxDurationSeconds'
  | 'audioMusicDurationSeconds'
  | 'audioSfxLoop'
  | 'audioSfxVariantCount'
  | 'audioVolume'
  | 'audioTemperature'
  | 'audioTopP'
  | 'audioFormat'
>

const clampLabel = (value: string) => {
  const max = ASSISTANT_OPERATOR_LIMITS.maxLabelChars
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function onePerModel(
  options: readonly StudioModelOption[],
): StudioModelOption[] {
  const byModel = new Map<string, StudioModelOption>()
  for (const option of options) {
    const kept = byModel.get(option.modelId)
    const runnable = Boolean(option.keyId || option.providerKeyId)
    if (!kept || (runnable && !(kept.keyId || kept.providerKeyId)))
      byModel.set(option.modelId, option)
  }
  return [...byModel.values()]
}

export function buildAudioOperatorSnapshot({
  form,
  modelsByKind,
  selectedModel,
  labelOf,
}: {
  form: StudioAudioForm
  modelsByKind: Readonly<Record<AudioKind, readonly StudioModelOption[]>>
  selectedModel: StudioModelOption | undefined
  labelOf: (option: StudioModelOption) => string
}): AssistantOperatorSnapshot {
  const kind = isAudioKind(form.audioKind) ? form.audioKind : DEFAULT_AUDIO_KIND
  const models = AUDIO_KINDS.flatMap((modelKind) =>
    onePerModel(modelsByKind[modelKind]).map((option) => ({
      id: option.optionId,
      label: clampLabel(labelOf(option)),
      kind: modelKind,
    })),
  ).slice(0, ASSISTANT_OPERATOR_LIMITS.maxAvailableModels)
  return {
    prompt: form.prompt,
    model: selectedModel
      ? {
          id: selectedModel.optionId,
          label: clampLabel(labelOf(selectedModel)),
          catalogId: selectedModel.modelId,
        }
      : null,
    availableModels: models.map(({ id, label }) => ({ id, label })),
    audio: {
      kind,
      models,
      voice: { cardId: form.voiceCardId, voiceId: form.voiceId },
      speakerVoiceIds: form.audioSpeakerVoiceIds,
      pronunciationDictionary: form.pronunciationDictionary,
      reference: form.audioReferenceUrl
        ? {
            fileName: form.audioReferenceFileName
              ? clampLabel(form.audioReferenceFileName)
              : null,
            hasText: form.audioReferenceText.trim().length > 0,
          }
        : null,
      style: form.audioEmotion,
      expressiveness: form.audioExpressiveness,
      pace: form.audioPace,
      pauseMarkers: form.audioPauseMarkers,
      sfxDurationSeconds: form.audioSfxDurationSeconds,
      musicDurationSeconds: form.audioMusicDurationSeconds,
      sfxLoop: form.audioSfxLoop,
      sfxVariantCount: form.audioSfxVariantCount,
      volume: form.audioVolume,
      temperature: form.audioTemperature,
      topP: form.audioTopP,
      format: form.audioFormat,
    },
  }
}

/**
 * `set_audio` 落到表单（撤销给的是改前那几格，同一条路）。⚠ 一格一个 action，只派发给了的那几格：
 * 没给的那格 ⛔ 不能当成「设回默认」。
 */
export function audioPatchActions(
  patch: AssistantOperatorAudioPatch,
): StudioAction[] {
  const actions: StudioAction[] = []
  if (patch.kind !== undefined)
    actions.push({ type: 'SET_AUDIO_KIND', payload: patch.kind })
  if (patch.optionId !== undefined)
    actions.push({ type: 'SET_OPTION_ID', payload: patch.optionId })
  if (patch.voice !== undefined) {
    actions.push({ type: 'SET_VOICE_CARD_ID', payload: patch.voice.cardId })
    actions.push({ type: 'SET_VOICE_ID', payload: patch.voice.voiceId })
  }
  if (patch.speakerVoiceIds !== undefined)
    actions.push({
      type: 'SET_AUDIO_SPEAKER_VOICE_IDS',
      payload: patch.speakerVoiceIds,
    })
  if (patch.pronunciationDictionary !== undefined)
    actions.push({
      type: 'SET_PRONUNCIATION_DICTIONARY',
      payload: patch.pronunciationDictionary,
    })
  if (patch.style !== undefined)
    actions.push({ type: 'SET_AUDIO_EMOTION', payload: patch.style })
  if (patch.expressiveness !== undefined)
    actions.push({
      type: 'SET_AUDIO_EXPRESSIVENESS',
      payload: patch.expressiveness,
    })
  if (patch.pace !== undefined)
    actions.push({ type: 'SET_AUDIO_PACE', payload: patch.pace })
  if (patch.pauseMarkers !== undefined)
    actions.push({
      type: 'SET_AUDIO_PAUSE_MARKERS',
      payload: patch.pauseMarkers,
    })
  if (patch.sfxDurationSeconds !== undefined)
    actions.push({
      type: 'SET_AUDIO_SFX_DURATION',
      payload: patch.sfxDurationSeconds,
    })
  if (patch.musicDurationSeconds !== undefined)
    actions.push({
      type: 'SET_AUDIO_MUSIC_DURATION',
      payload: patch.musicDurationSeconds,
    })
  if (patch.sfxLoop !== undefined)
    actions.push({ type: 'SET_AUDIO_SFX_LOOP', payload: patch.sfxLoop })
  if (patch.sfxVariantCount !== undefined)
    actions.push({
      type: 'SET_AUDIO_SFX_VARIANT_COUNT',
      payload: patch.sfxVariantCount,
    })
  if (patch.volume !== undefined)
    actions.push({ type: 'SET_AUDIO_VOLUME', payload: patch.volume })
  if (patch.temperature !== undefined)
    actions.push({ type: 'SET_AUDIO_TEMPERATURE', payload: patch.temperature })
  if (patch.topP !== undefined)
    actions.push({ type: 'SET_AUDIO_TOP_P', payload: patch.topP })
  if (patch.format !== undefined)
    actions.push({ type: 'SET_AUDIO_FORMAT', payload: patch.format })
  return actions
}
