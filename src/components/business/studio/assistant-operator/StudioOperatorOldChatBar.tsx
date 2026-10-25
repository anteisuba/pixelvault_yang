'use client'

import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { useChatCharacters } from '@/hooks/use-chat-characters'
import { useOpenPersonaChat } from '@/hooks/use-chat-persona'
import type { StudioOperatorChatCharacter } from '@/hooks/use-studio-operator-store'

/**
 * 以前在助手里「和角色聊」留下的那几段（用户 10-25 去掉聊天模式）：**只能看**，输入区换成这一条 ——
 * 一句「和她的旧聊天」+「和她聊天」：助手换成她、进「聊天」接着聊（用户 10-25 聊天跟着全局人设）。
 */
export function StudioOperatorOldChatBar({
  character,
}: {
  character: StudioOperatorChatCharacter
}) {
  const t = useTranslations('StudioOperator.chat')
  const { characters } = useChatCharacters(true)
  const personaChat = useOpenPersonaChat()
  const chat = characters.find((item) => item.character.id === character.id)

  return (
    <div
      data-testid="operator-old-chat-bar"
      className="flex shrink-0 items-center gap-3 px-3 pb-3"
    >
      <span className="min-w-0 flex-1 truncate text-2sm text-muted-foreground">
        {t('oldChat', { name: character.name })}
      </span>
      {chat ? (
        <Button
          size="sm"
          disabled={personaChat.busy}
          onClick={() =>
            void personaChat.switchTo(chat.character.id, {
              voiceCardId: chat.voiceCardId,
              openChat: true,
            })
          }
          data-testid="operator-old-chat-go-room"
        >
          {t('goVoiceRoom')}
        </Button>
      ) : null}
    </div>
  )
}
