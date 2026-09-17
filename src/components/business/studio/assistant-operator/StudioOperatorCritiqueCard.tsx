'use client'

/**
 * 评价卡（拍板 6：**证据长在结论里** —— 卡上内嵌它评的那张图）。
 *
 * ── 两个形态，一颗组件（第二期 · 视频域）────────────────────────────
 * · **单图**（图片域）：左 80×112 嵌图 + 右三段；
 * · **三帧**（视频域）：顶部 `0s / 中 / 末` 三张抽帧并排 + 下方三段。
 *
 * 分岔判据是**载荷里有没有 `frames`**，⛔ 不是「当前工作台是哪个域」：卡是历史
 * 记录的一部分，用户切到图片域之后那条视频评价照样要画得对。域是宿主此刻的
 * 状态，帧是这条记录自己的事实。
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
 * ── 三段（否定 / 异常 / 达成）───────────────────────────────────────
 * ⭐ 「异常」那一段**现在有数据源了**：契约里那个 `ok: boolean` 已经换成
 * `severity`（`fail` / `warn` / `pass`，见常量头注），⛔ 没有并存的两套。
 * ⚠ **空的段不摆**：一条 warn 都没有时那一段整个不渲染 —— 一个永远空着的
 * 「异常」标题读起来像「还没检查」，而它其实是「检查了，没问题」。
 *
 * 缩略图与参考图**共用同一个灯箱**（拍板 17 的后半句）。
 */

import { useState } from 'react'
import { AlertTriangle, Check, Undo2, Wand2, X } from '@/components/icons'
import Image from 'next/image'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_VERDICT_SEVERITIES,
  ASSISTANT_OPERATOR_VERDICT_SEVERITY_IDS as SEVERITY,
  type AssistantOperatorVerdictSeverity,
} from '@/constants/assistant-operator'
import { DURATION, EASE_STANDARD } from '@/constants/motion'
import { STUDIO_OPERATOR_CRITIQUE_FRAME_STAGGER_SECONDS } from '@/constants/studio-assistant-operator'
import { cn } from '@/lib/utils'
import { openOperatorLightbox } from '@/components/business/studio/assistant-operator/StudioOperatorLightbox'
import {
  isVideoCritiquePayload,
  isVideoCritiqueResult,
} from '@/types/studio-assistant-operator'
import type { AssistantOperatorCritiqueStep } from '@/types/assistant-operator'

/** 三帧里的一帧 —— 从契约那份 union 里取出来，⛔ 不在客户端另抄一个形状。 */
type CritiqueFrame = Extract<
  NonNullable<AssistantOperatorCritiqueStep['result']>,
  { frames: unknown }
>['frames'][number]

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
  /**
   * 「按这条建议改提示词」—— 把 `advice` 追加进提示词，走的是助手 `set_prompt`
   * 的**同一条路**（宿主的 `apply.dispatch`）。
   *
   * ⚠ **可选，而且缺席时按钮不渲染**：历史面板那份卡（`StudioOperatorHistoryItem`）
   * 是只读回放，它没有表单可写。⛔ 别为了「形状一致」在那边挂一颗点了没反应的
   * 按钮。
   */
  onApplyAdvice?: ((advice: string) => void) | undefined
}

/** `mm:ss` —— 抽帧时间码。⚠ 只作位置词的注脚（见词表头注）。 */
function formatTimecode(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const mm = Math.floor(total / 60)
  const ss = total % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

/**
 * 三档各一个记号 —— ⛔ 别只用颜色分：`status-warning` 与 `status-risk` 在色觉
 * 障碍下会读成同一条，而这张卡的全部意义就是分清「没做到」和「做到了但有瑕疵」。
 */
function VerdictIcon({
  severity,
}: {
  severity: AssistantOperatorVerdictSeverity
}) {
  if (severity === SEVERITY.fail) {
    return <X className="mt-0.5 size-3 shrink-0 text-status-risk" aria-hidden />
  }
  if (severity === SEVERITY.warn) {
    return (
      <AlertTriangle
        className="mt-0.5 size-3 shrink-0 text-status-warning"
        aria-hidden
      />
    )
  }
  return (
    <Check className="mt-0.5 size-3 shrink-0 text-status-applied" aria-hidden />
  )
}

export function StudioOperatorCritiqueCard({
  step,
  runKey,
  roundChangeCount,
  onRevertRound,
  onApplyAdvice,
}: StudioOperatorCritiqueCardProps) {
  const t = useTranslations('StudioOperator')
  const reduceMotion = useReducedMotion()
  const { payload, result } = step

  const isVideo = isVideoCritiqueResult(result)
  const frames = isVideo ? result.frames : []
  const advice = result.advice ?? null
  const [appliedAdvice, setAppliedAdvice] = useState<string | null>(null)
  const verdicts = isVideo ? result.verdicts : result.findings
  /**
   * 三段的**顺序固定**：否定 → 异常 → 达成。坏消息先说 —— 这张卡存在的理由是
   * 「它备的它负责看」，把达成排在前面等于让用户先读一段表扬。
   */
  const sections = ASSISTANT_OPERATOR_VERDICT_SEVERITIES.map((severity) => ({
    severity,
    items: verdicts.filter((verdict) => verdict.severity === severity),
  })).filter((section) => section.items.length > 0)

  const openFrame = (frame: CritiqueFrame) =>
    openOperatorLightbox(frame.url, t(`critique.frame.${frame.label}`))

  return (
    <div
      data-testid="operator-critique-card"
      data-run-key={runKey}
      data-form={frames.length > 0 ? 'video' : 'image'}
      className="@container overflow-hidden rounded-xl border border-primary/30 text-md"
    >
      <p className="bg-primary/10 px-2.5 py-1.5 text-2sm font-medium text-primary">
        {payload.modelLabel
          ? t('critique.titleWithModel', { model: payload.modelLabel })
          : t('critique.title')}
      </p>

      {/* ── 视频域：三帧并排 ──────────────────────────────────────────
          ⚠ 容器窄时纵排（`@container`，⛔ 不看视口：面板宽度是拖出来的）——
          三张 16:9 挤在一条 240px 的轨上，每张只剩 70px 宽，位置词都读不出来。 */}
      {frames.length > 0 ? (
        <div
          data-testid="operator-critique-frames"
          className="grid grid-cols-1 gap-2 p-2.5 @xs:grid-cols-3"
        >
          {frames.map((frame, index) => (
            <motion.button
              key={`${frame.label}-${frame.url}`}
              type="button"
              data-testid="operator-critique-frame"
              data-frame-label={frame.label}
              onClick={() => openFrame(frame)}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reduceMotion ? 0 : DURATION.base,
                ease: EASE_STANDARD,
                delay: reduceMotion
                  ? 0
                  : index * STUDIO_OPERATOR_CRITIQUE_FRAME_STAGGER_SECONDS,
              }}
              className="group/frame flex cursor-zoom-in flex-col gap-1 text-left"
            >
              <span className="relative block aspect-video overflow-hidden rounded-lg border border-border/70">
                <Image
                  src={frame.url}
                  alt={t(`critique.frame.${frame.label}`)}
                  fill
                  sizes="160px"
                  className="object-cover"
                />
              </span>
              <span className="flex items-baseline justify-between gap-1 font-mono text-2xs text-muted-foreground">
                <span>{t(`critique.frame.${frame.label}`)}</span>
                <span>{formatTimecode(frame.t)}</span>
              </span>
            </motion.button>
          ))}
        </div>
      ) : null}

      <div
        className={cn(
          'flex gap-2.5 px-2.5 pb-2.5',
          frames.length > 0 ? 'pt-0' : 'pt-2.5',
        )}
      >
        {/* 单图形态的那张嵌图 —— 三帧在场时它让位（证据已经在上面了）。 */}
        {frames.length === 0 ? (
          <button
            type="button"
            data-testid="operator-critique-evidence"
            // ⚠ 灯箱开的是**原图**，格子里画的是缩略图（视频/大图直接喂进这个
            //    80×112 的框只是白解码一张大位图）。
            onClick={() =>
              openOperatorLightbox(
                isVideoCritiquePayload(payload)
                  ? payload.videoUrl
                  : payload.imageUrl,
                t('critique.title'),
              )
            }
            className="relative h-28 w-20 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-border/70"
          >
            <Image
              src={
                payload.thumbnailUrl ??
                (isVideoCritiquePayload(payload)
                  ? payload.videoUrl
                  : payload.imageUrl)
              }
              alt={t('critique.title')}
              fill
              sizes="80px"
              className="object-cover"
            />
          </button>
        ) : null}

        <ul className="flex min-w-0 flex-1 flex-col gap-1">
          {sections.map((section) =>
            section.items.map((verdict) => (
              <li
                key={verdict.text}
                data-testid="operator-critique-verdict"
                data-severity={verdict.severity}
                className="flex items-start gap-1.5"
              >
                <VerdictIcon severity={section.severity} />
                <span className="min-w-0 text-2sm text-foreground">
                  {verdict.text}
                </span>
              </li>
            )),
          )}
        </ul>
      </div>

      {/* ⚠ 如实说出来：用户选的那条路看不了图时这一轮是**借**了别的模型看的
          （形态照 `ResolvedVisionRoute.borrowed`）。不说的话，用户会以为自己选的
          模型有视觉能力。 */}
      {result.borrowedVisionRoute ? (
        <p
          data-testid="operator-critique-borrowed"
          className="border-t border-dashed border-primary/30 px-2.5 py-1.5 text-2sm text-muted-foreground"
        >
          {t('critique.borrowed')}
        </p>
      ) : null}

      {advice ? (
        <p className="border-t border-dashed border-primary/30 px-2.5 py-2 text-2sm text-muted-foreground">
          <span className="font-medium text-primary">
            {t('critique.nextRound')}
          </span>{' '}
          {advice}
        </p>
      ) : null}

      {/* ── 卡底两颗动作 ────────────────────────────────────────────
          ⭐ 「按这条建议改提示词」复用 `set_prompt` 的追加语义（宿主那条
          `apply.dispatch`），⛔ 没有第二套写提示词的路。 */}
      {(advice && onApplyAdvice) || roundChangeCount > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-primary/20 px-2.5 py-1.5">
          {advice && onApplyAdvice ? (
            <button
              type="button"
              data-testid="operator-critique-apply-advice"
              disabled={appliedAdvice === advice}
              onClick={() => {
                onApplyAdvice(advice)
                setAppliedAdvice(advice)
              }}
              className="flex items-center gap-1 rounded-md text-2sm text-primary transition-colors duration-fast ease-standard hover:text-primary/80 disabled:cursor-default disabled:text-muted-foreground"
            >
              <Wand2 className="size-3" aria-hidden />
              {t(
                appliedAdvice === advice
                  ? 'critique.adviceApplied'
                  : 'critique.applyAdvice',
              )}
            </button>
          ) : null}
          {roundChangeCount > 0 ? (
            <button
              type="button"
              data-testid="operator-critique-revert-round"
              onClick={() => onRevertRound(runKey)}
              className="flex items-center gap-1 rounded-md text-2sm text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground"
            >
              <Undo2 className="size-3" aria-hidden />
              {t('critique.revertRound', { count: roundChangeCount })}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
