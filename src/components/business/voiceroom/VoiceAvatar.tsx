'use client'

import { VOICE_ROOM_AVATAR_TONE_COUNT } from '@/constants/voiceroom'
import type { VoiceRoomSpeakerKind } from '@/constants/voiceroom'

/**
 * 说话人头像 —— 有脸用脸，没脸用名字第一个字 + 一档底色。
 *
 * 底色由 **id 哈希**决定而不是班底里的位置：位置会因为加人删人变来变去，
 * 而「晴一直是那个玫红」是这一屏最省事的辨认方式，跨房间也该一致。
 */

/** 稳定的小哈希（djb2 变体）。同一个 id 永远落在同一档色上。 */
export function toneIndexOf(id: string): number {
  let hash = 5381
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash << 5) + hash + id.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % VOICE_ROOM_AVATAR_TONE_COUNT
}

interface VoiceAvatarProps {
  id: string
  name: string
  cover?: string | null
  kind?: VoiceRoomSpeakerKind
  /** `l` 是选角卡的大头像（84px），也是「点脸即试听」那块热区的主体。 */
  size?: 'xs' | 's' | 'm' | 'l'
}

export function VoiceAvatar({
  id,
  name,
  cover,
  kind,
  size = 'm',
}: VoiceAvatarProps) {
  // 内建角色（音效 / 配乐）走固定的中性灰，不参与哈希配色。
  const tone = kind && kind !== 'voice' ? undefined : toneIndexOf(id)

  return (
    <span
      className="vr-avatar"
      data-size={size === 'm' ? undefined : size}
      data-tone={tone}
      data-kind={kind && kind !== 'voice' ? kind : undefined}
      aria-hidden
    >
      {cover ? (
        // 音色封面来自任意外部主机（Fish 市场），走 next/image 就得为每个上游
        // 域名配 remotePatterns。
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" loading="lazy" />
      ) : (
        // 中文取第一个字，拉丁取首字母——两种都只占一个字身。
        ([...name][0] ?? '?')
      )}
    </span>
  )
}
