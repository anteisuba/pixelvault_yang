import 'server-only'

import {
  AUDIO_EXPRESSIVENESS_VALUES,
  AUDIO_FORMATS,
  AUDIO_KINDS,
  MUSIC_DURATION_RANGE,
  SFX_DURATION_RANGE,
  SFX_VARIANT_COUNTS,
  TTS_TEMPERATURE_RANGE,
  TTS_TOP_P_RANGE,
  TTS_VOLUME_RANGE,
  type AudioKind,
} from '@/constants/audio-options'
import { ASSISTANT_OPERATOR_TOOL_IDS as TOOL } from '@/constants/assistant-operator'
import {
  AUDIO_PACES,
  AUDIO_PAUSE_MARKERS,
  AUDIO_STYLES,
} from '@/constants/voice-cards'
import { db } from '@/lib/db'
import type {
  AssistantOperatorAudioPatch,
  AssistantOperatorEvent,
  AssistantOperatorSnapshotAudio,
} from '@/types/assistant-operator'
import {
  refused,
  runOldTool,
} from '@/services/kernel/assistant-v3-bench.service'
import {
  TITLE_TEXT,
  type V3Context,
  type V3Outcome,
} from '@/services/kernel/assistant-v3-steps.service'
import { ASSISTANT_NEXT_EDIT_OP_IDS as OP } from '@/features/assistant/constants'
import type { EditChange } from '@/features/assistant/tools'

/**
 * 配音台（第 9b 步，owner 10-23）：板子怎么写、`edit` 的几种改法怎么落成一步 `set_audio`。
 *
 * ⭐ 音色按名字认：创作者音色库里的卡、或有声音的角色（「角色·名字」用她绑的那张卡，owner 10-23
 *   「班底只用她的音色」）。名单由服务端现查，⛔ 浏览器不报名字、模型不写音色 id。
 * ⭐ 出声一律出确认卡（owner 10-23「配音台不跟交给 AI 出图」）：板子上不写 LET AI GENERATE。
 */

const MAX_VOICES_ON_BOARD = 40
const MAX_TEXT_ON_BOARD = 2_000

interface AudioVoiceCard {
  readonly id: string
  readonly name: string
  readonly voiceId: string | null
  readonly modelId: string | null
  readonly pace: string
  readonly pronunciationDictionary: Record<string, string>
}

interface AudioVoices {
  readonly cards: readonly AudioVoiceCard[]
  /** 有声音的角色：名字 → 她绑的那张音色卡。 */
  readonly characters: readonly { name: string; cardId: string }[]
}

const NO_VOICES: AudioVoices = { cards: [], characters: [] }
const VOICES = new WeakMap<V3Context, AudioVoices>()

function dictionaryOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

/** 这一跳开头现查一次（音色库 + 有声音的角色），之后板子与改动都从这份读。 */
export async function loadAudioVoices(context: V3Context): Promise<void> {
  const userId = context.prepared.user.id
  const [cards, characters] = await Promise.all([
    db.voiceCard.findMany({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: MAX_VOICES_ON_BOARD,
      select: {
        id: true,
        name: true,
        voiceId: true,
        modelId: true,
        pace: true,
        pronunciationDictionary: true,
      },
    }),
    db.characterCard.findMany({
      where: { userId, isDeleted: false, voiceCardId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: MAX_VOICES_ON_BOARD,
      select: { name: true, voiceCardId: true },
    }),
  ])
  VOICES.set(context, {
    cards: cards.map((card) => ({
      ...card,
      pronunciationDictionary: dictionaryOf(card.pronunciationDictionary),
    })),
    characters: characters.flatMap((character) =>
      character.voiceCardId
        ? [{ name: character.name, cardId: character.voiceCardId }]
        : [],
    ),
  })
}

function voicesOf(context: V3Context): AudioVoices {
  return VOICES.get(context) ?? NO_VOICES
}

/** 台上现在的样子：开轮的快照叠上这一轮已经落下的改动（旧执行器的可变副本）。 */
function audioOf(context: V3Context): AssistantOperatorSnapshotAudio | null {
  return context.prepared.run.state.audio ?? null
}

function voiceName(context: V3Context, voiceId: string | null): string {
  if (!voiceId) return 'none'
  const card = voicesOf(context).cards.find((item) => item.voiceId === voiceId)
  return card ? card.name : 'a voice picked outside the library'
}

function clip(text: string, max: number): string {
  return text.length > max
    ? `${text.slice(0, max)}… (${text.length} chars)`
    : text
}

export function renderAudioBench(
  context: V3Context,
  attachedNames: readonly string[],
  latestUserText: string,
): string {
  const audio = audioOf(context)
  if (!audio) return 'AUDIO BENCH — not available.'
  const state = context.prepared.run.state
  const voices = voicesOf(context)
  const kind = audio.kind
  const lines = [
    'AUDIO BENCH — what is on it right now. Change it with edit.',
    `KIND: ${kind} (speech | sfx | music)`,
    `MODEL: ${state.modelLabel ?? state.modelId ?? 'none'}`,
    `MODELS: ${audio.models.map((model) => `${model.label} (${model.kind})`).join(' · ') || 'none'}`,
    `${kind === 'speech' ? 'TEXT — read out exactly as written' : 'DESCRIPTION — what it should sound like'}: ${state.prompt.trim() ? `"${clip(state.prompt, MAX_TEXT_ON_BOARD)}"` : '(empty)'}`,
  ]
  if (kind === 'speech') {
    const card = audio.voice.cardId
      ? voices.cards.find((item) => item.id === audio.voice.cardId)
      : null
    lines.push(
      `VOICE: ${card ? card.name : voiceName(context, audio.voice.voiceId)}`,
    )
    if (audio.speakerVoiceIds.length)
      lines.push(
        `SPEAKERS (<|speaker:N|> in the text): ${audio.speakerVoiceIds
          .map((id, index) => `${index + 1} ${voiceName(context, id)}`)
          .join(' · ')}`,
      )
    if (audio.reference)
      lines.push(
        `REFERENCE CLIP (zero-shot clone, used when no voice is set): ${audio.reference.fileName ?? 'uploaded'}${audio.reference.hasText ? '' : ' — its transcript is missing'}`,
      )
    lines.push(
      `READING: style ${audio.style} (${AUDIO_STYLES.join(' | ')}) · expressiveness ${audio.expressiveness} (${AUDIO_EXPRESSIVENESS_VALUES.join(' | ')}) · pace ${audio.pace} (${AUDIO_PACES.join(' | ')}) · pauses ${audio.pauseMarkers.join(', ') || 'none'} (${AUDIO_PAUSE_MARKERS.join(' | ')})`,
      `OPTIONS: volume ${audio.volume} (${TTS_VOLUME_RANGE.min}…${TTS_VOLUME_RANGE.max}) · temperature ${audio.temperature} · top_p ${audio.topP} · format ${audio.format} (${AUDIO_FORMATS.join(' | ')})`,
      `VOICE LIBRARY (edit voice by name): ${voices.cards.map((item) => item.name).join(' · ') || 'empty'}`,
      `CHARACTERS WITH A VOICE (edit voice "角色·<name>"): ${voices.characters.map((item) => item.name).join(' · ') || 'none'}`,
    )
  } else if (kind === 'sfx') {
    lines.push(
      `LENGTH: ${audio.sfxDurationSeconds}s (${SFX_DURATION_RANGE.min}…${SFX_DURATION_RANGE.max}) · loop ${audio.sfxLoop ? 'on' : 'off'} · variants ${audio.sfxVariantCount} (${SFX_VARIANT_COUNTS.join(' | ')})`,
    )
  } else {
    lines.push(
      `LENGTH: ${audio.musicDurationSeconds}s (${MUSIC_DURATION_RANGE.min}…${MUSIC_DURATION_RANGE.max})`,
    )
  }
  lines.push(
    'GENERATE: always a confirm card here; nothing is made until the creator presses it.',
  )
  if (attachedNames.length)
    lines.push(`ATTACHED TO THE MESSAGE: ${attachedNames.join(' · ')}`)
  lines.push(`THE CREATOR JUST SAID: ${latestUserText}`)
  return lines.join('\n')
}

type Resolved<T> = { ok: true; value: T } | { ok: false; error: string }

const norm = (text: string) => text.trim().toLowerCase()

/** 名字 → 音色库里那张卡：角色名（「角色·」可写可不写）先认，再认卡名（先全等、再包含）。 */
function cardByName(context: V3Context, raw: string): Resolved<AudioVoiceCard> {
  const voices = voicesOf(context)
  const name = norm(raw.replace(/^角色·/, ''))
  const character =
    voices.characters.find((item) => norm(item.name) === name) ?? null
  const byCharacter = character
    ? voices.cards.find((item) => item.id === character.cardId)
    : undefined
  if (byCharacter) return { ok: true, value: byCharacter }
  if (character)
    return {
      ok: false,
      error: `${character.name}'s voice card is not in the first ${MAX_VOICES_ON_BOARD} of the library; pick it in the voice library.`,
    }
  const card =
    voices.cards.find((item) => norm(item.name) === name) ??
    voices.cards.find((item) => norm(item.name).includes(name))
  if (card) return { ok: true, value: card }
  return {
    ok: false,
    error: `No voice called "${raw}". Use a name from VOICE LIBRARY or CHARACTERS WITH A VOICE on the bench; other voices are picked by the creator in the voice library.`,
  }
}

function modelByName(
  audio: AssistantOperatorSnapshotAudio,
  raw: string,
): AssistantOperatorSnapshotAudio['models'][number] | null {
  const name = norm(raw)
  return (
    audio.models.find(
      (model) =>
        norm(model.id) === name ||
        norm(model.id).endsWith(`:${name}`) ||
        norm(model.label) === name,
    ) ??
    audio.models.find((model) => norm(model.label).includes(name)) ??
    null
  )
}

function isKind(value: unknown): value is AudioKind {
  return AUDIO_KINDS.includes(value as AudioKind)
}

/** 配音台的一条改动 → `set_audio` 那一份（只带改的那几格）。认不出 / 越界说清是哪一格。 */
export function toAudioPatch(
  context: V3Context,
  change: EditChange,
): Resolved<AssistantOperatorAudioPatch> {
  const audio = audioOf(context)
  if (!audio) return { ok: false, error: 'This is not the audio bench.' }
  switch (change.op) {
    case OP.audioKind: {
      if (!isKind(change.value))
        return {
          ok: false,
          error: 'audio_kind value must be "speech", "sfx" or "music".',
        }
      const kind = change.value
      const current = audio.models.find(
        (model) => model.id === context.prepared.run.state.modelId,
      )
      const model =
        current?.kind === kind
          ? undefined
          : audio.models.find((option) => option.kind === kind)
      if (current?.kind !== kind && !model)
        return { ok: false, error: `No ${kind} model can run here.` }
      return {
        ok: true,
        value: { kind, ...(model ? { optionId: model.id } : {}) },
      }
    }
    case OP.model: {
      if (!change.model) return { ok: false, error: 'model needs model.' }
      const model = modelByName(audio, change.model)
      if (!model)
        return {
          ok: false,
          error: `No audio model "${change.model}". MODELS on the bench lists them.`,
        }
      return {
        ok: true,
        value: {
          optionId: model.id,
          ...(model.kind !== audio.kind ? { kind: model.kind } : {}),
        },
      }
    }
    case OP.voice: {
      const raw = change.voice?.trim()
      if (!raw)
        return { ok: false, error: 'voice needs voice (a name, or "none").' }
      if (norm(raw) === 'none')
        return { ok: true, value: { voice: { cardId: null, voiceId: null } } }
      const found = cardByName(context, raw)
      if (!found.ok) return found
      const card = found.value
      // 与音色库里点选这张卡同一件事：音色、它的语速与发音表，卡上记了模型就换过去。
      const model = card.modelId
        ? audio.models.find(
            (option) =>
              option.id === `workspace:${card.modelId}` ||
              option.id.endsWith(`:${card.modelId}`),
          )
        : undefined
      const pace = AUDIO_PACES.find((item) => item === card.pace)
      return {
        ok: true,
        value: {
          voice: { cardId: card.id, voiceId: card.voiceId },
          pronunciationDictionary: card.pronunciationDictionary,
          ...(pace ? { pace } : {}),
          ...(model && model.id !== context.prepared.run.state.modelId
            ? { optionId: model.id }
            : {}),
          ...(audio.kind !== 'speech' ? { kind: 'speech' as const } : {}),
        },
      }
    }
    case OP.speakers: {
      const names = change.voices ?? []
      const ids: string[] = []
      for (const name of names) {
        const found = cardByName(context, name)
        if (!found.ok) return found
        if (!found.value.voiceId)
          return {
            ok: false,
            error: `${found.value.name} has no library voice id (a cloned clip only), so it cannot be a speaker.`,
          }
        ids.push(found.value.voiceId)
      }
      return { ok: true, value: { speakerVoiceIds: ids } }
    }
    case OP.reading: {
      const value: AssistantOperatorAudioPatch = {
        ...(change.style ? { style: change.style } : {}),
        ...(change.expressiveness
          ? { expressiveness: change.expressiveness }
          : {}),
        ...(change.pace ? { pace: change.pace } : {}),
        ...(change.pauses ? { pauseMarkers: change.pauses } : {}),
      }
      if (Object.keys(value).length === 0)
        return {
          ok: false,
          error:
            'reading needs at least one of style, expressiveness, pace, pauses.',
        }
      return { ok: true, value }
    }
    case OP.duration: {
      const seconds = change.duration
      if (typeof seconds !== 'number')
        return { ok: false, error: 'duration needs duration (seconds).' }
      if (audio.kind === 'sfx') {
        if (
          seconds < SFX_DURATION_RANGE.min ||
          seconds > SFX_DURATION_RANGE.max
        )
          return {
            ok: false,
            error: `A sound effect is ${SFX_DURATION_RANGE.min}–${SFX_DURATION_RANGE.max}s.`,
          }
        return {
          ok: true,
          value: {
            sfxDurationSeconds:
              Math.round(seconds / SFX_DURATION_RANGE.step) *
              SFX_DURATION_RANGE.step,
          },
        }
      }
      if (audio.kind === 'music') {
        const rounded =
          Math.round(seconds / MUSIC_DURATION_RANGE.step) *
          MUSIC_DURATION_RANGE.step
        if (
          rounded < MUSIC_DURATION_RANGE.min ||
          rounded > MUSIC_DURATION_RANGE.max
        )
          return {
            ok: false,
            error: `Music is ${MUSIC_DURATION_RANGE.min}–${MUSIC_DURATION_RANGE.max}s.`,
          }
        return { ok: true, value: { musicDurationSeconds: rounded } }
      }
      return {
        ok: false,
        error: 'Speech has no length setting: its length is the text.',
      }
    }
    case OP.option:
      return optionPatch(change)
    default:
      return {
        ok: false,
        error: `"${change.op}" is not a control on the audio bench. It has: prompt, model, audio_kind, voice, speakers, reading, duration, option (and the library ops, which work everywhere).`,
      }
  }
}

function inRange(
  value: unknown,
  range: { min: number; max: number },
): value is number {
  return typeof value === 'number' && value >= range.min && value <= range.max
}

function optionPatch(
  change: EditChange,
): Resolved<AssistantOperatorAudioPatch> {
  const key = norm(change.key ?? '')
  const value = change.value
  const bad = (expected: string): Resolved<AssistantOperatorAudioPatch> => ({
    ok: false,
    error: `option ${key} must be ${expected}.`,
  })
  switch (key) {
    case 'loop':
      return typeof value === 'boolean'
        ? { ok: true, value: { sfxLoop: value } }
        : bad('true or false')
    case 'variants': {
      const count = SFX_VARIANT_COUNTS.find((item) => item === Number(value))
      return count
        ? { ok: true, value: { sfxVariantCount: count } }
        : bad(SFX_VARIANT_COUNTS.join(' | '))
    }
    case 'volume':
      return inRange(value, TTS_VOLUME_RANGE)
        ? { ok: true, value: { volume: value } }
        : bad(`${TTS_VOLUME_RANGE.min}…${TTS_VOLUME_RANGE.max}`)
    case 'temperature':
      return inRange(value, TTS_TEMPERATURE_RANGE)
        ? { ok: true, value: { temperature: value } }
        : bad(`${TTS_TEMPERATURE_RANGE.min}…${TTS_TEMPERATURE_RANGE.max}`)
    case 'top_p':
    case 'topp':
      return inRange(value, TTS_TOP_P_RANGE)
        ? { ok: true, value: { topP: value } }
        : bad(`${TTS_TOP_P_RANGE.min}…${TTS_TOP_P_RANGE.max}`)
    case 'format': {
      const format = AUDIO_FORMATS.find((item) => item === value)
      return format
        ? { ok: true, value: { format } }
        : bad(AUDIO_FORMATS.join(' | '))
    }
    default:
      return {
        ok: false,
        error:
          'option key on the audio bench is one of: loop, variants, volume, temperature, top_p, format.',
      }
  }
}

/** 一条改动落成一步（过程行带撤销）；落不成就回一句哪里不对。 */
export async function* runAudioChange(
  context: V3Context,
  change: EditChange,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const text = TITLE_TEXT[context.language]
  const title =
    change.op === OP.voice && change.voice
      ? `${text.audio}「${change.voice.trim()}」`
      : text.audio
  const patch = toAudioPatch(context, change)
  if (!patch.ok)
    return yield* refused(context, TOOL.setAudio, title, patch.error)
  return yield* runOldTool(context, TOOL.setAudio, title, patch.value)
}
