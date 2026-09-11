'use client'

/**
 * **五动词小标签条**（v2 §4.6 / 画板 BMobile）——「本轮走到哪一步」的读数。
 *
 * ⭐ **只在移动端画**。桌面靠头像旁那句状态词（§3.6）说同一件事；手机上那句话
 * 常常被半屏 Sheet 的折叠内容顶到看不见的地方，所以它在这里换成一条一眼扫得完
 * 的标签条。⛔ 两处同时画 = 同一个进度说了两遍。
 * ⚠ 断点判据用 `lg:hidden`：与外壳自己的 `lg:flex`（`StudioOperatorDock`）
 * **同一条线**，⛔ 不另起容器查询 —— 这不是「面板变窄了」而是「换了一种外壳」。
 *
 * ⚠ 动词**直接读 `step.verb`**（§3.1 的必填一等字段），⛔ 不按工具名反查对照表
 * ——和 `use-studio-operator-status-word` 同一条判据。
 * ⚠ 状态不只靠颜色（`ui-defaults.md §5`）：当前那颗是**近黑实底 + 白字 + 加粗**
 * 三样一起变，已跑过的那几颗是正文色，没跑到的是次文色。
 */

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_VERBS,
} from '@/constants/assistant-operator'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { cn } from '@/lib/utils'
import type { AssistantOperatorVerb } from '@/constants/assistant-operator'

export function StudioOperatorVerbStrip() {
  const t = useTranslations('StudioOperator')
  const { entries } = useStudioOperatorState()

  /**
   * 「本轮」= 最后一条步所在的那一轮（与状态词 hook 同一条口径）。
   * `active` 是正在跑的那一步的动词；`visited` 是这一轮已经落过的全部动词。
   */
  const { active, visited } = useMemo(() => {
    let latestRunKey: string | null = null
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]
      if (entry?.kind === 'step') {
        latestRunKey = entry.runKey
        break
      }
    }
    const seen = new Set<AssistantOperatorVerb>()
    let running: AssistantOperatorVerb | null = null
    if (latestRunKey !== null) {
      for (const entry of entries) {
        if (entry.kind !== 'step' || entry.runKey !== latestRunKey) continue
        seen.add(entry.step.verb)
        if (entry.step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.running) {
          running = entry.step.verb
        }
      }
    }
    return { active: running, visited: seen }
  }, [entries])

  return (
    <div
      data-testid="operator-verb-strip"
      aria-label={t('verbStrip.label')}
      // ⚠ `lg:hidden` 见头注：桌面上这条不存在，不是「藏起来」。
      className="flex shrink-0 flex-wrap gap-1.5 px-3 pb-2 lg:hidden"
    >
      {ASSISTANT_OPERATOR_VERBS.map((verb) => {
        const isActive = active === verb
        const isVisited = visited.has(verb)
        return (
          <span
            key={verb}
            data-testid="operator-verb-pill"
            data-verb={verb}
            data-state={isActive ? 'active' : isVisited ? 'visited' : 'idle'}
            {...(isActive ? { 'aria-current': 'step' as const } : {})}
            className={cn(
              // 24px 药丸（画板 BMobile）——胶囊是 chip 唯一保留的全圆角形状。
              'inline-flex h-6 items-center rounded-full px-2.5 text-2xs transition-colors duration-(--duration-fast) ease-standard motion-reduce:transition-none',
              isActive
                ? // 信号位：近黑实底 + 白字（§12.2）。⛔ 不用 `--primary`——
                  // 那一支被工作台的生成键占着。
                  'bg-foreground font-medium text-background'
                : cn(
                    'border border-border bg-card',
                    isVisited ? 'text-foreground' : 'text-muted-foreground',
                  ),
            )}
          >
            {t(`verb.${verb}`)}
          </span>
        )
      })}
    </div>
  )
}
