'use client'

/**
 * 左侧 **图标栏 + 236 面板**（画板 `EditDesk.dc.html` 左半）。
 *
 * 图标栏五项：画布素材 / 素材库 / 音频 / 文字 / 转场。本片只做**画布素材**——
 * 它是唯一一条与时间线数据相通的路（拖进去就是一段）；其余四项在 S9 / S10 接上
 * 各自的来源，现在给一句「还没接上」而不是四个点了没反应的图标。
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
  type EditPanelId,
} from '@/constants/edit-desk'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { formatEditDurationShort } from '@/lib/edit-project'
import { cn } from '@/lib/utils'
import type { NodeV4 } from '@/types/node-workflow'

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
  /** 双击素材 = 追加到对应轨（不想拖的人也有一条路）。 */
  onAppend(nodeId: string): void
}

export function EditDeskAssetRail({
  activePanel,
  onActivePanelChange,
  assets,
  onAppend,
}: EditDeskAssetRailProps) {
  const t = useTranslations('StudioNode.editDesk')

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
          {activePanel === EDIT_PANEL_IDS.canvas ? (
            <span className="text-2xs text-muted-foreground">
              {t('panels.dragHint')}
            </span>
          ) : null}
        </div>

        {activePanel === EDIT_PANEL_IDS.canvas ? (
          assets.length === 0 ? (
            <p className="text-2xs text-muted-foreground">
              {t('panels.empty')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {assets.map((node) => (
                <AssetTile key={node.id} node={node} onAppend={onAppend} />
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

function AssetTile({
  node,
  onAppend,
}: {
  readonly node: NodeV4
  onAppend(nodeId: string): void
}) {
  const data = node.data
  const isAudio = data.kind === NODE_MEDIA_KIND_IDS.audio
  const poster =
    data.kind === NODE_MEDIA_KIND_IDS.video ? data.videoThumbnailUrl : undefined
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
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element -- R2 缩略，⛔ 不进 next/image 优化管线
          <img
            src={poster}
            alt=""
            className="size-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            {isAudio ? (
              <Music className="size-4" aria-hidden />
            ) : (
              <FileVideo className="size-4" aria-hidden />
            )}
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
