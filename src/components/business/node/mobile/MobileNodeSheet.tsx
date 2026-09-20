'use client'

/**
 * 手机端**节点抽屉**（node-canvas-v2 §7.x，画板 `MobileCanvas.dc.html` 方向 A）。
 *
 * 拖手柄 · 半屏 / 全屏两档 · 顶行「名字 + 版本读数」，底下就是这一类卡**桌面提示
 * 词栏的内容**：参考轨 / 提示词 / 参数 chip / 模型 chip / 生成键。
 *
 * ── 一条纪律 ────────────────────────────────────────────────────────────
 * **不复制桌面的编排逻辑**：视频走 `useVideoComposer`（与桌面卡同一份），图片 /
 * 音频走 `useNodeGenerateDraft` + `NodeModelChip`，文本直接摆 `TextAssistantBar`。
 * 参数弹层与模型弹层在触屏紧凑态由 `ResponsivePopover` 自动变成 sheet ——
 * ⛔ 这里不写第二条手机分支。
 */

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Drawer as DrawerPrimitive } from 'vaul'

import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { NODE_MOBILE_RAIL } from '@/constants/node-studio'
import { formatShotDisplayName } from '@/lib/node-display-name'
import { readOutputIndex, readOutputVersions } from '@/lib/node-output-versions'
import type {
  NodeV4,
  NodeV4AudioData,
  NodeV4ImageData,
  NodeV4TextData,
  NodeV4VideoData,
} from '@/types/node-workflow'

import { AudioVoiceChip } from '../nodes/v4/audio/AudioVoiceChip'
import {
  NodeModelChip,
  NodePromptBar,
  VersionDots,
  useNodeGenerateDraft,
} from '../nodes/v4/chrome'
import {
  VoiceLibraryPanel,
  type VoiceLibraryClip,
} from '../voice-library/VoiceLibraryPanel'
import { ImageFrameChip } from '../nodes/v4/image/ImageFrameChip'
import { TextAssistantBar } from '../nodes/v4/text/TextAssistantBar'
import { useNodeV4Canvas } from '../nodes/v4/NodeV4Context'
import {
  buildMentionCandidates,
  buildMentionTokens,
} from '../nodes/v4/NodeV4Mentions'
import { useVideoComposer } from '../nodes/v4/video/use-video-composer'
import { VideoRefRail } from '../nodes/v4/video/VideoRefRail'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS } from '@/constants/node-studio'
import { isShotNode } from './mobile-rail-model'

export interface MobileNodeSheetProps {
  /** `null` = 收起。 */
  readonly node: NodeV4 | null
  onClose(): void
}

function VideoSheetBody({ node }: { readonly node: NodeV4 }) {
  const t = useTranslations('StudioNode.v4')
  const tVideo = useTranslations('StudioNode.v4.video')
  const canvas = useNodeV4Canvas()
  const data = node.data as NodeV4VideoData
  const displayName = isShotNode(node)
    ? formatShotDisplayName(data.label ?? data.name, data.shotNo)
    : data.name

  const tokens = useMemo(
    () => buildMentionTokens(canvas.nodes, node.id),
    [canvas.nodes, node.id],
  )
  const candidates = useMemo(
    () =>
      buildMentionCandidates(canvas.nodes, node.id, (item) =>
        t(`mentionGroups.${item.data.kind}`),
      ),
    [canvas.nodes, node.id, t],
  )
  const mediaOf = useMemo(() => {
    const byName = new Map<
      string,
      { kind: 'image' | 'video' | 'audio' | 'text'; thumbnailUrl?: string }
    >()
    for (const item of canvas.nodes) {
      const itemData = item.data
      if (itemData.kind === NODE_MEDIA_KIND_IDS.text) continue
      if (itemData.kind === NODE_MEDIA_KIND_IDS.audio) {
        byName.set(itemData.name, { kind: 'audio' })
        continue
      }
      byName.set(itemData.name, {
        kind: itemData.kind === NODE_MEDIA_KIND_IDS.video ? 'video' : 'image',
        ...(itemData.url ? { thumbnailUrl: itemData.url } : {}),
      })
    }
    return (name: string) => byName.get(name)
  }, [canvas.nodes])

  const composer = useVideoComposer({
    id: node.id,
    videoData: data,
    displayName,
    tokens,
    candidates,
    mediaOf,
  })

  return (
    <div className="flex flex-col gap-3">
      <SheetHeadline
        name={displayName}
        versionIndex={composer.versionIndex}
        versionCount={composer.versions.length}
      />
      {composer.failureMessage && (
        <p
          role="alert"
          className="rounded-xl border border-status-risk/30 bg-status-risk-surface p-4 text-sm leading-relaxed break-words"
        >
          {t('generateDesk.failed', { reason: composer.failureMessage })}
        </p>
      )}
      {composer.versions.length > 1 ? (
        <VersionDots
          count={composer.versions.length}
          current={Math.min(
            composer.versionIndex,
            composer.versions.length - 1,
          )}
          onSelect={composer.selectVersion}
          ariaLabel={t('chrome.versions')}
          labelOf={(index) =>
            t('chrome.versionOf', {
              index: index + 1,
              total: composer.versions.length,
            })
          }
        />
      ) : null}
      <NodePromptBar
        leadingRow={<VideoRefRail {...composer.railProps} />}
        value={composer.draft}
        onValueChange={composer.setDraft}
        onSubmit={composer.submitPrompt}
        generating={composer.generating}
        onCancel={composer.cancelGeneration}
        placeholder={tVideo('promptPlaceholder')}
        ariaLabel={tVideo('promptLabel')}
        className="w-full"
        mentionOptions={composer.mentionOptions}
        renderValue={composer.renderPromptValue}
        chips={[composer.paramsChip, composer.modelChip]}
      />
      {composer.overlays}
    </div>
  )
}

function ImageSheetBody({ node }: { readonly node: NodeV4 }) {
  const t = useTranslations('StudioNode.v4')
  const tImage = useTranslations('StudioNode.v4.image')
  const canvas = useNodeV4Canvas()
  const data = node.data as NodeV4ImageData
  const draft = useNodeGenerateDraft({
    id: node.id,
    prompt: data.prompt,
    mediaJobId: data.mediaJobId,
    buildMediaPatch: (result) => ({
      url: result.mediaUrl,
      generationId: result.generation.id,
      mediaJobId: undefined,
      imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
    }),
  })
  const versions = readOutputVersions(data)
  const versionIndex = readOutputIndex(data)

  return (
    <div className="flex flex-col gap-3">
      <SheetHeadline
        name={data.name}
        versionIndex={versionIndex}
        versionCount={versions.length}
      />
      {versions.length > 1 ? (
        <VersionDots
          count={versions.length}
          current={Math.min(versionIndex, versions.length - 1)}
          onSelect={(index) =>
            void canvas.onApplyOp({
              op: NODE_ASSISTANT_OP_V4_IDS.setOutputVersion,
              target: node.id,
              index,
            })
          }
          ariaLabel={t('chrome.versions')}
          labelOf={(index) =>
            t('chrome.versionOf', { index: index + 1, total: versions.length })
          }
        />
      ) : null}
      <NodePromptBar
        value={draft.draft}
        onValueChange={draft.setDraft}
        onSubmit={draft.submitPrompt}
        generating={draft.generating}
        onCancel={draft.cancel}
        placeholder={tImage('promptPlaceholder')}
        ariaLabel={tImage('promptLabel')}
        className="w-full"
        chips={[
          <ImageFrameChip
            key="frame"
            aspectRatio={data.params?.aspectRatio}
            modelId={data.model?.modelId}
            model={data.model}
            quality={data.params?.quality}
            resolution={data.params?.resolution}
            count={data.params?.count}
            disabled={draft.generating}
            onAspectRatioChange={(aspectRatio) =>
              canvas.onSetParams(node.id, { ...data.params, aspectRatio })
            }
            onQualityChange={(quality) =>
              canvas.onSetParams(node.id, { ...data.params, quality })
            }
            onResolutionChange={(resolution) =>
              canvas.onSetParams(node.id, { ...data.params, resolution })
            }
            onCountChange={(count) =>
              canvas.onSetParams(node.id, { ...data.params, count })
            }
          />,
          <NodeModelChip
            key="model"
            nodeId={node.id}
            kind={NODE_MEDIA_KIND_IDS.image}
            value={data.model?.optionId ?? null}
            disabled={draft.generating}
          />,
        ]}
      />
    </div>
  )
}

function AudioSheetBody({ node }: { readonly node: NodeV4 }) {
  const tAudio = useTranslations('StudioNode.v4.audio')
  const canvas = useNodeV4Canvas()
  const data = node.data as NodeV4AudioData
  const [voiceLibrary, setVoiceLibrary] = useState(false)
  const draft = useNodeGenerateDraft({
    id: node.id,
    prompt: data.prompt,
    mediaJobId: data.mediaJobId,
  })
  const versions = readOutputVersions(data)
  const versionIndex = readOutputIndex(data)

  const patchProfile = (patch: NonNullable<NodeV4AudioData['voiceProfile']>) =>
    void canvas.onApplyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setVoiceProfile,
      target: node.id,
      profile: patch,
    })

  return (
    <div className="flex flex-col gap-3">
      <SheetHeadline
        name={data.name}
        versionIndex={versionIndex}
        versionCount={versions.length}
      />
      <NodePromptBar
        value={draft.draft}
        onValueChange={draft.setDraft}
        onSubmit={draft.submitPrompt}
        generating={draft.generating}
        onCancel={draft.cancel}
        placeholder={tAudio('promptPlaceholder')}
        ariaLabel={tAudio('promptLabel')}
        className="w-full"
        chips={[
          <AudioVoiceChip
            key="voice"
            voiceId={data.voiceProfile?.voiceId}
            voiceName={data.voiceProfile?.voiceName}
            speed={data.voiceProfile?.speed}
            volume={data.voiceProfile?.volume}
            disabled={draft.generating}
            onSelectVoice={(voice) => {
              patchProfile({ voiceId: voice.voiceId, voiceName: voice.name })
              // 库里自带的试听样本**就是**这条音色的产物 —— 有就落进 `url`。
              if (voice.sampleUrl && !data.url) {
                canvas.onSetMedia(node.id, { url: voice.sampleUrl })
              }
            }}
            onSpeedChange={(speed) => patchProfile({ speed })}
            onVolumeChange={(volume) => patchProfile({ volume })}
            onOpenLibrary={() => setVoiceLibrary(true)}
          />,
          <NodeModelChip
            key="model"
            nodeId={node.id}
            kind={NODE_MEDIA_KIND_IDS.audio}
            value={data.model?.optionId ?? null}
            disabled={draft.generating}
            triggerEmptyLabel={tAudio('model.title')}
          />,
        ]}
      />
      {voiceLibrary ? (
        <VoiceLibraryPanel
          open
          onClose={() => setVoiceLibrary(false)}
          onUseClip={(clip) => {
            canvas.onSetMedia(node.id, {
              url: clip.url,
              source: { kind: clip.sourceKind, label: clip.sourceLabel },
            })
            setVoiceLibrary(false)
          }}
          onSetVoice={(clip: VoiceLibraryClip) => {
            if (!clip.voiceId) return
            // 名字一起记（`voiceName`）：收起的 chip 拉不动整库，没有它就只能
            // 显示那串哈希。
            patchProfile({ voiceId: clip.voiceId, voiceName: clip.name })
            setVoiceLibrary(false)
          }}
        />
      ) : null}
    </div>
  )
}

function TextSheetBody({ node }: { readonly node: NodeV4 }) {
  const tText = useTranslations('StudioNode.v4.text')
  const canvas = useNodeV4Canvas()
  const data = node.data as NodeV4TextData

  return (
    <div className="flex flex-col gap-3">
      <SheetHeadline name={data.name} versionIndex={0} versionCount={0} />
      {/* 文本卡就是一只文本框：失焦即存（与全屏文档同一条 `onEditText`）。 */}
      <textarea
        defaultValue={data.body}
        placeholder={tText('empty')}
        aria-label={data.name}
        data-mobile-text-body
        onBlur={(event) => canvas.onEditText(node.id, event.target.value)}
        className="min-h-40 w-full resize-none rounded-lg border border-border bg-card p-3 text-sm leading-relaxed text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      />
      <TextAssistantBar nodeId={node.id} />
    </div>
  )
}

function SheetHeadline({
  name,
  versionIndex,
  versionCount,
}: {
  readonly name: string
  readonly versionIndex: number
  readonly versionCount: number
}) {
  const tRail = useTranslations('StudioNode.mobileRail')
  return (
    <div className="flex items-center gap-2">
      <DrawerPrimitive.Title className="min-w-0 flex-1 truncate text-2sm font-semibold">
        {name}
      </DrawerPrimitive.Title>
      {versionCount > 1 ? (
        <span
          data-mobile-sheet-versions
          className="shrink-0 text-xs tabular-nums text-muted-foreground"
        >
          {tRail('versionReadout', {
            index: Math.min(versionIndex + 1, versionCount),
            total: versionCount,
          })}
        </span>
      ) : null}
    </div>
  )
}

export function MobileNodeSheet({ node, onClose }: MobileNodeSheetProps) {
  const snapPoints = NODE_MOBILE_RAIL.sheetSnapPoints
  const [snap, setSnap] = useState<number | string | null>(
    snapPoints[0] ?? 0.55,
  )

  return (
    <DrawerPrimitive.Root
      open={node !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      snapPoints={[...snapPoints]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/30" />
        <DrawerPrimitive.Content
          data-mobile-node-sheet
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t border-border bg-background focus:outline-none"
          // ⚠ 高度写在 style 里而不是 `h-[95svh]`：Tailwind 任意值在本项目是禁用的
          // （Hard Rule 5），写成类名会**静默不生效** —— 抽屉塌成内容高、vaul 的
          // 吸附又按满高平移，结果整块被推到视口下面（2026-09-11 真机实测）。
          style={{
            height: '95svh',
            bottom: 'var(--keyboard-inset, 0px)',
            maxHeight: 'calc(100svh - var(--keyboard-inset, 0px) - 0.75rem)',
          }}
        >
          <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30" />
          {/* ⚠ 抽屉内滚动**不带动列表**：`overscroll-contain` 把滚到头之后的
              那一下留在抽屉里（触屏上不加它会把身后的镜头带一起拖走）。 */}
          <div
            className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3"
            style={{
              paddingBottom:
                'max(var(--keyboard-safe-area-bottom, 0px), 1.5rem)',
            }}
          >
            {node?.data.kind === NODE_MEDIA_KIND_IDS.video ? (
              <VideoSheetBody key={node.id} node={node} />
            ) : node?.data.kind === NODE_MEDIA_KIND_IDS.image ? (
              <ImageSheetBody key={node.id} node={node} />
            ) : node?.data.kind === NODE_MEDIA_KIND_IDS.audio ? (
              <AudioSheetBody key={node.id} node={node} />
            ) : node?.data.kind === NODE_MEDIA_KIND_IDS.text ? (
              <TextSheetBody key={node.id} node={node} />
            ) : null}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  )
}
