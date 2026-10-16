'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { useChatCharacters } from '@/hooks/use-chat-characters'
import {
  switchOperatorChatMode,
  useStudioOperatorState,
  type StudioOperatorChatCharacter,
  type StudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import { cn } from '@/lib/utils'

const SEGMENT_CLASS =
  'rounded-sm px-2 py-0.5 text-2sm transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 coarse:min-h-11 motion-reduce:transition-none'

/** 这段对话上一次和谁聊（现在就在聊 = 她；否则翻切模式标记，先实时线程后历史）。 */
function lastChatCharacter(
  state: Pick<StudioOperatorState, 'chatCharacter' | 'entries' | 'history'>,
): { id: string; name: string } | null {
  if (state.chatCharacter) return state.chatCharacter
  for (const entry of [...state.entries].reverse()) {
    if (entry.kind === 'chatMark' && entry.character) return entry.character
  }
  for (const entry of [...state.history].reverse()) {
    if (entry.kind === 'chatMark' && entry.characterId && entry.characterName)
      return { id: entry.characterId, name: entry.characterName }
  }
  return null
}

/**
 * 头部「工作 / 聊天」切换（owner 2026-10-16：只是模式切换，记录不变）。
 *  - 点「工作」：这段对话换回工作模式。
 *  - 点「聊天」：这段对话里聊过谁就接着和她聊；没聊过就弹角色列表先选。
 *  - 已经在聊天里再点「聊天」：弹列表换个人。
 * 切的地方时间线里留一条细线（`chatMark`，见 `switchOperatorChatMode`）。
 */
export function StudioOperatorModeSwitch({ disabled }: { disabled: boolean }) {
  const t = useTranslations('StudioOperator')
  const state = useStudioOperatorState()
  const [pickerOpen, setPickerOpen] = useState(false)
  // 角色列表一进面板就取：接着和她聊时要卡上的「你在故事里是谁」，切模式标记里只有名字。
  const chatCharacters = useChatCharacters(true)
  const inChat = state.chatCharacter !== null
  const remembered = lastChatCharacter(state)

  const switchTo = (character: StudioOperatorChatCharacter) => {
    const full = chatCharacters.characters.find(
      (chat) => chat.character.id === character.id,
    )?.character
    switchOperatorChatMode(full ?? character)
  }

  return (
    <div
      role="group"
      aria-label={t('mode.label')}
      data-testid="operator-mode-switch"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-muted p-0.5"
    >
      <button
        type="button"
        data-testid="operator-mode-work"
        aria-pressed={!inChat}
        disabled={disabled}
        onClick={() => switchOperatorChatMode(null)}
        className={cn(
          SEGMENT_CLASS,
          inChat
            ? 'text-muted-foreground hover:text-foreground'
            : 'bg-card font-medium text-foreground shadow-sm',
        )}
      >
        {t('mode.work')}
      </button>
      <ResponsivePopover
        open={pickerOpen}
        onOpenChange={(next) => {
          if (next && !inChat && remembered) {
            switchTo(remembered)
            return
          }
          setPickerOpen(next)
        }}
      >
        <ResponsivePopoverTrigger asChild>
          <button
            type="button"
            data-testid="operator-mode-chat"
            aria-pressed={inChat}
            disabled={disabled}
            className={cn(
              SEGMENT_CLASS,
              inChat
                ? 'bg-card font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('mode.chat')}
          </button>
        </ResponsivePopoverTrigger>
        <ResponsivePopoverContent
          label={t('mode.pickCharacter')}
          align="end"
          className="max-h-72 w-56 overflow-y-auto p-1.25"
          mobileClassName="pb-6"
        >
          <p className="px-2 pb-1 pt-1.5 text-2xs text-muted-foreground">
            {t('mode.pickCharacter')}
          </p>
          {chatCharacters.isLoading ? (
            <p className="px-2 py-1.5 text-2sm text-muted-foreground">
              {t('history.loading')}
            </p>
          ) : chatCharacters.characters.length === 0 ? (
            <p className="px-2 py-1.5 text-2sm text-muted-foreground">
              {t('chat.noCharacters')}
            </p>
          ) : (
            <ul data-testid="operator-mode-characters">
              {chatCharacters.characters.map((chat) => {
                const current = chat.character.id === state.chatCharacter?.id
                return (
                  <li key={chat.character.id}>
                    <button
                      type="button"
                      aria-current={current ? 'true' : undefined}
                      onClick={() => {
                        setPickerOpen(false)
                        switchOperatorChatMode(chat.character)
                      }}
                      className={cn(
                        'flex w-full min-w-0 items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-fast hover:bg-surface-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11',
                        current && 'font-medium',
                      )}
                    >
                      <span className="min-w-0 truncate">
                        {chat.character.name}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </ResponsivePopoverContent>
      </ResponsivePopover>
    </div>
  )
}
