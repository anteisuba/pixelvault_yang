'use client'

/**
 * legacy 节点空壳。⚠ 只在「存量项目里出现了尚未迁移的旧 type」时才被渲染——
 * 明写一行「已迁移」，⛔ 不静默留白（静默留白会让用户以为节点丢了）。
 * C3 删掉 legacy enum 之后这个组件随之下线。
 */

import { useTranslations } from 'next-intl'

export function LegacyMigratedNode() {
  const t = useTranslations('StudioNode.v4')
  return (
    <div className="rounded-lg border border-dashed bg-card p-3 text-2xs text-muted-foreground">
      {t('legacyMigrated')}
    </div>
  )
}
