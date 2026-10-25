import { VOICE_ROOM_SPEAKER_KIND } from '@/constants/voiceroom'
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
