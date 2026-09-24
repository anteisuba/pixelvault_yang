'use client'

/**
 * 视频工作台左栏的**素材轨**（owner 2026-09-24 视频画板 ①）。
 *
 * ── 一条轨，按类型编号 ─────────────────────────────────────────────
 * 图、视频、音频都进这一条，各自按挂上的顺序编号「图片1 · 视频1 · 音频1」——
 * 与助手写进提示词的编号一一对应。首帧 / 尾帧只是图片左上角的角标：点图片 →
 * 设为首帧 / 设为尾帧 / 作为参考 / 移除。
 *
 * ── 没有模式 ──────────────────────────────────────────────────────
 * 「关键帧 / 多图参考 / 全能参考」三个模式已删：这一枪怎么发由挂了什么推出来，
 * 写成轨下面一行只读灰字。判定与画布视频节点同一个函数（`videoSendMode`）。
 *
 * ── 三条落法，一处写入 ────────────────────────────────────────────
 * 拖入 · 「＋」· 助手 `mount_reference slot`，最终写的都是同一份状态
 * （见 `use-studio-video-assets.ts` 头注），⛔ 组件里没有第二条写入。
 */

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import { GENERATION_REVIEW_STATE_IDS } from '@/constants/assistant-operator'
import { STUDIO_VIDEO_SLOT_SIZE_PX } from '@/constants/studio-assistant-operator'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { Plus } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { useStudioForm } from '@/contexts/studio-context'
import { getOperatorReviewState } from '@/hooks/use-studio-operator-store'
import { parseDroppedAssetIds } from '@/hooks/use-studio-operator-mention'
import { useStudioVideoAssets } from '@/hooks/use-studio-video-assets'
import type { StudioVideoImageRole } from '@/lib/studio/video-workbench-slots'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

interface StudioVideoAssetRailProps {
  disabled?: boolean
}

const TILE_STYLE = {
  width: STUDIO_VIDEO_SLOT_SIZE_PX,
  height: STUDIO_VIDEO_SLOT_SIZE_PX,
} as const

const TILE_CLASS =
  'relative flex items-center justify-center overflow-hidden rounded-lg border border-border transition-colors duration-fast ease-standard hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none'

function Tile({
  label,
  children,
  testId,
}: {
  label: string
  children: React.ReactNode
  testId?: string
}) {
  return (
    <span data-testid={testId} className="flex flex-col items-center gap-1">
      {children}
      <span className="text-2xs text-muted-foreground">{label}</span>
    </span>
  )
}

export function StudioVideoAssetRail({
  disabled = false,
}: StudioVideoAssetRailProps) {
  const t = useTranslations('StudioVideoSlots')
  const tMode = useTranslations('StudioNode.v4.video.mode')
  /** 拒绝那一句住在助手的 `reject` 档里 —— 它说的是「助手/审核为什么不收」。 */
  const tOperator = useTranslations('StudioOperator')
  const { state, dispatch } = useStudioForm()
  const assets = useStudioVideoAssets()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [picker, setPicker] = useState<'image' | 'video' | null>(null)
  const [isOver, setIsOver] = useState(false)

  const { capacity } = assets
  const acceptsImages = capacity.frames > 0 || capacity.references !== 0
  if (!acceptsImages && capacity.videos <= 0 && capacity.audios <= 0) {
    return null
  }

  const audioRefs = state.videoAudioRefs

  /**
   * ⭐ **拒收「已否」的产物**（切片 Y）—— 客户端先拒，⛔ 不等服务端：标 blocked 说的
   * 正是「这张不能再开头也不能收尾」。拒的时候**要说话**（toast）。
   */
  const allowSource = (assetIds: readonly string[]): boolean => {
    const blocked = assetIds.some(
      (id) =>
        getOperatorReviewState(id) === GENERATION_REVIEW_STATE_IDS.blocked,
    )
    if (blocked) {
      toast.error(tOperator('reject.blockedSource'))
      return false
    }
    return true
  }

  /**
   * ⚠ 原生 drop：这里要同时接**本地文件**与画廊格子拖过来的那条 URL，
   * 画廊格子拖动时同时写了 `text/uri-list`，两边都接得住。
   */
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsOver(false)
    if (disabled || !acceptsImages) return
    const assetIds = parseDroppedAssetIds(
      event.dataTransfer.getData(ASSET_DND_MIME),
    )
    if (assetIds.length > 0 && !allowSource(assetIds)) return
    const file = event.dataTransfer.files?.[0]
    if (file) {
      void assets.uploadImageFile(file)
      return
    }
    const url =
      event.dataTransfer.getData('text/uri-list') ||
      event.dataTransfer.getData('text/plain')
    if (url && /^https?:\/\//.test(url)) assets.addImage(url)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    for (const file of files) void assets.uploadImageFile(file)
  }

  const handlePicked = (generation: GenerationRecord) => {
    if (picker === 'video') {
      if (generation.outputType === 'VIDEO') assets.addVideo(generation.url)
      return
    }
    if (generation.outputType !== 'IMAGE') return
    // ⭐ 素材库那条路与拖入同一道闸。
    if (!allowSource([generation.id])) return
    assets.addImage(generation.url)
  }

  const roleLabel: Record<StudioVideoImageRole, string> = {
    first: t('setFirst'),
    last: t('setLast'),
    reference: t('setReference'),
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs font-medium text-muted-foreground/70">
        {t('sectionLabel')}
      </span>
      <div
        data-testid="studio-video-asset-rail"
        data-over={isOver}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setIsOver(true)
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={handleDrop}
        className={cn(
          'flex flex-wrap items-start gap-2 rounded-lg',
          isOver &&
            'ring-2 ring-primary/35 ring-offset-2 ring-offset-background',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />

        {assets.images.map((image) => {
          const roles = assets.rolesFor(image)
          const label = t('image', { n: image.n })
          return (
            <Tile
              key={image.url}
              label={label}
              testId={`video-asset-image-${image.n}`}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={disabled}>
                  <button
                    type="button"
                    aria-label={label}
                    className={TILE_CLASS}
                    style={TILE_STYLE}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt=""
                      className="size-full object-cover"
                    />
                    {image.role !== 'reference' ? (
                      <span
                        data-testid={`video-asset-badge-${image.role}`}
                        className="absolute left-1 top-1 rounded-sm bg-foreground/75 px-1 text-3xs leading-4 text-background"
                      >
                        {image.role === 'first'
                          ? t('firstFrame')
                          : t('lastFrame')}
                      </span>
                    ) : null}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {roles.map((role) => (
                    <DropdownMenuItem
                      key={role}
                      onSelect={() => assets.setRole(image.url, role)}
                    >
                      {roleLabel[role]}
                    </DropdownMenuItem>
                  ))}
                  {roles.length > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    onSelect={() => assets.removeImage(image.url)}
                  >
                    {t('remove')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Tile>
          )
        })}

        {assets.videos.map((url, index) => {
          const label = t('video', { n: index + 1 })
          return (
            <Tile
              key={url}
              label={label}
              testId={`video-asset-video-${index + 1}`}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={disabled}>
                  <button
                    type="button"
                    aria-label={label}
                    className={TILE_CLASS}
                    style={TILE_STYLE}
                  >
                    <video
                      src={url}
                      muted
                      playsInline
                      preload="metadata"
                      className="size-full object-cover"
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => assets.removeVideo(url)}>
                    {t('remove')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Tile>
          )
        })}

        {audioRefs.map((ref, index) => {
          const label = t('audio', { n: index + 1 })
          return (
            <Tile
              key={ref.url}
              label={label}
              testId={`video-asset-audio-${index + 1}`}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={disabled}>
                  <button
                    type="button"
                    aria-label={label}
                    title={ref.ownerName ?? ref.fileName}
                    className={cn(TILE_CLASS, 'bg-muted px-1')}
                    style={TILE_STYLE}
                  >
                    <span className="line-clamp-2 break-all text-3xs text-muted-foreground">
                      {ref.ownerName ?? ref.fileName ?? label}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onSelect={() =>
                      dispatch({ type: 'OPEN_PANEL', payload: 'videoAudio' })
                    }
                  >
                    {t('editAudio')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      dispatch({
                        type: 'SET_VIDEO_AUDIO_REFS',
                        payload: audioRefs.filter(
                          (entry) => entry.url !== ref.url,
                        ),
                      })
                    }
                  >
                    {t('remove')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Tile>
          )
        })}

        <span className="flex flex-col items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={disabled}>
              <button
                type="button"
                data-testid="video-asset-add"
                aria-label={t('add')}
                className="flex items-center justify-center rounded-lg border border-dashed border-muted-foreground/80 text-muted-foreground transition-colors duration-fast ease-standard hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none"
                style={TILE_STYLE}
              >
                {assets.isUploading ? (
                  <Spinner size="sm" />
                ) : (
                  <Plus className="size-4" aria-hidden />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {acceptsImages ? (
                <>
                  <DropdownMenuItem
                    onSelect={() => fileInputRef.current?.click()}
                  >
                    {t('uploadImage')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setPicker('image')}>
                    {t('pickImage')}
                  </DropdownMenuItem>
                </>
              ) : null}
              {capacity.videos > assets.videos.length ? (
                <DropdownMenuItem onSelect={() => setPicker('video')}>
                  {t('pickVideo')}
                </DropdownMenuItem>
              ) : null}
              {capacity.audios > 0 ? (
                <DropdownMenuItem
                  onSelect={() =>
                    dispatch({ type: 'OPEN_PANEL', payload: 'videoAudio' })
                  }
                >
                  {t('addAudio')}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* 与格子下面的编号行同高，加号不上下错位。 */}
          <span aria-hidden className="text-2xs text-transparent">
            ·
          </span>
        </span>
      </div>

      {assets.send ? (
        <span
          data-testid="video-asset-send-mode"
          className="text-2xs text-muted-foreground"
        >
          {t.rich('sendLine', {
            mode: tMode(assets.send.mode),
            reason: t(`reason.${assets.send.mode}`),
            strong: (chunks) => (
              <span className="text-foreground">{chunks}</span>
            ),
          })}
        </span>
      ) : null}

      {/* 素材库 —— 一次落一个（与帧槽、参考视频的消费端同形），⛔ 不为统一改成多选。 */}
      <AssetSelectorDialog
        open={picker !== null}
        onOpenChange={(open) => {
          if (!open) setPicker(null)
        }}
        onSelect={(generation) => {
          handlePicked(generation)
          setPicker(null)
        }}
        title={t('libraryTitle')}
        description={t('libraryDescription')}
        mediaType={picker === 'video' ? 'video' : 'image'}
      />
    </div>
  )
}
