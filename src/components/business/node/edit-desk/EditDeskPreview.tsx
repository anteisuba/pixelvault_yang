'use client'

/**
 * 中间的预览（画板 `EditDesk.dc.html` 中列）。
 *
 * **本片只做「播当前段」**：播放头落在哪一段，就把那一段的来源 url 交给
 * `VideoPlayer`（S6 那一只，⛔ 不另写一个播放器）。跨段无缝拼播要的是渲染层的
 * 规格化（同分辨率 / 帧率 / timebase），那是 S9 —— 在这之前用一个假的「无缝」
 * 只会让人以为成片就长这样。
 *
 * 播放头落在轨道之外（还没有段 / 拖到片尾之后）时是一块空的比例框 + 一句提示，
 * ⛔ 不放一个点了没反应的播放钮。
 */

import { useTranslations } from 'next-intl'

import { EDIT_ASPECTS } from '@/constants/edit-desk'
import { formatEditClock } from '@/lib/edit-project'
import type { EditTimelineRow } from '@/lib/edit-project'
import type { EditProject } from '@/types/node-workflow'

import { VideoPlayer } from '../nodes/v4/video/VideoPlayer'

export interface EditDeskPreviewProps {
  readonly project: EditProject
  /** 播放头下的那一段（`null` = 轨道之外）。 */
  readonly row: EditTimelineRow | null
  readonly playheadSec: number
  readonly durationSec: number
}

/** 比例 → CSS `aspect-ratio`。⛔ 不在组件里手写 `16/9`。 */
const ASPECT_CSS: Readonly<Record<(typeof EDIT_ASPECTS)[number], string>> = {
  '16:9': '16 / 9',
  '9:16': '9 / 16',
  '1:1': '1 / 1',
}

export function EditDeskPreview({
  project,
  row,
  playheadSec,
  durationSec,
}: EditDeskPreviewProps) {
  const t = useTranslations('StudioNode.editDesk')
  const url = row?.source.url

  return (
    <div
      data-testid="edit-desk-preview"
      className="flex min-h-0 flex-1 items-center justify-center"
    >
      <div
        className="relative w-full max-w-[640px] overflow-hidden rounded-xl bg-muted"
        style={{ aspectRatio: ASPECT_CSS[project.settings.aspect] }}
      >
        {url ? (
          <VideoPlayer
            key={url}
            url={url}
            title={t('previewTitle', { name: project.name })}
            className="size-full"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1">
            <p className="text-xs text-muted-foreground">{t('previewEmpty')}</p>
          </div>
        )}
        {/*
          两个读数**分开放**（S9 修 S8 遗留）：
          - 右上 = **整条时间线**的位置（播放头 / 成片总长）；
          - 左上 = **当前段**的位置（段内已播 / 段长）。
          S8 那一版把段读数也挤在右下，与播放器自己的时间码叠在同一格上，1440
          以下直接糊成一团。⚠ 播放器**底部那一条**（transport + 它自己的时间码）
          是它自己的，所以两个读数都走顶部 —— ⛔ 别塞回底部去跟 transport 抢那一行。
        */}
        <span
          data-testid="edit-desk-clock"
          className="canvas-glass pointer-events-none absolute right-3 top-2 rounded-full px-2 py-0.5 text-2xs tabular-nums"
        >
          {t('clock', {
            at: formatEditClock(playheadSec, true),
            total: formatEditClock(durationSec),
          })}
        </span>
        {row ? (
          <span
            data-testid="edit-desk-clip-clock"
            className="canvas-glass pointer-events-none absolute left-3 top-2 rounded-full px-2 py-0.5 text-2xs tabular-nums"
          >
            {t('clipClock', {
              at: formatEditClock(
                Math.max(0, playheadSec - row.startSec),
                true,
              ),
              total: formatEditClock(row.durationSec),
            })}
          </span>
        ) : null}
      </div>
    </div>
  )
}
