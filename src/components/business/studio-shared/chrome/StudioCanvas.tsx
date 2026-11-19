'use client'

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useStudioRunModels } from '@/hooks/use-studio-run-models'
import { useStudioVideoAssets } from '@/hooks/use-studio-video-assets'
import { useReferenceReceiverNotice } from '@/hooks/use-reference-receiver-notice'
import { useIsMobile } from '@/hooks/use-mobile'
import { startImageRecipeImport } from '@/hooks/use-image-recipe-import'
import { ASSISTANT_ROUTE_ERROR_CODES } from '@/constants/assistant-operator'
import { promptCreatePath } from '@/constants/routes'
import {
  STUDIO_GENERATION_DRAG_MIME,
  type StudioKeepChangeDimension,
} from '@/constants/studio'
import { usePathname, useRouter } from '@/i18n/navigation'
import { landRecipeInComposer } from '@/lib/studio-workbench-motion'
import { fetchGenerationByIdAPI } from '@/lib/api-client'
import {
  buildStudioRemixPreset,
  getGenerationRemixCharacters,
} from '@/lib/studio-remix'
import { evaluateGenerationAPI } from '@/lib/api-client/generation'
import { getApiErrorMessage } from '@/lib/api-error-message'
import {
  assistantKeySetupForError,
  assistantKeySetupOptionId,
  type AssistantKeySetupTarget,
} from '@/lib/assistant-key-setup'
import { focusStudioPrompt } from '@/lib/focus-studio-prompt'
import { resolveReferenceRailSlot } from '@/lib/studio/reference-rail-slot'
import {
  isStudioResultInWorkspace,
  studioRunForWorkspace,
} from '@/lib/studio-operator-result-run'
import { cn } from '@/lib/utils'
import { searchGroundingForRun } from '@/lib/search-grounding'
import { resolveStudioVideoStageItem } from '@/lib/studio-video-stage'
import type { CharacterImagePick, GenerationRecord } from '@/types'
import { findLook } from '@/lib/card-bus'

import { Wand2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { DropOverlay } from '@/components/ui/drop-overlay'
import { ImageRecipeImportDialog } from '@/components/business/studio-shared/image-recipe/ImageRecipeImportDialog'
import { CompareGrid } from '@/features/studio'
import { SearchGroundingRail } from '@/components/business/studio-shared/search-grounding/SearchGroundingRail'
import { StudioReferenceRail } from '@/components/business/studio-shared/chrome/StudioReferenceRail'
import { StudioVideoQueueStrip } from '@/components/business/studio-shared/chrome/StudioVideoQueueStrip'
import { GenerationPreview } from '@/features/studio'
import {
  StudioResultFeedback,
  type StudioSatisfiedStatus,
} from '@/features/studio'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { type StudioImageEditTarget } from '@/components/business/studio-shared/editor/StudioImageEditStage'
import { useErrorText } from '@/hooks/use-error-text'

/**
 * StudioCanvas — central hero area for the canvas-centric layout.
 * Fills all vertical space between TopBar and BottomDock.
 * Delegates rendering to GenerationPreview (empty / loading / image / error).
 * Accepts gallery image drops — adds as reference and opens the ref panel.
 */
/** 结果下方偏差标签 → 「优化生成」里要改的那一维。 */
const FEEDBACK_TAG_DIMENSION: Partial<
  Record<string, StudioKeepChangeDimension>
> = {
  subject_mismatch: 'subject',
  style_mismatch: 'style',
  composition_mismatch: 'composition',
  lighting_issue: 'lighting',
}

/** 舞台正在被拖什么：画廊的图（加参考图）/ 电脑里的图（从图读串）。 */
type CanvasDropKind = 'reference' | 'recipe' | null

/** `STUDIO_GENERATION_DRAG_MIME` 的内容是 `{ url, id }` 的 JSON；坏数据当没拖。 */
function parseGenerationDragUrl(raw: string): string | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'url' in parsed &&
      typeof parsed.url === 'string'
    ) {
      return parsed.url
    }
  } catch {
    // 坏数据
  }
  return null
}

interface StudioCanvasProps {
  /**
   * 舞台顶部那条参考轨。底部输入框布局（owner 2026-09-26）传 `false`：参考图
   * 只住在输入框的附件行里，舞台只放结果；「编辑这张」挪到下方放大图底下，
   * 「只发给谁」那句挪到附件行下面。
   */
  referenceRail?: boolean
  /** 挂在根上的额外类（舞台面板收起、结果回来时那一下淡入）。 */
  className?: string
  onEdit?: (target: StudioImageEditTarget) => void
}

export const StudioCanvas = memo(function StudioCanvas({
  referenceRail = true,
  className,
  onEdit,
}: StudioCanvasProps) {
  const { state, dispatch } = useStudioForm()
  const { imageUpload, characters } = useStudioData()
  const {
    lastGeneration: rawLastGeneration,
    error: rawRunError,
    retry,
    activeRun: rawActiveRun,
    selectWinner,
    lastEvaluation,
    setLastEvaluation,
    isGenerating: rawIsGenerating,
    elapsedSeconds,
    retryVideoQueueItem,
    retryRunItem,
    cancelRunItem,
    cancelAllRunItems,
  } = useStudioGen()
  const tErrors = useTranslations('Errors')
  const tRemix = useTranslations('StudioV3')
  const tEdit = useTranslations('StudioImageEdit')
  const tVideo = useTranslations('VideoGenerate')
  const tSlots = useTranslations('StudioVideoSlots')
  const tImageChip = useTranslations('ImageChip')
  const tDrop = useTranslations('DropZone')
  const errText = useErrorText()
  const { modelOptions } = useImageModelOptions()
  // ⚠ **纯读**那颗（`useStudioGenerateAction` 带执行端副作用，结果区不能挂它）。
  const { runModels } = useStudioRunModels()
  const { send: videoSend } = useStudioVideoAssets()

  const lastGeneration =
    rawLastGeneration &&
    isStudioResultInWorkspace(
      rawLastGeneration.outputType,
      rawLastGeneration.model,
      state,
    )
      ? rawLastGeneration
      : null
  const activeRun = studioRunForWorkspace(rawActiveRun, state)
  const isCurrentRun = !rawActiveRun || activeRun !== null
  const isGenerating = rawIsGenerating && isCurrentRun
  const runError = isCurrentRun ? rawRunError : null
  const error = state.outputType === 'video' ? null : runError
  const lastGenerationRef = useRef<GenerationRecord | null>(null)

  useLayoutEffect(() => {
    lastGenerationRef.current = lastGeneration
  }, [lastGeneration])

  useEffect(() => {
    setLastEvaluation(null)
  }, [lastGeneration?.id, setLastEvaluation])

  /** 「满意」评估缺 key 时就地配的那一家（Hard Rule 8，与助手面板错误条同一个做法）。 */
  const [evaluationKeySetup, setEvaluationKeySetup] =
    useState<AssistantKeySetupTarget | null>(null)

  /** 「满意」那一单走到哪（按图记，换了一张就不算）；条子据此说「在打分 / 没成功」。 */
  const [satisfied, setSatisfied] = useState<{
    generationId: string
    status: StudioSatisfiedStatus
  } | null>(null)
  const satisfiedStatus: StudioSatisfiedStatus =
    satisfied && satisfied.generationId === lastGeneration?.id
      ? satisfied.status
      : 'idle'

  const evaluateSatisfied = useCallback(
    (requestedGenerationId: string) => {
      setSatisfied({
        generationId: requestedGenerationId,
        status: 'evaluating',
      })
      void evaluateGenerationAPI(requestedGenerationId).then((result) => {
        if (lastGenerationRef.current?.id !== requestedGenerationId) {
          return
        }

        if (result.success && result.data) {
          setSatisfied(null)
          setLastEvaluation(result.data)
          return
        }
        if (result.success) {
          setSatisfied({
            generationId: requestedGenerationId,
            status: 'failed',
          })
          return
        }
        /* ⭐ 缺 key：就地弹那一家的配置（一把都没有 → 免费档；选定的模型缺 key → 它那一家），
           配好接着评。⛔ 不跳 /settings/keys，⛔ 不悄悄换一家（owner 2026-10-15「全跟助手」）。 */
        const keySetup = assistantKeySetupForError(result)
        if (keySetup) {
          setSatisfied(null)
          setEvaluationKeySetup(keySetup)
          return
        }
        // 其余失败：条子上说「没成功」并给「重新打分」（⛔ 静默失败）。
        setSatisfied({ generationId: requestedGenerationId, status: 'failed' })
        /* 看不了图这类配 key 也解决不了的：照实说一句。 */
        if (
          result.errorCode &&
          ASSISTANT_ROUTE_ERROR_CODES.includes(result.errorCode)
        ) {
          toast.error(
            getApiErrorMessage(
              tErrors,
              result,
              errText.api(result, tErrors('assistant.modelKeyMissing')),
            ),
          )
        }
      })
    },
    [errText, setEvaluationKeySetup, setLastEvaluation, tErrors],
  )

  const handleFeedback = useCallback(
    (tags: string[]) => {
      if (!lastGeneration) return

      if (tags.includes('satisfied')) {
        if (lastEvaluation !== null || satisfiedStatus === 'evaluating') return
        evaluateSatisfied(lastGeneration.id)
        return
      }

      if (tags.length > 0) {
        // 点的是哪种偏差，「改变」一行就先勾上哪一维（11-19 走查）。
        dispatch({
          type: 'OPEN_KEEP_CHANGE',
          payload: tags.flatMap((tag) => {
            const dimension = FEEDBACK_TAG_DIMENSION[tag]
            return dimension ? [dimension] : []
          }),
        })
      }
    },
    [
      dispatch,
      evaluateSatisfied,
      lastEvaluation,
      lastGeneration,
      satisfiedStatus,
    ],
  )

  // ── 舞台接两种拖放（原生 HTML5）──
  // · 画廊 / 舞台上的图（`STUDIO_GENERATION_DRAG_MIME`）→ 加参考图。
  // · 电脑里的图 → 「从图读串」勾选框（owner 2026-10-25 C）；只图片台接，视频台不接。
  //   ⚠ 拖到输入框照旧是加参考图（那边自己接）。
  const [dropKind, setDropKind] = useState<CanvasDropKind>(null)
  const dragDepthRef = useRef(0)
  const readsRecipeOnDrop = state.outputType === 'image'

  const dropKindFor = useCallback(
    (data: DataTransfer | null): CanvasDropKind => {
      const types = Array.from(data?.types ?? [])
      if (types.includes(STUDIO_GENERATION_DRAG_MIME)) return 'reference'
      if (readsRecipeOnDrop && types.includes('Files')) return 'recipe'
      return null
    },
    [readsRecipeOnDrop],
  )

  const resetDrop = useCallback(() => {
    dragDepthRef.current = 0
    setDropKind(null)
  }, [])

  // 拖到别处松手 / 按 Esc 取消时舞台收不到 dragleave 的兜底。
  useEffect(() => {
    if (!dropKind) return
    window.addEventListener('drop', resetDrop)
    window.addEventListener('dragend', resetDrop)
    return () => {
      window.removeEventListener('drop', resetDrop)
      window.removeEventListener('dragend', resetDrop)
    }
  }, [dropKind, resetDrop])

  const handleCanvasDragEnter = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const kind = dropKindFor(event.dataTransfer)
      if (!kind) return
      event.preventDefault()
      dragDepthRef.current += 1
      setDropKind(kind)
    },
    [dropKindFor],
  )

  const handleCanvasDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!dropKindFor(event.dataTransfer)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    },
    [dropKindFor],
  )

  const handleCanvasDragLeave = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!dropKindFor(event.dataTransfer)) return
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) setDropKind(null)
    },
    [dropKindFor],
  )

  const handleCanvasDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const kind = dropKindFor(event.dataTransfer)
      resetDrop()
      // 里面的格子自己接住了（preventDefault 过）就不再处理一遍。
      if (!kind || event.defaultPrevented) return
      event.preventDefault()
      if (kind === 'reference') {
        const url = parseGenerationDragUrl(
          event.dataTransfer.getData(STUDIO_GENERATION_DRAG_MIME),
        )
        if (url) {
          void imageUpload.addFromUrl(url).then(() => {
            focusStudioPrompt()
          })
        }
        return
      }
      const file = Array.from(event.dataTransfer.files).find((item) =>
        item.type.startsWith('image/'),
      )
      if (file) startImageRecipeImport(file)
    },
    [dropKindFor, imageUpload, resetDrop],
  )

  const handleUseAsReference = useCallback(
    async (url: string) => {
      await imageUpload.addFromUrl(url)
      focusStudioPrompt()
    },
    [imageUpload],
  )

  /** 重混把当时在场的角色挂回去（快照记的 id + 造型；旧作品按编译前缀里的 `@handle` 认）。 */
  const {
    cards: characterCards,
    findCard: findCharacterCard,
    setActiveCardIds,
    setImagePicks,
    setLookId,
  } = characters
  const restoreRemixCharacters = useCallback(
    (generation: GenerationRecord) => {
      const remix = getGenerationRemixCharacters(generation)
      const cards: {
        id: string
        lookId?: string
        imagePicks?: CharacterImagePick[]
      }[] =
        remix.kind === 'ids'
          ? remix.cards.filter((card) => findCharacterCard(card.id))
          : remix.handles.flatMap((handle) => {
              const card = characterCards.find((item) => item.handle === handle)
              return card ? [{ id: card.id }] : []
            })
      // 当时没带角色（或角色已删）就不动台上的选择。
      if (cards.length === 0) return
      setActiveCardIds(cards.map((card) => card.id))
      for (const entry of cards) {
        const record = findCharacterCard(entry.id)
        if (!record) continue
        const look = findLook(record, entry.lookId)
        // setLookId 会清掉她挑的图，所以先换造型再挂图。
        setLookId(entry.id, look.isDefault ? null : look.id)
        /**
         * 挂回当时勾的那几张（11-19 真机：只勾 1 张主图，重混成了这套全部 4 张 ——
         * 没有 picks 时工作台按「自动排满这套」算）。已不在这套里的卡图丢掉；
         * 快照没记（旧作品）或丢光了就只挂主图，⛔ 全选。
         */
        const recorded = (entry.imagePicks ?? []).filter(
          (pick) =>
            !('slotId' in pick) ||
            look.referenceSlots.some((slot) => slot.id === pick.slotId),
        )
        const primary =
          look.referenceSlots.find((slot) => slot.isPrimary) ??
          look.referenceSlots[0]
        const picks: CharacterImagePick[] = recorded.length
          ? recorded
          : primary
            ? [{ slotId: primary.id }]
            : []
        if (picks.length) setImagePicks(entry.id, picks)
      }
    },
    [
      characterCards,
      findCharacterCard,
      setActiveCardIds,
      setImagePicks,
      setLookId,
    ],
  )

  const applyRemix = useCallback(
    async (generation: GenerationRecord) => {
      // 结果卡 / 列表口的记录不带快照（单行能到 7 MB）—— 原话与角色在快照里，先取整行。
      let source = generation
      if (generation.snapshot === undefined) {
        const response = await fetchGenerationByIdAPI(generation.id)
        // 取不到整行就不回填半份（原话 / 角色 / 型号都可能是错的），说一句让用户再点。
        if (!response.success) {
          toast.error(tRemix('remixFailed'))
          return
        }
        source = response.data
      }
      const preset = buildStudioRemixPreset(source, modelOptions)
      // 目录里没有这张图的型号：保持当前选择并说出来（⛔ 悄悄换成同家别的型号）。
      if (!preset.optionId) toast(tRemix('remixModelMissing'))
      restoreRemixCharacters(source)
      // Preserve source outputType so remixing a video stays in that mode
      const sourceOutputType =
        generation.outputType === 'VIDEO' ? 'video' : 'image'
      dispatch({ type: 'SET_OUTPUT_TYPE', payload: sourceOutputType })
      dispatch({ type: 'SET_PROMPT', payload: preset.prompt })
      dispatch({ type: 'SET_ASPECT_RATIO', payload: preset.aspectRatio })
      dispatch({ type: 'CLOSE_ALL_PANELS' })
      if (preset.optionId) {
        dispatch({ type: 'SET_OPTION_ID', payload: preset.optionId })
      }
      if (
        preset.advancedParams &&
        Object.keys(preset.advancedParams).length > 0
      ) {
        dispatch({
          type: 'SET_ADVANCED_PARAMS',
          payload: preset.advancedParams,
        })
      }
      focusStudioPrompt()
      // 配方落进输入框：提示词由糊变清、卡顶一下（工作台原型「做同款」V 简化版）。
      window.requestAnimationFrame(landRecipeInComposer)
    },
    [dispatch, modelOptions, restoreRemixCharacters, tRemix],
  )
  /**
   * 正在取配方的那张（11-19 真机：点下去 5–8 秒没动静，用户以为没点上又点）。
   * 期间重混键转圈并禁用，同一时间只跑一次。
   */
  const [remixingId, setRemixingId] = useState<string | null>(null)
  const remixingRef = useRef(false)
  const handleRemix = useCallback(
    (generation: GenerationRecord) => {
      if (remixingRef.current) return
      remixingRef.current = true
      setRemixingId(generation.id)
      void applyRemix(generation).finally(() => {
        remixingRef.current = false
        setRemixingId(null)
      })
    },
    [applyRemix],
  )

  // Bootstrap remix from `/studio/<mode>?remix=<id>` — the /assets detail
  // sheet links here when the user clicks "Remix in Studio". We fetch
  // the full row (including snapshot, which the slim /api/images list
  // intentionally excludes) before invoking handleRemix, then strip the
  // query param so a refresh doesn't re-apply.
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const remixHandledRef = useRef<string | null>(null)
  useEffect(() => {
    const remixId = searchParams.get('remix')
    if (!remixId || remixHandledRef.current === remixId) return
    if (modelOptions.length === 0) return // wait until model list is ready
    remixHandledRef.current = remixId
    void (async () => {
      const response = await fetchGenerationByIdAPI(remixId)
      if (response.success) {
        handleRemix(response.data)
      }
      // Strip ?remix= so a refresh doesn't re-apply the preset.
      const params = new URLSearchParams(searchParams.toString())
      params.delete('remix')
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })()
  }, [searchParams, router, pathname, handleRemix, modelOptions.length])

  /**
   * 就地打开编辑态。
   *
   * ⚠ 这里以前是 `router.push(studioCanvasEditPath(...))` —— 把人从工作台踢到
   * 画布。owner 2026-08-18 定的方向正好相反（「让画布对齐 studio/image」），
   * 2026-08-18 的 E0 也查实那条跳转是当时唯一的编辑入口。
   */
  /**
   * 参考轨的当前槽位（owner 2026-08-23 拍板方向 A + B 的参考轨）。
   *
   * ⚠ 这里以前是 `findIndex(disabledReason === null)` —— 写死取第一条可用的槽，
   * 于是舞台上印着「参考图 1 / 2」却没有任何抵达第 2 张的路径。真机探针把它
   * 判为「有计数、无切换控件」。现在位置是状态，参考轨负责改它。
   *
   * 越界靠推导而不是 effect 同步：删掉最后一张时 `referenceEntries` 立刻变短，
   * 用 clamp 读能在同一帧就对，写回 state 会慢一帧、期间渲染的是空槽。
   */
  const [referenceCursor, setReferenceCursor] = useState(0)
  const referenceEntries = imageUpload.referenceEntries
  const activeReferenceIndex =
    referenceEntries.length === 0
      ? -1
      : Math.min(referenceCursor, referenceEntries.length - 1)
  const stageReference =
    activeReferenceIndex < 0
      ? null
      : {
          url: referenceEntries[activeReferenceIndex].url,
          referenceIndex: activeReferenceIndex,
          referenceTotal: referenceEntries.length,
        }
  /**
   * 视频台桌面（底部输入框）没有参考轨：素材在输入框里，舞台只放结果 ——
   * ⛔ 不把参考图铺上来，也没有「编辑这张」（那是图片的编辑入口）。
   */
  const videoWithoutRail = state.outputType === 'video' && !referenceRail
  /**
   * 队列里当前在播放器里看的那一条。null = 看最新结果（`lastGeneration`）。
   *
   * ⚠ 是**本地态**，不是 `selectedItemId` —— 后者是「定为最佳」，会落库
   * （`selectWinner` 走服务端）。浏览的代价不该等于提交的代价，图片图墙那边
   * 2026-08-23 已经为同一条理由把两者分开过一次。
   */
  const [focusedQueueItemId, setFocusedQueueItemId] = useState<string | null>(
    null,
  )
  /**
   * 视频台还没出过结果、挂了首帧：舞台把首帧当封面（有尾帧就缩在右下角）——
   * 看得见「视频从哪一帧开始」（owner 09-27 视频台 A · 画板「首帧当封面」）。
   * ⚠ 只画这一枪**真发**的那几张（与素材排、发送口同一份 `send.unsent`）：换到只收一张图的
   *   型号，尾帧在素材排里变淡，舞台上也 ⛔ 还缩在右下角说「右下是尾帧」。
   */
  const sentFrame = (url: string | null) =>
    url !== null && !videoSend?.unsent.images.includes(url) ? url : null
  /**
   * 视频队列（只在视频台）与舞台正在替它画进度的那一条。
   *
   * ⚠ 视频提交即返回，全局 `isGenerating` 只亮几百毫秒；「还在跑」只活在 run item
   * 上。以前舞台只认 `isGenerating`，进度框几秒后离场、舞台回到空态（2026-11-17
   * 生产真机）。判据见 `resolveStudioVideoStageItem`。
   */
  const videoQueueItems =
    state.outputType === 'video' && activeRun?.outputType === 'VIDEO'
      ? activeRun.items
      : []
  const stageVideoItem = resolveStudioVideoStageItem({
    items: videoQueueItems,
    focusedItemId: focusedQueueItemId,
  })
  const stageBusy = isGenerating || stageVideoItem !== null
  const posterFirst =
    videoWithoutRail && !stageBusy && !lastGeneration
      ? sentFrame(state.videoFrameSlots.first)
      : null
  const videoPoster = posterFirst
    ? { first: posterFirst, last: sentFrame(state.videoFrameSlots.last) }
    : null
  /**
   * 没有参考轨时，还没出结果的那张参考图撑满舞台（见下方舞台分支）。
   * ⚠ 刚失败时让位给失败那一格（原因 +「重试」），参考图仍在输入框的附件行里。
   */
  const referenceFillsStage =
    !referenceRail &&
    !videoWithoutRail &&
    activeRun?.mode !== 'compare' &&
    activeRun?.mode !== 'variant' &&
    !isGenerating &&
    !lastGeneration &&
    !error &&
    stageReference !== null

  /**
   * 这条轨叫什么 —— 槽位语义由 `resolveReferenceRailSlot` 判（那里有判据与单测），
   * 这里只负责把三种槽位映到文案。穷举 Record 无兜底：新增一种槽位时 tsc 先红。
   */
  const referenceRailLabel = {
    'content-reference': tVideo('railLabelReference'),
    'image-reference': tImageChip('referenceLabel'),
  }[resolveReferenceRailSlot(state.outputType)]

  /**
   * 「挂着的图这一轮发给谁」—— 多选里混进**不收参考图**的模型时的那一句横幅
   * （D10 ④：PixAI 不收参考图，这几张只给 NAI）。
   *
   * ⚠ 不按方言分支：同样的事在自然语言台也成立（Seedream 4.5 的
   * `maxReferenceImages` 是 0，与 GPT 一起选就是同一个局面）。判据是能力表里
   * 的那个数，⛔ 不是厂商名。
   * ⛔ 有它也不禁用参考轨 —— 图还在，只是收件人少一个。
   */
  const referenceNotice = useReferenceReceiverNotice(
    runModels,
    referenceEntries.length,
  )

  const focusedQueueGeneration =
    videoQueueItems.find(
      (item) => item.id === focusedQueueItemId && item.status === 'completed',
    )?.generation ?? null
  /**
   * 底部输入框布局里舞台有自己的高度（随输入框伸缩）：生成中 / 刚失败的那块图框和出来
   * 的图都按舞台剩下的地方等比放到最大（加载态 A）。⛔ 按视口算 —— 矮屏上图框下沿会被
   * 舞台切掉，边上那条进度线走到下面就看不见了。空态不在此列（它自己居中）。
   */
  const stageBoxFillsStage =
    !referenceRail &&
    activeRun?.mode !== 'compare' &&
    activeRun?.mode !== 'variant' &&
    ((focusedQueueGeneration ?? lastGeneration) !== null ||
      stageBusy ||
      error !== null)

  // 这一轮重排后旧的聚焦项可能已经不在队列里（重试会把失败那条换掉），
  // 用推导而不是 effect 同步：写回 state 会慢一帧，那一帧渲染的是空。
  const activeFocusedQueueItemId = videoQueueItems.some(
    (item) => item.id === focusedQueueItemId,
  )
    ? focusedQueueItemId
    : null

  /**
   * 结果到达后把结果卡滚到舞台顶部（**每轮一次**，需求卡交互表最后一组）。
   *
   * ⚠ 只在移动端做：桌面舞台本来就在视口里，桌面滚一次是平白把人挪走。
   * ⚠ 判据是「这一轮的结果 id 变了且不在生成中」，用 ref 记住已经滚过的那一个 ——
   *   放在依赖里让 effect 每次 render 都跑会变成「一直往回滚」，用户手动往下翻
   *   看第二张时会被拽回去。
   */
  const isMobile = useIsMobile()
  const resultAnchorRef = useRef<HTMLDivElement>(null)

  /**
   * 「先搜再画」的资料（B 定稿）：只在出图当下、舞台还在看这一轮的结果时出现；
   * 换成别的结果（下一张 · 历史）就收起，刷新后运行状态没了自然也没有。
   */
  const searchRun =
    state.outputType === 'image' && activeRun
      ? searchGroundingForRun(activeRun.items)
      : null
  const shownGeneration = focusedQueueGeneration ?? lastGeneration
  const searchGrounding =
    searchRun &&
    (activeRun?.mode !== 'single' ||
      !shownGeneration ||
      activeRun.items.some(
        (item) => item.generation?.id === shownGeneration.id,
      ))
      ? searchRun
      : null
  const searchWireTarget = useCallback(
    () =>
      resultAnchorRef.current?.querySelector<HTMLElement>(
        '[data-search-grounding-tile]',
      ) ?? null,
    [],
  )
  const searchRowLeadModelId = activeRun?.items.find(
    (item) => item.searchGrounding,
  )?.modelId
  const scrolledResultIdRef = useRef<string | null>(null)
  const resultId =
    lastGeneration?.id ??
    activeRun?.items.find((item) => item.generation)?.generation?.id ??
    null
  useEffect(() => {
    if (!isMobile || isGenerating || !resultId) return
    if (scrolledResultIdRef.current === resultId) return
    scrolledResultIdRef.current = resultId
    resultAnchorRef.current?.scrollIntoView({
      block: 'start',
      behavior: 'smooth',
    })
  }, [isMobile, isGenerating, resultId])

  const handleEdit = useCallback(
    (generation: GenerationRecord) => {
      onEdit?.({ url: generation.url, generationId: generation.id })
    },
    [onEdit],
  )

  // 审查 D3：从画布结果一键存配方——复用 ImageDetailModal 同款深链，
  // 不再绕道 Gallery 详情。
  const handleSaveRecipe = useCallback(
    (generation: GenerationRecord) => {
      router.push(
        promptCreatePath({
          prompt: generation.prompt,
          negativePrompt: generation.negativePrompt,
          modelId: generation.model,
          provider: generation.provider,
          outputType: generation.outputType,
          generationId: generation.id,
        }),
      )
    },
    [router],
  )

  return (
    <div
      onDragEnter={handleCanvasDragEnter}
      onDragOver={handleCanvasDragOver}
      onDragLeave={handleCanvasDragLeave}
      onDrop={handleCanvasDrop}
      className={cn(
        'studio-canvas transition-all',
        (referenceFillsStage || videoPoster || stageBoxFillsStage) &&
          'flex min-h-0 flex-1 flex-col',
        'relative',
        className,
      )}
    >
      <DropOverlay
        active={dropKind === 'reference'}
        label={tDrop('toReferences')}
      />
      <DropOverlay active={dropKind === 'recipe'} label={tDrop('readRecipe')} />
      <ImageRecipeImportDialog />
      {/* 参考轨 —— 与结果并存，不再被结果挤掉。编辑态下不画：编辑舞台自带
          返回条与「正在编辑 · 参考图 N / M」，两条一起出现就是一屏两遍。 */}
      {stageReference && referenceRail && (
        <StudioReferenceRail
          label={referenceRailLabel}
          notice={referenceNotice}
          entries={referenceEntries}
          activeIndex={stageReference.referenceIndex}
          onActiveIndexChange={setReferenceCursor}
          onEdit={(index) =>
            onEdit?.({
              url: referenceEntries[index].url,
              referenceIndex: index,
              referenceTotal: referenceEntries.length,
            })
          }
          onRemove={imageUpload.removeReferenceImage}
        />
      )}

      {/* 视频队列 —— **移动端在舞台顶部**（整宽卡片列）。桌面那条横滑留在
          结果下面（见文件末尾那处）：手机上横滑读不了，第二条起就在屏幕外，
          而「排了几条 / 各排到哪了」正是等 2–5 分钟时唯一要看的东西。 */}
      {isMobile && videoQueueItems.length > 0 ? (
        <StudioVideoQueueStrip
          variant="cards"
          items={videoQueueItems}
          focusedItemId={activeFocusedQueueItemId}
          onFocus={setFocusedQueueItemId}
          onRetry={(itemId) => void retryVideoQueueItem(itemId)}
          onCancel={cancelRunItem}
          onCancelAll={cancelAllRunItems}
        />
      ) : null}

      {/* Content layer = fluid: the canvas fills the full padded width so
          the empty-state guide card and the Compare/Variant grids use the
          whole screen instead of floating in a narrow centred column. The
          "reading layer" (a lone single-image preview) self-bounds inside
          GenerationPreview — a single square can't fill a wide canvas
          without overflowing the viewport vertically, so it stays framed
          and centred rather than stranded in full-bleed dead space. */}
      <div
        ref={resultAnchorRef}
        data-testid="studio-canvas-content"
        className={cn(
          'w-full',
          // ⚠ 撑满舞台的几种（编辑 · 参考图铺满 · 视频首帧封面）这一层也得是弹性列，
          //   否则高度链在这里断掉，图按自身大小冲出舞台。
          referenceFillsStage || videoPoster || stageBoxFillsStage
            ? 'flex min-h-0 flex-1 flex-col'
            : 'mx-auto',
        )}
      >
        {/* 图墙：多模型与单模型多张走**同一片**栅格 —— 它们本来就是同一个矩阵
            的两端（1 模型 × N 张 / N 模型 × 1 张 / N × M）。每格自己标模型名，
            同模型多张时带 `1/2` 序号，各自报生成中 / 失败。 */}
        {/* ⚠ 只接 compare / variant。`mode: 'single'` 的 activeRun 也存在（单张
            路径也建 run 做逐项追踪），它必须继续走 GenerationPreview —— 一张图
            掉进栅格里会从「读图」降级成「扫缩略图」。 */}
        {activeRun?.mode === 'compare' || activeRun?.mode === 'variant' ? (
          // 「先搜再画」：桌面资料列在图墙左边，出线拐弯只接开着搜索的那一格；
          // 手机资料条挂进那一行（行首条和图之间）。
          <div className="flex min-h-0 flex-1">
            {isMobile ? null : (
              <SearchGroundingRail
                state={searchGrounding}
                layout="column"
                wireTarget={searchWireTarget}
                wireKey={activeRun.items
                  .map((item) => `${item.id}:${item.status}`)
                  .join()}
                className="self-stretch"
              />
            )}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <CompareGrid
                items={activeRun.items}
                selectedItemId={activeRun.selectedItemId}
                onSelect={selectWinner}
                elapsedSeconds={elapsedSeconds}
                onEdit={handleEdit}
                onUseAsReference={handleUseAsReference}
                onCancel={cancelRunItem}
                onCancelAll={cancelAllRunItems}
                onRetry={(itemId) => void retryRunItem(itemId)}
                rowLead={
                  isMobile
                    ? (row) =>
                        row.modelId === searchRowLeadModelId ? (
                          <SearchGroundingRail
                            state={searchGrounding}
                            layout="strip"
                          />
                        ) : null
                    : undefined
                }
              />
            </div>
          </div>
        ) : videoPoster ? (
          <div className="flex min-h-0 flex-1 animate-in flex-col items-center gap-3 fade-in-0 duration-base ease-linear motion-reduce:animate-none">
            {/* ⚠ 框按舞台剩下的高度走（舞台随输入框伸缩），宽度跟着图的比例 —— 尾帧那张
                小图才落得在首帧的右下角上。 */}
            <div className="flex min-h-0 w-full flex-1 items-center justify-center">
              <div className="relative h-full max-w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={videoPoster.first}
                  alt={tSlots('firstFrame')}
                  className="h-full max-w-full rounded-xl object-contain"
                />
                {videoPoster.last ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={videoPoster.last}
                    alt={tSlots('lastFrame')}
                    className="absolute right-3 bottom-3 w-1/5 animate-in rounded-lg object-cover shadow-media-action ring-2 ring-background fade-in-0 duration-base ease-linear motion-reduce:animate-none"
                  />
                ) : null}
              </div>
            </div>
            <p className="shrink-0 text-2xs text-muted-foreground">
              {tSlots.rich(
                videoPoster.last ? 'poster.withLast' : 'poster.firstOnly',
                {
                  strong: (chunks) => (
                    <span className="font-semibold text-foreground">
                      {chunks}
                    </span>
                  ),
                },
              )}
            </p>
          </div>
        ) : !stageBusy &&
          !lastGeneration &&
          !error &&
          stageReference &&
          !videoWithoutRail ? (
          /* 还没有结果时，当前参考图占住舞台。有参考轨时位置与编辑入口归轨管，
             这里只负责把那一张放大；没有轨（底部输入框布局）时图按舞台剩下的
             高度等比缩放 —— 舞台高度随输入框伸缩，⛔ 不能按视口算。 */
          referenceFillsStage ? (
            <div className="flex min-h-0 flex-1 flex-col items-center gap-3">
              <div className="flex min-h-0 w-full flex-1 items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={stageReference.url}
                  alt={tEdit('sourceAlt')}
                  className="max-h-full max-w-full rounded-xl object-contain"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="rounded-full"
                onClick={() => onEdit?.(stageReference)}
              >
                <Wand2 className="size-3.5" />
                {tEdit('stageEditThis')}
              </Button>
            </div>
          ) : (
            <div className="m-auto flex w-full flex-col items-center gap-3">
              <div className="w-full overflow-hidden rounded-xl bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={stageReference.url}
                  alt={tEdit('sourceAlt')}
                  className="studio-reference-stage-image object-contain"
                />
              </div>
            </div>
          )
        ) : (
          <>
            <GenerationPreview
              generation={
                stageVideoItem
                  ? null
                  : (focusedQueueGeneration ?? lastGeneration)
              }
              pendingVideoItem={stageVideoItem}
              searchGrounding={
                state.outputType === 'image' ? searchGrounding : undefined
              }
              isLatestResult
              onUseAsReference={handleUseAsReference}
              onRemix={handleRemix}
              remixPending={remixingId !== null}
              onEdit={handleEdit}
              onSaveRecipe={handleSaveRecipe}
              onRetry={retry}
              fillStage={stageBoxFillsStage}
            />
            {/* 走到这个分支时外层三元已经排除了 compare / variant —— 这里剩下
                的 activeRun?.mode 只可能是 undefined 或 'single'，两种都该
                出反馈条（曾经的 `!activeRun?.mode` 会连 'single' 一起挡掉，
                导致单张生成永远看不到反馈条）。 */}
            {lastGeneration?.outputType === 'IMAGE' && (
              <StudioResultFeedback
                generationId={lastGeneration.id}
                evaluation={lastEvaluation}
                onFeedback={handleFeedback}
                satisfiedStatus={satisfiedStatus}
              />
            )}
          </>
        )}
      </div>

      {/* 视频队列条 —— 在内容层**外面**：它属于舞台底部的常驻一条，
          与结果并存（编辑态没有视频，所以不必再加 editTarget 守卫）。 */}
      {!isMobile && videoQueueItems.length > 0 ? (
        <StudioVideoQueueStrip
          items={videoQueueItems}
          focusedItemId={activeFocusedQueueItemId}
          onFocus={setFocusedQueueItemId}
          onRetry={(itemId) => void retryVideoQueueItem(itemId)}
          onCancel={cancelRunItem}
          onCancelAll={cancelAllRunItems}
        />
      ) : null}

      {/* 「满意」评估缺 key 就地配：配的是**助手**那一家的 key，⛔ 不顺手改工作台的出图模型。 */}
      {evaluationKeySetup ? (
        <QuickSetupDialog
          open
          onOpenChange={(next) => {
            if (!next) setEvaluationKeySetup(null)
          }}
          modelId={evaluationKeySetup.modelId}
          modelLabel={evaluationKeySetup.modelLabel}
          adapterType={evaluationKeySetup.adapterType}
          optionId={assistantKeySetupOptionId(evaluationKeySetup.modelId)}
          selectStudioModel={false}
          onVerified={() => {
            const generationId = lastGenerationRef.current?.id
            if (generationId) evaluateSatisfied(generationId)
          }}
        />
      ) : null}
    </div>
  )
})
