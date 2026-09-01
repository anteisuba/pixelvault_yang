'use client'

import Image from 'next/image'
import { ImageIcon, Library, Sparkles, Trash2, Upload } from 'lucide-react'
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
  NODE_TYPE_IDS,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowFieldId,
} from '@/constants/node-types'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import {
  resolveNodeDisplayName,
  stripFileExtension,
  toNodeDisplayLabel,
} from '@/lib/node-display-name'
import { resolveNodePresentationType } from '@/lib/node-presentation'
import {
  buildNodeWorkflowPrompt,
  getNodeWorkflowFieldValue,
} from '@/lib/node-workflow-prompt'
import {
  CharacterImageReferenceControls,
  type CharacterReferenceGalleryExtraItem,
} from '@/components/business/node/CharacterImageReferenceControls'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useNodeReferenceUpload } from '@/hooks/node/use-node-reference-upload'
import type { GenerationRecord } from '@/types'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { MentionInput, type MentionInputHandle } from '../composer/MentionInput'
import { IMEAwareInput, IMEAwareTextarea } from '../inspector/IMEAwareField'
import { NodeProgressState } from '../nodes/NodeProgressState'
import { DetailModelPicker } from './DetailModelPicker'
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
 * · 素材架 = 参考图标题与计数 + 唯一“添加参考图”入口
 * · 编排台 = 长字段整宽无标签块 / 短字段标签左值右（R7 只有这两类）+ 模型
 * · 关系带 = 由族传入（必给）
 * · 证据抽屉 = 发送预览（提示词 / 模型 / 参考图，失败时置顶一行红）
 * · 动作坞 = 阻塞原因 + 生成（全屏唯一实心元素）
 *
 * 参考图属于素材架，不归编排台。所有来源（上传 / 素材库 / 粘贴）只在“添加参考图”
 * 浮层出现一次；当前详情不再暴露 Studio 跳转和未完成的 LoRA 控件。
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
  /**
   * `true` = 新参考图仍写进本节点的 `referenceAssets`（旧落点）。
   * **只有背景卡该传** —— 它和角色卡一样是收集器，下游收割把它展开成 onStage
   * 集合；镜头 / 关键帧 / 散图不是，它们走阶段 3 主路（落散图节点 + 自动连线）。
   * 完整理由与解除条件见 `ReferenceLandingTabs` 的 `onResolved` 头注。
   */
  nestedReferenceAdd?: boolean
  /**
   * 画布修法包 C（2026-08-26）：空态让位——`!hasMedia` 时把编排台的字段
   * 整块搬进主体台的大位置，井退成底部一条预览带（模型选择器留在素材架侧）。
   * **只有镜头图该传 `true`**（`ShotDetailBody`）；默认 `false`，散图/关键帧/
   * 背景三族一像素不受影响。有媒体后四族版式完全一致，回到今天的媒体优先。
   */
  promoteFieldsWhenEmpty?: boolean
  /**
   * 画布修法包 E（2026-08-26）：空态先问一句——`!hasMedia` 时 stage 槽先渲染
   * 「上传图片 / 用 AI 生成」两颗选择按钮，不把上传、生成两条路的控件同时铺开
   * （施工基准见 `docs/references/pages/canvas-node-detail.md` §3.2）。
   * 选「用 AI 生成」落地为**面板本地** state（不写节点数据），随后复用
   * `promoteFieldsWhenEmpty` 那套写作台渲染；选「上传图片」直接触发既有文件
   * 输入（`uploadHandlerProps`，走素材架同一条通路），不改这个开关。
   * **只有散图（`LooseImageDetailBody`）该传 `true`**，且必须同时传
   * `promoteFieldsWhenEmpty`——选完「生成」之后要落到的正是那套版式，两个
   * 开关分开是因为「先问不问」与「问完给什么」是两件事。默认 `false`，
   * 镜头图/关键帧/背景三族不受影响。
   * ⚠ 选择状态按 `nodeId` 归零：族表提供者按 `presentationType` 而非
   * `nodeId` 挂载（见 `NodeDetailPanel.renderFrame` 头注），同类型节点之间
   * 切换不会重新挂载这个组件实例。不归零的话，在节点 A 上选了「用 AI 生成」
   * 后切到同类型的另一个空节点 B，会直接带着 A 的选择出现，B 不会再被问一次。
   */
  offerChoiceWhenEmpty?: boolean
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
  nestedReferenceAdd = false,
  promoteFieldsWhenEmpty = false,
  offerChoiceWhenEmpty = false,
  children,
}: ImageFamilyBodyProps) {
  const t = useTranslations('StudioNode.mediaNodes')
  const tDetail = useTranslations('StudioNode.nodeDetail')
  const tFields = useTranslations('StudioNode.workflowFields')
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const {
    generateMediaNode,
    modelOptionsByType,
    updateNodeData,
    listConnectableReferences,
    connectReferenceNode,
  } = useNodeWorkflowActions()
  const mentionRef = useRef<MentionInputHandle>(null)
  const { uploadFile } = useNodeReferenceUpload()
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : null
  const hasMedia = Boolean(mediaUrl)
  /** 画布修法包 C：空态让位是否生效。有媒体后恒 false —— 版式立刻回到媒体优先。 */
  const showPromotedEmptyLayout = promoteFieldsWhenEmpty && !hasMedia
  /**
   * 画布修法包 E：空态先问一句「上传还是生成」——面板本地 state，选了「生成」
   * 才退场，不写节点数据。按 nodeId 归零的理由见 prop 头注。
   *
   * ⚠ 用「渲染期调整 state」而不是 `useEffect`——与 `VoiceNode.tsx` 的
   * `playbackSourceUrl` 同一个模式（该文件头注写明了理由）：只在 `nodeId`
   * 真的变了时写一次，React 立刻带新 state 重跑本次渲染，比 effect 版少
   * 一帧（effect 版会让被切到的新节点先用旧 state 画一帧「已经选过生成」），
   * 也不触发 `react-hooks/set-state-in-effect`。
   */
  const [choseGenerateMode, setChoseGenerateMode] = useState(false)
  const [choseGenerateModeNodeId, setChoseGenerateModeNodeId] = useState(nodeId)
  if (choseGenerateModeNodeId !== nodeId) {
    setChoseGenerateModeNodeId(nodeId)
    setChoseGenerateMode(false)
  }
  const showEmptyChoice =
    offerChoiceWhenEmpty && !hasMedia && !choseGenerateMode
  const referenceAssets = useMemo(
    () => data.referenceAssets ?? [],
    [data.referenceAssets],
  )
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
      const sourceLabel = toNodeDisplayLabel(label)

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
    // 包 E：清空即回到「还没有东西」，再次打开时应该重新问一句，不是直接
    // 回落到上次选过的「用 AI 生成」写作台。
    setChoseGenerateMode(false)
  }, [nodeId, updateNodeData])

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

  /**
   * 镜头图才读上游图 —— `@` 候选与落法都与 `VideoComposer` 同一条政策：
   * **落槽 + 正文留字**，且只在真进了槽时才留字（owner 2026-08-10，契约 §5.1）。
   * ⚠ 不在这里复述那边的完整推理，改动前去读 `VideoComposer.handleMentionSelect`
   * 的头注 —— 两处若各写一份，迟早只改一处。
   */
  const isShotImageNode = type === NODE_TYPE_IDS.shot
  const connectableReferences = isShotImageNode
    ? (listConnectableReferences?.(nodeId) ?? [])
    : []
  const mentionCandidates = connectableReferences.map((node) => ({
    id: node.id,
    name: resolveNodeDisplayName(node.data) ?? node.id,
    groupLabel: tTypes(resolveNodePresentationType(node)),
  }))

  const handleMentionSelect = useCallback(
    (candidate: { id: string; name: string }) => {
      const landed = connectReferenceNode?.(candidate.id, nodeId) ?? false
      if (landed) mentionRef.current?.insertToken(candidate.name)
    },
    [connectReferenceNode, nodeId],
  )

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

  const blockingReason = isPending
    ? t('generating')
    : showEmptyChoice
      ? t('emptyChoice.dockHint')
      : !data.model
        ? t('noModel')
        : !prompt
          ? t('noPrompt')
          : null

  const modelLabel = data.model?.providerConfig.label ?? null

  /** 井空态时兼作上传落点的那组处理器——promoted 带子也要用同一份（不是新按钮）。 */
  const uploadHandlerProps = hasMedia
    ? {}
    : {
        role: 'button' as const,
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
      }

  const hiddenFileInputEl = (
    <input
      ref={fileInputRef}
      type="file"
      accept={NODE_STUDIO_IMAGE_INPUT.accept}
      className="hidden"
      onChange={handleFileInputChange}
    />
  )

  /**
   * 编排台字段——散图/关键帧/背景默认档原样塞进 desk；镜头图空态时整块搬进
   * `stage`（`promoteFieldsWhenEmpty`）。抽成变量只为了两处复用同一份 JSX，
   * **逻辑一行不动**（S7 同款「重排不是重造」）。
   */
  const fieldsListEls = fields.map((fieldId) => {
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
    /**
     * 正文（`prompt`）在**镜头图**上换成 `MentionInput` —— 契约 §5.4
     * 落点清单里的「详情面板 prompt」。
     *
     * ⚠ **只给镜头图开**，不是嫌麻烦而是「形态即说明」：镜头图是
     * `isShotImageNode`，**唯一会读上游图的图片族**（收割上游角色/背景
     * 图并给它们注图例）。散图 / 关键帧 / 背景卡的生成只读自己的
     * Inspector，给它们一个 `@` 就是画一条连了也不进请求的边 —— 伪装
     * 能力。哪天图片收割扩到别的族，把这个判据跟着扩，别在这里手写第
     * 二套名单。
     * ⚠ 其余长字段（动作 / 构图 / 台词 / 运镜）维持 textarea：它们是
     * 结构化子字段，不是「你写给模型的那段话」。
     */
    const isMentionablePrompt =
      fieldId === NODE_WORKFLOW_FIELD_IDS.prompt && isShotImageNode

    return isMentionablePrompt ? (
      <div key={fieldId} className="canvas-detail-prompt-block">
        <MentionInput
          ref={mentionRef}
          value={value}
          onValueChange={(next) => handleFieldChange(fieldId, next)}
          // 上游引用的 chip 化留给日后：图片族今天没有算好的
          // `referenceTokens`，传空名单 = 插进去的 `@名字` 是纯文本，
          // 值本身正确（与 `GenerateComposer` 同一档取舍）。
          tokens={[]}
          mentionCandidates={mentionCandidates}
          onMentionSelect={handleMentionSelect}
          aria-label={label}
          placeholder={placeholder}
          className="canvas-detail-prompt-input"
        />
      </div>
    ) : isLong ? (
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
  })

  // ⬜ 模型仍是一块面板而不是 R10 要求的一颗 chip（原有 ⬜ 事项，见下方注释）。
  const modelPickerEl = (
    <DetailModelPicker
      value={data.model}
      options={modelOptions}
      onChange={(model) => updateNodeData(nodeId, { model })}
      kind={NODE_MEDIA_KIND_IDS.image}
    />
  )

  return (
    <>
      {children({
        stage: showEmptyChoice ? (
          <>
            {/* 包 E：先问一句「上传还是生成」——两颗大按钮，不把两条路的控件
                同时铺开（对照确认图「收入口 01 · 图片」改完态）。上传项直接
                复用 `uploadHandlerProps`（走素材架同一条上传通路：点/键盘/
                拖拽/粘贴全套，不新造）；生成项只切一个面板本地 state，
                真正的写作台由下面 `showPromotedEmptyLayout` 分支渲染。 */}
            <div className="canvas-detail-stage">
              <div className="canvas-detail-fork">
                <div className="canvas-detail-fork-opt" {...uploadHandlerProps}>
                  <Upload
                    aria-hidden
                    className="canvas-detail-fork-icon size-5"
                    strokeWidth={1.5}
                  />
                  <span className="canvas-detail-fork-title">
                    {t('existing.upload')}
                  </span>
                  <span className="canvas-detail-fork-hint">
                    {t('emptyChoice.uploadHint')}
                  </span>
                </div>
                <button
                  type="button"
                  className="canvas-detail-fork-opt"
                  onClick={() => setChoseGenerateMode(true)}
                >
                  <Sparkles
                    aria-hidden
                    className="canvas-detail-fork-icon size-5"
                    strokeWidth={1.5}
                  />
                  <span className="canvas-detail-fork-title">
                    {t('emptyChoice.generateTitle')}
                  </span>
                  <span className="canvas-detail-fork-hint">
                    {t('emptyChoice.generateHint')}
                  </span>
                </button>
              </div>
            </div>
            {hiddenFileInputEl}
          </>
        ) : showPromotedEmptyLayout ? (
          <>
            <div className="canvas-detail-stage-promoted">
              <div className="canvas-detail-stack">{fieldsListEls}</div>
              {/* 井退成的预览带——契约 R2 仍成立（版式同构，只把内容像素换成
                  极淡字形），只是几何缩到 74–96px。⚠ 仍在 stage 槽上，
                  不是被删掉。⚠ 不搬 `uploadHandlerProps` 上来：那样会让它的
                  可访问名（「上传图片」）与可见文案（「生成后出现在这里」）
                  对不上（WCAG 2.5.3 Label in Name）。上传入口维持素材架里
                  那颗显式按钮（本文件头注早就写明这是键盘用户的真正落点，
                  井上的点/拖/粘贴只是满态时的顺手），带子退回纯展示。 */}
              <div className="canvas-detail-stage-band">
                {isPending ? (
                  <NodeProgressState
                    indicator="breath"
                    veiled
                    label={t('generating')}
                  />
                ) : (
                  <>
                    <ImageIcon
                      aria-hidden
                      className="canvas-detail-well-glyph size-5"
                      strokeWidth={1.25}
                    />
                    <span>{tDetail('stagePreviewHint')}</span>
                  </>
                )}
              </div>
            </div>
            {hiddenFileInputEl}
          </>
        ) : (
          <>
            <div className="canvas-detail-stage">
              {/* ⚠ 空态下这块**同时是**上传落点（点 / 拖 / 粘贴）。R2 要求空态与
                  满态版式完全同构，所以它不换虚线边、不加说明文案 —— 只有一枚
                  极淡字形。上传这条路另有素材架里那颗显式按钮兜底，键盘用户
                  不必依赖「看不出可以点」的井。 */}
              <div
                className="canvas-detail-well"
                style={{ '--canvas-detail-ar': aspect } as React.CSSProperties}
                {...uploadHandlerProps}
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
                    <div className="absolute right-2 top-2 flex items-center gap-1.5">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex h-8 items-center rounded-full border border-node-edge bg-node-panel px-3 text-xs font-semibold text-node-foreground outline-none transition-colors hover:bg-node-panel-inner focus-visible:ring-2 focus-visible:ring-node-focus-ring/30"
                          >
                            {t('replaceImage')}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="end"
                          sideOffset={8}
                          className="w-52 rounded-2xl border-node-panel-inner bg-node-panel p-2 text-node-foreground shadow-node-panel"
                        >
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex h-9 w-full items-center gap-2 rounded-xl px-3 text-xs font-semibold hover:bg-node-panel-inner"
                          >
                            <Upload className="size-4 text-node-muted" />
                            {t('existing.upload')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setAssetDialogOpen(true)}
                            className="flex h-9 w-full items-center gap-2 rounded-xl px-3 text-xs font-semibold hover:bg-node-panel-inner"
                          >
                            <Library className="size-4 text-node-muted" />
                            {t('existing.asset')}
                          </button>
                        </PopoverContent>
                      </Popover>
                      <button
                        type="button"
                        onClick={handleClearImage}
                        aria-label={t('clearImage')}
                        className="flex size-8 items-center justify-center rounded-full border border-node-edge bg-node-panel text-node-muted outline-none transition-colors hover:text-node-foreground focus-visible:ring-2 focus-visible:ring-node-focus-ring/30"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
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
            {hiddenFileInputEl}
          </>
        ),

        rack: (
          <div className="canvas-detail-stack">
            <div className="canvas-detail-shelf">
              <span className="canvas-detail-shelf-label">
                {tDetail('fieldReferences')}
              </span>
              <span className="canvas-detail-count">
                {referenceAssets.length} / {maxReferenceImages}
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
              targetNodeId={nodeId}
              nestedAdd={nestedReferenceAdd}
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
          </div>
        ),

        // ⬜ 模型仍是一块面板而不是 R10 要求的一颗 chip：把它收成
        // 「标签即当前模型 ▾」的浮层要改 studio-shared 的
        // `BaseModelPickerPanel`，那是跨线项（契约 §8 末段同一条线）。
        // 本片先把它落进正确的槽，形态留给参数一颗按钮那一片一起收。
        //
        // 画布修法包 C：空态让位时字段搬去了 stage，desk 这里只剩模型选择器
        // （对照确认图的边栏第一项）；有媒体或未启用促升的三族维持今天的
        // 「字段 + 模型」同一个 stack，一像素不改。
        //
        // 画布修法包 E：先问一句阶段 desk 传 `null`（**不是** `undefined`——
        // 后者会让 compose-desk 整栏从 DOM 里消失，破坏「槽序 = DOM 序」；
        // `null` 让槽位仍在，只是此刻空着）。模型选择器属于「生成」这条路的
        // 控件，选择前不铺开，见 `showEmptyChoice` 头注。
        desk: showEmptyChoice ? null : showPromotedEmptyLayout ? (
          <div className="canvas-detail-stack">{modelPickerEl}</div>
        ) : (
          <div className="canvas-detail-stack">
            {fieldsListEls}
            {modelPickerEl}
          </div>
        ),

        relations,

        evidence: (
          <EvidenceDrawer
            label={tDetail('sendPreview')}
            count={data.generationError ? 5 : 4}
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
