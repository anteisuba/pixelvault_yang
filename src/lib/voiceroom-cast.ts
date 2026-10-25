import {
  VOICE_ROOM_SPEAKER_KIND,
  VOICE_ROOM_VOICELESS_PREFIX,
} from '@/constants/voiceroom'
import type { VoiceRoomCastMember, VoiceRoomRecord } from '@/types/voiceroom'

/**
 * 「这一组人」的身份：班底里人声的 id 排好序拼起来（音效 / 配乐不算人）。
 *
 * 用户 10-25：角色只有一个、和她的历史可以有多段 —— 同一组人开过的几间就是这组人的几段历史
 * （配音间标题 ▾ 只列这些），头像点她 = 进这组人最近那一段。一个人声都没有 = 空串。
 */
export function voiceRoomCastKey(cast: readonly VoiceRoomCastMember[]): string {
  return cast
    .filter((member) => member.kind === VOICE_ROOM_SPEAKER_KIND.VOICE)
    .map((member) => member.id)
    .sort()
    .join('|')
}

/** 和这一组人的几段（最近动过的在前）。 */
export function roomsWithSameCast(
  rooms: readonly VoiceRoomRecord[],
  key: string,
): VoiceRoomRecord[] {
  return rooms
    .filter((room) => voiceRoomCastKey(room.cast) === key)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * 「聊天」现在跟着的那一位（用户 10-25：聊天的人设跟全局助手走）。`characterCardId` = null 是默认助手；
 * `voiceCardId` 是她角色卡上绑的嗓子（认出 10-25 之前没记角色卡的老房间）。
 */
export interface ChatPersonaRef {
  characterCardId: string | null
  voiceCardId: string | null
}

/** 这位班底成员是不是现在这一位。 */
export function memberIsPersona(
  member: VoiceRoomCastMember,
  persona: ChatPersonaRef,
): boolean {
  if (member.kind !== VOICE_ROOM_SPEAKER_KIND.VOICE) return false
  if (persona.characterCardId === null) return member.assistant === true
  if (member.assistant) return false
  if (member.characterCardId)
    return member.characterCardId === persona.characterCardId
  return persona.voiceCardId !== null && member.id === persona.voiceCardId
}

/** 左栏「聊天」列的那几段：有她在的（她自己的 + 有她的群），最近动过的在前。 */
export function roomsForPersona(
  rooms: readonly VoiceRoomRecord[],
  persona: ChatPersonaRef,
): VoiceRoomRecord[] {
  return rooms
    .filter((room) =>
      room.cast.some((member) => memberIsPersona(member, persona)),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** 只有她一个人的那几段（进「聊天」默认落在最近那一段）。 */
export function soloRoomsForPersona(
  rooms: readonly VoiceRoomRecord[],
  persona: ChatPersonaRef,
): VoiceRoomRecord[] {
  return roomsForPersona(rooms, persona).filter(
    (room) =>
      room.cast.filter(
        (member) => member.kind === VOICE_ROOM_SPEAKER_KIND.VOICE,
      ).length === 1,
  )
}

/** 还没有嗓子的那一位（`novoice:` 占位，见 `VOICE_ROOM_VOICELESS_PREFIX`）。 */
export function isVoicelessMember(member: Pick<VoiceRoomCastMember, 'id'>) {
  return member.id.startsWith(VOICE_ROOM_VOICELESS_PREFIX)
}

/** 照现在这一位开一段时她在班底里的样子：有嗓子用嗓子，没有就先占位（只打字）。 */
export function personaCastMember(input: {
  characterCardId: string | null
  voiceCardId: string | null
  name: string
  coverImage: string | null
}): VoiceRoomCastMember {
  return {
    id:
      input.voiceCardId ??
      `${VOICE_ROOM_VOICELESS_PREFIX}${input.characterCardId ?? 'assistant'}`,
    kind: VOICE_ROOM_SPEAKER_KIND.VOICE,
    name: input.name,
    coverImage: input.coverImage,
    characterCardId: input.characterCardId,
    ...(input.characterCardId === null ? { assistant: true as const } : {}),
  }
}

/**
 * 台词上记的说话人 → 班底里那一位。台词记的可能是还没嗓子时的占位（`novoice:`）：她后来挑了嗓子，
 * 班底里那一格换成了真的 id —— 按她（角色卡 / 默认助手）认回来，⛔ 当成「不在班底里」。
 */
export function castMemberForSpeaker(
  cast: readonly VoiceRoomCastMember[],
  speakerId: string,
): VoiceRoomCastMember | undefined {
  const direct = cast.find((member) => member.id === speakerId)
  if (direct || !speakerId.startsWith(VOICE_ROOM_VOICELESS_PREFIX))
    return direct
  const owner = speakerId.slice(VOICE_ROOM_VOICELESS_PREFIX.length)
  return cast.find(
    (member) =>
      member.kind === VOICE_ROOM_SPEAKER_KIND.VOICE &&
      (owner === 'assistant'
        ? member.assistant === true
        : member.characterCardId === owner),
  )
}
