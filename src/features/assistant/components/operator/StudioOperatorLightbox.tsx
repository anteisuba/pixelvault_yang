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
import { ExternalLink, ImageOff, X } from '@/components/icons'
import { DURATION, EASE_POP } from '@/constants/motion'
import { Button } from '@/components/ui/button'
import { useThirdPartyImage } from '@/hooks/use-third-party-image'

/**
 * 灯箱底下那一排动作（11-18 owner 真机：找到的图点开只有一张大图，什么都做不了）。
 * 与找到的图那一组的选中条同一组：保存 · 交给她，另加「打开原页」；缺席的那颗不画。
 * ⚠ 存的是**回调**不是数据：灯箱是模块级单例，回调由开它的那一格当场给（关掉就丢）。
 */
export interface OperatorLightboxActions {
  /** 收进素材库（点了顺手关灯箱，那一格的圈会转起来）。 */
  onSave?: () => void
  /** 交给她（同选中条的「交给她」）。 */
  onHandOver?: () => void
  /** 原页（新标签开）。 */
  pageUrl?: string
}

interface LightboxState {
  url: string | null
  caption: string | null
  /** 第三方网图（助手找图）：不带 Referer、能走热链代理就走、取不到退到 `fallbackUrl`。 */
  thirdParty: boolean
  fallbackUrl: string | null
  actions: OperatorLightboxActions | null
}

const CLOSED: LightboxState = {
  url: null,
  caption: null,
  thirdParty: false,
  fallbackUrl: null,
  actions: null,
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
  /** 底下那一排动作；缺席 = 只看（参考图缩略图、证据图）。 */
  actions?: OperatorLightboxActions
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
    actions: options?.actions ?? null,
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
        {lightbox.caption || lightbox.actions ? (
          /* ⚠ 这一行点了不关（遮罩那一下才关）：动作键要能点到。 */
          <div
            className="flex min-w-0 cursor-default flex-wrap items-center gap-2 px-1"
            onClick={(event) => event.stopPropagation()}
          >
            {lightbox.caption ? (
              <span
                data-testid="operator-lightbox-caption"
                className="min-w-0 flex-1 truncate text-2sm text-muted-foreground"
              >
                {lightbox.caption}
              </span>
            ) : null}
            {lightbox.actions ? (
              <LightboxActions actions={lightbox.actions} onDone={close} />
            ) : null}
          </div>
        ) : null}
        {/* 看得见的关闭（ui-spec §9 图标键：32 的白圆）—— 点遮罩 / Esc 也照样关。 */}
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          data-testid="operator-lightbox-close"
          aria-label={t('lightboxClose')}
          onClick={(event) => {
            event.stopPropagation()
            close()
          }}
          className="absolute right-5 top-5 cursor-pointer"
        >
          <X aria-hidden />
        </Button>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

/** 灯箱底下的动作：保存 · 交给她（主钮）· 打开原页；做完一件就关灯箱。 */
function LightboxActions({
  actions,
  onDone,
}: {
  actions: OperatorLightboxActions
  onDone(): void
}) {
  const t = useTranslations('StudioOperator')
  const { onSave, onHandOver, pageUrl } = actions
  return (
    <div
      data-testid="operator-lightbox-actions"
      className="ml-auto flex shrink-0 items-center gap-2"
    >
      {pageUrl ? (
        <Button asChild variant="ghost" size="sm">
          <a
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="operator-lightbox-open-page"
          >
            <ExternalLink aria-hidden />
            {t('web.openPage')}
          </a>
        </Button>
      ) : null}
      {onSave ? (
        <Button
          type="button"
          variant={onHandOver ? 'secondary' : 'default'}
          size="sm"
          data-testid="operator-lightbox-save"
          onClick={() => {
            onSave()
            onDone()
          }}
        >
          {t('web.save')}
        </Button>
      ) : null}
      {onHandOver ? (
        <Button
          type="button"
          size="sm"
          data-testid="operator-lightbox-hand-over"
          onClick={() => {
            onHandOver()
            onDone()
          }}
        >
          {t('web.handOver')}
        </Button>
      ) : null}
    </div>
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
