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
 * 视觉走脊柱令牌：`bg-card` / `border` / `rounded-xl` / `shadow-lg`，唯一强调色
 * `--primary`，字号只用 `text-md` / `text-2sm`。⛔ 无 Tailwind 任意值、无魔法值。
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
import type { ComposerReferenceToken } from '@/hooks/node/use-video-composer'
import type { V4ComposerToken } from '@/hooks/node/use-video-composer-v4'
import type { VideoSendSlotLimits } from '@/lib/node-video-send-slots'
import { validateV4Slots } from '@/lib/node-slot-payload'
import { cn } from '@/lib/utils'
import type { ReferenceTokenKind } from '../../composer/ReferenceTokenChip'
import type { NodeV4 } from '@/types/node-workflow'

import { CanvasSlotRack } from '../../composer/CanvasSlotRack'
import { DetailModelPicker } from '../../node-detail/DetailModelPicker'
import { useNodeV4Canvas } from './NodeV4Context'

const IMAGE_ASPECT_RATIOS = Object.keys(IMAGE_SIZES)

/** 模型没声明档位时的兜底秒数（与 `VideoComposer` 的同一份来源）。 */
const FALLBACK_DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <p className="text-2sm text-muted-foreground">{label}</p>
      {children}
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
    <section
      data-generate-desk={data.kind}
      className="space-y-3 rounded-xl border bg-card p-3 shadow-lg"
    >
      <h3 className="text-md font-medium">{t('generateDesk.title')}</h3>

      {/* ── 提示词（可编辑，失焦即存）──────────────────────────────── */}
      <Row label={t('generateDesk.prompt')}>
        <textarea
          data-desk-prompt
          value={draftPrompt}
          aria-label={t('generateDesk.prompt')}
          placeholder={t('generateDesk.promptPlaceholder')}
          onChange={(event) => setDraftPrompt(event.target.value)}
          onBlur={() => {
            if (draftPrompt !== currentPrompt) {
              canvas.onSetPrompt(node.id, draftPrompt)
            }
          }}
          className="h-20 w-full resize-none rounded-md border bg-background p-2 text-2sm"
        />
      </Row>

      {/* ── 模型 ────────────────────────────────────────────────────── */}
      <Row label={t('generateDesk.model')}>
        <DetailModelPicker
          value={data.model}
          options={modelOptions}
          kind={data.kind}
          onChange={(model) => canvas.onSetModel(node.id, model)}
        />
        {modelOptions.length === 0 || !data.model ? (
          <p data-desk-no-model className="text-2sm text-muted-foreground">
            {t('generateDesk.noModel')}
          </p>
        ) : null}
      </Row>

      {/* ── 参数：比例（图/视频）· 清晰度 / 时长 / 音轨 / 种子（仅视频）── */}
      {data.kind === NODE_MEDIA_KIND_IDS.image ? (
        <Row label={t('generateDesk.aspectRatio')}>
          <AspectRatioSelector
            options={IMAGE_ASPECT_RATIOS}
            value={data.params?.aspectRatio ?? ''}
            onChange={(aspectRatio) =>
              canvas.onSetParams(node.id, { ...data.params, aspectRatio })
            }
          />
        </Row>
      ) : null}

      {data.kind === NODE_MEDIA_KIND_IDS.video ? (
        <div className="space-y-3">
          <Row label={t('generateDesk.aspectRatio')}>
            <AspectRatioSelector
              options={VIDEO_ASPECT_RATIOS}
              value={data.params?.aspectRatio ?? ''}
              onChange={(aspectRatio) =>
                canvas.onSetParams(node.id, { ...data.params, aspectRatio })
              }
            />
          </Row>
          <Row label={t('generateDesk.resolution')}>
            <AspectRatioSelector
              variant="neutral"
              options={DEFAULT_VIDEO_RESOLUTIONS}
              value={data.params?.resolution ?? ''}
              onChange={(resolution) =>
                canvas.onSetParams(node.id, { ...data.params, resolution })
              }
            />
          </Row>
          <Row label={t('generateDesk.duration')}>
            <AspectRatioSelector
              variant="neutral"
              options={durations.map((seconds) => ({
                value: String(seconds),
                label: t('generateDesk.durationSeconds', { seconds }),
              }))}
              value={data.params?.duration ?? ''}
              onChange={(duration) =>
                canvas.onSetParams(node.id, { ...data.params, duration })
              }
            />
          </Row>
          <div className="flex items-center justify-between">
            <span className="text-2sm text-muted-foreground">
              {t('generateDesk.generateAudio')}
            </span>
            <Switch
              checked={data.params?.generateAudio ?? false}
              aria-label={t('generateDesk.generateAudio')}
              onCheckedChange={(generateAudio) =>
                canvas.onSetParams(node.id, { ...data.params, generateAudio })
              }
            />
          </div>
          <Row label={t('generateDesk.seed')}>
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
              className="w-full rounded-md border bg-background px-2 py-1 text-2sm"
            />
          </Row>
        </div>
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
        <p data-desk-references className="text-2sm text-muted-foreground">
          {t('generateDesk.slotCount', {
            slot: t(`slots.${NODE_SLOT_IDS.reference}`),
            count: imageComposer.referenceSlots.length,
          })}
        </p>
      ) : null}

      {/* ── 槽校验：一次说全，⛔ 不修一条冒一条 ────────────────────── */}
      {issues.length > 0 ? (
        <ul data-desk-issues className="space-y-1">
          {issues.map((issue) => (
            <li
              key={`${issue.slot}:${issue.issue}`}
              data-slot-issue={issue.issue}
              className="text-2sm text-destructive"
            >
              {issue.i18nKey
                ? tRoot(issue.i18nKey, { slot: t(`slots.${issue.slot}`) })
                : issue.issue}
            </li>
          ))}
        </ul>
      ) : null}

      {/* ── 上传 / 替换素材 ────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
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
          size="sm"
          variant="outline"
          disabled={upload.isUploading}
          onClick={() => fileRef.current?.click()}
        >
          {upload.isUploading
            ? t('generateDesk.uploading', { percent: upload.progress })
            : t('generateDesk.upload')}
        </Button>
        {upload.isUploading ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={upload.cancelUpload}
          >
            {t('generateDesk.uploadCancel')}
          </Button>
        ) : null}
      </div>
      {upload.error ? (
        <div data-desk-upload-failed className="space-y-1">
          <p className="text-2sm text-destructive">
            {t('generateDesk.uploadFailed', { reason: upload.error })}
          </p>
          {pendingFile ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void runUpload(pendingFile)}
            >
              {t('generateDesk.uploadRetry')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* ── 生成 / 重新生成 / 重试 ─────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          data-desk-generate
          disabled={blocking || generation.isLoading}
          className={cn('min-w-24')}
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
      </div>
      {generation.error ? (
        <p data-desk-failed className="text-2sm text-destructive">
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
): ComposerReferenceToken[] {
  const rack: ComposerReferenceToken[] = []
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
