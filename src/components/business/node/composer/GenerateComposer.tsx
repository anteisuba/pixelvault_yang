'use client'

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { NodeToolbar, Position, useReactFlow } from '@xyflow/react'
import {
  ChevronDown,
  Expand,
  ImageIcon,
  Mic2,
  Plus,
  Send,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { getCapabilityConfig } from '@/constants/provider-capabilities'
import type { AspectRatio } from '@/constants/config'
import { NODE_STUDIO_GENERATE_COMPOSER } from '@/constants/node-studio'
import { NODE_TYPE_IDS } from '@/constants/node-types'
import { focusUnlessTouch } from '@/lib/touch'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'
import type {
  NodeWorkflowModelOption,
  NodeWorkflowModelSelection,
  NodeWorkflowNode,
} from '@/types/node-workflow'
import {
  buildDisplayNamePatch,
  buildFallbackNodeNames,
  resolveNodeDisplayName,
} from '@/lib/node-display-name'
import { resolveNodePresentationType } from '@/lib/node-presentation'

import { aspectBoxStyle } from './VideoComposer'
import { GenerateComposerTemplatePicker } from './GenerateComposerTemplatePicker'
import { MentionInput } from './MentionInput'
import { WorkflowModelPicker } from '../WorkflowModelPicker'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { MediaReviewButtons } from '../CanvasImageSelectionToolbar'
import { CanvasPopIn } from '../CanvasPopIn'
import { useNodeSelection } from '@/hooks/node/use-node-selection'
import { isRunnableModelOption } from '@/hooks/use-split-model-options'
import {
  useGenerateComposer,
  type ComposerReferenceSlot,
  type GenerateComposerMode,
  type ImageResolutionTier,
} from '@/hooks/node/use-generate-composer'

function stopCanvasKey(event: ReactKeyboardEvent<HTMLElement>) {
  event.stopPropagation()
}

const KEY_GUARD = {
  onKeyDownCapture: stopCanvasKey,
  onKeyUpCapture: stopCanvasKey,
} as const

/** §4 参考图槽一格——宿主图钉在首格（不可删，角标「正在改」），其后是用户
 *  从素材库加的额外槽（可删）。 */
function ReferenceSlotChip({
  slot,
  onRemove,
}: {
  slot: ComposerReferenceSlot
  onRemove?: () => void
}) {
  const t = useTranslations('StudioNode.generateComposer')
  return (
    <span
      className="canvas-composer-ref-slot group/ref"
      title={slot.pinned ? t('editingBadge') : slot.label}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary R2/asset urls, not a static app asset */}
      <img src={slot.thumbnailUrl ?? slot.url} alt="" />
      {slot.pinned ? (
        <span className="canvas-composer-ref-pinned-badge">
          {t('editingBadge')}
        </span>
      ) : onRemove ? (
        <button
          type="button"
          {...KEY_GUARD}
          onClick={onRemove}
          aria-label={t('removeReference', { name: slot.label ?? '' })}
          className="canvas-composer-ref-remove nodrag"
        >
          <X className="size-2.5" aria-hidden />
        </button>
      ) : null}
    </span>
  )
}

interface AspectResolutionPickerProps {
  aspectRatio: AspectRatio
  onAspectChange(value: AspectRatio): void
  aspectOptions: readonly AspectRatio[]
  resolution: ImageResolutionTier
  onResolutionChange(value: ImageResolutionTier): void
  resolutionOptions: readonly string[]
}

/** §5「比例+清晰度」——画幅可视化选择块直接复用 VideoComposer 的
 *  `aspectBoxStyle`（§7.5 零重造清单点名的那一件），只是外壳从展开态的手风
 *  琴换成紧凑态的 popover。 */
function AspectResolutionPicker({
  aspectRatio,
  onAspectChange,
  aspectOptions,
  resolution,
  onResolutionChange,
  resolutionOptions,
}: AspectResolutionPickerProps) {
  const t = useTranslations('StudioNode.generateComposer')
  const tStudio = useTranslations('StudioV2')
  const [open, setOpen] = useState(false)
  const summary =
    resolution !== 'auto' ? `${aspectRatio} · ${resolution}` : aspectRatio

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          {...KEY_GUARD}
          aria-expanded={open}
          className="canvas-composer-pill nodrag"
        >
          {summary}
          <ChevronDown className="size-3 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="canvas-composer-popover w-auto"
        {...KEY_GUARD}
      >
        <div className="space-y-2.5">
          <div>
            <p className="canvas-composer-popover-label">{t('aspectLabel')}</p>
            <div className="flex flex-wrap gap-1.5">
              {aspectOptions.map((option) => {
                const box = aspectBoxStyle(option)
                const isSelected = aspectRatio === option
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onAspectChange(option)}
                    aria-pressed={isSelected}
                    className={cn(
                      'canvas-composer-aspect-tile',
                      isSelected && 'canvas-composer-aspect-tile--active',
                    )}
                  >
                    <span
                      className="canvas-composer-aspect-box"
                      style={{ width: box.width, height: box.height }}
                      aria-hidden
                    />
                    <span>{option}</span>
                  </button>
                )
              })}
            </div>
          </div>
          {resolutionOptions.length > 0 ? (
            <div>
              <p className="canvas-composer-popover-label">
                {tStudio('resolutionLabel')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {resolutionOptions.map((option) => {
                  const isSelected = resolution === option
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() =>
                        onResolutionChange(option as ImageResolutionTier)
                      }
                      aria-pressed={isSelected}
                      className={cn(
                        'canvas-composer-seg-btn',
                        isSelected && 'canvas-composer-seg-btn--active',
                      )}
                    >
                      {tStudio(`resolutionOption.${option}`)}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** §5「模型 ∨」—— 复用 WorkflowModelPicker（NodeMediaInspector 同款组件），
 *  Hard Rule 8：缺 key 时不禁用，路由到 QuickSetupDialog 内联配置。 */
function ModelPill({
  mode,
  value,
  options,
  onChange,
}: {
  mode: GenerateComposerMode
  value: NodeWorkflowModelSelection | undefined
  options: NodeWorkflowModelOption[]
  onChange(model: NodeWorkflowModelSelection): void
}) {
  const [quickSetup, setQuickSetup] = useState<{
    option: NodeWorkflowModelOption
  } | null>(null)

  return (
    <>
      <WorkflowModelPicker
        value={value}
        options={options}
        onChange={onChange}
        onClickLocked={(option) => setQuickSetup({ option })}
        kind={mode}
        className="canvas-composer-model-pill"
      />
      {quickSetup ? (
        <QuickSetupDialog
          open
          onOpenChange={(open) => {
            if (!open) setQuickSetup(null)
          }}
          modelId={quickSetup.option.modelId}
          modelLabel={quickSetup.option.modelId}
          adapterType={quickSetup.option.adapterType}
          optionId={quickSetup.option.optionId}
          onVerified={(optionId) => {
            const verified = options.find((o) => o.optionId === optionId)
            if (verified) {
              onChange({
                optionId: verified.optionId,
                modelId: verified.modelId,
                adapterType: verified.adapterType,
                providerConfig: verified.providerConfig,
                apiKeyId: verified.apiKeyId,
              })
            }
            setQuickSetup(null)
          }}
        />
      ) : null}
    </>
  )
}

interface ComposerCoreProps {
  composer: ReturnType<typeof useGenerateComposer>
}

/** The body shared by attached + blank renderings: reference row + expand
 *  button, prompt, mode-aware param row + send. */
function ComposerCore({ composer }: ComposerCoreProps) {
  const t = useTranslations('StudioNode.generateComposer')
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const {
    modelOptionsByType,
    setExpandedNodeId,
    listConnectableReferences,
    connectReferenceNode,
    updateNodeData,
  } = useNodeWorkflowActions()
  // 审核动作要的是宿主节点的完整 data（composer.host 只是摘要）。宿主本来就
  // 由「当前单选节点」推出（inferComposerHost），所以取同一个来源，两者不可能
  // 指向不同的卡。
  const selection = useNodeSelection()
  const hostData =
    selection.primary && selection.primary.id === composer.host?.nodeId
      ? selection.primary.data
      : null
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const promptRef = useRef<HTMLDivElement>(null)

  // §2 起手势「新建节点 → 自动出现并聚焦输入框」+ §7「可以立刻接着改下一
  // 版」— focus follows `focusToken`, never a plain mount/selection change
  // (触屏软键盘策略：只在直接点输入框时弹，`focusUnlessTouch` 在触屏上是
  // 空操作). `focusToken` starts at 0 and is never bumped by a plain host
  // switch, so simply selecting an existing card never steals focus.
  useEffect(() => {
    if (composer.focusToken === 0) return
    const el =
      promptRef.current?.querySelector<HTMLElement>('[contenteditable]')
    focusUnlessTouch(el)
  }, [composer.focusToken])

  const isEditing = Boolean(composer.host?.hasMedia)
  const placeholder = isEditing
    ? t('placeholderEditing')
    : t('placeholderEmpty')

  const modelOptions =
    composer.mode === 'image'
      ? (modelOptionsByType[NODE_TYPE_IDS.image] ?? [])
      : (modelOptionsByType[NODE_TYPE_IDS.voice] ?? [])

  // §4/§5 清晰度弹层依赖 resolutionOptions，而 resolutionOptions 依赖已选模
  // 型——composer.modelSelection 原先永远从 undefined 起步，没人替它挑第一
  // 个，「清晰度」那段因此默认不出现，看着像是"这个模型不支持"，其实是压根
  // 没选模型。落到 modelOptions[0]：`models/image.ts` 顶注「按产品推荐排
  // 序」，与 `lib/model-options.ts` 的 `findSelectedModel`（"跌到第一项"）同
  //一条既有惯例，不是新发明的策略。只在用户还没选过时补一次，选过之后（含
  // 手动换成不支持清晰度的模型）不会被这段覆盖回去。
  // 台账 D7 刀 2（2026-08-02）：默认落**第一个能真跑的**，不是第 [0] 项。
  // 目录序把 OpenAI GPT Image 2 排在最前（models/image.ts「按产品推荐排序」），
  // 而它对没配 key 的用户是 locked —— 开箱即用的默认值指向一个用不了的
  // provider，看着能发、发了才失败。判据复用 `isRunnableModelOption`
  // （= useSplitModelOptions 的 saved/platform 两桶），可跑项全无时仍退回
  // 第 [0] 项：让「清晰度」那段有模型可依，好过整段消失。
  useEffect(() => {
    if (composer.mode !== 'image') return
    if (composer.modelSelection) return
    const fallback = modelOptions.find(isRunnableModelOption) ?? modelOptions[0]
    if (fallback) composer.setModelSelection(fallback)
  }, [
    composer.mode,
    composer.modelSelection,
    modelOptions,
    composer.setModelSelection,
  ])

  const resolutionOptions = composer.modelSelection
    ? (getCapabilityConfig(
        composer.modelSelection.adapterType,
        composer.modelSelection.modelId,
      ).resolutionOptions ?? [])
    : []

  // §6 扩大 = 打开宿主节点详情页——空白唤起（还没有宿主节点）没有详情页可
  // 开，顶行的 ⤢ 按钮不渲染。局部变量而非 composer.host 内联判断，是为了让
  // TS 把下面 onClick 闭包里的 host.nodeId 收窄成非 null（对 props 属性访问
  // 的收窄不会穿过闭包，对 const 局部变量的收窄会）。
  const host = composer.host

  /**
   * @ 提及 —— 与视频节点同一套（`MentionInput` 本来就是四处共用的组件）。
   * 没有宿主（空白画布起手）时没有连线目标，候选自然为空。
   */
  const mentionSource = host
    ? (listConnectableReferences?.(host.nodeId) ?? [])
    : []
  // ⚠ 用 `resolveNodePresentationType` 而不是 `node.data.role` —— `nodeTypes` 是按
  // **类型**编键的，直接拿 role 当键会解析不到、把 `StudioNode.nodeTypes.character`
  // 原样显示给用户（实测撞到过）。这个函数就是为「role → 展示类型」准备的。
  const mentionKindOf = (node: NodeWorkflowNode) =>
    tTypes(resolveNodePresentationType(node))
  const mentionNames = buildFallbackNodeNames(mentionSource, mentionKindOf)
  const mentionCandidates = mentionSource.map((node) => ({
    id: node.id,
    name: mentionNames.get(node.id) ?? node.id,
    groupLabel: mentionKindOf(node),
  }))

  const handleMentionSelect = (candidate: { id: string; name: string }) => {
    if (!host) return
    const node = mentionSource.find((n) => n.id === candidate.id)
    // 引用即命名 —— 同 VideoComposer：提议名会随增删重编号，而 @ 存进 prompt 的是
    // 字面文本，不落库以后就会指向别的节点。
    if (node && !resolveNodeDisplayName(node.data)) {
      updateNodeData?.(
        node.id,
        buildDisplayNamePatch(
          { role: node.data.role, type: node.type },
          candidate.name,
        ),
      )
    }
    connectReferenceNode?.(candidate.id, host.nodeId)
  }

  const handleSelectAsset = (generation: GenerationRecord) => {
    composer.addReferenceFromAsset(generation)
    setAssetDialogOpen(false)
  }

  return (
    <div className="canvas-composer-core nodrag nopan nowheel" {...KEY_GUARD}>
      {composer.mode === 'image' || host ? (
        <div className="canvas-composer-top-row">
          {composer.mode === 'image' ? (
            <div className="canvas-composer-ref-row">
              {composer.referenceSlots.map((slot) => (
                <ReferenceSlotChip
                  key={slot.id}
                  slot={slot}
                  onRemove={
                    slot.pinned
                      ? undefined
                      : () => composer.removeReferenceSlot(slot.id)
                  }
                />
              ))}
              {composer.referenceSlots.length < composer.referenceCap ? (
                <button
                  type="button"
                  onClick={() => setAssetDialogOpen(true)}
                  aria-label={t('addReference')}
                  title={t('addReference')}
                  className="canvas-composer-ref-add"
                >
                  <Plus className="size-3" aria-hidden />
                </button>
              ) : null}
            </div>
          ) : null}
          {host ? (
            <button
              type="button"
              {...KEY_GUARD}
              onClick={() => setExpandedNodeId(host.nodeId)}
              aria-label={t('expand')}
              title={t('expand')}
              className="canvas-composer-icon-btn nodrag"
            >
              <Expand className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}

      <div ref={promptRef}>
        <MentionInput
          value={composer.promptDraft}
          onValueChange={composer.setPromptDraft}
          tokens={[]}
          mentionCandidates={mentionCandidates}
          onMentionSelect={handleMentionSelect}
          aria-label={t('placeholderEmpty')}
          placeholder={placeholder}
          {...KEY_GUARD}
          className="canvas-composer-input"
        />
      </div>

      {/* §3 参数条与发送合并成一行，发送键在行末——紧凑规格 2026-07-27 修
          订。音频占位框也走同一行，跟图片模式共用「行末发送」骨架，不是又建
          一套。 */}
      <div className="canvas-composer-second-row">
        {composer.mode === 'audio' ? (
          <div className="canvas-composer-audio-placeholder">
            <Mic2 className="size-3.5 shrink-0" aria-hidden />
            {t('audioPlaceholder')}
          </div>
        ) : (
          <div className="canvas-composer-param-row">
            {/* §5.5「用模板」——底部参数条第一位，与模型/比例/张数并列同一
                「点开都是选择器」分组（owner 2026-07-27 拍板，推翻了「放
                prompt 区」的原方案）。只在 image 模式渲染，因为这一整段
                param-row 本身就只在 mode !== 'audio' 时出现。
                ⚠ 台账 D1：这颗按钮 2026-08-02 起只出图标（文字进
                aria-label/title）。同组另外三颗都在显示**当前值**
                （Gemini 3.1 / 1:1 / ×1），只有它显示的是自己的名字 —— 那不
                是这一组该承担的信息，而它带文字要吃 84px，正是这行折成两行
                的另一半原因。 */}
            <GenerateComposerTemplatePicker
              outputType="IMAGE"
              promptDraft={composer.promptDraft}
              onApply={composer.setPromptDraft}
            />
            <ModelPill
              mode="image"
              value={composer.modelSelection}
              options={modelOptions}
              onChange={composer.setModelSelection}
            />
            <AspectResolutionPicker
              aspectRatio={composer.aspectRatio}
              onAspectChange={composer.setAspectRatio}
              aspectOptions={composer.aspectOptions}
              resolution={composer.imageResolution}
              onResolutionChange={composer.setImageResolution}
              resolutionOptions={resolutionOptions}
            />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  {...KEY_GUARD}
                  className="canvas-composer-pill nodrag"
                >
                  ×{composer.batchCount}
                  <ChevronDown className="size-3 shrink-0" aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                sideOffset={8}
                className="canvas-composer-popover w-auto"
                {...KEY_GUARD}
              >
                <div className="flex gap-1.5">
                  {NODE_STUDIO_GENERATE_COMPOSER.batchCounts.map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => composer.setBatchCount(count)}
                      aria-pressed={composer.batchCount === count}
                      className={cn(
                        'canvas-composer-seg-btn',
                        composer.batchCount === count &&
                          'canvas-composer-seg-btn--active',
                      )}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* 包 4 审核动作（owner 2026-07-31 从近场工具条挪进生成框，2026-08-02
            又从参数条挪到这里）：审核回答的是「这一版要不要」，跟发送的
            「再来一版」是同一场处置决策；参数条那三颗回答的是「下一版长什么
            样」。原来混在一起，是把两类问题排成了一排同重的丸。
            只在宿主已有媒体时出现（没有图就没有可审的东西）。 */}
        {composer.host?.hasMedia && hostData ? (
          <>
            <span
              className="canvas-selection-toolbar-divider h-5 w-px shrink-0"
              aria-hidden
            />
            <MediaReviewButtons
              nodeId={composer.host.nodeId}
              data={hostData}
              compact
            />
          </>
        ) : null}

        <button
          type="button"
          {...KEY_GUARD}
          onClick={composer.send}
          disabled={!composer.canSend}
          aria-label={t('send')}
          title={
            composer.disabledReason
              ? t(
                  composer.disabledReason === 'noModel'
                    ? 'reasonNoModel'
                    : 'reasonNoInput',
                )
              : t('send')
          }
          className="canvas-composer-send-btn nodrag"
        >
          <Send className="size-4" aria-hidden />
        </button>
      </div>

      {composer.mode === 'image' ? (
        <AssetSelectorDialog
          open={assetDialogOpen}
          onOpenChange={setAssetDialogOpen}
          onSelect={handleSelectAsset}
          title={t('addReference')}
          description={t('addReference')}
          mediaType="image"
        />
      ) : null}
    </div>
  )
}

/** §3 从画布空白处唤起才需要的模式二选一 —— 挂在某族卡下时锁定该族生成，
 *  不显示这组控件。 */
function ModePicker({
  onChoose,
}: {
  onChoose(mode: GenerateComposerMode): void
}) {
  const t = useTranslations('StudioNode.generateComposer')
  return (
    <div className="canvas-composer-mode-picker">
      <p className="canvas-composer-popover-label">{t('modePickerTitle')}</p>
      <div className="flex gap-1.5">
        <button
          type="button"
          {...KEY_GUARD}
          onClick={() => onChoose('image')}
          className="canvas-composer-mode-btn nodrag"
        >
          <ImageIcon className="size-4" aria-hidden />
          {t('modeImage')}
        </button>
        <button
          type="button"
          {...KEY_GUARD}
          onClick={() => onChoose('audio')}
          className="canvas-composer-mode-btn nodrag"
        >
          <Mic2 className="size-4" aria-hidden />
          {t('modeAudio')}
        </button>
      </div>
    </div>
  )
}

/**
 * 画布 · 生成提示词框（docs/references/pages/canvas-generate-composer.md）。
 * 画布级共享组件，挂载一次——host 完全由当前单选节点推出，见
 * `useGenerateComposer`。渲染分两条腿：
 *   - 有宿主（图片/声音卡）：贴宿主卡下方的 `NodeToolbar`（Position.Bottom），
 *     自动跟随该节点的位置/缩放/平移，与 `VideoMergeComposeToolbar` 同一手法
 *     ——不需要把这个组件塞进每张卡自己的渲染树。
 *   - 无宿主（画布空白处双击唤起）：固定屏幕坐标的浮层，出现模式二选一。
 */
export function GenerateComposer() {
  const composer = useGenerateComposer()
  const { screenToFlowPosition } = useReactFlow()
  const rootRef = useRef<HTMLDivElement>(null)

  // 画布空白处唤起 —— 双击空白处（非节点/边/控件）打开，位置钉在点击点。
  // 只在 canvasRef 之外用一个独立的 document 级监听，不改
  // StudioNodeWorkbench 里既有的 onPaneClick/onPaneContextMenu，避免碰到
  // 另一路会话正在改的 Esc 阶梯与 transientLayerOpen。
  useEffect(() => {
    const handleDoubleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      // Exclude anything that isn't bare canvas background: nodes, edges,
      // the library's own chrome (controls/minimap/panels), and our own
      // floating surfaces.
      if (
        target.closest(
          '.react-flow__node, .react-flow__edge, .react-flow__controls, .react-flow__minimap, .react-flow__panel, .canvas-composer-root',
        )
      ) {
        return
      }
      if (!target.closest('.react-flow__pane')) return
      const flowPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      composer.openBlank(flowPosition, { x: event.clientX, y: event.clientY })
    }
    document.addEventListener('dblclick', handleDoubleClick)
    return () => document.removeEventListener('dblclick', handleDoubleClick)
  }, [composer, screenToFlowPosition])

  // 空白态点外部关闭（贴 NodeToolbar 的 attached 态靠"选中别的东西"自然消
  // 失，不需要这套——见 use-generate-composer 的 visibility 推导）。
  useEffect(() => {
    if (composer.visibility !== 'blank') return
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (rootRef.current?.contains(event.target)) return
      // The aspect/resolution/batch/model popovers (and QuickSetupDialog)
      // all portal their content to document.body via Radix — outside
      // `rootRef`'s DOM subtree even while visually part of this composer.
      // Without this check, picking an aspect ratio would close the whole
      // blank composer out from under the popover.
      if (
        event.target instanceof Element &&
        event.target.closest(
          '[data-radix-popper-content-wrapper], [role="dialog"]',
        )
      ) {
        return
      }
      composer.closeBlank()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) {
        event.stopPropagation()
        composer.closeBlank()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [composer])

  if (composer.visibility === 'hidden' && !composer.host) {
    return null
  }

  // §6 2026-07-27 修订: composer 自建的 ExpandedModal 退役，⤢ 改为打开宿主
  // 节点详情页（`setExpandedNodeId`，见 ComposerCore）——那条路径已经走
  // `heavyOverlayOpen` 把这个组件折叠掉（use-generate-composer.ts 的
  // `suppressedByOverlay`），不需要再在这里单独判"重叠层出现就收起展开态"。
  const body = <ComposerCore composer={composer} />

  if (composer.host) {
    return (
      <NodeToolbar
        nodeId={composer.host.nodeId}
        isVisible={composer.visibility === 'attached'}
        position={Position.Bottom}
        // 与宿主卡的垂直间距 2026-07-27 owner 真机反馈二轮修订：14→8px
        // （canvas-generate-composer.md §1「尺寸与间距」——间距大到读不出
        // "贴"宿主卡下方的归属关系，看起来像另一个独立浮层）。
        offset={8}
      >
        <CanvasPopIn side="bottom">
          <div ref={rootRef} className="canvas-composer-root">
            {body}
          </div>
        </CanvasPopIn>
      </NodeToolbar>
    )
  }

  if (composer.visibility !== 'blank' || !composer.blankScreen) {
    return null
  }

  return (
    <div
      ref={rootRef}
      className="canvas-composer-root canvas-composer-root--blank"
      style={{
        left: composer.blankScreen.x,
        top: composer.blankScreen.y,
      }}
    >
      {composer.mode === null ? (
        <ModePicker onChoose={composer.chooseBlankMode} />
      ) : (
        body
      )}
    </div>
  )
}
