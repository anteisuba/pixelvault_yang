'use client'

import { useTranslations } from 'next-intl'

import { ASSISTANT_NAI_TAG_CHECK } from '@/constants/assistant-operator'
import type { AssistantOperatorTagCheck } from '@/types/assistant-operator'

/**
 * 过程行上方那句灰字：NAI 标签核对换了什么、哪些没查到（拆分与反推 X1）。
 * ⭐ 实时那一轮与刷新后的历史画的是同一个组件 —— 历史里存着同一份 `tagCheck`。
 * ⚠ 「没查到」只列前几个，其余说个数：一长串会把灰字刷成一整段。
 */
export function StudioOperatorTagCheckNote({
  tagCheck,
}: {
  tagCheck: AssistantOperatorTagCheck
}) {
  const t = useTranslations('StudioOperator')
  const separator = t('toolGroup.tagListSeparator')
  const sentences = [
    tagCheck.fixes.length > 0
      ? t('toolGroup.tagFixed', {
          count: tagCheck.fixes.length,
          list: tagCheck.fixes
            .map((fix) => `${fix.from} → ${fix.to}`)
            .join(separator),
        })
      : null,
    tagCheck.unknown.length > 0
      ? t('toolGroup.tagUnknown', {
          list: tagCheck.unknown
            .slice(0, ASSISTANT_NAI_TAG_CHECK.maxListedUnknown)
            .join(separator),
          more: Math.max(
            0,
            tagCheck.unknown.length - ASSISTANT_NAI_TAG_CHECK.maxListedUnknown,
          ),
        })
      : null,
  ].filter(Boolean)
  if (sentences.length === 0) return null
  return (
    <p
      data-testid="operator-tag-check-note"
      className="mb-1 text-xs leading-relaxed text-muted-foreground animate-in fade-in-0 fill-mode-backwards animation-duration-(--duration-base) motion-reduce:animate-none"
    >
      {sentences.join(t('toolGroup.tagSentenceSeparator'))}
    </p>
  )
}
