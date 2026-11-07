'use client'

/**
 * 拉片纸（H4a，owner 2026-11-07，mock ④⑤⑨）：一段参考片 → 在用户自己的浏览器里切镜 → 落进镜头表。
 *
 * - 切镜在后台线程跑 TransNetV2（`useShotDetect`），⛔ 不走服务器、不扣点（画布禁改 7 只认 `generate`）。
 * - 模型一次出每一帧的切点把握，「粗细」只是换门槛：拨一下当场换算刻度和镜数，⛔ 不重跑。
 * - 落表 = 一批 op 交给宿主（`onLand`）：宿主算落点、一次 `dispatchBatch` = 一步撤销。
 * - 每种卡住都给下一步（⑨），⛔ 不只报错。
 * - H4b：「顺便读每一镜」勾着时，落表把读镜选择一起交给宿主（`ShotPullReadOption`）；
 *   读由工作台跑，纸关了照读。
 *
 * 纸由工作台挂（在画布外）：表卡被滚出视口也不会把正在切的线程一起卸掉。`key` 换一次 = 一次
 * 新的拉片，状态全从头来。
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { Check } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import {
  SHOT_DETECT_DEFAULT_GRAIN,
  SHOT_DETECT_GRAINS,
  type ShotDetectGrain,
} from '@/constants/shot-detect'
import {
  useShotDetect,
  type ShotDetectState,
} from '@/features/canvas/hooks/use-shot-detect'
import { SHOT_DETECT_TOTAL_BYTES } from '@/lib/shot-detect/assets'
import {
  countShotsByGrain,
  rangesForGrain,
  type ShotDetectRange,
} from '@/lib/shot-detect/scenes'
import {
  formatPullClock,
  formatPullSpan,
  pullFilmstripFrames,
} from '@/lib/shot-pull-frames'
import { isPullSourceNode } from '@/lib/shot-pull-plan'
import type { NodeV4 } from '@/types/node-workflow'

import { VideoTrimFilmstrip } from '../nodes/v4/video/VideoTrimFilmstrip'
import {
  resolveShotPullRead,
  SHOT_PULL_READ_DRAFT,
  ShotPullReadOption,
  useShotPullReadKey,
  type ShotPullReadChoice,
  type ShotPullReadDraft,
} from './ShotPullReadOption'

/** 一次拉片：拉哪张片段卡；`nonce` 换一次就是重新开一张纸。 */
export interface ShotPullRequest {
  readonly clipId: string
  readonly nonce: number
}

/** 纸上那条胶片取几帧 —— 帧数就是边缘截帧的请求数。 */
const FILMSTRIP_FRAMES = 12
/** 段多到标签挤在一起就不写段标签，只留刻度。 */
const SEGMENT_LABEL_MAX = 10
/** 落表那一排里 H4a 只做「追加」，另两个灰着（owner 2026-11-07）。 */
const LAND_MODES = ['append', 'reorder', 'fill'] as const
type LandMode = (typeof LAND_MODES)[number]

function megabytes(bytes: number): number {
  return Math.round(bytes / 1_000_000)
}

export function ShotPullPaper({
  request,
  nodes,
  onClose,
  onLand,
  onTrim,
}: {
  readonly request: ShotPullRequest | null
  readonly nodes: readonly NodeV4[]
  onClose(): void
  /** `read` = 落表之后接着读镜（没勾 = `null`）。 */
  onLand(
    clipId: string,
    ranges: readonly ShotDetectRange[],
    read: ShotPullReadChoice | null,
  ): void
  /** 「去剪」：片子太长时回到那张片段卡（裁剪在卡上）。 */
  onTrim(clipId: string): void
}) {
  const clip = request
    ? nodes.find((node) => node.id === request.clipId)
    : undefined
  const source =
    clip &&
    isPullSourceNode(clip) &&
    clip.data.kind === 'video' &&
    clip.data.url
      ? {
          id: clip.id,
          name: clip.data.name,
          url: clip.data.url,
          durationSec: clip.data.durationSec,
        }
      : null
  const open = request !== null && source !== null

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <ResponsiveDialogContent
        data-testid="shot-pull-paper"
        className="sm:max-w-2xl"
        preventOutsideDismiss
      >
        {open && source ? (
          <PullBody
            key={request.nonce}
            source={source}
            onClose={onClose}
            onLand={(ranges, read) => onLand(source.id, ranges, read)}
            onTrim={() => onTrim(source.id)}
          />
        ) : null}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

function PullBody({
  source,
  onClose,
  onLand,
  onTrim,
}: {
  readonly source: {
    readonly id: string
    readonly name: string
    readonly url: string
    readonly durationSec?: number
  }
  onClose(): void
  onLand(
    ranges: readonly ShotDetectRange[],
    read: ShotPullReadChoice | null,
  ): void
  onTrim(): void
}) {
  const t = useTranslations('StudioNode.shotTable.pull')
  const detect = useShotDetect()
  const { prepare } = detect
  const state = detect.state
  const [grain, setGrain] = useState<ShotDetectGrain>(SHOT_DETECT_DEFAULT_GRAIN)
  const [readDraft, setReadDraft] =
    useState<ShotPullReadDraft>(SHOT_PULL_READ_DRAFT)
  const readKey = useShotPullReadKey(readDraft)
  const read = resolveShotPullRead(readDraft, readKey)

  // 纸一打开就开始（模型下过直接切；没下过停在「要下载」那一步）。卸载 = 线程收掉。
  useEffect(() => {
    void prepare(source.url)
  }, [prepare, source.url])

  const probed =
    state.status === 'running' || state.status === 'done'
      ? state.durationSec
      : state.status === 'error'
        ? state.durationSec
        : undefined
  // 卡上记着的时长优先：胶片的帧地址不随探片结果抖一下（换地址 = 重新截帧）。
  const durationSec = source.durationSec || probed || 0

  const done = state.status === 'done' ? state : null
  const counts = useMemo(
    () => (done ? countShotsByGrain(done.predictions) : null),
    [done],
  )
  const ranges = useMemo(
    () =>
      done
        ? rangesForGrain(
            done.predictions,
            done.timestamps,
            done.durationSec,
            grain,
          )
        : [],
    [done, grain],
  )
  const frames = useMemo(
    () =>
      durationSec > 0
        ? pullFilmstripFrames(source.url, durationSec, FILMSTRIP_FRAMES)
        : [],
    [source.url, durationSec],
  )
  const framesAvailable = frames.some(Boolean)

  const processed =
    state.status === 'running'
      ? state.phase === 'analyze' && state.durationSec > 0
        ? Math.min(1, state.processedSec / state.durationSec)
        : 0
      : null

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ResponsiveDialogHeader className="gap-1 p-0 text-left">
        <ResponsiveDialogTitle className="text-base">
          {t('title', {
            name: source.name,
            duration: durationSec > 0 ? formatPullClock(durationSec) : '',
          })}
          {done ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {t('cutCount', { count: ranges.length })}
            </span>
          ) : null}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription className="sr-only">
          {t('footRunning')}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      <PullFilmstrip
        frames={framesAvailable ? frames : []}
        durationSec={done?.durationSec ?? durationSec}
        ranges={ranges}
        processed={processed}
      />

      {state.status === 'error' ? (
        <PullError
          state={state}
          onRetry={() => detect.start(source.url)}
          onTrim={onTrim}
          onClose={onClose}
        />
      ) : state.status === 'needsDownload' ? (
        <PullNotice
          testId="shot-pull-first-time"
          title={t('firstTime.title', { mb: megabytes(state.totalBytes) })}
          body={t('firstTime.body')}
        >
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            size="sm"
            data-testid="shot-pull-download"
            onClick={() => detect.start(source.url)}
          >
            {t('firstTime.start')}
          </Button>
        </PullNotice>
      ) : (
        <>
          <PullProgress state={state} durationSec={durationSec} />
          <PullOptions
            done={done !== null}
            grain={grain}
            counts={counts}
            onGrain={setGrain}
            read={
              <ShotPullReadOption
                shotCount={ranges.length}
                draft={readDraft}
                keyId={readKey}
                onChange={setReadDraft}
              />
            }
          />
          {done && counts && ranges.length <= 1 ? (
            <PullNotice
              testId="shot-pull-no-cut"
              title={t('errors.noCut.title')}
              body={t('errors.noCut.body')}
            >
              {grain !== 'fine' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setGrain('fine')}
                >
                  {t('errors.noCut.fine')}
                </Button>
              ) : null}
              <Button size="sm" onClick={() => onLand(ranges, read)}>
                {t('errors.noCut.asOne')}
              </Button>
            </PullNotice>
          ) : null}
          {done && !framesAvailable ? (
            <PullNotice
              testId="shot-pull-no-frames"
              title={t('errors.noFrames.title')}
              body={t('errors.noFrames.body')}
            />
          ) : null}
          <ResponsiveDialogFooter className="flex-row items-center justify-between gap-3 p-0 sm:justify-between">
            <p className="min-w-0 text-xs text-muted-foreground">
              {done ? (read ? t('footRead') : t('footDone')) : t('footRunning')}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>
                {t('cancel')}
              </Button>
              <Button
                size="sm"
                data-testid="shot-pull-land"
                disabled={!done || ranges.length === 0}
                onClick={() => onLand(ranges, read)}
              >
                {done
                  ? t(read ? 'landCountRead' : 'landCount', {
                      count: ranges.length,
                    })
                  : t('landButton')}
              </Button>
            </div>
          </ResponsiveDialogFooter>
        </>
      )}
    </div>
  )
}

/** 胶片 + 切完的刻度与段标签；切的过程中，还没切到的那一截压淡。 */
function PullFilmstrip({
  frames,
  durationSec,
  ranges,
  processed,
}: {
  readonly frames: readonly (string | null)[]
  readonly durationSec: number
  readonly ranges: readonly ShotDetectRange[]
  /** 0–1 = 切到哪儿了；`null` = 不在切。 */
  readonly processed: number | null
}) {
  const t = useTranslations('StudioNode.shotTable.pull')
  const at = (sec: number) =>
    durationSec > 0 ? `${Math.min(100, (sec / durationSec) * 100)}%` : '0%'
  return (
    <div data-testid="shot-pull-filmstrip">
      <div className="relative h-16 overflow-hidden rounded-lg bg-surface-fill">
        {frames.length > 0 ? (
          <VideoTrimFilmstrip frames={frames} tone="selected" />
        ) : null}
        {processed !== null ? (
          <span
            aria-hidden
            className="absolute inset-y-0 right-0 bg-background/70 transition-[width] duration-base ease-standard"
            style={{ width: `${(1 - processed) * 100}%` }}
          />
        ) : null}
        {ranges.slice(1).map((range) => (
          <span
            key={range.startSec}
            data-testid="shot-pull-cut"
            aria-hidden
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-highlight"
            style={{ left: at(range.startSec) }}
          />
        ))}
      </div>
      {ranges.length > 1 && ranges.length <= SEGMENT_LABEL_MAX ? (
        <div className="relative mt-1 h-4" aria-hidden>
          {ranges.map((range, index) => (
            <span
              key={range.startSec}
              className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-2xs tabular-nums text-muted-foreground"
              style={{ left: at((range.startSec + range.endSec) / 2) }}
            >
              {t('segment', {
                index: index + 1,
                seconds: formatPullSpan(range.startSec, range.endSec),
              })}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** 下模型 / 读片子 / 切镜的进度两行 + 一根条（「正在进行」用 highlight，ui-spec §3.1）。 */
function PullProgress({
  state,
  durationSec,
}: {
  readonly state: ShotDetectState
  readonly durationSec: number
}) {
  const t = useTranslations('StudioNode.shotTable.pull')
  if (state.status !== 'running' && state.status !== 'checking') return null
  const running = state.status === 'running' ? state : null
  const showDownload =
    running?.downloaded &&
    (running.phase === 'download' || running.phase === 'analyze')
  const fraction = running
    ? running.phase === 'download'
      ? running.loadedBytes / Math.max(1, running.totalBytes)
      : running.phase === 'analyze'
        ? running.processedSec / Math.max(0.001, running.durationSec)
        : 0
    : 0
  return (
    <div data-testid="shot-pull-progress" className="flex flex-col gap-1.5">
      {showDownload && running ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {t('download', {
              loaded: megabytes(running.loadedBytes),
              total: megabytes(running.totalBytes),
            })}
          </span>
          {running.phase === 'analyze' ? (
            <Check className="size-3.5 text-status-applied" aria-hidden />
          ) : null}
          <span>{t('downloadOnce')}</span>
        </p>
      ) : null}
      <p className="text-sm tabular-nums">
        {running?.phase === 'analyze'
          ? t('analyzing', {
              done: formatPullClock(running.processedSec),
              total: formatPullClock(running.durationSec || durationSec),
            })
          : running?.phase === 'download'
            ? null
            : t('reading')}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
        className="h-1 overflow-hidden rounded-full bg-surface-fill-track"
      >
        <div
          className="h-full rounded-full bg-highlight transition-[width] duration-base ease-standard"
          style={{ width: `${Math.min(1, fraction) * 100}%` }}
        />
      </div>
    </div>
  )
}

/** 切镜粗细（切完才能拨）+ 落到表里 + 读镜（H4b）。 */
function PullOptions({
  done,
  grain,
  counts,
  onGrain,
  read,
}: {
  readonly done: boolean
  readonly grain: ShotDetectGrain
  readonly counts: Record<ShotDetectGrain, number> | null
  onGrain(grain: ShotDetectGrain): void
  /** 「顺便读每一镜」那一格（切完才出）。 */
  readonly read: ReactNode
}) {
  const t = useTranslations('StudioNode.shotTable.pull')
  return (
    <div className="flex flex-col gap-3">
      <OptionRow label={t('grain.label')}>
        <LiquidSegmented
          size="row"
          semantics="radio"
          ariaLabel={t('grain.label')}
          disabled={!done}
          value={grain}
          onChange={onGrain}
          items={SHOT_DETECT_GRAINS.map((value) => ({
            value,
            label: t(`grain.${value}`),
          }))}
        />
        <span
          data-testid="shot-pull-counts"
          className="text-xs tabular-nums text-muted-foreground"
        >
          {counts ? t('grain.counts', counts) : t('grain.later')}
        </span>
      </OptionRow>
      {done ? (
        <>
          <OptionRow label={t('land.label')}>
            <LiquidSegmented
              size="row"
              semantics="radio"
              ariaLabel={t('land.label')}
              value={'append' satisfies LandMode}
              onChange={() => undefined}
              disabledValues={['reorder', 'fill']}
              items={LAND_MODES.map((value) => ({
                value,
                label: t(`land.${value}`),
              }))}
            />
          </OptionRow>
          {read}
        </>
      ) : null}
    </div>
  )
}

function OptionRow({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="w-20 shrink-0 text-sm font-medium">{label}</span>
      {children}
    </div>
  )
}

/** 卡住时的一张小卡：一句标题、一句原因、下一步的键。 */
function PullNotice({
  testId,
  title,
  body,
  children,
}: {
  readonly testId: string
  readonly title: string
  readonly body: string
  readonly children?: ReactNode
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-2 rounded-xl bg-surface-fill px-4 py-3.5"
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      {children ? (
        <div className="mt-1 flex items-center justify-end gap-2">
          {children}
        </div>
      ) : null}
    </div>
  )
}

function PullError({
  state,
  onRetry,
  onTrim,
  onClose,
}: {
  readonly state: Extract<ShotDetectState, { status: 'error' }>
  onRetry(): void
  onTrim(): void
  onClose(): void
}) {
  const t = useTranslations('StudioNode.shotTable.pull')
  const cancel = (
    <Button variant="secondary" size="sm" onClick={onClose}>
      {t('cancel')}
    </Button>
  )
  const retry = (
    <Button size="sm" data-testid="shot-pull-retry" onClick={onRetry}>
      {t('retry')}
    </Button>
  )
  switch (state.code) {
    case 'tooLong':
      return (
        <PullNotice
          testId="shot-pull-error-tooLong"
          title={t('errors.tooLong.title', {
            duration: formatPullClock(state.durationSec ?? 0),
          })}
          body={t('errors.tooLong.body')}
        >
          {cancel}
          <Button size="sm" onClick={onTrim}>
            {t('errors.tooLong.action')}
          </Button>
        </PullNotice>
      )
    case 'network':
      return state.loadedBytes !== undefined ? (
        <PullNotice
          testId="shot-pull-error-network"
          title={t('errors.network.title')}
          body={t('errors.network.body', {
            loaded: megabytes(state.loadedBytes),
            total: megabytes(SHOT_DETECT_TOTAL_BYTES),
          })}
        >
          {cancel}
          {retry}
        </PullNotice>
      ) : (
        <PullNotice
          testId="shot-pull-error-videoNetwork"
          title={t('errors.videoNetwork.title')}
          body={t('errors.videoNetwork.body')}
        >
          {cancel}
          {retry}
        </PullNotice>
      )
    case 'noVideoTrack':
    case 'cannotDecode':
      return (
        <PullNotice
          testId={`shot-pull-error-${state.code}`}
          title={t(`errors.${state.code}.title`)}
          body={t(`errors.${state.code}.body`)}
        >
          {cancel}
        </PullNotice>
      )
    case 'failed':
      return (
        <PullNotice
          testId="shot-pull-error-failed"
          title={t('errors.failed.title')}
          body={t('errors.failed.body')}
        >
          {cancel}
          {retry}
        </PullNotice>
      )
  }
}
