'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { ASSISTANT_PERSONA_LIMITS } from '@/constants/assistant-persona'
import { MessagesSquare } from '@/components/icons'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { Textarea } from '@/components/ui/textarea'
import {
  setOperatorChatUserRole,
  type StudioOperatorChatCharacter,
} from '@/hooks/use-studio-operator-store'

interface StudioOperatorChatPillProps {
  character: StudioOperatorChatCharacter
  /** 你在这段故事里是谁（会话那一格）。 */
  userRole: string
}

/**
 * 头部那枚「和 X 聊」胶囊（附录L）：点开写**你在这段故事里是谁**（第二片 C）。
 * 这段会话自己的一格：打字只改草稿，关上浮层才存（下一轮起生效）；Esc 照样存 —— 关浮层
 * 就是「写完了」，⛔ 不另设保存键。
 */
export function StudioOperatorChatPill({
  character,
  userRole,
}: StudioOperatorChatPillProps) {
  const t = useTranslations('StudioOperator')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(userRole)

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(userRole)
        else setOperatorChatUserRole(draft.trim())
        setOpen(next)
      }}
    >
      <ResponsivePopoverTrigger asChild>
        <button
          type="button"
          data-testid="operator-chat-pill"
          title={t('chat.roleHint')}
          className="inline-flex min-w-0 shrink items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-2sm text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
        >
          <MessagesSquare className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">
            {t('chat.pill', { name: character.name })}
          </span>
        </button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        label={t('chat.roleLabel')}
        align="start"
        className="w-72 p-3"
        mobileClassName="pb-6"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {t('chat.roleLabel')}
          </span>
          <Textarea
            data-testid="operator-chat-role"
            value={draft}
            maxLength={ASSISTANT_PERSONA_LIMITS.maxChatUserRoleChars}
            placeholder={t('chat.rolePlaceholder', { name: character.name })}
            onChange={(event) => setDraft(event.target.value)}
            className="max-h-48 min-h-20 text-sm"
          />
          <span className="text-xs text-muted-foreground">{t('chat.roleHint')}</span>
        </label>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  )
}
