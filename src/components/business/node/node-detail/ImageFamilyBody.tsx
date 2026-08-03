'use client'

import Image from 'next/image'
import { ImageIcon, Trash2 } from 'lucide-react'
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  NODE_STUDIO_CHARACTER_IMAGE_LORAS,
  NODE_STUDIO_CHARACTER_IMAGE_REFERENCES,
  NODE_STUDIO_IMAGE_INPUT,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_STUDIO_MEDIA_IMAGE_OUTPUT,
  NODE_STUDIO_PLACEHOLDER_TOAST,
} from '@/constants/node-studio'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_WORKFLOW_FIELDS_BY_NODE_TYPE,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowFieldId,
} from '@/constants/node-types'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import { ROUTES } from '@/constants/routes'
import { STUDIO_NODE_HANDOFF_MAX_REFERENCES } from '@/constants/studio'
import { useRouter } from '@/i18n/navigation'
import { stripFileExtension } from '@/lib/node-display-name'
import {
  buildNodeWorkflowPrompt,
  getNodeWorkflowFieldValue,
} from '@/lib/node-workflow-prompt'
import { writeStudioNodeHandoff } from '@/lib/studio-node-handoff'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { CharacterImageLoraControls } from '@/components/business/node/CharacterImageLoraControls'
import {
  CharacterImageReferenceControls,
  type CharacterReferenceGalleryExtraItem,
} from '@/components/business/node/CharacterImageReferenceControls'
import { WorkflowModelPicker } from '@/components/business/node/WorkflowModelPicker'
import { useNodeReferenceUpload } from '@/hooks/node/use-node-reference-upload'
import type { GenerationRecord } from '@/types'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { IMEAwareInput, IMEAwareTextarea } from '../inspector/IMEAwareField'
import { NodeProgressState } from '../nodes/NodeProgressState'
import { EvidenceDrawer, EvidenceRow } from './EvidenceDrawer'
import type { NodeDetailBodyProps } from './registry'
import type { NodeDetailSlots } from './slots'

/**
 * 图片四族的共用引擎 —— 散图 `image` · 镜头图 `shot` · 关键帧 `frameImage` ·
 * 背景 `backgroundImage`。
 *
 * ⚠ **角色族不走这里**。契约 §6 给角色的是「图集主体台 + 素材架整栏不渲染 +
 * 编排台空 + 动作坞空」——除了身份条它和媒体井族没有一个槽是同构的，硬塞进来
 * 只会让这个文件长出一堆 `if (isCharacter)`。它有自己的 `CharacterDetailBody`。
 *
 * ── 它取代了什么 ─────────────────────────────────────────────
 * 前身是 `inspector/NodeMediaInspector.tsx`（798 行）+ 四个只做转接的 inspector
 * 包装（Shot / Frame / Background / CharacterImage）。那套结构存在的理由是
 * 「detail body 只是把 `nodeId + data` 合成回一个 `NodeWorkflowNode`」——现在
 * detail body **就是**族本身（槽表提供者），中间那层不再赚它的开销，一并删除。
 *
 * ── 槽映射（契约 §6 那一行的实现）────────────────────────────
 * · 主体台 = 媒体井（R11 宽由宽高比推导居中、空余宽度不画表面）+ 可选台座
 * · 素材架 = 上传 / 素材库 / Studio ↗ 一行文字按钮 + 右对齐计数 + 参考图 + LoRA
 * · 编排台 = 长字段整宽无标签块 / 短字段标签左值右（R7 只有这两类）+ 模型
 * · 关系带 = 由族传入（必给）
 * · 证据抽屉 = 发送预览（提示词 / 模型 / 参考图 / LoRA，失败时置顶一行红）
 * · 动作坞 = 阻塞原因 + 生成（全屏唯一实心元素）
 *
 * ⚠ **参考图与 LoRA 归素材架，不归编排台**。E 原型把它们画在编排台里，与契约
 * §6 自己那张表（`素材架: 素材库/Studio + 参考图·LoRA`）冲突。按槽的定义走：
 * 素材架回答「这次用什么材料」，参考图正是材料；编排台回答「怎么做」。
 * 契约「同一个控件不得在不同族落到不同的槽」要求四族在这件事上一致。
 */

/** 井的宽高比。散图 1:1（契约 §6），其余媒体井族 16:9。 */
export type ImageFamilyAspect = '1 / 1' | '16 / 9'

export interface ImageFamilyBodyProps extends NodeDetailBodyProps {
  /** 井下的一行只读派生值（散图的分类）。R6：不穿控件壳。 */
  pedestal?: ReactNode
  /** 素材架里追加的东西（镜头族的上游角色/背景 chip 行）。排在文字按钮行之下。 */
  rackExtras?: ReactNode
  /**
   * 关系带内容。**必给** —— 契约「关系带必须全族有位」，想让它消失只能在族那层
   * 显式传 `undefined` 给槽表，这里不给这条路。
   */
  relations: ReactNode
  aspect?: ImageFamilyAspect
  /** 参考图集里并入的只读条目（角色特写等）。 */
  referenceExtraItems?: readonly CharacterReferenceGalleryExtraItem[]
  /** 参考图「拆出」为独立节点。不给则该按钮不出现。 */
  onExtractReference?(referenceId: string): void
  children: (slots: NodeDetailSlots) => ReactNode
}

export function ImageFamilyBody({
  nodeId,
  type,
  data,
  pedestal,
  rackExtras,
  relations,
  aspect = '16 / 9',
  referenceExtraItems,
  onExtractReference,
  children,
}: ImageFamilyBodyProps) {
  const t = useTranslations('StudioNode.mediaNodes')
  const tDetail = useTranslations('StudioNode.nodeDetail')
  const tFields = useTranslations('StudioNode.workflowFields')
  const router = useRouter()
  const { generateMediaNode, modelOptionsByType, updateNodeData } =
    useNodeWorkflowActions()
  const { uploadFile, isUploading } = useNodeReferenceUpload()
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : null
  const hasMedia = Boolean(mediaUrl)
  const referenceAssets = useMemo(
    () => data.referenceAssets ?? [],
    [data.referenceAssets],
  )
  const loras = useMemo(() => data.loras ?? [], [data.loras])
  const modelOptions = modelOptionsByType[type] ?? []
  const prompt = buildNodeWorkflowPrompt(type, data).trim()
  const fields = NODE_WORKFLOW_FIELDS_BY_NODE_TYPE[type] ?? [
    NODE_WORKFLOW_FIELD_IDS.prompt,
  ]
  const maxReferenceImages = data.model
    ? getMaxReferenceImages(data.model.adapterType, data.model.modelId)
    : NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxItems
  const generationStatus =
    data.generationStatus ??
    (mediaUrl
      ? NODE_GENERATION_STATUS_IDS.success
      : NODE_GENERATION_STATUS_IDS.idle)
  const isPending =
    generationStatus === NODE_GENERATION_STATUS_IDS.pending ||
    data.status === NODE_STATUS_IDS.running
  const isExistingImage =
    hasMedia &&
    data.imageSource === NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing

  const applyExistingImage = useCallback(
    (url: string, generationId: string | undefined, label: string) => {
      const sourceLabel = label
        .trim()
        .slice(0, NODE_STUDIO_MEDIA_IMAGE_OUTPUT.maxSourceLabelLength)

      updateNodeData(nodeId, {
        generationError: undefined,
        generationId,
        generationStatus: NODE_GENERATION_STATUS_IDS.success,
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
        mediaKind: NODE_MEDIA_KIND_IDS.image,
        mediaLabel: sourceLabel || t('sourceFallback'),
        mediaUrl: url,
        sourceGenerationId: generationId,
        sourceLabel: sourceLabel || t('sourceFallback'),
        status: NODE_STATUS_IDS.done,
      })
    },
    [nodeId, t, updateNodeData],
  )

  const handleUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix)) return

      const result = await uploadFile(
        file,
        NODE_STUDIO_MEDIA_IMAGE_OUTPUT.uploadNote,
      )
      if (result.success && result.url) {
        applyExistingImage(
          result.url,
          result.generationId,
          // 台账 C5：剥扩展名后为空则落既有兜底文案。
          stripFileExtension(file.name) || t('sourceFallback'),
        )
        return
      }

      toast.error(result.error ?? t('existing.uploadFailed'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [applyExistingImage, t, uploadFile],
  )

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (file) void handleUpload(file)
    },
    [handleUpload],
  )

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const file = Array.from(event.clipboardData.files).find((entry) =>
        entry.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix),
      )
      if (!file) {
        toast.info(t('existing.pasteEmpty'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }
      event.preventDefault()
      void handleUpload(file)
    },
    [handleUpload, t],
  )

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const file = Array.from(event.dataTransfer.files).find((entry) =>
        entry.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix),
      )
      if (file) void handleUpload(file)
    },
    [handleUpload],
  )

  const handleSelectExisting = useCallback(
    (generation: GenerationRecord) => {
      if (!generation.url) return
      applyExistingImage(
        generation.url,
        generation.id,
        generation.prompt || generation.model || t('sourceFallback'),
      )
      setAssetDialogOpen(false)
    },
    [applyExistingImage, t],
  )

  const handleClearImage = useCallback(() => {
    updateNodeData(nodeId, {
      generationError: undefined,
      generationId: undefined,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      imageSource: undefined,
      mediaLabel: undefined,
      mediaUrl: undefined,
      sourceGenerationId: undefined,
      sourceLabel: undefined,
      status: NODE_STATUS_IDS.idle,
    })
  }, [nodeId, updateNodeData])

  const handleOpenImageStudio = useCallback(() => {
    const styleCode = loras.find((lora) => lora.styleCode)?.styleCode
    const characterName =
      typeof data.characterName === 'string' ? data.characterName.trim() : ''

    // 往返交接：把完整上下文带出去，Studio 生成完能写**回**这个节点（不是单程）。
    writeStudioNodeHandoff({
      originNodeId: nodeId,
      prompt,
      characterName: characterName || undefined,
      referenceUrls: referenceAssets
        .map((reference) => reference.url)
        .slice(0, STUDIO_NODE_HANDOFF_MAX_REFERENCES),
      styleCode: styleCode || undefined,
    })

    router.push(
      styleCode
        ? `${ROUTES.STUDIO_IMAGE}?style=${encodeURIComponent(styleCode)}`
        : ROUTES.STUDIO_IMAGE,
    )
  }, [data.characterName, loras, nodeId, prompt, referenceAssets, router])

  const handleFieldChange = useCallback(
    (fieldId: NodeWorkflowFieldId, value: string) => {
      const nextData = { ...data, [fieldId]: value }
      updateNodeData(nodeId, {
        [fieldId]: value,
        status: buildNodeWorkflowPrompt(type, nextData).trim()
          ? NODE_STATUS_IDS.ready
          : NODE_STATUS_IDS.idle,
      })
    },
    [data, nodeId, type, updateNodeData],
  )

  const handleInsertLoraTrigger = useCallback(
    (triggerWord: string) => {
      if (!triggerWord || data.prompt.includes(triggerWord)) return
      const next = data.prompt.trim()
        ? `${data.prompt.trim()} ${triggerWord}`
        : triggerWord
      updateNodeData(nodeId, { prompt: next })
    },
    [data.prompt, nodeId, updateNodeData],
  )

  const blockingReason = isPending
    ? t('generating')
    : !data.model
      ? t('noModel')
      : !prompt
        ? t('noPrompt')
        : null

  const modelLabel = data.model?.providerConfig.label ?? null

  return (
    <>
      {children({
        stage: (
          <>
            <div className="canvas-detail-stage">
              {/* ⚠ 空态下这块**同时是**上传落点（点 / 拖 / 粘贴）。R2 要求空态与
                  满态版式完全同构，所以它不换虚线边、不加说明文案 —— 只有一枚
                  极淡字形。上传这条路另有素材架里那颗显式按钮兜底，键盘用户
                  不必依赖「看不出可以点」的井。 */}
              <div
                className="canvas-detail-well"
                style={{ '--canvas-detail-ar': aspect } as React.CSSProperties}
                {...(hasMedia
                  ? {}
                  : {
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': t('existing.upload'),
                      onClick: () => fileInputRef.current?.click(),
                      onKeyDown: (event: React.KeyboardEvent) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        fileInputRef.current?.click()
                      },
                      onPaste: handlePaste,
                      onDragOver: (event: DragEvent<HTMLDivElement>) =>
                        event.preventDefault(),
                      onDrop: handleDrop,
                    })}
              >
                {mediaUrl ? (
                  <>
                    <Image
                      src={mediaUrl}
                      alt={t('imageAlt')}
                      fill
                      sizes="480px"
                      className="object-cover"
                      unoptimized
                    />
                    <span className="canvas-detail-well-corner">
                      {isExistingImage
                        ? t('sourceExisting')
                        : t('sourceGenerated')}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearImage}
                      aria-label={t('clearImage')}
                      className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full border border-node-edge bg-node-panel text-node-muted outline-none transition-colors hover:text-node-foreground focus-visible:ring-2 focus-visible:ring-node-focus-ring/30"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                ) : (
                  <ImageIcon
                    aria-hidden
                    className="canvas-detail-well-glyph size-12"
                    strokeWidth={1.25}
                  />
                )}

                {/* 生成中：契约 §7 —— 井几何一像素不动、无百分比、无取消、
                    **无进度条**。复用卡层已统一的 `NodeProgressState`（账本 ⑪），
                    走它的 `breath` 形态；这是 detail 层第一次消费它。
                    ⚠ 只用这**一个**器件说「在跑」：字形不再另外呼吸一遍。 */}
                {isPending ? (
                  <NodeProgressState
                    indicator="breath"
                    veiled
                    label={t('generating')}
                  />
                ) : null}
              </div>
            </div>
            {pedestal ? (
              <div className="canvas-detail-pedestal">{pedestal}</div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept={NODE_STUDIO_IMAGE_INPUT.accept}
              className="hidden"
              onChange={handleFileInputChange}
            />
          </>
        ),

        rack: (
          <div className="canvas-detail-stack">
            <div className="canvas-detail-shelf">
              <button
                type="button"
                className="canvas-detail-txt-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? t('generating') : tDetail('upload')}
              </button>
              <button
                type="button"
                className="canvas-detail-txt-btn"
                onClick={() => setAssetDialogOpen(true)}
              >
                {t('changeSourceExisting')}
              </button>
              <button
                type="button"
                className="canvas-detail-txt-btn"
                onClick={handleOpenImageStudio}
              >
                {tDetail('openStudio')}
              </button>
              <span className="canvas-detail-count">
                {tDetail('sourceCounts', {
                  refs: referenceAssets.length,
                  refMax: maxReferenceImages,
                  loras: loras.length,
                  loraMax: NODE_STUDIO_CHARACTER_IMAGE_LORAS.maxItems,
                })}
              </span>
            </div>

            {rackExtras}

            {/* ⚠ 这里**不加**「参考」标签行。真机实拍到同一屏出现三遍：
                素材架右对齐计数「参考图 0/3」+ 我加的行首标签「参考」+ 图集自己的
                标题「参考图 0/3」。契约 R1 一级面零标题预算，留右对齐那一处即可。
                R5：条目控件常显 —— 用 gallery 档而不是紧凑 popover 档，
                popover 把「移除/查看」藏在弹层里，触屏与键盘都够不着。 */}
            <CharacterImageReferenceControls
              value={referenceAssets}
              maxItems={maxReferenceImages}
              onChange={(next) =>
                updateNodeData(nodeId, { referenceAssets: next })
              }
              mode="gallery"
              extraItems={referenceExtraItems}
              onExtract={
                onExtractReference
                  ? (reference) => onExtractReference(reference.id)
                  : undefined
              }
            />

            {/* ⚠ 外面这层 flex 行是必须的：LoRA 控件是一颗 `inline-flex` chip，
                直接做 flex 列容器的子节点会被 `align-items: stretch` 拉成通栏
                灰条（实拍到过）。 */}
            <div className="flex flex-wrap items-center gap-2">
              <CharacterImageLoraControls
                value={loras}
                model={data.model}
                onChange={(next) => updateNodeData(nodeId, { loras: next })}
                onInsertTrigger={handleInsertLoraTrigger}
              />
            </div>
          </div>
        ),

        desk: (
          <div className="canvas-detail-stack">
            {fields.map((fieldId) => {
              const value = getNodeWorkflowFieldValue(data, fieldId)
              const label = tFields(`${fieldId}.label`)
              const placeholder = tFields(`${fieldId}.placeholder`)
              const isLong =
                fieldId === NODE_WORKFLOW_FIELD_IDS.prompt ||
                fieldId === NODE_WORKFLOW_FIELD_IDS.action ||
                fieldId === NODE_WORKFLOW_FIELD_IDS.composition ||
                fieldId === NODE_WORKFLOW_FIELD_IDS.dialogue ||
                fieldId === NODE_WORKFLOW_FIELD_IDS.motion

              // R7：一栏内只有两类排法。长文本整宽无标签无边框（标签靠
              // placeholder 与 aria-label 承担，**prompt 不配独立标签行**）；
              // 短值标签左、值右、一行。
              return isLong ? (
                <div key={fieldId} className="canvas-detail-prompt-block">
                  <IMEAwareTextarea
                    value={value}
                    onValueChange={(next) => handleFieldChange(fieldId, next)}
                    aria-label={label}
                    placeholder={placeholder}
                    disabled={isPending}
                  />
                </div>
              ) : (
                <div key={fieldId} className="canvas-detail-krow">
                  <span className="canvas-detail-krow-key">{label}</span>
                  <IMEAwareInput
                    value={value}
                    onValueChange={(next) => handleFieldChange(fieldId, next)}
                    aria-label={label}
                    placeholder={placeholder}
                    disabled={isPending}
                    className="canvas-detail-krow-input"
                  />
                </div>
              )
            })}

            {/* ⬜ 模型仍是一块面板而不是 R10 要求的一颗 chip：把它收成
                「标签即当前模型 ▾」的浮层要改 studio-shared 的
                `BaseModelPickerPanel`，那是跨线项（契约 §8 末段同一条线）。
                本片先把它落进正确的槽，形态留给参数一颗按钮那一片一起收。 */}
            <WorkflowModelPicker
              value={data.model}
              options={modelOptions}
              onChange={(model) => updateNodeData(nodeId, { model })}
              kind={NODE_MEDIA_KIND_IDS.image}
            />
          </div>
        ),

        relations,

        evidence: (
          <EvidenceDrawer
            label={tDetail('sendPreview')}
            count={data.generationError ? 5 : 4}
            // 失败时强制展开：这时候抽屉里那一行红是用户唯一能读到原因的地方。
            defaultOpen={Boolean(data.generationError)}
          >
            {data.generationError ? (
              <EvidenceRow
                label={tDetail('fieldLastFailure')}
                value={data.generationError}
                tone="error"
              />
            ) : null}
            <EvidenceRow
              label={tFields('prompt.label')}
              value={prompt || tDetail('valueEmpty')}
              dim={!prompt}
            />
            <EvidenceRow
              label={tDetail('fieldModel')}
              value={modelLabel ?? tDetail('valueUnset')}
              dim={!modelLabel}
            />
            <EvidenceRow
              label={tDetail('fieldReferences')}
              value={`${referenceAssets.length} / ${maxReferenceImages}`}
              dim={referenceAssets.length === 0}
            />
            <EvidenceRow
              label={tDetail('fieldLoras')}
              value={`${loras.length} / ${NODE_STUDIO_CHARACTER_IMAGE_LORAS.maxItems}`}
              dim={loras.length === 0}
            />
          </EvidenceDrawer>
        ),

        dock: (
          <div className="canvas-detail-dock-bar">
            {/* R4：只有真正阻塞主动作的那一个发声，贴在按钮旁边。 */}
            <p
              className="canvas-detail-dock-reason"
              data-tone={
                !isPending && data.generationError ? 'error' : undefined
              }
            >
              {blockingReason ?? data.generationError ?? ''}
            </p>
            <button
              type="button"
              className="canvas-detail-primary"
              disabled={Boolean(blockingReason)}
              onClick={() => void generateMediaNode?.(nodeId)}
            >
              {isExistingImage
                ? t('generateFromExisting')
                : hasMedia
                  ? t('regenerate')
                  : t('generate')}
            </button>
          </div>
        ),

        overlays: (
          <AssetSelectorDialog
            open={assetDialogOpen}
            onOpenChange={setAssetDialogOpen}
            onSelect={handleSelectExisting}
            title={t('existingAssetDialogTitle')}
            description={t('existingAssetDialogDescription')}
            mediaType="image"
          />
        ),
      })}
    </>
  )
}
