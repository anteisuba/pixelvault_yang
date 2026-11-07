'use client'

/**
 * 「拉哪一段？」（H4a mock ③）：镜头表上「拉片」那颗键弹出来的小单子。
 *
 * - 上半：画布上有片子的片段卡（参考片排前面，卡角写「参考」）；点一张 = 开拉片纸。
 * - 下半：上传一段视频 / 从素材库选 —— 落到画布上那一刻宿主接着开纸（片子先成卡，
 *   拉片只从卡上拉，⛔ 不另开一条不落卡的路）。
 * - 画布上恰好只有一张参考片时不弹单子，直接拉它。
 */

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { Film, FolderOpen, Upload } from '@/components/icons'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { formatPullClock } from '@/lib/shot-pull-frames'
import { isPullSourceNode, isReferenceClip } from '@/lib/shot-pull-plan'
import { getVideoPosterUrl } from '@/lib/video-poster'
import type { NodeV4 } from '@/types/node-workflow'

export interface ShotPullSourceActions {
  onPull(clipNodeId: string): void
  onUpload?(): void
  onLibrary?(): void
}

interface PullSourceItem {
  readonly id: string
  readonly name: string
  readonly poster: string | null
  readonly durationSec?: number
  readonly reference: boolean
}

/** 能拉的片：参考片在前，其余按画布上的顺序。 */
export function listPullSources(
  nodes: readonly NodeV4[],
): readonly PullSourceItem[] {
  const items: PullSourceItem[] = []
  for (const node of nodes) {
    if (!isPullSourceNode(node) || node.data.kind !== 'video') continue
    items.push({
      id: node.id,
      name: node.data.name,
      poster: node.data.videoThumbnailUrl ?? getVideoPosterUrl(node.data.url),
      ...(node.data.durationSec ? { durationSec: node.data.durationSec } : {}),
      reference: isReferenceClip(node),
    })
  }
  return [
    ...items.filter((item) => item.reference),
    ...items.filter((item) => !item.reference),
  ]
}

export function ShotPullSourcePicker({
  nodes,
  actions,
  align = 'start',
  children,
}: {
  readonly nodes: readonly NodeV4[]
  readonly actions: ShotPullSourceActions
  readonly align?: 'start' | 'end'
  /** 触发键（`asChild`）。 */
  readonly children: ReactNode
}) {
  const t = useTranslations('StudioNode.shotTable')
  const [open, setOpen] = useState(false)
  const sources = listPullSources(nodes)
  const references = sources.filter((item) => item.reference)
  const only = references.length === 1 ? references[0] : undefined

  const pick = (clipNodeId: string) => {
    setOpen(false)
    actions.onPull(clipNodeId)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // 只有一张参考片：键就是「拉它」，不多问一句。
        if (next && only) {
          actions.onPull(only.id)
          return
        }
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        data-testid="shot-pull-picker"
        className="nodrag w-80 p-1.5"
      >
        <p className="px-2 pb-1.5 pt-1 text-sm font-semibold">
          {t('pull.picker.title')}
        </p>
        {sources.length > 0 ? (
          <>
            <p className="px-2 pb-1 text-xs text-muted-foreground">
              {t('pull.picker.canvas')}
            </p>
            <ul className="flex max-h-64 flex-col overflow-y-auto">
              {sources.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    data-testid="shot-pull-picker-clip"
                    data-node-id={item.id}
                    onClick={() => pick(item.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-fast hover:bg-surface-fill"
                  >
                    <span className="relative aspect-video w-16 shrink-0 overflow-hidden rounded-md bg-surface-fill">
                      {item.poster ? (
                        // eslint-disable-next-line @next/next/no-img-element -- R2 截帧直链，不走优化
                        <img
                          src={item.poster}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <Film
                          className="absolute inset-0 m-auto size-4 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{item.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {item.reference ? (
                          <span className="rounded-sm bg-surface-fill px-1 text-foreground">
                            {t('refBadge')}
                          </span>
                        ) : null}
                        {item.durationSec ? (
                          <span className="font-mono tabular-nums">
                            {formatPullClock(item.durationSec)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mx-2 my-1.5 border-t border-border" />
          </>
        ) : null}
        {actions.onUpload ? (
          <PickerAction
            testId="shot-pull-picker-upload"
            icon={<Upload className="size-4" aria-hidden />}
            label={t('pull.picker.upload')}
            onClick={() => {
              setOpen(false)
              actions.onUpload?.()
            }}
          />
        ) : null}
        {actions.onLibrary ? (
          <PickerAction
            testId="shot-pull-picker-library"
            icon={<FolderOpen className="size-4" aria-hidden />}
            label={t('pull.picker.library')}
            onClick={() => {
              setOpen(false)
              actions.onLibrary?.()
            }}
          />
        ) : null}
        <p className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">
          {t('pull.picker.note')}
        </p>
      </PopoverContent>
    </Popover>
  )
}

function PickerAction({
  testId,
  icon,
  label,
  onClick,
}: {
  readonly testId: string
  readonly icon: ReactNode
  readonly label: string
  onClick(): void
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors duration-fast hover:bg-surface-fill"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span>{label}</span>
    </button>
  )
}
