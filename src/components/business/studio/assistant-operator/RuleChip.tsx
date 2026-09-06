'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'

import { PROJECT_RULE_SOURCE_IDS } from '@/constants/assistant-operator'
import { cn } from '@/lib/utils'
import type { ProjectRuleSourceId } from '@/constants/assistant-operator'

/**
 * 规则薄卡（`docs/references/pages/assistant-shell.md` §10 / §2.21 / §4.2）。
 *
 * 助手引用了某条项目规则时贴在动作卡下：**规则原文** + 「记于 YYYY-MM-DD ·
 * 来源：××」+ 「查看规则」。
 *
 * ⛔ **不用状态色**：规则不是成功也不是警告 —— 走系统行那一档
 * （`border-l-2 border-border bg-muted/40`）。§10 逐字写着这一条。
 * ⚠ 原文由服务端从规则表里填（`rule_hit` 事件），⛔ 不是模型转述的那一版：
 * 这张卡的全部价值就是「这是你当时写的原话」。
 */

interface RuleChipProps {
  ruleId: string
  /** 规则原文，逐字显示。 */
  text: string
  source: ProjectRuleSourceId
  /** ISO 串；卡上只显示日期段。 */
  createdAt: string
  /** 「查看规则」—— 打开助手设置里的规则列表。缺席时不画那颗按钮。 */
  onView?(ruleId: string): void
  className?: string
}

export const RuleChip = memo(function RuleChip({
  ruleId,
  text,
  source,
  createdAt,
  onView,
  className,
}: RuleChipProps) {
  const t = useTranslations('StudioOperator.rule')
  /**
   * ⚠ 直接切 ISO 串的日期段，⛔ 不过 `Intl.DateTimeFormat`：服务端与客户端的时区
   * 不一定一样，而「记于哪天」跨时区跳一天是最难查的那种不一致。
   */
  const recordedOn = t('recordedOn', { date: createdAt.slice(0, 10) })
  const sourceLabel =
    source === PROJECT_RULE_SOURCE_IDS.assistant
      ? t('sourceAssistant')
      : t('sourceCreator')

  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-r-md border-l-2 border-border bg-muted/40 px-3 py-2',
        className,
      )}
    >
      <p className="text-sm leading-snug text-foreground">{text}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-md text-muted-foreground">
        <span>{recordedOn}</span>
        <span aria-hidden="true">·</span>
        <span>{sourceLabel}</span>
        {onView ? (
          <button
            type="button"
            onClick={() => onView(ruleId)}
            className="ml-auto underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            {t('view')}
          </button>
        ) : null}
      </div>
    </div>
  )
})
