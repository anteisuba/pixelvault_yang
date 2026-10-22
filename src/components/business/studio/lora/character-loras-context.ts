'use client'

import { createContext, useContext } from 'react'

import type { UseCharacterLorasReturn } from '@/hooks/cards/use-character-loras'

const CharacterLorasContext = createContext<UseCharacterLorasReturn | null>(
  null,
)

/** 角色收的 LoRA（角色③）：LoRA 台整页一份，库里的详情页读它显示「属于」与「加到角色…」。 */
export const CharacterLorasProvider = CharacterLorasContext.Provider

export function useCharacterLorasContext(): UseCharacterLorasReturn | null {
  return useContext(CharacterLorasContext)
}
