'use client'

/**
 * 剪辑台头部那一行（画板「剪辑台 A · 全部状态」：工作台地台上的 `h-9` 头部，⛔ 不再是
 * 一条带底边的白色顶栏）：**回画布 · 成片名（可改）· 读数 / 导出进度 · 撤销 · 快捷键 ·
 * 导出**，最右那一格留给助手头像。
 *
 * ⚠ 只有这几样。画布顶栏的项目胶囊不在这里 —— 剪辑台是全屏模式，进来就是为了剪一条
 * 片子，⛔ 不把外壳的东西再摆一遍。
 */

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, Keyboard, Undo2 } from '@/components/icons'
import { useTranslations } from 'next-intl'

import {
  EDIT_PROJECT_NAME_MAX_LENGTH,
  EDIT_SHORTCUT_ACTIONS,
  EDIT_SHORTCUT_POPOVER_WIDTH_PX,
  EDIT_SHORTCUT_PRESETS,
  EDIT_SHORTCUT_PRESET_KEYS,
  type EditShortcutPresetId,
} from '@/constants/edit-desk'
import { formatEditDurationShort } from '@/lib/edit-project'
import { cn } from '@/lib/utils'
import type { EditProject } from '@/types/node-workflow'

import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

import { ShellIconButton } from '../workbench-v4/shell/ShellIconButton'

export interface EditDeskTopBarProps {
  readonly project: EditProject
  readonly durationSec: number
  readonly canUndo: boolean
  onUndo(): void
  onBack(): void
  onRename(name: string): void
  onExport(): void
  /**
   * 给助手头像留出最右那一格：头像是 Dock 自己那颗 `fixed` 开关，落在
   * `EDIT_DESK_OPERATOR_ANCHOR`（= 图片台布局 A）的位置，头部只负责不在它底下摆东西。
   */
  readonly reserveAssistantSlot?: boolean
  /** 当前快捷键预设（S8d）。 */
  readonly shortcutPreset: EditShortcutPresetId
  onShortcutPresetChange(preset: EditShortcutPresetId): void
  /**
   * 导出中 / 上次没跑完（「时长 / 比例 / 清晰度」那一格换成进度或一句话 + 键）。
   * 缺席 = 读数。⛔ 不在头部下面另起一条栏。
   */
  readonly status?: ReactNode
}

export function EditDeskTopBar({
  project,
  durationSec,
  canUndo,
  onUndo,
  onBack,
  onRename,
  onExport,
  reserveAssistantSlot = false,
  shortcutPreset,
  onShortcutPresetChange,
  status,
}: EditDeskTopBarProps) {
  const t = useTranslations('StudioNode.editDesk')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(project.name)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = () => {
    setEditing(false)
    onRename(draft)
  }

  return (
    <div
      data-testid="edit-desk-top-bar"
      className={cn(
        'flex h-9 shrink-0 items-center gap-3',
        // 头像 36 + 与导出键的间距 12（头像本身住在地台内边距那 18 里）。
        reserveAssistantSlot && 'pr-12',
      )}
    >
      <button
        type="button"
        data-testid="edit-desk-back"
        onClick={onBack}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg pl-1.5 pr-3 text-2sm text-muted-foreground transition-colors duration-fast hover:bg-surface-fill hover:text-foreground"
      >
        <ChevronLeft className="size-4 shrink-0" aria-hidden />
        <span>{t('back')}</span>
      </button>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2.5">
        {editing ? (
          <input
            ref={inputRef}
            data-testid="edit-desk-name-input"
            value={draft}
            maxLength={EDIT_PROJECT_NAME_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit()
              if (event.key === 'Escape') {
                setDraft(project.name)
                setEditing(false)
              }
              event.stopPropagation()
            }}
            className="h-7 max-w-56 rounded-md border border-input bg-card px-2 text-md font-semibold text-foreground outline-none"
          />
        ) : (
          <button
            type="button"
            data-testid="edit-desk-name"
            onClick={() => {
              setDraft(project.name)
              setEditing(true)
            }}
            className="max-w-56 truncate rounded-md px-1 text-md font-semibold text-foreground transition-colors duration-fast hover:bg-surface-fill"
          >
            {project.name}
          </button>
        )}
        {status ?? (
          <span
            data-testid="edit-desk-readout"
            className="font-mono text-xs tabular-nums text-muted-foreground"
          >
            {t('readout', {
              duration: formatEditDurationShort(durationSec),
              aspect: project.settings.aspect,
              resolution: project.settings.resolution,
            })}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <ShellIconButton
          icon={Undo2}
          label={t('undo')}
          disabled={!canUndo}
          testId="edit-desk-undo"
          onClick={onUndo}
        />
        <ShortcutPresetPopover
          preset={shortcutPreset}
          onPresetChange={onShortcutPresetChange}
        />
        <button
          type="button"
          data-testid="edit-desk-export"
          onClick={onExport}
          className="ml-1.5 inline-flex h-8 items-center rounded-full bg-primary px-4 text-2sm font-medium text-primary-foreground transition-transform duration-fast active:scale-[.98] motion-reduce:transition-none"
        >
          {t('export')}
        </button>
      </div>
    </div>
  )
}

/**
 * 撤销键旁那颗键盘图标（S8d · 画板 `EditDeskText.dc.html` 右下那一组）。
 *
 * 弹层 = 分段控件二选一 + **当前预设的键位表（只读）**。⛔ 不做逐条改键：一张能改
 * 的表要处理冲突、要能重置、要落库，而这里要解决的问题只有一个 —— 「我手是 FCP
 * 的」。两档预设就把它答完了。
 */
function ShortcutPresetPopover({
  preset,
  onPresetChange,
}: {
  readonly preset: EditShortcutPresetId
  onPresetChange(preset: EditShortcutPresetId): void
}) {
  const t = useTranslations('StudioNode.editDesk.shortcuts')
  const keys = EDIT_SHORTCUT_PRESET_KEYS[preset]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('title')}
          title={t('title')}
          data-testid="edit-desk-shortcuts"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-fast hover:bg-surface-fill hover:text-foreground"
        >
          <Keyboard className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        data-testid="edit-desk-shortcuts-popover"
        style={{ width: EDIT_SHORTCUT_POPOVER_WIDTH_PX }}
        className="flex flex-col gap-2.5 p-3"
      >
        <LiquidSegmented
          ariaLabel={t('title')}
          semantics="radio"
          fill
          value={preset}
          onChange={onPresetChange}
          items={EDIT_SHORTCUT_PRESETS.map((candidate) => ({
            value: candidate,
            label: t(`presets.${candidate}`),
          }))}
        />
        <dl className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 text-2xs">
          {EDIT_SHORTCUT_ACTIONS.map((action) => (
            <Fragment key={action}>
              <dt className="text-foreground">{t(`actions.${action}`)}</dt>
              <dd
                data-testid={`edit-desk-shortcut-${action}`}
                className="justify-self-end rounded-md border border-border px-1.5 py-px font-mono text-3xs text-muted-foreground"
              >
                {keys[action]}
              </dd>
            </Fragment>
          ))}
        </dl>
        <p className="text-3xs text-muted-foreground">{t('finalCutHint')}</p>
      </PopoverContent>
    </Popover>
  )
}
