'use client'

/**
 * 手机助手输入栏的 ＋（iOS 稿 v16，owner 2026-10-16）：按钮正上方弹白色小卡片，
 * 顶上一排最近 3 张素材 +「全部」，下面一行一项 从素材挑图 / 拍照 / 上传文件 /
 * @ 角色或素材。
 *
 * ⭐ 只换入口不换通道：四项落到面板原有的同一套处理（素材库弹层、
 * `handleUploadFiles`、`openMention`），桌面仍是三颗裸图标。
 * ⚠ 必须包在 `ResponsivePopoverPhoneCard` 里，否则手机上会退回底部抽屉。
 */

import { useRef, useState } from 'react'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import {
  AtSign,
  Camera,
  Images,
  Paperclip,
  Plus,
  type Icon,
} from '@/components/icons'

import type { GenerationRecord } from '@/types'
import { useGallery } from '@/hooks/use-gallery'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { cn } from '@/lib/utils'

type AddRowId = 'library' | 'camera' | 'upload' | 'mention'

/** 顶上那排最近素材的张数（原型 v16：3 张 +「全部」）。 */
const RECENT_COUNT = 3

const ADD_ROWS: readonly { id: AddRowId; icon: Icon }[] = [
  { id: 'library', icon: Images },
  { id: 'camera', icon: Camera },
  { id: 'upload', icon: Paperclip },
  { id: 'mention', icon: AtSign },
]

export interface StudioOperatorPhoneAddCardProps {
  onPickLibrary(): void
  /** 点最近那排的一张：与素材库挑中同一条路（插 `library` 胶囊）。 */
  onPickRecent(generation: GenerationRecord): void
  onPickFile(): void
  onCameraFiles(files: File[]): void
  onMention(): void
}

export function StudioOperatorPhoneAddCard({
  onPickLibrary,
  onPickRecent,
  onPickFile,
  onCameraFiles,
  onMention,
}: StudioOperatorPhoneAddCardProps) {
  const t = useTranslations('StudioOperator.phoneAdd')
  const [open, setOpen] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const select = (id: AddRowId) => {
    setOpen(false)
    // 等卡片收起、焦点还回去再动作：`openMention` 要把焦点放进输入框，
    // 同一帧做会被 Radix 的还焦点抢走。
    requestAnimationFrame(() => {
      if (id === 'library') onPickLibrary()
      else if (id === 'camera') cameraInputRef.current?.click()
      else if (id === 'upload') onPickFile()
      else onMention()
    })
  }

  return (
    <>
      <ResponsivePopover open={open} onOpenChange={setOpen}>
        <ResponsivePopoverTrigger asChild>
          <button
            type="button"
            data-testid="operator-phone-add"
            aria-label={t('label')}
            data-open={open || undefined}
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-full border border-border transition-colors duration-fast ease-standard active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
              open ? 'bg-accent text-foreground' : 'text-foreground',
            )}
          >
            <Plus
              className={cn(
                'size-4 transition-transform duration-fast ease-standard motion-reduce:transition-none',
                open && 'rotate-45',
              )}
              aria-hidden
            />
          </button>
        </ResponsivePopoverTrigger>
        <ResponsivePopoverContent
          side="top"
          align="start"
          label={t('label')}
          className="w-56 rounded-xl border-assistant-line-strong p-1.5 assistant-glass-overlay shadow-assistant-overlay"
        >
          <div
            role="menu"
            aria-label={t('label')}
            data-testid="operator-phone-add-menu"
            className="flex flex-col gap-0.5"
          >
            {/* ⚠ 开着才挂：最近素材一挂载就取，常驻等于每开一次助手都白打一发。 */}
            {open ? (
              <RecentAssets
                onPick={(generation) => {
                  setOpen(false)
                  requestAnimationFrame(() => onPickRecent(generation))
                }}
                onShowAll={() => select('library')}
              />
            ) : null}
            {ADD_ROWS.map(({ id, icon: RowIcon }) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                data-testid={`operator-phone-add-${id}`}
                onClick={() => select(id)}
                className="flex min-h-11 items-center gap-3 rounded-lg px-2.5 text-left text-2sm text-foreground transition-colors duration-fast ease-standard active:bg-muted hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RowIcon
                  className="size-4.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                {t(id)}
              </button>
            ))}
          </div>
        </ResponsivePopoverContent>
      </ResponsivePopover>
      {/* 拍照 = 直接开后摄（`capture`），拍完与选文件走同一条上传通道。 */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        data-testid="operator-phone-camera-input"
        className="hidden"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          event.target.value = ''
          if (files.length > 0) onCameraFiles(files)
        }}
      />
    </>
  )
}

function RecentAssets({
  onPick,
  onShowAll,
}: {
  onPick(generation: GenerationRecord): void
  onShowAll(): void
}) {
  const t = useTranslations('StudioOperator.phoneAdd')
  const { userId } = useAuth()
  const { generations, hasLoaded } = useGallery({
    initialFilters: { types: ['image'] },
    mine: true,
    includeTotal: false,
    limit: RECENT_COUNT,
    cacheScope: `operator-recent:${userId ?? 'anonymous'}`,
  })
  const recent = generations.filter((g) => g.url).slice(0, RECENT_COUNT)
  // 一张素材都没有就整排不画，⛔ 不留一排空格子。
  if (hasLoaded && recent.length === 0) return null

  return (
    <div
      data-testid="operator-phone-add-recent"
      className="mb-1 grid grid-cols-4 gap-1.5 border-b border-border/60 p-1 pb-2.5"
    >
      {hasLoaded
        ? recent.map((generation) => (
            <button
              key={generation.id}
              type="button"
              role="menuitem"
              aria-label={generation.prompt || t('recent')}
              data-testid={`operator-phone-add-recent-${generation.id}`}
              onClick={() => onPick(generation)}
              className="aspect-square overflow-hidden rounded-lg bg-muted transition-transform duration-fast ease-standard active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <Image
                src={generation.thumbnailUrl ?? generation.url}
                alt=""
                width={96}
                height={96}
                className="size-full object-cover"
              />
            </button>
          ))
        : Array.from({ length: RECENT_COUNT }, (_, index) => (
            <span
              key={index}
              aria-hidden
              className="aspect-square animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
            />
          ))}
      <button
        type="button"
        role="menuitem"
        data-testid="operator-phone-add-recent-all"
        onClick={onShowAll}
        className="col-start-4 grid aspect-square place-items-center rounded-lg border border-border text-xs text-muted-foreground transition-colors duration-fast ease-standard active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('all')}
      </button>
    </div>
  )
}
