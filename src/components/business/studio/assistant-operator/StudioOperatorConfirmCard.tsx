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
import { Check, ChevronDown, ChevronUp } from '@/components/icons'
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
import {
  buildOperatorKnobSpecs,
  type StudioOperatorKnobSpec,
} from '@/lib/studio-operator-knobs'
import { cn } from '@/lib/utils'
import type {
  StudioOperatorConfirmPrompt,
  StudioOperatorGenerationControls,
} from '@/types/studio-assistant-operator'

interface StudioOperatorConfirmCardProps {
  /**
   * ⚠ **推荐卡那一支不走这里**（lora-assistant §10.3.1）：它是多选 + 一颗提交键
   * 的另一张卡（`StudioOperatorLoraPickCard`），与这三支一个字段都不共用。
   * ⛔ 别把它加回这份联合去换几行分支 —— 那正是 commit #1 那两个占位分支的下场。
   */
  confirm: Exclude<
    StudioOperatorConfirmPrompt,
    { kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.loraPick }
  >
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

type KnobSpec = StudioOperatorKnobSpec

/** 生成那一支的一行摘要 —— 三态（确认中 / 已确认 / 已取消）都写它。 */
function generateSummary(
  confirm: Extract<
    StudioOperatorConfirmPrompt,
    { kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate }
  >,
  countLabel: string,
  controls?: StudioOperatorGenerationControls,
): string {
  /**
   * ⚠ 模型一律写**显示名**（D12 B5）：载荷里的 `label` 有时就是原始 id
   * （`flux-2-flash`），按工作台的模型表翻一次。
   */
  const modelLabel =
    controls?.models.find((model) => model.id === confirm.request.model.id)
      ?.label ?? confirm.request.model.label
  return [countLabel, modelLabel].filter((value) => Boolean(value)).join(' · ')
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
  const countLabel = (count: number) => t('confirm.generate.count', { count })
  /**
   * ⚠ 读数空的也不画（2026-09-12 实测第 5 步）：该模型有清晰度档、而工作台那一格
   * 还没有值时，一颗什么都没写的旋钮比没有这颗旋钮更难读（判据在
   * `buildOperatorKnobSpecs`，规格行与这张卡共用）。
   */
  const knobs: readonly KnobSpec[] = !generate
    ? []
    : controls
      ? buildOperatorKnobSpecs(controls, countLabel)
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
      aria-label={
        confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate &&
        confirm.request.specs.durationSeconds !== null
          ? t('confirm.generate.titleVideo', {
              seconds: confirm.request.specs.durationSeconds,
            })
          : t(`confirm.${kind}.title`, {
              count:
                confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
                  ? confirm.steps.length
                  : confirm.kind ===
                      ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate
                    ? confirm.request.count
                    : 1,
              name: contextCard ? contextCard.card.name : '',
            })
      }
      /* 画板 BCards「确认」四态的皮肤（§12.1）：
         **待决**走 raised（深一档描边 + 柔扩散影）——它是当下挡路的那张卡；
         **已确认**退回并列的普通卡（细边 + 贴边影）；
         **已取消**再退一档到浅底，它已经不是一件要办的事了。
         ⛔ 不用 opacity 压整卡：半透的字在玻璃面板上直接掉到 AA 线下。 */
      /* D12 S6 / P6：定下来之后**不再是一张卡**，就地收成一行灰字
         「已确认 · 11:24」+ 淡一档的「1 张 · 模型」。待决时才是白底细边卡。 */
      className={cn(
        decided
          ? 'min-w-0'
          : 'overflow-hidden rounded-xl border border-assistant-line-strong bg-card shadow-assistant-raised',
      )}
    >
      {/* ── 已确认 / 已取消：整卡收成一行「态 · 时间」+ 一句交代 ──────── */}
      {decided ? (
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs">
          <span
            data-testid="operator-confirm-state"
            className="shrink-0 text-muted-foreground"
          >
            {confirm.auto
              ? t('confirm.state.auto', {
                  time: confirm.decidedAt ? formatTime(confirm.decidedAt) : '',
                })
              : t(`confirm.state.${confirm.status}`, {
                  time: confirm.decidedAt ? formatTime(confirm.decidedAt) : '',
                })}
          </span>
          <span className="min-w-0 truncate text-muted-foreground/70">
            {/* ⚠ 卡那一支写的是**卡名 + 存没存下**：状态那一格只说得出时刻。 */}
            ·{' '}
            {confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard
              ? `${confirm.card.name} · ${
                  confirm.status ===
                  STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed
                    ? t('confirm.contextCard.saved')
                    : t('confirm.contextCard.notSaved')
                }`
              : confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate
                ? generateSummary(
                    confirm,
                    confirm.request.specs.durationSeconds !== null
                      ? t('confirm.generate.countVideo', {
                          count: confirm.request.count,
                          seconds: confirm.request.specs.durationSeconds,
                        })
                      : t('confirm.generate.count', {
                          count: confirm.request.count,
                        }),
                    controls,
                  )
                : t('confirm.multistep.title', {
                    count: confirm.steps.length,
                  })}
          </span>
          {/* 「再来一次」只长在**生成 · 已取消**那一格上。 */}
          {confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate &&
          confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled ? (
            <button
              type="button"
              data-testid="operator-confirm-retry"
              onClick={onRetry}
              className="shrink-0 rounded-sm text-foreground/80 transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              · {t('confirm.generate.retry')}
            </button>
          ) : null}
        </p>
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
                  : confirm.request.specs.durationSeconds !== null
                    ? // 视频恒单条：说「这段 N 秒视频」，⛔ 不说「1 张」。
                      t('confirm.generate.titleVideo', {
                        seconds: confirm.request.specs.durationSeconds,
                      })
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
                <span className="shrink-0 text-2xs uppercase tracking-nav text-muted-foreground">
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
                        /* ⚠ 向**上**弹（D12 C7 根因）：往下弹会正好盖住「确认生成 /
                           先不要」那一行 —— 菜单开着时去点「先不要」，点中的是被盖在
                           下面的那一项（真机：模型被换成列表第一项、规格跟着回落，
                           还记成「你在确认卡上改的」）。 */
                        side="top"
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
