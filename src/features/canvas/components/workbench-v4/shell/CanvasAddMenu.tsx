'use client'

/**
 * 画布「添加节点」的**唯一一份菜单**（2026-11-21 设计替换，示意稿
 * `.claude/mockups/studio-audit/canvas-add-menu.html`）。五个入口用的都是它：
 * · 双击空白 → `ShellPointerAddMenu`（光标处弹，卡落在双击的画布坐标）；
 * · 右键空白 → `ShellPaneMenu`「添加节点 ›」子菜单（同一份数据与行，单列分组）；
 * · 底栏 ＋ → 按钮正上方弹（`CanvasAddMenuPopover`，卡落在可见区）；
 * · 空画布引导「手动加节点」→ 以按钮为锚弹；
 * · 侧栏「添加节点」面板（只剩全站侧栏画布子项这一条路）→ `layout="list"`。
 *
 * 内容直接读 `CANVAS_ADD_CATALOG`（组序 / 项序就是目录的，每组第一项是带快捷字母
 * 的那项），⛔ 不另造一张表、⛔ 不在这里重排。行尾字母从 `canvasQuickAddLetter` 反查。
 *
 * ── 布局 ─────────────────────────────────────────────────────────────────
 * `grid`：≥1024（`desk:`）四列并排、列间细分隔线；更窄折成两列两行。宽度以内容为准
 * （`w-max` + `whitespace-nowrap`），⛔ 截断 —— ja / en 的名字更长就整块更宽。
 * `list`：单列分组（侧栏面板 264 宽）。
 *
 * ── 键盘 ─────────────────────────────────────────────────────────────────
 * Radix 的 Menu 只有一维的 ↑↓（←→ 留给子菜单），做不了四列，所以这里自己管一套
 * roving tabindex：↑↓ 列内、←→ 跨列、↓ 走到列底进底部动作行；Enter / 空格是按钮
 * 原生的点击。开着时按 T / I / A / V 直接建对应项（`stopPropagation`，⛔ 让 window
 * 上那份全局快捷键再落一张到视口中央）。Esc / 点外的开合交给宿主的 Radix Popover；
 * 焦点归还自己管（`useCanvasMenuFocusReturn`，见那里的注释）。
 */

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Images, Table, Upload } from '@/components/icons'
import { useTranslations } from 'next-intl'

import {
  CANVAS_ADD_CATALOG,
  type CanvasAddIntentId,
} from '@/constants/canvas-add-catalog'
import {
  CANVAS_FOCUS_ROOT_ATTR,
  CANVAS_SHELL_LAYOUT,
  canvasQuickAddLetter,
} from '@/constants/canvas-shell'
import { cn } from '@/lib/utils'

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

import { CANVAS_ADD_INTENT_ICONS } from '../../canvas-add-intent-icons'

/**
 * 焦点「无处可去」：落在 body、已摘掉的节点、还在收起动画里的菜单层，或画布容器本身
 * （那不是一个控件）。这几种都该还回去；用户点到了别的真控件就留在那儿。
 */
function isStrayFocus(active: Element | null): boolean {
  if (!active || active === document.body || !active.isConnected) return true
  if (active.hasAttribute(CANVAS_FOCUS_ROOT_ATTR)) return true
  return active.closest('[role="menu"], [data-slot="popover-content"]') !== null
}

/** 从菜单的锚 / 触发按钮找到同一张画布的容器（`CANVAS_FOCUS_ROOT_ATTR`）。 */
function canvasFocusRootOf(element: Element): HTMLElement | null {
  return (
    element
      .closest('[data-canvas-stage]')
      ?.querySelector<HTMLElement>(`[${CANVAS_FOCUS_ROOT_ATTR}]`) ?? null
  )
}

/**
 * 加节点菜单收起后焦点还到哪（四个弹层入口共用）：
 * · `trigger`（底栏 ＋、空画布引导）→ 还给触发按钮；按钮已经不在（引导页落卡即卸）→ 退到画布容器；
 * · `canvas`（双击 / 右键，锚只是一个点）→ 还给画布容器，T / I / A / V 接着能用。
 *
 * 为什么不交给 Radix 的 `onCloseAutoFocus`：它只在内容**卸载**时才还，而内容要等
 * 收起动画（`animate-out`）播完才卸 —— 那之前焦点一直停在菜单里那一行（无
 * aria-label 的 BUTTON，真机读到的就是它；后台标签页动画不走，干脆永远不还）；
 * 点外面时它又干脆不还（`hasInteractedOutside`），焦点掉回 body。所以收起的那一下
 * 就地还一次，卸载时（`onCloseAutoFocus`，先 `preventDefault` 拦下 Radix 的那份）
 * 再补一次 —— 两次都只在焦点「无处可去」时才动。
 */
export function useCanvasMenuFocusReturn(returnTo: 'trigger' | 'canvas') {
  const anchorRef = useRef<HTMLElement | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  const setAnchor = useCallback((element: HTMLElement | null) => {
    anchorRef.current = element
    if (element) rootRef.current = canvasFocusRootOf(element)
  }, [])
  const restore = useCallback(() => {
    const anchor = anchorRef.current
    const target =
      returnTo === 'trigger' && anchor?.isConnected ? anchor : rootRef.current
    if (!target?.isConnected || !isStrayFocus(document.activeElement)) return
    target.focus({ preventScroll: true })
  }, [returnTo])
  return { setAnchor, restore }
}

/** 菜单交出去的四件事；落点由宿主决定（指针处 / 可见区）。 */
export interface CanvasAddMenuActions {
  onAdd(intentId: CanvasAddIntentId): void
  /** 「上传… ⌘U」：系统选文件，按 MIME 落成图片 / 声音 / 视频卡。 */
  onUpload(): void
  /** 「从素材库选」：切到左侧素材库那一格。 */
  onPickFromLibrary(): void
  /** 「镜头表」：没有就建，有了就转过去（项目级一张，⛔ 不进目录）。 */
  onShotTable(): void
}

export interface CanvasAddMenuEntry {
  readonly key: string
  readonly icon: ComponentType<{ className?: string }>
  readonly label: string
  /** 行尾的键：快捷字母（大写）或 ⌘U。 */
  readonly shortcut?: string
  /** 只有目录项有：它的快捷字母（小写），菜单开着时直接按它建。 */
  readonly letter?: string
  readonly testId: string
  run(): void
}

export interface CanvasAddMenuModel {
  readonly groups: readonly {
    readonly id: string
    readonly label: string
    readonly entries: readonly CanvasAddMenuEntry[]
  }[]
  readonly footer: readonly CanvasAddMenuEntry[]
}

/** 菜单的数据：目录四组 + 底部三件动作。右键子菜单也读这一份。 */
export function useCanvasAddMenuModel(
  actions: CanvasAddMenuActions,
): CanvasAddMenuModel {
  const tNode = useTranslations('StudioNode')
  const tAdd = useTranslations('StudioNode.shell.add')
  const { onAdd, onUpload, onPickFromLibrary, onShotTable } = actions
  return useMemo(
    () => ({
      groups: CANVAS_ADD_CATALOG.map((group) => ({
        id: group.id,
        label: tNode(`addCatalog.groups.${group.id}`),
        entries: group.items.map((item) => {
          const letter = canvasQuickAddLetter(item.id)
          return {
            key: item.id,
            icon: CANVAS_ADD_INTENT_ICONS[item.id],
            label: tNode(`addCatalog.items.${item.labelKey}.label`),
            ...(letter ? { letter, shortcut: letter.toUpperCase() } : {}),
            testId: `canvas-add-${item.id}`,
            run: () => onAdd(item.id),
          }
        }),
      })),
      footer: [
        {
          key: 'upload',
          icon: Upload,
          label: tAdd('uploadMenu'),
          shortcut: '⌘U',
          testId: 'canvas-add-upload',
          run: onUpload,
        },
        {
          key: 'library',
          icon: Images,
          label: tNode('addCatalog.pickFromLibrary'),
          testId: 'canvas-add-library',
          run: onPickFromLibrary,
        },
        {
          key: 'shotTable',
          icon: Table,
          label: tAdd('shotTable'),
          testId: 'canvas-add-shot-table',
          run: onShotTable,
        },
      ],
    }),
    [tNode, tAdd, onAdd, onUpload, onPickFromLibrary, onShotTable],
  )
}

/**
 * 两种底色上的同一行：弹层（`float` + `pop`，ui-spec §9 菜单）与侧栏面板（画布玻璃，
 * `node-*` 那套前景）。⚠ 弹层 portal 到 body，不在 `.domain-canvas` 里，读不到 `node-*`。
 */
const TONE = {
  popover: {
    row: 'text-popover-foreground focus-visible:bg-accent',
    icon: 'text-ink-2',
    muted: 'text-muted-foreground',
    divider: 'border-border',
  },
  panel: {
    row: 'text-node-foreground focus-visible:bg-node-panel-inner',
    icon: 'text-node-muted',
    muted: 'text-node-muted',
    divider: 'border-node-panel-inner',
  },
} as const

export type CanvasAddMenuTone = keyof typeof TONE

/** 一行的内容（图标 · 名 · 行尾键）—— 菜单按钮与右键子菜单的 Radix 项共用。 */
export function CanvasAddMenuRowBody({
  entry,
  tone,
}: {
  readonly entry: CanvasAddMenuEntry
  readonly tone: CanvasAddMenuTone
}) {
  const Icon = entry.icon
  return (
    <>
      <Icon className={cn('size-4 shrink-0', TONE[tone].icon)} aria-hidden />
      <span className="whitespace-nowrap">{entry.label}</span>
      {entry.shortcut ? (
        <kbd
          data-testid={`${entry.testId}-shortcut`}
          className={cn(
            'ml-auto pl-2 font-mono text-2xs whitespace-nowrap',
            TONE[tone].muted,
          )}
        >
          {entry.shortcut}
        </kbd>
      ) : null}
    </>
  )
}

/** 把一次按键认成某一项的快捷字母（认 `code` 兜住非 QWERTY 输入法下的 `key`）。 */
export function findCanvasAddLetterEntry(
  model: CanvasAddMenuModel,
  event: Pick<
    KeyboardEvent,
    'key' | 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'
  >,
): CanvasAddMenuEntry | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return undefined
  }
  const key = event.key.toLowerCase()
  return model.groups
    .flatMap((group) => group.entries)
    .find(
      (entry) =>
        entry.letter !== undefined &&
        (key === entry.letter ||
          event.code === `Key${entry.letter.toUpperCase()}`),
    )
}

/** 键盘走位的网格：列（目录四组）+ 底部一行。`list` 布局是一列装下全部。 */
export interface CanvasAddMenuNav {
  readonly columns: readonly (readonly string[])[]
  readonly footer: readonly string[]
}

export type CanvasAddMenuDirection = 'up' | 'down' | 'left' | 'right'

const DIRECTION_BY_KEY: Partial<Record<string, CanvasAddMenuDirection>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

/**
 * 下一格。列内 ↑↓；←→ 跨到相邻列的同一行（短列夹到末行）；列底再 ↓ 进底部那一行
 * （按列号就近）；底部那一行 ←→ 横走、↑ 回到对应列的末行。走不动就原地。
 */
export function nextCanvasAddMenuKey(
  nav: CanvasAddMenuNav,
  current: string,
  direction: CanvasAddMenuDirection,
): string {
  const footerIndex = nav.footer.indexOf(current)
  if (footerIndex >= 0) {
    if (direction === 'left') return nav.footer[footerIndex - 1] ?? current
    if (direction === 'right') return nav.footer[footerIndex + 1] ?? current
    if (direction === 'up') {
      const column =
        nav.columns[Math.min(footerIndex, nav.columns.length - 1)] ?? []
      return column[column.length - 1] ?? current
    }
    return current
  }
  const col = nav.columns.findIndex((column) => column.includes(current))
  if (col < 0) return current
  const column = nav.columns[col] ?? []
  const row = column.indexOf(current)
  if (direction === 'up') return column[row - 1] ?? current
  if (direction === 'down') {
    return (
      column[row + 1] ??
      nav.footer[Math.min(col, nav.footer.length - 1)] ??
      current
    )
  }
  const target = nav.columns[direction === 'left' ? col - 1 : col + 1]
  if (!target || target.length === 0) return current
  return target[Math.min(row, target.length - 1)] ?? current
}

export type CanvasAddMenuLayout = 'grid' | 'list'

export interface CanvasAddMenuProps extends CanvasAddMenuActions {
  readonly layout: CanvasAddMenuLayout
  readonly tone: CanvasAddMenuTone
}

export function CanvasAddMenu({
  layout,
  tone,
  ...actions
}: CanvasAddMenuProps) {
  const tPanels = useTranslations('StudioNode.shell.panels')
  const model = useCanvasAddMenuModel(actions)
  const headingPrefix = useId()
  const grid = layout === 'grid'

  const nav = useMemo<CanvasAddMenuNav>(() => {
    const columns = model.groups.map((group) =>
      group.entries.map((entry) => entry.key),
    )
    const footer = model.footer.map((entry) => entry.key)
    return grid
      ? { columns, footer }
      : { columns: [[...columns.flat(), ...footer]], footer: [] }
  }, [model, grid])

  const firstKey = nav.columns[0]?.[0] ?? ''
  const [activeKey, setActiveKey] = useState(firstKey)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const registerRow = useCallback(
    (key: string) => (element: HTMLButtonElement | null) => {
      if (element) rowRefs.current.set(key, element)
      else rowRefs.current.delete(key)
    },
    [],
  )

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return
    const letterEntry = findCanvasAddLetterEntry(model, event)
    if (letterEntry) {
      event.preventDefault()
      event.stopPropagation()
      letterEntry.run()
      return
    }
    const direction = DIRECTION_BY_KEY[event.key]
    if (!direction) return
    event.preventDefault()
    event.stopPropagation()
    const next = nextCanvasAddMenuKey(nav, activeKey, direction)
    setActiveKey(next)
    rowRefs.current.get(next)?.focus()
  }

  const renderRow = (entry: CanvasAddMenuEntry, fill: boolean) => (
    <button
      key={entry.key}
      ref={registerRow(entry.key)}
      type="button"
      role="menuitem"
      tabIndex={entry.key === activeKey ? 0 : -1}
      data-testid={entry.testId}
      onFocus={() => setActiveKey(entry.key)}
      onClick={entry.run}
      className={cn(
        'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-2sm transition-colors duration-fast hover:tint-hover focus-visible:outline-none touch-target-y coarse:h-11',
        fill ? 'w-full' : 'shrink-0',
        TONE[tone].row,
      )}
    >
      <CanvasAddMenuRowBody entry={entry} tone={tone} />
    </button>
  )

  return (
    <div
      role="menu"
      aria-label={tPanels('addNode')}
      data-testid="canvas-add-menu"
      data-layout={layout}
      onKeyDown={onKeyDown}
      className={cn(grid && 'w-max')}
    >
      <div
        className={cn(
          grid ? 'grid grid-cols-2 desk:grid-cols-4' : 'flex flex-col gap-0.5',
        )}
      >
        {model.groups.map((group, index) => (
          <div
            key={group.id}
            role="group"
            aria-labelledby={`${headingPrefix}-${group.id}`}
            data-testid={`canvas-add-group-${group.id}`}
            className={cn(
              'flex flex-col gap-0.5',
              grid
                ? [
                    'px-1',
                    index % 2 === 1 && 'border-l',
                    index === 2 && 'desk:border-l',
                    index >= 2 &&
                      'max-desk:mt-2 max-desk:border-t max-desk:pt-2',
                  ]
                : index > 0 && 'mt-1 border-t pt-1.5',
              TONE[tone].divider,
            )}
          >
            <p
              id={`${headingPrefix}-${group.id}`}
              className={cn('px-2.5 pt-0.5 pb-1 text-2xs', TONE[tone].muted)}
            >
              {group.label}
            </p>
            {group.entries.map((entry) => renderRow(entry, true))}
          </div>
        ))}
      </div>
      <div
        role="group"
        data-testid="canvas-add-footer"
        className={cn(
          'mt-2 border-t pt-1.5',
          grid ? 'flex items-center gap-0.5 px-1' : 'flex flex-col gap-0.5',
          TONE[tone].divider,
        )}
      >
        {model.footer.map((entry, index) => (
          <FooterSlot
            key={entry.key}
            spacer={grid && index === model.footer.length - 1}
          >
            {renderRow(entry, !grid)}
          </FooterSlot>
        ))}
      </div>
    </div>
  )
}

/** 底部那一行最后一件（镜头表）推到右端：前面垫一段弹性空白。 */
function FooterSlot({
  spacer,
  children,
}: {
  readonly spacer: boolean
  readonly children: ReactNode
}) {
  return (
    <>
      {spacer ? <span aria-hidden className="min-w-4 flex-1" /> : null}
      {children}
    </>
  )
}

export interface CanvasAddMenuPopoverProps extends CanvasAddMenuActions {
  readonly open: boolean
  onOpenChange(open: boolean): void
  /**
   * 锚：`trigger` = `children` 是触发按钮（Radix 管开合，收起后焦点还给它）；
   * `point` = `children` 是一个摆在指针处的零尺寸元素（双击空白，收起后焦点还给画布容器）。
   */
  readonly anchor: 'trigger' | 'point'
  readonly children: ReactNode
  readonly side?: 'top' | 'bottom'
  readonly align?: 'start' | 'center'
  readonly sideOffset?: number
  readonly testId?: string
}

/**
 * 弹层壳：ui-spec §9 菜单（圆角 12、`float` + `pop`），开合用 `PopoverContent` 内置的
 * CSS animation（`animate-in fade-in-0 zoom-in-95`，原点 = Radix 算的锚点方向）——
 * ⛔ transition + rAF（后台标签会卡在起始帧）。靠视口边时 Radix 翻面 / 贴边，留 16。
 *
 * 选中任何一项都先关菜单再交出去。收起后焦点归还见 `useCanvasMenuFocusReturn`。
 */
export function CanvasAddMenuPopover({
  open,
  onOpenChange,
  anchor,
  children,
  side = 'bottom',
  align = 'start',
  sideOffset = 0,
  testId = 'canvas-add-menu-popover',
  onAdd,
  onUpload,
  onPickFromLibrary,
  onShotTable,
}: CanvasAddMenuPopoverProps) {
  const { setAnchor, restore: restoreFocus } = useCanvasMenuFocusReturn(
    anchor === 'trigger' ? 'trigger' : 'canvas',
  )
  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
    if (!next) restoreFocus()
  }
  const closeThen =
    <A extends unknown[]>(run: (...args: A) => void) =>
    (...args: A) => {
      handleOpenChange(false)
      run(...args)
    }
  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {anchor === 'trigger' ? (
        <PopoverTrigger asChild ref={setAnchor}>
          {children}
        </PopoverTrigger>
      ) : (
        <PopoverAnchor asChild ref={setAnchor}>
          {children}
        </PopoverAnchor>
      )}
      <PopoverContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={CANVAS_SHELL_LAYOUT.edgeInsetPx}
        data-testid={testId}
        className="w-auto p-1.5"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus()
        }}
      >
        <CanvasAddMenu
          layout="grid"
          tone="popover"
          onAdd={closeThen(onAdd)}
          onUpload={closeThen(onUpload)}
          onPickFromLibrary={closeThen(onPickFromLibrary)}
          onShotTable={closeThen(onShotTable)}
        />
      </PopoverContent>
    </Popover>
  )
}
