'use client'

/**
 * 右侧 240 属性栏（画板 `EditDesk.dc.html` 右列）。
 *
 * 选中一段时它就是这一段的全貌：**来源节点 · 入点 / 出点 · 速度 · 原声 · 转场 →
 * · 回节点重生成这段**。没选中时是一句话 —— ⛔ 不摆一堆灰掉的控件。
 *
 * ⚠ 「回节点重生成这段」**不在剪辑台开生成入口**（spec §6）：它关掉全屏模式、
 * 回画布并选中来源卡，改画面的事在那张卡上做。
 */

import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  EDIT_CLIP_SPEEDS,
  EDIT_DESK_LAYOUT,
  EDIT_TRANSITIONS,
  EDIT_TRANSITION_IDS,
} from '@/constants/edit-desk'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { currentUrlOf, formatEditClock } from '@/lib/edit-project'
import { readOutputIndex, readOutputVersions } from '@/lib/node-output-versions'
import { cn } from '@/lib/utils'
import type { EditTimelineRow } from '@/lib/edit-project'

import { useVideoPoster } from '@/hooks/node/use-video-poster'
import type { EditDesk } from '@/hooks/node/use-edit-desk'

import { AudioWaveform } from '../nodes/v4/audio/AudioWaveform'

export interface EditDeskInspectorProps {
  readonly desk: EditDesk
  /** 「回节点重生成这段」：关模式 + 选中来源卡。 */
  onBackToNode(nodeId: string): void
}

export function EditDeskInspector({
  desk,
  onBackToNode,
}: EditDeskInspectorProps) {
  const t = useTranslations('StudioNode.editDesk.inspector')
  const row = desk.selectedRow
  const clip = desk.selectedClip
  const selection = desk.selection

  return (
    <div
      data-testid="edit-desk-inspector"
      style={{ width: EDIT_DESK_LAYOUT.inspectorWidthPx }}
      className="flex shrink-0 flex-col gap-2.5 overflow-y-auto rounded-xl border border-border bg-card p-3.5"
    >
      {!row || !clip || !selection ? (
        <p className="text-2xs text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          <span className="text-3xs uppercase text-muted-foreground">
            {t('selected', { name: sourceName(row) })}
          </span>

          <div className="flex items-center gap-2">
            <SourceThumb row={row} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-xs text-foreground">
                {t('source', { name: sourceName(row) })}
              </span>
              <span className="truncate text-3xs text-muted-foreground">
                {row.source.exists ? sourceMeta(row, t) : t('sourceGone')}
              </span>
            </div>
          </div>

          <span className="h-px bg-border" />

          <Row label={t('inPoint')} value={formatEditClock(clip.in, true)} />
          <Row label={t('outPoint')} value={formatEditClock(clip.out, true)} />

          <div className="flex items-center justify-between text-xs">
            <span>{t('speed')}</span>
            <Segmented
              testId="edit-desk-speed"
              options={EDIT_CLIP_SPEEDS.map((speed) => ({
                id: String(speed),
                label: t('speedOption', { speed }),
                active: (clip.speed || 1) === speed,
                onSelect: () =>
                  desk.updateClip(selection.track, clip.id, { speed }),
              }))}
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span>{t('sound')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={!clip.muted}
              data-testid="edit-desk-muted"
              onClick={() =>
                desk.updateClip(selection.track, clip.id, {
                  muted: !clip.muted,
                })
              }
              className={cn(
                'relative h-5 w-[34px] rounded-full transition-colors duration-fast motion-reduce:transition-none',
                clip.muted ? 'bg-surface-fill-track' : 'bg-primary',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-4 rounded-full bg-background transition-[left] duration-fast motion-reduce:transition-none',
                  clip.muted ? 'left-0.5' : 'left-[16px]',
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span>{t('transition')}</span>
            <Segmented
              testId="edit-desk-transition"
              options={EDIT_TRANSITIONS.map((transition) => ({
                id: transition,
                label: t(`transitions.${transition}`),
                active:
                  (clip.transitionOut ?? EDIT_TRANSITION_IDS.none) ===
                  transition,
                onSelect: () =>
                  desk.updateClip(selection.track, clip.id, {
                    transitionOut: transition,
                  }),
              }))}
            />
          </div>

          <span className="h-px bg-border" />

          <button
            type="button"
            data-testid="edit-desk-back-to-node"
            disabled={!row.source.exists}
            onClick={() => onBackToNode(clip.sourceNodeId)}
            className="inline-flex h-8 items-center gap-2 rounded-md bg-muted px-2.5 text-xs text-foreground transition-colors duration-fast hover:bg-accent disabled:opacity-50"
          >
            <Sparkles className="size-4 shrink-0" aria-hidden />
            <span>{t('backToNode')}</span>
          </button>
        </>
      )}
    </div>
  )
}

/**
 * 来源缩略（画板 `.ptile` 56×36）。
 *
 * ⚠ S8 那一版是**一块空灰块** —— 右栏于是回答不了「我选中的到底是哪一段」，
 * 而这正是右栏存在的理由（owner 真机 2026-09-10）。视频给封面帧，音频给波形，
 * 都抓不到才退回空块。
 */
function SourceThumb({ row }: { readonly row: EditTimelineRow }) {
  const node = row.source.node
  const data = node?.data
  const isAudio = data?.kind === NODE_MEDIA_KIND_IDS.audio
  const url = node ? currentUrlOf(node) : undefined
  const poster = useVideoPoster(
    isAudio ? undefined : url,
    data && data.kind === NODE_MEDIA_KIND_IDS.video
      ? data.videoThumbnailUrl
      : undefined,
  )

  return (
    <div
      data-testid="edit-desk-source-thumb"
      style={{
        width: EDIT_DESK_LAYOUT.sourceThumbWidthPx,
        height: EDIT_DESK_LAYOUT.sourceThumbHeightPx,
      }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
    >
      {isAudio ? (
        <AudioWaveform
          seed={url ?? row.clip.sourceNodeId}
          barCount={EDIT_DESK_SOURCE_THUMB_WAVE_BARS}
          height={EDIT_DESK_LAYOUT.waveHeightPx - 6}
        />
      ) : poster ? (
        // eslint-disable-next-line @next/next/no-img-element -- R2 缩略 / data URL，⛔ 不进 next/image 优化管线
        <img src={poster} alt="" className="size-full object-cover" />
      ) : null}
    </div>
  )
}

/** 56px 宽的缩略里放几根柱（`waveBarPitchPx` 除得下的根数）。 */
const EDIT_DESK_SOURCE_THUMB_WAVE_BARS = Math.floor(
  (EDIT_DESK_LAYOUT.sourceThumbWidthPx - 8) / EDIT_DESK_LAYOUT.waveBarPitchPx,
)

function Row({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span>{label}</span>
      <span className="tabular-nums text-muted-foreground">{value}</span>
    </div>
  )
}

/** 分段控件（画板 `.seg`）。⚠ 三处共用一颗，⛔ 不各写一份。 */
function Segmented({
  testId,
  options,
}: {
  readonly testId: string
  readonly options: readonly {
    readonly id: string
    readonly label: string
    readonly active: boolean
    onSelect(): void
  }[]
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-lg bg-surface-fill p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          data-testid={`${testId}-${option.id}`}
          aria-pressed={option.active}
          onClick={option.onSelect}
          className={cn(
            'rounded-md px-2.5 py-1 text-2xs font-medium transition-colors duration-fast',
            option.active
              ? 'bg-background font-semibold text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * 来源那一行的第二句（画板 `EditDesk.dc.html` 右栏「Seedance 2.0 · 版本 2/3」）。
 *
 * 卡上没记模型（上传进来的、或从素材库直接落进来的）时只报版本；两样都没有就
 * 退回一句「来自画布」—— ⛔ 不留空行。
 */
function sourceMeta(
  row: EditTimelineRow,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const data = row.source.node?.data
  if (!data) return t('sourceLive')
  const model = 'model' in data ? data.model?.modelId : undefined
  const versions = readOutputVersions(data)
  const parts: string[] = []
  if (model) parts.push(model)
  if (versions.length > 0) {
    parts.push(
      t('sourceVersion', {
        index: readOutputIndex(data) + 1,
        total: versions.length,
      }),
    )
  }
  return parts.length > 0 ? parts.join(' · ') : t('sourceLive')
}

function sourceName(row: EditTimelineRow): string {
  const data = row.source.node?.data
  if (!data) return row.clip.sourceNodeId
  if (data.kind === NODE_MEDIA_KIND_IDS.video) return data.label ?? data.name
  return data.name
}
