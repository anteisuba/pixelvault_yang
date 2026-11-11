'use client'

/**
 * 读镜（H4b，owner 2026-11-07，mock ③④）在镜头表表头下的那一条。
 *
 * - 在读：「读镜 · 第 2 批 · 9–14 镜」+ 一小截进度 +「8 / 14」+「停下」（已填的留着）。
 * - 没读出来：「9–14 镜没读出来 · 原因」+ 下一步（⑨ 每种卡住都给下一步，⛔ 不只报错）：
 *   key 用不了 →「换一把 key」就地弹 Gemini 的 `QuickSetupDialog`（Hard Rule 8），配好接着读；
 *   片子太大 → 只说「先剪一段」（重试也一样大）；别的 →「重试这批」。都有「算了」。
 * - 镜号按**当前**行算：读的途中删了 / 合并了镜，范围跟着变；一行都不剩就说「第 N 批」。
 *
 * ⛔ 这一层不存状态：读镜跑在工作台（`useShotReading`），这里只读 `ShotTableReadingView`。
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { ASSISTANT_MEDIA_UNSUPPORTED_ERRORS } from '@/constants/assistant'
import { ASSISTANT_PROVIDER_ERROR_CODES } from '@/constants/assistant-operator'
import {
  SHOT_READ_ERROR_CODES,
  SHOT_READ_MAX_VIDEO_MB,
} from '@/constants/shot-reading'
import { getApiErrorMessage } from '@/lib/api-error-message'
import type { ShotTableRow } from '@/lib/shot-table-rows'
import { cn } from '@/lib/utils'

import type { ShotReadingFailure } from '@/features/canvas/hooks/use-shot-reading'

import { SHOT_READ_GEMINI_SETUP } from './ShotPullReadOption'
import type { ShotTableReadingView } from './shot-table-board-context'

/** 配一把新 key 能解决的那几种（key 失效 / 看不了视频 / 那一家余额不够）。 */
const KEY_ERROR_CODES: ReadonlySet<string> = new Set([
  ASSISTANT_PROVIDER_ERROR_CODES.authFailed,
  ASSISTANT_PROVIDER_ERROR_CODES.insufficientBalance,
  ASSISTANT_MEDIA_UNSUPPORTED_ERRORS.video.code,
])

/** 这一批在当前表里的镜号范围：「9–14」/「9」；一行都不剩 = `null`。 */
export function shotReadRange(
  rows: readonly ShotTableRow[],
  batchIds: readonly string[],
): string | null {
  const ids = new Set(batchIds)
  const numbers = rows
    .filter((row) => ids.has(row.nodeId))
    .map((row) => row.shotNo)
  if (numbers.length === 0) return null
  const low = Math.min(...numbers)
  const high = Math.max(...numbers)
  return low === high ? String(low) : `${low}–${high}`
}

export function ShotTableReadBar({
  reading,
  rows,
}: {
  readonly reading: ShotTableReadingView
  readonly rows: readonly ShotTableRow[]
}) {
  const t = useTranslations('StudioNode.shotTable.reading')
  const tErrors = useTranslations('Errors')
  const [setupOpen, setSetupOpen] = useState(false)
  const { state } = reading
  if (state.status === 'idle') return null

  const range = shotReadRange(rows, state.batchIds)
  const index = state.batchIndex + 1

  if (state.status === 'reading') {
    const percent =
      state.totalShots > 0
        ? Math.round((state.doneShots / state.totalShots) * 100)
        : 0
    return (
      <div
        data-testid="shot-table-read-bar"
        data-status="reading"
        role="status"
        className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-surface-fill px-3.5 text-2sm"
      >
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-highlight"
        />
        <span className="font-semibold">{t('label')}</span>
        <span className="text-muted-foreground">
          {range ? t('batch', { index, range }) : t('batchOnly', { index })}
        </span>
        <span
          role="progressbar"
          aria-label={t('progress')}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-surface-fill-track"
        >
          <span
            className="block h-full rounded-full bg-highlight transition-[width] duration-slow ease-standard motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </span>
        <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
          {state.doneShots} / {state.totalShots}
        </span>
        <span aria-hidden className="min-w-0 flex-1" />
        <BarButton testId="shot-table-read-stop" onClick={reading.stop}>
          {t('stop')}
        </BarButton>
      </div>
    )
  }

  const failure = state.failure
  const keyError = isKeyError(failure)
  const tooLarge = failure.errorCode === SHOT_READ_ERROR_CODES.videoTooLarge
  return (
    <div
      data-testid="shot-table-read-bar"
      data-status="failed"
      role="alert"
      className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-status-risk-surface px-3.5 py-1.5 text-2sm"
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full bg-status-risk"
      />
      <span className="font-semibold">
        {range ? t('failed', { range }) : t('failedBatch', { index })}
      </span>
      <span className="min-w-0 text-muted-foreground">
        · {failureReason(failure, t, tErrors)}
      </span>
      <span aria-hidden className="min-w-0 flex-1" />
      {keyError && SHOT_READ_GEMINI_SETUP ? (
        <BarButton
          testId="shot-table-read-rekey"
          onClick={() => setSetupOpen(true)}
        >
          {t('rekey')}
        </BarButton>
      ) : !tooLarge ? (
        <BarButton
          testId="shot-table-read-retry"
          onClick={() => reading.retry()}
        >
          {t('retry')}
        </BarButton>
      ) : null}
      <BarButton testId="shot-table-read-dismiss" onClick={reading.stop} quiet>
        {t('dismiss')}
      </BarButton>
      {setupOpen && SHOT_READ_GEMINI_SETUP ? (
        <QuickSetupDialog
          open
          onOpenChange={(next) => {
            if (!next) setSetupOpen(false)
          }}
          modelId={SHOT_READ_GEMINI_SETUP.modelId}
          modelLabel={SHOT_READ_GEMINI_SETUP.label}
          adapterType={SHOT_READ_GEMINI_SETUP.adapterType}
          optionId={`shot-read:rekey:${SHOT_READ_GEMINI_SETUP.modelId}`}
          selectStudioModel={false}
          onVerified={(_modelId, keyId) => reading.retry(keyId)}
        />
      ) : null}
    </div>
  )
}

function isKeyError(failure: ShotReadingFailure): boolean {
  return failure.errorCode ? KEY_ERROR_CODES.has(failure.errorCode) : false
}

function failureReason(
  failure: ShotReadingFailure,
  t: ReturnType<typeof useTranslations<'StudioNode.shotTable.reading'>>,
  tErrors: ReturnType<typeof useTranslations<'Errors'>>,
): string {
  switch (failure.errorCode) {
    case SHOT_READ_ERROR_CODES.videoTooLarge:
      return t('reasons.tooLarge', { mb: SHOT_READ_MAX_VIDEO_MB })
    case ASSISTANT_PROVIDER_ERROR_CODES.authFailed:
      return t('reasons.key')
    case ASSISTANT_MEDIA_UNSUPPORTED_ERRORS.video.code:
      return t('reasons.notVideo')
    default:
      return getApiErrorMessage(tErrors, failure, t('reasons.fallback'))
  }
}

function BarButton({
  testId,
  onClick,
  quiet = false,
  children,
}: {
  readonly testId: string
  onClick(): void
  /** 「算了」：不加框，退一步。 */
  readonly quiet?: boolean
  readonly children: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'nodrag inline-flex h-6 shrink-0 items-center rounded-md px-2 font-semibold transition-colors duration-fast',
        quiet
          ? 'text-muted-foreground hover:tint-hover hover:text-foreground'
          : 'border border-border bg-card text-foreground hover:tint-hover',
      )}
    >
      {children}
    </button>
  )
}
