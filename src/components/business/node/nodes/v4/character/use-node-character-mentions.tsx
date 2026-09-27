'use client'

/**
 * 画布卡提示词里的 **@她**（画布用角色 ④ 第 2 片，owner 09-28）。
 *
 * ⭐ 她在不在这一镜 = 正文里有没有 `@她`（名字对角色库）；不建边、不进槽。
 * ⭐ 带哪几张 = 卡上 `characterPicks[她的 id]`；没勾过 = 主图 1 张。
 * ⭐ 勾图从参考轨上那颗「她 · N 张」打开（owner 09-28：提示词里的 chip 点不到）。
 * ⚠ 名额 = 这张卡的模型一次能收几张参考图 − 轨上已挂的参考图 − 所有在场角色勾的张数。
 */

import { useTranslations } from 'next-intl'

import type { CharacterImagePick } from '@/types'
import type {
  MentionCandidate,
  MentionToken,
} from '@/components/ui/mention-input'
import { useCharacterLibrary } from '@/hooks/cards/use-character-library'
import {
  characterMainImage,
  mentionedCharacters,
} from '@/lib/node-character-mentions'

import type { MentionPickerOption } from '../chrome'

export function useNodeCharacterMentions({
  prompt,
  characterPicks,
}: {
  prompt: string
  characterPicks?: Readonly<Record<string, readonly CharacterImagePick[]>>
}) {
  const t = useTranslations('StudioNode.v4.characterMention')
  const library = useCharacterLibrary()
  const mentions = mentionedCharacters(prompt, library.cards, characterPicks)
  const options: MentionPickerOption[] = library.cards.map((card) => {
    const thumbnailUrl = characterMainImage(card)
    return {
      id: `character:${card.id}`,
      name: card.name,
      groupLabel: t('group'),
      ...(thumbnailUrl
        ? { media: { kind: 'image' as const, thumbnailUrl } }
        : {}),
    }
  })
  // 画中框（`MentionInput`）那一套：胶囊 + 候选。
  const tokens: MentionToken[] = library.cards.map((card) => {
    const thumbnailUrl = characterMainImage(card)
    return {
      name: card.name,
      kind: 'character',
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    }
  })
  const candidates: MentionCandidate[] = library.cards.map((card) => ({
    id: `character:${card.id}`,
    name: card.name,
    groupLabel: t('group'),
    group: 'character',
  }))
  return {
    mentions,
    options,
    tokens,
    candidates,
    names: library.cards.map((card) => card.name),
  }
}
