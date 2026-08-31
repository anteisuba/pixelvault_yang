'use client'

/**
 * 评价卡（拍板 6：**证据长在结论里** —— 卡上内嵌它评的那张图）。
 *
 * ── 数据从哪来（P3-C）─────────────────────────────────────────────
 * 它收的是一条**真的 step**：`critique_result` 那一支。图片地址就在
 * `payload.imageUrl` 里，是服务端从请求里那份 `result` 抄过来的 —— 而那份
 * `result` 只有在归属追踪认定「这一枪是助手备的」时才会被带上去
 * （`lib/studio-operator-claim.ts`）。所以这张卡在结构上**不可能**出现在用户
 * 自己发的那次生成后面（拍板 4）。
 *
 * ⛔ 没有任何示意用的假数据：一张写着「示例」的评价卡与真评价长得一模一样，
 * 那是最容易被当成「已经能用」的一类假象。
 *
 * 缩略图与参考图**共用同一个灯箱**（拍板 17 的后半句）。
 */

import { Check, Undo2, X } from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { openOperatorLightbox } from '@/components/business/studio/assistant-operator/StudioOperatorLightbox'
import type { AssistantOperatorCritiqueStep } from '@/types/assistant-operator'

interface StudioOperatorCritiqueCardProps {
  /**
   * ⚠ 收的是**已经跑完**的那一支（`result` 非 null）。还在跑的那一帧由普通日志
   * 条渲染 —— 宿主负责分岔，这颗组件因此不必自带一个「看图中」的空态。
   */
  step: AssistantOperatorCritiqueStep & {
    result: NonNullable<AssistantOperatorCritiqueStep['result']>
  }
  /** 这一轮的 token —— 「还原这轮」按它成组（见 `StudioOperatorStepEntry.runKey`）。 */
  runKey: string
  /**
   * 这一轮有几处可还原。**0 时按钮不渲染** —— 一颗点了什么都不会发生的按钮
   * 比没有按钮糟：用户会以为自己撤过了。
   */
  roundChangeCount: number
  onRevertRound(runKey: string): void
}

export function StudioOperatorCritiqueCard({
  step,
  runKey,
  roundChangeCount,
  onRevertRound,
}: StudioOperatorCritiqueCardProps) {
  const t = useTranslations('StudioOperator')
  const { payload, result } = step

  return (
    <div
      data-testid="operator-critique-card"
      data-run-key={runKey}
      className="overflow-hidden rounded-xl border border-primary/30 text-xs"
    >
      <p className="bg-primary/10 px-2.5 py-1.5 text-2xs font-medium text-primary">
        {payload.modelLabel
          ? t('critique.titleWithModel', { model: payload.modelLabel })
          : t('critique.title')}
      </p>
      <div className="flex gap-2.5 p-2.5">
        <button
          type="button"
          data-testid="operator-critique-evidence"
          // ⚠ 灯箱开的是**原图**，格子里画的是缩略图（视频/大图直接喂进这个
          //    80×112 的框只是白解码一张大位图）。
          onClick={() =>
            openOperatorLightbox(payload.imageUrl, t('critique.title'))
          }
          className="relative h-28 w-20 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-border/70"
        >
          <Image
            src={payload.thumbnailUrl ?? payload.imageUrl}
            alt={t('critique.title')}
            fill
            sizes="80px"
            className="object-cover"
          />
        </button>
        <ul className="flex min-w-0 flex-1 flex-col gap-1">
          {result.findings.map((finding) => (
            <li key={finding.text} className="flex items-start gap-1.5">
              {finding.ok ? (
                <Check
                  className="mt-0.5 size-3 shrink-0 text-primary"
                  aria-hidden
                />
              ) : (
                <X
                  className="mt-0.5 size-3 shrink-0 text-destructive"
                  aria-hidden
                />
              )}
              <span className="min-w-0 text-2xs text-foreground">
                {finding.text}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ⚠ 如实说出来：用户选的那条路看不了图时这一轮是**借**了别的模型看的
          （形态照 `ResolvedVisionRoute.borrowed`）。不说的话，用户会以为自己选的
          模型有视觉能力。 */}
      {result.borrowedVisionRoute ? (
        <p
          data-testid="operator-critique-borrowed"
          className="border-t border-dashed border-primary/30 px-2.5 py-1.5 text-2xs text-muted-foreground"
        >
          {t('critique.borrowed')}
        </p>
      ) : null}

      {result.advice ? (
        <p className="border-t border-dashed border-primary/30 px-2.5 py-2 text-2xs text-muted-foreground">
          <span className="font-medium text-primary">
            {t('critique.nextRound')}
          </span>{' '}
          {result.advice}
        </p>
      ) : null}

      {/* ── 还原这轮 —— 一键撤掉评价之后预填的整轮改动 ──────────────
          ⭐ 复用的是同一条撤销机制（`use-studio-operator-revert`），⛔ 没有第二套。 */}
      {roundChangeCount > 0 ? (
        <div className="border-t border-primary/20 px-2.5 py-1.5">
          <button
            type="button"
            data-testid="operator-critique-revert-round"
            onClick={() => onRevertRound(runKey)}
            className="flex items-center gap-1 rounded-md text-2xs text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground"
          >
            <Undo2 className="size-3" aria-hidden />
            {t('critique.revertRound', { count: roundChangeCount })}
          </button>
        </div>
      ) : null}
    </div>
  )
}
