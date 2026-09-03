'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Clock, Loader2, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { LoraTrainingRecord } from '@/types'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export interface TrainingStatusCardProps {
  job: LoraTrainingRecord
  /** FAILED 卡：把该任务的名字/触发词/类型回填进表单（图片得重传）。 */
  onRestoreConfig: (job: LoraTrainingRecord) => void
  /** FAILED 卡：不回填，只收起这张卡（历史列表里仍留着）。 */
  onDismiss: () => void
  className?: string
}

/** 已用时长的刷新节拍：分钟粒度的展示不需要秒级心跳。 */
const ELAPSED_TICK_MS = 30_000

/**
 * CD 训练状态矩阵里「提交之后」的三态卡：排队中 / 训练中 / 失败。
 *
 * 完成态由 CompletionCelebration 承担（绿色仪式卡），空态由 EmptyState 承担，
 * 组建/提交摘要由表单本身 + SubmitSummaryCard 承担 —— 这张卡只补上原先缺的
 * 中间三态：以前它们只在右栏历史列表里显示成一行小徽章，主列没有任何「我的
 * 任务正在跑」的存在感。
 *
 * ⚠ 与 CD 稿的两处出入（都是数据决定的，不伪造）：
 *   - CD 写「步 {trainStep} / 1200」。LoraTrainingRecord 只有 0–1 的 progress，
 *     没有步数/总步数字段，所以这里只出百分比 + 已用时长。
 *   - CD 的失败卡给了「重试」。DB 里 trainingImageKeys 还在，但客户端记录不带
 *     它、也没有 retry 端点，一键重试目前只能是假按钮；因此失败卡给的是
 *     「回到配置」（回填名字/触发词/类型）+ 文案说清图片要重传。
 */
export function TrainingStatusCard({
  job,
  onRestoreConfig,
  onDismiss,
  className,
}: TrainingStatusCardProps) {
  const t = useTranslations('LoraTraining')
  const isFailed = job.status === 'FAILED'
  const isTraining = job.status === 'TRAINING'
  const elapsedMin = useElapsedMinutes(job.createdAt, isFailed)
  // DB 里 progress 是 0–1 的 Float；Progress 原语要 0–100。
  const pct = Math.max(0, Math.min(100, Math.round((job.progress ?? 0) * 100)))

  return (
    <section
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-2xl border p-4 animate-in fade-in slide-in-from-top-1 duration-300',
        isFailed
          ? 'border-destructive/30 bg-destructive/5'
          : 'border-primary/25 bg-primary/5',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
            isFailed
              ? 'bg-destructive/15 text-destructive'
              : 'bg-primary/15 text-primary',
          )}
        >
          {isFailed ? (
            <AlertTriangle className="size-4" aria-hidden />
          ) : isTraining ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Clock className="size-4" aria-hidden />
          )}
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              {isFailed
                ? t('statusCardFailedTitle')
                : isTraining
                  ? t('statusCardTrainingTitle')
                  : t('statusCardQueuedTitle')}
            </h3>
            {isTraining ? (
              <span className="font-mono text-xs text-muted-foreground">
                {pct}%
              </span>
            ) : null}
          </div>

          <p className="font-mono text-2xs text-muted-foreground">
            {job.triggerWord ? `${job.name} · ${job.triggerWord}` : job.name}
          </p>

          {isTraining ? (
            <div className="space-y-1 pt-1">
              <Progress value={pct} className="h-1.5" />
              <p className="font-mono text-2xs text-muted-foreground">
                {t('statusCardElapsed', { min: elapsedMin })}
              </p>
            </div>
          ) : null}

          <p className="pt-0.5 text-2xs leading-relaxed text-muted-foreground">
            {isFailed
              ? (job.errorMessage ?? t('statusCardFailedBody'))
              : isTraining
                ? t('statusCardTrainingBody')
                : t('statusCardQueuedBody')}
          </p>

          {isFailed ? (
            <>
              <p className="text-2xs leading-relaxed text-muted-foreground">
                {t('statusCardFailedRetryHint')}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => onRestoreConfig(job)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <RotateCcw className="size-3" aria-hidden />
                  {t('statusCardRestore')}
                </button>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t('statusCardDismiss')}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  )
}

/**
 * 从任务创建时刻算已用分钟数。`frozen` 时（失败/终态）不再起定时器 —— 终态卡
 * 上的时长没有继续走的意义，也省掉一个常驻 interval。
 */
function useElapsedMinutes(createdAt: Date | string, frozen: boolean) {
  const started = new Date(createdAt).getTime()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (frozen) return
    const id = setInterval(() => setNow(Date.now()), ELAPSED_TICK_MS)
    return () => clearInterval(id)
  }, [frozen])

  if (!Number.isFinite(started)) return 0
  return Math.max(0, Math.floor((now - started) / 60_000))
}
