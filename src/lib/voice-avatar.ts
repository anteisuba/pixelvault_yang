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

/**
 * 配音间里她用哪张角色卡当人设（顶栏「人设 ▾」，用户 10-25）：这间房挑过哪张就是哪张（被删了
 * 退回去）；没挑过 → 绑着这副嗓子的第一个角色。服务端 `findPersonaCard` 同一条规则。
 */
export function voicePersonaCard<T extends CharacterLike>(
  voice: { readonly id: string; readonly characterCardId?: string | null },
  characters: readonly T[],
): T | null {
  const picked = voice.characterCardId
    ? characters.find((card) => card.id === voice.characterCardId)
    : undefined
  return picked ?? charactersOfVoice(voice.id, characters)[0] ?? null
}

/**
 * 一副嗓子在配音间里露面的样子（owner 10-23「头像跟着绑定的角色走」）：有人设卡就是她——
 * 名字和头像都用角色的；没有就是音色自己。
 */
export function voiceSpeakerLook(
  voice: {
    readonly id: string
    readonly name: string
    readonly coverImage: string | null
    readonly characterCardId?: string | null
  },
  characters: readonly CharacterLike[],
): { name: string; cover: string | null } {
  const persona = voicePersonaCard(voice, characters)
  const picked = Boolean(voice.characterCardId) && persona !== null
  return {
    name: persona?.name ?? voice.name,
    cover: picked
      ? (characterCoverUrl(persona) ?? voice.coverImage ?? null)
      : voiceAvatarCover(voice, characters),
  }
}
