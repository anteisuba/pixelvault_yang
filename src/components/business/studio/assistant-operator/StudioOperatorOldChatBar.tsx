'use client'

import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { VoicePickerDialog } from '@/components/business/voices/VoicePickerDialog'
import { useChatCharacters } from '@/hooks/use-chat-characters'
import { useOpenCharacterRoom } from '@/hooks/use-open-character-room'
import type { StudioOperatorChatCharacter } from '@/hooks/use-studio-operator-store'

/**
 * 以前在助手里「和角色聊」留下的那几段（用户 10-25 去掉聊天模式）：**只能看**，输入区换成这一条 ——
 * 一句「和她的旧聊天」+「去她的配音间」，接着聊去配音间（用户 10-25「旧的留着只看，不搬」）。
 */
export function StudioOperatorOldChatBar({
  character,
}: {
  character: StudioOperatorChatCharacter
}) {
  const t = useTranslations('StudioOperator.chat')
  const { characters } = useChatCharacters(true)
  const room = useOpenCharacterRoom()
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
          disabled={room.busy}
          onClick={() => void room.open(chat)}
          data-testid="operator-old-chat-go-room"
        >
          {t('goVoiceRoom')}
        </Button>
      ) : null}
      <VoicePickerDialog
        open={room.needsVoice !== null}
        onOpenChange={(next) => {
          if (!next) room.cancelVoice()
        }}
        onPick={(card) => void room.bindVoiceAndOpen(card.id)}
      />
    </div>
  )
}
