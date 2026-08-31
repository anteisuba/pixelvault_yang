'use client'

/**
 * 📎 附件面板（拍板 16）。
 *
 * ⭐ **素材库就地预览，不做「按钮→弹窗」两跳**（台账 B 条的教训）：一屏 6 格，
 * 点一下就挂到下一条消息上。
 *
 * ⭐ **「打开完整素材库」也不跳页**（拍板 20，owner 2026-08-30 真机点验后定）：
 * 它开的是现有的 `AssetSelectorDialog`（工作台参考图入口今天用的就是这一颗），
 * 单选模式 —— 点一张瓦片 = 立刻挂上并关闭，与 6 格「点即挂」是同一个手势。
 * 6 格是「最近」，弹层是「全部」，两者列的东西不同、语义完全一致。
 * ⛔ 不 `Link` 去 `/assets`：跳走等于把用户正在写的这一轮对话扔掉。
 *
 * ⭐ **上传区是真的**（P3-A）：点它开文件选择器、往它上面拖也算数，两条路
 * 与输入框的粘贴一起，落点都是 `useStudioOperatorUpload().uploadFiles` 那一个
 * 函数 —— 三个手势一条通道。⛔ 别在这里另起一条 fetch：请求体里不许出现文件
 * 字节（台账 BG）。
 *
 * ⚠ 上传状态**不住在这里**：这块面板挑完就关（`onAttach` 会让宿主收起它），
 * 而一次视频上传可能跑几分钟。进行中 / 失败的 chip 长在输入框上方，state 在
 * dock 层 —— 与草稿、附件同一个理由（P2 收尾修的那个真 bug）。
 */

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
} from 'react'
import { Box, ClipboardPaste, Music, Play, Upload } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import {
  STUDIO_OPERATOR_ATTACH_TILE_COUNT,
  STUDIO_OPERATOR_UPLOAD_ACCEPT,
} from '@/constants/studio-assistant-operator'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { toOperatorAttachment } from '@/hooks/use-studio-operator-upload'
import { fetchGalleryImages } from '@/lib/api-client/gallery'
import { Spinner } from '@/components/ui/spinner'
import { motionTransition } from '@/constants/motion'
import { cn } from '@/lib/utils'
import type { StudioOperatorAttachment } from '@/types/studio-assistant-operator'

/**
 * 没有缩略图时画的那枚字形 —— 碎图标比没有图更糟。
 * 6 格与输入区上方的附件 chip 共用它（两处画法不一致就是两处各写一遍的味道）。
 */
export function AttachKindGlyph({
  kind,
}: {
  kind: StudioOperatorAttachment['kind']
}) {
  if (kind === 'audio') return <Music className="size-3.5" aria-hidden />
  if (kind === 'model3d') return <Box className="size-3.5" aria-hidden />
  return <Play className="size-3.5" aria-hidden />
}

interface StudioOperatorAttachMenuProps {
  onAttach(attachment: StudioOperatorAttachment): void
  onDismiss(): void
  triggerRef: RefObject<HTMLButtonElement | null>
  /**
   * 上传三通道的入口。
   *
   * ⚠ **必传，不是可选** —— 可选 prop 漏传的表现是「编译全绿、测试全过、
   * 点上传区没反应」，也就是 owner 2026-08-30 真机点验时打回的那个形态。
   * 让编译器替我们盯着它。
   */
  onUploadFiles(files: readonly File[]): void
}

export const STUDIO_OPERATOR_ATTACH_MENU_ID = 'studio-operator-attach-menu'

export function StudioOperatorAttachMenu({
  onAttach,
  onDismiss,
  triggerRef,
  onUploadFiles,
}: StudioOperatorAttachMenuProps) {
  const t = useTranslations('StudioOperator')
  const reduceMotion = useReducedMotion()
  const [tiles, setTiles] = useState<StudioOperatorAttachment[] | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // 拖拽进/出会在子元素上反复触发 —— 计数而不是布尔量，否则划过里面那行小字
  // 高亮就掉了（经典的 dragleave 抖动）。
  const dragDepth = useRef(0)

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const files = [...(event.dataTransfer?.files ?? [])]
    if (files.length > 0) onUploadFiles(files)
  }

  /**
   * ⚠ 端点是 `/api/images`（`fetchGalleryImages`），**不是 `/api/generations`**：
   * 后者会打断正在跑的生成（本仓踩过）。`mine: true` 才是「我的素材库」。
   */
  useEffect(() => {
    let cancelled = false
    void fetchGalleryImages(1, STUDIO_OPERATOR_ATTACH_TILE_COUNT, {
      mine: true,
      type: ['image', 'video'],
    }).then((result) => {
      if (cancelled) return
      setTiles(
        (result.data?.generations ?? [])
          .filter((item) => Boolean(item.url))
          .map((item) => toOperatorAttachment(item)),
      )
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLElement>('button:not(:disabled), [href], [tabindex]')
      ?.focus()
  }, [])

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuRef.current?.contains(target)) return
      if (
        target instanceof Element &&
        (target.closest('[data-operator-attach-trigger]') ||
          target.closest('[data-slot^="dialog-"]'))
      ) {
        return
      }
      onDismiss()
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault()
      // Studio 在 window 上还有一层 Escape 快捷键；这里已经消费了这一下，
      // 必须截断冒泡，否则会关完附件面板后顺手把整个助手也收起。
      event.stopPropagation()
      onDismiss()
      // 等宿主完成浮层卸载后再聚焦，避免焦点跟着已移除节点一起掉回 body。
      window.setTimeout(() => {
        const trigger =
          triggerRef.current ??
          document.querySelector<HTMLButtonElement>(
            '[data-operator-attach-trigger]',
          )
        trigger?.focus()
      }, 0)
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown, true)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener(
        'pointerdown',
        handleOutsidePointerDown,
        true,
      )
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onDismiss, triggerRef])

  return (
    <motion.div
      ref={menuRef}
      id={STUDIO_OPERATOR_ATTACH_MENU_ID}
      role="dialog"
      aria-label={t('attach.label')}
      data-testid="operator-attach-menu"
      initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={motionTransition('base', reduceMotion)}
      className="absolute inset-x-3 bottom-24 z-20 origin-bottom rounded-xl border border-border/70 bg-background p-2.5 shadow-lg"
    >
      {/*
        上传区：**点击 = 开文件选择器，拖进来 = 同一条处理链**（拍板 16）。
        ⚠ 用 `<button>` 而不是带 onClick 的 `<div>`：键盘要能到得了它，
          而且屏幕阅读器读得出这是个能按的东西。
        ⚠ `onDragOver` 必须 `preventDefault()`，否则浏览器根本不派发 drop
          （它会当成「导航到这个文件」）—— 这是拖拽失效最常见的一条。
      */}
      <button
        type="button"
        data-testid="operator-attach-upload"
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault()
          dragDepth.current += 1
          setDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault()
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setDragging(false)
        }}
        onDrop={handleDrop}
        className={cn(
          'flex w-full flex-col items-center gap-0.5 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-center transition-colors duration-fast ease-standard hover:border-primary/50 hover:text-primary',
          dragging && 'border-primary bg-primary/10 text-primary',
        )}
      >
        <Upload
          className={cn(
            'size-4 text-muted-foreground',
            dragging && 'text-primary',
          )}
          aria-hidden
        />
        <span className="text-2xs text-muted-foreground">
          {t('attach.uploadTitle')}
        </span>
        <span className="text-2xs text-muted-foreground/70">
          {t('attach.uploadHint')}
        </span>
      </button>
      {/*
        ⚠ `accept` 从 `constants/uploads.ts` 现算（见常量的头注）。
        ⚠ 选完必须把 `value` 清空：不清的话「同一个文件选第二次」不触发
          `change`，表现是「第一次能传，删掉重选就没反应了」。
      */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={STUDIO_OPERATOR_UPLOAD_ACCEPT}
        data-testid="operator-attach-file-input"
        className="hidden"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          event.target.value = ''
          if (files.length > 0) onUploadFiles(files)
        }}
      />

      <div className="mb-1.5 mt-2.5 flex items-center gap-2 px-0.5">
        <span className="text-2xs text-muted-foreground">
          {t('attach.libraryLabel')}
        </span>
        {/* 拍板 20：就地开弹层，不跳页。 */}
        <button
          type="button"
          data-testid="operator-attach-open-library"
          onClick={() => setLibraryOpen(true)}
          className="ml-auto text-2xs text-primary hover:underline"
        >
          {t('attach.openLibrary')}
        </button>
      </div>

      {tiles === null ? (
        <div className="flex h-16 items-center justify-center">
          <Spinner size="sm" className="text-muted-foreground" />
        </div>
      ) : tiles.length === 0 ? (
        <p className="px-0.5 py-3 text-center text-2xs text-muted-foreground">
          {t('attach.libraryEmpty')}
        </p>
      ) : (
        <div className="grid grid-cols-6 gap-1.5">
          {tiles.map((tile) => (
            <button
              key={tile.id}
              type="button"
              data-testid="operator-attach-tile"
              title={tile.label}
              onClick={() => onAttach(tile)}
              className="relative aspect-[3/4] overflow-hidden rounded-md border border-border/70 transition-shadow duration-fast ease-standard hover:ring-2 hover:ring-primary"
            >
              {tile.thumbnailUrl ? (
                <Image
                  src={tile.thumbnailUrl}
                  alt={tile.label}
                  fill
                  className="object-cover"
                />
              ) : (
                <span className="grid size-full place-items-center bg-muted text-muted-foreground">
                  <AttachKindGlyph kind={tile.kind} />
                </span>
              )}
              {tile.kind === 'video' && tile.thumbnailUrl ? (
                <span className="absolute right-0.5 top-0.5 rounded bg-foreground/70 p-0.5 text-background">
                  <Play className="size-2" aria-hidden />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      <p className="mt-2 flex items-center gap-1.5 border-t border-dashed border-border/70 pt-2 text-2xs text-muted-foreground">
        <ClipboardPaste className="size-3 shrink-0" aria-hidden />
        {t('attach.pasteHint')}
      </p>

      {/*
        完整素材库（拍板 20）—— **现有组件，零新造**。
        ⚠ 不锁 `mediaType`：锁 = 不渲染（picker 的契约），锁成图片会让 6 格里
          看得见的视频在「完整素材库」里凭空消失。
        ⚠ 单选（`onSelect`）而不是多选：多选要先勾再点「添加 N 张」，那是两击，
          与 6 格的「点即挂」就不是同一个手势了（拍板 20 原话）。
        ⚠ 先关自己再挂：`onAttach` 会让宿主把整块 📎 面板收掉，连带卸载这颗
          弹层 —— 反过来写的话，弹层内部随后那句 `onOpenChange(false)` 落在一个
          已经卸载的组件上。
      */}
      <AssetSelectorDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onSelect={(generation) => {
          setLibraryOpen(false)
          onAttach(toOperatorAttachment(generation))
        }}
        title={t('attach.libraryDialogTitle')}
        description={t('attach.libraryDialogDescription')}
      />
    </motion.div>
  )
}
