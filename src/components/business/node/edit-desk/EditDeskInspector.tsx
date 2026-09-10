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

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  EDIT_CLIP_SPEEDS,
  EDIT_DESK_LAYOUT,
  EDIT_TEXT_ANCHORS,
  EDIT_TEXT_ANCHOR_CELL,
  EDIT_TEXT_FADES,
  EDIT_TEXT_MAX_LENGTH,
  EDIT_TEXT_SIZES,
  EDIT_TEXT_TONES,
  EDIT_TRANSITIONS,
  EDIT_TRANSITION_IDS,
} from '@/constants/edit-desk'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { currentUrlOf, formatEditClock } from '@/lib/edit-project'
import { readOutputIndex, readOutputVersions } from '@/lib/node-output-versions'
import { cn } from '@/lib/utils'
import type { EditTimelineRow } from '@/lib/edit-project'
import type { EditTextClip } from '@/types/node-workflow'

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
  const textClip = desk.selectedTextClip
  const row = desk.selectedRow
  const clip = desk.selectedClip
  const selection = desk.selection

  return (
    <div
      data-testid="edit-desk-inspector"
      style={{ width: EDIT_DESK_LAYOUT.inspectorWidthPx }}
      className="flex shrink-0 flex-col gap-2.5 overflow-y-auto rounded-xl border border-border bg-card p-3.5"
    >
      {textClip ? (
        // ⚠ `key` = 段 id：换一段就重挂，内容草稿跟着归零 —— ⛔ 不用 ref 在渲染期
        // 比对上一段（那正是 `react-hooks/refs` 拦的那条）。
        <TextClipFields key={textClip.id} clip={textClip} desk={desk} />
      ) : !row || !clip || !selection ? (
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

/**
 * 分段控件（画板 `.seg`）。⚠ 右栏三处 + 左栏两张筛共用这一颗，⛔ 不各写一份。
 */
export function Segmented({
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

/**
 * 选中一段字幕时右栏的样子（S8d · 画板 `EditDeskText.dc.html` 右卡）：
 * **内容 / 位置九宫 / 字号 / 颜色 / 入出点 / 淡入淡出**。
 *
 * ⚠ 内容框是**受控 textarea 直落**：每敲一个字发一条 op 会把撤销栈冲成一字一步，
 * 所以本地存草稿，`blur` 才落 —— 与顶栏改成片名同一条手法。
 * ⚠ 入出点是**读数**不是输入框（画板上那两颗是 `.kbd`）：改时间用轨道上的手柄，
 * ⛔ 不给两个能互相打架的入口。
 */
function TextClipFields({
  clip,
  desk,
}: {
  readonly clip: EditTextClip
  readonly desk: EditDesk
}) {
  const t = useTranslations('StudioNode.editDesk.text')
  const [draft, setDraft] = useState(clip.text)

  const commit = () => {
    const next = draft.trim()
    if (!next || next === clip.text) {
      setDraft(clip.text)
      return
    }
    desk.updateTextClip(clip.id, { text: next })
  }

  return (
    <>
      <span className="text-3xs uppercase text-muted-foreground">
        {t('title')}
      </span>

      <label className="flex flex-col gap-1.5">
        <span className="text-3xs text-muted-foreground">{t('content')}</span>
        <textarea
          data-testid="edit-desk-text-content"
          value={draft}
          rows={2}
          maxLength={EDIT_TEXT_MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setDraft(clip.text)
            event.stopPropagation()
          }}
          className="min-h-11 resize-none rounded-lg border border-input bg-background px-2.5 py-2 text-xs text-foreground outline-none"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-3xs text-muted-foreground">{t('anchor')}</span>
        <div
          role="radiogroup"
          aria-label={t('anchor')}
          style={{ gap: EDIT_TEXT_ANCHOR_CELL.gapPx }}
          className="grid w-fit grid-cols-3"
        >
          {EDIT_TEXT_ANCHORS.map((anchor) => (
            <button
              key={anchor}
              type="button"
              role="radio"
              aria-checked={clip.anchor === anchor}
              aria-label={t(`anchors.${anchor}`)}
              data-testid={`edit-desk-text-anchor-${anchor}`}
              onClick={() => desk.updateTextClip(clip.id, { anchor })}
              style={{
                width: EDIT_TEXT_ANCHOR_CELL.widthPx,
                height: EDIT_TEXT_ANCHOR_CELL.heightPx,
                borderRadius: EDIT_TEXT_ANCHOR_CELL.radiusPx,
              }}
              className={cn(
                'transition-colors duration-fast',
                clip.anchor === anchor ? 'bg-primary' : 'bg-surface-fill',
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span>{t('size')}</span>
        <Segmented
          testId="edit-desk-text-size"
          options={EDIT_TEXT_SIZES.map((size) => ({
            id: size,
            label: t(`sizes.${size}`),
            active: clip.size === size,
            onSelect: () => desk.updateTextClip(clip.id, { size }),
          }))}
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span>{t('tone')}</span>
        <Segmented
          testId="edit-desk-text-tone"
          options={EDIT_TEXT_TONES.map((tone) => ({
            id: tone,
            label: t(`tones.${tone}`),
            active: clip.tone === tone,
            onSelect: () => desk.updateTextClip(clip.id, { tone }),
          }))}
        />
      </div>

      <Row label={t('inPoint')} value={formatEditClock(clip.startSec, true)} />
      <Row
        label={t('outPoint')}
        value={formatEditClock(clip.startSec + clip.durationSec, true)}
      />

      <div className="flex items-center justify-between text-xs">
        <span>{t('fade')}</span>
        <Segmented
          testId="edit-desk-text-fade"
          options={EDIT_TEXT_FADES.map((fadeSec) => ({
            id: String(fadeSec),
            label: fadeSec === 0 ? t('fadeNone') : t('fadeSeconds', { fadeSec }),
            active: clip.fadeSec === fadeSec,
            onSelect: () => desk.updateTextClip(clip.id, { fadeSec }),
          }))}
        />
      </div>

    </>
  )
}
