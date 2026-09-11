'use client'

/**
 * **确认卡**（v2 §3.3 / 画板 BCards「确认」那一节）—— 五类卡之一。
 *
 * ── 它收掉了什么 ────────────────────────────────────────────────
 * 三张卡合成这一张（§3.2「14 → 5」）：
 *  · 花费确认卡（整文件删，决策 8：花钱不再
 *    确认、不弹花费卡）；它的**生成**那一半留下来，成了 `generate` 支；
 *  · 计划 / 多步确认（此前寄居在反问卡的「阶段清单」里）—— 成了 `multistep` 支；
 *  · 覆盖手写三选（旧 `StudioOperatorConfirmCard`）—— 降级成**问题卡**（§3.1），
 *    ⛔ 不在这里留一支：它本来就是「三选一」那个形状。
 *
 * ── 两支为什么共用一张卡 ─────────────────────────────────────────
 * 用户看的是同一件事：「有一件事等你拍板才能往下走」。两支的差别只在**摆什么**，
 * 而那正是 `kind` 判别联合该干的活。⛔ 别按支再拆两颗组件：两颗组件的下场是
 * 「已确认 · 时间」那一态在其中一颗上忘了实现，而没有人会注意到。
 *
 * ── 状态就地换，⛔ 不离开时间线（§3.2 进离场表）────────────────────
 * 确认 / 取消之后卡**留在原地**换成「已确认 · 11:24」/「已取消 · 11:22」。
 * 理由：它是这一轮里的一次决定，抹掉它等于时间线上少了一段因果。
 *
 * ── 四颗旋钮：就地可换（#9 / §5.1）────────────────────────────────
 * ⭐ **卡自己不存任何一份参数**（§5.2「工作台是真值，卡是它的一个可编辑视图」）：
 * 读数来自宿主现算的 `controls`，改一下立刻经 `onAdjust` 写回工作台，下一帧
 * `controls` 自己变过来。⛔ 别为「点下去要立刻看见」加一个乐观 `useState` ——
 * 那就是卡自己攒一份参数，而 §5.2 那段「为什么立刻写回」讲的正是它的下场。
 * ⚠ 宿主不给 `controls` 时（LoRA 装配台）退回**只读读数**，⛔ 不摆一颗点了没
 * 反应的下拉（那比不摆更坏）。
 * ⚠ 某颗旋钮的候选表为空 = 这个模型没有它（视频档大量如此），那一颗**不画**。
 */

import { useState } from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS,
  type AssistantOperatorConfirmKind,
} from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_CONFIRM_STATUS_IDS,
  STUDIO_OPERATOR_GENERATE_KNOB_IDS,
  type StudioOperatorGenerateKnob,
} from '@/constants/studio-assistant-operator'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { cn } from '@/lib/utils'
import type {
  StudioOperatorConfirmPrompt,
  StudioOperatorGenerationControls,
} from '@/types/studio-assistant-operator'

interface StudioOperatorConfirmCardProps {
  confirm: StudioOperatorConfirmPrompt
  /** 多步「开始」。 */
  onApprove(): void
  /** 多步「一步一步来」。 */
  onDecline(): void
  /** 生成「确认生成」—— ⚠ 扳机在宿主那颗生成键上，⛔ 不重发一轮（§5）。 */
  onConfirm(): void
  /** 生成「先不要」。 */
  onCancel(): void
  /** 上下文卡「存这张卡」（§8.1）—— 翻面那一跳在 hook 里。 */
  onSaveCard(): void
  /** 上下文卡「不用」—— hook 把那一行待确认删掉。 */
  onDismissCard(): void
  /** 「已取消」态上的「再来一次」。 */
  onRetry(): void
  /** 「已确认 · 11:24」里那个时刻怎么写 —— 面板给（`useFormatter` 在那一层）。 */
  formatTime(iso: string): string
  /**
   * 四颗旋钮的**真值视图**（§5.2）。缺席 = 这个宿主上它们是只读读数。
   */
  controls?: StudioOperatorGenerationControls
  /**
   * 就地换一颗（§5.2 第二行）—— 返回换模型顺手回落掉的那几颗，卡据此写
   * 「已按 X 调整」那一行（§5.1）。
   */
  onAdjust?(
    knob: StudioOperatorGenerateKnob,
    value: string,
  ): readonly StudioOperatorGenerateKnob[]
}

/** 一颗旋钮摆什么：读数 + （可换时）候选表。⚠ 候选空 = 这一颗不画。 */
interface KnobSpec {
  id: StudioOperatorGenerateKnob
  /** chip 上写的那串（张数是「3 张」，模型是标签）。 */
  value: string
  /** 打勾比的那一份原值（张数是 `"3"`，模型是 id）。 */
  current: string
  options: readonly { value: string; label: string }[]
}

/** 生成那一支的一行摘要 —— 三态（确认中 / 已确认 / 已取消）都写它。 */
function generateSummary(
  confirm: Extract<
    StudioOperatorConfirmPrompt,
    { kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate }
  >,
  countLabel: string,
): string {
  return [countLabel, confirm.request.model.label]
    .filter((value) => Boolean(value))
    .join(' · ')
}

export function StudioOperatorConfirmCard({
  confirm,
  onApprove,
  onDecline,
  onConfirm,
  onCancel,
  onSaveCard,
  onDismissCard,
  onRetry,
  formatTime,
  controls,
  onAdjust,
}: StudioOperatorConfirmCardProps) {
  const t = useTranslations('StudioOperator')
  /** 卡的档名（角色 / 风格 / 品牌）与编辑器共用一份词表，⛔ 不抄第二份。 */
  const tCards = useTranslations('ContextCards')
  /**
   * 哪一颗的下拉开着 —— 一次只开一颗（画板「模型下拉展开」那一张）。
   * ⚠ 这是**弹层开合**，不是参数：参数一个字都不住在卡里（见文件头注）。
   */
  const [openKnob, setOpenKnob] = useState<StudioOperatorGenerateKnob | null>(
    null,
  )
  /** 上一次换模型顺手回落掉的那几颗（§5.1「已按 X 调整」那一行）。 */
  const [adjusted, setAdjusted] = useState<
    readonly StudioOperatorGenerateKnob[]
  >([])
  const decided =
    confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed ||
    confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled
  const busy = confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting
  const kind: AssistantOperatorConfirmKind = confirm.kind

  const generate =
    confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate
      ? confirm
      : null
  /**
   * 提议记一张卡那一支（§8.1）—— 卡上摆的是草稿本身。
   * ⚠ 它没有旋钮、也没有步骤清单：下面那两处分支因此各自早退。
   */
  const contextCard =
    confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard
      ? confirm
      : null
  /**
   * 四颗旋钮摆什么。
   *
   * ⭐ 有 `controls` 时**一格都不读 `request`**：工作台是真值（§5.2 第一 / 第三行），
   * 读 `request` 等于读卡出现那一刻的快照 —— 用户之后在工作台上改的就看不见了。
   * ⚠ 没有 `controls`（LoRA 装配台）才回落到 `request` 那份只读读数。
   */
  const choices = controls
    ? (controls.choicesByModel[controls.model?.id ?? ''] ?? {
        aspectRatios: [],
        resolutions: [],
        counts: [],
      })
    : null
  const countLabel = (count: number) => t('confirm.generate.count', { count })
  const knobs: readonly KnobSpec[] = !generate
    ? []
    : controls && choices
      ? (
          [
            {
              id: STUDIO_OPERATOR_GENERATE_KNOB_IDS.model,
              value: controls.model?.label ?? generate.request.model.label,
              current: controls.model?.id ?? '',
              options: controls.models.map((model) => ({
                value: model.id,
                label: model.label,
              })),
            },
            {
              id: STUDIO_OPERATOR_GENERATE_KNOB_IDS.aspect,
              value: controls.aspectRatio,
              current: controls.aspectRatio,
              options: choices.aspectRatios.map((ratio) => ({
                value: ratio,
                label: ratio,
              })),
            },
            {
              id: STUDIO_OPERATOR_GENERATE_KNOB_IDS.count,
              value: countLabel(controls.count),
              current: String(controls.count),
              options: choices.counts.map((count) => ({
                value: String(count),
                label: countLabel(count),
              })),
            },
            {
              id: STUDIO_OPERATOR_GENERATE_KNOB_IDS.resolution,
              value: controls.resolution ?? '',
              current: controls.resolution ?? '',
              options: choices.resolutions.map((resolution) => ({
                value: resolution,
                label: resolution,
              })),
            },
          ] satisfies KnobSpec[]
        )
          /**
           * 候选空 = 这个模型没有这颗旋钮（视频档的张数、无清晰度档的模型）。
           * ⚠ **读数空的也不画**（2026-09-12 实测第 5 步）：该模型有清晰度档、
           * 而工作台那一格还没有值时，此前画出来的是一颗空 chip —— 一颗什么都
           * 没写的旋钮比没有这颗旋钮更难读。⛔ 不为它编一个默认值：真值在
           * 工作台（§5.2），卡只是它的一个视图。
           */
          .filter((knob) => knob.options.length > 0 && knob.value.length > 0)
      : (
          [
            {
              id: STUDIO_OPERATOR_GENERATE_KNOB_IDS.model,
              value: generate.request.model.label,
              current: generate.request.model.id,
              options: [],
            },
            {
              id: STUDIO_OPERATOR_GENERATE_KNOB_IDS.aspect,
              value: generate.request.specs.aspectRatio ?? '',
              current: generate.request.specs.aspectRatio ?? '',
              options: [],
            },
            {
              id: STUDIO_OPERATOR_GENERATE_KNOB_IDS.count,
              value: countLabel(generate.request.count),
              current: String(generate.request.count),
              options: [],
            },
            {
              id: STUDIO_OPERATOR_GENERATE_KNOB_IDS.resolution,
              value: generate.request.specs.resolution ?? '',
              current: generate.request.specs.resolution ?? '',
              options: [],
            },
          ] satisfies KnobSpec[]
        ).filter((knob) => Boolean(knob.value))

  /**
   * 点中一项 —— **立刻写回工作台**（§5.2 第二行），⛔ 卡上不留一份乐观值。
   * 换模型返回回落掉的那几颗；换别的返回空数组，那句「已按 X 调整」顺手清掉
   * （用户已经自己接管了那一格）。
   */
  const pick = (knob: StudioOperatorGenerateKnob, value: string) => {
    setOpenKnob(null)
    setAdjusted(onAdjust?.(knob, value) ?? [])
  }

  return (
    <section
      data-testid="operator-confirm-card"
      data-kind={kind}
      data-status={confirm.status}
      aria-label={t(`confirm.${kind}.title`, {
        count:
          confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
            ? confirm.steps.length
            : confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate
              ? confirm.request.count
              : 1,
        name: contextCard ? contextCard.card.name : '',
      })}
      /* 画板 BCards「确认」四态的皮肤（§12.1）：
         **待决**走 raised（深一档描边 + 柔扩散影）——它是当下挡路的那张卡；
         **已确认**退回并列的普通卡（细边 + 贴边影）；
         **已取消**再退一档到浅底，它已经不是一件要办的事了。
         ⛔ 不用 opacity 压整卡：半透的字在玻璃面板上直接掉到 AA 线下。 */
      className={cn(
        'overflow-hidden rounded-xl',
        decided
          ? confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled
            ? 'border border-border bg-muted'
            : 'border border-border bg-card shadow-assistant-card'
          : 'border border-assistant-line-strong bg-card shadow-assistant-raised',
      )}
    >
      {/* ── 已确认 / 已取消：整卡收成一行「态 · 时间」+ 一句交代 ──────── */}
      {decided ? (
        <div className="flex items-center gap-2 px-3 py-2">
          <span
            data-testid="operator-confirm-state"
            className="shrink-0 text-2sm font-semibold text-muted-foreground"
          >
            {t(`confirm.state.${confirm.status}`, {
              time: confirm.decidedAt ? formatTime(confirm.decidedAt) : '',
            })}
          </span>
          <span className="min-w-0 flex-1 truncate text-2sm text-muted-foreground">
            {/* ⚠ 卡那一支写的是**卡名 + 存没存下**：状态那一格只说得出时刻。 */}
            {confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard
              ? `${confirm.card.name} · ${
                  confirm.status ===
                  STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed
                    ? t('confirm.contextCard.saved')
                    : t('confirm.contextCard.notSaved')
                }`
              : confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate
                ? `${generateSummary(
                    confirm,
                    t('confirm.generate.count', {
                      count: confirm.request.count,
                    }),
                  )} · ${
                    confirm.status ===
                    STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed
                      ? t('confirm.generate.handedOff')
                      : t('confirm.generate.notRun')
                  }`
                : t('confirm.multistep.title', { count: confirm.steps.length })}
          </span>
          {/* 「再来一次」只长在**生成 · 已取消**那一格上：多步取消之后要写的是
              下一句话（输入框已经预填好了），⛔ 不是把同一份计划再摆一遍。 */}
          {confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate &&
          confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled ? (
            <button
              type="button"
              data-testid="operator-confirm-retry"
              onClick={onRetry}
              className="shrink-0 rounded-md px-1.5 py-0.5 text-md text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('confirm.generate.retry')}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="border-b border-border px-3 py-2">
            <p
              data-testid="operator-confirm-title"
              className="text-md font-semibold text-foreground"
            >
              {confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
                ? t('confirm.multistep.title', { count: confirm.steps.length })
                : confirm.kind ===
                    ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard
                  ? t('confirm.contextCard.title')
                  : t('confirm.generate.title', {
                      count: confirm.request.count,
                    })}
            </p>
          </div>

          {contextCard ? (
            /* ⭐ 卡的**预览**（§8.1 「客户端」那一行）：档 + 名字 + 一句话摘要
               + 正文。⚠ 正文截几行就够 —— 这张卡是让用户认出「说的是这件事」，
               ⛔ 不是编辑器（要改字去设置里那张卡上改）。 */
            <div
              data-testid="operator-confirm-context-card"
              data-card-kind={contextCard.card.kind}
              className="flex flex-col gap-1 px-3 py-2"
            >
              <p className="flex items-baseline gap-1.5">
                <span className="shrink-0 font-mono text-2xs uppercase tracking-nav text-muted-foreground">
                  {tCards(`kind.${contextCard.card.kind}`)}
                </span>
                <span className="min-w-0 flex-1 truncate text-md font-semibold text-foreground">
                  {contextCard.card.name}
                </span>
              </p>
              {contextCard.card.summary ? (
                <p className="text-2sm text-muted-foreground">
                  {contextCard.card.summary}
                </p>
              ) : null}
              {contextCard.card.body ? (
                <p className="line-clamp-4 whitespace-pre-wrap text-2sm leading-relaxed text-muted-foreground">
                  {contextCard.card.body}
                </p>
              ) : null}
              {contextCard.card.negative ? (
                <p className="truncate text-2xs text-muted-foreground">
                  {t('confirm.contextCard.negative', {
                    value: contextCard.card.negative,
                  })}
                </p>
              ) : null}
            </div>
          ) : confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep ? (
            /* ⭐ 多步摆的是**一行动作串**而不是一张清单（画板「多步」那一态）：
               这张卡要回答的只有「一共几步、大致做什么」，摊开的清单会让用户以为
               每一步都要他确认一遍。 */
            <p
              data-testid="operator-confirm-steps"
              className="px-3 py-2 text-2sm leading-relaxed text-muted-foreground"
            >
              {confirm.steps.map((step) => step.label).join(' · ')}
              {t('confirm.multistep.stoppable')}
            </p>
          ) : (
            /* ⭐ 四颗旋钮就地可换（§5.1）—— 候选表空的那一颗**不画**（这个模型
               没有它）。⛔ 不摆一颗点了没反应的下拉，那比不摆更坏。 */
            <div className="flex flex-col gap-1 px-3 py-2">
              <div
                data-testid="operator-confirm-knobs"
                className="flex flex-wrap gap-1.5"
              >
                {knobs.map((knob) => {
                  const label = t(
                    `confirm.generate.${
                      knob.id === STUDIO_OPERATOR_GENERATE_KNOB_IDS.count
                        ? 'countLabel'
                        : knob.id
                    }`,
                  )
                  if (knob.options.length === 0) {
                    return (
                      <div
                        key={knob.id}
                        data-testid="operator-confirm-knob"
                        data-knob={knob.id}
                        className="flex items-center gap-1 rounded-md border border-border bg-muted px-2.5 py-1"
                      >
                        <span className="sr-only">{label}</span>
                        <span className="text-2sm text-foreground">
                          {knob.value}
                        </span>
                      </div>
                    )
                  }
                  const open = openKnob === knob.id
                  return (
                    <ResponsivePopover
                      key={knob.id}
                      open={open}
                      onOpenChange={(next) =>
                        setOpenKnob(next ? knob.id : null)
                      }
                    >
                      <ResponsivePopoverTrigger asChild>
                        <button
                          type="button"
                          data-testid="operator-confirm-knob"
                          data-knob={knob.id}
                          data-open={open || undefined}
                          disabled={busy}
                          aria-label={label}
                          className={cn(
                            'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-2sm transition-colors duration-(--duration-fast) ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
                            open
                              ? 'border-foreground bg-foreground font-medium text-background'
                              : 'border-border bg-muted text-foreground hover:bg-accent',
                          )}
                        >
                          <span className="max-w-40 truncate">
                            {knob.value}
                          </span>
                          {open ? (
                            <ChevronUp
                              className="size-3 shrink-0"
                              aria-hidden
                            />
                          ) : (
                            <ChevronDown
                              className="size-3 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                          )}
                        </button>
                      </ResponsivePopoverTrigger>
                      <ResponsivePopoverContent
                        /* 画板：弹层落在 chip **下方**（卡在时间线中段，
                           ⛔ 不照输入框那颗 chip 的 `side="top"` 抄）。 */
                        side="bottom"
                        align="start"
                        label={label}
                        className="w-60 p-0"
                        mobileClassName="px-0"
                      >
                        <div
                          role="menu"
                          aria-label={label}
                          data-testid="operator-confirm-knob-menu"
                          data-knob={knob.id}
                          className="flex max-h-72 flex-col gap-0.5 overflow-y-auto p-1.5"
                        >
                          {knob.options.map((option) => {
                            const active = option.value === knob.current
                            return (
                              <button
                                key={option.value}
                                type="button"
                                role="menuitemradio"
                                aria-checked={active}
                                data-testid="operator-confirm-knob-option"
                                data-value={option.value}
                                onClick={() => pick(knob.id, option.value)}
                                className={cn(
                                  'flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-2sm text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                  active && 'bg-muted font-medium',
                                )}
                              >
                                <span className="truncate">{option.label}</span>
                                {active ? (
                                  <Check
                                    className="size-3.5 shrink-0 text-foreground"
                                    aria-hidden
                                  />
                                ) : null}
                              </button>
                            )
                          })}
                        </div>
                      </ResponsivePopoverContent>
                    </ResponsivePopover>
                  )
                })}
              </div>
              {/* ⚠ 换模型让别的值不合法时**就地说一句**，⛔ 不弹二次确认（§5.1）。 */}
              {adjusted.length > 0 ? (
                <p
                  data-testid="operator-confirm-adjusted"
                  className="text-2xs text-muted-foreground"
                >
                  {t('confirm.generate.adjusted', {
                    fields: adjusted
                      .map((knob) =>
                        t(
                          `confirm.generate.${
                            knob === STUDIO_OPERATOR_GENERATE_KNOB_IDS.count
                              ? 'countLabel'
                              : knob
                          }`,
                        ),
                      )
                      .join(' · '),
                  })}
                </p>
              ) : null}
            </div>
          )}

          <div className="flex items-center gap-2 px-3 pb-3 pt-1">
            <button
              type="button"
              data-testid="operator-confirm-primary"
              disabled={busy}
              aria-busy={busy}
              onClick={
                contextCard
                  ? onSaveCard
                  : confirm.kind ===
                      ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
                    ? onApprove
                    : onConfirm
              }
              className="flex h-8 items-center rounded-md bg-foreground px-4 text-2sm font-medium text-background transition-[background-color,transform] duration-(--duration-fast) ease-standard hover:bg-foreground/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
            >
              {/* ⚠ 「确认中」是**按钮上的字**而不是另起一行（画板「确认中」那一
                  态）：那一刻用户的眼睛就在这颗按钮上，写在别处等于没写。 */}
              {busy
                ? t('confirm.state.submitting')
                : contextCard
                  ? t('confirm.contextCard.save')
                  : confirm.kind ===
                      ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
                    ? t('confirm.multistep.start')
                    : t('confirm.generate.confirm')}
            </button>
            <button
              type="button"
              data-testid="operator-confirm-secondary"
              disabled={busy}
              onClick={
                contextCard
                  ? onDismissCard
                  : confirm.kind ===
                      ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
                    ? onDecline
                    : onCancel
              }
              className="flex h-8 items-center rounded-md border border-border bg-card px-4 text-2sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
            >
              {contextCard
                ? t('confirm.contextCard.dismiss')
                : confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
                  ? t('confirm.multistep.stepByStep')
                  : t('confirm.generate.cancel')}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
