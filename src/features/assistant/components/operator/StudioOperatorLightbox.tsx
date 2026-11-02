'use client'

/**
 * 操作员面板的灯箱（拍板 17）——**参考图缩略图与评价卡证据图共用同一个**。
 * 外壳照 ui-spec §9 查看器：`scrim` 遮罩 + 圆角 24 的 `float` 大卡；只放大一张、
 * 没有配方栏（证据图 / 网图不是生成记录），所以不进 `InPlaceViewer`。
 *
 * ⚠ 状态放模块级而不是某个父组件的 useState：要开它的地方分散在日志条、评价卡、
 * 附件 chip 三处，逐层往下传 `onZoom` 会让每一颗中间组件都多一个与自己无关的
 * prop。灯箱本来就是全屏单例，模块 store 与它的形状一致。
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { ImageOff } from '@/components/icons'
import { DURATION, EASE_POP } from '@/constants/motion'
import { useThirdPartyImage } from '@/hooks/use-third-party-image'

interface LightboxState {
  url: string | null
  caption: string | null
  /** 第三方网图（助手找图）：不带 Referer、能走热链代理就走、取不到退到 `fallbackUrl`。 */
  thirdParty: boolean
  fallbackUrl: string | null
}

const CLOSED: LightboxState = {
  url: null,
  caption: null,
  thirdParty: false,
  fallbackUrl: null,
}

let state: LightboxState = CLOSED
const listeners = new Set<() => void>()

function emit(next: LightboxState): void {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export interface OperatorLightboxOptions {
  /**
   * 这张是**第三方网图**（附录 I §3.4）：自家 R2 / CDN 的图别传 —— 那些不需要改写。
   * 原图三成取不到，`fallbackUrl`（通常是搜索结果的缩略图）兜底，先给看小图。
   */
  thirdParty?: boolean
  fallbackUrl?: string
}

export function openOperatorLightbox(
  url: string,
  caption?: string,
  options?: OperatorLightboxOptions,
): void {
  emit({
    url,
    caption: caption ?? null,
    thirdParty: options?.thirdParty ?? false,
    fallbackUrl: options?.fallbackUrl ?? null,
  })
}

export function closeOperatorLightbox(): void {
  if (state.url === null) return
  emit(CLOSED)
}

export function StudioOperatorLightbox() {
  const t = useTranslations('StudioOperator')
  const reduceMotion = useReducedMotion()
  const lightbox = useSyncExternalStore(
    subscribe,
    () => state,
    () => CLOSED,
  )
  const close = useCallback(() => closeOperatorLightbox(), [])
  const isOpen = lightbox.url !== null

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [close, isOpen])

  if (!lightbox.url || typeof document === 'undefined') return null

  // ⚠ 只做入场，不做退场（同 `StudioOperatorDock` 的那段注释）：隐藏标签页里
  //    rAF 冻结 → `AnimatePresence` 的退场永远不完成 → 一个 opacity:0 的**全屏**
  //    遮罩留在 DOM 里吃掉所有点击。灯箱是四处里最危险的一处。
  return createPortal(
    <motion.div
      key="operator-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t('lightboxLabel')}
      onClick={close}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : DURATION.base }}
      className="pointer-events-auto fixed inset-0 z-[60] grid cursor-zoom-out place-items-center bg-scrim p-10"
    >
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.86 }}
        animate={{ opacity: 1, scale: 1 }}
        /* 时长走脊柱的 slow 档（面板 / 对话框那一类），曲线走 `EASE_POP`
           —— 过冲是这一拍的语义，⛔ 不退回 `EASE_STANDARD`。 */
        transition={{
          duration: reduceMotion ? 0 : DURATION.slow,
          ease: EASE_POP,
        }}
        data-float
        className="relative flex max-h-full w-full max-w-3xl flex-col gap-2 overflow-hidden rounded-24 bg-popover p-3 shadow-pop"
      >
        {lightbox.thirdParty ? (
          <ThirdPartyLightboxImage
            url={lightbox.url}
            fallbackUrl={lightbox.fallbackUrl}
            alt={lightbox.caption ?? t('lightboxLabel')}
            unavailableLabel={t('web.previewUnavailable')}
          />
        ) : (
          /* ⚠ `unoptimized` 是全局默认（`next.config` 关了优化），这里跟着走 ——
             写 `sizes` / `quality` 在本仓是死配置（台账：next/image 全局关了优化）。 */
          <Image
            src={lightbox.url}
            alt={lightbox.caption ?? t('lightboxLabel')}
            width={1024}
            height={1024}
            className="h-auto max-h-full w-full rounded-12 object-contain"
          />
        )}
        {lightbox.caption ? (
          <span className="pointer-events-none px-1 text-2sm text-muted-foreground">
            {lightbox.caption}
          </span>
        ) : null}
      </motion.div>
    </motion.div>,
    document.body,
  )
}

/** 第三方网图的大图：⛔ 不带我们的 Referer；全都取不到时画占位，⛔ 不出破图标。 */
function ThirdPartyLightboxImage({
  url,
  fallbackUrl,
  alt,
  unavailableLabel,
}: {
  url: string
  fallbackUrl: string | null
  alt: string
  unavailableLabel: string
}) {
  const image = useThirdPartyImage(url, fallbackUrl)
  if (!image.src) {
    return (
      <div
        data-testid="operator-lightbox-unavailable"
        className="grid aspect-square w-full place-items-center gap-2 rounded-12 bg-muted p-8 text-2sm text-muted-foreground"
      >
        <ImageOff className="size-6" />
        <span>{unavailableLabel}</span>
      </div>
    )
  }
  return (
    <Image
      key={image.src}
      src={image.src}
      alt={alt}
      width={1024}
      height={1024}
      referrerPolicy={image.referrerPolicy}
      onError={image.onError}
      className="h-auto max-h-full w-full rounded-12 object-contain"
    />
  )
}
