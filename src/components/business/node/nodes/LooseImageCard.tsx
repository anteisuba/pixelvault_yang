'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { NodeToolbar, Position } from '@xyflow/react'
import { useTranslations } from 'next-intl'

import type { NodeTokenType } from '@/constants/node-tokens'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import {
  NODE_STUDIO_IMAGE_CARD_SIZE,
  NODE_STUDIO_IMAGE_INPUT,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_STUDIO_MEDIA_IMAGE_OUTPUT,
} from '@/constants/node-studio'
import { useNodeReferenceUpload } from '@/hooks/node/use-node-reference-upload'
import { cn } from '@/lib/utils'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import {
  CanvasImageSelectionToolbar,
  canOfferCanvasImageEdit,
  NodeSelectionToolbarChrome,
  ShotGenerateButton,
} from '../CanvasImageSelectionToolbar'
import { CanvasQuickEditPrompt } from '../CanvasQuickEditPrompt'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import {
  ImageCardFailedContent,
  ImageCardReplacePill,
  ImageCardUploadOverlay,
} from './ImageCardMediaState'
import { EditableNodeLabel, NodeCardPorts } from './NodeShell'

interface LooseImageCardProps {
  id: string
  data: NodeWorkflowNodeData
  selected?: boolean
  /** React Flow node width/height — vestigial since S4 (2026-07-27): the
   *  card no longer takes a manual size (canvas-image-card.md §2 "不提供
   *  拖拽把手"), width/height are now derived from the media's own aspect
   *  ratio and clamped. Still accepted so `ImageNode`'s existing pass-through
   *  keeps type-checking; simply unused for layout now. */
  width?: number
  height?: number
  /**
   * Semantic node type for the R3-3 selection toolbar registry (镜头图 gets a
   * 生成 capability button; every other image-family type gets none). This
   * component doesn't go through `NodeShell`, so unlike the other node
   * components it can't rely on that wrapper's own `type` prop — callers
   * (ImageNode/ShotNode/FrameImageNode) pass their resolved legacy type
   * explicitly. Defaults to the generic `image` type when omitted.
   */
  nodeType?: NodeTokenType
}

function getImageUrl(data: NodeWorkflowNodeData): string {
  if (typeof data.mediaUrl === 'string' && data.mediaUrl.trim()) {
    return data.mediaUrl
  }
  if (typeof data.imageUrl === 'string' && data.imageUrl.trim()) {
    return data.imageUrl
  }
  return ''
}

/**
 * canvas-image-card.md §2 卡宽算法：宽度按媒体真实比例算，钳制进
 * [minWidth, maxWidth]，高度按最终宽度反推（永远保持真实比例，不裁切）。
 * `referenceHeight` 的来历见 NODE_STUDIO_IMAGE_CARD_SIZE 的注释——基准给的
 * 三组参考尺寸（9:16/16:9/21:9）都能被这个公式精确复现。
 */
function computeClampedCardSize(aspect: number): {
  width: number
  height: number
} {
  const { minWidth, maxWidth, referenceHeight } = NODE_STUDIO_IMAGE_CARD_SIZE
  const naturalWidth = referenceHeight * aspect
  const width = Math.min(maxWidth, Math.max(minWidth, naturalWidth))
  return { width: Math.round(width), height: Math.round(width / aspect) }
}

/**
 * Pure-image canvas object. S4（2026-07-27，canvas-image-card.md §2/§3）:
 * size is now owned by the card itself — derived from the media's real
 * aspect ratio and clamped to [180, 480]px, no drag handle. This is also the
 * family's 就绪 / 就绪·hover face (空 / 上传中 / 失败 live in
 * `ImageSourceStarter` for role-less starts, and in `NodeMediaPreview` for
 * shot/frame/closeup roles before they have media).
 */
export function LooseImageCard({
  id,
  data,
  selected,
  nodeType = NODE_TYPE_IDS.image,
}: LooseImageCardProps) {
  const t = useTranslations('StudioNode.ingest.looseImage')
  const tToolbar = useTranslations('StudioNode.nodeToolbar')
  const tImageCard = useTranslations('StudioNode.imageSourceStarter')
  const mediaUrl = getImageUrl(data)
  const [quickEditOpen, setQuickEditOpen] = useState(false)
  const {
    heavyOverlayOpen,
    transientLayerOpen,
    multiSelectActive,
    updateNodeData,
  } = useNodeWorkflowActions()
  const [naturalSize, setNaturalSize] = useState<{
    width: number
    height: number
  } | null>(null)

  // 替换（就绪·hover 的唯一主动作）复用与空态同一条上传通道，真实百分比 +
  // 可取消 + 失败给原因，三态视觉也复用同一份共用件（ImageCardMediaState）。
  const {
    uploadFile: uploadReplacement,
    isUploading: isReplacing,
    progress: replaceProgress,
    cancelUpload: cancelReplace,
  } = useNodeReferenceUpload()
  const [replaceFailure, setReplaceFailure] = useState<string | null>(null)
  const [replaceFile, setReplaceFile] = useState<File | null>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  // R3-4 §4.2 rule 3: 档2（详情面板）/档3（重编辑工作区/剧本笺展开）打开时，
  // 收起这张卡自己的 L3 近场快编面板——不管它属于哪张卡。同一效果延伸盖住
  // rule 1 的"同类临时层同刻一个"：L5（添加菜单 / 卡匣展开浮层）打开时也一
  // 并收起，避免选中节点上飘着的近场面板和另一处新开的浮层同屏叠着。R3-7：
  // 多选态同理收起——一旦选区变成 2+ 节点，这张卡自己的快编近场面板不该继续
  // 悬浮，跟单节点工具条一起让位给选区的「合成」条。
  useEffect(() => {
    if (heavyOverlayOpen || transientLayerOpen || multiSelectActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to a workbench-owned external signal (a heavier or transient overlay tier claimed the slot), not derivable from this component's own render inputs
      setQuickEditOpen(false)
    }
  }, [heavyOverlayOpen, transientLayerOpen, multiSelectActive])

  // R3-4 §4.2 rule 2 (Esc 链 L3 一级): 面板打开时 Escape 收起它，不吞掉输入框
  // 内取消 IME 候选的 Escape。自成一体，和 NodeDetailPanel/CanvasAddMenu 同一
  // 套「组件自己听自己的层」写法。
  useEffect(() => {
    if (!quickEditOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) {
        setQuickEditOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [quickEditOpen])

  // S4: 换了图（mediaUrl 变化）后旧图的实测尺寸不再有效，否则新图加载完成前
  // 会短暂借旧图的比例算卡宽。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting derived cache when the identity of the underlying media changes, not derivable from render inputs
    setNaturalSize(null)
  }, [mediaUrl])

  // rawLabel is the true custom value (empty when never named) — kept apart
  // from `label` below so the S4 edit input doesn't bake the "未命名"
  // fallback text into what gets committed on an unmodified Enter.
  const rawLabel =
    (typeof data.mediaLabel === 'string' && data.mediaLabel.trim()) ||
    (typeof data.sourceLabel === 'string' && data.sourceLabel.trim()) ||
    ''
  const label = rawLabel || t('untitled')

  // S4（canvas-image-card.md §2）：卡宽按媒体真实比例算，钳制 [180,480]，
  // 高度反推，不再提供拖拽把手。比例来源优先级：已知的媒体像素尺寸
  // （data.mediaWidth/Height，AI 生成结果通常自带）→ 实测尺寸（naturalSize，
  // onLoad 之后才有）→ 都没有时按 1:1 出一个 225×225 的方形占位，图一加载完
  // 立刻按真实比例重算（一次性的轻微跳动，比"一直按错误比例显示"更诚实）。
  const mediaAspect = useMemo(() => {
    const mediaW =
      typeof data.mediaWidth === 'number' && data.mediaWidth > 0
        ? data.mediaWidth
        : naturalSize?.width
    const mediaH =
      typeof data.mediaHeight === 'number' && data.mediaHeight > 0
        ? data.mediaHeight
        : naturalSize?.height
    if (!mediaW || !mediaH) return 1
    return mediaW / mediaH
  }, [data.mediaHeight, data.mediaWidth, naturalSize])

  const cardSize = useMemo(
    () => computeClampedCardSize(mediaAspect),
    [mediaAspect],
  )

  const displaySize = useMemo(() => {
    const mediaW =
      typeof data.mediaWidth === 'number' && data.mediaWidth > 0
        ? Math.round(data.mediaWidth)
        : naturalSize?.width
    const mediaH =
      typeof data.mediaHeight === 'number' && data.mediaHeight > 0
        ? Math.round(data.mediaHeight)
        : naturalSize?.height
    if (!mediaW || !mediaH) return null
    return { width: mediaW, height: mediaH }
  }, [data.mediaHeight, data.mediaWidth, naturalSize])

  const offerEdit = canOfferCanvasImageEdit(data)

  const handleReplaceFile = async (file: File) => {
    if (!file.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix)) return
    setReplaceFailure(null)
    setReplaceFile(file)
    const result = await uploadReplacement(
      file,
      NODE_STUDIO_MEDIA_IMAGE_OUTPUT.uploadNote,
    )
    if (result.success && result.url) {
      // 换图不改名字——用户已经给这张卡起过名，换的是内容不是身份。旧图的
      // 像素尺寸一并清掉，让新图走 onLoad 实测重新算比例。
      updateNodeData(id, {
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
        mediaUrl: result.url,
        mediaWidth: undefined,
        mediaHeight: undefined,
        sourceGenerationId: result.generationId,
        generationId: result.generationId,
        generationStatus: NODE_GENERATION_STATUS_IDS.success,
        status: NODE_STATUS_IDS.done,
      })
      setReplaceFile(null)
      return
    }
    if (result.cancelled) {
      setReplaceFile(null)
      return
    }
    setReplaceFailure(result.error ?? tImageCard('uploadFailed'))
  }

  const handleRetryReplace = () => {
    if (!replaceFile) return
    const file = replaceFile
    setReplaceFailure(null)
    void handleReplaceFile(file)
  }

  return (
    <div
      data-testid="loose-image-card"
      data-selected={selected ? 'true' : undefined}
      // 替换失败时借用与其它两族同一条「卡边转 --canvas-danger」通用规则
      // （.canvas-card[data-status='failed']），不新造第二套失败视觉。
      data-status={replaceFailure ? NODE_STATUS_IDS.failed : undefined}
      className={cn(
        'group relative box-border select-none overflow-hidden',
        // S4：卡即媒体的白卡壳（canvas-card 定义在 canvas.css，静态发丝边 +
        // hover 抬升 + 选中蓝环 + 失败红边，与 NodeShell 的卡完全同一套）。
        'canvas-card canvas-card--image-bounds',
        // R3-4 §4.1 L3: selected 时把这张散图卡的本地内容（resize 手柄等）
        // 提到自己兄弟之上；跨节点前置由 React Flow 自身的 elevateNodesOnSelect
        // 默认行为处理（.react-flow__node 的 z-index +1000），这里不重复。
        selected && 'z-canvas-selection',
      )}
      style={{
        width: cardSize.width,
        height: cardSize.height,
      }}
    >
      {/*
        S3.5 边锚点: this card doesn't go through `NodeShell`, so it used to
        ship with NO ReactFlow handles at all — harmless while 吞噬 folded
        every connected 散图 out of sight, fatal the moment those cards stay
        on the canvas (the library has no bounds to anchor to and silently
        drops the edge). Same two inert anchors every other card renders; the
        visible port styling is `canvas-port`'s, shared, not re-declared.
      */}
      <NodeCardPorts type={nodeType} />

      <NodeToolbar
        nodeId={id}
        isVisible={Boolean(selected) && !quickEditOpen && !multiSelectActive}
        position={Position.Top}
        offset={14}
      >
        {offerEdit ? (
          <CanvasImageSelectionToolbar
            nodeId={id}
            data={data}
            onQuickEditOpenChange={setQuickEditOpen}
            quickEditOpen={quickEditOpen}
            extra={
              nodeType === NODE_TYPE_IDS.shot ? (
                <ShotGenerateButton nodeId={id} data={data} />
              ) : null
            }
          />
        ) : (
          <NodeSelectionToolbarChrome
            nodeId={id}
            data={data}
            selected={selected}
            nodeType={nodeType}
          />
        )}
      </NodeToolbar>

      {/* S4：卡外名字复用与 NodeShell.Header 同一条 canvas-card-label 规则
          （canvas.css），族图标 + 原地可编辑名字左对齐卡左缘；这张卡不走
          NodeShell 所以在这里手动摆出同一套结构。像素尺寸读数保留在同一行
          右侧（既有功能，规格没提但也没让删，改用 muted 墨色）。 */}
      <div className="canvas-card-label">
        <span className="canvas-label-glyph" data-family="image" aria-hidden />
        <EditableNodeLabel
          value={rawLabel}
          placeholder={t('untitled')}
          ariaLabel={tToolbar('rename')}
          onCommit={(next) =>
            updateNodeData(id, { mediaLabel: next, sourceLabel: next })
          }
          className="font-semibold"
        />
        {displaySize ? (
          <span
            className="ml-auto shrink-0 tabular-nums"
            style={{ color: 'var(--canvas-ink-muted)' }}
          >
            {displaySize.width} × {displaySize.height}
          </span>
        ) : null}
      </div>

      <div className="absolute inset-0">
        {mediaUrl ? (
          <Image
            src={mediaUrl}
            alt={t('cardAlt')}
            fill
            sizes={`${NODE_STUDIO_IMAGE_CARD_SIZE.maxWidth}px`}
            className="object-cover"
            unoptimized
            draggable={false}
            onLoad={(event) => {
              const img = event.currentTarget
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setNaturalSize({
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                })
              }
            }}
          />
        ) : null}

        {/* 就绪 · hover：居中「替换」白胶囊，仅 hover / 选中出现（§3）。 */}
        {!isReplacing && !replaceFailure ? (
          <ImageCardReplacePill
            label={tImageCard('replace')}
            onClick={() => replaceInputRef.current?.click()}
          />
        ) : null}

        {isReplacing ? (
          <ImageCardUploadOverlay
            progress={replaceProgress}
            label={tImageCard('uploading', { percent: replaceProgress })}
            cancelLabel={tImageCard('cancelUpload')}
            onCancel={cancelReplace}
          />
        ) : null}

        {replaceFailure && !isReplacing ? (
          <ImageCardFailedContent
            reason={replaceFailure}
            retryLabel={tImageCard('retry')}
            onRetry={handleRetryReplace}
          />
        ) : null}

        <input
          ref={replaceInputRef}
          type="file"
          accept={NODE_STUDIO_IMAGE_INPUT.accept}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (replaceInputRef.current) replaceInputRef.current.value = ''
            if (file) void handleReplaceFile(file)
          }}
        />
      </div>

      <NodeToolbar
        nodeId={id}
        isVisible={Boolean(selected) && quickEditOpen && !multiSelectActive}
        position={Position.Bottom}
        offset={14}
      >
        <CanvasQuickEditPrompt
          nodeId={id}
          data={data}
          fileLabel={label}
          onClose={() => setQuickEditOpen(false)}
        />
      </NodeToolbar>
    </div>
  )
}
