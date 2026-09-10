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
 * ── 本片留下的三个缺口（都在报告里点名，⛔ 不用假控件糊上）────────────────
 * · **产出版本**在数据层还没有落点（`slots[].versions` 是入口槽的版本），所以版本
 *   点今天只有一颗、`VersionDots` 自己不渲染；读侧收在 `imageVersions()`。
 * · **⋯ 的「改名」**需要 `NodeCardShell` 给一个「进入改名态」的入口（今天只有双击
 *   名字）；「设为角色卡」需要 op 表允许写 `subtype`。两者都不在本片的所有权里。
 * · **「生镜头」**只能建出视频节点：把它连成首帧要在**同一批**里解 `ref`，而卡片
 *   契约上只有单条 `onApplyOp`。
 */

import { Handle, NodeToolbar as FlowNodeToolbar, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Clapperboard, Download, MoreHorizontal, Pencil } from 'lucide-react'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { PROGRESS_TICK_MS } from '@/constants/generation-progress'
import { getNodeV4Ports } from '@/constants/node-slots'
import {
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_V4_CARD,
} from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_IDS,
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
  NodeFrameProgress,
  NodePromptBar,
  NodeToolbar,
  QuickLook,
  VersionDots,
  type NodeToolbarGroup,
} from './chrome'
import { ImageFrameChip } from './image/ImageFrameChip'
import {
  ImageAddMenuItems,
  ImageEditMenuItems,
  ImageMoreMenuItems,
} from './image/ImageNodeMenus'
import {
  collapsedImageHeight,
  collapsedImageWidth,
  formatSizeBytes,
  imageVersions,
  toStudioModelOption,
} from './image/image-node-model'
import { ModelPickerPopover } from '../../../studio-shared/pickers/ModelPickerPopover'
import { useNodeV4Canvas } from './NodeV4Context'
import { NodeV4ContextMenu } from './NodeV4ContextMenu'
import { triggerNodeV4Download } from './NodeV4SelectionToolbar'

export { collapsedImageWidth, formatSizeBytes }

/** 空卡高：16:9（画板 280×200 那张的同一档比例）。 */
function emptyCardHeight(width: number): number {
  return Math.round((width * 9) / 16)
}

/** 端口点样式 —— 与 `NodeV4Shell` 同一份（图片族 = 绿点）。 */
const PORT_CLASS =
  '!size-2.5 !border !border-background !bg-emerald-600 dark:!bg-emerald-400'

/**
 * 两侧端口点（spec §1.4「卡两侧永远留空给连线」）。
 *
 * ⚠ 槽表读 `NODE_V4_PORTS`（`getNodeV4Ports`）—— 与连线合法性同一份事实源，
 * ⛔ 不在卡上硬写「一进一出」（那正是 v3 分不清首帧与参考的根）。
 */
function ImagePorts({ node }: { node: NodeV4 }) {
  const t = useTranslations('StudioNode.v4')
  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  return (
    <>
      {ports?.inputs.map((spec, index) => (
        <Handle
          key={spec.slot}
          id={spec.slot}
          type="target"
          position={Position.Left}
          data-slot={spec.slot}
          aria-label={t(`slots.${spec.slot}`)}
          className={PORT_CLASS}
          style={{
            top: `${((index + 1) * 100) / ((ports.inputs.length || 1) + 1)}%`,
          }}
        />
      ))}
      {ports?.outputs.map((output, index) => (
        <Handle
          key={output}
          id={output}
          type="source"
          position={Position.Right}
          data-output={output}
          aria-label={t(`outputs.${output}`)}
          className={PORT_CLASS}
          style={{
            top: `${((index + 1) * 100) / ((ports.outputs.length || 1) + 1)}%`,
          }}
        />
      ))}
    </>
  )
}

export function ImageNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const tImage = useTranslations('StudioNode.v4.image')
  const tStage = useTranslations('StudioV3')
  const canvas = useNodeV4Canvas()
  const generation = useNodeMediaGenerationV4()
  const upload = useNodeUploadV4()
  const imageData = data as unknown as NodeV4ImageData

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [quickLook, setQuickLook] = useState(false)
  const [assetPicker, setAssetPicker] = useState(false)
  const [editTask, setEditTask] =
    useState<ReadyCanvasImageEditCapabilityId | null>(null)
  const [versionIndex, setVersionIndex] = useState(0)
  const [draft, setDraft] = useState(imageData.prompt ?? '')
  const [syncedPrompt, setSyncedPrompt] = useState(imageData.prompt ?? '')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // 助手 `set_prompt` 落下来时草稿跟上 —— 渲染期同步，⛔ 不放 effect 里
  // （`NodeV4GenerateDesk` 的同一条）。
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
  const latest = useRef({ upload, canvas, id, name: imageData.name })
  useEffect(() => {
    latest.current = { upload, canvas, id, name: imageData.name }
  })
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
      runUpload(file)
    }
    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
  }, [selected, canvas.selectedNodeIds.length, runUpload])

  const node = canvas.nodes.find((item) => item.id === id) as NodeV4 | undefined
  if (!node) return null

  const versions = imageVersions(imageData)
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
        },
      )
      .then((result) => {
        setStartedAt(null)
        if (!result.success) return
        canvas.onSetMedia(id, {
          url: result.mediaUrl,
          generationId: result.generation.id,
          mediaJobId: undefined,
          imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
        })
      })
  }

  const toolbarGroups: readonly NodeToolbarGroup[] = [
    [
      {
        id: 'shot',
        label: tImage('toolbar.shot'),
        icon: Clapperboard,
        onSelect: () =>
          void canvas.onApplyOp({
            op: NODE_ASSISTANT_OP_V4_IDS.addNode,
            kind: NODE_MEDIA_KIND_IDS.video,
            subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
            ...(imageData.shotNo === undefined
              ? {}
              : { shotNo: imageData.shotNo }),
          }),
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
        runUpload(file)
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
        selected={Boolean(selected)}
        width={width}
        emptyHint={t('chrome.emptyHint')}
        emptyAddAriaLabel={tImage('add.upload')}
        emptyHeight={emptyCardHeight(width)}
        onEmptyAdd={() => fileRef.current?.click()}
        surfaceClassName="overflow-hidden"
        ports={<ImagePorts node={node} />}
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
              onSelect={setVersionIndex}
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
              className="w-90"
              addMenu={
                <ImageAddMenuItems
                  onUpload={() => fileRef.current?.click()}
                  onMention={() => setDraft(`${draft}@`)}
                  onLibrary={() => setAssetPicker(true)}
                />
              }
              chips={[
                <ImageFrameChip
                  key="frame"
                  aspectRatio={imageData.params?.aspectRatio}
                  modelId={imageData.model?.modelId}
                  disabled={generating}
                  onAspectRatioChange={(aspectRatio) =>
                    canvas.onSetParams(id, { ...imageData.params, aspectRatio })
                  }
                />,
                modelOptions.length > 0 ? (
                  <ModelPickerPopover
                    key="model"
                    options={modelOptions.map(toStudioModelOption)}
                    value={imageData.model?.optionId ?? null}
                    memoryScope={NODE_MEDIA_KIND_IDS.image}
                    disabled={generating}
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

      {quickLook && imageData.url ? (
        <QuickLook
          open
          onClose={() => setQuickLook(false)}
          ariaLabel={imageData.name}
          {...(versions.length > 1
            ? {
                versionCount: versions.length,
                versionIndex,
                onVersionChange: setVersionIndex,
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
