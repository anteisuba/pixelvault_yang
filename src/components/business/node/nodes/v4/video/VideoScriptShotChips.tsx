'use client'

/**
 * 镜头卡上与剧本有关的两件小东西（进度表 24，画板 `DesignD7Script.dc.html` ③）。
 *
 * ① **状态角标**：剧本里那一段改了 → 「已变」（琥珀）；剧本里删掉了 → 「剧本已删」。
 *    ⛔ 不只靠颜色：两档各自带一句话（`forbidden.md` UI 第五条）。
 * ② **角色空槽**：投影按这一镜里的 `@角色` 开出空位，显示在**参考轨**那一行 ——
 *    卡面不显示槽（§1.1），槽只在参考轨 / 连线 / 一览里露出。
 *    ⚠ 本片只有空位：装填（卡片总线把角色卡的图与音色挂进来）归进度表 35，
 *    ⛔ 不在这里提前写一半。
 */

import { useTranslations } from 'next-intl'

import { NODE_SCRIPT_SHOT_STATE_IDS } from '@/constants/node-script'
import { cn } from '@/lib/utils'
import type { NodeScriptShotState } from '@/constants/node-script'
import type { NodeV4ReferenceSlot } from '@/types/node-workflow'

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

export function VideoScriptRoleSlots({
  slots,
}: {
  readonly slots: readonly NodeV4ReferenceSlot[]
}) {
  const t = useTranslations('StudioNode.v4.video.scriptShot')
  if (slots.length === 0) return null
  return (
    <div
      data-script-role-slots
      aria-label={t('rolesAriaLabel')}
      className="flex flex-wrap items-center gap-1"
    >
      {slots.map((slot) => (
        <span
          key={slot.role}
          data-script-role-slot={slot.url ? 'filled' : 'empty'}
          className="rounded-full border border-dashed border-border px-2 py-0.5 text-2xs text-muted-foreground"
        >
          {t('roleEmpty', { role: slot.role })}
        </span>
      ))}
    </div>
  )
}
