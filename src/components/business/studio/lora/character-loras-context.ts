'use client'

import { createContext, useContext } from 'react'

import type { UseCharacterLorasReturn } from '@/hooks/cards/use-character-loras'
import type { LoraAssetRecord } from '@/types'

export interface CharacterLorasContextValue {
  readonly characterLoras: UseCharacterLorasReturn
  /**
   * 你名下的那一行（收藏或自训），按下载链接认。只有收进来的 LoRA 才能加到角色 ——
   * 库里还没收藏的先点收藏。
   */
  readonly ownedAssetFor: (loraUrl: string) => LoraAssetRecord | null
}

const CharacterLorasContext = createContext<CharacterLorasContextValue | null>(
  null,
)

/** 角色收的 LoRA（角色③）：LoRA 台整页一份，库里的详情页读它显示「属于」与「加到角色…」。 */
export const CharacterLorasProvider = CharacterLorasContext.Provider

export function useCharacterLorasContext(): CharacterLorasContextValue | null {
  return useContext(CharacterLorasContext)
}
