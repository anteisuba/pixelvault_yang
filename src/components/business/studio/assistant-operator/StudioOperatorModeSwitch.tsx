'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { useChatCharacters } from '@/hooks/use-chat-characters'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'
import type {
  StudioOperatorChatCharacter,
  StudioOperatorChatRequest,
} from '@/hooks/use-studio-operator-store'
import { cn } from '@/lib/utils'

interface StudioOperatorModeSwitchProps {
  /** 当前会话和谁聊；`null` = 工作模式。 */
  chatCharacter: StudioOperatorChatCharacter | null
  history: UseStudioOperatorHistoryResult
  disabled: boolean
  onNewThread(chat?: StudioOperatorChatRequest): void
}

const SEGMENT_CLASS =
  'rounded-sm px-2 py-0.5 text-2sm transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 coarse:min-h-11 motion-reduce:transition-none'

/**
 * 头部「工作 / 聊天」切换（附录L，owner 2026-10-16：模式切换做成头部一个按钮）。
 * 模式仍跟着会话走（同一段不切）—— 这颗按钮只是「换到哪一段」的入口：
 *  - 点「工作」：回到最近那段工作会话；没有就新开一段。
 *  - 点「聊天」：弹出角色列表，选谁就回到和她最近那段；没聊过就新开一段（带开场白）。
 * 在聊天里再点「聊天」= 换个角色聊。
 */
export function StudioOperatorModeSwitch({
  chatCharacter,
  history,
  disabled,
  onNewThread,
}: StudioOperatorModeSwitchProps) {
  const t = useTranslations('StudioOperator')
  const [pickerOpen, setPickerOpen] = useState(false)
  const chatCharacters = useChatCharacters(pickerOpen)
  const inChat = chatCharacter !== null

  const goWork = () => {
    if (!inChat) return
    const latest = history.sessions.find((session) => !session.chatCharacter)
    if (latest) history.selectSession(latest)
    else onNewThread()
  }

  const goChat = (chat: StudioOperatorChatRequest) => {
    setPickerOpen(false)
    if (chat.character.id === chatCharacter?.id) return
    const latest = history.sessions.find(
      (session) => session.chatCharacter?.id === chat.character.id,
    )
    if (latest) history.selectSession(latest)
    else onNewThread(chat)
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
        onClick={goWork}
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
          if (next) history.refreshSessions(true)
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
                const current = chat.character.id === chatCharacter?.id
                return (
                  <li key={chat.character.id}>
                    <button
                      type="button"
                      aria-current={current ? 'true' : undefined}
                      onClick={() => goChat(chat)}
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
