'use client'

/**
 * 选中段的属性 —— **走带行中间那一格**（v2 关键切片：播放 · 时间码 · 这一格 · 缩放）。
 * ⛔ 不再有右侧属性栏：看 Claude 剪的时候舞台要最大，一段的属性一行看完。
 *
 * 三种段各一行，一律是暗台上的实底小胶囊（读数胶囊不可点，可点的悬停提亮）：
 * - 视频段：镜头名 · 入点 · 出点 · 速度 · 原声 · 转场 · 版本 · 回节点；
 * - 配音 / 配乐段：镜头名 · 入点 · 出点 · 音量 · 回节点；
 * - 字幕段：字（点它 = 到预览里原地改）· 入点 · 出点 · 位置 / 字号 / 颜色 / 淡入淡出
 *   四颗胶囊，各开一个小弹层，一次只开一个。
 * 末尾两颗小键 **分割 · 删除**（时间线上那排工具键去掉了，S / ⌫ 之外留一个看得见的入口）。
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
  Scissors,
  Sunrise,
  Trash2,
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
import { getChipZoomMotion } from '@/components/business/studio-shared/primitives/tool-surface'
import { EditClipVersionsPopover, readClipTakes } from './EditDeskVersions'

/** 暗台上的实底小胶囊（关键切片 `.chip`）：读数用它，可点的再加 `CHIP_ACTIVE`。 */
const CHIP =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-card px-2.5 text-xs text-foreground/80'
const CHIP_ACTIVE =
  'transition-colors duration-fast hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50'
/** 胶囊里的值（「入 0:06.0」里那个 0:06.0）。 */
const CHIP_VALUE = 'font-mono not-italic tabular-nums text-muted-foreground'

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
  const tDesk = useTranslations('StudioNode.editDesk')
  const textClip = desk.selectedTextClip
  const row = desk.selectedRow
  const clip = desk.selectedClip
  const selection = desk.selection

  return (
    <div
      data-testid="edit-desk-inspector"
      className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs text-muted-foreground"
    >
      {textClip ? (
        <TextClipFields clip={textClip} desk={desk} onEditText={onEditText} />
      ) : !row || !clip || !selection ? (
        <span data-testid="edit-desk-inspector-empty">{t('empty')}</span>
      ) : (
        <>
          {row.source.exists ? (
            <span
              className="mr-1 max-w-36 shrink-0 truncate font-medium text-foreground/80"
              title={sourceName(row)}
            >
              {selection.track === EDIT_TRACK_IDS.video
                ? tDesk('shotTag', { n: row.index + 1, name: sourceName(row) })
                : sourceName(row)}
            </span>
          ) : (
            <span className="mr-1 shrink-0 text-status-risk">
              {t('sourceGone')}
            </span>
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
              <RowPopover
                testId="edit-desk-speed"
                label={t('speed')}
                value={t('speedOption', { speed: clip.speed || 1 })}
              >
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
              </RowPopover>
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
                className={cn(CHIP, CHIP_ACTIVE)}
              >
                {t('sound')}
                <em className={CHIP_VALUE}>
                  {clip.muted ? t('soundOff') : t('soundOn')}
                </em>
              </button>
              <RowPopover
                testId="edit-desk-transition"
                label={t('transition')}
                value={t(
                  `transitions.${clip.transitionOut ?? EDIT_TRANSITION_IDS.none}`,
                )}
              >
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
              </RowPopover>
              <VersionsChip desk={desk} row={row} />
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
            className={cn(CHIP, CHIP_ACTIVE)}
          >
            <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
            {t('backToNodeShort')}
          </button>
        </>
      )}
      {textClip || (row && clip && selection) ? <EditKeys desk={desk} /> : null}
    </div>
  )
}

/** 「版本 n/m」：开与段角读数同一块版本弹层（4a）。卡没了就不出。 */
function VersionsChip({
  desk,
  row,
}: {
  readonly desk: EditDesk
  readonly row: EditTimelineRow
}) {
  const t = useTranslations('StudioNode.editDesk.versions')
  const takes = row.source.exists ? readClipTakes(row) : null
  if (!takes) return null
  return (
    <EditClipVersionsPopover
      desk={desk}
      row={row}
      track={EDIT_TRACK_IDS.video}
      align="start"
    >
      <button
        type="button"
        data-testid="edit-desk-versions-trigger"
        aria-label={t(takes.fresh ? 'badgeFresh' : 'badge', {
          n: takes.n,
          count: takes.count,
        })}
        className={cn(CHIP, CHIP_ACTIVE)}
      >
        {t('title')}
        <em className={CHIP_VALUE}>
          {takes.n}/{takes.count}
        </em>
        {takes.fresh ? (
          <span aria-hidden className="size-1.5 rounded-full bg-foreground" />
        ) : null}
      </button>
    </EditClipVersionsPopover>
  )
}

/** 选中一段之后行尾那两颗小键：分割（S）· 删除（⌫）。 */
function EditKeys({ desk }: { readonly desk: EditDesk }) {
  const t = useTranslations('StudioNode.editDesk')
  return (
    <>
      <span aria-hidden className="mx-1 h-4.5 w-px shrink-0 bg-border" />
      <button
        type="button"
        data-testid="edit-desk-split"
        aria-label={t('tools.split')}
        title={t('tools.split')}
        onClick={() => desk.splitAtPlayhead()}
        className={cn(CHIP, CHIP_ACTIVE, 'px-0 w-7 justify-center')}
      >
        <Scissors className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        data-testid="edit-desk-remove"
        aria-label={t('tools.remove')}
        title={t('tools.remove')}
        onClick={() => desk.removeSelected()}
        className={cn(CHIP, CHIP_ACTIVE, 'px-0 w-7 justify-center')}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    </>
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
    <span className={CHIP}>
      {label}
      <em className={CHIP_VALUE}>{value}</em>
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
    <label className={CHIP}>
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
      <span className={cn(CHIP_VALUE, 'w-9')}>{Math.round(draft * 100)}%</span>
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
        className={cn(CHIP, CHIP_ACTIVE, 'mr-1 max-w-44 font-medium')}
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
        label={t('size')}
        value={t(`sizes.${clip.size}`)}
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
        label={t('tone')}
        value={t(`tones.${clip.tone}`)}
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
        label={t('fade')}
        value={
          clip.fadeSec === 0
            ? t('fadeNone')
            : t('fadeSeconds', { fadeSec: clip.fadeSec })
        }
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
  value,
  children,
}: {
  readonly testId: string
  readonly icon?: ReactNode
  readonly label: string
  /** 胶囊上的当前值（「速度 1×」里那个 1×）。 */
  readonly value?: string
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
          aria-label={value ? `${label} · ${value}` : label}
          className={cn(CHIP, CHIP_ACTIVE, open && 'bg-muted text-foreground')}
        >
          {icon}
          {label}
          {value ? <em className={CHIP_VALUE}>{value}</em> : null}
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
        // 弹层传送到 body：自己带 `dark`，⛔ 在暗台上弹一块白的。
        className={cn('dark w-auto p-2', zoom.className)}
        style={zoom.style}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
