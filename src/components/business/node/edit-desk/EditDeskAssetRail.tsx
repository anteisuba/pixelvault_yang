'use client'

/**
 * 左侧 **图标栏 + 236 面板**（画板 `EditDesk.dc.html` 左半）。
 *
 * 图标栏五项：画布素材 / 素材库 / 音频 / 文字 / 转场。
 * - **画布素材** 是唯一一条与时间线数据相通的路（拖进去就是一段）；
 * - **音频** 是画布素材的音频子集（同一批卡，只是省掉在视频里找的那一步）；
 * - **文字** 列画布上的文本卡首行 —— 写「一句话排片」时要照着剧本说话，
 *   ⛔ 它不进时间线（`EditClip` 没有文本段），所以那一格不可拖也不可双击；
 * - **素材库** 是用户自己的产物（`fetchGalleryImages` 的 `mine`），按视频 / 音频筛；
 *   拖进时间线时**先落成一张画布卡**再进轨（⛔ 段不指向素材库记录，见下面那条
 *   MIME 的头注）；
 * - **转场** 列三个预设，拖到 V 轨两段之间的缝上 = 设**前一段**的 `transitionOut`
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
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { CANVAS_SHELL_LAYOUT } from '@/constants/canvas-shell'
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
  type EditTransitionId,
} from '@/constants/edit-desk'
import { RENDER_CROSSFADE_SEC } from '@/constants/render-video'
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
import { Segmented } from './EditDeskInspector'
import { ShellIconButton } from '../workbench-v4/shell/ShellIconButton'

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
  onActivePanelChange(panel: EditPanelId): void
  readonly assets: readonly NodeV4[]
  /** 画布上的文本卡（「文字」页读它 —— 只读，⛔ 不进时间线）。 */
  readonly textNodes: readonly NodeV4[]
  /** 双击素材 = 追加到对应轨（不想拖的人也有一条路）。 */
  onAppend(nodeId: string): void
  /** 音频页的三档筛 —— 工具条「语音」/「配乐」按它切页并高亮对应轨。 */
  readonly audioFilter: EditAudioFilterId
  onAudioFilterChange(filter: EditAudioFilterId): void
}

export function EditDeskAssetRail({
  activePanel,
  onActivePanelChange,
  assets,
  textNodes,
  onAppend,
  audioFilter,
  onAudioFilterChange,
}: EditDeskAssetRailProps) {
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
    <>
      <div
        data-testid="edit-desk-rail"
        style={{ width: CANVAS_SHELL_LAYOUT.railWidthPx }}
        className="flex shrink-0 flex-col items-center gap-1.5 border-r border-border bg-card pt-2"
      >
        {EDIT_PANELS.map((panel) => (
          <ShellIconButton
            key={panel}
            icon={PANEL_ICONS[panel]}
            label={t(`panels.${panel}`)}
            active={activePanel === panel}
            testId={`edit-desk-panel-${panel}`}
            onClick={() => onActivePanelChange(panel)}
          />
        ))}
      </div>

      <div
        data-testid="edit-desk-panel"
        style={{ width: EDIT_DESK_LAYOUT.panelWidthPx }}
        className="flex shrink-0 flex-col gap-2.5 overflow-y-auto border-r border-border bg-card p-3"
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
            <p className="text-2xs text-muted-foreground">
              {t('panels.empty')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {tiles.map((node) => (
                <AssetTile key={node.id} node={node} onAppend={onAppend} />
              ))}
            </div>
          )
        ) : activePanel === EDIT_PANEL_IDS.text ? (
          textNodes.length === 0 ? (
            <p className="text-2xs text-muted-foreground">
              {t('panels.textEmpty')}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {textNodes.map((node) => (
                <TextRow key={node.id} node={node} />
              ))}
            </div>
          )
        ) : activePanel === EDIT_PANEL_IDS.library ? (
          <EditDeskLibraryPanel />
        ) : (
          <EditDeskTransitionPanel />
        )}
      </div>
    </>
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
  const data = node.data
  const isAudio = data.kind === NODE_MEDIA_KIND_IDS.audio
  const url = currentUrlOf(node)
  const poster = useVideoPoster(
    isAudio ? undefined : url,
    data.kind === NODE_MEDIA_KIND_IDS.video
      ? data.videoThumbnailUrl
      : undefined,
  )
  const duration =
    'durationSec' in data && data.durationSec ? data.durationSec : 0
  const name =
    data.kind === NODE_MEDIA_KIND_IDS.video
      ? (data.label ?? data.name)
      : data.name

  return (
    <div className="flex flex-col gap-1">
      <div
        role="button"
        tabIndex={0}
        data-testid={`edit-desk-asset-${node.id}`}
        data-node-id={node.id}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(EDIT_DESK_NODE_DRAG_MIME, node.id)
          // ⚠ 同时写 text/plain：某些浏览器在没有任何标准类型时不启动拖拽。
          event.dataTransfer.setData('text/plain', node.id)
          event.dataTransfer.effectAllowed = 'copy'
        }}
        onDoubleClick={() => onAppend(node.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onAppend(node.id)
        }}
        style={{ height: EDIT_DESK_LAYOUT.assetTileHeightPx }}
        className={cn(
          'relative overflow-hidden rounded-lg bg-muted',
          'cursor-grab transition-transform duration-fast active:scale-[.98] motion-reduce:transition-none',
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
        ) : poster ? (
          // eslint-disable-next-line @next/next/no-img-element -- R2 缩略 / data URL，⛔ 不进 next/image 优化管线
          <img
            src={poster}
            alt=""
            className="size-full object-cover"
            draggable={false}
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
    <Segmented
      testId="edit-desk-audio-filter"
      options={[
        EDIT_AUDIO_FILTER_IDS.all,
        EDIT_AUDIO_FILTER_IDS.voice,
        EDIT_AUDIO_FILTER_IDS.music,
      ].map((filter) => ({
        id: filter,
        label: t(`audioFilters.${filter}`),
        active: value === filter,
        onSelect: () => onChange(filter),
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
        includeTotal: false,
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
      <Segmented
        testId="edit-desk-library-filter"
        options={[
          EDIT_DESK_LIBRARY_FILTER_IDS.all,
          EDIT_DESK_LIBRARY_FILTER_IDS.video,
          EDIT_DESK_LIBRARY_FILTER_IDS.audio,
        ].map((entry) => ({
          id: entry,
          label: t(`libraryFilters.${entry}`),
          active: filter === entry,
          onSelect: () => {
            setFilter(entry)
            reset()
          },
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
  const plan = planNodeForOutput(record.outputType)
  const isAudio = plan.kind === NODE_MEDIA_KIND_IDS.audio
  const name = resolveGenerationDisplayName(record)
  const duration = record.duration ?? 0
  const poster = useVideoPoster(
    isAudio ? undefined : record.url,
    record.thumbnailUrl ?? undefined,
  )
  const payload: EditDeskLibraryAsset = {
    ...plan,
    url: record.url,
    name,
    ...(duration > 0 ? { durationSec: duration } : {}),
    ...(record.thumbnailUrl ? { thumbnailUrl: record.thumbnailUrl } : {}),
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        data-testid={`edit-desk-library-tile-${record.id}`}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(
            EDIT_DESK_LIBRARY_DRAG_MIME,
            JSON.stringify(payload),
          )
          event.dataTransfer.effectAllowed = 'copy'
        }}
        style={{ height: EDIT_DESK_LAYOUT.assetTileHeightPx }}
        className={cn(
          'relative overflow-hidden rounded-lg bg-muted',
          'cursor-grab transition-transform duration-fast active:scale-[.98] motion-reduce:transition-none',
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
        ) : poster ? (
          // eslint-disable-next-line @next/next/no-img-element -- R2 缩略 / data URL，⛔ 不进 next/image 优化管线
          <img
            src={poster}
            alt=""
            className="size-full object-cover"
            draggable={false}
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
 * 三个预设。**拖到 V 轨两段之间的缝上**落下 = 设前一段的 `transitionOut`
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
          }}
          className="flex cursor-grab items-center gap-2 rounded-lg bg-muted px-2 py-1.5 transition-transform duration-fast active:scale-[.98] motion-reduce:transition-none"
        >
          <span
            aria-hidden
            style={{
              width: EDIT_DESK_LAYOUT.transitionMarkPx,
              height: EDIT_DESK_LAYOUT.transitionMarkPx,
            }}
            className={cn(
              'shrink-0 rotate-45 rounded-[2px]',
              transition === EDIT_TRANSITION_IDS.none
                ? 'border-[1.5px] border-foreground'
                : 'bg-foreground',
            )}
          />
          <span className="min-w-0 flex-1 truncate text-2xs text-foreground">
            {t(`inspector.transitions.${transition}`)}
          </span>
          {transition === EDIT_TRANSITION_IDS.crossfade ? (
            <span className="shrink-0 text-3xs tabular-nums text-muted-foreground">
              {t('transitionPanel.duration', {
                seconds: crossfadeLabel(transition),
              })}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/**
 * 叠化的时长档。⚠ 只有**一档**（`RENDER_CROSSFADE_SEC`）——渲染层今天就按这个数
 * 跑 xfade，⛔ 不在面板上摆一排选了也不会被用上的秒数。
 */
function crossfadeLabel(transition: EditTransitionId): string {
  return transition === EDIT_TRANSITION_IDS.crossfade
    ? String(RENDER_CROSSFADE_SEC)
    : '0'
}
