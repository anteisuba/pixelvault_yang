'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  ChevronDown,
  Eraser,
  Paintbrush,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  SquareDashed,
  WandSparkles,
} from '@/components/icons'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  ImageAnnotationEditor,
  type DraftAnnotation,
} from '@/components/business/studio-shared/editor/ImageAnnotationEditor'
import {
  StudioInpaintEditor,
  type InpaintMaskDraft,
} from '@/components/business/studio/StudioInpaintEditor'
import { Switch } from '@/components/ui/switch'
import { ImageCompare } from '@/components/ui/image-compare'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { ModelPickerPopover } from '@/components/business/studio-shared/pickers/ModelPickerPopover'
import { ModelChip } from '@/components/business/studio-shared/pickers/ModelChip'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import {
  ImageEditComposer,
  type ImageEditComposerControls,
} from './ImageEditComposer'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useImageEditModelOptions } from '@/hooks/use-image-edit-model-options'
import { isMissingKeyModelOption } from '@/hooks/use-split-model-options'
import type { StudioModelOption } from '@/types/model-option'
import { AI_MODELS } from '@/constants/models/enum'
import {
  formatUnitPriceAmount,
  getImageUnitPrice,
} from '@/constants/models/unit-prices'
import { Textarea } from '@/components/ui/textarea'
import {
  getCanvasImageEditCapability,
  READY_CANVAS_IMAGE_EDIT_CAPABILITIES,
  IDEOGRAM_EDIT_QUALITY_OPTIONS,
} from '@/constants/canvas-image-edit-capabilities'
import { canvasCapabilityRuntime } from '@/lib/canvas-capability-runtime'
import { EDIT_MODELS } from '@/constants/edit-tasks'
import { getCapabilityConfig } from '@/constants/provider-capabilities'
import {
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  StudioToolPopoverContent,
  studioOutlineChipClass,
  studioOutlineChipOpenClass,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { ImageEditOptionsSchema, type ImageEditOptions } from '@/types'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import type { ObjectReplaceAnnotation } from '@/types'
import type {
  CanvasDerivedImageOutput,
  ReadyCanvasImageEditCapabilityId,
} from '@/types/canvas-image-edit'

/**
 * 图片编辑的**共用躯干** —— 画布的弹窗和工作台的舞台共用这一份。
 *
 * 施工基准 `docs/references/pages/studio-image-edit.md`：owner 2026-08-18 定
 * 「工作台先做好，画布再对齐工作台」，所以能力的跑法、状态、面板、**以及布局**
 * 都只有一份，宿主之间只剩一处差别 —— **结果落哪儿**（`onApplied`）。
 *
 * ⚠ 2026-08-19 E5：这里曾经有 `layout: 'dialog' | 'stage'` 两套排布（弹窗走
 * 248px 竖 rail，舞台走顶部横标签）。那本身就是 E5 验收里要消灭的「两套实现」
 * —— 同一份能力清单渲染两遍、改一处要记得改另一处。删掉竖 rail 那套，画布弹
 * 窗跟着用横标签，顺带把 248px 还给图。
 *
 * ⛔ 本组件不认识画布节点，也不认识工作台的参考图槽位。它只知道「一张源图」
 * 和「跑完把 outputs 交出去」。
 */

type TargetScale = '2x' | '4x'

// 六项在同一个菜单里，⛔ 两项共用一个字形（整图修改与物体替换以前都是 Replace）。
const TASK_ICONS = {
  'edit-image': WandSparkles,
  upscale: Sparkles,
  'remove-background': Eraser,
  inpaint: Paintbrush,
  'extract-element': Scissors,
  'object-replace': SquareDashed,
} as const satisfies Record<ReadyCanvasImageEditCapabilityId, typeof Sparkles>

const EXTRACT_PRESETS = [
  { key: 'clothing', prompt: 'clothing', invert: false },
  { key: 'person', prompt: 'person', invert: false },
  { key: 'hair', prompt: 'hair', invert: false },
  { key: 'accessory', prompt: 'accessories', invert: false },
  { key: 'background', prompt: 'person', invert: true },
] as const

/**
 * 兜底边长。只有「既没量到、字段又缺」时才会用上，等于承认自己不知道 ——
 * 一旦真走到这里，蒙版尺寸就必然和源图对不上。
 */
const UNKNOWN_SOURCE_DIMENSION = 1024

/**
 * ⚠ **量到的优先于字段**，和 `LooseImageCard` 的取值顺序**故意相反**：那边这
 * 两个数只用来显示一行 `W × H`，这里却要拿去定蒙版画布的边长。蒙版必须贴合
 * provider 真正抓到的那张位图，所以位图的实测尺寸才是事实源，元数据是备份。
 */
function resolveSourceDimension(
  measured: number | undefined,
  declared: number | undefined,
): number {
  if (measured !== undefined && measured > 0) return Math.round(measured)
  if (declared !== undefined && Number.isFinite(declared) && declared > 0)
    return Math.round(declared)
  return UNKNOWN_SOURCE_DIMENSION
}

function getDefaultModelId(
  capabilityId: ReadyCanvasImageEditCapabilityId,
): string {
  return getCanvasImageEditCapability(capabilityId).defaultModelId ?? ''
}

export interface ImageEditSurfaceProps {
  sourceUrl: string
  /** 源图对应的 generation，用于给结果记血缘。没有就是外部图。 */
  sourceGenerationId?: string
  /** 元数据里声明的尺寸。⚠ 只是备份，实测赢过它。 */
  declaredWidth?: number
  declaredHeight?: number
  defaultTask?: ReadyCanvasImageEditCapabilityId
  /**
   * 结果落哪儿由宿主决定：画布落派生节点，工作台就地替换参考图槽位。
   * 返回 `false` 表示没落成，躯干会弹失败文案并把这一轮记为失败。
   *
   * `summary` = 这一步**做了什么**的一句话（重绘的提示词 / 注释清单 / 放大倍
   * 率…）。⚠ 没有它，编辑历史就只剩一串图，用户回退时认不出「第三次」是哪次
   * —— 而 E4 的验收正是「改五次能回到第三次」。画布宿主用不上，忽略即可。
   */
  onApplied: (outputs: CanvasDerivedImageOutput[], summary: string) => boolean
  /**
   * 运行结果回传给宿主（画布要把它写到节点状态上）。
   *
   * ⚠ 必须是三态，不能只回「跑没跑」：失败也会走到「不跑了」，只传布尔会让
   * 宿主把失败标成成功。
   */
  onRunStateChange?: (state: 'running' | 'success' | 'error') => void
  /** 取消/返回。`dialog` 用它关弹窗，`stage` 用它回结果区。 */
  onCancel?: () => void
  composerContainer?: HTMLElement | null
  active?: boolean
  /**
   * 上一步的图（宿主有编辑历史时给）。放大 / 修图这两样的结果用前后对比展示
   * （动效样片 W）：左右拖分隔线看改了什么。⛔ 局部重绘 / 物体替换那两块画布不换。
   */
  compareFromUrl?: string | null
}

export function ImageEditSurface({
  sourceUrl,
  sourceGenerationId,
  declaredWidth,
  declaredHeight,
  defaultTask = 'upscale',
  onApplied,
  onRunStateChange,
  onCancel,
  composerContainer,
  active = true,
  compareFromUrl = null,
}: ImageEditSurfaceProps) {
  const t = useTranslations('StudioImageEdit')
  const tAdvanced = useTranslations('AdvancedSettings')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])
  const [activeTask, setActiveTask] =
    useState<ReadyCanvasImageEditCapabilityId>(defaultTask)
  const [runningTask, setRunningTask] =
    useState<ReadyCanvasImageEditCapabilityId | null>(null)
  const [targetScale, setTargetScale] = useState<TargetScale>('4x')
  const [selectedModels, setSelectedModels] = useState<
    Partial<Record<ReadyCanvasImageEditCapabilityId, string>>
  >({})
  const [optionsByTask, setOptionsByTask] = useState<
    Partial<Record<ReadyCanvasImageEditCapabilityId, ImageEditOptions>>
  >({})
  const editOptions = useMemo(
    () => optionsByTask[activeTask] ?? {},
    [activeTask, optionsByTask],
  )
  const setEditOptions = (options: ImageEditOptions) =>
    setOptionsByTask((current) => ({ ...current, [activeTask]: options }))
  const [selectedOptionIds, setSelectedOptionIds] = useState<
    Partial<Record<ReadyCanvasImageEditCapabilityId, string>>
  >({})
  const [quickSetup, setQuickSetup] = useState<StudioModelOption | null>(null)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [prompts, setPrompts] = useState<
    Partial<Record<ReadyCanvasImageEditCapabilityId, string>>
  >({})
  const [maskDraft, setMaskDraft] = useState<InpaintMaskDraft | null>(null)
  const [annotations, setAnnotations] = useState<DraftAnnotation[]>([])
  const [draftSource, setDraftSource] = useState(sourceUrl)
  if (draftSource !== sourceUrl) {
    setDraftSource(sourceUrl)
    setMaskDraft(null)
    setAnnotations([])
  }
  const sourceRef = useRef(sourceUrl)
  sourceRef.current = sourceUrl

  const activeCapability = getCanvasImageEditCapability(activeTask)
  const selectedModelId =
    selectedModels[activeTask] ?? getDefaultModelId(activeTask)
  const modelOptions = useImageEditModelOptions(activeCapability.models)
  const { hasLoaded: keysLoaded } = useApiKeysContext()
  const selectedOption =
    modelOptions.find(
      (option) =>
        option.modelId === selectedModelId &&
        option.optionId === selectedOptionIds[activeTask],
    ) ?? modelOptions.find((option) => option.modelId === selectedModelId)
  const providerKeyId = selectedOption?.keyId ?? selectedOption?.providerKeyId
  const [extractPrompt, setExtractPrompt] = useState('clothing')
  const [extractInvert, setExtractInvert] = useState(false)
  const [extractPreset, setExtractPreset] = useState<string | null>('clothing')
  const [measuredSource, setMeasuredSource] = useState<{
    width: number
    height: number
  } | null>(null)
  const runningRef = useRef(false)

  const sourceWidth = resolveSourceDimension(
    measuredSource?.width,
    declaredWidth,
  )
  const sourceHeight = resolveSourceDimension(
    measuredSource?.height,
    declaredHeight,
  )
  const isRunning = runningTask !== null

  useEffect(() => {
    setActiveTask(defaultTask)
  }, [defaultTask])

  // 量一次源图的真实边长。⚠ 不能蹭渲染出来的 <img> 的 `naturalWidth`：局部重绘
  // 面板压根不渲染 <img>，而它恰恰是最需要真尺寸的那一条 —— 蒙版按 1024×1024
  // 建、源图却是 1672×941 时，FLUX Fill 直接 500（2026-08-18 E0 实测）。
  // 跨域也没关系，读尺寸不需要 CORS。
  useEffect(() => {
    setMeasuredSource(null)
    if (!sourceUrl) return

    let cancelled = false
    const probe = new Image()
    probe.onload = () => {
      if (cancelled) return
      if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        setMeasuredSource({
          width: probe.naturalWidth,
          height: probe.naturalHeight,
        })
      }
    }
    probe.src = sourceUrl

    return () => {
      cancelled = true
      probe.onload = null
    }
  }, [sourceUrl])

  const runExclusive = useCallback(
    async (
      task: ReadyCanvasImageEditCapabilityId,
      fallbackMessage: string,
      operation: () => Promise<boolean>,
    ) => {
      if (runningRef.current || !sourceUrl || !active) return
      if (!selectedOption) return
      // key 名单没回来 = 不知道缺不缺：照常跑，服务端按 adapter 找这位用户的 key
      // （已无平台 key 兜底，真缺只会报错、不会花钱）。⛔ 别把有 key 的人弹进 QuickSetup。
      if (isMissingKeyModelOption(selectedOption, keysLoaded)) {
        setQuickSetup(selectedOption)
        return
      }

      abortRef.current = new AbortController()
      setPreviewUrl(null)
      runningRef.current = true
      setRunningTask(task)
      onRunStateChange?.('running')
      try {
        const succeeded = await operation()
        onRunStateChange?.(succeeded ? 'success' : 'error')
      } catch (error) {
        logger.error('[image-edit] task failed', { task, error })
        toast.error(fallbackMessage)
        onRunStateChange?.('error')
      } finally {
        runningRef.current = false
        setRunningTask(null)
        setPreviewUrl(null)
      }
    },
    [active, keysLoaded, onRunStateChange, selectedOption, sourceUrl],
  )

  const target = useMemo(
    () => ({ sourceUrl, sourceGenerationId, sourceWidth, sourceHeight }),
    [sourceGenerationId, sourceHeight, sourceUrl, sourceWidth],
  )

  const runCapability = useCallback(
    async (
      request: Parameters<typeof canvasCapabilityRuntime.run>[0],
      fallbackMessage: string,
      summary: string,
    ): Promise<boolean> => {
      const response = await canvasCapabilityRuntime.run(request)
      if (
        sourceRef.current !== request.target.sourceUrl ||
        abortRef.current?.signal.aborted
      )
        return false
      if (!response.success || response.outputs.length === 0) {
        toast.error(response.error || fallbackMessage)
        return false
      }
      const outputs = response.outputs.map((output) => ({
        ...output,
        label: output.label ?? t(`tasks.${request.capability}.label`),
      }))
      if (!onApplied(outputs, summary)) {
        toast.error(fallbackMessage)
        return false
      }
      if (response.saveWarning) {
        toast.warning(t('extract.success'), {
          description: t('extract.saveFailed'),
        })
      }
      return true
    },
    [onApplied, t],
  )

  const runUpscale = useCallback(() => {
    void runExclusive('upscale', t('editFailed'), async () => {
      if (
        !(await runCapability(
          {
            capability: 'upscale',
            target,
            targetScale,
            modelId: getDefaultModelId('upscale'),
          },
          t('editFailed'),
          `${t('actions.upscale')} ${targetScale}`,
        ))
      )
        return false
      toast.success(t('success.upscale'))
      return true
    })
  }, [runCapability, runExclusive, t, target, targetScale])

  const runRemoveBackground = useCallback(() => {
    void runExclusive('remove-background', t('editFailed'), async () => {
      if (
        !(await runCapability(
          {
            capability: 'remove-background',
            target,
            modelId: getDefaultModelId('remove-background'),
          },
          t('editFailed'),
          t('actions.removeBg'),
        ))
      )
        return false
      toast.success(t('success.removeBg'))
      return true
    })
  }, [runCapability, runExclusive, t, target])

  const runExtractElement = useCallback(() => {
    const prompt = extractPrompt.trim()
    if (!prompt) return

    void runExclusive('extract-element', t('extractFailed'), async () => {
      const response = await canvasCapabilityRuntime.run({
        capability: 'extract-element',
        target,
        prompt,
        invert: extractInvert,
        modelId:
          selectedModels['extract-element'] ??
          getDefaultModelId('extract-element'),
      })
      if (
        sourceRef.current !== target.sourceUrl ||
        abortRef.current?.signal.aborted
      )
        return false
      if (!response.success || response.outputs.length === 0) {
        toast.error(response.error || t('extractFailed'))
        return false
      }
      if (!onApplied(response.outputs, prompt)) {
        toast.error(t('extractFailed'))
        return false
      }

      if (response.saveWarning) {
        logger.warn('[image-edit] extracted element save failed')
        toast.warning(t('extract.success'), {
          description: t('extract.saveFailed'),
        })
        // 落点已经成功 —— 存素材失败不算整轮失败。
        return true
      }
      toast.success(t('extract.success'))
      return true
    })
  }, [
    extractInvert,
    extractPrompt,
    onApplied,
    runExclusive,
    t,
    target,
    selectedModels,
  ])

  const applyInpaint = useCallback(
    (maskDataUrl: string, prompt: string) => {
      void runExclusive('inpaint', t('editFailed'), async () => {
        if (
          !(await runCapability(
            {
              capability: 'inpaint',
              target,
              maskImageUrl: maskDataUrl,
              prompt,
              modelId: selectedModels.inpaint ?? getDefaultModelId('inpaint'),
              options: editOptions,
              providerKeyId,
              onPreview: setPreviewUrl,
              signal: abortRef.current?.signal,
            },
            t('editFailed'),
            prompt,
          ))
        )
          return false
        toast.success(t('savedToGallery'))
        return true
      })
    },
    [
      runCapability,
      runExclusive,
      t,
      target,
      selectedModels,
      editOptions,
      providerKeyId,
    ],
  )

  const applyAnnotations = useCallback(
    (annotations: ObjectReplaceAnnotation[]) => {
      void runExclusive('object-replace', t('editFailed'), async () => {
        if (
          !(await runCapability(
            {
              capability: 'object-replace',
              target,
              annotations,
              modelId:
                selectedModels['object-replace'] ??
                getDefaultModelId('object-replace'),
              options: editOptions,
              providerKeyId,
              onPreview: setPreviewUrl,
              signal: abortRef.current?.signal,
            },
            t('editFailed'),
            annotations.map((item) => item.instruction).join(' · '),
          ))
        )
          return false
        toast.success(t('savedToGallery'))
        return true
      })
    },
    [
      runCapability,
      runExclusive,
      t,
      target,
      selectedModels,
      editOptions,
      providerKeyId,
    ],
  )

  const setPrompt = (value: string) =>
    setPrompts((current) => ({ ...current, [activeTask]: value }))
  const prompt = prompts[activeTask] ?? ''
  const runEditImage = () => {
    if (!prompt.trim()) return
    void runExclusive('edit-image', t('editFailed'), async () => {
      const succeeded = await runCapability(
        {
          capability: 'edit-image',
          target,
          prompt: prompt.trim(),
          modelId: selectedModelId,
          options: editOptions,
          providerKeyId,
          onPreview: setPreviewUrl,
          signal: abortRef.current?.signal,
        },
        t('editFailed'),
        prompt.trim(),
      )
      if (succeeded) toast.success(t('savedToGallery'))
      return succeeded
    })
  }
  const chooseModel = (option: StudioModelOption) => {
    setSelectedModels((current) => ({
      ...current,
      [activeTask]: option.modelId,
    }))
    setSelectedOptionIds((current) => ({
      ...current,
      [activeTask]: option.optionId,
    }))
    setEditOptions({})
  }
  // 主三项在前，其余在后 —— 一个菜单列完（owner 2026-10-03：页签 + 「更多工具」
  // 收成输入框里一颗「任务 ▾」，与模型、生成键同一行）。
  const mainTaskIds: readonly ReadyCanvasImageEditCapabilityId[] = [
    'edit-image',
    'inpaint',
    'object-replace',
  ]
  const orderedTasks = [
    ...READY_CANVAS_IMAGE_EDIT_CAPABILITIES.filter((item) =>
      mainTaskIds.includes(item.id),
    ),
    ...READY_CANVAS_IMAGE_EDIT_CAPABILITIES.filter(
      (item) => !mainTaskIds.includes(item.id),
    ),
  ]
  const ActiveTaskIcon = TASK_ICONS[activeTask]
  const tasks = (
    <StudioToolSurface open={tasksOpen} onOpenChange={setTasksOpen}>
      <StudioToolSurfaceTrigger asChild>
        <button
          type="button"
          disabled={isRunning}
          aria-label={`${t('toolsTitle')} · ${t(`tasks.${activeTask}.label`)}`}
          aria-haspopup="dialog"
          data-testid="image-edit-task-chip"
          data-active={tasksOpen || undefined}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border pl-2.5 pr-2 text-2sm font-medium text-foreground transition-colors duration-fast ease-standard hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[active=true]:border-foreground data-[active=true]:ring-3 data-[active=true]:ring-muted motion-reduce:transition-none"
        >
          <ActiveTaskIcon className="size-4 shrink-0" aria-hidden />
          {t(`tasks.${activeTask}.label`)}
          <ChevronDown
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </button>
      </StudioToolSurfaceTrigger>
      <StudioToolPopoverContent
        size="small"
        label={t('toolsTitle')}
        side="top"
        align="start"
        className="w-64 p-1.5"
      >
        <div role="menu" aria-label={t('toolsTitle')} className="flex flex-col">
          {orderedTasks.map((item, index) => {
            const Icon = TASK_ICONS[item.id]
            const selected = activeTask === item.id
            return (
              <div key={item.id} className="contents">
                {index === mainTaskIds.length ? (
                  <div className="mx-2 my-1 h-px bg-border/60" aria-hidden />
                ) : null}
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  disabled={isRunning}
                  onClick={() => {
                    setActiveTask(item.id)
                    setTasksOpen(false)
                  }}
                  className="flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11 motion-reduce:transition-none"
                >
                  <Icon
                    className="size-4 shrink-0 text-foreground/75"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {t(`tasks.${item.id}.label`)}
                  </span>
                  {selected ? (
                    <Check className="size-4 shrink-0" aria-hidden />
                  ) : null}
                </button>
              </div>
            )
          })}
        </div>
      </StudioToolPopoverContent>
    </StudioToolSurface>
  )
  const generativeEdit =
    activeTask === 'edit-image' ||
    activeTask === 'inpaint' ||
    activeTask === 'object-replace'
  const config = selectedOption
    ? getCapabilityConfig(selectedOption.adapterType, selectedModelId)
    : null
  const qualityOptions =
    selectedModelId === AI_MODELS.IDEOGRAM_45
      ? IDEOGRAM_EDIT_QUALITY_OPTIONS
      : config?.qualityOptions
  const hasOptions =
    generativeEdit &&
    Boolean(
      qualityOptions?.length ||
      config?.backgroundOptions?.length ||
      config?.capabilities.includes('preview'),
    )
  const imagePrice = generativeEdit
    ? getImageUnitPrice(selectedModelId, {
        quality: editOptions.quality,
        hasReferenceImage: true,
      })
    : null
  const optionLabel = (kind: 'quality' | 'background', value: string) =>
    kind === 'quality' && selectedModelId === AI_MODELS.IDEOGRAM_45
      ? t(`quality.${value}`)
      : tAdvanced(`${kind}Option.${value}`)
  const settingRows = (['quality', 'background'] as const).flatMap((kind) => {
    const options =
      kind === 'quality' ? qualityOptions : config?.backgroundOptions
    if (!options?.length) return []
    return [{ kind, options, selected: editOptions[kind] ?? options[0]! }]
  })
  /** 设置那颗写「画质 高 · 透明底 · 预览」—— 改了什么一眼看见，⛔ 只写「编辑设置」。 */
  const settingsSummary = [
    ...settingRows.map(({ kind, selected }) =>
      kind === 'quality'
        ? `${tAdvanced('quality')} ${optionLabel(kind, selected)}`
        : optionLabel(kind, selected),
    ),
    ...(editOptions.preview ? [tAdvanced('preview')] : []),
  ].join(' · ')
  const settings = (
    <>
      {activeTask === 'upscale' ? (
        <ModelChip
          modelLabel={targetScale === '2x' ? 'Clarity (2x)' : 'Aura SR (4x)'}
          showChevron={false}
          disabled={isRunning}
        />
      ) : (
        // 去背景 / 提取元素也用同一颗模型胶囊（标签台 A 编辑台统一，owner 2026-10-09），
        // ⛔ 不再是系统下拉。
        <ModelPickerPopover
          options={modelOptions}
          value={selectedOption?.optionId ?? null}
          onChange={chooseModel}
          labelForOption={(option) =>
            EDIT_MODELS[option.modelId]?.displayName ?? option.modelId
          }
          memoryScope={`edit:${activeTask}`}
          disabled={isRunning}
          side="top"
        />
      )}
      {hasOptions ? (
        <StudioToolSurface>
          <StudioToolSurfaceTrigger asChild>
            <button
              type="button"
              disabled={isRunning}
              aria-label={t('settingsLabel')}
              className="inline-flex h-8 min-w-0 shrink items-center gap-1.5 rounded-full px-2.5 text-2sm text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-muted data-[state=open]:text-foreground"
            >
              <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{settingsSummary}</span>
            </button>
          </StudioToolSurfaceTrigger>
          <StudioToolPopoverContent
            size="action"
            label={t('settingsLabel')}
            side="top"
            align="start"
            className="flex flex-col gap-1 overflow-y-auto p-3"
          >
            {/* 编辑设置 = 「专属」同一种排法（A1）：一行一个参数，名字在左、分段条在右。 */}
            <div className="flex items-baseline gap-2 pb-1">
              <span className="text-2xs font-semibold">
                {t('settingsLabel')}
              </span>
              <span className="truncate text-3xs text-muted-foreground">
                {EDIT_MODELS[selectedModelId]?.displayName ?? selectedModelId}
              </span>
            </div>
            {settingRows.map(({ kind, options, selected }) => (
              <div
                key={kind}
                className="grid min-h-9 grid-cols-[5rem_1fr] items-center gap-3"
              >
                <span className="text-2xs">{tAdvanced(kind)}</span>
                <LiquidSegmented
                  ariaLabel={tAdvanced(kind)}
                  disabled={isRunning}
                  semantics="radio"
                  size="xs"
                  fill
                  value={selected}
                  items={options.map((value) => ({
                    value,
                    label: optionLabel(kind, value),
                  }))}
                  onChange={(value) => {
                    const parsed = ImageEditOptionsSchema.safeParse({
                      ...editOptions,
                      [kind]: value,
                    })
                    if (parsed.success) setEditOptions(parsed.data)
                  }}
                />
              </div>
            ))}
            {config?.capabilities.includes('preview') ? (
              <label className="flex min-h-9 items-center justify-between gap-2 text-2xs">
                {tAdvanced('preview')}
                <Switch
                  disabled={isRunning}
                  checked={editOptions.preview ?? false}
                  onCheckedChange={(preview) =>
                    setEditOptions({ ...editOptions, preview })
                  }
                />
              </label>
            ) : null}
          </StudioToolPopoverContent>
        </StudioToolSurface>
      ) : null}
      {imagePrice !== null ? (
        <span className="text-xs text-muted-foreground">
          {t('pricePerImage', { amount: formatUnitPriceAmount(imagePrice) })}
        </span>
      ) : null}
    </>
  )
  const renderComposer = (controls: ImageEditComposerControls) => {
    if (!active) return null
    const composer = (
      <ImageEditComposer
        controls={{
          ...controls,
          canSubmit: controls.canSubmit && Boolean(sourceUrl),
        }}
        tasks={tasks}
        settings={settings}
        isRunning={isRunning}
      />
    )
    return composerContainer === undefined ? (
      <div className="mt-4 border-t border-border pt-4">{composer}</div>
    ) : composerContainer ? (
      createPortal(composer, composerContainer)
    ) : null
  }
  const promptInput = (
    <Textarea
      aria-label={t('editPromptLabel')}
      value={prompt}
      disabled={isRunning}
      maxLength={500}
      onChange={(event) => setPrompt(event.target.value)}
      placeholder={t('editPromptPlaceholder')}
      className="field-sizing-content min-h-10 max-h-36 resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
    />
  )
  // 源图：按舞台给的高度上限等比放下（`.studio-edit-media`，与局部重绘 / 物体替换
  // 同一个上限 —— 换任务时图不再忽大忽小），⛔ 不再垫一块灰底、不写「源图 · 尺寸」。
  const sourceFigure = (
    <figure className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
      {sourceUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sourceUrl}
          alt={t('sourceAlt')}
          className="studio-edit-media block max-w-full rounded-xl object-contain"
        />
      ) : (
        <p className="flex min-h-48 items-center text-sm text-muted-foreground">
          {t('emptySourceTitle')}
        </p>
      )}
    </figure>
  )
  const compareFigure =
    compareFromUrl && sourceUrl && compareFromUrl !== sourceUrl ? (
      <figure className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
        <ImageCompare
          beforeSrc={compareFromUrl}
          afterSrc={sourceUrl}
          beforeLabel={t('compareBefore')}
          afterLabel={t('compareAfter')}
          sliderLabel={t('compareSlider')}
          mediaClassName="studio-edit-media"
        />
      </figure>
    ) : (
      sourceFigure
    )
  const renderBody = () => {
    switch (activeTask) {
      case 'inpaint':
        return (
          <StudioInpaintEditor
            key={sourceUrl}
            imageUrl={sourceUrl}
            imageWidth={sourceWidth}
            imageHeight={sourceHeight}
            onApply={applyInpaint}
            onCancel={onCancel ?? (() => undefined)}
            isLoading={isRunning}
            prompt={prompt}
            onPromptChange={setPrompt}
            maskDraft={maskDraft}
            onMaskChange={setMaskDraft}
            renderComposer={renderComposer}
          />
        )
      case 'object-replace':
        return (
          <ImageAnnotationEditor
            key={sourceUrl}
            imageUrl={sourceUrl}
            onApply={applyAnnotations}
            onCancel={onCancel ?? (() => undefined)}
            isLoading={isRunning}
            annotations={annotations}
            onAnnotationsChange={setAnnotations}
            renderComposer={renderComposer}
          />
        )
      case 'edit-image':
        return (
          <>
            {compareFigure}
            {renderComposer({
              input: promptInput,
              canSubmit: Boolean(prompt.trim()),
              onSubmit: runEditImage,
              submitLabel: t('applyEdit'),
            })}
          </>
        )
      case 'upscale':
        return (
          <>
            {compareFigure}
            {renderComposer({
              input: (
                <LiquidSegmented
                  ariaLabel={t('upscale.scaleLabel')}
                  disabled={isRunning}
                  value={targetScale}
                  items={(['2x', '4x'] as const).map((value) => ({
                    value,
                    label: t(`upscale.scale${value}`),
                  }))}
                  onChange={setTargetScale}
                />
              ),
              canSubmit: true,
              onSubmit: runUpscale,
              submitLabel: t('actions.upscale'),
            })}
          </>
        )
      case 'remove-background':
        return (
          <>
            {sourceFigure}
            {renderComposer({
              input: null,
              canSubmit: true,
              onSubmit: runRemoveBackground,
              submitLabel: t('actions.removeBg'),
            })}
          </>
        )
      case 'extract-element':
        return (
          <>
            {sourceFigure}
            {renderComposer({
              input: (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {EXTRACT_PRESETS.map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        aria-pressed={extractPreset === preset.key}
                        disabled={isRunning}
                        onClick={() => {
                          setExtractPrompt(preset.prompt)
                          setExtractInvert(preset.invert)
                          setExtractPreset(preset.key)
                        }}
                        className={cn(
                          studioOutlineChipClass,
                          'h-7 px-2.5 text-2xs',
                          extractPreset === preset.key &&
                            studioOutlineChipOpenClass,
                        )}
                      >
                        {t(`extract.presets.${preset.key}`)}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    aria-label={t('extract.promptLabel')}
                    value={extractPrompt}
                    disabled={isRunning}
                    placeholder={t('extract.promptPlaceholder')}
                    className="min-h-16 max-h-36 resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
                    onChange={(event) => {
                      setExtractPrompt(event.target.value)
                      setExtractPreset(null)
                    }}
                  />
                  <label className="flex min-h-9 items-center gap-2 text-2xs text-muted-foreground">
                    <Switch
                      checked={extractInvert}
                      disabled={isRunning}
                      onCheckedChange={(invert) => {
                        setExtractInvert(invert)
                        setExtractPreset(null)
                      }}
                    />
                    {t('extract.invertLabel')}
                  </label>
                </div>
              ),
              canSubmit: Boolean(extractPrompt.trim()),
              onSubmit: runExtractElement,
              submitLabel: t('extract.run'),
            })}
          </>
        )
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {previewUrl && isRunning ? (
        <figure
          className="mb-3 flex min-h-0 flex-col items-center gap-2"
          aria-live="polite"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={tAdvanced('preview')}
            className="max-h-64 max-w-full rounded-lg object-contain"
          />
          <figcaption className="text-xs text-muted-foreground">
            {tAdvanced('preview')}
          </figcaption>
        </figure>
      ) : null}
      {renderBody()}
      {active && quickSetup ? (
        <QuickSetupDialog
          open
          onOpenChange={(open) => {
            if (!open) setQuickSetup(null)
          }}
          modelId={quickSetup.modelId}
          modelLabel={
            EDIT_MODELS[quickSetup.modelId]?.displayName ?? quickSetup.modelId
          }
          adapterType={quickSetup.adapterType}
          optionId={quickSetup.optionId}
          selectStudioModel={false}
          onVerified={(modelId, keyId) => {
            setSelectedModels((current) => ({
              ...current,
              [activeTask]: modelId,
            }))
            setSelectedOptionIds((current) => ({
              ...current,
              [activeTask]: `key:${keyId}`,
            }))
          }}
        />
      ) : null}
    </div>
  )
}
