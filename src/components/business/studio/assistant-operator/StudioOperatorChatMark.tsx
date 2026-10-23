'use client'

import { useTranslations } from 'next-intl'

/**
 * 时间线里那条切模式细线（owner 2026-10-16：同一段对话里切「工作 / 聊天」，记录不变，
 * 细线留着好翻记录时看出哪段是聊天）。`name: null` = 回到工作。实时线程与载回的历史共用。
 */
export function StudioOperatorChatMark({ name }: { name: string | null }) {
  const t = useTranslations('StudioOperator')
  return (
    <p
      data-testid="operator-chat-mark"
      className="flex items-center gap-2.5 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
    >
      {name ? t('mode.toChat', { name }) : t('mode.toWork')}
    </p>
  )
}

/**
 * 换台细线（第 9d 步：一段对话跨台）：与切模式那条同一副样子，实时线程与载回的历史共用。
 * ⚠ 不认得的域（历史里存过、词表后来改了）照原样写出来，⛔ 不让整行崩。
 */
export function StudioOperatorDomainMark({ domain }: { domain: string }) {
  const t = useTranslations('StudioOperator')
  const name = t.has(`domainName.${domain}`)
    ? t(`domainName.${domain}`)
    : domain
  return (
    <p
      data-testid="operator-domain-mark"
      className="flex items-center gap-2.5 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
    >
      {t('mode.toDomain', { domain: name })}
    </p>
  )
}
