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
 * · 素材库 → `fetchGalleryImages` 的用户上传那一档，按类型筛、一页一页往下翻。
 * · 历史 → 最近的生成记录，拖回画布。
 *
 * ⚠ 三个列表面板落卡都有**两只手**：拖进画布，或**点一下**落到视口中央。后者不是
 * 冗余 —— 触屏上根本没有 `dragstart`，桌面上从缩略图起手的拖拽也常被浏览器接管成
 * 「拖一张图片」（owner 2026-09-12 真机：素材拖不进画布）。
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
import { useGalleryRevision } from '@/lib/gallery-revision'
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

/** 面板里一格素材的身份 —— 拖投与点击落卡带的是同一份。 */
interface ShellMediaPayload {
  readonly kind: NodeV4Data['kind']
  readonly subtype: NodeV4Data['subtype']
  readonly url: string
  readonly name: string
  /** 真实像素 —— 卡靠它算自己的高，不给就退回 16:9 把竖图裁成横的。 */
  readonly width?: number
  readonly height?: number
}

/**
 * 拖起来时**不画那张小图**（owner 2026-09-12：「图片移动的时候出现的这个小图删掉」）。
 *
 * ⚠ 浏览器的默认拖影是源元素的截图，跟着光标飘在画布上，与卡片本身的落点提示是
 * 两套语言。给它一张 1×1 透明图就没了。⛔ 不能传一个没进 DOM 的元素：那在
 * Chrome 里会被忽略、拖影照旧。
 */
let transparentGhost: HTMLImageElement | null = null
function dragGhost(): HTMLImageElement | null {
  if (typeof window === 'undefined') return null
  if (!transparentGhost) {
    const image = new window.Image()
    image.src =
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    transparentGhost = image
  }
  return transparentGhost
}

/** 落卡的两只手 —— 三个面板共用。 */
function mediaTileProps(
  payload: ShellMediaPayload,
  onPlace: (payload: ShellMediaPayload) => void,
) {
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData(
        CANVAS_SHELL_MEDIA_DRAG_MIME,
        JSON.stringify(payload),
      )
      event.dataTransfer.effectAllowed = 'copy'
      const ghost = dragGhost()
      if (ghost) event.dataTransfer.setDragImage(ghost, 0, 0)
    },
    onClick: () => onPlace(payload),
    // 挂了 onClick 的 div 就得当按钮用（角色 / 焦点 / 回车空格），
    // ⛔ 不留一个只有鼠标点得动的东西。
    role: 'button' as const,
    tabIndex: 0,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      onPlace(payload)
    },
  }
}

/**
 * 用户最近的产物，**一页一页**拉。素材库与历史两个面板共用一条读法。
 *
 * ⚠ 翻页是 owner 2026-09-12 的真机结论：只拉第一页时列表到底就没了，用户以为
 * 「素材库只有这些」。追加的判据用服务端的 `hasMore`，⛔ 不拿「这一批够不够一页」
 * 猜（最后一页恰好满页时会多出一次空拉）。
 *
 * ⚠ `resetKey` 一变就**回到第一页、清空列表**：换筛之后还接在旧的后面，用户会看到
 * 一屏筛不掉的东西；库变了（`useGalleryRevision`）之后原地追加则会把同一批接两遍。
 * 这里用的是 React 官方的「渲染中调整 state」，⛔ 不为它再写一个会触发 lint 的
 * reset effect。
 */
function useRecentGenerations(options: {
  readonly types: readonly OutputTypeValue[]
  readonly uploadsOnly: boolean
}) {
  const { types, uploadsOnly } = options
  const revision = useGalleryRevision()
  const typeKey = types.join(',')
  const resetKey = `${typeKey}|${String(uploadsOnly)}|${String(revision)}`

  const [records, setRecords] = useState<readonly GenerationRecord[]>([])
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [lastResetKey, setLastResetKey] = useState(resetKey)

  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey)
    setPage(1)
    setRecords([])
    setExhausted(false)
  }

  useEffect(() => {
    let alive = true
    // ⚠ 走 `deferEffectTask`：React 19 的 lint 不允许在 effect 体里同步启动会
    // setState 的活（`react-hooks/set-state-in-effect`），与 `use-context-cards`
    // 同一套约定，⛔ 别在这里另发明一份。
    const cancel = deferEffectTask(() => {
      setIsLoading(true)
      void fetchGalleryImages(page, CANVAS_SHELL_LIST_PAGE_SIZE, {
        mine: true,
        ...(typeKey ? { type: typeKey.split(',') as OutputTypeValue[] } : {}),
        ...(uploadsOnly ? { provider: 'user-upload' } : {}),
      }).then((response) => {
        if (!alive) return
        setIsLoading(false)
        if (!response.success || !response.data) return
        const batch = response.data.generations
        setExhausted(!response.data.hasMore)
        setRecords((current) => (page === 1 ? batch : [...current, ...batch]))
      })
    })
    return () => {
      alive = false
      cancel()
    }
  }, [page, resetKey, typeKey, uploadsOnly])

  return {
    records,
    isLoading,
    exhausted,
    loadMore: useCallback(() => setPage((current) => current + 1), []),
  }
}

/** 列表底部那颗「加载更多」—— 素材库与历史同一颗。 */
function ShellLoadMore({
  visible,
  isLoading,
  onLoadMore,
  testId,
}: {
  readonly visible: boolean
  readonly isLoading: boolean
  onLoadMore(): void
  readonly testId: string
}) {
  const t = useTranslations('StudioNode.shell.panels')
  if (!visible) return null
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={isLoading}
      onClick={onLoadMore}
      className="mt-1 self-center rounded-md px-2 py-1 text-2xs text-node-muted transition-colors hover:text-node-foreground disabled:opacity-50"
    >
      {isLoading ? t('loading') : t('loadMore')}
    </button>
  )
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

function ShellCardsPanel({
  onPlace,
}: {
  onPlace(payload: ShellMediaPayload): void
}) {
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
                    ? mediaTileProps(
                        {
                          kind: NODE_MEDIA_KIND_IDS.image,
                          subtype:
                            card.kind === CONTEXT_CARD_KIND_IDS.character
                              ? NODE_V4_IMAGE_SUBTYPE_IDS.character
                              : NODE_V4_IMAGE_SUBTYPE_IDS.background,
                          url,
                          name: card.name,
                        },
                        onPlace,
                      )
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
                        draggable={false}
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

function ShellLibraryPanel({
  onUpload,
  onPlace,
}: {
  onUpload(): void
  onPlace(payload: ShellMediaPayload): void
}) {
  const t = useTranslations('StudioNode.shell.panels')
  const [filter, setFilter] = useState<CanvasShellLibraryFilter>(
    CANVAS_SHELL_LIBRARY_FILTER_IDS.all,
  )
  const { records, isLoading, exhausted, loadMore } = useRecentGenerations({
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
                {...mediaTileProps(
                  {
                    ...plan,
                    url: record.url,
                    name: resolveGenerationDisplayName(record),
                    width: record.width,
                    height: record.height,
                  },
                  onPlace,
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={record.thumbnailUrl ?? record.url}
                  alt=""
                  // ⚠ 缩略图自己是可拖的：不关掉它，从图上起手的拖拽会被浏览器
                  // 接管成「拖一张图片」，我们的载荷压根没上车。
                  draggable={false}
                  className="size-full object-cover"
                />
              </div>
            )
          })}
        </div>
      )}
      <ShellLoadMore
        visible={records.length > 0 && !exhausted}
        isLoading={isLoading}
        onLoadMore={loadMore}
        testId="shell-library-more"
      />
      {records.length > 0 ? (
        <p className="px-1 pt-1 text-2xs text-node-muted">{t('placeHint')}</p>
      ) : null}
    </div>
  )
}

function ShellHistoryPanel({
  onPlace,
}: {
  onPlace(payload: ShellMediaPayload): void
}) {
  const t = useTranslations('StudioNode.shell.panels')
  const format = useFormatter()
  /**
   * `relativeTime` 的**参照时刻**。⚠ 不传 `now`，next-intl 退回全局默认值并且每渲染
   * 一行就往 console 甩一条 `ENVIRONMENT_FALLBACK`（真机实测一屏 30 多条）。取一次
   * 存住 —— 这是弹开看一眼的列表，⛔ 不为它上一个每秒走的钟。
   */
  const [now] = useState(() => new Date())
  const { records, isLoading, exhausted, loadMore } = useRecentGenerations({
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
            {...mediaTileProps(
              {
                ...plan,
                url: record.url,
                name: resolveGenerationDisplayName(record),
                width: record.width,
                height: record.height,
              },
              onPlace,
            )}
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
                draggable={false}
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
      <ShellLoadMore
        visible={records.length > 0 && !exhausted}
        isLoading={isLoading}
        onLoadMore={loadMore}
        testId="shell-history-more"
      />
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
  /** 点一下某份素材 —— 落到视口中央（拖投之外的第二只手）。 */
  onPlaceMedia(payload: ShellMediaPayload): void
}

export function ShellSidePanels({
  activePanel,
  onActivePanelChange,
  nodeQuery,
  onNodeQueryChange,
  onUpload,
  onPlaceMedia,
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
              <ShellCardsPanel onPlace={onPlaceMedia} />
            ) : activePanel === CANVAS_SHELL_PANEL_IDS.library ? (
              <ShellLibraryPanel onUpload={onUpload} onPlace={onPlaceMedia} />
            ) : (
              <ShellHistoryPanel onPlace={onPlaceMedia} />
            )}
          </ShellPanelFrame>
        </div>
      )}
    </>
  )
}
