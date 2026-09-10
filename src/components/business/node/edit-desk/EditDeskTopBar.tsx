'use client'

/**
 * 剪辑台顶栏（画板 `EditDesk.dc.html` 第一条 48 高）：
 * **回画布 · 成片名（可改）· 读数 · 撤销 · 导出**。
 *
 * ⚠ 只有这五样。画布顶栏的项目胶囊 / 助手不在这里 —— 剪辑台是全屏模式，进来就是
 * 为了剪一条片子，⛔ 不把外壳的东西再摆一遍。
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Undo2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  EDIT_DESK_LAYOUT,
  EDIT_PROJECT_NAME_MAX_LENGTH,
} from '@/constants/edit-desk'
import { formatEditDurationShort } from '@/lib/edit-project'
import { cn } from '@/lib/utils'
import type { EditProject } from '@/types/node-workflow'

import { ShellIconButton } from '../workbench-v4/shell/ShellIconButton'

export interface EditDeskTopBarProps {
  readonly project: EditProject
  readonly durationSec: number
  readonly canUndo: boolean
  onUndo(): void
  onBack(): void
  onRename(name: string): void
  onExport(): void
  /** 提案还摆在轨道上时导出是歧义的（S10）——灰掉，点了给一句话。 */
  readonly exportDisabled?: boolean
}

export function EditDeskTopBar({
  project,
  durationSec,
  canUndo,
  onUndo,
  onBack,
  onRename,
  onExport,
  exportDisabled = false,
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
      style={{ height: EDIT_DESK_LAYOUT.topBarHeightPx }}
      className="flex shrink-0 items-center gap-3 border-b border-border bg-card pl-2 pr-3"
    >
      <button
        type="button"
        data-testid="edit-desk-back"
        onClick={onBack}
        className="inline-flex h-8 items-center gap-1.5 rounded-md pl-1.5 pr-2.5 text-xs text-foreground transition-colors duration-fast hover:bg-muted"
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
            className="h-7 max-w-56 rounded-md border border-input bg-background px-2 text-sm font-semibold text-foreground outline-none"
          />
        ) : (
          <button
            type="button"
            data-testid="edit-desk-name"
            onClick={() => {
              setDraft(project.name)
              setEditing(true)
            }}
            className="max-w-56 truncate rounded-md px-1 text-sm font-semibold text-foreground transition-colors duration-fast hover:bg-muted"
          >
            {project.name}
          </button>
        )}
        <span
          data-testid="edit-desk-readout"
          className="text-xs tabular-nums text-muted-foreground"
        >
          {t('readout', {
            duration: formatEditDurationShort(durationSec),
            aspect: project.settings.aspect,
            resolution: project.settings.resolution,
          })}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ShellIconButton
          icon={Undo2}
          label={t('undo')}
          disabled={!canUndo}
          testId="edit-desk-undo"
          onClick={onUndo}
        />
        <button
          type="button"
          data-testid="edit-desk-export"
          onClick={onExport}
          aria-disabled={exportDisabled}
          className={cn(
            'inline-flex h-8 items-center rounded-lg bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-transform duration-fast active:scale-[.98] motion-reduce:transition-none',
            exportDisabled && 'opacity-50',
          )}
        >
          {t('export')}
        </button>
      </div>
    </div>
  )
}
