'use client'

/**
 * **LoRA 推荐卡**（lora-assistant §10.3.1 / 画板 `LoraPickA` 方向 A「行式清单」）。
 *
 * ── 它在哪儿 ────────────────────────────────────────────────────
 * 长在**时间线里的确认卡槽位**（帧到即插、不离场、就地换态），⛔ 不钉到输入框
 * 上方 —— 那是问题卡「一次只问一个」的位置，而这张卡是多选 + 一颗提交键。
 *
 * ── 为什么勾选框是 checkbox 而不是按钮 ──────────────────────────
 * 与问题卡正好相反：那边点一项就是提交（所以用按钮），这边**点一项什么都不发**，
 * 要等「挂载所选」。radio/checkbox 的语义正是「选中，等会儿一起交」。
 *
 * ── 三条不能软化的规矩 ──────────────────────────────────────────
 * 1. 装不上的候选**照样进卡**（策略 C）：行变灰 + 虚线 + 不可勾，理由写在行里。
 *    滤掉它们之后用户看到的是「没搜到」，而真相是「搜到了但要换底模」。
 * 2. 超预算**只提醒不动手**（§5）：读数标红 + 一行提醒，⛔ 主按钮照旧可点，
 *    ⛔ 不替用户改任何一把的权重。
 * 3. 底模未定（`budget === null`）时只画「已选 N 把」，⛔ 不画一个编出来的分母。
 *
 * ⚠ 勾选态住在**这颗组件**里（`StudioOperatorConfirmPrompt` 第四支的头注）：
 * 它是一次还没提交的编辑，⛔ 不进 store。
 */

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { useFormatter, useTranslations } from 'next-intl'

import { ASSISTANT_OPERATOR_CONFIRM_KIND_IDS } from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_CONFIRM_STATUS_IDS } from '@/constants/studio-assistant-operator'
import { LORA_CANDIDATE_NOT_IMPORTABLE_REASONS } from '@/constants/lora-candidate'
import { cn } from '@/lib/utils'
import type { AssistantOperatorLoraPickCandidate } from '@/types/assistant-operator'
import type { StudioOperatorConfirmPrompt } from '@/types/studio-assistant-operator'
import { LoraLibraryDetailDrawer } from '@/components/business/studio/lora/library/LoraLibraryDetailDrawer'
import { LoraLibraryRowDetail } from '@/components/business/studio/lora/library/LoraLibraryRowDetail'

export type StudioOperatorLoraPickPrompt = Extract<
  StudioOperatorConfirmPrompt,
  { kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.loraPick }
>

/** 「导不进来」的三个码 → 行里那句理由的词条后缀。 */
const NOT_IMPORTABLE_LABEL_KEYS: Record<string, string> = {
  [LORA_CANDIDATE_NOT_IMPORTABLE_REASONS.unknownBaseModel]: 'unknownBaseModel',
  [LORA_CANDIDATE_NOT_IMPORTABLE_REASONS.noWeightFile]: 'noWeightFile',
  [LORA_CANDIDATE_NOT_IMPORTABLE_REASONS.gatedRepo]: 'gatedRepo',
}

/** 装得上 = 两道门都过：架构对得上 + 真能导进来。 */
function isMountable(candidate: AssistantOperatorLoraPickCandidate): boolean {
  return candidate.compatible && candidate.importable
}

/** 权重读数：两位小数够用，⛔ 不把浮点尾巴印到卡上。 */
function formatWeight(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/**
 * 推荐项排组内第一（与问题卡 `orderOptions` 逐字同源）。
 *
 * ⚠ 只认第一个 `recommended`：两项都标推荐等于没有推荐。
 */
function orderCandidates(
  candidates: readonly AssistantOperatorLoraPickCandidate[],
): readonly AssistantOperatorLoraPickCandidate[] {
  const index = candidates.findIndex((one) => one.recommended)
  if (index <= 0) return candidates
  const picked = candidates[index]
  if (!picked) return candidates
  return [picked, ...candidates.filter((_, at) => at !== index)]
}

interface StudioOperatorLoraPickCardProps {
  prompt: StudioOperatorLoraPickPrompt
  /** 助手叫什么 —— 卡头那句「X 找到 N 把 · 选要挂的」。 */
  assistantName: string
  /** 「挂载所选」—— 勾中的那几把（权重缺席 = 用候选的 `defaultWeight`）。 */
  onSubmit(selected: readonly { candidateId: string; weight?: number }[]): void
  /** 关掉不点 —— ⛔ 不发请求，但照样落账。 */
  onDismiss(): void
  /** 「换个词再搜」—— 预填输入框并聚焦，⛔ 不发请求。 */
  onSearchAgain(): void
  /** 「已挂 N 把 · 11:24」里那个时刻。 */
  formatTime(iso: string): string
  /**
   * 缩略图点开 = 库里那张详情抽屉（§10.3.2，commit #7 接线）。
   *
   * ⚠ 缺席时这颗按钮什么都不做 —— ⛔ 别在这里造一份临时的预览：详情只有一份，
   * 它是 `LoraLibraryDetailDrawer`。
   */
  onOpenDetail?(candidateId: string): void
  /**
   * 抽屉此刻开在哪一条候选上（`null` / 缺席 = 没开）——**开合态归宿主 Panel**，
   * 而**勾选态留在这颗卡里**（见文件头注）。
   *
   * ⭐ 为什么这么切：抽屉里那颗「勾上这把」要改的正是卡上那一行的勾选态。
   * 把勾选态提升到 Panel 等于让一次还没提交的编辑离开这张卡；反过来把开合态
   * 也塞进卡里，Panel 就没有任何抓手在别处（比如收起面板）关掉它。
   */
  detailCandidateId?: string | null
  onCloseDetail?(): void
}

export function StudioOperatorLoraPickCard({
  prompt,
  assistantName,
  onSubmit,
  onDismiss,
  onSearchAgain,
  formatTime,
  onOpenDetail,
  detailCandidateId,
  onCloseDetail,
}: StudioOperatorLoraPickCardProps) {
  const t = useTranslations('StudioOperator')
  const format = useFormatter()
  const { pick, status } = prompt
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])

  const byId = useMemo(
    () => new Map(pick.candidates.map((one) => [one.candidateId, one])),
    [pick.candidates],
  )

  const selected = useMemo(
    () =>
      selectedIds.flatMap((id) => {
        const candidate = byId.get(id)
        return candidate ? [candidate] : []
      }),
    [byId, selectedIds],
  )

  /**
   * 底部那个 X —— **当前栈里已经挂着的** + **本次勾中的**。
   *
   * ⚠ 已挂那一半由服务端填在 `budget.total` 上：客户端自己数一遍的表现是
   * 「卡上 1.2、工作台 1.6」，而用户以为自己确认过那个数。
   */
  const total = useMemo(
    () =>
      (pick.budget?.total ?? 0) +
      selected.reduce((sum, one) => sum + one.defaultWeight, 0),
    [pick.budget, selected],
  )
  const overBudget = pick.budget ? total > pick.budget.limit : false

  const decided =
    status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed ||
    status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled
  const submitting = status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting

  /** 抽屉装的那一条 —— 认不出这个 id（换了一帧）就当没开。 */
  const detailCandidate = detailCandidateId
    ? (byId.get(detailCandidateId) ?? null)
    : null

  const toggle = (candidateId: string) => {
    setSelectedIds((ids) =>
      ids.includes(candidateId)
        ? ids.filter((id) => id !== candidateId)
        : [...ids, candidateId],
    )
  }

  /* ── 已挂 / 已取消：整卡收成一行「态 · 时间」（确认卡不离场）────────── */
  if (decided) {
    return (
      <section
        data-testid="operator-lora-pick-card"
        data-status={status}
        className="overflow-hidden rounded-xl border border-assistant-line-strong bg-card shadow-assistant-raised"
      >
        <p
          data-testid="operator-lora-pick-state"
          className="flex items-center gap-2 px-3 py-2 text-2sm text-muted-foreground"
        >
          <span className="shrink-0 font-semibold">
            {status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed
              ? t('confirm.loraPick.mounted', {
                  count: selected.length,
                  time: prompt.decidedAt ? formatTime(prompt.decidedAt) : '',
                })
              : t('confirm.state.cancelled', {
                  time: prompt.decidedAt ? formatTime(prompt.decidedAt) : '',
                })}
          </span>
          <span className="min-w-0 flex-1 truncate">{pick.question}</span>
        </p>
      </section>
    )
  }

  return (
    <section
      data-testid="operator-lora-pick-card"
      data-status={status}
      /* 卡宽 = 面板内宽（画板 A：卡宽 = 容器宽），⛔ 不写死 440px。骨架与问题卡
         同一档：深一档描边 + 柔扩散影（§12.1）。 */
      className="overflow-hidden rounded-xl border border-assistant-line-strong bg-card shadow-assistant-raised"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span
          data-testid="operator-lora-pick-header"
          className="min-w-0 flex-1 truncate text-2xs tracking-nav uppercase text-muted-foreground"
        >
          {t('confirm.loraPick.header', {
            name: assistantName,
            count: pick.candidates.length,
          })}
        </span>
        {/* 当前底模那一格 —— `null` = 底模未定，整格不画（⛔ 不编一个名字）。 */}
        {pick.baseFamilyLabel ? (
          <span
            data-testid="operator-lora-pick-base"
            className="shrink-0 font-mono text-2xs text-muted-foreground"
          >
            {pick.baseFamilyLabel}
          </span>
        ) : null}
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2.5 p-3">
        <legend className="text-sm font-medium leading-snug text-foreground">
          {pick.question}
        </legend>

        <div className="flex flex-col gap-1.5">
          {pick.groups.map((group, groupIndex) => {
            const rows = orderCandidates(
              group.candidateIds.flatMap((id) => {
                const candidate = byId.get(id)
                return candidate ? [candidate] : []
              }),
            )
            return (
              <div
                key={group.title ?? `group-${groupIndex}`}
                data-testid="operator-lora-pick-group"
                className="flex flex-col gap-1.5"
              >
                {/* 组间一条细线 + 小标题；只有一组且无 title 时整块不画。 */}
                {group.title ? (
                  <p
                    data-testid="operator-lora-pick-group-title"
                    className={cn(
                      'text-2xs tracking-nav-dense uppercase text-muted-foreground',
                      groupIndex > 0 && 'border-t border-border pt-2.5',
                    )}
                  >
                    {group.title}
                  </p>
                ) : null}

                {rows.map((candidate) => {
                  const mountable = isMountable(candidate)
                  const checked = selectedIds.includes(candidate.candidateId)
                  const checkboxId = `lora-pick-${prompt.id}-${candidate.candidateId}`
                  const nameId = `${checkboxId}-name`
                  const reasonKey = candidate.notImportableReason
                    ? NOT_IMPORTABLE_LABEL_KEYS[candidate.notImportableReason]
                    : undefined
                  return (
                    <div
                      key={candidate.candidateId}
                      data-testid="operator-lora-pick-row"
                      data-candidate-id={candidate.candidateId}
                      data-mountable={mountable ? 'true' : 'false'}
                      /* 装不上的行：变灰 + 虚线 + 不可勾（⛔ 不藏、⛔ 不只给 tooltip）。 */
                      {...(mountable ? {} : { 'aria-disabled': true })}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md border bg-card p-2',
                        mountable
                          ? checked
                            ? 'border-foreground bg-muted'
                            : 'border-border'
                          : 'border-dashed border-border opacity-60',
                      )}
                    >
                      <input
                        type="checkbox"
                        id={checkboxId}
                        data-testid="operator-lora-pick-checkbox"
                        aria-labelledby={nameId}
                        checked={checked}
                        disabled={!mountable || submitting}
                        /* ⚠ 第二道闸：装不上的那把**连事件都不认**。`disabled`
                           只挡得住真浏览器的激活行为 —— 程序派发的 click 照样
                           进得来，而那会让一把挂不上的 LoRA 算进底部读数。 */
                        onChange={() => {
                          if (!mountable || submitting) return
                          toggle(candidate.candidateId)
                        }}
                        className="size-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
                      />

                      {/* 封面 52×68（`w-13 h-17`）—— 缺席时画占位块，⛔ 不留白。
                          点开 = 库里那张详情抽屉（§10.3.2，commit #7 接线）。 */}
                      <button
                        type="button"
                        data-testid="operator-lora-pick-thumb"
                        aria-label={t('confirm.loraPick.viewDetail')}
                        onClick={() => onOpenDetail?.(candidate.candidateId)}
                        className="h-17 w-13 shrink-0 overflow-hidden rounded-lg border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {candidate.thumbnailUrl ? (
                          <Image
                            src={candidate.thumbnailUrl}
                            alt={candidate.name}
                            width={52}
                            height={68}
                            unoptimized
                            className="size-full object-cover"
                          />
                        ) : (
                          <span
                            data-testid="operator-lora-pick-thumb-fallback"
                            className="flex size-full items-center justify-center font-mono text-xs text-muted-foreground"
                          >
                            {t('confirm.loraPick.noThumbnail')}
                          </span>
                        )}
                      </button>

                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <label
                            id={nameId}
                            htmlFor={checkboxId}
                            className="min-w-0 truncate text-2sm font-medium text-foreground"
                          >
                            {candidate.name}
                          </label>
                          {candidate.recommended ? (
                            <span
                              data-testid="operator-lora-pick-recommended"
                              className="shrink-0 rounded-full border border-primary/40 px-1.5 text-xs text-primary"
                            >
                              {t('question.recommended')}
                            </span>
                          ) : null}
                        </span>

                        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted-foreground">
                          {/* 家族圆点 · 装得上 / 装不上 —— 实心 = 挂得上。 */}
                          <span
                            data-testid="operator-lora-pick-family"
                            className="inline-flex items-center gap-1"
                          >
                            <span
                              aria-hidden
                              className={cn(
                                'inline-block size-1.5 shrink-0 rounded-full',
                                candidate.compatible
                                  ? 'bg-foreground'
                                  : 'border border-muted-foreground',
                              )}
                            />
                            {candidate.compatible
                              ? t('confirm.loraPick.compatible', {
                                  family:
                                    candidate.family ??
                                    t('confirm.loraPick.familyUnknown'),
                                })
                              : t('confirm.loraPick.incompatible', {
                                  family:
                                    candidate.family ??
                                    t('confirm.loraPick.familyUnknown'),
                                })}
                          </span>
                          {/* 作者；null 时退回下载量；两个都没有就整段不画。 */}
                          {candidate.author ? (
                            <span className="truncate">{candidate.author}</span>
                          ) : candidate.downloads !== null ? (
                            <span>
                              {t('confirm.loraPick.downloads', {
                                count: format.number(candidate.downloads, {
                                  notation: 'compact',
                                  maximumFractionDigits: 1,
                                }),
                              })}
                            </span>
                          ) : null}
                          {/* 默认权重只印在挂得上的那几行：挂不上的那一把没有这个数。 */}
                          {mountable ? (
                            <span
                              data-testid="operator-lora-pick-weight"
                              className="font-mono"
                            >
                              ×{formatWeight(candidate.defaultWeight)}
                            </span>
                          ) : null}
                        </span>

                        {/* 导不进来那一句理由 —— ⛔ 不藏进 tooltip。 */}
                        {!candidate.importable && reasonKey ? (
                          <span
                            data-testid="operator-lora-pick-reason"
                            className="text-2xs text-muted-foreground"
                          >
                            {t(`confirm.loraPick.notImportable.${reasonKey}`)}
                          </span>
                        ) : null}

                        {/* 触发词 chip —— ≤2 行，多出来的裁掉（⛔ 不把一行字撑成一屏）。 */}
                        {candidate.triggerWords.length > 0 ? (
                          <span className="flex max-h-11 flex-wrap gap-1 overflow-hidden">
                            {candidate.triggerWords.map((word) => (
                              <span
                                key={word}
                                data-testid="operator-lora-pick-trigger"
                                className="rounded-full border border-border px-1.5 font-mono text-xs text-muted-foreground"
                              >
                                {word}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
          <span
            data-testid="operator-lora-pick-tally"
            data-over-budget={overBudget ? 'true' : 'false'}
            className={cn(
              'text-2sm',
              overBudget ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {pick.budget ? (
              <>
                {t('confirm.loraPick.tally', { count: selected.length })}{' '}
                <span className="font-mono">
                  {formatWeight(total)} / {formatWeight(pick.budget.limit)}
                </span>
              </>
            ) : (
              /* 底模未定 → 只画「已选 N 把」，⛔ 不画一个编出来的分母。 */
              t('confirm.loraPick.tallyNoBudget', { count: selected.length })
            )}
          </span>

          <span className="flex shrink-0 gap-1.5">
            <button
              type="button"
              data-testid="operator-lora-pick-search-again"
              onClick={onSearchAgain}
              className="rounded-md border border-border bg-card px-3 py-1 text-2sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              {t('confirm.loraPick.searchAgain')}
            </button>
            <button
              type="button"
              data-testid="operator-lora-pick-submit"
              /* ⚠ 超预算**不禁用**（§5「只提醒不动手」）：禁用的那一版把「再想想」
                 变成了「不许」，而阈值只是一条经验线。 */
              disabled={selected.length === 0 || submitting}
              onClick={() =>
                onSubmit(
                  selected.map((one) => ({ candidateId: one.candidateId })),
                )
              }
              className="rounded-md bg-foreground px-3.5 py-1 text-2sm font-medium text-background transition-colors duration-(--duration-fast) ease-standard hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
            >
              {t('confirm.loraPick.mount')}
            </button>
          </span>
        </div>

        {/* 超预算那一句提醒 —— 说的是「可能糊」，⛔ 不是「不许」。 */}
        {overBudget && pick.budget ? (
          <p
            data-testid="operator-lora-pick-over-budget"
            className="text-2xs text-destructive"
          >
            {t('confirm.loraPick.overBudget', {
              limit: formatWeight(pick.budget.limit),
            })}
          </p>
        ) : null}

        <button
          type="button"
          data-testid="operator-lora-pick-dismiss"
          onClick={onDismiss}
          disabled={submitting}
          className="self-start text-2xs text-muted-foreground underline-offset-2 transition-colors duration-(--duration-fast) ease-standard hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 motion-reduce:transition-none"
        >
          {t('confirm.loraPick.dismiss')}
        </button>
      </fieldset>

      {/* 缩略图点开 = **库里那张详情抽屉**（§10.3.2）：外壳 `LoraLibraryDetailDrawer`
          + 内容 `LoraLibraryRowDetail` 的候选支，⛔ 不新做一份详情。桌面也用抽屉
          —— 助手面板那点宽度装不下库里桌面版的原位三栏。
          ⚠ 「勾上这把」走的就是行里那个 `toggle`：抽屉与卡上的勾选**是同一份
          state**，关掉抽屉勾选态不变。 */}
      {detailCandidate ? (
        <LoraLibraryDetailDrawer
          open
          onOpenChange={(next) => {
            if (!next) onCloseDetail?.()
          }}
          title={detailCandidate.name}
        >
          <LoraLibraryRowDetail
            source="candidate"
            candidate={detailCandidate}
            checked={selectedIds.includes(detailCandidate.candidateId)}
            /* ⚠ 第二道闸（与行里那颗 checkbox 逐字同源）：装不上的那把连事件
               都不认 —— 详情里那颗按钮已经 disabled，但程序派发的 click 照样
               进得来，而那会让一把挂不上的 LoRA 算进底部读数。 */
            onToggle={(candidateId) => {
              if (!isMountable(detailCandidate) || submitting) return
              toggle(candidateId)
            }}
          />
        </LoraLibraryDetailDrawer>
      ) : null}
    </section>
  )
}
