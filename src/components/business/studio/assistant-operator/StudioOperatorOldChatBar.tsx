'use client'

import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { useChatCharacters } from '@/hooks/use-chat-characters'
import { usePersonaSwitch } from '@/hooks/use-chat-persona'
import { useStudioOperatorActions } from '@/hooks/use-studio-operator-actions'
import type { StudioOperatorChatCharacter } from '@/hooks/use-studio-operator-store'

/**
 * 以前在助手里「和角色聊」留下的那几段（用户 10-25 去掉聊天模式）：**只能看**，输入区换成这一条 ——
 * 一句「和她的旧聊天」+「和她聊天」：助手换成她、开一段新对话接着聊（②c 聊天并回对话）。
 */
export function StudioOperatorOldChatBar({
  character,
}: {
  character: StudioOperatorChatCharacter
}) {
  const t = useTranslations('StudioOperator.chat')
  const { characters } = useChatCharacters(true)
  const personaSwitch = usePersonaSwitch()
  const actions = useStudioOperatorActions()
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
          disabled={personaSwitch.busy}
          onClick={() =>
            void personaSwitch.switchTo(chat.character.id).then((ok) => {
              if (ok) actions?.newThread()
            })
          }
          data-testid="operator-old-chat-continue"
        >
          {t('continueChat')}
        </Button>
      ) : null}
    </div>
  )
}
