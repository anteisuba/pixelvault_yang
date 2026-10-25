'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { ASSISTANT_PERSONA_LIMITS } from '@/constants/assistant-persona'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { saveOperatorChatUserRole } from '@/hooks/use-studio-operator-store'

/**
 * 聊天里「你在故事里是谁」（按角色记，owner 2026-10-16）。原来在「和谁聊」弹层顶上；
 * 用户 10-25 把换人挪到头像之后，搬到 ⋯ 菜单里一项、点开这一格。
 * 打字只改草稿，关上才存（`saveOperatorChatUserRole`，没改就不发请求）—— 关上就是「写完了」。
 */
export function StudioOperatorChatRoleDialog({
  open,
  onOpenChange,
  characterName,
  initialRole,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  characterName: string
  initialRole: string
}) {
  const t = useTranslations('StudioOperator')
  const [draft, setDraft] = useState(initialRole)
  const [wasOpen, setWasOpen] = useState(open)
  // 每次打开都从卡上那一句起（换过人 / 别处改过）。
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(initialRole)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void saveOperatorChatUserRole(draft)
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-base">{t('chat.roleLabel')}</DialogTitle>
        <Textarea
          data-testid="operator-chat-role"
          value={draft}
          maxLength={ASSISTANT_PERSONA_LIMITS.maxChatUserRoleChars}
          placeholder={t('chat.rolePlaceholder', { name: characterName })}
          onChange={(event) => setDraft(event.target.value)}
          className="max-h-60 min-h-24 text-2sm"
        />
        <p className="text-2xs text-muted-foreground">{t('chat.roleHint')}</p>
      </DialogContent>
    </Dialog>
  )
}
