'use client'

/**
 * 左侧 **图标栏** + 点图标才飞出的 **236 面板**（画板 `EditDesk.dc.html` 左半；
 * ④ 方向 A「舞台」owner 2026-09-28：⛔ 面板不常驻，飞出来盖在舞台左上、不推开舞台，
 * 拖完 / 点别处 / Esc 收回 —— 看 Claude 剪的时候舞台要最大）。
 *
 * 两块分开导出：`EditDeskAssetRail` 是图标列（常驻），`EditDeskAssetPanel` 是面板
 * 本身，由台面挂在**舞台那一格**里 —— 它的高度只到舞台为止，⛔ 不盖时间线（要能往
 * 时间线上拖）。
 *
 * 图标栏五项：画布素材 / 素材库 / 音频 / 文字 / 转场。
 * - **画布素材** 是唯一一条与时间线数据相通的路（拖进去就是一段）；
 * - **音频** 是画布素材的音频子集（同一批卡，只是省掉在视频里找的那一步）；
 * - **文字** 顶上一颗「在播放头处加一条字幕」（v2 第 3 片：时间线上那排工具键去掉了，
 *   加字幕搬到这里），下面列画布上的文本卡首行 —— 照着剧本写字幕用，文本卡本身
 *   ⛔ 不进时间线，所以那一格不可拖也不可双击；
 * - **素材库** 是用户自己的产物（`fetchGalleryImages` 的 `mine`），按视频 / 音频筛；
 *   拖进时间线时**先落成一张画布卡**再进轨（⛔ 段不指向素材库记录，见下面那条
 *   MIME 的头注）；
 * - **转场** 列六个预设与「无」，拖到 V 轨两段之间的缝上 = 设**前一段**的 `transitionOut`
 *   （与右栏「转场 →」同一个字段）。
 *
 * ── 每一格都必须**看得见内容**（owner 真机 2026-09-10）───────────────────
 * 一格纯灰底加一个图标，用户在六张卡里认不出哪张是哪张。所以：
 * 视频 = 封面帧（有 `videoThumbnailUrl` 用它，没有就客户端抓首帧一次并缓存）·
 * 音频 = 一小条波形（复用音频卡那一只，⛔ 不另画）· 文本 = 首行。
 *
 * ⚠ 拖投载荷带的是**节点 id**（`EDIT_DESK_NODE_DRAG_MIME`），不是 url：段永远
 * 指向一张卡。理由写在那个常量上。
 */

import { useCallback, useEffect, useState } from 'react'
import {
  FileVideo,
  Layers,
  Music,
  Shuffle,
  Type,
  type LucideIcon,
} from '@/components/icons'
import { useTranslations } from 'next-intl'

import {
  EDIT_AUDIO_FILTER_IDS,
  EDIT_DESK_LAYOUT,
  EDIT_DESK_LIBRARY_DRAG_MIME,
  EDIT_DESK_LIBRARY_FILTER_IDS,
  EDIT_DESK_LIBRARY_PAGE_SIZE,
  EDIT_DESK_NODE_DRAG_MIME,
  EDIT_DESK_TRANSITION_DRAG_MIME,
  EDIT_PANELS,
  EDIT_PANEL_IDS,
  EDIT_DESK_ASSET_WAVE_BARS,
  EDIT_TRANSITIONS,
  EDIT_TRANSITION_IDS,
  type EditAudioFilterId,
  type EditDeskLibraryFilterId,
  type EditPanelId,
} from '@/constants/edit-desk'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_AUDIO_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { fetchGalleryImages } from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import { currentUrlOf, formatEditDurationShort } from '@/lib/edit-project'
import { resolveGenerationDisplayName } from '@/lib/generation-name'
import { cn } from '@/lib/utils'
import { useVideoPoster } from '@/hooks/node/use-video-poster'
import type { GenerationRecord, OutputTypeValue } from '@/types'
import type { NodeV4, NodeV4Data } from '@/types/node-workflow'

import { AudioWaveform } from '../nodes/v4/audio/AudioWaveform'
import {
  beginEditAssetDrag,
  endEditAssetDrag,
  setLiftedDragImage,
  type EditAssetDrag,
} from './edit-desk-asset-drag'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { useBrokenThumbs } from '../nodes/v4/chrome/NodeMediaMissing'
import { TransitionGlyph } from './EditDeskSeamPopover'

const PANEL_ICONS: Record<EditPanelId, LucideIcon> = {
  [EDIT_PANEL_IDS.canvas]: Layers,
  [EDIT_PANEL_IDS.library]: FileVideo,
  [EDIT_PANEL_IDS.audio]: Music,
  [EDIT_PANEL_IDS.text]: Type,
  [EDIT_PANEL_IDS.transition]: Shuffle,
}

/**
 * 素材库里一条产物的拖投载荷 —— **一条还没有节点的产物**。
 *
 * ⚠ 落进轨之前先落成一张画布卡（`EDIT_DESK_LIBRARY_DRAG_MIME` 头注）。
 */
export interface EditDeskLibraryAsset {
  readonly kind: NodeV4Data['kind']
  readonly subtype: NodeV4Data['subtype']
  readonly url: string
  readonly name: string
  readonly durationSec?: number
  readonly thumbnailUrl?: string
}

/**
 * 读回拖投载荷。⚠ 逐个字段查一遍再交出去：`dataTransfer` 里的字符串是**外面来的**
 * （别的标签页 / 别的站点也能往里塞），⛔ 不 `as` 一下就当成自己写的那份。
 */
export function parseEditDeskLibraryAsset(
  raw: string,
): EditDeskLibraryAsset | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    const { kind, subtype, url, name } = record
    if (
      typeof kind !== 'string' ||
      typeof subtype !== 'string' ||
      typeof url !== 'string' ||
      typeof name !== 'string' ||
      !url
    ) {
      return null
    }
    if (
      kind !== NODE_MEDIA_KIND_IDS.video &&
      kind !== NODE_MEDIA_KIND_IDS.audio
    ) {
      return null
    }
    const durationSec = record.durationSec
    const thumbnailUrl = record.thumbnailUrl
    return {
      kind,
      subtype: subtype as NodeV4Data['subtype'],
      url,
      name,
      ...(typeof durationSec === 'number' && durationSec > 0
        ? { durationSec }
        : {}),
      ...(typeof thumbnailUrl === 'string' && thumbnailUrl
        ? { thumbnailUrl }
        : {}),
    }
  } catch {
    return null
  }
}

export interface EditDeskAssetRailProps {
  readonly activePanel: EditPanelId
  /** 面板飞出来了没有（图标只在飞出时点亮）。 */
  readonly open: boolean
  /** 点图标：同一页再点 = 收回，别的页 = 换页并飞出。 */
  onPanelClick(panel: EditPanelId): void
}

export function EditDeskAssetRail({
  activePanel,
  open,
  onPanelClick,
}: EditDeskAssetRailProps) {
  const t = useTranslations('StudioNode.editDesk')
  return (
    // 暗台左列（v2 关键切片）：一列 56 宽，图标下面一行小字，当前那格抬起一层。
    <nav
      data-testid="edit-desk-rail"
      data-edit-desk-rail
      aria-label={t('panels.title')}
      className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-background pt-3"
    >
      {EDIT_PANELS.map((panel) => {
        const Icon = PANEL_ICONS[panel]
        const active = open && activePanel === panel
        return (
          <button
            key={panel}
            type="button"
            data-testid={`edit-desk-panel-${panel}`}
            aria-label={t(`panels.${panel}`)}
            title={t(`panels.${panel}`)}
            aria-pressed={active}
            onClick={() => onPanelClick(panel)}
            className={cn(
              'grid w-13 justify-items-center gap-0.5 rounded-lg pb-1.5 pt-2 transition-colors duration-fast',
              active
                ? 'bg-card text-foreground'
                : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
            )}
          >
            <Icon className="size-4.5" aria-hidden />
            <span className="w-full truncate text-3xs leading-tight">
              {t(`panels.short.${panel}`)}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

export interface EditDeskAssetPanelProps {
  readonly activePanel: EditPanelId
  readonly assets: readonly NodeV4[]
  /** 画布上的文本卡（「文字」页读它 —— 只读，⛔ 不进时间线）。 */
  readonly textNodes: readonly NodeV4[]
  /** 双击素材 = 追加到对应轨（不想拖的人也有一条路）。 */
  onAppend(nodeId: string): void
  /** 「文字」页顶上那颗：在播放头处落一段字幕。 */
  onAddCaption(): void
  /** 音频页的三档筛 —— 工具条「语音」/「配乐」按它切页并高亮对应轨。 */
  readonly audioFilter: EditAudioFilterId
  onAudioFilterChange(filter: EditAudioFilterId): void
}

export function EditDeskAssetPanel({
  activePanel,
  assets,
  textNodes,
  onAppend,
  onAddCaption,
  audioFilter,
  onAudioFilterChange,
}: EditDeskAssetPanelProps) {
  const t = useTranslations('StudioNode.editDesk')

  const audioAssets = assets.filter(
    (node) =>
      node.data.kind === NODE_MEDIA_KIND_IDS.audio &&
      matchesAudioFilter(node, audioFilter),
  )
  const tiles =
    activePanel === EDIT_PANEL_IDS.canvas
      ? assets
      : activePanel === EDIT_PANEL_IDS.audio
        ? audioAssets
        : null
  const draggablePanel =
    tiles !== null || activePanel === EDIT_PANEL_IDS.library

  return (
    <div
      data-testid="edit-desk-panel"
      style={{ width: EDIT_DESK_LAYOUT.panelWidthPx }}
      className="flex max-h-full flex-col gap-2.5 overflow-y-auto rounded-2xl border border-border bg-card p-3 shadow-float"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">
          {t(`panels.${activePanel}`)}
        </span>
        {draggablePanel ? (
          <span className="text-2xs text-muted-foreground">
            {t('panels.dragHint')}
          </span>
        ) : null}
      </div>

      {activePanel === EDIT_PANEL_IDS.audio ? (
        <AudioFilterTabs value={audioFilter} onChange={onAudioFilterChange} />
      ) : null}

      {tiles ? (
        tiles.length === 0 ? (
          <p className="text-2xs text-muted-foreground">{t('panels.empty')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {tiles.map((node) => (
              <AssetTile key={node.id} node={node} onAppend={onAppend} />
            ))}
          </div>
        )
      ) : activePanel === EDIT_PANEL_IDS.text ? (
        <>
          <button
            type="button"
            data-testid="edit-desk-add-caption"
            onClick={onAddCaption}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-muted text-xs text-foreground transition-colors duration-fast hover:bg-accent"
          >
            <Type className="size-3.5 shrink-0" aria-hidden />
            {t('panels.addCaption')}
          </button>
          {textNodes.length === 0 ? (
            <p className="text-2xs text-muted-foreground">
              {t('panels.textEmpty')}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {textNodes.map((node) => (
                <TextRow key={node.id} node={node} />
              ))}
            </div>
          )}
        </>
      ) : activePanel === EDIT_PANEL_IDS.library ? (
        <EditDeskLibraryPanel />
      ) : (
        <EditDeskTransitionPanel />
      )}
    </div>
  )
}

/** 文本卡一行：名字 + **首行**（画布上写了什么，一眼能对上）。 */
function TextRow({ node }: { readonly node: NodeV4 }) {
  const data = node.data
  const body = data.kind === NODE_MEDIA_KIND_IDS.text ? data.body : ''
  return (
    <div
      data-testid={`edit-desk-text-${node.id}`}
      className="flex flex-col gap-0.5 rounded-lg bg-muted px-2 py-1.5"
    >
      <span className="truncate text-2xs font-medium text-foreground">
        {data.name}
      </span>
      <span className="truncate text-3xs text-muted-foreground">
        {firstLineOf(body)}
      </span>
    </div>
  )
}

/** 正文首行（空正文给一条 em dash，⛔ 不留一格空白让人以为渲染坏了）。 */
function firstLineOf(body: string): string {
  const line = body
    .split('\n')
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0)
  return line ?? '—'
}

function AssetTile({
  node,
  onAppend,
}: {
  readonly node: NodeV4
  onAppend(nodeId: string): void
}) {
  // 源文件删了：退回占位，⛔ 不画裂图（owner 09-28）。
  const thumbs = useBrokenThumbs()
  const data = node.data
  const isAudio = data.kind === NODE_MEDIA_KIND_IDS.audio
  const url = currentUrlOf(node)
  const poster = useVideoPoster(
    isAudio ? undefined : url,
    data.kind === NODE_MEDIA_KIND_IDS.video
      ? data.videoThumbnailUrl
      : undefined,
  )
  const shownPoster = thumbs.usable(poster ?? undefined)
  const duration =
    'durationSec' in data && data.durationSec ? data.durationSec : 0
  const name =
    data.kind === NODE_MEDIA_KIND_IDS.video
      ? (data.label ?? data.name)
      : data.name
  const lift = useAssetLift(
    isAudio ? NODE_MEDIA_KIND_IDS.audio : NODE_MEDIA_KIND_IDS.video,
    duration,
  )

  return (
    <div className="flex flex-col gap-1">
      <div
        role="button"
        tabIndex={0}
        data-testid={`edit-desk-asset-${node.id}`}
        data-node-id={node.id}
        data-lifted={lift.lifted || undefined}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(EDIT_DESK_NODE_DRAG_MIME, node.id)
          // ⚠ 同时写 text/plain：某些浏览器在没有任何标准类型时不启动拖拽。
          event.dataTransfer.setData('text/plain', node.id)
          event.dataTransfer.effectAllowed = 'copy'
          lift.onDragStart(event)
        }}
        onDragEnd={lift.onDragEnd}
        onDoubleClick={() => onAppend(node.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onAppend(node.id)
        }}
        style={{ height: EDIT_DESK_LAYOUT.assetTileHeightPx }}
        className={cn(
          'relative overflow-hidden rounded-lg bg-muted',
          'cursor-grab transition duration-fast active:scale-[.98] motion-reduce:transition-none',
          lift.lifted && 'opacity-40',
        )}
      >
        {isAudio ? (
          // 音频没有画面 —— 一小条波形就是它的「长相」（复用音频卡那一只）。
          <div className="flex size-full items-center justify-center px-2">
            <AudioWaveform
              seed={url ?? node.id}
              barCount={EDIT_DESK_ASSET_WAVE_BARS}
              height={EDIT_DESK_LAYOUT.waveHeightPx}
              className="w-full justify-center"
            />
          </div>
        ) : shownPoster ? (
          // eslint-disable-next-line @next/next/no-img-element -- R2 缩略 / data URL，⛔ 不进 next/image 优化管线
          <img
            src={shownPoster}
            alt=""
            className="size-full object-cover"
            draggable={false}
            onError={() => thumbs.markBroken(shownPoster)}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <FileVideo className="size-4" aria-hidden />
          </div>
        )}
        {duration > 0 ? (
          <span className="canvas-glass absolute bottom-1 right-1 rounded-full px-1.5 text-3xs leading-4 tabular-nums">
            {formatEditDurationShort(duration)}
          </span>
        ) : null}
      </div>
      <span className="truncate text-2xs text-muted-foreground">{name}</span>
    </div>
  )
}

/**
 * 素材格拿起来（样片 AF）：拖着走的图换成放大带影子的那张，主线按它的长短让位；原格子
 * 留在原处变淡，松手（落没落下都算）就回来。
 */
function useAssetLift(kind: EditAssetDrag['kind'], durationSec: number) {
  const [lifted, setLifted] = useState(false)
  return {
    lifted,
    onDragStart(event: React.DragEvent<HTMLElement>) {
      beginEditAssetDrag({
        kind,
        ...(durationSec > 0 ? { durationSec } : {}),
      })
      setLiftedDragImage(event, event.currentTarget)
      setLifted(true)
    },
    onDragEnd() {
      endEditAssetDrag()
      setLifted(false)
    },
  }
}

/**
 * 一张音频卡属不属于当前这一档筛。
 *
 * ⚠ 画布上的音频子型只有 `voice` / `ambience`（`NODE_V4_AUDIO_SUBTYPE_IDS`）——
 * 「配乐 / 音效」在数据上就是**不是语音的那一档**，⛔ 不为这张筛子新造子型。
 */
function matchesAudioFilter(node: NodeV4, filter: EditAudioFilterId): boolean {
  if (filter === EDIT_AUDIO_FILTER_IDS.all) return true
  const isVoice = node.data.subtype === NODE_V4_AUDIO_SUBTYPE_IDS.voice
  return filter === EDIT_AUDIO_FILTER_IDS.voice ? isVoice : !isVoice
}

/** 音频页的三档筛（全部 / 语音 / 配乐）。画板 `.seg`，⛔ 不另画一条。 */
function AudioFilterTabs({
  value,
  onChange,
}: {
  readonly value: EditAudioFilterId
  onChange(filter: EditAudioFilterId): void
}) {
  const t = useTranslations('StudioNode.editDesk')
  return (
    <LiquidSegmented
      ariaLabel={t('panels.audio')}
      semantics="radio"
      fill
      value={value}
      onChange={onChange}
      items={[
        EDIT_AUDIO_FILTER_IDS.all,
        EDIT_AUDIO_FILTER_IDS.voice,
        EDIT_AUDIO_FILTER_IDS.music,
      ].map((filter) => ({
        value: filter,
        label: t(`audioFilters.${filter}`),
      }))}
    />
  )
}

/* ─── 素材库页 ─────────────────────────────────────────────────────────── */

/** 素材库那一档只看视频与音频：时间线上没有第三种段。 */
const LIBRARY_TYPES: readonly OutputTypeValue[] = ['video', 'audio']

/** 产物类型 → 落成哪种卡。⚠ 与外壳素材库同一张判据表，⛔ 不按扩展名猜。 */
function planNodeForOutput(outputType: string): {
  readonly kind: NodeV4Data['kind']
  readonly subtype: NodeV4Data['subtype']
} {
  return outputType === 'VIDEO'
    ? {
        kind: NODE_MEDIA_KIND_IDS.video,
        subtype: NODE_V4_VIDEO_SUBTYPE_IDS.clip,
      }
    : {
        kind: NODE_MEDIA_KIND_IDS.audio,
        subtype: NODE_V4_AUDIO_SUBTYPE_IDS.voice,
      }
}

/**
 * 用户自己的产物，一页一页拉。
 *
 * ⚠ 走 `deferEffectTask`：React 19 的 lint 不允许在 effect 体里同步启动会 setState
 * 的活，与外壳素材库同一套约定（`ShellSidePanels`），⛔ 不在这里另发明一份。
 */
function useEditDeskLibrary(filter: EditDeskLibraryFilterId) {
  const [records, setRecords] = useState<readonly GenerationRecord[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const types: readonly OutputTypeValue[] =
    filter === EDIT_DESK_LIBRARY_FILTER_IDS.all ? LIBRARY_TYPES : [filter]
  const typeKey = types.join(',')

  useEffect(() => {
    let alive = true
    const cancel = deferEffectTask(() => {
      setLoading(true)
      void fetchGalleryImages(page, EDIT_DESK_LIBRARY_PAGE_SIZE, {
        mine: true,
        type: typeKey.split(',') as OutputTypeValue[],
      }).then((response) => {
        if (!alive) return
        setLoading(false)
        if (!response.success || !response.data) return
        const batch = response.data.generations
        setExhausted(batch.length < EDIT_DESK_LIBRARY_PAGE_SIZE)
        // ⚠ 第一页是**替换**、后面的页是**追加**：换了筛之后还接在旧的后面，
        // 用户会看到一屏筛不掉的东西。
        setRecords((current) => (page === 1 ? batch : [...current, ...batch]))
      })
    })
    return () => {
      alive = false
      cancel()
    }
  }, [page, typeKey])

  // 换筛 = 回到第一页（列表由上面那条 effect 换掉）。
  const reset = useCallback(() => {
    setPage(1)
    setExhausted(false)
  }, [])

  return {
    records,
    loading,
    exhausted,
    reset,
    loadMore: useCallback(() => setPage((current) => current + 1), []),
  }
}

function EditDeskLibraryPanel() {
  const t = useTranslations('StudioNode.editDesk')
  const [filter, setFilter] = useState<EditDeskLibraryFilterId>(
    EDIT_DESK_LIBRARY_FILTER_IDS.all,
  )
  const { records, loading, exhausted, reset, loadMore } =
    useEditDeskLibrary(filter)

  return (
    <div className="flex flex-col gap-2.5" data-testid="edit-desk-library">
      <LiquidSegmented
        ariaLabel={t('panels.library')}
        semantics="radio"
        fill
        value={filter}
        onChange={(entry) => {
          setFilter(entry)
          reset()
        }}
        items={[
          EDIT_DESK_LIBRARY_FILTER_IDS.all,
          EDIT_DESK_LIBRARY_FILTER_IDS.video,
          EDIT_DESK_LIBRARY_FILTER_IDS.audio,
        ].map((entry) => ({
          value: entry,
          label: t(`libraryFilters.${entry}`),
        }))}
      />

      {records.length === 0 ? (
        <p className="text-2xs text-muted-foreground">
          {loading ? t('panels.loading') : t('panels.libraryEmpty')}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {records.map((record) => (
            <LibraryTile key={record.id} record={record} />
          ))}
        </div>
      )}

      {records.length > 0 && !exhausted ? (
        <button
          type="button"
          data-testid="edit-desk-library-more"
          disabled={loading}
          onClick={loadMore}
          className="self-center rounded-md px-2 py-1 text-2xs text-muted-foreground transition-colors duration-fast hover:text-foreground disabled:opacity-50 motion-reduce:transition-none"
        >
          {loading ? t('panels.loading') : t('panels.loadMore')}
        </button>
      ) : null}
    </div>
  )
}

/** 素材库一格 —— 与画布素材那一格**同一份长相**（封面 / 波形 · 时长 · 名）。 */
function LibraryTile({ record }: { readonly record: GenerationRecord }) {
  // 源文件删了：退回占位，⛔ 不画裂图（owner 09-28）。
  const thumbs = useBrokenThumbs()
  const plan = planNodeForOutput(record.outputType)
  const isAudio = plan.kind === NODE_MEDIA_KIND_IDS.audio
  const name = resolveGenerationDisplayName(record)
  const duration = record.duration ?? 0
  const poster = useVideoPoster(
    isAudio ? undefined : record.url,
    record.thumbnailUrl ?? undefined,
  )
  const shownPoster = thumbs.usable(poster ?? undefined)
  const payload: EditDeskLibraryAsset = {
    ...plan,
    url: record.url,
    name,
    ...(duration > 0 ? { durationSec: duration } : {}),
    ...(record.thumbnailUrl ? { thumbnailUrl: record.thumbnailUrl } : {}),
  }

  const lift = useAssetLift(
    isAudio ? NODE_MEDIA_KIND_IDS.audio : NODE_MEDIA_KIND_IDS.video,
    duration,
  )

  return (
    <div className="flex flex-col gap-1">
      <div
        data-testid={`edit-desk-library-tile-${record.id}`}
        data-lifted={lift.lifted || undefined}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(
            EDIT_DESK_LIBRARY_DRAG_MIME,
            JSON.stringify(payload),
          )
          event.dataTransfer.effectAllowed = 'copy'
          lift.onDragStart(event)
        }}
        onDragEnd={lift.onDragEnd}
        style={{ height: EDIT_DESK_LAYOUT.assetTileHeightPx }}
        className={cn(
          'relative overflow-hidden rounded-lg bg-muted',
          'cursor-grab transition duration-fast active:scale-[.98] motion-reduce:transition-none',
          lift.lifted && 'opacity-40',
        )}
      >
        {isAudio ? (
          <div className="flex size-full items-center justify-center px-2">
            <AudioWaveform
              seed={record.url}
              barCount={EDIT_DESK_ASSET_WAVE_BARS}
              height={EDIT_DESK_LAYOUT.waveHeightPx}
              className="w-full justify-center"
            />
          </div>
        ) : shownPoster ? (
          // eslint-disable-next-line @next/next/no-img-element -- R2 缩略 / data URL，⛔ 不进 next/image 优化管线
          <img
            src={shownPoster}
            alt=""
            className="size-full object-cover"
            draggable={false}
            onError={() => thumbs.markBroken(shownPoster)}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <FileVideo className="size-4" aria-hidden />
          </div>
        )}
        {duration > 0 ? (
          <span className="canvas-glass absolute bottom-1 right-1 rounded-full px-1.5 text-3xs leading-4 tabular-nums">
            {formatEditDurationShort(duration)}
          </span>
        ) : null}
      </div>
      <span className="truncate text-2xs text-muted-foreground">{name}</span>
    </div>
  )
}

/* ─── 转场页 ───────────────────────────────────────────────────────────── */

/**
 * 六个预设与「无」（5a）。**拖到 V 轨两段之间的缝上**落下 = 设前一段的 `transitionOut`
 * （与右栏「转场 →」同一个字段，⛔ 不另存一份轨道对象）。
 */
function EditDeskTransitionPanel() {
  const t = useTranslations('StudioNode.editDesk')
  return (
    <div
      className="flex flex-col gap-1.5"
      data-testid="edit-desk-transition-panel"
    >
      <p className="text-2xs text-muted-foreground">
        {t('transitionPanel.hint')}
      </p>
      {EDIT_TRANSITIONS.map((transition) => (
        <div
          key={transition}
          data-testid={`edit-desk-transition-preset-${transition}`}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(
              EDIT_DESK_TRANSITION_DRAG_MIME,
              transition,
            )
            event.dataTransfer.effectAllowed = 'copy'
            // 硬切的接缝平时不画：拖着预设时全部亮出来，落点看得见（canvas.css）。
            document.body.dataset.editTransitionDrag = ''
          }}
          onDragEnd={() => {
            delete document.body.dataset.editTransitionDrag
          }}
          className="flex cursor-grab items-center gap-2 rounded-lg bg-muted px-2 py-1.5 transition-transform duration-fast active:scale-[.98] motion-reduce:transition-none"
        >
          {/* 与时间线上的接缝标记同一套长相（5a 改版 A）：转场 = 黑底小块，无 = 一道缝。 */}
          <span
            aria-hidden
            className={cn(
              'grid h-4 w-5 shrink-0 place-items-center rounded-sm',
              transition === EDIT_TRANSITION_IDS.none
                ? 'ring-1 ring-border'
                : 'bg-foreground text-background',
            )}
          >
            {transition === EDIT_TRANSITION_IDS.none ? (
              <span className="h-2.5 w-0.5 rounded-full bg-muted-foreground" />
            ) : (
              <TransitionGlyph className="size-3" />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-2xs text-foreground">
            {t(`inspector.transitions.${transition}`)}
          </span>
        </div>
      ))}
    </div>
  )
}
