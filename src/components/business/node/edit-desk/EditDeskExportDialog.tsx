'use client'

/**
 * 导出对话框（spec §6「导出」）：**范围三选 · 「导出到画布」开关 · 分辨率**。
 *
 * ⚠ 本片**只出对话框**。真的按下去要 CF Container 的 ffmpeg 跑规格化 → concat /
 * xfade / 变速 / 混音，那是 S9；这里按下去给一句「渲染层在路上」，⛔ 不发一条
 * 现在跑不通的请求，也⛔ 不悄悄退回旧的 `ffmpeg-api/compose`（那条只能尾裁，
 * 出来的东西和用户在时间线上看到的不是一回事）。
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  EDIT_EXPORT_RANGES,
  EDIT_EXPORT_RANGE_IDS,
  EDIT_RESOLUTIONS,
  type EditExportRangeId,
  type EditResolution,
} from '@/constants/edit-desk'
import { cn } from '@/lib/utils'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface EditDeskExportDialogProps {
  readonly open: boolean
  onOpenChange(open: boolean): void
  /** 有没有标 I / O —— 没标时那一档不能选。 */
  readonly hasInOut: boolean
  /** 有没有选中段 —— 没选时「单段」不能选。 */
  readonly hasSelection: boolean
  readonly resolution: EditResolution
  onResolutionChange(resolution: EditResolution): void
  onExport(options: {
    readonly range: EditExportRangeId
    readonly toCanvas: boolean
  }): void
}

export function EditDeskExportDialog({
  open,
  onOpenChange,
  hasInOut,
  hasSelection,
  resolution,
  onResolutionChange,
  onExport,
}: EditDeskExportDialogProps) {
  const t = useTranslations('StudioNode.editDesk.exportDialog')
  const [range, setRange] = useState<EditExportRangeId>(
    EDIT_EXPORT_RANGE_IDS.all,
  )
  const [toCanvas, setToCanvas] = useState(true)

  const disabledOf = (id: EditExportRangeId): boolean =>
    (id === EDIT_EXPORT_RANGE_IDS.inOut && !hasInOut) ||
    (id === EDIT_EXPORT_RANGE_IDS.clip && !hasSelection)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="edit-desk-export-dialog"
        className="sm:max-w-100"
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="pb-1.5 text-2xs uppercase text-muted-foreground">
            {t('range')}
          </legend>
          {EDIT_EXPORT_RANGES.map((id) => {
            const disabled = disabledOf(id)
            return (
              <label
                key={id}
                className={cn(
                  'flex h-9 items-center gap-2 rounded-md px-2 text-xs',
                  disabled
                    ? 'text-muted-foreground opacity-60'
                    : 'text-foreground hover:bg-muted',
                )}
              >
                <input
                  type="radio"
                  name="edit-desk-export-range"
                  data-testid={`edit-desk-export-range-${id}`}
                  value={id}
                  checked={range === id}
                  disabled={disabled}
                  onChange={() => setRange(id)}
                  className="accent-primary"
                />
                <span>{t(`ranges.${id}`)}</span>
              </label>
            )
          })}
        </fieldset>

        <label className="flex h-9 items-center justify-between rounded-md px-2 text-xs">
          <span>{t('toCanvas')}</span>
          <input
            type="checkbox"
            data-testid="edit-desk-export-to-canvas"
            checked={toCanvas}
            onChange={(event) => setToCanvas(event.target.checked)}
            className="accent-primary"
          />
        </label>

        <label className="flex h-9 items-center justify-between rounded-md px-2 text-xs">
          <span>{t('resolution')}</span>
          <select
            data-testid="edit-desk-export-resolution"
            value={resolution}
            onChange={(event) =>
              onResolutionChange(event.target.value as EditResolution)
            }
            className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
          >
            {EDIT_RESOLUTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <DialogFooter>
          <button
            type="button"
            data-testid="edit-desk-export-confirm"
            onClick={() => onExport({ range, toCanvas })}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground"
          >
            {t('confirm')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
