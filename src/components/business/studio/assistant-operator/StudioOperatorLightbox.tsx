'use client'

/**
 * 操作员面板的灯箱（拍板 17）——**参考图缩略图与评价卡证据图共用同一个**。
 *
 * ⚠ 状态放模块级而不是某个父组件的 useState：要开它的地方分散在日志条、评价卡、
 * 附件 chip 三处，逐层往下传 `onZoom` 会让每一颗中间组件都多一个与自己无关的
 * prop。灯箱本来就是全屏单例，模块 store 与它的形状一致。
 */

import { useCallback, useSyncExternalStore } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

interface LightboxState {
  url: string | null
  caption: string | null
}

const CLOSED: LightboxState = { url: null, caption: null }

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

export function openOperatorLightbox(url: string, caption?: string): void {
  emit({ url, caption: caption ?? null })
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

  // ⚠ 只做入场，不做退场（同 `StudioOperatorDock` 的那段注释）：隐藏标签页里
  //    rAF 冻结 → `AnimatePresence` 的退场永远不完成 → 一个 opacity:0 的**全屏**
  //    遮罩留在 DOM 里吃掉所有点击。灯箱是四处里最危险的一处。
  return (
    <>
      {lightbox.url ? (
        <motion.div
          key="operator-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={t('lightboxLabel')}
          onClick={close}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
          className="fixed inset-0 z-[60] grid cursor-zoom-out place-items-center bg-foreground/70 p-8 backdrop-blur-sm"
        >
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.86 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: reduceMotion ? 0 : 0.26,
              ease: [0.2, 0.9, 0.3, 1.1],
            }}
            className="relative max-h-full w-full max-w-3xl overflow-hidden rounded-2xl shadow-lg"
          >
            {/* ⚠ `unoptimized` 是全局默认（`next.config` 关了优化），这里跟着走 ——
                写 `sizes` / `quality` 在本仓是死配置（台账：next/image 全局关了优化）。 */}
            <Image
              src={lightbox.url}
              alt={lightbox.caption ?? t('lightboxLabel')}
              width={1024}
              height={1024}
              className="h-auto max-h-full w-full object-contain"
            />
          </motion.div>
          {lightbox.caption ? (
            <span className="pointer-events-none mt-4 text-2xs text-background/80">
              {lightbox.caption}
            </span>
          ) : null}
        </motion.div>
      ) : null}
    </>
  )
}
