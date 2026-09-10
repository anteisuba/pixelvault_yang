'use client'

/**
 * **无常驻加号**的两条就地路（S7 §7 · 画板 `ChromeAdd.dc.html`）：
 * · 双击空白 → 四颗小图标，点即在此落空卡；
 * · 右键空白 → 新建四类 + 粘贴 / 整理布局 / 适配视图。
 *
 * ⚠ 四类的身份读 `CANVAS_SHELL_QUICK_ADD`（→ `CANVAS_ADD_CATALOG` 的 `intent.v4`），
 * 与 ⌘K、与快捷键 T/I/A/V **同一张表**，⛔ 三条路不各推一遍 `{kind, subtype}`。
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { XYPosition } from '@xyflow/react'
import { Film, ImageIcon, Mic2, Type, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  CANVAS_SHELL_LAYOUT,
  CANVAS_SHELL_QUICK_ADD,
} from '@/constants/canvas-shell'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import type { CanvasAddIntentId } from '@/constants/canvas-add-catalog'

import { ShellIconButton } from './ShellIconButton'

const KIND_ICONS = {
  [NODE_MEDIA_KIND_IDS.text]: Type,
  [NODE_MEDIA_KIND_IDS.image]: ImageIcon,
  [NODE_MEDIA_KIND_IDS.audio]: Mic2,
  [NODE_MEDIA_KIND_IDS.video]: Film,
} as const

/**
 * 就地浮层的**贴边收拢**：量出自己的盒子，超出画布容器就往回收。
 *
 * ⚠ 判据是**容器**（chrome 层，与落点同一个坐标系），⛔ 不是 `window.innerHeight`：
 * 画布上方还有一条顶栏、左边还有应用侧栏，用视口算会让菜单在贴边时露不全。
 */
function useClampedAnchor(
  at: XYPosition | null,
  ref: React.RefObject<HTMLDivElement | null>,
): XYPosition | null {
  /**
   * 量到的那一次连同**它量的是哪个落点**一起存：换落点后、新的一次测量落地前，
   * 返回 `null` 让调用方退回原始落点。
   *
   * ⚠ 只在真的量到盒子时才写 state —— 「没落点就清空」那种同步 setState 会白跑
   * 一轮渲染（`react-hooks/set-state-in-effect`），而且清空本来就可以靠比对得出。
   */
  const [measured, setMeasured] = useState<{
    readonly anchor: XYPosition
    readonly value: XYPosition
  } | null>(null)
  useLayoutEffect(() => {
    if (!at) return
    const element = ref.current
    const parent = element?.parentElement
    if (!element || !parent) return
    const box = element.getBoundingClientRect()
    const host = parent.getBoundingClientRect()
    setMeasured({
      anchor: at,
      value: {
        x: Math.max(0, Math.min(at.x, host.width - box.width)),
        y: Math.max(0, Math.min(at.y, host.height - box.height)),
      },
    })
  }, [at, ref])
  return measured !== null && measured.anchor === at ? measured.value : null
}

/** 点外 / Esc 关掉。⚠ 与添加菜单同一条「一次退一层」：Esc 在这里被吃掉。 */
function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && ref.current?.contains(target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])
  return ref
}

export interface ShellQuickAddProps {
  /** 落点（相对画布容器的屏幕坐标）；`null` = 不显示。 */
  readonly at: XYPosition | null
  onAdd(intentId: CanvasAddIntentId): void
  /** 第五颗：系统选文件，按 MIME 落成图片 / 声音 / 视频卡（S7 §7 owner 追加）。 */
  onUpload(): void
  onClose(): void
}

export function ShellQuickAdd({
  at,
  onAdd,
  onUpload,
  onClose,
}: ShellQuickAddProps) {
  const t = useTranslations('StudioNode.shell.add')
  const ref = useDismiss(at !== null, onClose)
  const anchor = useClampedAnchor(at, ref)
  if (!at) return null

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t('group')}
      data-testid="shell-quick-add"
      style={{
        left: anchor?.x ?? at.x,
        top: anchor?.y ?? at.y,
        borderRadius: CANVAS_SHELL_LAYOUT.glassRadiusPx,
      }}
      className="canvas-glass pointer-events-auto absolute z-canvas-transient inline-flex gap-0.5 p-1"
    >
      {CANVAS_SHELL_QUICK_ADD.map((entry) => (
        <ShellIconButton
          key={entry.kind}
          icon={KIND_ICONS[entry.kind]}
          label={t(entry.kind)}
          testId={`shell-quick-add-${entry.kind}`}
          onClick={() => onAdd(entry.intentId)}
        />
      ))}
      <ShellIconButton
        icon={Upload}
        label={t('upload')}
        testId="shell-quick-add-upload"
        onClick={onUpload}
      />
    </div>
  )
}

export interface ShellPaneMenuProps {
  readonly at: XYPosition | null
  onAdd(intentId: CanvasAddIntentId): void
  /** 「上传… ⌘U」：与双击那颗、与 ⌘K 那条**同一件事**。 */
  onUpload(): void
  onPaste(): void
  onTidyLayout(): void
  onFitView(): void
  onClose(): void
}

export function ShellPaneMenu({
  at,
  onAdd,
  onUpload,
  onPaste,
  onTidyLayout,
  onFitView,
  onClose,
}: ShellPaneMenuProps) {
  const t = useTranslations('StudioNode.shell.add')
  const ref = useDismiss(at !== null, onClose)
  const anchor = useClampedAnchor(at, ref)
  if (!at) return null

  const rows: readonly {
    key: string
    label: string
    kbd: string
    run(): void
  }[] = [
    { key: 'paste', label: t('paste'), kbd: '⌘V', run: onPaste },
    { key: 'tidy', label: t('tidy'), kbd: '⇧A', run: onTidyLayout },
    { key: 'fit', label: t('fit'), kbd: '⇧1', run: onFitView },
  ]

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t('menu')}
      data-testid="shell-pane-menu"
      style={{
        left: anchor?.x ?? at.x,
        top: anchor?.y ?? at.y,
        width: CANVAS_SHELL_LAYOUT.paneMenuWidthPx,
      }}
      className="pointer-events-auto absolute z-canvas-transient rounded-xl border border-node-panel-inner bg-node-panel p-1.5 text-node-foreground shadow-node-menu"
    >
      <p className="px-2.5 py-1 text-2xs text-node-muted">{t('group')}</p>
      {CANVAS_SHELL_QUICK_ADD.map((entry) => {
        const Icon = KIND_ICONS[entry.kind]
        return (
          <button
            key={entry.kind}
            type="button"
            role="menuitem"
            data-testid={`shell-pane-menu-${entry.kind}`}
            onClick={() => onAdd(entry.intentId)}
            className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors hover:bg-node-panel-inner"
          >
            <Icon className="size-4 shrink-0 text-node-muted" aria-hidden />
            <span>{t(entry.kind)}</span>
            <kbd className="ml-auto rounded border border-node-panel-inner px-1.5 text-2xs text-node-muted">
              {entry.letter.toUpperCase()}
            </kbd>
          </button>
        )
      })}
      <button
        type="button"
        role="menuitem"
        data-testid="shell-pane-menu-upload"
        onClick={onUpload}
        className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors hover:bg-node-panel-inner"
      >
        <Upload className="size-4 shrink-0 text-node-muted" aria-hidden />
        <span>{t('uploadMenu')}</span>
        <kbd className="ml-auto rounded border border-node-panel-inner px-1.5 text-2xs text-node-muted">
          ⌘U
        </kbd>
      </button>
      <div className="my-1 h-px bg-node-panel-inner" aria-hidden />
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          role="menuitem"
          data-testid={`shell-pane-menu-${row.key}`}
          onClick={row.run}
          className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors hover:bg-node-panel-inner"
        >
          <span>{row.label}</span>
          <kbd className="ml-auto rounded border border-node-panel-inner px-1.5 text-2xs text-node-muted">
            {row.kbd}
          </kbd>
        </button>
      ))}
    </div>
  )
}
