'use client'

import { Check, ChevronDown, RotateCcw } from '@/components/icons'
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
  /**
   * CD①：这条搭配提醒现在讲的是谁的变更——做同款（来源配方）还是助手建议。
   * 只影响措辞，审阅/应用/撤销的机制两边完全一样。
   */
  sourceKind?: 'recipe' | 'assistant'
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
  sourceKind = 'recipe',
  expanded,
  onExpandedChange,
}: LoraCollocationStatusBarProps) {
  const t = useTranslations('LoraWorkbench.generate.collocation')
  const isPending = recipeApplied && pendingReview
  const isAssistant = sourceKind === 'assistant'

  // 「已加入」= 未停用的触发词计数（停用的 chip 不进编译）。
  const activeTriggerCount = triggerEntries.reduce(
    (count, entry) =>
      disabledTriggerIds.has(entry.assetId) ? count : count + 1,
    0,
  )

  // 无内容不渲染：既没应用配方，也没有任何触发词。
  if (!recipeApplied && triggerEntries.length === 0) return null

  // 展开里有没有东西可看。助手建议既没有配方参数名也可能没有触发词，判据要
  // 覆盖真 diff 两行（追加词 / 参数 from→to），否则那张卡根本展不开。
  const hasDetail =
    appliedParamLabels.length > 0 ||
    triggerEntries.length > 0 ||
    changedParams.length > 0 ||
    (addedPromptTags?.length ?? 0) > 0

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
              {isAssistant
                ? t('assistantPending')
                : t('recipePending', { name: recipeName ?? '' })}
            </span>
          ) : recipeApplied ? (
            isAssistant ? (
              t('assistantApplied')
            ) : (
              t('recipeApplied')
            )
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
            {isAssistant ? (
              <p className="font-medium text-foreground">
                {t('willChangeAssistant')}
              </p>
            ) : recipeApplied && recipeName ? (
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

/**
 * 输入框平时收薄时，「搭配」状态条收成工具行最左这一颗（lora-generate.md §2.4，
 * owner 2026-09-29）：点它输入框长回全文、状态条回到顶上。只在「已应用、没有装不上、
 * 没在待审阅、没点开明细」时由调用方摆出来。
 */
export function LoraCollocationChip({
  sourceKind = 'recipe',
  onClick,
}: {
  sourceKind?: 'recipe' | 'assistant'
  onClick: () => void
}) {
  const tc = useTranslations('LoraWorkbench.generate.collocation')
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 min-w-0 shrink items-center gap-1.75 rounded-full px-2.5 text-2sm whitespace-nowrap text-muted-foreground transition-colors duration-fast ease-linear animate-in fade-in-0 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full bg-foreground"
      />
      <b className="shrink-0 font-semibold text-foreground">{tc('label')}</b>
      <span className="min-w-0 truncate">
        {sourceKind === 'assistant'
          ? tc('assistantApplied')
          : tc('recipeApplied')}
      </span>
    </button>
  )
}

interface LoraCollocationBarProps extends Omit<
  LoraCollocationStatusBarProps,
  'onToggleTrigger' | 'triggerEntries' | 'disabledTriggerIds'
> {
  /** 挂上的 LoRA 里有几个和底模装不上（这一轮不生效）。 */
  incompatibleCount: number
  /** 装不上的几个家族互斥：没有一个底模能全装上，只能卸掉其一。 */
  mutuallyExclusive: boolean
  /** 换到推荐底模；给不出真的可用的推荐时不给。 */
  onSwitchBase?: () => void
}

/**
 * 生成台 B 输入框顶上那一条「搭配」（lora-generate.md §2.4）：做同款 / 助手改了
 * 什么、有没有 LoRA 和底模装不上 ——「● 搭配 已应用来源配方」，装不上时多一段
 * 「· 1 个 LoRA 和底模装不上 · 换底模」，末尾「查看 / 收起」在原位展开明细。
 *
 * ⚠ 与手机那张 `LoraCollocationStatusBar` 同一份状态、同一组回调，只换呈现。
 * ⚠ 触发词不在这条上报：它就写在下面的正文里（owner 09-28），没写进去的在提示词
 *   下面那一行「触发词 ＋词」。
 * ⚠ 展开 / 收起走 `.lora-mixwrap`（lora.css）：开 200 淡入、关 120 淡出，输入框
 *   跟着长高 / 收回。
 */
export function LoraCollocationBar({
  recipeApplied,
  recipeName,
  appliedParamLabels,
  changedParams = [],
  addedPromptTags = null,
  keptLabels = [],
  onUndo,
  pendingReview = false,
  onApplyPending,
  sourceKind = 'recipe',
  expanded,
  onExpandedChange,
  incompatibleCount,
  mutuallyExclusive,
  onSwitchBase,
}: LoraCollocationBarProps) {
  const t = useTranslations('LoraWorkbench.generate')
  const tc = useTranslations('LoraWorkbench.generate.collocation')
  const isPending = recipeApplied && pendingReview
  const isAssistant = sourceKind === 'assistant'

  if (!recipeApplied && incompatibleCount === 0) return null
  const hasDetail = recipeApplied
  const dot = (
    <span aria-hidden className="text-muted-foreground/60">
      ·
    </span>
  )
  // 明细只报「改了什么」：新并进提示词的只写几个词（整段原文在输入框里），
  // ⛔ 把几百字的提示词铺进这一行 —— 那会把舞台挤没。
  const recipeLine = [
    addedPromptTags && addedPromptTags.length > 0
      ? `${tc('rowPrompt')}${tc('addedWordCount', {
          count: addedPromptTags.length,
        })}`
      : null,
    changedParams.length > 0
      ? changedParams.map((c) => `${c.label} ${c.from}→${c.to}`).join(' · ')
      : appliedParamLabels.length > 0
        ? tc('appliedParams', { params: appliedParamLabels.join(', ') })
        : null,
  ].filter((part): part is string => part !== null)

  return (
    <>
      <div className="flex h-6.5 min-w-0 items-center gap-2 text-2sm text-muted-foreground">
        <span
          aria-hidden
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            isPending ? 'bg-primary' : 'bg-foreground',
          )}
        />
        <b className="shrink-0 font-semibold text-foreground">{tc('label')}</b>
        <span className="min-w-0 truncate">
          {isPending
            ? isAssistant
              ? tc('assistantPending')
              : tc('recipePending', { name: recipeName ?? '' })
            : recipeApplied
              ? isAssistant
                ? tc('assistantApplied')
                : tc('recipeApplied')
              : null}
        </span>
        {incompatibleCount > 0 ? (
          <>
            {dot}
            <span className="min-w-0 truncate text-status-warning">
              {mutuallyExclusive
                ? t('mountsMutuallyExclusive')
                : tc('incompatible', { count: incompatibleCount })}
            </span>
            {onSwitchBase ? (
              <>
                {dot}
                <button
                  type="button"
                  onClick={onSwitchBase}
                  className="shrink-0 font-semibold text-foreground underline-offset-3 hover:underline"
                >
                  {tc('switchBase')}
                </button>
              </>
            ) : null}
          </>
        ) : null}
        {hasDetail ? (
          <>
            {dot}
            <button
              type="button"
              onClick={() => onExpandedChange(!expanded)}
              aria-expanded={expanded}
              className="shrink-0 font-semibold text-foreground underline underline-offset-3"
            >
              {expanded ? tc('collapse') : tc('view')}
            </button>
          </>
        ) : null}
      </div>
      <div
        className="lora-mixwrap"
        data-open={expanded && hasDetail ? 'true' : 'false'}
      >
        <div inert={!(expanded && hasDetail)}>
          <div className="flex flex-col gap-2.5 rounded-xl bg-muted/60 px-3.5 py-3 text-2sm ring-1 ring-inset ring-border/70">
            {recipeApplied ? (
              <div className="flex items-baseline gap-2.5">
                <span className="w-16 shrink-0 font-semibold text-foreground/80">
                  {isAssistant ? tc('rowAssistant') : tc('rowRecipe')}
                </span>
                <span className="min-w-0 flex-1 text-muted-foreground">
                  {isAssistant
                    ? tc('willChangeAssistant')
                    : tc('willChange', { name: recipeName ?? '' })}
                  {recipeLine.length > 0 ? (
                    <span className="mt-0.5 block font-mono text-xs text-foreground/80">
                      {recipeLine.join(' · ')}
                    </span>
                  ) : null}
                  {keptLabels.length > 0 ? (
                    <span className="mt-0.5 block text-xs">
                      {tc('keptUnchanged', { items: keptLabels.join(' · ') })}
                    </span>
                  ) : null}
                </span>
                {isPending ? (
                  <button
                    type="button"
                    onClick={onApplyPending}
                    className="shrink-0 font-semibold text-foreground underline underline-offset-3"
                  >
                    {tc('apply')}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onUndo}
                  className="shrink-0 font-semibold text-foreground underline underline-offset-3"
                >
                  {tc('undo')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}
