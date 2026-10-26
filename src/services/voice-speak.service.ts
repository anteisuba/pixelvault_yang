import 'server-only'

import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import { AUDIO_KIND, type AudioKind } from '@/constants/audio-options'
import { getAvailableAudioModels } from '@/constants/models'
import { resolveAudioKind } from '@/constants/models/audio'
import { characterCoverUrl } from '@/lib/card-bus'
import { spokenVoiceText } from '@/lib/chat-voice'
import {
  CHARACTER_LOOKS_INCLUDE,
  mapCharacterLookRow,
} from '@/services/cards/character-card.mapper'
import { submitAudioGeneration } from '@/services/generate-audio.service'
import { ensureUser } from '@/services/user.service'
import type {
  AssistantSpeakRequest,
  AssistantSpeakResponseData,
} from '@/types/assistant-speak'

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
 * 对话里 🔊 念她的回复（②c-2）：用设置里那位角色绑的嗓子念。
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
    text: request.text,
    ...(request.modelId ? { modelId: request.modelId } : {}),
  })
  return { jobId }
}
