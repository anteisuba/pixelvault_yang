'use client'

/**
 * 左侧 44px 玻璃图标栏 + 264 宽浮起面板（S7 §7 左侧 · 画板 `ChromePanels{,2}.dc.html`）。
 *
 * ⚠ 面板**浮在画布上**，⛔ 不挤画布：它是 `absolute` 的兄弟，画布几何不因为开合
 * 而变（与助手 dock 同一条「覆盖，不挤压」）。再点同一个图标 = 收起。
 *
 * 四个面板各自只做「列出来 + 交出去」：
 * · 节点一览 → 复用 `CastDock`（搜索 + 四类分组 + 缩略/名/子型/引用数 + `focusNode`），
 *   ⛔ 不再写第二个定位器。
 * · 角色 / 风格卡 → `useContextCards()`，拖进画布或在提示词里 `@`。
 * · 素材库 → `fetchGalleryImages` 的用户上传那一档，按类型筛。
 * · 历史 → 最近的生成记录，拖回画布。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FolderOpen,
  History,
  ListTree,
  PanelLeftClose,
  UserRound,
} from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import {
  CANVAS_SHELL_LAYOUT,
  CANVAS_SHELL_LIBRARY_FILTER_IDS,
  CANVAS_SHELL_LIST_PAGE_SIZE,
  CANVAS_SHELL_MEDIA_DRAG_MIME,
  CANVAS_SHELL_PANELS,
  CANVAS_SHELL_PANEL_IDS,
  type CanvasShellLibraryFilter,
  type CanvasShellPanelId,
} from '@/constants/canvas-shell'
import { CONTEXT_CARD_KIND_IDS } from '@/constants/context-cards'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_AUDIO_SUBTYPE_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { useContextCards } from '@/hooks/use-context-cards'
import { fetchGalleryImages } from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import { resolveGenerationDisplayName } from '@/lib/generation-name'
import { cn } from '@/lib/utils'
import type { GenerationRecord, OutputTypeValue } from '@/types'
import type { NodeV4Data } from '@/types/node-workflow'

import { CastDock } from '../../CastDock'
import { ShellIconButton } from './ShellIconButton'

const PANEL_ICONS = {
  [CANVAS_SHELL_PANEL_IDS.nodes]: ListTree,
  [CANVAS_SHELL_PANEL_IDS.cards]: UserRound,
  [CANVAS_SHELL_PANEL_IDS.library]: FolderOpen,
  [CANVAS_SHELL_PANEL_IDS.history]: History,
} as const

/** 产物类型 → 落成哪种节点。⚠ 与文件落物同一张判据表，⛔ 不按扩展名猜。 */
function planNodeForOutput(outputType: string): {
  readonly kind: NodeV4Data['kind']
  readonly subtype: NodeV4Data['subtype']
} {
  if (outputType === 'VIDEO') {
    return {
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.clip,
    }
  }
  if (outputType === 'AUDIO') {
    return {
      kind: NODE_MEDIA_KIND_IDS.audio,
      subtype: NODE_V4_AUDIO_SUBTYPE_IDS.voice,
    }
  }
  return {
    kind: NODE_MEDIA_KIND_IDS.image,
    subtype: NODE_V4_IMAGE_SUBTYPE_IDS.result,
  }
}

const OUTPUT_TYPE_BY_FILTER: Record<
  CanvasShellLibraryFilter,
  readonly OutputTypeValue[]
> = {
  [CANVAS_SHELL_LIBRARY_FILTER_IDS.all]: [],
  [CANVAS_SHELL_LIBRARY_FILTER_IDS.image]: ['image'],
  [CANVAS_SHELL_LIBRARY_FILTER_IDS.video]: ['video'],
  [CANVAS_SHELL_LIBRARY_FILTER_IDS.audio]: ['audio'],
}

/** 拖投载荷 —— 一处生成，两个面板共用。 */
function mediaDragProps(payload: {
  kind: NodeV4Data['kind']
  subtype: NodeV4Data['subtype']
  url: string
  name: string
}) {
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData(
        CANVAS_SHELL_MEDIA_DRAG_MIME,
        JSON.stringify(payload),
      )
      event.dataTransfer.effectAllowed = 'copy'
    },
  }
}

/** 一次拉取用户最近的产物。素材库与历史两个面板共用一条读法。 */
function useRecentGenerations(options: {
  readonly enabled: boolean
  readonly types: readonly OutputTypeValue[]
  readonly uploadsOnly: boolean
}) {
  const { enabled, types, uploadsOnly } = options
  const [records, setRecords] = useState<readonly GenerationRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const typeKey = types.join(',')

  useEffect(() => {
    if (!enabled) return
    let alive = true
    // ⚠ 走 `deferEffectTask`：React 19 的 lint 不允许在 effect 体里同步启动会
    // setState 的活（`react-hooks/set-state-in-effect`），与 `use-context-cards`
    // 同一套约定，⛔ 别在这里另发明一份。
    const cancel = deferEffectTask(() => {
      setIsLoading(true)
      void fetchGalleryImages(1, CANVAS_SHELL_LIST_PAGE_SIZE, {
        mine: true,
        includeTotal: false,
        ...(typeKey ? { type: typeKey.split(',') as OutputTypeValue[] } : {}),
        ...(uploadsOnly ? { provider: 'user-upload' } : {}),
      }).then((response) => {
        if (!alive) return
        setIsLoading(false)
        if (response.success && response.data) {
          setRecords(response.data.generations)
        }
      })
    })
    return () => {
      alive = false
      cancel()
    }
  }, [enabled, typeKey, uploadsOnly])

  return { records, isLoading }
}

interface ShellPanelFrameProps {
  readonly title: string
  readonly hint?: string
  onClose(): void
  readonly children: React.ReactNode
}

function ShellPanelFrame({
  title,
  hint,
  onClose,
  children,
}: ShellPanelFrameProps) {
  const t = useTranslations('StudioNode.shell.panels')
  return (
    <>
      <div className="flex h-9 shrink-0 items-center gap-2 px-2">
        <span className="min-w-0 flex-1 truncate text-node-foreground canvas-panel-title">
          {title}
        </span>
        {hint ? (
          <span className="shrink-0 text-2xs text-node-muted">{hint}</span>
        ) : null}
        <button
          type="button"
          aria-label={t('close')}
          title={t('close')}
          onClick={onClose}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-node-muted transition-colors hover:text-node-foreground"
        >
          <PanelLeftClose className="size-3.5" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </>
  )
}

function ShellCardsPanel() {
  const t = useTranslations('StudioNode.shell.panels')
  const { cards, isLoading } = useContextCards()
  const groups = useMemo(
    () => [
      {
        id: CONTEXT_CARD_KIND_IDS.character,
        label: t('cardsCharacters'),
        cards: cards.filter(
          (card) => card.kind === CONTEXT_CARD_KIND_IDS.character,
        ),
      },
      {
        id: CONTEXT_CARD_KIND_IDS.style,
        label: t('cardsStyles'),
        cards: cards.filter(
          (card) => card.kind === CONTEXT_CARD_KIND_IDS.style,
        ),
      },
    ],
    [cards, t],
  )

  if (isLoading && cards.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-node-muted">
        {t('loading')}
      </p>
    )
  }
  if (cards.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-node-muted">
        {t('empty')}
      </p>
    )
  }

  return (
    <div
      className="flex flex-col gap-1 px-1 pb-2"
      data-testid="shell-cards-panel"
    >
      {groups.map((group) =>
        group.cards.length === 0 ? null : (
          <section key={group.id}>
            <h3 className="px-2 pb-1 pt-2 text-2xs text-node-muted">
              {group.label}
            </h3>
            {group.cards.map((card) => {
              const url = card.images[0]?.url
              return (
                <div
                  key={card.id}
                  data-testid="shell-card-row"
                  style={{ height: CANVAS_SHELL_LAYOUT.nodeRowHeightPx }}
                  className="flex cursor-grab items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-node-panel-inner"
                  {...(url
                    ? mediaDragProps({
                        kind: NODE_MEDIA_KIND_IDS.image,
                        subtype:
                          card.kind === CONTEXT_CARD_KIND_IDS.character
                            ? NODE_V4_IMAGE_SUBTYPE_IDS.character
                            : NODE_V4_IMAGE_SUBTYPE_IDS.background,
                        url,
                        name: card.name,
                      })
                    : {})}
                >
                  <span
                    aria-hidden
                    style={{
                      width: CANVAS_SHELL_LAYOUT.nodeThumbWidthPx,
                      height: CANVAS_SHELL_LAYOUT.nodeThumbHeightPx,
                    }}
                    className="shrink-0 overflow-hidden rounded-md bg-node-panel-soft"
                  >
                    {url ? (
                      // R2 上的任意用户媒体，与引用 chip 同一条 raw-img 约定。
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs text-node-foreground">
                      {card.name}
                    </span>
                    <span className="truncate text-2xs text-node-muted">
                      {card.summary}
                    </span>
                  </span>
                  <kbd className="shrink-0 rounded border border-node-panel-inner px-1 text-2xs text-node-muted">
                    @
                  </kbd>
                </div>
              )
            })}
          </section>
        ),
      )}
      <p className="px-2 pt-2 text-2xs text-node-muted">{t('cardsHint')}</p>
    </div>
  )
}

function ShellLibraryPanel({ onUpload }: { onUpload(): void }) {
  const t = useTranslations('StudioNode.shell.panels')
  const [filter, setFilter] = useState<CanvasShellLibraryFilter>(
    CANVAS_SHELL_LIBRARY_FILTER_IDS.all,
  )
  const { records, isLoading } = useRecentGenerations({
    enabled: true,
    types: OUTPUT_TYPE_BY_FILTER[filter],
    uploadsOnly: true,
  })

  const filters = [
    { id: CANVAS_SHELL_LIBRARY_FILTER_IDS.all, label: t('libraryAll') },
    { id: CANVAS_SHELL_LIBRARY_FILTER_IDS.image, label: t('libraryImage') },
    { id: CANVAS_SHELL_LIBRARY_FILTER_IDS.video, label: t('libraryVideo') },
    { id: CANVAS_SHELL_LIBRARY_FILTER_IDS.audio, label: t('libraryAudio') },
  ] as const

  return (
    <div
      className="flex flex-col gap-2 px-2 pb-2"
      data-testid="shell-library-panel"
    >
      <button
        type="button"
        data-testid="shell-library-upload"
        onClick={onUpload}
        className="self-start px-1 text-2xs text-node-muted transition-colors hover:text-node-foreground"
      >
        {t('libraryHint')}
      </button>
      <div className="flex gap-0.5 self-start rounded-lg bg-node-panel-inner p-0.5">
        {filters.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setFilter(entry.id)}
            aria-pressed={filter === entry.id}
            className={cn(
              'rounded-md px-2 py-1 text-2xs transition-colors',
              filter === entry.id
                ? 'bg-node-panel text-node-foreground'
                : 'text-node-muted hover:text-node-foreground',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {isLoading && records.length === 0 ? (
        <p className="py-6 text-center text-xs text-node-muted">
          {t('loading')}
        </p>
      ) : records.length === 0 ? (
        <p className="py-6 text-center text-xs text-node-muted">{t('empty')}</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {records.map((record) => {
            const plan = planNodeForOutput(record.outputType)
            return (
              <div
                key={record.id}
                data-testid="shell-library-tile"
                className="aspect-square cursor-grab overflow-hidden rounded-lg bg-node-panel-soft"
                {...mediaDragProps({
                  ...plan,
                  url: record.url,
                  name: resolveGenerationDisplayName(record),
                })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={record.thumbnailUrl ?? record.url}
                  alt=""
                  className="size-full object-cover"
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ShellHistoryPanel() {
  const t = useTranslations('StudioNode.shell.panels')
  const format = useFormatter()
  /**
   * `relativeTime` 的**参照时刻**。⚠ 不传 `now`，next-intl 退回全局默认值并且每渲染
   * 一行就往 console 甩一条 `ENVIRONMENT_FALLBACK`（真机实测一屏 30 多条）。取一次
   * 存住 —— 这是弹开看一眼的列表，⛔ 不为它上一个每秒走的钟。
   */
  const [now] = useState(() => new Date())
  const { records, isLoading } = useRecentGenerations({
    enabled: true,
    types: [],
    uploadsOnly: false,
  })

  if (isLoading && records.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-node-muted">
        {t('loading')}
      </p>
    )
  }
  if (records.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-node-muted">
        {t('empty')}
      </p>
    )
  }

  return (
    <div className="flex flex-col px-1 pb-2" data-testid="shell-history-panel">
      {records.map((record) => {
        const plan = planNodeForOutput(record.outputType)
        return (
          <div
            key={record.id}
            data-testid="shell-history-row"
            style={{ height: CANVAS_SHELL_LAYOUT.nodeRowHeightPx }}
            className="flex cursor-grab items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-node-panel-inner"
            {...mediaDragProps({
              ...plan,
              url: record.url,
              name: resolveGenerationDisplayName(record),
            })}
          >
            <span
              aria-hidden
              style={{
                width: CANVAS_SHELL_LAYOUT.nodeThumbWidthPx,
                height: CANVAS_SHELL_LAYOUT.nodeThumbHeightPx,
              }}
              className="shrink-0 overflow-hidden rounded-md bg-node-panel-soft"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={record.thumbnailUrl ?? record.url}
                alt=""
                className="size-full object-cover"
              />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs text-node-foreground">
                {resolveGenerationDisplayName(record)}
              </span>
              <span className="truncate text-2xs text-node-muted">
                {format.relativeTime(new Date(record.createdAt), now)}
                {' · '}
                {record.model}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export interface ShellSidePanelsProps {
  /** `null` = 四个面板都收着（只剩图标栏）。 */
  readonly activePanel: CanvasShellPanelId | null
  onActivePanelChange(panel: CanvasShellPanelId | null): void
  /** 节点一览的搜索词（与 ⌘K 同一份词，⛔ 不各存一份）。 */
  readonly nodeQuery: string
  onNodeQueryChange(value: string): void
  /** 素材库面板的「上传」—— 弹系统文件选择器，落法与拖入同一条。 */
  onUpload(): void
}

export function ShellSidePanels({
  activePanel,
  onActivePanelChange,
  nodeQuery,
  onNodeQueryChange,
  onUpload,
}: ShellSidePanelsProps) {
  const t = useTranslations('StudioNode.shell.panels')
  const close = useCallback(
    () => onActivePanelChange(null),
    [onActivePanelChange],
  )

  const titleByPanel: Record<CanvasShellPanelId, string> = {
    [CANVAS_SHELL_PANEL_IDS.nodes]: t('nodes'),
    [CANVAS_SHELL_PANEL_IDS.cards]: t('cards'),
    [CANVAS_SHELL_PANEL_IDS.library]: t('library'),
    [CANVAS_SHELL_PANEL_IDS.history]: t('history'),
  }
  const hintByPanel: Partial<Record<CanvasShellPanelId, string>> = {
    [CANVAS_SHELL_PANEL_IDS.history]: t('historyHint'),
  }

  return (
    <>
      <div
        data-testid="shell-side-rail"
        style={{
          top: `calc(var(--canvas-topbar-h) + ${CANVAS_SHELL_LAYOUT.edgeInsetPx}px)`,
          left: CANVAS_SHELL_LAYOUT.edgeInsetPx,
          width: CANVAS_SHELL_LAYOUT.railWidthPx,
          borderRadius: CANVAS_SHELL_LAYOUT.glassRadiusPx,
        }}
        className="canvas-glass pointer-events-auto absolute z-canvas-chrome hidden flex-col gap-0.5 p-1 md:flex"
      >
        {CANVAS_SHELL_PANELS.map((panel) => (
          <ShellIconButton
            key={panel}
            icon={PANEL_ICONS[panel]}
            label={titleByPanel[panel]}
            testId={`shell-rail-${panel}`}
            active={activePanel === panel}
            onClick={() =>
              onActivePanelChange(activePanel === panel ? null : panel)
            }
          />
        ))}
      </div>

      {activePanel === null ? null : (
        <div
          data-testid="shell-side-panel"
          data-panel={activePanel}
          style={{
            top: `calc(var(--canvas-topbar-h) + ${CANVAS_SHELL_LAYOUT.edgeInsetPx}px)`,
            left:
              CANVAS_SHELL_LAYOUT.edgeInsetPx +
              CANVAS_SHELL_LAYOUT.railWidthPx +
              CANVAS_SHELL_LAYOUT.panelGapPx,
            bottom: CANVAS_SHELL_LAYOUT.edgeInsetPx,
            width: CANVAS_SHELL_LAYOUT.panelWidthPx,
            borderRadius: CANVAS_SHELL_LAYOUT.glassRadiusPx,
          }}
          className="canvas-glass pointer-events-auto absolute z-canvas-chrome hidden flex-col overflow-hidden p-1.5 md:flex"
        >
          <ShellPanelFrame
            title={titleByPanel[activePanel]}
            {...(hintByPanel[activePanel]
              ? { hint: hintByPanel[activePanel] }
              : {})}
            onClose={close}
          >
            {activePanel === CANVAS_SHELL_PANEL_IDS.nodes ? (
              <CastDock query={nodeQuery} onQueryChange={onNodeQueryChange} />
            ) : activePanel === CANVAS_SHELL_PANEL_IDS.cards ? (
              <ShellCardsPanel />
            ) : activePanel === CANVAS_SHELL_PANEL_IDS.library ? (
              <ShellLibraryPanel onUpload={onUpload} />
            ) : (
              <ShellHistoryPanel />
            )}
          </ShellPanelFrame>
        </div>
      )}
    </>
  )
}
