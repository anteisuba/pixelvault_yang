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
 * ⚠ **生成那一支的四颗旋钮本片只有结构**：就地改参数是 #9（§5），所以它们此刻
 * 是**只读读数**而不是下拉 —— ⛔ 不摆一颗点了没反应的下拉（那比不摆更坏）。
 */

import { useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS,
  type AssistantOperatorConfirmKind,
} from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_CONFIRM_STATUS_IDS } from '@/constants/studio-assistant-operator'
import { cn } from '@/lib/utils'
import type { StudioOperatorConfirmPrompt } from '@/types/studio-assistant-operator'

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
  /** 「已取消」态上的「再来一次」。 */
  onRetry(): void
  /** 「已确认 · 11:24」里那个时刻怎么写 —— 面板给（`useFormatter` 在那一层）。 */
  formatTime(iso: string): string
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
  onRetry,
  formatTime,
}: StudioOperatorConfirmCardProps) {
  const t = useTranslations('StudioOperator')
  const decided =
    confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed ||
    confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled
  const busy = confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting
  const kind: AssistantOperatorConfirmKind = confirm.kind

  return (
    <section
      data-testid="operator-confirm-card"
      data-kind={kind}
      data-status={confirm.status}
      aria-label={t(`confirm.${kind}.title`, {
        count:
          confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
            ? confirm.steps.length
            : confirm.request.count,
      })}
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card',
        decided && 'opacity-[.92]',
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
            {confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate
              ? `${generateSummary(
                  confirm,
                  t('confirm.generate.count', { count: confirm.request.count }),
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
                : t('confirm.generate.title', {
                    count: confirm.request.count,
                  })}
            </p>
          </div>

          {confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep ? (
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
            /* ⚠ 四颗旋钮本片是**只读读数**：就地改参数是 #9（§5）。
               ⛔ 不摆下拉箭头 —— 点了没反应的下拉比一行读数更坏。 */
            <dl
              data-testid="operator-confirm-knobs"
              className="flex flex-wrap gap-1.5 px-3 py-2"
            >
              {(
                [
                  ['model', confirm.request.model.label],
                  ['aspect', confirm.request.specs.aspectRatio],
                  [
                    'count',
                    t('confirm.generate.count', {
                      count: confirm.request.count,
                    }),
                  ],
                  ['resolution', confirm.request.specs.resolution],
                ] as const
              )
                .filter(([, value]) => Boolean(value))
                .map(([id, value]) => (
                  <div
                    key={id}
                    data-testid="operator-confirm-knob"
                    data-knob={id}
                    className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 px-2 py-1"
                  >
                    <dt className="sr-only">
                      {t(
                        `confirm.generate.${id === 'count' ? 'countLabel' : id}`,
                      )}
                    </dt>
                    <dd className="text-2sm text-foreground">{value}</dd>
                  </div>
                ))}
            </dl>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/45 px-3 py-2">
            <button
              type="button"
              data-testid="operator-confirm-secondary"
              disabled={busy}
              onClick={
                confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
                  ? onDecline
                  : onCancel
              }
              className="rounded-md px-1.5 py-0.5 text-2sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            >
              {confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
                ? t('confirm.multistep.stepByStep')
                : t('confirm.generate.cancel')}
            </button>
            <button
              type="button"
              data-testid="operator-confirm-primary"
              disabled={busy}
              aria-busy={busy}
              onClick={
                confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
                  ? onApprove
                  : onConfirm
              }
              className="rounded-md bg-primary px-2 py-1 text-2sm text-primary-foreground transition-opacity duration-(--duration-fast) ease-standard hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {/* ⚠ 「确认中」是**按钮上的字**而不是另起一行（画板「确认中」那一
                  态）：那一刻用户的眼睛就在这颗按钮上，写在别处等于没写。 */}
              {busy
                ? t('confirm.state.submitting')
                : confirm.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
                  ? t('confirm.multistep.start')
                  : t('confirm.generate.confirm')}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
