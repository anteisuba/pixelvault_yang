'use client'

/**
 * 视频节点的**画中框**（spec §5 / §1.11，画板 `VideoExpanded.dc.html`，720 宽）。
 *
 * 方向 A「一张纸」（owner 2026-09-29，设计画布「画布 · 画中框」）：
 * · 上半 大播放器（进度 / 声音 / 抽帧 / 下载 + 版本小点）；**没片时空态矮一截**，只有
 *   「还没有视频」+ 上传 / 素材库两颗 —— ⛔ 一块空的 16:9 占半屏。
 * · 参考一行（标签在左、轨在右）；下半**镜头说明**直接写在纸上（⛔ 描边框里套框），
 *   可 @，@ 直接指定首帧 / 尾帧 / 语音 / 参考。
 * · **一条页脚**：左「让助手写」+ 读数，右 视频参数 chip + 视频模型 chip + 主键（没片
 *   「生成」、有片「重新生成」）。模型名只在 chip 里出现一次（顶栏读数不再写）。
 * · 写作助手（LLM）那条**点了「让助手写」才出来**，⛔ 常驻最底再占一条。**两种模型
 *   不混**（页脚那两颗是视频的，助手那条是 LLM 的）。
 *
 * ⚠ 镜头说明**就是提示词**：存回去走 `onSave` → `set_prompt`，@ 落槽由 op 执行器
 * 在同一步里做（`syncMentionSlots`），⛔ 这里不自己连边。
 */

import { useRef, useState, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { Library, Sparkles, Upload } from '@/components/icons'

import {
  MentionInput,
  type MentionCandidate,
  type MentionInputHandle,
  type MentionToken,
} from '@/components/ui/mention-input'
import { DURATION, EASE_STANDARD } from '@/constants/motion'
import { NODE_V4_CHROME } from '@/constants/node-studio'
import { cn } from '@/lib/utils'

import { NodeFrame, VersionDots } from '../chrome'
import { TextAssistantBar } from '../text/TextAssistantBar'
import { VideoPlayer } from './VideoPlayer'

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
  readonly versionCount: number
  readonly versionIndex: number
  onVersionChange(index: number): void
  /** 镜头说明（= 这张卡的提示词）。 */
  readonly body: string
  onBodyChange(body: string): void
  onSave(body: string): void
  onRegenerate(): void
  readonly regenerateDisabled: boolean
  /** 没片时空态里那两颗：上传一段 / 从素材库选一段落进这张卡自己。 */
  onUpload(): void
  onLibrary(): void
  /** 页脚左边那行读数（字数 + 已挂了什么）。 */
  readonly footerReadout: string
  /** 页脚右边那两颗 —— 视频参数与视频模型，由调用方给（⛔ 这里不接模型表）。 */
  readonly paramsChip: ReactNode
  readonly modelChip: ReactNode
  /**
   * 播放器与说明之间那条**参考轨** —— 与提示词栏首行是**同一个组件**（画板
   * `VideoRefs.dc.html`：方向 B 只贡献了这一段位置）。⛔ 这里不做第二份。
   */
  readonly refRail: ReactNode
  /**
   * 正文里要渲染成胶囊的名字 —— 画布上的卡**与轨上的序号项**（`@图1`）是同一份，
   * 调用方拼好传进来。
   */
  readonly tokens: readonly MentionToken[]
  readonly candidates: readonly MentionCandidate[]
  onMentionSelect(candidate: MentionCandidate, handle: MentionInputHandle): void
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
  versionCount,
  versionIndex,
  onVersionChange,
  body,
  onBodyChange,
  onSave,
  onRegenerate,
  regenerateDisabled,
  onUpload,
  onLibrary,
  footerReadout,
  paramsChip,
  modelChip,
  refRail,
  tokens,
  candidates,
  onMentionSelect,
}: VideoNodeFrameProps) {
  const t = useTranslations('StudioNode.v4')
  const tVideo = useTranslations('StudioNode.v4.video')
  const editorRef = useRef<MentionInputHandle>(null)
  const reduce = useReducedMotion()
  /** 写作助手那条开着没有（页脚「让助手写」开合）。 */
  const [assistOpen, setAssistOpen] = useState(false)

  /** 失焦即存（spec §2 / §5）。⛔ 不做「保存」按钮。 */
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
      titleExtra={
        <span
          data-video-frame-headline
          className="text-xs text-muted-foreground"
        >
          {headline}
        </span>
      }
      footer={
        <div className="flex items-center gap-2 border-t pt-3">
          <button
            type="button"
            data-video-frame-assist
            aria-expanded={assistOpen}
            onClick={() => setAssistOpen((open) => !open)}
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs transition-[background-color,color,transform] duration-fast ease-standard active:scale-96',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              assistOpen
                ? 'bg-foreground text-background'
                : 'bg-surface-fill text-foreground hover:bg-surface-fill-hover',
            )}
          >
            <Sparkles aria-hidden className="size-3.5" />
            {tVideo('frame.askAssistant')}
          </button>
          <span
            data-video-frame-readout
            className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
          >
            {footerReadout}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {paramsChip}
            {modelChip}
            <button
              type="button"
              data-video-regenerate
              disabled={regenerateDisabled}
              onClick={() => {
                commit()
                onRegenerate()
              }}
              className="inline-flex h-7.5 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-[opacity,transform] duration-fast ease-standard hover:opacity-90 active:scale-96 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            >
              {/* 没片时写「生成」，有片才是「重新生成」。 */}
              {url ? tVideo('frame.regenerate') : tVideo('frame.generate')}
              <kbd className="rounded-sm border border-primary-foreground/35 px-1 font-sans text-3xs">
                {tVideo('frame.regenerateShortcut')}
              </kbd>
            </button>
          </span>
        </div>
      }
      assistantBar={
        <AnimatePresence initial={false}>
          {assistOpen ? (
            <motion.div
              key="assist"
              data-video-frame-assist-bar
              initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
              className="overflow-hidden"
            >
              <TextAssistantBar nodeId={nodeId} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      }
    >
      <div className="flex flex-col gap-2.5">
        {failureMessage && (
          <p
            role="alert"
            className="rounded-xl border border-status-risk/30 bg-status-risk-surface p-4 text-sm leading-relaxed break-words"
          >
            {t('generateDesk.failed', { reason: failureMessage })}
          </p>
        )}
        {url ? (
          <VideoPlayer
            url={url}
            {...(posterUrl ? { posterUrl } : {})}
            title={title}
            onExtractFrame={onExtractFrame}
            extracting={extracting}
            onDownload={onDownload}
          />
        ) : (
          // 没片时矮一截（方向 A）：一句话 + 两颗，⛔ 一块空的 16:9 占半屏。
          <div
            data-video-player="empty"
            className="flex h-62.5 w-full flex-col items-center justify-center gap-3 rounded-node bg-surface-sunken corner-squircle"
          >
            <span className="text-sm text-muted-foreground">
              {t('player.empty')}
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                data-video-frame-upload
                onClick={onUpload}
                className="inline-flex h-7.5 items-center gap-1.5 rounded-full bg-surface-fill px-3 text-xs text-foreground transition-[background-color,transform] duration-fast ease-standard hover:bg-surface-fill-hover active:scale-96 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Upload aria-hidden className="size-3.5" />
                {tVideo('frame.upload')}
              </button>
              <button
                type="button"
                data-video-frame-library
                onClick={onLibrary}
                className="inline-flex h-7.5 items-center gap-1.5 rounded-full bg-surface-fill px-3 text-xs text-foreground transition-[background-color,transform] duration-fast ease-standard hover:bg-surface-fill-hover active:scale-96 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Library aria-hidden className="size-3.5" />
                {tVideo('frame.library')}
              </button>
            </span>
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          <VersionDots
            count={versionCount}
            current={Math.min(versionIndex, Math.max(versionCount - 1, 0))}
            onSelect={onVersionChange}
            ariaLabel={t('chrome.versions')}
            labelOf={(index) =>
              t('chrome.versionOf', { index: index + 1, total: versionCount })
            }
          />
        </div>

        {refRail ? (
          <div data-video-frame-rail className="flex items-center gap-3">
            <span className="shrink-0 text-3xs tracking-node-sec text-muted-foreground">
              {tVideo('rail.title')}
            </span>
            <div className="min-w-0 flex-1">{refRail}</div>
          </div>
        ) : null}

        {/* 正文**永远是编辑区**（画板 `VideoExpanded.dc.html` 下半，方向 A 去掉了
            外面那道框）。2026-09-10 owner 真机反馈第三条：旧写法要先双击才
            进编辑，而那一下双击同时冒泡到卡片上把快速看片顶了出来，看上去就是
            「点不进去」。⛔ 不再留只读预览态。 */}
        <div
          data-video-frame-body
          onDoubleClick={(event) => event.stopPropagation()}
          onBlur={commit}
          onKeyDown={(event) => {
            if (!(event.metaKey || event.ctrlKey)) return
            if (event.key !== 'Enter') return
            event.preventDefault()
            if (regenerateDisabled) return
            commit()
            onRegenerate()
          }}
          // 说明直接写在纸上（方向 A：⛔ 描边框里套框），与上面一道细线隔开。
          className="min-h-24 border-t pt-3.5 text-2sm leading-relaxed tracking-node-body"
        >
          <MentionInput
            variant="canvas"
            ref={editorRef}
            value={body}
            onValueChange={onBodyChange}
            tokens={[...tokens]}
            mentionCandidates={[...candidates]}
            placeholder={tVideo('frame.emptyNote')}
            aria-label={tVideo('frame.editAriaLabel')}
            onMentionSelect={(candidate) => {
              if (!editorRef.current) return
              onMentionSelect(candidate, editorRef.current)
            }}
            className="min-h-16 w-full p-0 text-2sm leading-relaxed"
          />
        </div>
      </div>
    </NodeFrame>
  )
}
