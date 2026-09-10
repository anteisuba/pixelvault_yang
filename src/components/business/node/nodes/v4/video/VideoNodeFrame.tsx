'use client'

/**
 * 视频节点的**画中框**（spec §5 / §1.11，画板 `VideoExpanded.dc.html`，720 宽）。
 *
 * 上半 大播放器（进度 / 声音 / 抽帧 / 下载 + 版本小点）；下半**镜头说明文档**
 * （Markdown 可编辑、可 @，@ 直接指定首帧 / 尾帧 / 语音 / 参考，**不设槽位行**）；
 * 页脚 = 视频参数 chip + 视频模型 chip + 「重新生成 ⌘↵」；最底一条只属于写作助手。
 * **两种模型不混**（页脚那两颗是视频的，最底那条是 LLM 的）。
 *
 * ⚠ 镜头说明**就是提示词**：存回去走 `onSave` → `set_prompt`，@ 落槽由 op 执行器
 * 在同一步里做（`syncMentionSlots`），⛔ 这里不自己连边。
 */

import { useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import {
  MentionInput,
  type MentionCandidate,
  type MentionInputHandle,
  type MentionToken,
} from '@/components/ui/mention-input'
import { NODE_V4_CHROME } from '@/constants/node-studio'

import { NodeFrame, VersionDots } from '../chrome'
import { TextAssistantBar } from '../text/TextAssistantBar'
import { VideoPlayer } from './VideoPlayer'

export interface VideoNodeFrameProps {
  readonly open: boolean
  onClose(): void
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
  onSave(body: string): void
  onRegenerate(): void
  readonly regenerateDisabled: boolean
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
  open,
  onClose,
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
  onSave,
  onRegenerate,
  regenerateDisabled,
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
  const [draft, setDraft] = useState(body)
  const editorRef = useRef<MentionInputHandle>(null)

  // 助手 `set_prompt` 落下来时草稿跟上 —— 渲染期同步，⛔ 不放 effect 里。
  const [syncedBody, setSyncedBody] = useState(body)
  if (syncedBody !== body) {
    setSyncedBody(body)
    setDraft(body)
  }

  /** 失焦即存（spec §2 / §5）。⛔ 不做「保存」按钮。 */
  const commit = () => {
    if (draft !== body) onSave(draft)
  }

  return (
    <NodeFrame
      open={open}
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
        <div className="flex items-center justify-between gap-3">
          <span
            data-video-frame-readout
            className="text-xs text-muted-foreground"
          >
            {footerReadout}
          </span>
          <span className="flex items-center gap-1.5">
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
              className="inline-flex h-7.5 items-center gap-1.5 rounded-full bg-primary px-3 text-2xs font-medium text-primary-foreground transition-opacity duration-fast ease-standard hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            >
              {tVideo('frame.regenerate')}
              <kbd className="rounded-sm border border-primary-foreground/35 px-1 font-sans text-3xs">
                {tVideo('frame.regenerateShortcut')}
              </kbd>
            </button>
          </span>
        </div>
      }
      assistantBar={<TextAssistantBar nodeId={nodeId} />}
    >
      <div className="flex flex-col gap-2.5">
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
          <div
            data-video-player="empty"
            className="flex aspect-video w-full items-center justify-center rounded-node border border-dashed bg-surface-sunken text-2xs text-muted-foreground corner-squircle"
          >
            {t('player.empty')}
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

        <div data-video-frame-rail className="flex flex-col gap-1.5">
          <span className="text-3xs tracking-node-sec text-muted-foreground">
            {tVideo('rail.title')}
          </span>
          {refRail}
        </div>

        {/* 正文**永远是编辑区**（画板 `VideoExpanded.dc.html` 下半：一块带边框的
            文档，没有标题）。2026-09-10 owner 真机反馈第三条：旧写法要先双击才
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
            commit()
            onRegenerate()
          }}
          className="mt-1 max-h-60 min-h-24 overflow-y-auto rounded-xl border p-3.5 text-2sm leading-relaxed tracking-node-body shadow-node-card"
        >
          <MentionInput
            variant="canvas"
            ref={editorRef}
            value={draft}
            onValueChange={setDraft}
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
