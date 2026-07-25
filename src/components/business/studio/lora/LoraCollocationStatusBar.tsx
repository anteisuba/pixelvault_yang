'use client'

import { Check, ChevronDown, RotateCcw } from 'lucide-react'
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
  /** 配方带来的参数名列表（无 from→to 快照时的兜底摘要）。 */
  appliedParamLabels: readonly string[]
  /** S5 变更审阅：逐项 from→to（做同款前快照 vs 当前值，由父层算真 diff）。 */
  changedParams?: readonly { label: string; from: string; to: string }[]
  /** S5 变更审阅：Prompt 被并入的新增词（null = 正文没变）。 */
  addedPromptTags?: readonly string[] | null
  /** S5 变更审阅：做同款没动的输入面（「保留项」）。 */
  keptLabels?: readonly string[]
  triggerEntries: readonly TriggerChipEntry[]
  disabledTriggerIds: ReadonlySet<string>
  onToggleTrigger: (assetId: string) => void
  onUndo: () => void
  /**
   * CD③：配方刚落台、用户还没确认过 = 待审阅。此时总览行说「…· 待审阅」，
   * 展开区底部出「应用 / 撤销」一对；确认后才转成「已应用」。值本身在做同款
   * 那一刻就已经写进主台了（CD 的 pending 也是这个语义）——待审阅标的是
   * 「你还没看过」，不是「还没生效」。
   */
  pendingReview?: boolean
  /** 待审阅态点「应用」：确认这批变更，值保持不动，只是不再催审阅。 */
  onApplyPending?: () => void
  /** 展开态提到父层：做同款落台时要能自动摊开这张卡。 */
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}

export function LoraCollocationStatusBar({
  recipeApplied,
  recipeName,
  appliedParamLabels,
  changedParams = [],
  addedPromptTags = null,
  keptLabels = [],
  triggerEntries,
  disabledTriggerIds,
  onToggleTrigger,
  onUndo,
  pendingReview = false,
  onApplyPending,
  expanded,
  onExpandedChange,
}: LoraCollocationStatusBarProps) {
  const t = useTranslations('LoraWorkbench.generate.collocation')
  const isPending = recipeApplied && pendingReview

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
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            // 待审阅时点亮成实心主色（还需要你看一眼），确认后回到常态。
            isPending ? 'bg-primary' : 'bg-primary/70',
          )}
          aria-hidden
        />
        <span className="shrink-0 font-medium text-foreground">
          {t('label')}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {isPending ? (
            <span className="text-foreground">
              {t('recipePending', { name: recipeName ?? '' })}
            </span>
          ) : recipeApplied ? (
            t('recipeApplied')
          ) : null}
          {recipeApplied && activeTriggerCount > 0 ? ' · ' : null}
          {activeTriggerCount > 0
            ? t('triggerCount', { count: activeTriggerCount })
            : null}
        </span>
        {hasDetail ? (
          <button
            type="button"
            onClick={() => onExpandedChange(!expanded)}
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
        {/* 待审阅时头部只留「查看」——应用/撤销一对在展开卡底部（CD③：审阅动作
            和它要审的内容放在一起，头部不出现两个撤销）。确认后头部才回到撤销。 */}
        {recipeApplied && !isPending ? (
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

      {/* S5 变更审阅卡（CD 配屏 5）：展开 = 结构化「做同款改了什么」——已变更项
          逐条 from→to + Prompt 并入的新增词 + 触发词（可停用）+ 保留项（没动的
          输入面）。数据全来自父层真 diff（快照 vs 当前值），无 diff 时退回旧的
          参数名摘要。 */}
      {/* 展开/收起走 grid-rows 过渡（.lora-reveal，域内定义），收起时 inert。 */}
      <div
        className="lora-reveal"
        data-open={expanded && hasDetail ? 'true' : 'false'}
      >
        <div inert={!(expanded && hasDetail)}>
          <div className="space-y-2.5 border-t border-border px-3 py-2.5">
            {recipeApplied && recipeName ? (
              <p className="font-medium text-foreground">
                {t('willChange', { name: recipeName })}
              </p>
            ) : null}

            {addedPromptTags && addedPromptTags.length > 0 ? (
              <div className="flex gap-2">
                <span className="w-12 shrink-0 text-muted-foreground">
                  {t('rowPrompt')}
                </span>
                <span className="min-w-0 flex-1 font-mono text-foreground">
                  + {addedPromptTags.join(', ')}
                  <span className="ml-1 text-muted-foreground">
                    {t('addedWordCount', { count: addedPromptTags.length })}
                  </span>
                </span>
              </div>
            ) : null}

            {changedParams.length > 0 ? (
              <div className="flex gap-2">
                <span className="w-12 shrink-0 text-muted-foreground">
                  {t('rowParams')}
                </span>
                <span className="min-w-0 flex-1 font-mono text-foreground">
                  {changedParams
                    .map((c) => `${c.label} ${c.from}→${c.to}`)
                    .join(' · ')}
                </span>
              </div>
            ) : appliedParamLabels.length > 0 ? (
              <p className="text-muted-foreground">
                {t('appliedParams', { params: appliedParamLabels.join(', ') })}
              </p>
            ) : null}

            {triggerEntries.length > 0 ? (
              <div className="space-y-1">
                <p className="text-muted-foreground">{t('triggerHint')}</p>
                <TriggerChipRow
                  entries={triggerEntries}
                  disabledIds={disabledTriggerIds}
                  onToggle={onToggleTrigger}
                />
              </div>
            ) : null}

            {recipeApplied && keptLabels.length > 0 ? (
              <div className="flex gap-2">
                <span className="w-12 shrink-0 text-muted-foreground">
                  {t('rowKept')}
                </span>
                <span className="min-w-0 flex-1 text-muted-foreground">
                  {t('keptUnchanged', { items: keptLabels.join(' · ') })}
                </span>
              </div>
            ) : null}

            {/* CD③ 审阅动作对：应用 = 确认这批变更（值不动，只收起催审），
                撤销 = 回滚到做同款前的输入快照。 */}
            {isPending ? (
              <div className="flex items-center gap-2 border-t border-border pt-2.5">
                <button
                  type="button"
                  onClick={onApplyPending}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98]"
                >
                  <Check className="size-3" aria-hidden />
                  {t('apply')}
                </button>
                <button
                  type="button"
                  onClick={onUndo}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98]"
                >
                  <RotateCcw className="size-3" aria-hidden />
                  {t('undo')}
                </button>
                <span className="min-w-0 flex-1 text-right text-muted-foreground">
                  {t('pendingHint')}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
