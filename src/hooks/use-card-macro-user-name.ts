'use client'

import { useTranslations } from 'next-intl'

import { useAssistantPersona } from '@/hooks/use-assistant-persona'
import { useMyProfile } from '@/hooks/use-my-profile'

/**
 * 酒馆宏 `{{user}}` 在浏览器里换成谁：助手设置里「怎么称呼你」那一格优先；留空 = 账号名
 * （与助手的称呼同一条规矩）；都没有就是「你」。
 * 用在：聊天里她先开口的开场白（`use-operator-greeting`）· 角色页设定的阅读态（`CharacterTextField`）。
 * ⚠ 只管显示，⛔ 写回卡里：卡上原样存宏（称呼会改，见 `fillCardMacros`）。
 */
export function useCardMacroUserName(): string {
  const t = useTranslations('StudioOperator.chat')
  const { persona } = useAssistantPersona()
  const { profile } = useMyProfile()
  return (
    persona.addressUserAs?.trim() ||
    profile?.displayName?.trim() ||
    profile?.username?.trim() ||
    t('greetingUserFallback')
  )
}
