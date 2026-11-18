'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  ASSISTANT_SETTINGS_SECTIONS,
  AssistantSettingsDialog,
} from '@/features/assistant'
import { useAssistantMemories } from '@/features/assistant/hooks'

/**
 * 两份记忆各管各的（11-18）：她页「记忆」只放她作为她自己记下的事（和她聊、出门、你替她记的）；
 * 她替你干活时记住的规矩在助手设置的「记忆」里。这一行说清楚，并给一颗带条数的入口直接开那一页。
 * ⛔ 不搬数据、不合并：归属不变，只是让人知道另一份在哪。
 */
export function CharacterMemoryWorkShelf() {
  const t = useTranslations('CharacterRoster.memory')
  const [open, setOpen] = useState(false)
  const work = useAssistantMemories()
  const count = work.memories.length
  return (
    <div
      data-testid="character-memory-work-shelf"
      className="flex min-w-0 flex-wrap items-center gap-x-1 text-xs leading-reading text-muted-foreground"
    >
      <span>{t('whereIntro')}</span>
      <Button
        variant="link"
        size="sm"
        className="h-auto p-0 text-xs"
        onClick={() => setOpen(true)}
      >
        {work.isLoading || work.error
          ? t('workShelf')
          : t('workShelfCount', { count })}
      </Button>
      <AssistantSettingsDialog
        open={open}
        onOpenChange={setOpen}
        section={ASSISTANT_SETTINGS_SECTIONS.memory}
      />
    </div>
  )
}
