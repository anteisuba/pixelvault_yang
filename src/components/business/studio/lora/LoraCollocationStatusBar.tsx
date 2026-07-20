'use client'

import { useState } from 'react'
import { ChevronDown, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import {
  TriggerChipRow,
  type TriggerChipEntry,
} from '@/components/business/studio/lora/TriggerChipRow'

/**
 * 搭配状态条（G3b-2b · references/pages/lora-generate.md §3.2.4）：Prompt 上方
 * 的单行「搭配」总览——一眼读到「已应用来源配方 · 触发词 ×N 已加入」，点「查看」
 * 原位向下展开（配方带来的参数 + 可停用的触发词 chip），点「撤销」把做同款前的
 * 输入快照整批回滚。挂载后只要有触发词或已应用配方就显示；两者都无则不渲染。
 *
 * 触发词 chips 由本条的展开区承载（TriggerChipRow 内嵌），不再在 composer 顶
 * 独占一行——主台默认更干净，Prompt 更突出。
 */

interface LoraCollocationStatusBarProps {
  /** 是否已通过做同款应用了来源配方（决定「已应用」段 + 撤销按钮）。 */
  recipeApplied: boolean
  /** 已应用配方的来源 LoRA 名（展开区显示）。 */
  recipeName: string | null
  /** 配方带来的参数名列表（展开区显示，如 steps / cfg / sampler）。 */
  appliedParamLabels: readonly string[]
  triggerEntries: readonly TriggerChipEntry[]
  disabledTriggerIds: ReadonlySet<string>
  onToggleTrigger: (assetId: string) => void
  onUndo: () => void
}

export function LoraCollocationStatusBar({
  recipeApplied,
  recipeName,
  appliedParamLabels,
  triggerEntries,
  disabledTriggerIds,
  onToggleTrigger,
  onUndo,
}: LoraCollocationStatusBarProps) {
  const t = useTranslations('LoraWorkbench.generate.collocation')
  const [expanded, setExpanded] = useState(false)

  // 「已加入」= 未停用的触发词计数（停用的 chip 不进编译）。
  const activeTriggerCount = triggerEntries.reduce(
    (count, entry) =>
      disabledTriggerIds.has(entry.assetId) ? count : count + 1,
    0,
  )

  // 无内容不渲染：既没应用配方，也没有任何触发词。
  if (!recipeApplied && triggerEntries.length === 0) return null

  const hasDetail = appliedParamLabels.length > 0 || triggerEntries.length > 0

  return (
    <div className="rounded-lg border border-border bg-muted/20 text-2xs">
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className="size-1.5 shrink-0 rounded-full bg-primary/70"
          aria-hidden
        />
        <span className="shrink-0 font-medium text-foreground">
          {t('label')}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {recipeApplied ? t('recipeApplied') : null}
          {recipeApplied && activeTriggerCount > 0 ? ' · ' : null}
          {activeTriggerCount > 0
            ? t('triggerCount', { count: activeTriggerCount })
            : null}
        </span>
        {hasDetail ? (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('view')}
            <ChevronDown
              className={cn(
                'size-3 transition-transform',
                expanded && 'rotate-180',
              )}
              aria-hidden
            />
          </button>
        ) : null}
        {recipeApplied ? (
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex shrink-0 items-center gap-1 text-muted-foreground transition-colors hover:text-foreground active:scale-[0.97]"
          >
            <RotateCcw className="size-3" aria-hidden />
            {t('undo')}
          </button>
        ) : null}
      </div>

      {expanded && hasDetail ? (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {recipeName ? (
            <p className="text-muted-foreground">
              {t('sourceRecipe', { name: recipeName })}
            </p>
          ) : null}
          {appliedParamLabels.length > 0 ? (
            <p className="text-muted-foreground">
              {t('appliedParams', { params: appliedParamLabels.join(', ') })}
            </p>
          ) : null}
          {triggerEntries.length > 0 ? (
            <TriggerChipRow
              entries={triggerEntries}
              disabledIds={disabledTriggerIds}
              onToggle={onToggleTrigger}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
