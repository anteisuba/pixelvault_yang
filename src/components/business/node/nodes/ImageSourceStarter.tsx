'use client'

import { useEffect, useState, type DragEvent } from 'react'
import { useUpdateNodeInternals } from '@xyflow/react'
import { ImageIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  type NodeWorkflowGenerationStatus,
  type NodeWorkflowStatus,
} from '@/constants/node-types'
import {
  NODE_STUDIO_IMAGE_INPUT,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_STUDIO_MEDIA_IMAGE_OUTPUT,
} from '@/constants/node-studio'
import { useNodeReferenceUpload } from '@/hooks/node/use-node-reference-upload'
import { cn } from '@/lib/utils'
import {
  buildDisplayNamePatch,
  stripFileExtension,
} from '@/lib/node-display-name'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import {
  ImageCardFailedContent,
  ImageCardGeneratingOverlay,
  ImageCardStatusBadge,
  ImageCardUploadOverlay,
} from './ImageCardMediaState'
import { NodeShell } from './NodeShell'

interface ImageSourceStarterProps {
  nodeId: string
  selected?: boolean
  status: NodeWorkflowStatus
  /**
   * 已经解析好的显示名 —— 调用方必须传 `resolveNodeDisplayName(data)` 的结果，
   * 未命名时给 `undefined`（卡头自己回落到类型名「图片」）。
   *
   * ⚠ 台账 B7(b)：这里原本叫 `mediaLabel`，调用方直接把 `data.mediaLabel` 原样
   * 递进来，**绕过了** `resolveNodeDisplayName` 里的 `notMachineValue` 守卫
   * （批 1 的 C5 加的，专挡「把模型 id / generation id 当人起的名字」）。改名成
   * `displayName` 就是为了让「传原始字段」这件事不再看起来天经地义。
   */
  displayName?: string
  /**
   * canvas-generate-composer.md §7 owner 2026-07-28 真机实测缺陷③④：这张卡
   * 还没有媒体时也可能正在被生成提示词框/`generateMediaNode` 写入——两者都在
   * 送出请求前把 `generationStatus: pending` + `status: running` 写进这个节点
   * 自己的 data（`StudioNodeWorkbench.handleRunGenerateComposer` /
   * `handleGenerateMediaNode`），失败时写 `generationStatus: error` +
   * `generationError` + `status: failed`。在这两个 prop 补进来之前，这个组件
   * 对这份数据完全无感——五态只看自己本地的上传态，一次生成失败因此表现成
   * 「静默变回空态」，生成中也表现成空态（两个端口因此不渲染，见下方
   * `isEmpty`/`showSourceHandle`）。同 `NodeMediaPreview` 已有的
   * `isPending`/`isError` 推导同一套读法，这里补齐role-less 起步卡缺的那一份。
   */
  generationStatus?: NodeWorkflowGenerationStatus
  generationError?: string
}

/** A failed upload's file + reason, kept local so retry can re-attempt the
 *  exact same file without asking the user to re-pick it (canvas-image-card.md
 *  §3 「失败必须给原因」+「重试」— this is the state that makes 重试 possible). */
interface UploadFailure {
  file: File
  reason: string
}

/**
 * §6.0/§6.1 S5d ③「ImageNode 空态废 role picker → 直接三来源起步」: replaces
 * the old "这张图做什么用（镜头/关键帧）" chooser for a fresh, role-less,
 * media-less `image` node. No role question — the three sources (上传
 * dropzone) is reachable straight from the empty card.
 *
 * ⛔ 2026-07-28 owner：「图一的那两个可以删掉了。和别的地方重叠了」——卡底原本
 * 有「素材库 / AI 生成」两个按钮，与生成提示词框完全重复：composer 的 `+` 槽
 * 已经是素材库入口，提示词框本身就是 AI 生成。空卡上再放一份等于同一件事给了
 * 两个入口、两套状态。素材选择继续由 composer 自己的素材槽负责；这里不保留
 * 一个永远无法打开的本地 AssetSelectorDialog。
 *
 * Once media lands the node becomes a role-less `LooseImageCard` (ImageNode's
 * existing dispatch); naming + categorizing happens in the expand panel,
 * same as every other node field.
 *
 * S4（2026-07-27，canvas-image-card.md §3）: this component now also owns the
 * 空 / 上传中 / 失败 three of the family's five states (就绪 / 就绪·hover live
 * in LooseImageCard, which takes over once media lands). Upload progress is
 * real (XHR, see use-node-reference-upload.ts), cancellable, and a failure
 * stays on the card with its reason + a retry — it no longer just fires a
 * toast and quietly reverts to empty.
 *
 * §7 owner 2026-07-28 真机实测缺陷③④（canvas-generate-composer.md §7 尾部）:
 * a sixth state joined the five above — 生成中 (+ its own 失败) for whenever
 * the generate composer or `generateMediaNode` targets THIS still-media-less
 * node. Before this addition the component was blind to that data (only its
 * own local upload state), so a generation in flight — or one that failed —
 * both silently rendered as plain 空: no port (an edge from the source card
 * had nothing to anchor to — React Flow spammed `Couldn't create edge for
 * target handle id: "null"`), no reason, no retry. See `isGenerating` /
 * `isGenerationFailed` below.
 */
export function ImageSourceStarter({
  nodeId,
  selected,
  status,
  displayName,
  generationStatus,
  generationError,
}: ImageSourceStarterProps) {
  const t = useTranslations('StudioNode.imageSourceStarter')
  const { updateNodeData, consumePendingPasteFile, generateMediaNode } =
    useNodeWorkflowActions()
  const { uploadFile, isUploading, progress, cancelUpload } =
    useNodeReferenceUpload()
  const [isDragOver, setIsDragOver] = useState(false)
  const [failure, setFailure] = useState<UploadFailure | null>(null)

  // §7 owner 2026-07-28 缺陷④：生成中/生成失败是这张卡的另外两态，与本地的
  // 上传态并列判断（同 NodeMediaPreview 的 isPending/isError 同一条读法）。
  // 只在这两个 prop 有值时才可能为真——ImageNode 没传时（例如旧测试 mock）
  // 两者都是 undefined，落到 false，行为与改动前完全一致。
  const isGenerating =
    generationStatus === NODE_GENERATION_STATUS_IDS.pending ||
    status === NODE_STATUS_IDS.running
  const isGenerationFailed =
    generationStatus === NODE_GENERATION_STATUS_IDS.error ||
    (status === NODE_STATUS_IDS.failed && Boolean(generationError))

  const applyImage = (
    url: string,
    generationId: string | undefined,
    label: string,
  ) => {
    const trimmedLabel = label
      .trim()
      .slice(0, NODE_STUDIO_MEDIA_IMAGE_OUTPUT.maxSourceLabelLength)

    updateNodeData(nodeId, {
      imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
      mediaKind: NODE_MEDIA_KIND_IDS.image,
      mediaUrl: url,
      mediaLabel: trimmedLabel || t('untitled'),
      sourceLabel: trimmedLabel || t('untitled'),
      sourceGenerationId: generationId,
      generationId,
      generationStatus: NODE_GENERATION_STATUS_IDS.success,
      status: NODE_STATUS_IDS.done,
    })
  }

  const handleFile = async (file: File) => {
    if (!file.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix)) return
    setFailure(null)
    const result = await uploadFile(
      file,
      NODE_STUDIO_MEDIA_IMAGE_OUTPUT.uploadNote,
    )
    if (result.success && result.url) {
      // 台账 C5：文件名进显示名字段前剥扩展名，别把 `xxx.png` 当人起的名字。
      applyImage(result.url, result.generationId, stripFileExtension(file.name))
      return
    }
    // A deliberate × cancel isn't a failure — go straight back to the empty
    // dropzone, no reason banner (canvas-image-card.md §3 only requires a
    // reason for real failures).
    if (result.cancelled) return
    setFailure({ file, reason: result.error ?? t('uploadFailed') })
  }

  // 画布级粘贴（canvas-image-card.md §4.1）：这个节点如果是刚被 paste 处理器
  // 建出来的空节点，workbench 那边会留一份待处理 File（见
  // NodeWorkflowActionsContext 的字段注释——File 不可序列化，进不了
  // node.data，只能靠这种一次性交接）。挂载时消费一次就立刻开始上传，让「粘贴
  // 瞬间进上传中态」成立，不等用户再点一次。只在挂载时跑一次——
  // consumePendingPasteFile 本身是消费型 API（调一次就清空），不是需要跟着
  // 依赖变化重新求值的普通值，故意不放进依赖数组。
  useEffect(() => {
    const file = consumePendingPasteFile?.(nodeId)
    if (file) void handleFile(file)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRetry = () => {
    if (!failure) return
    const { file } = failure
    setFailure(null)
    void handleFile(file)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)
    // §7 owner 2026-07-28 缺陷④：一次 AI 生成正打在这张空卡上时，不接受
    // 拖放把它顶掉——同 isUploading 已有的互斥, 生成失败之后这条禁令自动解除
    // （isGenerating 变 false），用户可以改拖文件当替代恢复路径。
    if (isUploading || isGenerating) return
    const file = Array.from(event.dataTransfer.files).find((entry) =>
      entry.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix),
    )
    if (file) void handleFile(file)
  }

  // §7 owner 2026-07-28 缺陷④：「真正的空态」现在要把生成中/生成失败也排除
  // 在外——两者都「有东西要来」（或刚失败过），不再套用「还没有内容」的空态
  // 逻辑。这一个布尔同时喂给三处：虚线卡边（下面 className）、端口显隐
  // （showSourceHandle/showTargetHandle，下面）、以及隐式定义了"上传中/失败/
  // 生成中/生成失败"四态统一走实线卡边——和上传态本来就有的处理保持一致，
  // 不是新引入的分支。
  const isEmpty =
    !isUploading && !failure && !isGenerating && !isGenerationFailed

  // §7 owner 2026-07-28 真机实测缺陷④续（真机复测发现，spec 原文「等图落地卡
  // 有了端口，边会自己接上」在这一点上不成立）：`showSourceHandle`/
  // `showTargetHandle` 只是把 <Handle> element 加进/移出 DOM——React Flow 自己
  // 的 store 并不会因为 DOM 多了两个 handle 就自动重新measure它们的位置去接
  // 边。这正是 `use-update-node-internals-on-init.ts` 那份长文档记录的同一个
  // React Flow 底层问题（handleBounds 不会随 DOM 变化自动刷新），只是那个 hook
  // 只管首次挂载那一刻（one-shot），管不到这种「节点已经挂载好、生命周期中途
  // 端口数量动态变化」的场景。真机验证：不加这个 effect 时，边数据在
  // localStorage 里确实存在（onConnect 正确执行了），但 DOM 里的
  // `.react-flow__edges` 一直只有空 `<defs>`，控制台也不报错——不是"过程噪
  // 音"，是边真的连不上，直到用户手动拖一下节点触发 React Flow 自己的重新measure。
  // 官方文档指定的解法就是这个 hook（"When you programmatically add or remove
  // handles to a node...you need to let React Flow know about it"）——在端口
  // 集合改变的那一刻显式通知它重新measure这一个节点。
  const updateNodeInternals = useUpdateNodeInternals()
  useEffect(() => {
    updateNodeInternals(nodeId)
  }, [isEmpty, nodeId, updateNodeInternals])

  return (
    <NodeShell
      nodeId={nodeId}
      type={NODE_TYPE_IDS.image}
      selected={selected}
      // 失败态借用既有的「卡边转 --canvas-danger」通用规则（NodeShell 的
      // .canvas-card[data-status='failed']）——只是视觉信号，本地上传失败不写
      // 回 data.status（一次上传失败不该把整个节点标脏）。生成失败则相反：
      // `status` 这个 prop 本身就已经是 `data.status`，生成失败时上游已经把它
      // 写成 'failed' 了（StudioNodeWorkbench.handleRunGenerateComposer /
      // handleGenerateMediaNode）——所以 `: status` 这条回退分支已经如实带出
      // 生成失败，不需要再判一次 isGenerationFailed。
      status={failure ? NODE_STATUS_IDS.failed : status}
      // §7 owner 2026-07-28 缺陷④：只有真正的空态不露端口——生成中/失败/上传
      // 中都「有东西」，必须露端口，否则 composer 建的入边找不到锚点（React
      // Flow 报 Couldn't create edge for target handle id: "null"，边在生成期
      // 间也不可见）。
      showSourceHandle={!isEmpty}
      showTargetHandle={!isEmpty}
      // 《第一次交互》刀一 task B：这个组件只在「还没有图」时渲染（`ImageNode`
      // 的 `!role && !hasMedia` 分支），所以收窄是**无条件**的，不挂在 isEmpty
      // 上——宽度不该在上传/生成开始的那一刻突然从 320 跳回 400。判据与
      // `NodeMediaPreview.useCompactWidth` 的 `!mediaUrl` 同源。
      className={cn('canvas-card--w-empty', isEmpty && 'canvas-card--dashed')}
    >
      <NodeShell.Header
        type={NODE_TYPE_IDS.image}
        status={status}
        title={displayName}
        onRenameCommit={(next) =>
          // 包 4.5：走共享写侧。这张起手卡没有 role，共享函数按 type 兜底
          // 落到 mediaLabel+sourceLabel —— 与原行为一致，但从此和别处同源。
          updateNodeData(
            nodeId,
            buildDisplayNamePatch({ type: NODE_TYPE_IDS.image }, next),
          )
        }
        // 状态浮标挪进媒体窗左上角（下面），卡外的头不用再盖一次章。
        hideStatusBadge
      />
      <NodeShell.Body className="space-y-2 p-0">
        <div
          aria-label={t('uploadAria')}
          data-drag-over={isDragOver ? 'true' : undefined}
          onDragOver={(event) => {
            if (
              !event.dataTransfer.types.includes('Files') ||
              isUploading ||
              isGenerating
            )
              return
            event.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className="canvas-image-dropzone flex aspect-square w-full flex-col items-center justify-center outline-none"
        >
          <ImageCardStatusBadge
            variant={
              failure || isGenerationFailed
                ? 'failed'
                : isUploading
                  ? 'uploading'
                  : isGenerating
                    ? 'generating'
                    : 'empty'
            }
            label={
              failure || isGenerationFailed
                ? t('badgeFailed')
                : isUploading
                  ? t('badgeUploading')
                  : isGenerating
                    ? t('badgeGenerating')
                    : t('badgeEmpty')
            }
          />

          {failure ? (
            <ImageCardFailedContent
              reason={failure.reason}
              retryLabel={t('retry')}
              onRetry={handleRetry}
            />
          ) : isUploading ? (
            <ImageCardUploadOverlay
              progress={progress}
              label={t('uploading', { percent: progress })}
              cancelLabel={t('cancelUpload')}
              onCancel={cancelUpload}
            />
          ) : isGenerationFailed ? (
            // §7 owner 2026-07-28 缺陷③：429/生成失败以前是静默的（只有一条
            // 容易错过的 toast），卡片本身退回空态什么都不说。复用与上传失败
            // 完全同一套失败态组件——具体原因 + 重试，不另做一套。重试走
            // generateMediaNode（与 NodeMediaPreview 的失败重试同一条通道），
            // 拿节点已经写好的 prompt/model/referenceAssets 重新发一次。
            <ImageCardFailedContent
              reason={generationError || t('generationFailed')}
              retryLabel={t('retry')}
              onRetry={() => void generateMediaNode?.(nodeId)}
            />
          ) : isGenerating ? (
            // §7 owner 2026-07-28 缺陷④：生成中不是空态——沿用上传中的视觉语言
            // （半透明白 + 扫光），但不显示百分比（生成期间没有真实进度可给，
            // 规格 §5 明确禁止假造）。
            <ImageCardGeneratingOverlay label={t('generating')} />
          ) : (
            <div className="canvas-image-empty-hint">
              <ImageIcon className="size-6" aria-hidden />
              <span>{t('uploadHint')}</span>
            </div>
          )}
        </div>
      </NodeShell.Body>
    </NodeShell>
  )
}
