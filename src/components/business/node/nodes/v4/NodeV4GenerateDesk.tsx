'use client'

/**
 * v4 展开态底部的**生成编排区**（第三期 · 画布 C3c-① C）。
 *
 * 盘点里 v4 展开态最大的一块空缺：模型 / 参数 / 提示词编辑 / 槽校验 / 生成按钮 /
 * 失败重试 / 上传，在 v3 分散住在 `ImageFamilyBody`(807) 与 `composer/
 * VideoComposer.tsx`(2489) 两处。这里是**四类节点共用的一块**，⛔ 不按 kind 各
 * 写一版：kind 只决定「露哪几档参数」和「素材架读哪个 hook」。
 *
 * ── 三条纪律 ────────────────────────────────────────────────────────────
 * ① **写入全部走 `NodeV4Context`** —— 也就是 `NodeV4Provider` 落到 op 表的那条
 *    路径。⛔ 这里不碰 state、不自己 setNodes。
 * ② **载荷不在这里装配** —— `useNodeMediaGenerationV4().generateNode(nodeId,
 *    graph)` 按具名槽装配（`node-slot-payload`），这里只负责按下去。
 * ③ **校验文案照抄 `validateV4Slots` 的结论** —— ⛔ 不在 UI 层另判一次「能不能
 *    生成」（v3 时代 `getMediaGenerateBlockReason` 之外还有三份手写判定，正是
 *    「按钮亮着但点了没反应」的来源）。
 *
 * ── 形态（HIG 定稿 2026-09-08）────────────────────────────────────────────
 * 自上而下五段，顺序即「先说做什么、再说怎么做、最后才是动作」：分区头（尾部灰
 * 色模型名）→ 填充式提示词 → 参数 inset 分组（互斥参数一律**分段控件**，布尔用
 * iOS 开关，连续量用滑杆）→ 贴在主按钮上方的校验脚注 → 整宽实心主按钮 + 无边框
 * 次动作。⛔ 编排区不再是一张带边框带阴影的卡中卡：分区靠留白分层。
 * 视觉走脊柱令牌 + `surface-fill` 三档，唯一强调色 `--primary`，字号只用
 * `text-md` / `text-2sm` / `text-3xs`。⛔ 无 Tailwind 任意值、无魔法值。
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { AspectRatioSelector } from '@/components/ui/aspect-ratio-selector'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { IMAGE_SIZES } from '@/constants/config'
import { getNodeV4Ports, NODE_SLOT_IDS } from '@/constants/node-slots'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS } from '@/constants/node-studio'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'
import {
  DEFAULT_VIDEO_RESOLUTIONS,
  VIDEO_ASPECT_RATIOS,
} from '@/constants/video-options'
import { useGenerateComposerV4 } from '@/hooks/node/use-generate-composer-v4'
import { useNodeMediaGenerationV4 } from '@/hooks/node/use-node-media-generation-v4'
import { useNodeReferenceUpload } from '@/hooks/node/use-node-reference-upload'
import { useVideoComposerV4 } from '@/hooks/node/use-video-composer-v4'

import type { V4ComposerToken } from '@/hooks/node/use-video-composer-v4'
import type { VideoSendSlotLimits } from '@/lib/node-video-send-slots'
import { validateV4Slots } from '@/lib/node-slot-payload'
import { cn } from '@/lib/utils'
import type { ReferenceTokenKind } from '../../composer/ReferenceTokenChip'
import type { NodeV4 } from '@/types/node-workflow'

import {
  CanvasSlotRack,
  type CanvasSlotRackToken,
} from '../../composer/CanvasSlotRack'
import { DetailModelPicker } from '../../node-detail/DetailModelPicker'
import { useNodeV4Canvas } from './NodeV4Context'

const IMAGE_ASPECT_RATIOS = Object.keys(IMAGE_SIZES)

/** 模型没声明档位时的兜底秒数（与 `VideoComposer` 的同一份来源）。 */
const FALLBACK_DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

/**
 * 分区头（HIG grouped-list header）：13px/600 黑字 + 尾部灰色补充。
 * ⚠ 层级交给字重，⛔ 不再全大写拉字距、⛔ 不靠颜色。
 */
function DeskHeading({ title, trail }: { title: string; trail?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <h3 className="text-2sm font-semibold tracking-node-sec">{title}</h3>
      {trail ? (
        <span className="truncate font-mono text-3xs text-muted-foreground">
          {trail}
        </span>
      ) : null}
    </div>
  )
}

/** inset grouped list：一个圆角填充容器，行 42px，行间一条 border。 */
function InsetGroup({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-inset-group
      className="overflow-hidden rounded-xl bg-surface-fill corner-squircle"
    >
      {children}
    </div>
  )
}

function InsetRow({
  label,
  stacked,
  children,
}: {
  label: string
  /**
   * 宽控件（分段控件一排 4–6 格）放不进「标签 ‖ 值」一行时，改成标签在上、控件
   * 整宽在下。⚠ 这不是两种样式，是同一行的两种排法——⛔ 别让分段控件横向溢出
   * 到卡外，那会把「还有更多档」读成「这个控件坏了」。
   */
  stacked?: boolean
  children: React.ReactNode
}) {
  if (stacked) {
    return (
      <div className="flex flex-col gap-1.5 border-t border-border/60 px-3 py-2 first:border-t-0">
        <span className="text-2sm tracking-node-body">{label}</span>
        {children}
      </div>
    )
  }
  return (
    <div className="flex min-h-11 items-center gap-3 border-t border-border/60 px-3 py-1.5 first:border-t-0">
      <span className="shrink-0 text-2sm tracking-node-body">{label}</span>
      <div className="ml-auto flex min-w-0 items-center gap-2">{children}</div>
    </div>
  )
}

export interface NodeV4GenerateDeskProps {
  readonly node: NodeV4
}

export function NodeV4GenerateDesk({ node }: NodeV4GenerateDeskProps) {
  const t = useTranslations('StudioNode.v4')
  const tRoot = useTranslations()
  const canvas = useNodeV4Canvas()
  const generation = useNodeMediaGenerationV4()
  const upload = useNodeReferenceUpload()
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const data = node.data
  const isVideoShot =
    data.kind === NODE_MEDIA_KIND_IDS.video &&
    data.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot

  // 视频镜头的槽架读 v4 令牌（`useVideoComposerV4`）；图片读参考格。两个 hook 都
  // 必须无条件调用（Rules of Hooks），非本档时它们的结果不渲染。
  const videoComposer = useVideoComposerV4(node.id, canvas.nodes, canvas.edges)
  const imageComposer = useGenerateComposerV4(
    node.id,
    canvas.nodes,
    canvas.edges,
  )

  const issues = useMemo(
    () => validateV4Slots(node, canvas.edges, canvas.nodes),
    [node, canvas.edges, canvas.nodes],
  )

  const [draftPrompt, setDraftPrompt] = useState(
    data.kind === NODE_MEDIA_KIND_IDS.text ? '' : (data.prompt ?? ''),
  )
  const [syncedPrompt, setSyncedPrompt] = useState(draftPrompt)
  const currentPrompt =
    data.kind === NODE_MEDIA_KIND_IDS.text ? '' : (data.prompt ?? '')
  if (syncedPrompt !== currentPrompt) {
    // 助手 `set_prompt` 落下来时草稿跟上 —— 渲染期同步，⛔ 不放 effect 里。
    setSyncedPrompt(currentPrompt)
    setDraftPrompt(currentPrompt)
  }

  const runUpload = useCallback(
    async (file: File) => {
      setPendingFile(file)
      const result = await upload.uploadFile(file, node.data.name)
      if (!result.success || !result.url) return
      // 回填字段 = C3c-① A 补进 v4 schema 的那一组，⛔ 不在这里另发明字段。
      canvas.onSetMedia(node.id, {
        url: result.url,
        sizeBytes: file.size,
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
      })
      setPendingFile(null)
    },
    [upload, canvas, node.id, node.data.name],
  )

  if (data.kind === NODE_MEDIA_KIND_IDS.text) {
    // 文本节点没有生成落点（`planV4Generation` 对它返回 null），只有派生按钮 ——
    // 那一排住在 `TextNodeV4` 的工具条里。
    return (
      <p data-generate-desk="none" className="text-2sm text-muted-foreground">
        {t('generateDesk.noGenerate')}
      </p>
    )
  }

  const modelOptions = canvas.modelOptionsByKind[data.kind] ?? []
  const capabilities = data.model?.modelId
    ? getVideoModelCapabilities(data.model.modelId)
    : undefined
  const durations = capabilities?.supportedDurations ?? FALLBACK_DURATIONS
  const blocking = !data.model?.modelId || issues.length > 0

  return (
    <section data-generate-desk={data.kind} className="flex flex-col gap-3">
      <DeskHeading
        title={t('generateDesk.title')}
        trail={data.model?.modelId}
      />

      {/* ── 提示词：填充式 textarea（HIG filled field，⛔ 不描边）───────── */}
      <textarea
        data-desk-prompt
        value={draftPrompt}
        aria-label={t('generateDesk.prompt')}
        // 占位按 kind 分：音频卡上写「描述你要的画面」是明摆着的错话，而占位
        // 正是新手唯一会照着写的示范。⛔ 不共用一句。
        placeholder={t(`generateDesk.promptPlaceholder.${data.kind}`)}
        onChange={(event) => setDraftPrompt(event.target.value)}
        onBlur={() => {
          if (draftPrompt !== currentPrompt) {
            canvas.onSetPrompt(node.id, draftPrompt)
          }
        }}
        className="h-20 w-full resize-none rounded-xl bg-surface-fill p-3 text-2sm tracking-node-body corner-squircle focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      />

      {/* ── 参数：一个 inset 分组，一行一参数 ───────────────────────── */}
      <InsetGroup>
        <InsetRow label={t('generateDesk.model')}>
          <DetailModelPicker
            value={data.model}
            options={modelOptions}
            kind={data.kind}
            onChange={(model) => canvas.onSetModel(node.id, model)}
          />
        </InsetRow>

        {data.kind === NODE_MEDIA_KIND_IDS.image ? (
          <InsetRow label={t('generateDesk.aspectRatio')} stacked>
            <AspectRatioSelector
              variant="segmented"
              options={IMAGE_ASPECT_RATIOS}
              value={data.params?.aspectRatio ?? ''}
              onChange={(aspectRatio) =>
                canvas.onSetParams(node.id, { ...data.params, aspectRatio })
              }
            />
          </InsetRow>
        ) : null}

        {data.kind === NODE_MEDIA_KIND_IDS.video ? (
          <>
            <InsetRow label={t('generateDesk.aspectRatio')} stacked>
              <AspectRatioSelector
                variant="segmented"
                options={VIDEO_ASPECT_RATIOS}
                value={data.params?.aspectRatio ?? ''}
                onChange={(aspectRatio) =>
                  canvas.onSetParams(node.id, { ...data.params, aspectRatio })
                }
              />
            </InsetRow>
            <InsetRow label={t('generateDesk.resolution')} stacked>
              <AspectRatioSelector
                variant="segmented"
                options={DEFAULT_VIDEO_RESOLUTIONS}
                value={data.params?.resolution ?? ''}
                onChange={(resolution) =>
                  canvas.onSetParams(node.id, { ...data.params, resolution })
                }
              />
            </InsetRow>
            <InsetRow label={t('generateDesk.duration')} stacked>
              <AspectRatioSelector
                variant="segmented"
                options={durations.map((seconds) => ({
                  value: String(seconds),
                  label: t('generateDesk.durationSeconds', { seconds }),
                }))}
                value={data.params?.duration ?? ''}
                onChange={(duration) =>
                  canvas.onSetParams(node.id, { ...data.params, duration })
                }
              />
            </InsetRow>
            <InsetRow label={t('generateDesk.generateAudio')}>
              <Switch
                size="lg"
                checked={data.params?.generateAudio ?? false}
                aria-label={t('generateDesk.generateAudio')}
                onCheckedChange={(generateAudio) =>
                  canvas.onSetParams(node.id, { ...data.params, generateAudio })
                }
              />
            </InsetRow>
            <InsetRow label={t('generateDesk.seed')}>
              <input
                type="number"
                value={data.params?.seed ?? ''}
                aria-label={t('generateDesk.seed')}
                placeholder={t('generateDesk.seedPlaceholder')}
                onChange={(event) =>
                  canvas.onSetParams(node.id, {
                    ...data.params,
                    ...(event.target.value
                      ? { seed: Number(event.target.value) }
                      : { seed: undefined }),
                  })
                }
                className="w-24 rounded-lg bg-surface-fill-hover px-2 py-1 text-right font-mono text-2sm tabular-nums focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              />
            </InsetRow>
          </>
        ) : null}
      </InsetGroup>

      {modelOptions.length === 0 || !data.model ? (
        <p data-desk-no-model className="text-3xs text-muted-foreground">
          {t('generateDesk.noModel')}
        </p>
      ) : null}

      {/* ── 素材槽架：镜头读 v4 令牌，图片读参考格 ────────────────── */}
      {isVideoShot ? (
        <CanvasSlotRack
          tokens={toRackTokens(videoComposer.tokens, canvas.nodes)}
          slotLimits={rackLimits(node)}
          defaultExpanded
          unsendableUrls={
            new Set(
              videoComposer.tokens
                .filter((token) => !token.sending && token.mediaUrl)
                .map((token) => token.mediaUrl as string),
            )
          }
          onLocate={canvas.onFocusNode}
        />
      ) : null}
      {data.kind === NODE_MEDIA_KIND_IDS.image ? (
        <p data-desk-references className="text-3xs text-muted-foreground">
          {t('generateDesk.slotCount', {
            slot: t(`slots.${NODE_SLOT_IDS.reference}`),
            count: imageComposer.referenceSlots.length,
          })}
        </p>
      ) : null}

      {/* ── 槽校验：一次说全（⛔ 不修一条冒一条），位置贴在主按钮**正上方**
          —— HIG footnote 位：解释谁就贴谁下面。阻塞时主按钮 disabled 但
          **保持可见**。 */}
      {issues.length > 0 ? (
        <ul data-desk-issues className="space-y-0.5">
          {issues.map((issue) => (
            <li
              key={`${issue.slot}:${issue.issue}`}
              data-slot-issue={issue.issue}
              className="text-3xs text-destructive"
            >
              {issue.i18nKey
                ? tRoot(issue.i18nKey, { slot: t(`slots.${issue.slot}`) })
                : issue.issue}
            </li>
          ))}
        </ul>
      ) : null}

      {/* ── 动作：整宽实心主按钮 → 无边框整宽次动作 ─────────────────── */}
      <Button
        type="button"
        data-desk-generate
        disabled={blocking || generation.isLoading}
        className={cn('w-full rounded-xl')}
        onClick={() =>
          void generation.generateNode(node.id, {
            nodes: canvas.nodes,
            edges: canvas.edges,
          })
        }
      >
        {generation.isLoading
          ? t('generateDesk.generating')
          : generation.error
            ? t('generateDesk.retry')
            : data.url
              ? t('generateDesk.regenerate')
              : t('generateDesk.generate')}
      </Button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void runUpload(file)
          event.target.value = ''
        }}
      />
      <Button
        type="button"
        variant="ghost"
        disabled={upload.isUploading}
        className="w-full rounded-xl"
        onClick={() => fileRef.current?.click()}
      >
        {upload.isUploading
          ? t('generateDesk.uploading', { percent: upload.progress })
          : t('generateDesk.upload')}
      </Button>
      {upload.isUploading ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full rounded-xl"
          onClick={upload.cancelUpload}
        >
          {t('generateDesk.uploadCancel')}
        </Button>
      ) : null}

      {upload.error ? (
        <div data-desk-upload-failed className="space-y-1">
          <p className="text-3xs text-destructive">
            {t('generateDesk.uploadFailed', { reason: upload.error })}
          </p>
          {pendingFile ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-full rounded-xl"
              onClick={() => void runUpload(pendingFile)}
            >
              {t('generateDesk.uploadRetry')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {generation.error ? (
        <p data-desk-failed className="text-3xs text-destructive">
          {t('generateDesk.failed', { reason: generation.error })}
        </p>
      ) : null}
    </section>
  )
}

/**
 * v4 令牌 → 槽架认的令牌形状。**这是「改读 tokens」的落点**：位置不再由
 * `payloadImageUrls.indexOf(url)` 反查（v3 那条会说谎的路），而是槽本身。
 *
 * ⚠ 分区（图 / 音 / 视频）按**源节点的 kind** 走 —— 与收割侧一致（音频进
 * `audioBindings`、视频进 `videoUrls`、其余全进图片位）。⛔ 不按槽名分区：
 * `reference` 槽在 `video.shot` 上同时收图和视频。
 */
function toRackTokens(
  tokens: readonly V4ComposerToken[],
  nodes: readonly NodeV4[],
): CanvasSlotRackToken[] {
  const rack: CanvasSlotRackToken[] = []
  for (const token of tokens) {
    // 文本槽不进槽架：那一格发的是字，槽架回答的是「挂了哪些素材」。
    if (token.slot === NODE_SLOT_IDS.text) continue
    const source = nodes.find((node) => node.id === token.nodeId)
    if (!source) continue
    const kind: ReferenceTokenKind =
      source.data.kind === NODE_MEDIA_KIND_IDS.audio
        ? 'voice'
        : source.data.kind === NODE_MEDIA_KIND_IDS.video
          ? 'video'
          : token.slot === NODE_SLOT_IDS.firstFrame ||
              token.slot === NODE_SLOT_IDS.lastFrame
            ? 'keyframe'
            : token.slot === NODE_SLOT_IDS.closeup
              ? 'closeup'
              : source.data.kind === NODE_MEDIA_KIND_IDS.image &&
                  source.data.subtype === 'character'
                ? 'character'
                : 'shot'
    rack.push({
      id: token.edgeId,
      kind,
      label: token.label,
      token: token.label,
      edgeId: token.edgeId,
      ...(token.mediaUrl ? { mediaUrl: token.mediaUrl } : {}),
      dimmed: !token.sending,
    })
  }
  return rack
}

/**
 * 槽架的上限直接读**端口表**（`NODE_V4_PORTS`）—— 与端口渲染、连线合法性同一份
 * 事实源。静态 `null`（跟模型走）渲染成 `Infinity`：槽架的契约明写「上游没公布
 * 硬上限就**不要**渲染成一个我们编的数字」。⚠ 按模型解算的那一档
 * （`resolveVideoSendSlotLimits`）留在 C3c-②，与视频送出契约一起接。
 */
function rackLimits(node: NodeV4): VideoSendSlotLimits {
  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  const maxOf = (slot: string): number =>
    ports?.inputs.find((spec) => spec.slot === slot)?.max ??
    Number.POSITIVE_INFINITY
  return {
    images:
      maxOf(NODE_SLOT_IDS.reference) +
      maxOf(NODE_SLOT_IDS.firstFrame) +
      maxOf(NODE_SLOT_IDS.lastFrame),
    videos: maxOf(NODE_SLOT_IDS.reference),
    audio: maxOf(NODE_SLOT_IDS.voice),
    imagesLimitedByTotal: false,
  }
}
