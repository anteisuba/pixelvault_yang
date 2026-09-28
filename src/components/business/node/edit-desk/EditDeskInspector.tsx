'use client'

/**
 * 选中段的属性 —— **时间线卡工具行中间那一格**（画板「剪辑台 A · 全部状态」）。
 * ⛔ 不再有右侧属性栏：看 Claude 剪的时候舞台要最大，一段的属性一行看完。
 *
 * 三种段各一行，长相与工作台输入框的工具行同一套（描边胶囊 · 液态分段 · 从胶囊长出来
 * 的弹层）：
 * - 视频段：镜头名 · 入点 · 出点 · 速度 · 原声 · 转场 · 回节点；
 * - 配音 / 配乐段：镜头名 · 入点 · 出点 · 音量 · 回节点；
 * - 字幕段：字（点它 = 到预览里原地改）· 入点 · 出点 · 位置 / 字号 / 颜色 / 淡入淡出
 *   四颗胶囊，各开一个小弹层，一次只开一个。时间线卡变窄（助手展开）时胶囊收成图标。
 * 没选中时是一句话 —— ⛔ 不摆一排灰掉的控件。
 *
 * ⚠ 「回节点」**不在剪辑台开生成入口**（spec §6）：它关掉全屏模式、回画布并选中
 * 来源卡，改画面的事在那张卡上做。
 * ⚠ 入出点是**读数**不是输入框：改时间用轨道上的手柄，⛔ 不给两个能互相打架的入口。
 */

import { useState, type ReactNode } from 'react'
import {
  ArrowUpRight,
  ChevronDown,
  Grid3X3,
  Palette,
  Sunrise,
  Type,
} from '@/components/icons'
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
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import {
  getChipZoomMotion,
  studioOutlineChipClass,
  studioOutlineChipCompactClass,
  studioOutlineChipCompactLabelClass,
  studioOutlineChipOpenClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

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
      className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden whitespace-nowrap text-xs text-muted-foreground"
    >
      {textClip ? (
        <TextClipFields clip={textClip} desk={desk} onEditText={onEditText} />
      ) : !row || !clip || !selection ? (
        <span data-testid="edit-desk-inspector-empty">{t('empty')}</span>
      ) : (
        <>
          {row.source.exists ? (
            <span
              className="max-w-36 shrink-0 truncate text-2sm font-semibold text-foreground"
              title={sourceName(row)}
            >
              {sourceName(row)}
            </span>
          ) : (
            <span className="shrink-0 text-status-risk">{t('sourceGone')}</span>
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
              <LiquidSegmented
                ariaLabel={t('speed')}
                semantics="radio"
                value={String(clip.speed || 1)}
                onChange={(value) =>
                  desk.updateClip(selection.track, clip.id, {
                    speed: Number(value),
                  })
                }
                items={EDIT_CLIP_SPEEDS.map((speed) => ({
                  value: String(speed),
                  label: t('speedOption', { speed }),
                }))}
              />
              <DeskSwitch
                label={t('sound')}
                checked={!clip.muted}
                testId="edit-desk-muted"
                onToggle={() =>
                  desk.updateClip(selection.track, clip.id, {
                    muted: !clip.muted,
                  })
                }
              />
              <LiquidSegmented
                ariaLabel={t('transition')}
                semantics="radio"
                value={clip.transitionOut ?? EDIT_TRANSITION_IDS.none}
                onChange={(transition) =>
                  desk.updateClip(selection.track, clip.id, {
                    transitionOut: transition,
                  })
                }
                items={EDIT_TRANSITIONS.map((transition) => ({
                  value: transition,
                  label: t(`transitions.${transition}`),
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
            className={cn(
              studioOutlineChipClass,
              studioOutlineChipCompactClass,
            )}
          >
            <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
            <span className={studioOutlineChipCompactLabelClass}>
              {t('backToNodeShort')}
            </span>
          </button>
        </>
      )}
    </div>
  )
}

/** 入 / 出点读数：字是正文槽，数是等宽槽（ui-defaults §1 等宽判据）。 */
function Reading({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <span className="shrink-0">
      {label}{' '}
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </span>
  )
}

/**
 * 属性行上的开关（原声 · 与工具行的主轨道磁吸同一个样子）：拨子走 `spring-slot`。
 */
function DeskSwitch({
  label,
  checked,
  testId,
  onToggle,
}: {
  readonly label: string
  readonly checked: boolean
  readonly testId: string
  onToggle(): void
}) {
  return (
    <label className="inline-flex shrink-0 items-center gap-2">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        data-testid={testId}
        onClick={onToggle}
        className={cn(
          'relative h-5 w-8.5 shrink-0 rounded-full transition-colors duration-fast motion-reduce:transition-none',
          checked ? 'bg-primary' : 'bg-surface-fill-track',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 size-4 rounded-full bg-background shadow-sm transition-transform duration-spring-slot ease-spring-slot motion-reduce:transition-none',
            checked && 'translate-x-3.5',
          )}
        />
      </button>
    </label>
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
      <span className="w-9 font-mono tabular-nums text-foreground">
        {Math.round(draft * 100)}%
      </span>
    </label>
  )
}

function sourceName(row: EditTimelineRow): string {
  const data = row.source.node?.data
  if (!data) return ''
  if (data.kind === NODE_MEDIA_KIND_IDS.video) return data.label ?? data.name
  return data.name
}

/**
 * 字幕段那一行：**字在预览上原地改**，这一行只放读数与四颗胶囊。
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
        className="inline-flex h-8 max-w-44 shrink-0 items-center gap-1.5 rounded-lg px-1.5 text-2sm font-semibold text-foreground transition-colors duration-fast hover:bg-surface-fill"
      >
        <span className="grid size-4.5 shrink-0 place-items-center rounded-sm bg-primary text-3xs font-semibold text-primary-foreground">
          T
        </span>
        <span className="truncate">{firstLine}</span>
      </button>
      <Reading
        label={t('inPoint')}
        value={formatEditClock(clip.startSec, true)}
      />
      <Reading
        label={t('outPoint')}
        value={formatEditClock(clip.startSec + clip.durationSec, true)}
      />

      <RowPopover
        testId="edit-desk-text-anchor"
        icon={<Grid3X3 className="size-3.5 shrink-0" aria-hidden />}
        label={t('anchor')}
      >
        <div
          role="radiogroup"
          aria-label={t('anchor')}
          style={{ gap: EDIT_TEXT_ANCHOR_CELL.gapPx }}
          className="grid w-fit grid-cols-3 p-1"
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
                'grid place-items-center transition-colors duration-fast',
                clip.anchor === anchor ? 'bg-primary' : 'bg-surface-fill',
              )}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  clip.anchor === anchor
                    ? 'bg-primary-foreground'
                    : 'bg-muted-foreground/50',
                )}
              />
            </button>
          ))}
        </div>
      </RowPopover>

      <RowPopover
        testId="edit-desk-text-size"
        icon={<Type className="size-3.5 shrink-0" aria-hidden />}
        label={`${t('size')} · ${t(`sizes.${clip.size}`)}`}
      >
        <LiquidSegmented
          ariaLabel={t('size')}
          semantics="radio"
          value={clip.size}
          onChange={(size) => desk.updateTextClip(clip.id, { size })}
          items={EDIT_TEXT_SIZES.map((size) => ({
            value: size,
            label: t(`sizes.${size}`),
          }))}
        />
      </RowPopover>

      <RowPopover
        testId="edit-desk-text-tone"
        icon={<Palette className="size-3.5 shrink-0" aria-hidden />}
        label={`${t('tone')} · ${t(`tones.${clip.tone}`)}`}
      >
        <LiquidSegmented
          ariaLabel={t('tone')}
          semantics="radio"
          value={clip.tone}
          onChange={(tone) => desk.updateTextClip(clip.id, { tone })}
          items={EDIT_TEXT_TONES.map((tone) => ({
            value: tone,
            label: t(`tones.${tone}`),
          }))}
        />
      </RowPopover>

      <RowPopover
        testId="edit-desk-text-fade"
        icon={<Sunrise className="size-3.5 shrink-0" aria-hidden />}
        label={`${t('fade')} · ${
          clip.fadeSec === 0
            ? t('fadeNone')
            : t('fadeSeconds', { fadeSec: clip.fadeSec })
        }`}
      >
        <LiquidSegmented
          ariaLabel={t('fade')}
          semantics="radio"
          value={String(clip.fadeSec)}
          onChange={(value) => {
            const fadeSec = EDIT_TEXT_FADES.find(
              (candidate) => String(candidate) === value,
            )
            if (fadeSec !== undefined) {
              desk.updateTextClip(clip.id, { fadeSec })
            }
          }}
          items={EDIT_TEXT_FADES.map((fadeSec) => ({
            value: String(fadeSec),
            label:
              fadeSec === 0 ? t('fadeNone') : t('fadeSeconds', { fadeSec }),
          }))}
        />
      </RowPopover>
    </>
  )
}

/**
 * 属性行上的一颗胶囊 + 它的小弹层：长相与开合都是工作台输入框工具行那一套（描边
 * 胶囊 · 从胶囊原地放大 · 关上缩回），一次只开一个是 Popover 自己的行为。
 */
function RowPopover({
  testId,
  icon,
  label,
  children,
}: {
  readonly testId: string
  readonly icon: ReactNode
  readonly label: string
  readonly children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const zoom = getChipZoomMotion({ side: 'top', align: 'start', sideOffset: 8 })
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`${testId}-trigger`}
          aria-label={label}
          className={cn(
            studioOutlineChipClass,
            studioOutlineChipCompactClass,
            open && studioOutlineChipOpenClass,
          )}
        >
          {icon}
          <span className={studioOutlineChipCompactLabelClass}>{label}</span>
          <ChevronDown
            className="size-3 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className={cn('w-auto p-2', zoom.className)}
        style={zoom.style}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
