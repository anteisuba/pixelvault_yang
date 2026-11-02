'use client'

/**
 * **多张生成的确认卡 · 队列条**（v3 S2，owner 2026-10-09 三个方向里选 C）。
 *
 * 一排小图，点一张就把它去掉；底下写总价。确认后同一排变成进度：每格的边按进度走满
 * （「边即进度」，与画布卡同一份 `StudioGeneratingProgress`），出来的图在格里由糊变清
 * （`useMediaReveal`）。一个东西从确认走到结果，⛔ 不再另落结果卡 —— 画布的产出本来
 * 就落在那几张卡自己的版本表里。
 *
 * ⚠ 卡上不存任何一份参数：每格的进度与图现读画布（`runOf`），价格现算（`costOf`）。
 *   卡上只记「哪几张被去掉了」—— 那是这张确认卡自己的选择，确认时交给 `onConfirm`。
 */

import { useEffect, useState } from 'react'
import NextImage from 'next/image'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { ASSISTANT_OPERATOR_CONFIRM_KIND_IDS } from '@/constants/assistant-operator'
import { DURATION, EASE_STANDARD, QUEUE_STRIP } from '@/constants/motion'
import { formatUnitPriceAmount } from '@/constants/models/unit-prices'
import {
  NODE_STATUS_IDS,
  type NodeWorkflowStatus,
} from '@/constants/node-types'
import { STUDIO_OPERATOR_CONFIRM_STATUS_IDS } from '@/constants/studio-assistant-operator'
import type { AssistantOperatorGenerationRequest } from '@/types/assistant-operator'
import type { StudioOperatorConfirmPrompt } from '@/types/studio-assistant-operator'
import { StudioGeneratingProgress } from '@/components/business/studio-shared/primitives/StudioGeneratingProgress'
import { BlurSwap, useBlurSwapIn } from '@/components/ui/blur-swap'
import { useMediaReveal } from '@/components/ui/load-reveal'
import { RollingNumber } from '@/components/ui/rolling-number'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

type QueueConfirm = Extract<
  StudioOperatorConfirmPrompt,
  { kind: typeof ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate }
>

interface QueueRun {
  status: NodeWorkflowStatus
  previewUrl?: string
}

interface StudioOperatorQueueCardProps {
  confirm: QueueConfirm
  /** 条上那几张（`request.canvasNodes`；确认后是真去跑的那几张）。 */
  nodes: NonNullable<AssistantOperatorGenerationRequest['canvasNodes']>
  runOf?(nodeId: string): QueueRun | undefined
  /** 这张卡按现在的参数跑一次约多少钱；`null` = 报不出等号。 */
  costOf?(nodeId: string): number | null
  canGenerate: boolean
  onConfirm(nodeIds: readonly string[]): void
  onCancel(): void
  onRetry(): void
  /** 确认之后点一格 = 画布移到那张卡。 */
  onLocate?(nodeId: string): void
  formatTime(iso: string): string
}

const RUNNING: readonly NodeWorkflowStatus[] = [
  NODE_STATUS_IDS.running,
  NODE_STATUS_IDS.queued,
]

export function StudioOperatorQueueCard({
  confirm,
  nodes,
  runOf,
  costOf,
  canGenerate,
  onConfirm,
  onCancel,
  onRetry,
  onLocate,
  formatTime,
}: StudioOperatorQueueCardProps) {
  const t = useTranslations('StudioOperator')
  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set())
  const chosen = nodes.filter((node) => !dropped.has(node.id))
  const confirmed =
    confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed
  const cancelled =
    confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled
  const busy = confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting
  const decidedSwap = useBlurSwapIn(confirmed ? 'decided' : 'open')

  /** 确认之后各格的「已经跑了几秒」从确认那一刻算（刷新后照样接得上）。 */
  const startedAt = confirm.decidedAt ? Date.parse(confirm.decidedAt) : null
  const anyRunning =
    confirmed &&
    nodes.some((node) => RUNNING.includes(runOf?.(node.id)?.status ?? 'idle'))
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!anyRunning) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [anyRunning])
  const elapsedSeconds =
    startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000))

  if (cancelled) {
    return (
      <motion.p
        {...decidedSwap}
        data-testid="operator-queue-card"
        data-status={confirm.status}
        className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs"
      >
        <span className="shrink-0 text-muted-foreground">
          {t('confirm.state.cancelled', {
            time: confirm.decidedAt ? formatTime(confirm.decidedAt) : '',
          })}
        </span>
        <span className="min-w-0 truncate text-muted-foreground/70">
          · {t('confirm.batch.summary', { count: nodes.length })}
        </span>
        <button
          type="button"
          data-testid="operator-confirm-retry"
          onClick={onRetry}
          className="shrink-0 rounded-sm text-foreground/80 transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          · {t('confirm.generate.retry')}
        </button>
      </motion.p>
    )
  }

  const costs = chosen.map((node) => costOf?.(node.id) ?? null)
  const priced = costs.filter((cost): cost is number => cost !== null)
  const total = priced.reduce((sum, cost) => sum + cost, 0)
  const costLine =
    priced.length === 0
      ? null
      : t.rich(
          priced.length < costs.length
            ? 'confirm.batch.costFrom'
            : 'confirm.batch.cost',
          {
            amount: formatUnitPriceAmount(total),
            a: (chunks) => (
              <span className="font-mono tabular-nums">{chunks}</span>
            ),
          },
        )

  const toggle = (nodeId: string) =>
    setDropped((current) => {
      const next = new Set(current)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })

  return (
    <section
      data-testid="operator-queue-card"
      data-status={confirm.status}
      aria-label={t('confirm.batch.title')}
      className="overflow-hidden rounded-xl bg-card"
    >
      <p className="px-3 pb-2 pt-2.5 text-md font-semibold text-foreground">
        {t('confirm.batch.title')}
      </p>
      <ul className="flex gap-2 overflow-x-auto px-3 pb-1.5 pt-0.5">
        {(confirmed ? chosen : nodes).map((node, index) => (
          <QueueTile
            key={node.id}
            index={index}
            name={node.name}
            off={!confirmed && dropped.has(node.id)}
            confirmed={confirmed}
            run={runOf?.(node.id)}
            elapsedSeconds={elapsedSeconds}
            failedLabel={t('confirm.batch.failed', { name: node.name })}
            retryLabel={t('confirm.generate.retry')}
            disabled={busy}
            onPress={() => (confirmed ? onLocate?.(node.id) : toggle(node.id))}
          />
        ))}
      </ul>
      {confirmed ? (
        <motion.p
          {...decidedSwap}
          data-testid="operator-confirm-state"
          className="px-3 pb-3 pt-1.5 text-xs text-muted-foreground"
        >
          {confirm.auto
            ? t('confirm.state.auto', {
                time: confirm.decidedAt ? formatTime(confirm.decidedAt) : '',
              })
            : t('confirm.state.confirmed', {
                time: confirm.decidedAt ? formatTime(confirm.decidedAt) : '',
              })}
          <span className="text-muted-foreground/70">
            {' · '}
            {t('confirm.batch.summary', { count: chosen.length })}
          </span>
        </motion.p>
      ) : (
        <div className="flex items-center gap-2 px-3 pb-3 pt-1.5">
          <button
            type="button"
            data-testid="operator-confirm-primary"
            disabled={busy || chosen.length === 0 || !canGenerate}
            aria-busy={busy}
            onClick={() => onConfirm(chosen.map((node) => node.id))}
            className="flex h-8 items-center rounded-full bg-foreground px-3.5 text-sm font-medium text-background transition-[background-color,transform] duration-fast ease-standard hover:bg-foreground/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
          >
            <BlurSwap swapKey={busy ? 'busy' : 'idle'} className="gap-1.5">
              {busy ? (
                <>
                  <Spinner size="sm" className="text-background" />
                  {t('confirm.state.submitting')}
                </>
              ) : (
                t.rich('confirm.batch.confirm', {
                  count: chosen.length,
                  n: () => (
                    <RollingNumber
                      value={chosen.length}
                      className="tabular-nums"
                    />
                  ),
                })
              )}
            </BlurSwap>
          </button>
          {costLine ? (
            <span
              data-testid="operator-queue-cost"
              className="text-2xs text-muted-foreground"
            >
              {costLine}
            </span>
          ) : null}
          <button
            type="button"
            data-testid="operator-confirm-secondary"
            disabled={busy}
            onClick={onCancel}
            className="ml-auto flex h-8 items-center rounded-full px-2.5 text-sm text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
          >
            {t('confirm.generate.cancel')}
          </button>
        </div>
      )}
    </section>
  )
}

function QueueTile({
  index,
  name,
  off,
  confirmed,
  run,
  elapsedSeconds,
  failedLabel,
  retryLabel,
  disabled,
  onPress,
}: {
  index: number
  name: string
  off: boolean
  confirmed: boolean
  run: QueueRun | undefined
  elapsedSeconds: number
  failedLabel: string
  retryLabel: string
  disabled: boolean
  onPress(): void
}) {
  const reducedMotion = useReducedMotion()
  const status = run?.status ?? NODE_STATUS_IDS.idle
  const running = confirmed && RUNNING.includes(status)
  const failed = confirmed && status === NODE_STATUS_IDS.failed
  /**
   * 跑完那一下：边先合拢、停一拍、淡掉（与画布卡同一个收尾），图同时在底下由糊变清。
   * 「跑过」记在这一格自己身上 —— 刷新后本来就跑完的格子不播。
   */
  const [ranHere, setRanHere] = useState(running)
  if (running && !ranHere) setRanHere(true)
  const [closing, setClosing] = useState(false)
  const [wasRunning, setWasRunning] = useState(running)
  if (wasRunning !== running) {
    setWasRunning(running)
    if (!running && ranHere && !failed) setClosing(true)
  }
  const showEdge = running || closing || failed
  const previewUrl = running ? undefined : run?.previewUrl

  return (
    <motion.li
      initial={reducedMotion ? false : { opacity: 0, y: QUEUE_STRIP.enterY }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: DURATION.base,
        ease: EASE_STANDARD,
        delay: index * QUEUE_STRIP.enterStaggerS,
      }}
      className="w-13 shrink-0"
    >
      <button
        type="button"
        data-testid="operator-queue-tile"
        data-status={confirmed ? status : off ? 'off' : 'on'}
        aria-pressed={confirmed ? undefined : !off}
        aria-label={name}
        disabled={disabled}
        onClick={onPress}
        className="group flex w-full flex-col items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
      >
        <motion.span
          animate={{
            scale: off ? QUEUE_STRIP.offScale : 1,
            opacity: off ? QUEUE_STRIP.offOpacity : 1,
          }}
          transition={{
            duration: reducedMotion ? 0 : DURATION.fast,
            ease: EASE_STANDARD,
          }}
          className="relative block h-17 w-full overflow-hidden rounded-md bg-muted"
        >
          {previewUrl ? <QueuePreview src={previewUrl} step={index} /> : null}
          {showEdge ? (
            <StudioGeneratingProgress
              variant="edge"
              elapsedSeconds={elapsedSeconds}
              stageLabel={name}
              isCompleting={closing}
              onCompleteAnimationDone={() => setClosing(false)}
              failure={failed ? { message: failedLabel, retryLabel } : null}
              cornerRadiusVar="--radius-md"
            />
          ) : null}
        </motion.span>
        <span
          className={cn(
            'w-full truncate text-center text-2xs text-muted-foreground transition-colors duration-fast ease-standard',
            !off && 'group-hover:text-foreground',
          )}
        >
          {name}
        </span>
      </button>
    </motion.li>
  )
}

function QueuePreview({ src, step }: { src: string; step: number }) {
  const {
    imageRef: revealRef,
    onLoad: onRevealLoad,
    onError: onRevealError,
    style: revealStyle,
    className: revealClassName,
  } = useMediaReveal({ src, step })
  return (
    <NextImage
      ref={revealRef}
      src={src}
      alt=""
      fill
      sizes="52px"
      draggable={false}
      onLoad={onRevealLoad}
      onError={onRevealError}
      style={revealStyle}
      className={cn('object-cover', revealClassName)}
    />
  )
}
