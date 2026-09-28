'use client'

/**
 * 选中段的属性 —— **预览下面那一行**（④ 方向 A「舞台」，owner 2026-09-28；画板
 * 「剪辑台 · ④ A 关键切片」）。⛔ 不再有右侧属性栏：看 Claude 剪的时候舞台要最大，
 * 一段的属性一行看完。
 *
 * 三种段各一行：
 * - 视频段：来源名 · 入点 · 出点 · 速度 · 原声 · 转场 · 回节点；
 * - 配音 / 配乐段：来源名 · 入点 · 出点 · 音量 · 回节点；
 * - 字幕段：字（点它 = 到预览里原地改）· 入点 · 出点 · 位置 / 字号 / 颜色 / 淡入淡出
 *   四颗小按钮，各开一个小弹层，一次只开一个。
 * 没选中时是一句话 —— ⛔ 不摆一排灰掉的控件。
 *
 * ⚠ 「回节点」**不在剪辑台开生成入口**（spec §6）：它关掉全屏模式、回画布并选中
 * 来源卡，改画面的事在那张卡上做。
 * ⚠ 入出点是**读数**不是输入框：改时间用轨道上的手柄，⛔ 不给两个能互相打架的入口。
 */

import { useState, type ReactNode } from 'react'
import { ChevronDown, Sparkles } from '@/components/icons'
import { useTranslations } from 'next-intl'

import {
  EDIT_CLIP_GAIN_MAX,
  EDIT_CLIP_GAIN_MIN,
  EDIT_CLIP_GAIN_STEP,
  EDIT_CLIP_SPEEDS,
  EDIT_TEXT_ANCHORS,
  EDIT_TEXT_ANCHOR_CELL,
  EDIT_TEXT_FADES,
  EDIT_TEXT_SIZES,
  EDIT_TEXT_TONES,
  EDIT_TRACK_IDS,
  EDIT_TRANSITIONS,
  EDIT_TRANSITION_IDS,
} from '@/constants/edit-desk'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { formatEditClock } from '@/lib/edit-project'
import { cn } from '@/lib/utils'
import type { EditTimelineRow } from '@/lib/edit-project'
import type { EditTextClip } from '@/types/node-workflow'

import type { EditDesk } from '@/hooks/node/use-edit-desk'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'

export interface EditDeskInspectorProps {
  readonly desk: EditDesk
  /** 「回节点」：关模式 + 选中来源卡。 */
  onBackToNode(nodeId: string): void
  /** 字幕段行首那颗字：到预览里原地改这一段。 */
  onEditText(clipId: string): void
}

export function EditDeskInspector({
  desk,
  onBackToNode,
  onEditText,
}: EditDeskInspectorProps) {
  const t = useTranslations('StudioNode.editDesk.inspector')
  const textClip = desk.selectedTextClip
  const row = desk.selectedRow
  const clip = desk.selectedClip
  const selection = desk.selection

  return (
    <div
      data-testid="edit-desk-inspector"
      className="flex min-w-0 flex-1 items-center gap-3.5 overflow-hidden whitespace-nowrap text-xs text-muted-foreground"
    >
      {textClip ? (
        <TextClipFields clip={textClip} desk={desk} onEditText={onEditText} />
      ) : !row || !clip || !selection ? (
        <span data-testid="edit-desk-inspector-empty">{t('empty')}</span>
      ) : (
        <>
          <span
            className="max-w-44 truncate font-semibold text-foreground"
            title={sourceName(row)}
          >
            {sourceName(row)}
          </span>
          {row.source.exists ? null : (
            <span className="text-status-risk">{t('sourceGone')}</span>
          )}
          <Reading
            label={t('inPoint')}
            value={formatEditClock(clip.in, true)}
          />
          <Reading
            label={t('outPoint')}
            value={formatEditClock(clip.out, true)}
          />

          {selection.track === EDIT_TRACK_IDS.video ? (
            <>
              <Segmented
                testId="edit-desk-speed"
                ariaLabel={t('speed')}
                options={EDIT_CLIP_SPEEDS.map((speed) => ({
                  id: String(speed),
                  label: t('speedOption', { speed }),
                  active: (clip.speed || 1) === speed,
                  onSelect: () =>
                    desk.updateClip(selection.track, clip.id, { speed }),
                }))}
              />
              <label className="inline-flex items-center gap-1.5">
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
                    'relative h-5 w-[34px] shrink-0 rounded-full transition-colors duration-fast motion-reduce:transition-none',
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
              </label>
              <Segmented
                testId="edit-desk-transition"
                ariaLabel={t('transition')}
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
            </>
          ) : (
            <GainSlider
              key={clip.id}
              value={clip.gain ?? 1}
              label={t('gain')}
              onCommit={(gain) =>
                desk.updateClip(selection.track, clip.id, { gain })
              }
            />
          )}

          <button
            type="button"
            data-testid="edit-desk-back-to-node"
            disabled={!row.source.exists}
            title={t('backToNode')}
            onClick={() => onBackToNode(clip.sourceNodeId)}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-foreground transition-colors duration-fast hover:bg-muted disabled:opacity-50"
          >
            <Sparkles className="size-3.5 shrink-0" aria-hidden />
            <span>{t('backToNodeShort')}</span>
          </button>
        </>
      )}
    </div>
  )
}

function Reading({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <span className="shrink-0">
      {label} <span className="tabular-nums text-foreground">{value}</span>
    </span>
  )
}

/**
 * 配音 / 配乐的音量。⚠ 拖动时只改本地、**松手才落**一条 op：每一帧都落会把撤销栈
 * 冲成几十步（与改成片名、改字幕同一条手法）。
 */
function GainSlider({
  value,
  label,
  onCommit,
}: {
  readonly value: number
  readonly label: string
  onCommit(gain: number): void
}) {
  const [draft, setDraft] = useState(value)
  return (
    <label className="inline-flex shrink-0 items-center gap-2">
      <span>{label}</span>
      <Slider
        data-testid="edit-desk-gain"
        aria-label={label}
        className="w-24"
        min={EDIT_CLIP_GAIN_MIN}
        max={EDIT_CLIP_GAIN_MAX}
        step={EDIT_CLIP_GAIN_STEP}
        value={[draft]}
        onValueChange={([next]) => {
          if (next !== undefined) setDraft(next)
        }}
        onValueCommit={([next]) => {
          if (next !== undefined) onCommit(next)
        }}
      />
      <span className="w-9 tabular-nums text-foreground">
        {Math.round(draft * 100)}%
      </span>
    </label>
  )
}

/**
 * 分段控件（画板 `.seg`）。⚠ 属性行 + 左栏两张筛 + 快捷键弹层共用这一颗，⛔ 不各写
 * 一份。
 */
export function Segmented({
  testId,
  ariaLabel,
  options,
}: {
  readonly testId: string
  readonly ariaLabel?: string
  readonly options: readonly {
    readonly id: string
    readonly label: string
    readonly active: boolean
    onSelect(): void
  }[]
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex shrink-0 gap-0.5 rounded-lg bg-surface-fill p-0.5"
    >
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

function sourceName(row: EditTimelineRow): string {
  const data = row.source.node?.data
  if (!data) return row.clip.sourceNodeId
  if (data.kind === NODE_MEDIA_KIND_IDS.video) return data.label ?? data.name
  return data.name
}

/**
 * 字幕段那一行（④ A 关键切片）：**字在预览上原地改**，这一行只放读数与四颗小按钮。
 */
function TextClipFields({
  clip,
  desk,
  onEditText,
}: {
  readonly clip: EditTextClip
  readonly desk: EditDesk
  onEditText(clipId: string): void
}) {
  const t = useTranslations('StudioNode.editDesk.text')
  const firstLine = clip.text.split('\n')[0] ?? ''

  return (
    <>
      <button
        type="button"
        data-testid="edit-desk-text-edit"
        title={t('editInPreview')}
        onClick={() => onEditText(clip.id)}
        className="max-w-44 shrink-0 truncate rounded-md px-1 text-left font-semibold text-foreground transition-colors duration-fast hover:bg-muted"
      >
        T {firstLine}
      </button>
      <Reading
        label={t('inPoint')}
        value={formatEditClock(clip.startSec, true)}
      />
      <Reading
        label={t('outPoint')}
        value={formatEditClock(clip.startSec + clip.durationSec, true)}
      />

      <RowPopover testId="edit-desk-text-anchor" label={t('anchor')}>
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
      </RowPopover>

      <RowPopover
        testId="edit-desk-text-size"
        label={`${t('size')} · ${t(`sizes.${clip.size}`)}`}
      >
        <Segmented
          testId="edit-desk-text-size"
          ariaLabel={t('size')}
          options={EDIT_TEXT_SIZES.map((size) => ({
            id: size,
            label: t(`sizes.${size}`),
            active: clip.size === size,
            onSelect: () => desk.updateTextClip(clip.id, { size }),
          }))}
        />
      </RowPopover>

      <RowPopover
        testId="edit-desk-text-tone"
        label={`${t('tone')} · ${t(`tones.${clip.tone}`)}`}
      >
        <Segmented
          testId="edit-desk-text-tone"
          ariaLabel={t('tone')}
          options={EDIT_TEXT_TONES.map((tone) => ({
            id: tone,
            label: t(`tones.${tone}`),
            active: clip.tone === tone,
            onSelect: () => desk.updateTextClip(clip.id, { tone }),
          }))}
        />
      </RowPopover>

      <RowPopover
        testId="edit-desk-text-fade"
        label={`${t('fade')} · ${
          clip.fadeSec === 0
            ? t('fadeNone')
            : t('fadeSeconds', { fadeSec: clip.fadeSec })
        }`}
      >
        <Segmented
          testId="edit-desk-text-fade"
          ariaLabel={t('fade')}
          options={EDIT_TEXT_FADES.map((fadeSec) => ({
            id: String(fadeSec),
            label:
              fadeSec === 0 ? t('fadeNone') : t('fadeSeconds', { fadeSec }),
            active: clip.fadeSec === fadeSec,
            onSelect: () => desk.updateTextClip(clip.id, { fadeSec }),
          }))}
        />
      </RowPopover>
    </>
  )
}

/**
 * 属性行上的一颗小按钮 + 它的小弹层。开合走全站 Popover 的内置动效（ui-defaults §4
 * 「不要覆盖」）；一次只开一个是 Popover 自己的行为（点另一颗 = 先关这颗）。
 */
function RowPopover({
  testId,
  label,
  children,
}: {
  readonly testId: string
  readonly label: string
  readonly children: ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`${testId}-trigger`}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-xs text-foreground transition-colors duration-fast hover:bg-muted data-[state=open]:border-foreground"
        >
          {label}
          <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-auto p-2.5">
        {children}
      </PopoverContent>
    </Popover>
  )
}
