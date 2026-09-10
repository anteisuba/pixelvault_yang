'use client'

/**
 * 左侧 **图标栏 + 236 面板**（画板 `EditDesk.dc.html` 左半）。
 *
 * 图标栏五项：画布素材 / 素材库 / 音频 / 文字 / 转场。
 * - **画布素材** 是唯一一条与时间线数据相通的路（拖进去就是一段）；
 * - **音频** 是画布素材的音频子集（同一批卡，只是省掉在视频里找的那一步）；
 * - **文字** 列画布上的文本卡首行 —— 写「一句话排片」时要照着剧本说话，
 *   ⛔ 它不进时间线（`EditClip` 没有文本段），所以那一格不可拖也不可双击；
 * - **素材库 / 转场** 还没有来源，给一句「还没接上」而不是一个点了没反应的图标。
 *
 * ── 每一格都必须**看得见内容**（owner 真机 2026-09-10）───────────────────
 * 一格纯灰底加一个图标，用户在六张卡里认不出哪张是哪张。所以：
 * 视频 = 封面帧（有 `videoThumbnailUrl` 用它，没有就客户端抓首帧一次并缓存）·
 * 音频 = 一小条波形（复用音频卡那一只，⛔ 不另画）· 文本 = 首行。
 *
 * ⚠ 拖投载荷带的是**节点 id**（`EDIT_DESK_NODE_DRAG_MIME`），不是 url：段永远
 * 指向一张卡。理由写在那个常量上。
 */

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
  EDIT_DESK_LAYOUT,
  EDIT_DESK_NODE_DRAG_MIME,
  EDIT_PANELS,
  EDIT_PANEL_IDS,
  EDIT_DESK_ASSET_WAVE_BARS,
  type EditPanelId,
} from '@/constants/edit-desk'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { currentUrlOf, formatEditDurationShort } from '@/lib/edit-project'
import { cn } from '@/lib/utils'
import { useVideoPoster } from '@/hooks/node/use-video-poster'
import type { NodeV4 } from '@/types/node-workflow'

import { AudioWaveform } from '../nodes/v4/audio/AudioWaveform'
import { ShellIconButton } from '../workbench-v4/shell/ShellIconButton'

const PANEL_ICONS: Record<EditPanelId, LucideIcon> = {
  [EDIT_PANEL_IDS.canvas]: Layers,
  [EDIT_PANEL_IDS.library]: FileVideo,
  [EDIT_PANEL_IDS.audio]: Music,
  [EDIT_PANEL_IDS.text]: Type,
  [EDIT_PANEL_IDS.transition]: Shuffle,
}

export interface EditDeskAssetRailProps {
  readonly activePanel: EditPanelId
  onActivePanelChange(panel: EditPanelId): void
  readonly assets: readonly NodeV4[]
  /** 画布上的文本卡（「文字」页读它 —— 只读，⛔ 不进时间线）。 */
  readonly textNodes: readonly NodeV4[]
  /** 双击素材 = 追加到对应轨（不想拖的人也有一条路）。 */
  onAppend(nodeId: string): void
}

export function EditDeskAssetRail({
  activePanel,
  onActivePanelChange,
  assets,
  textNodes,
  onAppend,
}: EditDeskAssetRailProps) {
  const t = useTranslations('StudioNode.editDesk')

  const audioAssets = assets.filter(
    (node) => node.data.kind === NODE_MEDIA_KIND_IDS.audio,
  )
  const tiles =
    activePanel === EDIT_PANEL_IDS.canvas
      ? assets
      : activePanel === EDIT_PANEL_IDS.audio
        ? audioAssets
        : null

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
          {tiles ? (
            <span className="text-2xs text-muted-foreground">
              {t('panels.dragHint')}
            </span>
          ) : null}
        </div>

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
        ) : (
          <p
            data-testid="edit-desk-panel-todo"
            className="text-2xs text-muted-foreground"
          >
            {t('panels.todo')}
          </p>
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
