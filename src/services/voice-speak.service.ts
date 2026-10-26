import 'server-only'

import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import { AUDIO_KIND, type AudioKind } from '@/constants/audio-options'
import { VOICE_BENCH } from '@/constants/studio-operator-voice'
import { getAvailableAudioModels } from '@/constants/models'
import { resolveAudioKind } from '@/constants/models/audio'
import { characterCoverUrl } from '@/lib/card-bus'
import { spokenVoiceText } from '@/lib/chat-voice'
import {
  CHARACTER_LOOKS_INCLUDE,
  mapCharacterLookRow,
} from '@/services/cards/character-card.mapper'
import {
  applyAudioStylePrompt,
  submitAudioGeneration,
} from '@/services/generate-audio.service'
import { ensureUser } from '@/services/user.service'
import type {
  AssistantSpeakRequest,
  AssistantSpeakResponseData,
} from '@/types/assistant-speak'
import type { VoiceBenchData } from '@/types/voice-bench'

/**
 * 用一副音色卡念一段话（对话里 🔊 念回复，②c-2）。
 * 生成本身走 `submitAudioGeneration`（和音频工作台同一条链路），这里只管「谁的嗓子、念什么」。
 */

/** 没选过型号时挑目录里第一个可用的（顶栏显示的也是它）。 */
export function resolveAudioModelId(kind: AudioKind): string {
  const model = getAvailableAudioModels().find(
    (candidate) => resolveAudioKind(candidate) === kind,
  )
  if (!model) {
    throw new ApiRequestError(
      'AUDIO_MODEL_UNAVAILABLE',
      503,
      'errors.assistantVoice.modelUnavailable',
      `No available audio model for ${kind}`,
    )
  }
  return model.id
}

/** 只有 http(s) 的封面能进 `coverImageUrl`——那个字段是 `.url()` 校验的。 */
function toCoverUrl(cover: string | null | undefined): string | undefined {
  if (!cover) return undefined
  return /^https?:\/\//i.test(cover) ? cover : undefined
}

/**
 * 派一段话去念，返回 jobId。
 *
 * ⚠ `voiceId` 是**实时**从 VoiceCard 查的：快照里存的名字 / 封面漂了无所谓，voiceId 漂了会发错声音。
 */
export async function speakWithVoiceCard(params: {
  clerkId: string
  userId: string
  voiceCardId: string
  text: string
  /** 不给 = 目录里第一个可用的。 */
  modelId?: string
}): Promise<string> {
  const { clerkId, userId, voiceCardId, text, modelId } = params
  const [card, character] = await Promise.all([
    db.voiceCard.findFirst({
      where: { id: voiceCardId, userId, isDeleted: false },
      select: { voiceId: true, name: true, coverImage: true },
    }),
    // 头像规则（owner 10-23）：绑了角色，素材库里这条就挂角色的名字和头像。
    // 一副嗓子被几个角色绑着时取最近改过的那个——和聊天用的人设同一条规则。
    db.characterCard.findFirst({
      where: { userId, voiceCardId, isDeleted: false },
      orderBy: { updatedAt: 'desc' },
      select: { name: true, ...CHARACTER_LOOKS_INCLUDE },
    }),
  ])
  if (!card?.voiceId) {
    throw new ApiRequestError(
      'VOICE_CARD_UNAVAILABLE',
      400,
      'errors.assistantVoice.voiceCardUnavailable',
      'That voice is no longer available',
    )
  }

  const { jobId } = await submitAudioGeneration(clerkId, {
    // 新内核的回复会带作品号、链接：念的时候只念说的话。
    prompt: spokenVoiceText(text),
    // 选过就用它，没选过退回目录里第一个可用的。
    modelId: modelId ?? resolveAudioModelId(AUDIO_KIND.SPEECH),
    voiceId: card.voiceId,
    // 素材库靠这两个把音频卡画成「头像 + 名字」。
    voiceName: character?.name ?? card.name,
    coverImageUrl:
      toCoverUrl(
        character &&
          characterCoverUrl({
            looks: character.looks.map(mapCharacterLookRow),
          }),
      ) ?? toCoverUrl(card.coverImage),
  })
  return jobId
}

/**
 * 用设置里那位角色绑的嗓子念（对话里 🔊 念回复 ②c-2 / 配音台念台词 ③）。
 * 情绪写成句首的方括号语气进到念的字里（和画布音频卡同一个映射），素材库里那条的字也带着它——配音台靠它显示、重录照念。
 * 默认助手 / 角色没绑嗓子 = 念不了（界面上先让人挑一副）。
 */
export async function speakAsPersona(
  clerkId: string,
  request: AssistantSpeakRequest,
): Promise<AssistantSpeakResponseData> {
  const user = await ensureUser(clerkId)
  const persona = await db.assistantPersona.findUnique({
    where: { userId: user.id },
    select: {
      characterCard: { select: { voiceCardId: true, isDeleted: true } },
    },
  })
  const card = persona?.characterCard
  const voiceCardId = card && !card.isDeleted ? card.voiceCardId : null
  if (!voiceCardId) {
    throw new ApiRequestError(
      'ASSISTANT_VOICE_UNBOUND',
      400,
      'errors.assistantVoice.unbound',
      'This persona has no voice yet',
    )
  }
  const jobId = await speakWithVoiceCard({
    clerkId,
    userId: user.id,
    voiceCardId,
    text: request.emotion
      ? applyAudioStylePrompt(request.text, request.emotion)
      : request.text,
    ...(request.modelId ? { modelId: request.modelId } : {}),
  })
  return { jobId }
}

/**
 * 配音台（③）上的台词：⛔ 另建台词表（用户 10-26）—— 就是素材库里她这副嗓子念过的音频
 * （`snapshot.voiceId` 认嗓子，对话里 🔊 念的也在里面），最近 `VOICE_BENCH.listLimit` 条，旧的在前。
 */
export async function listVoiceBenchLines(
  clerkId: string,
): Promise<VoiceBenchData> {
  const user = await ensureUser(clerkId)
  const persona = await db.assistantPersona.findUnique({
    where: { userId: user.id },
    select: {
      characterCard: {
        select: { id: true, voiceCardId: true, isDeleted: true },
      },
    },
  })
  const card = persona?.characterCard
  if (!card || card.isDeleted)
    return { characterCardId: null, voiceCardId: null, lines: [] }
  const empty = {
    characterCardId: card.id,
    voiceCardId: card.voiceCardId,
    lines: [],
  }
  if (!card.voiceCardId) return empty
  const voice = await db.voiceCard.findFirst({
    where: { id: card.voiceCardId, userId: user.id, isDeleted: false },
    select: { voiceId: true },
  })
  if (!voice?.voiceId) return empty

  const rows = await db.generation.findMany({
    where: {
      userId: user.id,
      outputType: 'AUDIO',
      snapshot: { path: ['voiceId'], equals: voice.voiceId },
    },
    orderBy: { createdAt: 'desc' },
    take: VOICE_BENCH.listLimit,
    select: {
      id: true,
      prompt: true,
      url: true,
      duration: true,
      createdAt: true,
    },
  })
  return {
    ...empty,
    lines: rows.reverse().map((row) => ({
      id: row.id,
      text: row.prompt,
      url: row.url,
      duration: row.duration,
      createdAt: row.createdAt.toISOString(),
    })),
  }
}
