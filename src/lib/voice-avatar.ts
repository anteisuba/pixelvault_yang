import { characterCoverUrl } from '@/lib/card-bus'
import type { CharacterCardRecord } from '@/types'

/**
 * 一副嗓子的**头像规则**（「声音」模块设计稿，owner 10-23）——只此一份：
 *
 * 1. 绑了角色 → 用角色头像（默认造型的封面）；
 * 2. 没绑 → 用音色卡自己的头像（收藏时带来的 Fish 封面，或自己换的）；
 * 3. 都没有 → `null`，由渲染方画「名字首字 + 一档底色」的占位。
 *
 * 一副嗓子被几个角色绑着时，取列表里第一个（与「绑了哪些角色」那一行的顺序一致）。
 */

type CharacterLike = Pick<
  CharacterCardRecord,
  'id' | 'name' | 'voiceCardId' | 'looks'
>

/** 绑着这张音色卡的角色（保持传入顺序）。 */
export function charactersOfVoice<T extends CharacterLike>(
  voiceCardId: string,
  characters: readonly T[],
): T[] {
  return characters.filter((card) => card.voiceCardId === voiceCardId)
}

export function voiceAvatarCover(
  voice: { readonly id: string; readonly coverImage: string | null },
  characters: readonly CharacterLike[],
): string | null {
  for (const character of charactersOfVoice(voice.id, characters)) {
    const cover = characterCoverUrl(character)
    if (cover) return cover
  }
  return voice.coverImage ?? null
}
