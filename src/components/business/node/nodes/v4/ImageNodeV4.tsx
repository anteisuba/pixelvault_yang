'use client'

/**
 * 图片节点（v3 spec §3，画板 `ImageStates` / `ImageSelected` / `ImageToolbar` /
 * `PromptBar` / `ImageQuickLook`）。
 *
 * 五态：**空卡**（虚线框 + 加号 + 一句提示，⌘V / 拖入都落进这张卡）· **有图收起**
 * （卡即图、按真实比例、名字在卡外，⛔ 无角标、无槽、无卡头）· **选中**（工具条浮
 * 在卡上、提示词栏浮在卡下、版本点在中间）· **生成中**（裱框显影 + 栏变灰可取消）
 * · **快速看**（双击，原比例大图 + 版本 + 下载）。
 *
 * ── 三条纪律 ────────────────────────────────────────────────────────────
 * ① **壳全部来自 `chrome/`**：卡骨架 / 工具条 / 提示词栏 / chip 弹层 / 版本点 /
 *    裱框显影 / 快速看。⛔ 这里不复制任何一件的形态。
 * ② **语义写入走 op**（`canvas.onApplyOp`）；媒体回填走 `canvas.onSetMedia`
 *    （上传与生成都是用户的动作，⛔ 助手不许塞 URL —— op 表 §5 纪律 1）。
 * ③ **参数与模型走 `onSetParams` / `onSetModel`**，⛔ 不在组件里存一份影子状态。
 *
 * ── S3b 补上的三处（原来的缺口）────────────────────────────────────────
 * · **产出版本**有了数据层落点（`outputs.versions`）：小点读 `imageVersions()`、
 *   切版本发 `set_output_version`。⛔ 组件里不再存一份影子 `versionIndex`——
 *   那会与卡上真正显示的那一版漂开。
 * · **「设为角色卡」**走 `set_subtype`（撤销回原来的子型，不是一个恰好同名的字段值）。
 * · **「生镜头」**是**一批**：`[add_node video.shot(ref), connect this→ref.firstFrame]`
 *   —— 批内别名表让第二条认得出刚建的那张，且两条合成一个撤销条目。
 */

import { NodeToolbar as FlowNodeToolbar, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Clapperboard,
  Download,
  MoreHorizontal,
  Pencil,
} from '@/components/icons'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { PROGRESS_TICK_MS } from '@/constants/generation-progress'
import {
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_V4_CARD,
} from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { useNodeMediaGenerationV4 } from '@/hooks/node/use-node-media-generation-v4'
import { useNodeUploadV4 } from '@/hooks/node/use-node-upload-v4'
import { getGeneratingStageKey } from '@/lib/generation-progress'
import { renameStableNodeName } from '@/lib/node-display-name'
import type { ReadyCanvasImageEditCapabilityId } from '@/types/canvas-image-edit'
import type {
  NodeV4,
  NodeV4ImageData,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

import { CanvasImageEditWorkspace } from '../../CanvasImageEditWorkspace'
import {
  NodeCardShell,
  portSpecOf,
  NodeFrameProgress,
  NodePromptBar,
  NodeToolbar,
  QuickLook,
  VersionDots,
  ConnectToShotPopover,
  flashNodeCard,
  useNodeCardFlash,
  renderPromptMentions,
  type MentionPickerOption,
  type NodeToolbarGroup,
} from './chrome'
import {
  buildConnectToShotOps,
  buildConnectToShotTargets,
} from './connect-to-shot-targets'
import { ImageFrameChip } from './image/ImageFrameChip'
import {
  ImageAddMenuItems,
  ImageEditMenuItems,
  ImageMoreMenuItems,
} from './image/ImageNodeMenus'
import { readOutputIndex } from '@/lib/node-output-versions'

import { ImageRefRail } from './image/ImageRefRail'
import { useImageRefBinding } from './image/use-image-ref-binding'
import {
  collapsedImageHeight,
  collapsedImageWidth,
  formatSizeBytes,
  imageNodeAcceptsReferences,
  imageVersions,
  toStudioModelOption,
} from './image/image-node-model'
import { buildMentionCandidates, buildMentionTokens } from './NodeV4Mentions'
import { videoRailMentionLabels } from '@/lib/video-node-rail'
import { ModelPickerPopover } from '../../../studio-shared/pickers/ModelPickerPopover'
import { useOpenApiKeys } from '../../workbench-v4/shell/ShellApiKeys'
import { useNodeV4Canvas } from './NodeV4Context'
import { NodeV4ContextMenu } from './NodeV4ContextMenu'
import { triggerNodeV4Download } from './NodeV4SelectionToolbar'

export { collapsedImageWidth, formatSizeBytes }

/** 「生镜头」那一批里指代新建镜头的别名（只在这一批之内有效）。 */
const SHOT_BATCH_REF = 'shot'

/** 空卡高：16:9（画板 280×200 那张的同一档比例）。 */
function emptyCardHeight(width: number): number {
  return Math.round((width * 9) / 16)
}

export function ImageNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const tImage = useTranslations('StudioNode.v4.image')
  const tStage = useTranslations('StudioV3')
  const canvas = useNodeV4Canvas()
  const openApiKeys = useOpenApiKeys()
  const generation = useNodeMediaGenerationV4()
  const upload = useNodeUploadV4()
  const imageData = data as unknown as NodeV4ImageData
  /** 别人「连到镜头」连到这张卡时那一下高亮（spec §1.13）。 */
  const flashed = useNodeCardFlash(id)

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  /** ⋯「重命名这张图」触发卡外那行名字进入编辑（`NodeCardShell.renameRequest`）。 */
  const [renameRequest, setRenameRequest] = useState(0)
  const [quickLook, setQuickLook] = useState(false)
  const [assetPicker, setAssetPicker] = useState(false)
  const [editTask, setEditTask] =
    useState<ReadyCanvasImageEditCapabilityId | null>(null)
  const [draft, setDraft] = useState(imageData.prompt ?? '')
  const [syncedPrompt, setSyncedPrompt] = useState(imageData.prompt ?? '')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const promptInputRef = useRef<HTMLTextAreaElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const acceptsRefs = imageNodeAcceptsReferences(imageData.subtype)
  const refs = useImageRefBinding({
    id,
    displayName: imageData.name,
    model: imageData.model,
    disabled: Boolean(imageData.mediaJobId),
  })

  // 助手 `set_prompt` 落下来时草稿跟上 —— 渲染期同步，⛔ 不放 effect 里
  const currentPrompt = imageData.prompt ?? ''
  if (syncedPrompt !== currentPrompt) {
    setSyncedPrompt(currentPrompt)
    setDraft(currentPrompt)
  }

  const generating = Boolean(imageData.mediaJobId) || startedAt !== null

  // 计时只在生成中跑：裱框显影的百分比是**估算曲线**读它算的
  // （`generation-progress`），⛔ 不常驻一个每 500ms 醒一次的定时器。
  useEffect(() => {
    // ⚠ 不生成时**不清零**：清零要在 effect 里 setState，那是一次级联渲染，而这个
    // 值在不生成时根本没有读者。下一轮生成挂上来时第一次 `tick()` 就把它盖掉了。
    if (!generating) return
    const begin = startedAt ?? Date.now()
    const tick = () => setElapsed((Date.now() - begin) / 1000)
    tick()
    const timer = window.setInterval(tick, PROGRESS_TICK_MS)
    return () => window.clearInterval(timer)
  }, [generating, startedAt])

  /**
   * 上传落这张卡。⚠ 走「最新值 ref」而不是把依赖列进 `useCallback`：
   * `useNodeUploadV4()` 每次渲染都返回一个新对象，列进去等于每渲染一次就把粘贴
   * 监听拆装一遍（`WorkbenchDndV4` 里的同一条模式）。
   */
  const latest = useRef({
    upload,
    canvas,
    id,
    name: imageData.name,
    hasUrl: Boolean(imageData.url),
    hasNaturalSize: Boolean(imageData.mediaWidth && imageData.mediaHeight),
    acceptsRefs,
    attachRef: refs.attachFile,
  })
  useEffect(() => {
    latest.current = {
      upload,
      canvas,
      id,
      name: imageData.name,
      hasUrl: Boolean(imageData.url),
      hasNaturalSize: Boolean(imageData.mediaWidth && imageData.mediaHeight),
      acceptsRefs,
      attachRef: refs.attachFile,
    }
  })
  const sizeBackfillLock = useRef(false)
  useEffect(() => {
    sizeBackfillLock.current = false
  }, [imageData.url])
  const rememberImageSize = useCallback((image: HTMLImageElement) => {
    const bound = latest.current
    if (bound.hasNaturalSize || sizeBackfillLock.current) return
    const width = image.naturalWidth
    const height = image.naturalHeight
    if (width <= 0 || height <= 0) return
    sizeBackfillLock.current = true
    bound.canvas.onSetMedia(bound.id, {
      mediaWidth: width,
      mediaHeight: height,
    })
  }, [])
  const runUpload = useCallback((file: File) => {
    const bound = latest.current
    void bound.upload.upload('image', file, bound.name).then((patch) => {
      if (!patch) return
      bound.canvas.onSetMedia(bound.id, {
        ...patch,
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
      })
    })
  }, [])

  /**
   * ⌘V 落进**这张卡**（spec §1.3「粘贴不做按钮」）。
   *
   * ⚠ 捕获阶段挂在 `window` 上并 `stopPropagation`：工作台那条粘贴路径
   * （`useWorkbenchDndV4`）是「在鼠标处**新建**一张卡」，选中态下两条都跑会同时
   * 落进这张卡又多出一张。选中的卡优先，⛔ 不让两条路都生效。
   */
  useEffect(() => {
    if (!selected || canvas.selectedNodeIds.length >= 2) return
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith('image/'),
      )
      if (!file) return
      event.preventDefault()
      event.stopPropagation()
      if (latest.current.acceptsRefs && latest.current.hasUrl) {
        latest.current.attachRef(file)
      } else {
        runUpload(file)
      }
    }
    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
  }, [selected, canvas.selectedNodeIds.length, runUpload])

  const node = canvas.nodes.find((item) => item.id === id) as NodeV4 | undefined
  if (!node) return null

  const mentionTokens = buildMentionTokens(canvas.nodes, id).filter(
    (token) => token.kind !== 'video' && token.kind !== 'voice',
  )
  const mentionCandidates = buildMentionCandidates(
    canvas.nodes.filter(
      (item) => item.id !== id && item.data.kind === NODE_MEDIA_KIND_IDS.image,
    ),
    id,
    (item) => item.data.name,
  )
  const railMentionOptions: MentionPickerOption[] = acceptsRefs
    ? [
        ...refs.items.map((entry) => ({
          id: `rail:${entry.edgeId}`,
          name: `${tImage('rail.group')}${entry.index}`,
          groupLabel: tImage('rail.mentionGroup'),
          ...(entry.thumbnailUrl
            ? {
                media: {
                  kind: 'image' as const,
                  thumbnailUrl: entry.thumbnailUrl,
                },
              }
            : {}),
        })),
        ...mentionCandidates.map((candidate) => {
          const token = mentionTokens.find(
            (item) => item.name === candidate.name,
          )
          return {
            id: candidate.id,
            name: candidate.name,
            groupLabel: tImage('add.canvas'),
            ...(token?.thumbnailUrl
              ? {
                  media: {
                    kind: 'image' as const,
                    thumbnailUrl: token.thumbnailUrl,
                  },
                }
              : {}),
          }
        }),
      ]
    : []
  const mentionNames = [
    ...refs.items.flatMap((entry) => videoRailMentionLabels(entry)),
    ...mentionTokens.map((token) => token.name),
  ]
  const mentionMediaOf = (name: string) => {
    const rail = refs.items.find((entry) =>
      videoRailMentionLabels(entry).includes(name),
    )
    if (rail?.thumbnailUrl) {
      return { kind: 'image' as const, thumbnailUrl: rail.thumbnailUrl }
    }
    const token = mentionTokens.find((item) => item.name === name)
    if (token?.thumbnailUrl) {
      return { kind: 'image' as const, thumbnailUrl: token.thumbnailUrl }
    }
    return undefined
  }

  const versions = imageVersions(imageData)
  // ⚠ 当前版**从数据读**（`outputs.cur`），⛔ 不在组件里存一份 useState：
  // 助手发 `set_output_version` 时组件那份不会跟，卡上显示的图与小点会对不上。
  const versionIndex = readOutputIndex(imageData)
  const selectVersion = (index: number) =>
    void canvas.onApplyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setOutputVersion,
      target: id,
      index,
    })
  const width = imageData.url
    ? collapsedImageWidth(imageData)
    : NODE_V4_CARD.collapsedWidth
  const showChrome = Boolean(selected) && canvas.selectedNodeIds.length < 2
  const modelOptions =
    canvas.modelOptionsByKind[NODE_MEDIA_KIND_IDS.image] ?? []

  const renameNode = (next: string): boolean => {
    const taken = new Set(
      canvas.nodes
        .filter((item) => item.id !== id)
        .map((item) => item.data.name),
    )
    const result = renameStableNodeName(imageData.name, next, taken)
    if (!result.ok) return false
    void canvas.onApplyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setField,
      target: id,
      field: 'name',
      value: result.name,
    })
    return true
  }

  const submitPrompt = () => {
    if (draft.trim().length === 0 || generating) return
    if (draft !== currentPrompt) canvas.onSetPrompt(id, draft)
    setStartedAt(Date.now())
    void generation
      .generateNode(
        id,
        { nodes: canvas.nodes, edges: canvas.edges },
        {
          prompt: draft,
          // 落 job id = 持久化「有一单在飞」：刷新之后由回填 hook 取回结果。
          onJobCreated: (jobId) => canvas.onSetMedia(id, { mediaJobId: jobId }),
          // ⚠ 回填写在 `onEach` 里而不是 `.then`：张数 > 1 时是顺序发的 N 枪，
          // `.then` 只拿得到最后一枪 —— 前面几张会一张都不落。每一枪各追加一个
          // 产出版本（S3b §1.8），卡下那排小点因此长出来。
          onEach: (result) => {
            if (!result.success) return
            canvas.onSetMedia(id, {
              url: result.mediaUrl,
              generationId: result.generation.id,
              mediaJobId: undefined,
              imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
            })
          },
        },
      )
      .then(() => {
        setStartedAt(null)
      })
  }

  /** 「连到镜头」列表 = 画布上的视频卡，按镜头带顺序（spec §1.13）。 */
  const shotTargets = buildConnectToShotTargets({
    nodes: canvas.nodes,
    edges: canvas.edges,
    formatDuration: (seconds) => `${Math.round(seconds)}s`,
  })

  const toolbarGroups: readonly NodeToolbarGroup[] = [
    [
      {
        // 原「生镜头」（图标不变）——现在先开弹层选目标镜头与 首帧 / 尾帧
        // （spec §1.13）。顶行「新建镜头」保留原来那一批两条。
        id: 'shot',
        label: tImage('toolbar.connect'),
        icon: Clapperboard,
        onSelect: () => {},
        panel: (
          <ConnectToShotPopover
            sourceNodeId={id}
            sourceKind={NODE_MEDIA_KIND_IDS.image}
            targets={shotTargets}
            // ⚠ **一批两条**：建镜头 + 把这张图连成它的首帧。批内别名（`ref`）让第二
            // 条认得出刚建的那张，⛔ 循环发两条 `onApplyOp` 做不到（第二条时那个
            // 节点还不在闭包里的 state 上），且撤销会碎成两步。
            onNew={() =>
              void canvas.onApplyBatch([
                {
                  op: NODE_ASSISTANT_OP_V4_IDS.addNode,
                  kind: NODE_MEDIA_KIND_IDS.video,
                  subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
                  ref: SHOT_BATCH_REF,
                  ...(imageData.shotNo === undefined
                    ? {}
                    : { shotNo: imageData.shotNo }),
                },
                {
                  op: NODE_ASSISTANT_OP_V4_IDS.connect,
                  source: id,
                  target: SHOT_BATCH_REF,
                  slot: NODE_SLOT_IDS.firstFrame,
                },
              ])
            }
            onConnect={(targetId, slot) => {
              void Promise.resolve(
                canvas.onApplyBatch(
                  buildConnectToShotOps({
                    sourceId: id,
                    targetId,
                    slot,
                    edges: canvas.edges,
                  }),
                ),
              ).then(() => {
                canvas.onFocusNode(targetId)
                flashNodeCard(targetId)
              })
            }}
          />
        ),
      },
      {
        id: 'edit',
        label: tImage('toolbar.edit'),
        icon: Pencil,
        disabled: !imageData.url,
        onSelect: () => {},
        menu: <ImageEditMenuItems onPick={setEditTask} />,
      },
    ],
    [
      {
        id: 'download',
        label: t('toolbar.download'),
        icon: Download,
        disabled: !imageData.url,
        onSelect: () => imageData.url && triggerNodeV4Download(imageData.url),
      },
      {
        id: 'more',
        label: tImage('toolbar.more'),
        icon: MoreHorizontal,
        onSelect: () => {},
        menu: (
          <ImageMoreMenuItems
            onRename={() => setRenameRequest((count) => count + 1)}
            onSplitVersion={
              // 只有一版时拆无可拆 —— ⛔ 不摆一个按了什么都不变的项。
              versions.length > 1
                ? () =>
                    void canvas.onApplyOp({
                      op: NODE_ASSISTANT_OP_V4_IDS.splitOutputVersion,
                      target: id,
                      index: versionIndex,
                    })
                : undefined
            }
            onSetCharacter={
              imageData.subtype === NODE_V4_IMAGE_SUBTYPE_IDS.character
                ? undefined
                : () =>
                    void canvas.onApplyOp({
                      op: NODE_ASSISTANT_OP_V4_IDS.setSubtype,
                      target: id,
                      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.character,
                    })
            }
            onDuplicate={() =>
              void canvas.onApplyOp({
                op: NODE_ASSISTANT_OP_V4_IDS.addNode,
                kind: NODE_MEDIA_KIND_IDS.image,
                subtype: imageData.subtype,
                ...(imageData.shotNo === undefined
                  ? {}
                  : { shotNo: imageData.shotNo }),
              })
            }
            onDelete={() =>
              void canvas.onApplyOp({
                op: NODE_ASSISTANT_OP_V4_IDS.delete,
                target: id,
              })
            }
          />
        ),
      },
    ],
  ]

  return (
    <div
      ref={cardRef}
      data-node-kind={NODE_MEDIA_KIND_IDS.image}
      data-node-subtype={imageData.subtype}
      data-generating={generating ? 'true' : 'false'}
      className="relative"
      onContextMenu={(event) => {
        event.preventDefault()
        setMenu({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY })
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(event) => {
        const file = Array.from(event.dataTransfer?.files ?? []).find((item) =>
          item.type.startsWith('image/'),
        )
        if (!file) return
        event.preventDefault()
        event.stopPropagation()
        if (acceptsRefs && imageData.url) refs.attachFile(file)
        else runUpload(file)
      }}
      onDoubleClick={() => {
        if (imageData.url) setQuickLook(true)
      }}
    >
      <FlowNodeToolbar isVisible={showChrome} position={Position.Top}>
        <NodeToolbar
          groups={toolbarGroups}
          ariaLabel={tImage('toolbar.label')}
        />
      </FlowNodeToolbar>

      <NodeCardShell
        name={imageData.name}
        renameAriaLabel={t('renameNode')}
        onRename={renameNode}
        renameRequest={renameRequest}
        selected={Boolean(selected)}
        width={width}
        emptyHint={t('chrome.emptyHint')}
        emptyAddAriaLabel={tImage('add.upload')}
        emptyHeight={emptyCardHeight(width)}
        onEmptyAdd={() => fileRef.current?.click()}
        surfaceClassName="overflow-hidden"
        changed={canvas.changedNodeIds.includes(id) || flashed}
        portSpec={portSpecOf(node)}
      >
        {imageData.url ? (
          <div
            data-image-surface
            className="relative"
            style={{ height: collapsedImageHeight(imageData) }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageData.url}
              alt={imageData.name}
              draggable={false}
              className="size-full rounded-node object-cover corner-squircle"
              onLoad={(event) => rememberImageSize(event.currentTarget)}
              ref={(image) => {
                if (image?.complete) rememberImageSize(image)
              }}
            />
            {generating && (
              <NodeFrameProgress
                elapsedSeconds={elapsed}
                stageLabel={tStage(
                  `generatingOverlayStages.${getGeneratingStageKey(elapsed)}` as const,
                )}
              />
            )}
          </div>
        ) : generating ? (
          <div
            data-image-surface="pending"
            className="relative"
            style={{ height: emptyCardHeight(width) }}
          >
            <NodeFrameProgress
              elapsedSeconds={elapsed}
              stageLabel={tStage(
                `generatingOverlayStages.${getGeneratingStageKey(elapsed)}` as const,
              )}
            />
          </div>
        ) : undefined}
      </NodeCardShell>

      {showChrome && (
        <FlowNodeToolbar isVisible position={Position.Bottom}>
          <div className="flex flex-col items-center gap-2.5">
            <VersionDots
              count={versions.length}
              current={Math.min(versionIndex, versions.length - 1)}
              onSelect={selectVersion}
              ariaLabel={t('chrome.versions')}
              labelOf={(index) =>
                t('chrome.versionOf', {
                  index: index + 1,
                  total: versions.length,
                })
              }
            />
            <NodePromptBar
              value={draft}
              onValueChange={setDraft}
              onSubmit={submitPrompt}
              generating={generating}
              onCancel={() => setStartedAt(null)}
              placeholder={tImage('promptPlaceholder')}
              ariaLabel={tImage('promptLabel')}
              className={acceptsRefs ? 'w-160 max-w-full' : 'w-90'}
              inputRef={promptInputRef}
              leadingRow={
                acceptsRefs ? <ImageRefRail {...refs.railProps} /> : null
              }
              mentionOptions={
                acceptsRefs && railMentionOptions.length > 0
                  ? railMentionOptions
                  : undefined
              }
              renderValue={
                acceptsRefs
                  ? (value) =>
                      renderPromptMentions(value, {
                        names: mentionNames,
                        mediaOf: mentionMediaOf,
                      })
                  : undefined
              }
              addMenu={
                <ImageAddMenuItems
                  onUpload={
                    acceptsRefs
                      ? refs.openFilePicker
                      : () => fileRef.current?.click()
                  }
                  onMention={() => {
                    setDraft(`${draft}@`)
                    window.setTimeout(() => promptInputRef.current?.focus(), 0)
                  }}
                  onLibrary={
                    acceptsRefs
                      ? refs.railProps.onLibrary
                      : () => setAssetPicker(true)
                  }
                  {...(acceptsRefs
                    ? {
                        canvasCandidates: refs.candidates,
                        onPickCanvas: refs.railProps.onPickFromCanvas,
                      }
                    : {})}
                />
              }
              chips={[
                <ImageFrameChip
                  key="frame"
                  aspectRatio={imageData.params?.aspectRatio}
                  modelId={imageData.model?.modelId}
                  model={imageData.model}
                  quality={imageData.params?.quality}
                  resolution={imageData.params?.resolution}
                  count={imageData.params?.count}
                  disabled={generating}
                  onAspectRatioChange={(aspectRatio) =>
                    canvas.onSetParams(id, { ...imageData.params, aspectRatio })
                  }
                  onQualityChange={(quality) =>
                    canvas.onSetParams(id, { ...imageData.params, quality })
                  }
                  onResolutionChange={(resolution) =>
                    canvas.onSetParams(id, { ...imageData.params, resolution })
                  }
                  onCountChange={(count) =>
                    canvas.onSetParams(id, { ...imageData.params, count })
                  }
                />,
                modelOptions.length > 0 ? (
                  <ModelPickerPopover
                    key="model"
                    options={modelOptions.map(toStudioModelOption)}
                    value={imageData.model?.optionId ?? null}
                    memoryScope={NODE_MEDIA_KIND_IDS.image}
                    disabled={generating}
                    {...(openApiKeys ? { onManageChannels: openApiKeys } : {})}
                    onChange={(option) => {
                      const picked = modelOptions.find(
                        (item) => item.optionId === option.optionId,
                      )
                      if (!picked) return
                      canvas.onSetModel(id, {
                        optionId: picked.optionId,
                        modelId: picked.modelId,
                        adapterType: picked.adapterType,
                        providerConfig: picked.providerConfig,
                        ...(picked.apiKeyId
                          ? { apiKeyId: picked.apiKeyId }
                          : {}),
                      })
                    }}
                  />
                ) : null,
              ].filter(Boolean)}
            />
          </div>
        </FlowNodeToolbar>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) runUpload(file)
          event.target.value = ''
        }}
      />
      {acceptsRefs ? refs.overlays : null}

      {quickLook && imageData.url ? (
        <QuickLook
          open
          onClose={() => setQuickLook(false)}
          ariaLabel={imageData.name}
          {...(versions.length > 1
            ? {
                versionCount: versions.length,
                versionIndex,
                onVersionChange: selectVersion,
              }
            : {})}
          readout={
            imageData.mediaWidth && imageData.mediaHeight
              ? t('readout.dimensions', {
                  width: imageData.mediaWidth,
                  height: imageData.mediaHeight,
                })
              : undefined
          }
          onDownload={() => triggerNodeV4Download(imageData.url as string)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageData.url}
            alt={imageData.name}
            className="max-h-full max-w-full rounded-node object-contain corner-squircle shadow-node-card-expanded"
          />
        </QuickLook>
      ) : null}

      {editTask && imageData.url ? (
        <CanvasImageEditWorkspace
          nodeId={id}
          data={{ mediaUrl: imageData.url } as unknown as NodeWorkflowNodeData}
          defaultTask={editTask}
          open
          onOpenChange={(open) => {
            if (!open) setEditTask(null)
          }}
        />
      ) : null}

      {assetPicker ? (
        <AssetSelectorDialog
          open
          onOpenChange={setAssetPicker}
          mediaType="image"
          title={tImage('add.library')}
          description={tImage('add.library')}
          onSelect={(record) => {
            canvas.onSetMedia(id, {
              url: record.url,
              ...(record.width ? { mediaWidth: record.width } : {}),
              ...(record.height ? { mediaHeight: record.height } : {}),
              imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
            })
            setAssetPicker(false)
          }}
        />
      ) : null}

      {menu ? (
        <NodeV4ContextMenu
          node={node}
          x={menu.x}
          y={menu.y}
          {...(imageData.url ? { mediaUrl: imageData.url } : {})}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  )
}
