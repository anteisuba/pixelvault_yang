'use client'

/**
 * 左侧 44px 玻璃图标栏 + 264 宽浮起面板（S7 §7 左侧 · 画板 `ChromePanels{,2}.dc.html`）。
 *
 * ⚠ 面板**浮在画布上**，⛔ 不挤画布：它是 `absolute` 的兄弟，画布几何不因为开合
 * 而变（与助手 dock 同一条「覆盖，不挤压」）。再点同一个图标 = 收起。
 *
 * 三个面板各自只做「列出来 + 交出去」：
 * · 节点一览 → 复用 `CastDock`（搜索 + 四类分组 + 缩略/名/子型/引用数 + `focusNode`），
 *   ⛔ 不再写第二个定位器。
 * · 角色 → 角色库（`useCharacterLibrary`，与角色页同一份）。**点一位**放到画布上；
 *   已经在画布上的点了定位到她（owner 09-27：⛔ 不拖；旧上下文卡不再显示）。
 * · 素材库 → 上传与生成记录合并，复用素材页文件夹，按类型筛、一页一页往下翻。
 *
 * ⚠ 素材库与节点一览之外的落卡都有**两只手**：拖进画布，或**点一下**落到视口中央。后者不是
 * 冗余 —— 触屏上根本没有 `dragstart`，桌面上从缩略图起手的拖拽也常被浏览器接管成
 * 「拖一张图片」（owner 2026-09-12 真机：素材拖不进画布）。
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from 'react'
import {
  animate,
  calcGeneratorDuration,
  motion,
  spring,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionStyle,
  type MotionValue,
} from 'motion/react'
import { ChevronDown, FolderOpen, PanelLeftClose } from '@/components/icons'
import { useLocale, useTranslations } from 'next-intl'

import {
  CANVAS_SHELL_LAYOUT,
  CANVAS_SHELL_LIBRARY_FILTER_IDS,
  CANVAS_SHELL_LIST_PAGE_SIZE,
  CANVAS_SHELL_MEDIA_DRAG_MIME,
  CANVAS_SHELL_PANELS,
  CANVAS_SHELL_PANEL_IDS,
  CANVAS_SHELL_SIDEBAR_ENTRY_ATTR,
  type CanvasShellLibraryFilter,
  type CanvasShellPanelId,
} from '@/constants/canvas-shell'
import {
  DURATION_MS,
  EASE_STANDARD,
  LIQUID_SPRING,
  LIQUID_TIMING,
  motionTransition,
} from '@/constants/motion'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_AUDIO_SUBTYPE_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { useCharacterLibrary } from '@/hooks/cards/use-character-library'
import { characterWork } from '@/lib/character-works'
import { useProjects } from '@/hooks/use-projects'
import {
  AssetPickerFolderNav,
  type PickerScope,
} from '@/components/business/assets/AssetPickerFolderNav'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Link } from '@/i18n/navigation'
import { ROUTES, cardManagementPath } from '@/constants/routes'
import { SHELL_NAV_CANVAS_ENTRIES } from '@/constants/navigation'
import { getFolderPath } from '@/lib/folder-tree'
import { fetchGalleryImages } from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import { useGalleryRevision } from '@/lib/gallery-revision'
import { resolveGenerationDisplayName } from '@/lib/generation-name'
import { cn } from '@/lib/utils'
import type {
  CharacterCardRecord,
  GenerationRecord,
  OutputTypeValue,
} from '@/types'
import type { NodeV4Data } from '@/types/node-workflow'

import { CastDock } from '../../CastDock'
import { useBrokenThumbs } from '../../nodes/v4/chrome/NodeMediaMissing'
import { ShellIconButton } from './ShellIconButton'

/** 三格的图标与全站侧栏「画布」下面那三颗同一份（`SHELL_NAV_CANVAS_ENTRIES`）。 */
const PANEL_ICONS = Object.fromEntries(
  SHELL_NAV_CANVAS_ENTRIES.map((entry) => [entry.id, entry.icon]),
) as Record<
  CanvasShellPanelId,
  (typeof SHELL_NAV_CANVAS_ENTRIES)[number]['icon']
>

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
 * 用户最近的产物，**一页一页**拉。上传与生成记录在同一个素材库中读取。
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
  readonly scope: PickerScope
}) {
  const { types, scope } = options
  const revision = useGalleryRevision()
  const typeKey = types.join(',')
  const projectId =
    scope.kind === 'project'
      ? scope.id
      : scope.kind === 'unassigned'
        ? 'none'
        : undefined
  const liked = scope.kind === 'favorites'
  const resetKey = `${typeKey}|${projectId ?? ''}|${String(liked)}|${String(revision)}`

  const [records, setRecords] = useState<readonly GenerationRecord[]>([])
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey)
    setPage(1)
    setRecords([])
    setExhausted(false)
    setFailed(false)
  }

  useEffect(() => {
    let alive = true
    // ⚠ 走 `deferEffectTask`：React 19 的 lint 不允许在 effect 体里同步启动会
    // setState 的活（`react-hooks/set-state-in-effect`），与 `use-context-cards`
    // 同一套约定，⛔ 别在这里另发明一份。
    const cancel = deferEffectTask(() => {
      setIsLoading(true)
      setFailed(false)
      void fetchGalleryImages(page, CANVAS_SHELL_LIST_PAGE_SIZE, {
        mine: true,
        ...(typeKey ? { type: typeKey.split(',') as OutputTypeValue[] } : {}),
        ...(projectId ? { projectId } : {}),
        ...(liked ? { liked: true } : {}),
      }).then((response) => {
        if (!alive) return
        setIsLoading(false)
        if (!response.success || !response.data) {
          setFailed(true)
          return
        }
        const batch = response.data.generations
        setExhausted(!response.data.hasMore)
        setRecords((current) => (page === 1 ? batch : [...current, ...batch]))
      })
    })
    return () => {
      alive = false
      cancel()
    }
  }, [page, resetKey, typeKey, projectId, liked, attempt])

  return {
    records,
    isLoading,
    exhausted,
    failed,
    retry: useCallback(() => setAttempt((current) => current + 1), []),
    loadMore: useCallback(() => setPage((current) => current + 1), []),
  }
}

/** 列表底部那颗「加载更多」—— 素材列表共用。 */
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
  onClose(): void
  readonly children: React.ReactNode
  /**
   * 标题行与正文各自可寻址 —— 液态开合里标题骑着形状的上边沿走、先于正文进场
   * （见 `ShellPanelLayer`）。
   */
  readonly headRef?: Ref<HTMLDivElement>
  readonly headStyle?: MotionStyle
  readonly bodyStyle?: MotionStyle
}

function ShellPanelFrame({
  title,
  onClose,
  children,
  headRef,
  headStyle,
  bodyStyle,
}: ShellPanelFrameProps) {
  const t = useTranslations('StudioNode.shell.panels')
  return (
    <>
      <motion.div
        ref={headRef}
        style={headStyle}
        className="flex h-9 shrink-0 items-center gap-2 px-2"
      >
        <span className="min-w-0 flex-1 truncate text-node-foreground canvas-panel-title">
          {title}
        </span>
        <button
          type="button"
          aria-label={t('close')}
          title={t('close')}
          onClick={onClose}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-node-muted transition-colors hover:text-node-foreground"
        >
          <PanelLeftClose className="size-3.5" aria-hidden />
        </button>
      </motion.div>
      <motion.div style={bodyStyle} className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </motion.div>
    </>
  )
}

function ShellCardsPanel({
  placedCharacterIds,
  onPlaceCharacter,
}: {
  placedCharacterIds: ReadonlySet<string>
  onPlaceCharacter(card: CharacterCardRecord): void
}) {
  const t = useTranslations('StudioNode.shell.panels')
  const locale = useLocale()
  const { cards, loaded } = useCharacterLibrary()
  // 源图删了：只剩底色，⛔ 不画裂图（owner 09-28）。
  const thumbs = useBrokenThumbs()

  if (!loaded && cards.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-node-muted">
        {t('loading')}
      </p>
    )
  }
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2.5 px-3 py-8 text-center">
        <p className="text-xs text-node-foreground">{t('cardsEmpty')}</p>
        <p className="text-2xs text-node-muted">{t('cardsEmptyHint')}</p>
        <a
          href={`/${locale}${cardManagementPath({ tab: 'characters' })}`}
          target="_blank"
          rel="noopener"
          className="inline-flex h-8 items-center rounded-full border border-border bg-background px-3.5 text-xs font-medium text-foreground transition-colors duration-fast hover:bg-surface-fill"
        >
          {t('cardsOpenRoster')} ↗
        </a>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col gap-0.5 px-1 pb-2"
      data-testid="shell-cards-panel"
    >
      {cards.map((card) => {
        const url =
          card.referenceSlots.find((slot) => slot.isPrimary)?.url ??
          card.referenceSlots[0]?.url ??
          card.sourceImageUrl ??
          undefined
        const onCanvas = placedCharacterIds.has(card.id)
        const work = characterWork(card, locale).label ?? t('cardsOriginal')
        return (
          <button
            key={card.id}
            type="button"
            data-testid="shell-card-row"
            onClick={() => onPlaceCharacter(card)}
            style={{ height: CANVAS_SHELL_LAYOUT.nodeRowHeightPx }}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-node-panel-inner focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              onCanvas && 'bg-node-panel-inner',
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
              {thumbs.usable(url) ? (
                // R2 上的任意用户媒体，与引用 chip 同一条 raw-img 约定。
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt=""
                  draggable={false}
                  onError={() => url && thumbs.markBroken(url)}
                  className="size-full object-cover"
                />
              ) : null}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs text-node-foreground">
                {card.name}
              </span>
              <span className="truncate text-2xs text-node-muted">
                {t('cardsMeta', { work, count: card.referenceSlots.length })}
              </span>
            </span>
            {onCanvas ? (
              <span className="shrink-0 text-2xs text-node-muted">
                {t('cardsOnCanvas')}
              </span>
            ) : null}
          </button>
        )
      })}
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
  // 记录的文件删了而列表还没刷新：只剩底色，⛔ 不画裂图（owner 09-28）。
  const thumbs = useBrokenThumbs()
  const [filter, setFilter] = useState<CanvasShellLibraryFilter>(
    CANVAS_SHELL_LIBRARY_FILTER_IDS.all,
  )
  const tAssets = useTranslations('AssetsPage')
  const [scope, setScope] = useState<PickerScope>({ kind: 'all' })
  const [foldersOpen, setFoldersOpen] = useState(false)
  const {
    projects,
    isLoading: foldersLoading,
    error: foldersError,
    refresh,
  } = useProjects({ loadHistoryOnMount: false })
  const { records, isLoading, exhausted, loadMore, failed, retry } =
    useRecentGenerations({
      types: OUTPUT_TYPE_BY_FILTER[filter],
      scope,
    })
  const scopeLabel =
    scope.kind === 'project'
      ? getFolderPath(projects, scope.id)
          .map((folder) => folder.name)
          .join(' / ')
      : tAssets(
          scope.kind === 'favorites'
            ? 'sidebarFavorites'
            : scope.kind === 'unassigned'
              ? 'sidebarUnassigned'
              : 'sidebarAll',
        )

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
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs text-node-muted">{t('libraryHint')}</span>
        <button
          type="button"
          data-testid="shell-library-upload"
          onClick={onUpload}
          className="rounded-md px-2 py-1 text-xs text-node-foreground hover:bg-node-panel-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('libraryUpload')}
        </button>
      </div>
      <Popover open={foldersOpen} onOpenChange={setFoldersOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="shell-library-folders"
            className="flex min-h-9 w-full items-center gap-2 rounded-lg border border-node-panel-inner px-2 text-left text-xs text-node-foreground hover:bg-node-panel-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FolderOpen className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {scopeLabel || tAssets('sidebarFolders')}
            </span>
            <ChevronDown className="size-3.5 shrink-0" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex max-h-96 flex-col p-2">
          {foldersLoading ? (
            <p className="p-2 text-xs text-muted-foreground">{t('loading')}</p>
          ) : foldersError ? (
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-md p-2 text-sm text-status-risk"
            >
              {t('libraryLoadFailed')}
            </button>
          ) : (
            <AssetPickerFolderNav
              projects={projects}
              scope={scope}
              recentProjectIds={[]}
              className="min-h-0 flex-1 shrink overflow-hidden border-r-0"
              onScopeChange={(next) => {
                setScope(next)
                setFoldersOpen(false)
              }}
            />
          )}
          <Link
            href={ROUTES.ASSETS}
            className="mt-2 shrink-0 rounded-md border-t border-border px-2 py-3 text-xs text-muted-foreground hover:text-foreground"
          >
            {t('libraryManageFolders')}
          </Link>
        </PopoverContent>
      </Popover>
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
      {failed ? (
        <button
          type="button"
          onClick={retry}
          className="rounded-lg px-2 py-4 text-xs text-status-risk"
        >
          {t('libraryLoadFailed')}
        </button>
      ) : isLoading && records.length === 0 ? (
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
                aria-label={resolveGenerationDisplayName(record)}
                title={resolveGenerationDisplayName(record)}
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
                {thumbs.usable(record.thumbnailUrl ?? record.url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={record.thumbnailUrl ?? record.url}
                    alt=""
                    // ⚠ 缩略图自己是可拖的：不关掉它，从图上起手的拖拽会被浏览器
                    // 接管成「拖一张图片」，我们的载荷压根没上车。
                    draggable={false}
                    onError={() =>
                      thumbs.markBroken(record.thumbnailUrl ?? record.url)
                    }
                    className="size-full object-cover"
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      <ShellLoadMore
        visible={records.length > 0 && !exhausted && !failed}
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

/* ────────────────────────────────────────────────────────────────────────────
 * 液态开合（owner 2026-09-26 定 B「先横成一条，再落下」）—— 与助手头像点开同一套
 * `LIQUID_SPRING` / `LIQUID_TIMING`，原型是方向稿 `GFfqsraLtaRRBBKigkmCuT`
 * 的「画布左侧栏」一节。
 *
 * 四档相位：`closed` → `opening` →（第二拍弹簧 `finished`，或兜底定时器）→ `open`
 * → `closing` →（**只认定时器**）→ `closed`。
 * ⚠ 收回只认定时器、⛔ 不用 `AnimatePresence`：后台标签页里 rAF 冻结，动画永远
 *   跑不完，靠它摘节点会留下一块吃点击的幽灵面板（助手 dock 2026-08-30 真机实测，
 *   同一条理由）。
 * ⚠ 展开认弹簧落定、并带一条兜底定时器：毛玻璃要等形状长完才挂，而后台标签页里
 *   弹簧同样不落 —— 没有兜底，面板就永远停在 `pointer-events: none`。
 * ⚠ 进档在 render 里派生（⛔ 不在 effect 里 setState：那会先按静止态画一帧再跳）；
 *   出档才走定时器 / 动画回调 —— 那是真的「过一会儿」的事。
 * ⚠ `prefers-reduced-motion`：直切，没有中间档。
 * ──────────────────────────────────────────────────────────────────────────── */

type ShellLiquidPhase = 'closed' | 'opening' | 'open' | 'closing'

/** 面板上那份内容是怎么来的：挂载时就开着 / 随开合进场 / 开着时切过来。 */
type ShellLiquidEntry = 'static' | 'open' | 'swap'

interface ShellLiquidState {
  /** 上一次看到的 `activePanel` —— 与它不同就在 render 里派生下一档。 */
  readonly target: CanvasShellPanelId | null
  readonly phase: ShellLiquidPhase
  /** 进当前相位之前那一档：形状据此分「从一颗图标长出来」还是「从半路接着走」。 */
  readonly from: ShellLiquidPhase
  /** 形状从哪一格长出来 / 缩回哪一格。 */
  readonly origin: CanvasShellPanelId | null
  /** 面板上正显示的内容（收起途中照旧是它，直到卸载）。 */
  readonly shown: CanvasShellPanelId | null
  /** 开着时切格：正在退场的旧内容，与新内容叠放 `swapOutS` 后摘掉。 */
  readonly leaving: CanvasShellPanelId | null
  readonly entry: ShellLiquidEntry
}

function settledLiquid(panel: CanvasShellPanelId | null): ShellLiquidState {
  const phase: ShellLiquidPhase = panel === null ? 'closed' : 'open'
  return {
    target: panel,
    phase,
    from: phase,
    origin: panel,
    shown: panel,
    leaving: null,
    entry: 'static',
  }
}

function nextLiquid(
  state: ShellLiquidState,
  panel: CanvasShellPanelId | null,
  reducedMotion: boolean,
): ShellLiquidState {
  if (panel !== null) {
    if (state.phase === 'closed' || state.phase === 'closing') {
      return {
        target: panel,
        phase: reducedMotion ? 'open' : 'opening',
        from: state.phase,
        origin: panel,
        shown: panel,
        // 收回途中点了另一格：旧内容本来就在退场，让它按换场那一拍退完。
        leaving:
          !reducedMotion && state.shown !== null && state.shown !== panel
            ? state.shown
            : null,
        entry: reducedMotion ? 'static' : 'open',
      }
    }
    if (state.shown === panel) return { ...state, target: panel }
    // ⭐ 开着时切格：面板**不收不开**，只换内容（相位、形状都不动）。
    return {
      ...state,
      target: panel,
      shown: panel,
      leaving: reducedMotion ? null : state.shown,
      entry: reducedMotion ? 'static' : 'swap',
    }
  }
  if (state.phase === 'closed' || state.phase === 'closing') {
    return { ...state, target: null }
  }
  if (reducedMotion) return settledLiquid(null)
  return {
    ...state,
    target: null,
    phase: 'closing',
    from: state.phase,
    origin: state.shown,
  }
}

type ShellLayerMode =
  | 'static'
  | 'enter-open'
  | 'enter-swap'
  | 'exit-close'
  | 'exit-swap'

function layerMode(
  state: ShellLiquidState,
  panel: CanvasShellPanelId,
): ShellLayerMode {
  if (panel === state.leaving) return 'exit-swap'
  if (state.phase === 'closing') return 'exit-close'
  if (state.entry === 'open') return 'enter-open'
  if (state.entry === 'swap') return 'enter-swap'
  return 'static'
}

interface ShellLayerBeat {
  readonly delay: number
  readonly duration: number
}

/**
 * 内容的几拍（秒，数只住 `LIQUID_TIMING`）：开 = 标题随第一拍、正文随第二拍；
 * 收 = 两批一起先退；切格 = 旧的退、新的晚一点进。
 */
const LAYER_BEATS: Record<
  Exclude<ShellLayerMode, 'static'>,
  {
    readonly to: number
    readonly head: ShellLayerBeat
    readonly body: ShellLayerBeat
  }
> = {
  'enter-open': {
    to: 1,
    head: {
      delay: LIQUID_TIMING.headInDelayS,
      duration: LIQUID_TIMING.headInS,
    },
    body: {
      delay: LIQUID_TIMING.bodyInDelayS,
      duration: LIQUID_TIMING.bodyInS,
    },
  },
  'enter-swap': {
    to: 1,
    head: {
      delay: LIQUID_TIMING.swapInDelayS,
      duration: LIQUID_TIMING.swapInS,
    },
    body: {
      delay: LIQUID_TIMING.swapInDelayS,
      duration: LIQUID_TIMING.swapInS,
    },
  },
  'exit-close': {
    to: 0,
    head: { delay: 0, duration: LIQUID_TIMING.contentOutS },
    body: { delay: 0, duration: LIQUID_TIMING.contentOutS },
  },
  'exit-swap': {
    to: 0,
    head: { delay: 0, duration: LIQUID_TIMING.swapOutS },
    body: { delay: 0, duration: LIQUID_TIMING.swapOutS },
  },
}

/** 模糊跟透明度走同一根线；全显时不挂滤镜（⛔ 留一个 `blur(0)` 平白多一层合成）。 */
function liquidBlur(visible: number): string {
  if (visible >= 1) return 'none'
  return `blur(${((1 - visible) * LIQUID_TIMING.blurPx).toFixed(2)}px)`
}

type LiquidSpring = (typeof LIQUID_SPRING)[keyof typeof LIQUID_SPRING]

/** 一根液态弹簧从静止走完 `distancePx` 要多久（ms）—— 用 motion 自己的弹簧生成器算，⛔ 不另估一个数。 */
function liquidSettleMs(config: LiquidSpring, distancePx: number): number {
  return calcGeneratorDuration(
    spring({
      keyframes: [0, Math.abs(distancePx)],
      stiffness: config.stiffness,
      damping: config.damping,
    }),
  )
}

/**
 * 形状动着时的皮：clip-path 会把 box-shadow 与描边一起裁掉 —— 阴影改由外层
 * `drop-shadow` 画（滤镜先于裁剪执行，挂在面板自己身上会被一起裁掉），描边先透明
 * （否则方块 / 标题条只剩左边一根发丝线），毛玻璃先不挂（动着开 backdrop-filter 会
 * 掉帧）。落定后回到 `.canvas-glass` 原样。
 */
const MOVING_SHADOW_FILTER = 'drop-shadow(var(--canvas-glass-shadow))'
const MOVING_GLASS_STYLE = {
  boxShadow: 'none',
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none',
  borderColor: 'transparent',
  willChange: 'clip-path',
} as const

/**
 * 面板里的一份内容（标题行 + 正文）。切格的那一小段里新旧两份叠放，所以按面板 id
 * 各挂一份；它自己只管淡入淡出与模糊，标题的纵向位置由外壳的形状给（`titleY`）。
 */
function ShellPanelLayer({
  mode,
  titleY,
  titleRowRef,
  inert,
  title,
  onClose,
  children,
}: {
  readonly mode: ShellLayerMode
  readonly titleY: MotionValue<number>
  readonly titleRowRef?: Ref<HTMLDivElement>
  readonly inert: boolean
  readonly title: string
  onClose(): void
  readonly children: React.ReactNode
}) {
  const headIn = useMotionValue(mode === 'static' ? 1 : 0)
  const bodyIn = useMotionValue(mode === 'static' ? 1 : 0)
  const headFilter = useTransform(headIn, liquidBlur)
  const bodyFilter = useTransform(bodyIn, liquidBlur)

  useEffect(() => {
    if (mode === 'static') {
      headIn.jump(1)
      bodyIn.jump(1)
      return
    }
    const beat = LAYER_BEATS[mode]
    const controls = [
      animate(headIn, beat.to, { ...beat.head, ease: EASE_STANDARD }),
      animate(bodyIn, beat.to, { ...beat.body, ease: EASE_STANDARD }),
    ]
    return () => controls.forEach((control) => control.stop())
  }, [mode, headIn, bodyIn])

  return (
    <div inert={inert} className="absolute inset-0 flex flex-col">
      <ShellPanelFrame
        title={title}
        onClose={onClose}
        headRef={titleRowRef}
        headStyle={{ y: titleY, opacity: headIn, filter: headFilter }}
        bodyStyle={{ opacity: bodyIn, filter: bodyFilter }}
      >
        {children}
      </ShellPanelFrame>
    </div>
  )
}

export interface ShellSidePanelsProps {
  /**
   * 画布里还留不留自己那条图标栏。≥1024 那三颗长在全站侧栏「画布」下面（owner
   * 2026-10-08），画布里只剩面板；768–1023 全站侧栏不在，栏留着兜底。
   */
  readonly railVisible: boolean
  /** `null` = 三个面板都收着（只剩图标栏）。 */
  readonly activePanel: CanvasShellPanelId | null
  onActivePanelChange(panel: CanvasShellPanelId | null): void
  /** 节点一览的搜索词（与 ⌘K 同一份词，⛔ 不各存一份）。 */
  readonly nodeQuery: string
  onNodeQueryChange(value: string): void
  /** 素材库面板的「上传」—— 弹系统文件选择器，落法与拖入同一条。 */
  onUpload(): void
  /** 点一下某份素材 —— 落到视口中央（拖投之外的第二只手）。 */
  onPlaceMedia(payload: ShellMediaPayload): void
  /** 画布上已经有卡的角色（一个角色一张）。 */
  readonly placedCharacterIds: ReadonlySet<string>
  /** 点一位角色：不在画布上 = 放到视口中央；已在 = 定位到她。 */
  onPlaceCharacter(card: CharacterCardRecord): void
}

export function ShellSidePanels({
  railVisible,
  activePanel,
  onActivePanelChange,
  nodeQuery,
  onNodeQueryChange,
  onUpload,
  onPlaceMedia,
  placedCharacterIds,
  onPlaceCharacter,
}: ShellSidePanelsProps) {
  const t = useTranslations('StudioNode.shell.panels')
  const close = useCallback(
    () => onActivePanelChange(null),
    [onActivePanelChange],
  )
  const reducedMotion = useReducedMotion() ?? false

  const [liquid, setLiquid] = useState(() => settledLiquid(activePanel))
  if (liquid.target !== activePanel) {
    setLiquid(nextLiquid(liquid, activePanel, reducedMotion))
  } else if (
    reducedMotion &&
    (liquid.phase === 'opening' || liquid.phase === 'closing')
  ) {
    // 动到一半用户打开了「减少动态效果」：两拍的定时器已随之撤掉，当场落到终态，
    // ⛔ 不留一块停在半路、永远 `pointer-events: none` 的面板。
    setLiquid(settledLiquid(liquid.target))
  }
  const { phase, from, origin, shown, leaving } = liquid
  const moving = phase === 'opening' || phase === 'closing'

  const titleByPanel: Record<CanvasShellPanelId, string> = {
    [CANVAS_SHELL_PANEL_IDS.nodes]: t('nodes'),
    [CANVAS_SHELL_PANEL_IDS.cards]: t('cards'),
    [CANVAS_SHELL_PANEL_IDS.library]: t('library'),
  }

  /** 三格图标按钮 —— 选中底块与形状的起点都从它们身上量，⛔ 不在 render 里猜。 */
  const railSlots = useRef<
    Partial<Record<CanvasShellPanelId, HTMLButtonElement | null>>
  >({})
  const panelRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const titleRowRef = useRef<HTMLDivElement>(null)

  /**
   * ── 形状 ──────────────────────────────────────────────────────────────
   * 面板始终按全尺寸排好，只动 `clip-path: inset()`（⛔ 不动宽高与位置）。三条边
   * 是面板自己盒子里的坐标（左边沿恒为 0）：上边沿 y、右边沿 x、下边沿 y。
   * 收起形 = 面板左缘、与被点那一格同一行的一颗图标大小的方块 → 第一拍右边沿走满、
   * 上下收成一条 `panelTitleStripPx` 的标题条 → `unfoldDelayS` 后上下走满。收回反着走。
   * 圆角跟着横向进度从图标的圆角走到面板的圆角。
   * ⚠ 静止档（`open`）是 `none`，⛔ 别在 style 上把它换成字符串：motion 的 style 从
   *   MotionValue 换成静态值时不会解绑，DOM 上会留着最后一帧的裁剪（助手 dock
   *   2026-09-26 用例抓到）。所以两档都走同一个值。
   */
  const shapeTop = useMotionValue(0)
  const shapeRight = useMotionValue(0)
  const shapeBottom = useMotionValue(0)
  /**
   * 标题行中心比标题条中心低多少。标题行骑着上边沿走（平移 = 上边沿），再减掉它，
   * 第一拍里标题才正落在被点那一格的中线上；到顶时夹在 0，落定位置不变。
   */
  const titleRide = useMotionValue(0)
  const clipPath = useTransform(() => {
    const top = shapeTop.get()
    const right = shapeRight.get()
    const bottom = shapeBottom.get()
    if (phase === 'open' || reducedMotion) return 'none'
    const icon = CANVAS_SHELL_LAYOUT.iconButtonPx
    const progress = Math.min(
      1,
      Math.max(0, (right - icon) / (CANVAS_SHELL_LAYOUT.panelWidthPx - icon)),
    )
    const radius =
      CANVAS_SHELL_LAYOUT.iconButtonRadiusPx +
      (CANVAS_SHELL_LAYOUT.glassRadiusPx -
        CANVAS_SHELL_LAYOUT.iconButtonRadiusPx) *
        progress
    return `inset(${top.toFixed(2)}px calc(100% - ${right.toFixed(2)}px) calc(100% - ${bottom.toFixed(2)}px) 0px round ${radius.toFixed(2)}px)`
  })
  const titleY = useTransform(() => {
    const top = shapeTop.get()
    const ride = titleRide.get()
    if (phase === 'open' || reducedMotion) return 0
    return Math.max(0, top - ride)
  })

  /**
   * ── 选中底块 ──────────────────────────────────────────────────────────
   * 一块底在三格之间滑；上下两条边各走一根弹簧（前进方向那条 `lead`、另一条
   * `trail`），途中自然拉长。开 / 收只淡入淡出（图标状态切换那一档 `fast`）。
   */
  const indicatorTop = useMotionValue(0)
  const indicatorBottom = useMotionValue<number>(
    CANVAS_SHELL_LAYOUT.iconButtonPx,
  )
  const indicatorOpacity = useMotionValue(activePanel === null ? 0 : 1)
  const indicatorHeight = useTransform(
    () => indicatorBottom.get() - indicatorTop.get(),
  )
  const indicatorPrevious = useRef<{
    readonly phase: ShellLiquidPhase
    readonly shown: CanvasShellPanelId | null
  }>({ phase: 'closed', shown: null })

  useLayoutEffect(() => {
    const previous = indicatorPrevious.current
    indicatorPrevious.current = { phase, shown }
    if (phase === 'closed' || shown === null) {
      indicatorOpacity.jump(0)
      return
    }
    const top = railSlots.current[shown]?.offsetTop ?? 0
    const bottom = top + CANVAS_SHELL_LAYOUT.iconButtonPx
    const visible = phase === 'closing' ? 0 : 1
    if (reducedMotion) {
      indicatorTop.jump(top)
      indicatorBottom.jump(bottom)
      indicatorOpacity.jump(visible)
      return
    }
    if (previous.phase === 'closed' || previous.shown === null) {
      // 从全收起来点开：底块直接落在那一格，只淡入（⛔ 不从上一次的格子滑过来）。
      indicatorTop.jump(top)
      indicatorBottom.jump(bottom)
    } else if (previous.shown !== shown) {
      const down =
        CANVAS_SHELL_PANELS.indexOf(shown) >
        CANVAS_SHELL_PANELS.indexOf(previous.shown)
      animate(
        indicatorBottom,
        bottom,
        down ? LIQUID_SPRING.lead : LIQUID_SPRING.trail,
      )
      animate(
        indicatorTop,
        top,
        down ? LIQUID_SPRING.trail : LIQUID_SPRING.lead,
      )
    }
    animate(indicatorOpacity, visible, motionTransition('fast'))
  }, [
    phase,
    shown,
    reducedMotion,
    indicatorTop,
    indicatorBottom,
    indicatorOpacity,
  ])

  /**
   * 两拍的编排。⚠ 尺寸在 layout effect 里量（面板此刻已按全尺寸排好、还没上屏）。
   * ⚠ 只挂在「开 / 收」上：开着时切格不改相位也不改 `origin`，这里不重跑，第二拍
   *   的定时器不会被切格清掉。
   */
  useLayoutEffect(() => {
    if (reducedMotion) return
    if (phase === 'closed') {
      // 下一次点开前形状是空的：面板首帧不会带着上一次的残形。
      shapeTop.jump(0)
      shapeRight.jump(0)
      shapeBottom.jump(0)
      return
    }
    if (phase === 'open') return
    const panel = panelRef.current
    if (!panel || origin === null) return

    const panelTop = panel.getBoundingClientRect().top
    const icon = CANVAS_SHELL_LAYOUT.iconButtonPx
    const strip = CANVAS_SHELL_LAYOUT.panelTitleStripPx
    const width = CANVAS_SHELL_LAYOUT.panelWidthPx
    const height = panel.offsetHeight
    const slot = railVisible
      ? railSlots.current[origin]
      : document.querySelector<HTMLElement>(
          `[${CANVAS_SHELL_SIDEBAR_ENTRY_ATTR}="${origin}"]`,
        )
    // 侧栏那一颗可能高过面板顶（面板从顶栏下面起）：夹进面板里，⛔ 从面板外长出来。
    const row = slot
      ? Math.min(
          Math.max(0, slot.getBoundingClientRect().top - panelTop),
          Math.max(0, height - icon),
        )
      : 0
    const stripTop = row + icon / 2 - strip / 2
    const stripBottom = stripTop + strip
    const titleRow = titleRowRef.current
    const stack = stackRef.current
    titleRide.jump(
      titleRow && stack
        ? Math.max(
            0,
            stack.getBoundingClientRect().top -
              panelTop +
              titleRow.offsetTop +
              titleRow.offsetHeight / 2 -
              strip / 2,
          )
        : 0,
    )

    let live = true
    const timers: number[] = []
    const later = (ms: number, run: () => void) => {
      timers.push(window.setTimeout(run, ms))
    }
    const settleOpen = () => {
      if (!live) return
      setLiquid((current) =>
        current.phase === 'opening'
          ? { ...current, phase: 'open', from: 'opening' }
          : current,
      )
    }

    if (phase === 'opening') {
      if (from === 'closed') {
        shapeTop.jump(row)
        shapeRight.jump(icon)
        shapeBottom.jump(row + icon)
        const stripRight = animate(shapeRight, width, LIQUID_SPRING.strip)
        animate(shapeTop, stripTop, LIQUID_SPRING.strip)
        animate(shapeBottom, stripBottom, LIQUID_SPRING.strip)
        const unfoldAtMs = LIQUID_TIMING.unfoldDelayS * 1000
        later(unfoldAtMs, () => {
          // ⚠ 只等没被接走的那几根：第一拍的上下边沿会被第二拍打断，而 motion
          //   被 `stop()` 的动画 `finished` 永远不 resolve。
          void Promise.all([
            stripRight.finished,
            animate(shapeTop, 0, LIQUID_SPRING.unfold).finished,
            animate(shapeBottom, height, LIQUID_SPRING.unfold).finished,
          ]).then(settleOpen)
        })
        later(
          unfoldAtMs +
            liquidSettleMs(
              LIQUID_SPRING.unfold,
              Math.max(stripTop, height - stripBottom),
            ) +
            DURATION_MS.fast,
          settleOpen,
        )
      } else {
        // 收回途中又点开：弹簧接住此刻的位置与速度直接走满（⛔ 不跳回图标方块从头播）。
        const distance = Math.max(
          width - shapeRight.get(),
          shapeTop.get(),
          height - shapeBottom.get(),
        )
        const unfold = [
          animate(shapeRight, width, LIQUID_SPRING.unfold),
          animate(shapeTop, 0, LIQUID_SPRING.unfold),
          animate(shapeBottom, height, LIQUID_SPRING.unfold),
        ]
        void Promise.all(unfold.map((control) => control.finished)).then(
          settleOpen,
        )
        later(
          liquidSettleMs(LIQUID_SPRING.unfold, distance) + DURATION_MS.fast,
          settleOpen,
        )
      }
    } else {
      if (from === 'open') {
        // 静止档没有裁剪（`none`），三条边从整块起步。
        shapeTop.jump(0)
        shapeRight.jump(width)
        shapeBottom.jump(height)
      }
      const retractAtMs = LIQUID_TIMING.retractDelayS * 1000
      const secondBeatAtMs =
        retractAtMs + LIQUID_TIMING.retractSecondBeatDelayS * 1000
      later(retractAtMs, () => {
        animate(shapeTop, stripTop, LIQUID_SPRING.retract)
        animate(shapeBottom, stripBottom, LIQUID_SPRING.retract)
      })
      later(secondBeatAtMs, () => {
        animate(shapeRight, icon, LIQUID_SPRING.retract)
        animate(shapeTop, row, LIQUID_SPRING.retract)
        animate(shapeBottom, row + icon, LIQUID_SPRING.retract)
      })
      // ⚠ 卸载只认定时器（见上方相位机头注）。
      later(
        secondBeatAtMs +
          liquidSettleMs(LIQUID_SPRING.retract, width - icon) +
          DURATION_MS.fast,
        () =>
          setLiquid((current) =>
            current.phase === 'closing' ? settledLiquid(null) : current,
          ),
      )
    }
    // ⚠ 只清还没发出的那几拍；已经在跑的弹簧不停 —— 下一段 `animate` 从它此刻的
    //   位置与速度接着走（连点不从头播）。
    return () => {
      live = false
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [
    phase,
    from,
    origin,
    railVisible,
    reducedMotion,
    shapeTop,
    shapeRight,
    shapeBottom,
    titleRide,
  ])

  /** 切格时叠放的旧内容：退场那一拍走完就摘掉。 */
  useEffect(() => {
    if (leaving === null) return
    const timer = window.setTimeout(
      () =>
        setLiquid((current) =>
          current.leaving === leaving ? { ...current, leaving: null } : current,
        ),
      LIQUID_TIMING.swapOutS * 1000,
    )
    return () => window.clearTimeout(timer)
  }, [leaving])

  const layers = [leaving, shown].filter(
    (panel): panel is CanvasShellPanelId => panel !== null,
  )

  return (
    <>
      {railVisible ? (
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
          {/* 选中底块：与按钮自己那块按下底同尺寸同圆角同色；`left-1` 即栏的 `p-1`。
            排在按钮之前，按钮抬成 `relative` 压在它上面。 */}
          <motion.span
            aria-hidden
            data-testid="shell-rail-indicator"
            className="pointer-events-none absolute left-1 top-0 bg-node-panel-inner"
            style={{
              width: CANVAS_SHELL_LAYOUT.iconButtonPx,
              height: indicatorHeight,
              y: indicatorTop,
              opacity: indicatorOpacity,
              borderRadius: CANVAS_SHELL_LAYOUT.iconButtonRadiusPx,
            }}
          />
          {CANVAS_SHELL_PANELS.map((panel) => (
            <ShellIconButton
              key={panel}
              ref={(element) => {
                railSlots.current[panel] = element
              }}
              icon={PANEL_ICONS[panel]}
              label={titleByPanel[panel]}
              testId={`shell-rail-${panel}`}
              active={activePanel === panel}
              externalActiveSurface
              tooltipSide="right"
              onClick={() =>
                onActivePanelChange(activePanel === panel ? null : panel)
              }
            />
          ))}
        </div>
      ) : null}

      {phase === 'closed' || shown === null ? null : (
        <div
          style={{
            top: `calc(var(--canvas-topbar-h) + ${CANVAS_SHELL_LAYOUT.edgeInsetPx}px)`,
            left:
              CANVAS_SHELL_LAYOUT.edgeInsetPx +
              (railVisible
                ? CANVAS_SHELL_LAYOUT.railWidthPx +
                  CANVAS_SHELL_LAYOUT.panelGapPx
                : 0),
            bottom: CANVAS_SHELL_LAYOUT.edgeInsetPx,
            width: CANVAS_SHELL_LAYOUT.panelWidthPx,
            ...(moving ? { filter: MOVING_SHADOW_FILTER } : {}),
          }}
          // 画影子的壳：只在形状动着时挂滤镜（静止档不挂 —— filter 会让它成为 fixed
          // 子元素的包含块，也会让面板的毛玻璃只看得见壳里的东西）。
          className="pointer-events-none absolute z-canvas-chrome hidden md:block"
        >
          <motion.div
            ref={panelRef}
            data-testid="shell-side-panel"
            data-panel={shown}
            data-phase={phase}
            style={{
              borderRadius: CANVAS_SHELL_LAYOUT.glassRadiusPx,
              clipPath,
              ...(moving ? MOVING_GLASS_STYLE : {}),
            }}
            className={cn(
              'canvas-glass flex size-full flex-col overflow-hidden p-1.5',
              // 动着时不接点击：形状没长完就点到里面的东西，落点和看到的对不上。
              moving ? 'pointer-events-none' : 'pointer-events-auto',
            )}
          >
            <div ref={stackRef} className="relative min-h-0 flex-1">
              {layers.map((panel) => (
                <ShellPanelLayer
                  key={panel}
                  mode={layerMode(liquid, panel)}
                  titleY={titleY}
                  {...(panel === shown ? { titleRowRef } : {})}
                  inert={panel !== shown}
                  title={titleByPanel[panel]}
                  onClose={close}
                >
                  {panel === CANVAS_SHELL_PANEL_IDS.nodes ? (
                    <CastDock
                      query={nodeQuery}
                      onQueryChange={onNodeQueryChange}
                    />
                  ) : panel === CANVAS_SHELL_PANEL_IDS.cards ? (
                    <ShellCardsPanel
                      placedCharacterIds={placedCharacterIds}
                      onPlaceCharacter={onPlaceCharacter}
                    />
                  ) : (
                    <ShellLibraryPanel
                      onUpload={onUpload}
                      onPlace={onPlaceMedia}
                    />
                  )}
                </ShellPanelLayer>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </>
  )
}
