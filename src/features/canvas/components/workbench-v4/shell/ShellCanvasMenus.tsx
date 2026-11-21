'use client'

/**
 * 画布空白处的两条就地路（node-canvas-v2 §7）：
 * · 双击空白 → `ShellPointerAddMenu`：在光标处弹那一份 `CanvasAddMenu`；
 * · 右键空白 → `ShellPaneMenu`：「添加节点 ›」（子菜单 = 同一份菜单的数据与行，单列
 *   分组）· 上传… ⌘U ‖ 粘贴 / 整理布局 / 适配视图。
 *
 * ⚠ 落点：两条路建的卡都落在**按下去的那个画布坐标**：宿主交进来 `readPointerAnchor`
 *   记下的那一下（`CanvasPointerAnchor`），这里把 `flow` / `client` 绑进 `onAddAt` /
 *   `onUploadAt`（菜单本身只交意图 id）。
 *
 * 右键子菜单为什么是单列：子菜单是 Radix `DropdownMenuSub`，它的 ← 是「收回子菜单」、
 * ↑↓ 是一维的，四列的 ←→ 跨列与之冲突；所以这里用 Radix 原语的单列分组列表，数据与
 * 项序走 `useCanvasAddMenuModel`、行内容走 `CanvasAddMenuRowBody`，与四列菜单同源。
 *
 * 位置：两者都把一个零尺寸元素摆在指针处当锚（相对画布 chrome 层），靠视口边时 Radix
 * 翻面 / 贴边（留 16）。换一个位置再开 = 换一把 `key`，从新指针处重新长出来。
 */

import type { ComponentProps, KeyboardEvent } from 'react'
import type { XYPosition } from '@xyflow/react'
import { Upload } from '@/components/icons'
import { useTranslations } from 'next-intl'

import type { CanvasAddIntentId } from '@/constants/canvas-add-catalog'
import { CANVAS_SHELL_LAYOUT } from '@/constants/canvas-shell'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import {
  CanvasAddMenuPopover,
  CanvasAddMenuRowBody,
  findCanvasAddLetterEntry,
  useCanvasAddMenuModel,
  useCanvasMenuFocusReturn,
  type CanvasAddMenuActions,
} from './CanvasAddMenu'

/**
 * 空白处那一下按在哪 —— 三套坐标各有各的用处，⛔ 别互相顶替：
 * · `screen` 相对画布容器 → 锚的 `left/top`（锚挂在 chrome 层里）
 * · `client` 视口坐标 → 上传落物（`dropFiles` 自己做 `screenToFlowPosition`）
 * · `flow` 画布坐标 → 新建空卡的 `position`
 */
export interface CanvasPointerAnchor {
  readonly screen: XYPosition
  readonly client: XYPosition
  readonly flow: XYPosition
}

/** 指针处两件带坐标的动作；另两件（素材库 / 镜头表）与坐标无关。 */
interface PointerMenuActions extends Pick<
  CanvasAddMenuActions,
  'onPickFromLibrary' | 'onShotTable'
> {
  /** 卡落在按下去的那个画布坐标。 */
  onAddAt(intentId: CanvasAddIntentId, flow: XYPosition): void
  /** 选的文件落在按下去的那一点（视口坐标）。 */
  onUploadAt(client: XYPosition): void
}

/** 把指针坐标绑进菜单的四件动作（菜单本身只交意图 id）。 */
function bindPointer(
  anchor: CanvasPointerAnchor,
  { onAddAt, onUploadAt, onPickFromLibrary, onShotTable }: PointerMenuActions,
): CanvasAddMenuActions {
  return {
    onAdd: (intentId) => onAddAt(intentId, anchor.flow),
    onUpload: () => onUploadAt(anchor.client),
    onPickFromLibrary,
    onShotTable,
  }
}

/** 同一个落点一把钥匙：换地方再开 = 旧的收回、新的从新指针处长出来。 */
function keyOf(anchor: CanvasPointerAnchor): string {
  return `${anchor.screen.x},${anchor.screen.y}`
}

/** 摆在指针处的零尺寸锚（相对画布 chrome 层）；Radix 的 `asChild` 把 ref / 属性落到它上面。 */
function PointerAnchor({
  at,
  ...props
}: { readonly at: XYPosition } & ComponentProps<'span'>) {
  return (
    <span
      aria-hidden
      {...props}
      data-testid="shell-pointer-anchor"
      style={{ left: at.x, top: at.y }}
      className="pointer-events-none absolute size-0"
    />
  )
}

export interface ShellPointerAddMenuProps extends PointerMenuActions {
  /** 双击在哪；`null` = 不显示。 */
  readonly anchor: CanvasPointerAnchor | null
  onClose(): void
}

export function ShellPointerAddMenu({
  anchor,
  onClose,
  ...actions
}: ShellPointerAddMenuProps) {
  if (!anchor) return null
  return (
    <CanvasAddMenuPopover
      key={keyOf(anchor)}
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      anchor="point"
      testId="shell-pointer-add-menu"
      {...bindPointer(anchor, actions)}
    >
      <PointerAnchor at={anchor.screen} />
    </CanvasAddMenuPopover>
  )
}

export interface ShellPaneMenuProps extends PointerMenuActions {
  /** 右键在哪；`null` = 不显示。 */
  readonly anchor: CanvasPointerAnchor | null
  onPaste(): void
  onTidyLayout(): void
  onFitView(): void
  onClose(): void
}

export function ShellPaneMenu({ anchor, ...props }: ShellPaneMenuProps) {
  if (!anchor) return null
  return <PaneMenuLayer key={keyOf(anchor)} anchor={anchor} {...props} />
}

function PaneMenuLayer({
  anchor,
  onPaste,
  onTidyLayout,
  onFitView,
  onClose,
  ...pointerActions
}: ShellPaneMenuProps & { readonly anchor: CanvasPointerAnchor }) {
  const t = useTranslations('StudioNode.shell.add')
  const tPanels = useTranslations('StudioNode.shell.panels')
  const actions = bindPointer(anchor, pointerActions)
  const model = useCanvasAddMenuModel(actions)
  // 锚是一个摸不到的点，没有可还的触发按钮：收起后焦点还给画布容器。
  const { setAnchor, restore: restoreFocus } =
    useCanvasMenuFocusReturn('canvas')

  // 开着时按 T / I / A / V 直接在右键那一点建（Radix 的 typeahead 排在我们后面，
  // `preventDefault` 让它跳过；`stopPropagation` 挡住 window 上那份全局快捷键）。
  const onLetter = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return
    const entry = findCanvasAddLetterEntry(model, event)
    if (!entry) return
    event.preventDefault()
    event.stopPropagation()
    entry.run()
    onClose()
  }

  const rows = [
    { key: 'paste', label: t('paste'), kbd: '⌘V', run: onPaste },
    { key: 'tidy', label: t('tidy'), kbd: '⇧A', run: onTidyLayout },
    { key: 'fit', label: t('fit'), kbd: '⇧1', run: onFitView },
  ] as const

  return (
    <DropdownMenu
      open
      modal={false}
      onOpenChange={(open) => {
        if (open) return
        onClose()
        restoreFocus()
      }}
    >
      <DropdownMenuTrigger asChild ref={setAnchor}>
        <PointerAnchor at={anchor.screen} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={0}
        collisionPadding={CANVAS_SHELL_LAYOUT.edgeInsetPx}
        aria-label={t('menu')}
        data-testid="shell-pane-menu"
        onKeyDown={onLetter}
        // Radix 会把焦点还给锚（一个摸不到的点）：拦下，改还画布容器。
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus()
        }}
      >
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid="shell-pane-menu-add">
            {tPanels('addNode')}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent
              collisionPadding={CANVAS_SHELL_LAYOUT.edgeInsetPx}
              data-testid="shell-pane-menu-add-list"
              onKeyDown={onLetter}
            >
              {model.groups.map((group, index) => (
                <div key={group.id} role="group">
                  {index > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                  {group.entries.map((entry) => (
                    <DropdownMenuItem
                      key={entry.key}
                      data-testid={entry.testId}
                      onSelect={entry.run}
                    >
                      <CanvasAddMenuRowBody entry={entry} tone="popover" />
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
              <DropdownMenuSeparator />
              {model.footer.map((entry) => (
                <DropdownMenuItem
                  key={entry.key}
                  data-testid={entry.testId}
                  onSelect={entry.run}
                >
                  <CanvasAddMenuRowBody entry={entry} tone="popover" />
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuItem
          data-testid="shell-pane-menu-upload"
          onSelect={actions.onUpload}
        >
          <Upload aria-hidden />
          <span>{t('uploadMenu')}</span>
          <DropdownMenuShortcut>⌘U</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {rows.map((row) => (
          <DropdownMenuItem
            key={row.key}
            data-testid={`shell-pane-menu-${row.key}`}
            onSelect={row.run}
          >
            <span>{row.label}</span>
            <DropdownMenuShortcut>{row.kbd}</DropdownMenuShortcut>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
