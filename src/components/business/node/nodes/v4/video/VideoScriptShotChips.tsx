'use client'

/**
 * 镜头卡上与剧本有关的状态角标（进度表 24，画板 `DesignD7Script.dc.html` ③）：
 * 剧本里那一段改了 → 「已变」（琥珀）；剧本里删掉了 → 「剧本已删」。
 * ⛔ 不只靠颜色：两档各自带一句话（`forbidden.md` UI 第五条）。
 * 这一镜里的 `@她` 走参考轨上的 `CharacterMentionRail`，⛔ 不再开空角色槽。
 */

import { useTranslations } from 'next-intl'

import { NODE_SCRIPT_SHOT_STATE_IDS } from '@/constants/node-script'
import { cn } from '@/lib/utils'
import type { NodeScriptShotState } from '@/constants/node-script'

export function VideoScriptShotBadge({
  state,
}: {
  readonly state: NodeScriptShotState
}) {
  const t = useTranslations('StudioNode.v4.video.scriptShot')
  if (state === NODE_SCRIPT_SHOT_STATE_IDS.synced) return null
  const changed = state === NODE_SCRIPT_SHOT_STATE_IDS.changed
  return (
    <span
      data-script-shot-badge={state}
      className={cn(
        'shrink-0 rounded-full px-1.5 py-0.5 text-2xs',
        changed
          ? 'bg-status-warning-surface text-status-warning'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {changed ? t('changed') : t('dropped')}
    </span>
  )
}
