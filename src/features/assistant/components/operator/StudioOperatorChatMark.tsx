'use client'

import { useTranslations } from 'next-intl'

/**
 * 换台细线（第 9d 步：一段对话跨台），实时线程与载回的历史共用。
 * （同文件原有的切模式细线 `StudioOperatorChatMark` 已随「聊天 / 工作」开关一起删除，11-18。）
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
      className="flex items-center gap-2.5 text-2xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
    >
      {t('mode.toDomain', { domain: name })}
    </p>
  )
}
