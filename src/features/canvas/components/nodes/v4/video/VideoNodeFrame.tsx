'use client'

/**
 * 视频节点的**画中框**（spec §5 / §1.11，画板 `VideoExpanded.dc.html`，720 宽）。
 *
 * 方向 A「一张纸」（owner 2026-09-29，设计画布「画布 · 画中框」）：
 * · 上半 大播放器（进度 / 声音 / 抽帧 / 下载）；**没片时空态矮一截**，只有
 *   「还没有视频」+ 上传 / 素材库两颗 —— ⛔ 一块空的 16:9 占半屏。
 * · 参考一行（标签在左、轨在右）。⚠ 镜头说明**不再写在框里**（2026-11-21 定稿：
 *   与底部停靠的提示词栏重复）—— 点开后照常在底部那条栏里写，@ 候选是同一份。
 * · **一条页脚**：只有「让助手写」+ 读数（靠左）。参数 chip / 模型 chip / 生成键
 *   只在底部停靠的提示词栏里一份（owner 11-21：两处各一颗是重复），⌘↵ 仍挂在框上。
 * · 写作助手（LLM）那条**点了「让助手写」才出来**，⛔ 常驻最底再占一条。**两种模型
 *   不混**（停靠栏那几颗是视频的，助手那条是 LLM 的）。
 *
 * ⚠ 镜头说明**就是提示词**：存回去走 `onSave` → `set_prompt`，@ 落槽由 op 执行器
 * 在同一步里做（`syncMentionSlots`），⛔ 这里不自己连边。
 */

import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'
import { useTranslations } from 'next-intl'
import { Library, Plus, Sparkles, Upload } from '@/components/icons'

import { CANVAS_PROMPT_DOCK } from '@/constants/canvas-shell'
import {
  DURATION,
  CHIP_POPOVER,
  EASE_IN,
  EASE_STANDARD,
  SPRING,
} from '@/constants/motion'
import { NODE_V4_CHROME } from '@/constants/node-studio'
import { cn } from '@/lib/utils'

import { NodeFrame } from '../chrome'
import { TextAssistantBar } from '../text/TextAssistantBar'
import { VideoPlayer } from './VideoPlayer'

/** 没片时那只矮框的高（= `h-62.5`，方向 A）：有片时从这里长到 16:9。 */
const EMPTY_STAGE_HEIGHT = 250

export interface VideoNodeFrameProps {
  readonly failureMessage?: string | undefined
  readonly open: boolean
  onClose(): void
  /** 来处（那张卡）：框从它长出来、关上缩回它。 */
  readonly origin?: RefObject<HTMLElement | null>
  readonly nodeId: string
  readonly title: string
  /** 顶栏名字右边那行读数：`7s · 16:9 · 1080p · Seedance 2.0`。 */
  readonly headline: string
  readonly url: string | undefined
  readonly posterUrl: string | undefined
  onExtractFrame(video: HTMLVideoElement): void
  readonly extracting: boolean
  onDownload(): void
  /** 镜头说明（= 这张卡的提示词）：只在关框时存回去，正文在底部停靠栏里写。 */
  readonly body: string
  onSave(body: string): void
  /** ⌘↵ 的去处（框开着时焦点不在停靠栏里也认）；页脚已没有生成键。 */
  onRegenerate(): void
  readonly regenerateDisabled: boolean
  /** 没片时空态里那两颗：上传一段 / 从素材库选一段落进这张卡自己。 */
  onUpload(): void
  onLibrary(): void
  /** 页脚左边那行读数（字数 + 已挂了什么）。 */
  readonly footerReadout: string
  /**
   * 播放器与说明之间那条**参考轨** —— 与提示词栏首行是**同一个组件**（画板
   * `VideoRefs.dc.html`：方向 B 只贡献了这一段位置）。⛔ 这里不做第二份。
   */
  readonly refRail: ReactNode
  readonly addMenu?: ReactNode
}

export function VideoNodeFrame({
  failureMessage,
  open,
  onClose,
  origin,
  nodeId,
  title,
  headline,
  url,
  posterUrl,
  onExtractFrame,
  extracting,
  onDownload,
  body,
  onSave,
  onRegenerate,
  regenerateDisabled,
  onUpload,
  onLibrary,
  footerReadout,
  refRail,
  addMenu,
}: VideoNodeFrameProps) {
  const t = useTranslations('StudioNode.v4')
  const tVideo = useTranslations('StudioNode.v4.video')
  const reduce = useReducedMotion()
  /** 写作助手那条开着没有（页脚「让助手写」开合）。 */
  const [assistOpen, setAssistOpen] = useState(false)
  const [assistMounted, setAssistMounted] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addMounted, setAddMounted] = useState(false)

  // ⌘↵ = 生成 / 重新生成：页脚主键删掉后它仍挂在框上（框开着 = 停靠栏归这张卡）。
  // 焦点在停靠栏里时栏自己的 Enter 先吃掉这一下（`defaultPrevented`），⛔ 发两枪。
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return
      event.preventDefault()
      if (!regenerateDisabled) onRegenerate()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, regenerateDisabled, onRegenerate])

  /** 关框即存（spec §2 / §5）。⛔ 不做「保存」按钮。 */
  const commit = () => {
    onSave(body)
  }

  return (
    <NodeFrame
      open={open}
      origin={origin}
      onClose={() => {
        commit()
        onClose()
      }}
      title={title}
      width={NODE_V4_CHROME.frameWidth.video}
      bottomInsetPx={CANVAS_PROMPT_DOCK.frameReservePx}
      titleExtra={
        <span
          data-video-frame-headline
          className="shrink-0 font-mono text-2xs text-muted-foreground"
        >
          {headline}
        </span>
      }
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-video-frame-assist
            aria-expanded={assistOpen}
            onClick={() => {
              if (assistOpen) setAssistOpen(false)
              else {
                setAssistMounted(true)
                setAssistOpen(true)
              }
            }}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-2sm transition duration-fast ease-standard active:scale-96',
              ' focus-visible:outline-none focus-visible:shadow-focus',
              assistOpen
                ? 'bg-foreground text-background'
                : 'bg-surface-fill text-foreground hover:tint-hover',
            )}
          >
            <Sparkles aria-hidden className="size-3.5" />
            {tVideo('frame.askAssistant')}
          </button>
          <span
            data-video-frame-readout
            className="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground/75"
          >
            {footerReadout}
          </span>
        </div>
      }
      assistantBar={
        assistMounted ? (
          <AnimatePresence
            initial={false}
            onExitComplete={() => setAssistMounted(false)}
          >
            {assistOpen ? (
              <motion.div
                key="assist"
                data-video-frame-assist-bar
                initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                animate={
                  reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }
                }
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
                className="overflow-hidden"
              >
                <TextAssistantBar nodeId={nodeId} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3.5">
        {failureMessage && (
          <p
            role="alert"
            className="rounded-xl border border-status-risk/30 bg-status-risk-surface p-4 text-2sm leading-relaxed break-words"
          >
            {t('generateDesk.failed', { reason: failureMessage })}
          </p>
        )}
        {/* 没片 → 有片：空态那只矮框长高到 16:9（240 = fast×2，与画中框关上同一档），
            片子 200 淡入（动效表 · 画中框），⛔ 直接换成一块大的。 */}
        <motion.div
          data-video-frame-stage
          initial={false}
          animate={{ height: url ? 'auto' : EMPTY_STAGE_HEIGHT }}
          transition={{
            duration: reduce ? 0 : DURATION.fast * 2,
            ease: EASE_STANDARD,
          }}
          className="relative overflow-hidden"
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={url ? 'video' : 'empty'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: reduce ? DURATION.fast : DURATION.base,
                ease: EASE_STANDARD,
              }}
            >
              {url ? (
                <VideoPlayer
                  url={url}
                  variant="paper"
                  {...(posterUrl ? { posterUrl } : {})}
                  title={title}
                  onExtractFrame={onExtractFrame}
                  extracting={extracting}
                  onDownload={onDownload}
                  className="rounded-node-bar"
                />
              ) : (
                // 没片时矮一截（方向 A）：一句话 + 两颗，⛔ 一块空的 16:9 占半屏。
                <div
                  data-video-player="empty"
                  className="flex h-62.5 w-full flex-col items-center justify-center gap-3 rounded-node-bar bg-surface-workbench"
                >
                  <span className="text-2sm text-muted-foreground">
                    {t('player.empty')}
                  </span>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      data-video-frame-upload
                      onClick={onUpload}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-fill px-3 text-2sm text-foreground transition duration-fast ease-standard hover:tint-hover active:scale-96 focus-visible:outline-none focus-visible:shadow-focus"
                    >
                      <Upload aria-hidden className="size-3.5" />
                      {tVideo('frame.upload')}
                    </button>
                    <button
                      type="button"
                      data-video-frame-library
                      onClick={onLibrary}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-fill px-3 text-2sm text-foreground transition duration-fast ease-standard hover:tint-hover active:scale-96 focus-visible:outline-none focus-visible:shadow-focus"
                    >
                      <Library aria-hidden className="size-3.5" />
                      {tVideo('frame.library')}
                    </button>
                  </span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {refRail ? (
          <div data-video-frame-rail className="flex h-11 items-center gap-2">
            <span className="w-8.5 shrink-0 text-2xs text-muted-foreground">
              {tVideo('frame.referenceLabel')}
            </span>
            <div className="flex min-w-0 items-center gap-2">{refRail}</div>
            {addMenu ? (
              <DropdownMenuPrimitive.Root
                open={addOpen}
                onOpenChange={(next) => {
                  if (next) setAddMounted(true)
                  setAddOpen(next)
                }}
              >
                <DropdownMenuPrimitive.Trigger asChild>
                  <motion.button
                    type="button"
                    data-video-frame-ref-add
                    aria-label={tVideo('frame.referenceAdd')}
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-foreground/24 text-muted-foreground transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus"
                    whileTap={reduce ? undefined : { scale: 0.96 }}
                    transition={SPRING.press}
                  >
                    <Plus aria-hidden className="size-4" />
                  </motion.button>
                </DropdownMenuPrimitive.Trigger>
                {addMounted ? (
                  <DropdownMenuPrimitive.Portal forceMount>
                    <DropdownMenuPrimitive.Content
                      asChild
                      forceMount
                      align="start"
                      sideOffset={8}
                    >
                      <motion.div
                        data-video-frame-ref-menu
                        initial={false}
                        animate={
                          addOpen
                            ? { opacity: 1, scale: 1, filter: 'blur(0px)' }
                            : {
                                opacity: 0,
                                scale: CHIP_POPOVER.fromScale,
                                filter: `blur(${CHIP_POPOVER.blurPx}px)`,
                              }
                        }
                        transition={
                          reduce
                            ? { duration: 0.001 }
                            : addOpen
                              ? SPRING.slot
                              : { duration: DURATION.base, ease: EASE_IN }
                        }
                        onAnimationComplete={() => {
                          if (!addOpen) setAddMounted(false)
                        }}
                        style={{
                          boxSizing: 'content-box',
                          transformOrigin:
                            'var(--radix-dropdown-menu-content-transform-origin)',
                          pointerEvents: addOpen ? 'auto' : 'none',
                        }}
                        className="z-50 w-72 rounded-12 bg-popover p-1.5 text-foreground shadow-pop outline-none"
                      >
                        {addMenu}
                      </motion.div>
                    </DropdownMenuPrimitive.Content>
                  </DropdownMenuPrimitive.Portal>
                ) : null}
              </DropdownMenuPrimitive.Root>
            ) : null}
            <span className="ml-1 shrink-0 text-2xs text-muted-foreground/75">
              {tVideo('frame.referenceHint')}
            </span>
          </div>
        ) : null}
      </div>
    </NodeFrame>
  )
}
