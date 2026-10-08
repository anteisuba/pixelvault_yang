'use client'

/**
 * 选中段的属性 —— **走带行中间那一格**（v2 关键切片：播放 · 时间码 · 这一格 · 缩放）。
 * ⛔ 不再有右侧属性栏：看 Claude 剪的时候舞台要最大，一段的属性一行看完。
 *
 * 三种段各一行，一律是一排文字键（换皮第一轮 B：无边框，悬停浅灰块，改过的加粗；读数不可点）：
 * - 视频段：镜头名 · 重拍 · 续拍 · 入点 · 出点 · 速度 · 原声 · 版本 · 回节点（转场在段间
 *   接缝标记的弹层里，5a）；
 * - 配音 / 配乐段：镜头名 · 入点 · 出点 · 音量 · 回节点；
 * - 字幕段：字（点它 = 到预览里原地改）· 入点 · 出点 · 位置 / 字号 / 颜色 / 淡入淡出
 *   四颗胶囊，各开一个小弹层，一次只开一个。
 * 末尾两颗小键 **分割 · 删除**（时间线上那排工具键去掉了，S / ⌫ 之外留一个看得见的入口）。
 * 没选中时是一句话 —— ⛔ 不摆一排灰掉的控件。
 *
 * ⚠ 重拍就地做（v2 第 4 片 4b：「重拍」升起来源卡那条提示词栏）；「回节点」关掉全屏
 * 模式、回画布并选中来源卡，其余改画面的事（编辑、拆版本……）在那张卡上做。
 * ⚠ 入出点是**读数**不是输入框：改时间用轨道上的手柄，⛔ 不给两个能互相打架的入口。
 */

import { useEffect, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowUpRight,
  Check,
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
  EDIT_DELETE_MOTION,
  EDIT_PICK_CLOSE_DELAY_MS,
  EDIT_TEXT_ANCHORS,
  EDIT_TEXT_ANCHOR_CELL,
  EDIT_TEXT_FADES,
  EDIT_TEXT_SIZES,
  EDIT_TEXT_TONES,
  EDIT_TRACK_IDS,
} from '@/constants/edit-desk'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { editRowName, formatEditClock } from '@/lib/edit-project'
import { cn } from '@/lib/utils'
import type { EditTimelineRow } from '@/lib/edit-project'
import type { EditTextClip } from '@/types/node-workflow'

import type { EditDesk } from '@/hooks/node/use-edit-desk'
import { BlurSwap } from '@/components/ui/blur-swap'
import { RollingText } from '@/components/ui/rolling-text'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { getChipZoomMotion } from '@/components/business/studio-shared/primitives/tool-surface'
import { PickHeader, PickList, PickRow } from './EditDeskPickRow'
import { EditClipVersionsPopover, readClipTakes } from './EditDeskVersions'
import { useEditDeskContinue } from './use-edit-desk-continue'

/**
 * 一排**文字键**（换皮第一轮 B，照素材页筛选条）：无边框无底，悬停浅灰块；读数用同一个
 * 底样（不可点、没有悬停），可点的再加 `CHIP_ACTIVE`，改过的（不是默认值）加 `CHIP_SET`。
 */
const CHIP =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-foreground'
const CHIP_ACTIVE =
  'transition-colors duration-fast hover:bg-muted disabled:pointer-events-none disabled:opacity-40'
const CHIP_SET = 'font-medium'
/** 键里的值（「入 0:06.0」里那个 0:06.0）。改过的键里值也转成墨色。 */
const CHIP_VALUE = 'font-mono not-italic tabular-nums text-muted-foreground'
const CHIP_VALUE_SET = 'text-foreground'

export interface EditDeskInspectorProps {
  readonly desk: EditDesk
  /** 「回节点」：关模式 + 选中来源卡。 */
  onBackToNode(nodeId: string): void
  /** 字幕段行首那颗字：到预览里原地改这一段。 */
  onEditText(clipId: string): void
  /** 删掉选中的那一段（台面去删，顺手出「删了… · 撤销」那条回执）。 */
  onRemove(): void
  /**
   * 新段 id 生成器 —— 给了才出「续拍」（4c：截这一段出点那一帧，在它后面插一段占位并
   * 升起新卡的栏）。
   */
  mintId?(prefix: string): string
}

export function EditDeskInspector({
  desk,
  onBackToNode,
  onEditText,
  onRemove,
  mintId,
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
              title={editRowName(row)}
            >
              {selection.track === EDIT_TRACK_IDS.video
                ? tDesk('shotTag', { n: row.index + 1, name: editRowName(row) })
                : editRowName(row)}
            </span>
          ) : (
            <span className="mr-1 shrink-0 text-muted-foreground">
              {t('sourceGone')}
            </span>
          )}
          {selection.track === EDIT_TRACK_IDS.video &&
          row.source.node?.data.kind === NODE_MEDIA_KIND_IDS.video ? (
            <>
              {/* 就地重拍（4b）：升起来源卡那条提示词栏。还没有片子的段（续拍的占位）
                  写「生成」。 */}
              <button
                type="button"
                data-testid="edit-desk-retake"
                aria-pressed={desk.retakeClipId === clip.id}
                onClick={() =>
                  desk.retakeClipId === clip.id
                    ? desk.closeRetake()
                    : desk.openRetake(selection.track, clip.id)
                }
                className={cn(
                  CHIP,
                  CHIP_ACTIVE,
                  desk.retakeClipId === clip.id && 'bg-muted',
                )}
              >
                {row.source.url
                  ? tDesk('retake.action')
                  : tDesk('retake.generate')}
              </button>
              {mintId ? (
                <ContinueChip
                  desk={desk}
                  mintId={mintId}
                  clipId={clip.id}
                  disabled={!row.source.url}
                />
              ) : null}
            </>
          ) : null}
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
                set={(clip.speed || 1) !== 1}
                hint={editRowName(row)}
              >
                {(pick) =>
                  EDIT_CLIP_SPEEDS.map((speed) => (
                    <PickRow
                      key={speed}
                      mono
                      label={t('speedOption', { speed })}
                      selected={(clip.speed || 1) === speed}
                      onPick={() =>
                        pick(() =>
                          desk.updateClip(selection.track, clip.id, { speed }),
                        )
                      }
                    />
                  ))
                }
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
                className={cn(CHIP, CHIP_ACTIVE, clip.muted && CHIP_SET)}
              >
                {t('sound')}
                <em className={cn(CHIP_VALUE, clip.muted && CHIP_VALUE_SET)}>
                  {clip.muted ? t('soundOff') : t('soundOn')}
                </em>
              </button>
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
      {textClip || (row && clip && selection) ? (
        <EditKeys
          desk={desk}
          // 换了一段 = 删除键回到垃圾桶（⛔ 上一段按了一下的「确认删除」留到这一段）。
          selectionKey={textClip?.id ?? clip?.id ?? ''}
          onRemove={onRemove}
        />
      ) : null}
    </div>
  )
}

/**
 * 「续拍」（4c）。⚠ 自成一个组件：续拍要截帧、要往画布上落卡（画布上下文），只在选中了
 * 视频段时才挂上 —— ⛔ 不让整个台面为它依赖画布上下文。
 */
function ContinueChip({
  desk,
  mintId,
  clipId,
  disabled,
}: {
  readonly desk: EditDesk
  mintId(prefix: string): string
  readonly clipId: string
  readonly disabled: boolean
}) {
  const tDesk = useTranslations('StudioNode.editDesk')
  const continueClip = useEditDeskContinue({ desk, mintId })
  return (
    <button
      type="button"
      data-testid="edit-desk-continue"
      disabled={disabled || continueClip.busy}
      onClick={() => void continueClip.run(clipId)}
      className={cn(CHIP, CHIP_ACTIVE)}
    >
      {tDesk('continue.action')}
    </button>
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
        className={cn(CHIP, CHIP_ACTIVE, takes.count > 1 && CHIP_SET)}
      >
        {t('title')}
        <em className={cn(CHIP_VALUE, takes.count > 1 && CHIP_VALUE_SET)}>
          <RollingText text={`${takes.n}/${takes.count}`} />
        </em>
        {takes.fresh ? (
          <span aria-hidden className="size-1.5 rounded-full bg-foreground" />
        ) : null}
      </button>
    </EditClipVersionsPopover>
  )
}

/** 选中一段之后行尾那两颗小键：分割（S）· 删除（按两次 J；⌫ 照删）。 */
function EditKeys({
  desk,
  selectionKey,
  onRemove,
}: {
  readonly desk: EditDesk
  readonly selectionKey: string
  onRemove(): void
}) {
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
      <DeleteKey key={selectionKey} onRemove={onRemove} />
    </>
  )
}

/**
 * 删除键（样片 J）：垃圾桶 → 点一下拉长成黑底「确认删除」→ 再点收成对勾、停一下再删；
 * 3 秒不点自己收回。同一颗键变形，⛔ 不弹系统确认框。
 */
function DeleteKey({ onRemove }: { onRemove(): void }) {
  const t = useTranslations('StudioNode.editDesk')
  const reduceMotion = useReducedMotion()
  const [phase, setPhase] = useState<'idle' | 'armed' | 'done'>('idle')

  useEffect(() => {
    if (phase === 'idle') return undefined
    const timer = window.setTimeout(
      () => (phase === 'armed' ? setPhase('idle') : onRemove()),
      phase === 'armed'
        ? EDIT_DELETE_MOTION.armMs
        : reduceMotion
          ? 0
          : EDIT_DELETE_MOTION.commitDelayMs,
    )
    return () => window.clearTimeout(timer)
  }, [phase, onRemove, reduceMotion])

  const label = phase === 'idle' ? t('tools.remove') : t('tools.removeConfirm')
  return (
    <motion.button
      type="button"
      data-testid="edit-desk-remove"
      data-phase={phase}
      aria-label={label}
      title={label}
      disabled={phase === 'done'}
      onClick={() => setPhase(phase === 'idle' ? 'armed' : 'done')}
      initial={false}
      animate={{
        width: phase === 'idle' ? EDIT_DELETE_MOTION.idleWidthPx : 'auto',
      }}
      transition={reduceMotion ? { duration: 0 } : EDIT_DELETE_MOTION.grow}
      className={cn(
        CHIP,
        'justify-center overflow-hidden whitespace-nowrap transition-colors duration-fast',
        phase === 'idle'
          ? 'px-0 hover:bg-muted'
          : 'bg-foreground px-2.5 text-background',
      )}
    >
      <BlurSwap swapKey={phase} className="gap-1.5">
        {phase === 'done' ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <>
            <Trash2 className="size-3.5 shrink-0" aria-hidden />
            {phase === 'armed' ? t('tools.removeConfirm') : null}
          </>
        )}
      </BlurSwap>
    </motion.button>
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
      {/* 拖手柄时入出点跟着滚（样片 K）。 */}
      <em className={CHIP_VALUE}>
        <RollingText text={value} />
      </em>
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
        wide
      >
        {() => (
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
        )}
      </RowPopover>

      <RowPopover
        testId="edit-desk-text-size"
        icon={<Type className="size-3.5 shrink-0" aria-hidden />}
        label={t('size')}
        value={t(`sizes.${clip.size}`)}
      >
        {(pick) =>
          EDIT_TEXT_SIZES.map((size) => (
            <PickRow
              key={size}
              label={t(`sizes.${size}`)}
              selected={clip.size === size}
              onPick={() => pick(() => desk.updateTextClip(clip.id, { size }))}
            />
          ))
        }
      </RowPopover>

      <RowPopover
        testId="edit-desk-text-tone"
        icon={<Palette className="size-3.5 shrink-0" aria-hidden />}
        label={t('tone')}
        value={t(`tones.${clip.tone}`)}
      >
        {(pick) =>
          EDIT_TEXT_TONES.map((tone) => (
            <PickRow
              key={tone}
              label={t(`tones.${tone}`)}
              selected={clip.tone === tone}
              onPick={() => pick(() => desk.updateTextClip(clip.id, { tone }))}
            />
          ))
        }
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
        {(pick) =>
          EDIT_TEXT_FADES.map((fadeSec) => (
            <PickRow
              key={fadeSec}
              mono={fadeSec !== 0}
              label={
                fadeSec === 0 ? t('fadeNone') : t('fadeSeconds', { fadeSec })
              }
              selected={clip.fadeSec === fadeSec}
              onPick={() =>
                pick(() => desk.updateTextClip(clip.id, { fadeSec }))
              }
            />
          ))
        }
      </RowPopover>
    </>
  )
}

/**
 * 属性行上的一颗文字键 + 它的小弹层：从键原地长出来、关上缩回（工作台输入框工具行那一套），
 * 一次只开一个是 Popover 自己的行为。弹层里一行一项（`PickRow`，换皮第二轮照模型选择器）。
 *
 * `children(pick)`：行点下去调 `pick(apply)` —— 立刻落改动（对勾马上挪过去、键上的值糊一下
 * 换掉），停 `EDIT_PICK_CLOSE_DELAY_MS` 再收。
 */
function RowPopover({
  testId,
  icon,
  label,
  value,
  hint,
  set = false,
  wide = false,
  children,
}: {
  readonly testId: string
  readonly icon?: ReactNode
  readonly label: string
  /** 键上的当前值（「速度 1×」里那个 1×）。 */
  readonly value?: string
  /** 弹层头右边那行灰字（这是哪一段）。 */
  readonly hint?: string
  /** 改过（不是默认值）：键加粗、值转墨色。 */
  readonly set?: boolean
  /** 内容自己定宽（九宫格），⛔ 不套一行一项的固定宽。 */
  readonly wide?: boolean
  children(pick: (apply: () => void) => void): ReactNode
}) {
  const [open, setOpen] = useState(false)
  const zoom = getChipZoomMotion({ side: 'top', align: 'start', sideOffset: 8 })
  const pick = (apply: () => void) => {
    apply()
    window.setTimeout(() => setOpen(false), EDIT_PICK_CLOSE_DELAY_MS)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`${testId}-trigger`}
          aria-label={value ? `${label} · ${value}` : label}
          className={cn(CHIP, CHIP_ACTIVE, set && CHIP_SET, open && 'bg-muted')}
        >
          {icon}
          {label}
          {value ? (
            <em className={cn(CHIP_VALUE, set && CHIP_VALUE_SET)}>
              <BlurSwap swapKey={value}>{value}</BlurSwap>
            </em>
          ) : null}
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
        className={cn(wide ? 'w-auto p-2' : 'w-50 p-1.5', zoom.className)}
        style={zoom.style}
      >
        {wide ? (
          children(pick)
        ) : (
          <>
            <PickHeader title={label} hint={hint} />
            <PickList label={label}>{children(pick)}</PickList>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
