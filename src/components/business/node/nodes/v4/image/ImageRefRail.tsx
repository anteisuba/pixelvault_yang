'use client'

/**
 * 图片节点提示词栏首行的**参考图轨**（spec §3：参考图进提示词栏，卡面不显示槽）。
 *
 * 形态跟视频卡参考轨同一档（48px 编号缩略 + 来源名 + 末尾加号），但只有图、
 * 没有首/尾帧角色。序号由 `readVideoRail` 发，`@图1` 与视频卡共用一份坐标系。
 */

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import {
  Plus,
  Upload,
  Library,
  ImageIcon,
  Loader2,
  AlertTriangle,
} from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { VideoRailEntry } from '@/lib/video-node-rail'

const RAIL_THUMB_PX = 48

export interface ImageRailCandidate {
  readonly id: string
  readonly name: string
  readonly thumbnailUrl?: string | undefined
}

export interface ImageRailPendingItem {
  readonly id: string
  readonly name: string
  readonly progress: number
  readonly error?: string | null
}

export interface ImageRefRailProps {
  readonly items: readonly VideoRailEntry[]
  readonly pending?: readonly ImageRailPendingItem[]
  readonly capacity: number
  onOpen(sourceNodeId: string): void
  onRemove(edgeId: string): void
  readonly candidates: readonly ImageRailCandidate[]
  onPickFromCanvas(sourceNodeId: string): void
  onUpload(): void
  onLibrary(): void
  onRetryPending?(id: string): void
  onRemovePending?(id: string): void
  readonly disabled?: boolean
  readonly className?: string
}

function RailCell({
  name,
  children,
}: {
  readonly name?: string
  readonly children: React.ReactNode
}) {
  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-0.5">
      {children}
      <span
        data-image-rail-name
        title={name}
        className="block w-full truncate text-center text-2xs leading-4 text-muted-foreground"
      >
        {name ?? ' '}
      </span>
    </div>
  )
}

export function ImageRefRail({
  items,
  pending = [],
  capacity,
  onOpen,
  onRemove,
  candidates,
  onPickFromCanvas,
  onUpload,
  onLibrary,
  onRetryPending,
  onRemovePending,
  disabled = false,
  className,
}: ImageRefRailProps) {
  const t = useTranslations('StudioNode.v4')
  const tImage = useTranslations('StudioNode.v4.image')
  const occupied = items.length + pending.filter((item) => !item.error).length
  const full =
    occupied >= capacity ? tImage('rail.full', { limit: capacity }) : null

  return (
    <div
      data-image-ref-rail
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        'nodrag nopan nowheel flex min-w-0 max-w-full items-start gap-2 overflow-x-auto py-1',
        className,
      )}
    >
      {items.map((item) => (
        <RailCell key={item.edgeId} name={item.sourceName}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                data-image-rail-item
                data-image-rail-index={item.index}
                aria-label={tImage('rail.itemLabel', {
                  index: item.index,
                  name: item.sourceName,
                })}
                onKeyDown={(event) => {
                  if (event.key !== 'Backspace' && event.key !== 'Delete') {
                    return
                  }
                  event.preventDefault()
                  onRemove(item.edgeId)
                }}
                className={cn(
                  'nodrag nopan relative size-12 shrink-0 rounded-node-thumb bg-surface-fill',
                  'transition-colors duration-fast ease-standard hover:bg-surface-fill-hover',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  'disabled:pointer-events-none disabled:opacity-60',
                )}
              >
                {item.thumbnailUrl ? (
                  <Image
                    src={item.thumbnailUrl}
                    alt=""
                    width={RAIL_THUMB_PX}
                    height={RAIL_THUMB_PX}
                    unoptimized
                    className="size-full rounded-node-thumb object-cover"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageIcon aria-hidden className="size-5" />
                  </span>
                )}
                <span
                  aria-hidden
                  data-image-rail-badge
                  className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-3xs font-semibold text-primary-foreground tabular-nums"
                >
                  {item.index}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-42">
              <DropdownMenuItem
                data-image-rail-open
                onSelect={() => onOpen(item.sourceNodeId)}
              >
                {tImage('rail.open')}
              </DropdownMenuItem>
              <DropdownMenuItem
                data-image-rail-remove
                variant="destructive"
                onSelect={() => onRemove(item.edgeId)}
              >
                {tImage('rail.remove')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RailCell>
      ))}

      {pending.map((item) =>
        item.error ? (
          <RailCell key={item.id} name={item.name}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-image-rail-pending-state="error"
                  title={item.error}
                  aria-label={tImage('rail.uploadFailed', { name: item.name })}
                  className="nodrag nopan flex size-12 shrink-0 items-center justify-center rounded-node-thumb border border-dashed border-destructive text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <AlertTriangle aria-hidden className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-42">
                <DropdownMenuItem
                  data-image-rail-pending-retry
                  onSelect={() => onRetryPending?.(item.id)}
                >
                  {tImage('rail.retry')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-image-rail-pending-remove
                  variant="destructive"
                  onSelect={() => onRemovePending?.(item.id)}
                >
                  {tImage('rail.remove')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </RailCell>
        ) : (
          <RailCell key={item.id} name={item.name}>
            <span
              data-image-rail-pending-state="uploading"
              role="progressbar"
              aria-valuenow={Math.round(item.progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={tImage('rail.uploading', { name: item.name })}
              className="relative flex size-12 shrink-0 items-center justify-center rounded-node-thumb border border-dashed border-border text-muted-foreground"
            >
              <Loader2
                aria-hidden
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              <span className="absolute inset-x-1.5 bottom-1.5 block h-0.5 overflow-hidden rounded-full bg-surface-fill-track">
                <span
                  className="block h-full rounded-full bg-primary transition-[width] duration-base ease-standard motion-reduce:transition-none"
                  style={{ width: `${Math.round(item.progress)}%` }}
                />
              </span>
            </span>
          </RailCell>
        ),
      )}

      <RailCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-image-rail-add
              disabled={disabled || full !== null}
              title={full ?? undefined}
              aria-label={tImage('rail.title')}
              className="nodrag nopan flex size-12 shrink-0 items-center justify-center rounded-node-thumb border border-border bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
            >
              <Plus aria-hidden className="size-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem data-image-rail-upload onSelect={onUpload}>
              <Upload aria-hidden className="size-4" />
              {tImage('rail.upload')}
            </DropdownMenuItem>
            <DropdownMenuItem data-image-rail-library onSelect={onLibrary}>
              <Library aria-hidden className="size-4" />
              {tImage('rail.library')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {candidates.length === 0 ? (
              <DropdownMenuItem disabled>
                {t('chrome.emptyHint')}
              </DropdownMenuItem>
            ) : (
              candidates.map((candidate) => (
                <DropdownMenuItem
                  key={candidate.id}
                  data-image-rail-candidate={candidate.id}
                  onSelect={() => onPickFromCanvas(candidate.id)}
                >
                  {candidate.thumbnailUrl ? (
                    <Image
                      src={candidate.thumbnailUrl}
                      alt=""
                      width={32}
                      height={32}
                      unoptimized
                      className="size-8 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <ImageIcon aria-hidden className="size-4 shrink-0" />
                  )}
                  {candidate.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </RailCell>
    </div>
  )
}
