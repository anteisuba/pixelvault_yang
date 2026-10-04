'use client'

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
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
import { promptCreatePath } from '@/constants/routes'
import { usePathname, useRouter } from '@/i18n/navigation'
import { fetchGenerationByIdAPI } from '@/lib/api-client'
import { buildStudioRemixPreset } from '@/lib/studio-remix'
import { evaluateGenerationAPI } from '@/lib/api-client/generation'
import { focusStudioPrompt } from '@/lib/focus-studio-prompt'
import { resolveReferenceRailSlot } from '@/lib/studio/reference-rail-slot'
import {
  isStudioResultInWorkspace,
  studioRunForWorkspace,
} from '@/lib/studio-operator-result-run'
import { cn } from '@/lib/utils'
import {
  applyAudioFeedbackTags,
  type AudioFeedbackTag,
} from '@/lib/studio/audio-feedback-mapping'
import type { GenerationRecord } from '@/types'

import { Wand2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { CompareGrid } from '@/components/business/image/CompareGrid'
import { StudioReferenceRail } from '@/components/business/studio-shared/chrome/StudioReferenceRail'
import { StudioVideoQueueStrip } from '@/components/business/studio-shared/chrome/StudioVideoQueueStrip'
import { GenerationPreview } from '@/components/business/studio/GenerationPreview'
import { StudioAudioFeedback } from '@/components/business/studio/StudioAudioFeedback'
import { StudioResultFeedback } from '@/components/business/image/StudioResultFeedback'
import { AudioVariantGrid } from '@/components/business/studio/AudioVariantGrid'
import {
  StudioImageEditStage,
  type StudioImageEditTarget,
} from '@/components/business/studio-shared/editor/StudioImageEditStage'

/**
 * StudioCanvas — central hero area for the canvas-centric layout.
 * Fills all vertical space between TopBar and BottomDock.
 * Delegates rendering to GenerationPreview (empty / loading / image / error).
 * Accepts gallery image drops — adds as reference and opens the ref panel.
 */
interface StudioCanvasProps {
  /**
   * 舞台顶部那条参考轨。底部输入框布局（owner 2026-09-26）传 `false`：参考图
   * 只住在输入框的附件行里，舞台只放结果；「编辑这张」挪到下方放大图底下，
   * 「只发给谁」那句挪到附件行下面。
   */
  referenceRail?: boolean
  /** 挂在根上的额外类（舞台面板收起、结果回来时那一下淡入）。 */
  className?: string
}

export const StudioCanvas = memo(function StudioCanvas({
  referenceRail = true,
  className,
}: StudioCanvasProps) {
  const { state, dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
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
  const tAudioFeedback = useTranslations('audioFeedback')
  const tEdit = useTranslations('StudioImageEdit')
  const tVideo = useTranslations('VideoGenerate')
  const tSlots = useTranslations('StudioVideoSlots')
  const tImageChip = useTranslations('ImageChip')
  /**
   * 编辑态的目标图。非空 = 结果区整片切成编辑态（施工基准
   * `references/pages/studio-image-edit.md` §2 方向 A：舞台接管）。
   */
  const [editTarget, setEditTarget] = useState<StudioImageEditTarget | null>(
    null,
  )
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

  const handleAudioFeedbackRetry = useCallback(
    (tags: AudioFeedbackTag[]) => {
      if (tags.length === 0 || isGenerating) return

      const patch = applyAudioFeedbackTags(tags, state)
      for (const action of patch.actions) {
        dispatch(action)
      }
      if (patch.openPanel) {
        dispatch({ type: 'OPEN_PANEL', payload: patch.openPanel })
        // `voice_mismatch` defers to the user — they must pick a new voice
        // before the next generation can apply. Skip the auto-regenerate so
        // we don't run with the stale voice.
        return
      }
      if (patch.pronunciationHint) {
        toast.info(tAudioFeedback('retryPronunciationHint'))
      }
      dispatch({ type: 'REQUEST_GENERATE' })
    },
    [dispatch, isGenerating, state, tAudioFeedback],
  )

  const handleFeedback = useCallback(
    (tags: string[]) => {
      if (!lastGeneration) return

      if (tags.includes('satisfied')) {
        if (lastEvaluation !== null) return

        const requestedGenerationId = lastGeneration.id
        void evaluateGenerationAPI(requestedGenerationId).then((result) => {
          if (lastGenerationRef.current?.id !== requestedGenerationId) {
            return
          }

          if (result.success && result.data) {
            setLastEvaluation(result.data)
          }
        })
        return
      }

      if (tags.length > 0) {
        dispatch({ type: 'OPEN_PANEL', payload: 'keepChange' })
      }
    },
    [dispatch, lastEvaluation, lastGeneration, setLastEvaluation],
  )

  // ── Drop target: gallery images → open reference panel (Pragmatic DnD) ──
  const canvasRef = useRef<HTMLDivElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === 'studio-generation',
      onDragEnter: () => setIsDragOver(true),
      onDragLeave: () => setIsDragOver(false),
      onDrop: ({ source }) => {
        setIsDragOver(false)
        const url = source.data.url as string
        if (url) {
          void imageUpload.addFromUrl(url).then(() => {
            focusStudioPrompt()
          })
        }
      },
    })
  }, [imageUpload])

  const handleUseAsReference = useCallback(
    async (url: string) => {
      await imageUpload.addFromUrl(url)
      focusStudioPrompt()
    },
    [imageUpload],
  )

  const handleRemix = useCallback(
    (generation: GenerationRecord) => {
      const preset = buildStudioRemixPreset(generation, modelOptions)
      // Preserve source outputType so remixing a video/audio stays in that mode
      const sourceOutputType =
        generation.outputType === 'VIDEO'
          ? 'video'
          : generation.outputType === 'AUDIO'
            ? 'audio'
            : 'image'
      dispatch({ type: 'SET_OUTPUT_TYPE', payload: sourceOutputType })
      dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'quick' })
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
    },
    [dispatch, modelOptions],
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
   * 视频台还没出过结果、挂了首帧：舞台把首帧当封面（有尾帧就缩在右下角）——
   * 看得见「视频从哪一帧开始」（owner 09-27 视频台 A · 画板「首帧当封面」）。
   * ⚠ 只画这一枪**真发**的那几张（与素材排、发送口同一份 `send.unsent`）：换到只收一张图的
   *   型号，尾帧在素材排里变淡，舞台上也 ⛔ 还缩在右下角说「右下是尾帧」。
   */
  const sentFrame = (url: string | null) =>
    url !== null && !videoSend?.unsent.images.includes(url) ? url : null
  const posterFirst =
    videoWithoutRail && !isGenerating && !lastGeneration
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
    !editTarget &&
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
  const videoQueueItems =
    state.outputType === 'video' && activeRun?.outputType === 'VIDEO'
      ? activeRun.items
      : []
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
    !editTarget &&
    activeRun?.mode !== 'compare' &&
    activeRun?.mode !== 'variant' &&
    ((focusedQueueGeneration ?? lastGeneration) !== null ||
      isGenerating ||
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

  const handleEdit = useCallback((generation: GenerationRecord) => {
    setEditTarget({ url: generation.url, generationId: generation.id })
  }, [])

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
      ref={canvasRef}
      className={cn(
        'studio-canvas transition-all',
        (editTarget ||
          referenceFillsStage ||
          videoPoster ||
          stageBoxFillsStage) &&
          'flex min-h-0 flex-1 flex-col',
        isDragOver && 'ring-2 ring-primary/40 bg-primary/5 rounded-xl',
        className,
      )}
    >
      {/* 参考轨 —— 与结果并存，不再被结果挤掉。编辑态下不画：编辑舞台自带
          返回条与「正在编辑 · 参考图 N / M」，两条一起出现就是一屏两遍。 */}
      {!editTarget && stageReference && referenceRail && (
        <StudioReferenceRail
          label={referenceRailLabel}
          notice={referenceNotice}
          entries={referenceEntries}
          activeIndex={stageReference.referenceIndex}
          onActiveIndexChange={setReferenceCursor}
          onEdit={(index) =>
            setEditTarget({
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
          editTarget || referenceFillsStage || videoPoster || stageBoxFillsStage
            ? 'flex min-h-0 flex-1 flex-col'
            : 'mx-auto',
        )}
      >
        {/* 图墙：多模型与单模型多张走**同一片**栅格 —— 它们本来就是同一个矩阵
            的两端（1 模型 × N 张 / N 模型 × 1 张 / N × M）。每格自己标模型名，
            同模型多张时带 `1/2` 序号，各自报生成中 / 失败。
            ⚠ 音频仍走 AudioVariantGrid：它的格子是内联播放器，不是图。 */}
        {/* ⚠ 只接 compare / variant。`mode: 'single'` 的 activeRun 也存在（单张
            路径也建 run 做逐项追踪），它必须继续走 GenerationPreview —— 一张图
            掉进栅格里会从「读图」降级成「扫缩略图」。 */}
        {editTarget ? (
          <StudioImageEditStage
            target={editTarget}
            onBack={() => setEditTarget(null)}
            onTargetChange={setEditTarget}
          />
        ) : activeRun?.mode === 'compare' || activeRun?.mode === 'variant' ? (
          state.outputType === 'audio' ? (
            <AudioVariantGrid
              items={activeRun.items}
              onCancel={cancelRunItem}
              onCancelAll={cancelAllRunItems}
            />
          ) : (
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
            />
          )
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
                    className="absolute right-3 bottom-3 w-1/5 animate-in rounded-lg object-cover shadow-md ring-2 ring-background fade-in-0 duration-base ease-linear motion-reduce:animate-none"
                  />
                ) : null}
              </div>
            </div>
            <p className="shrink-0 text-xs text-muted-foreground">
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
        ) : !isGenerating &&
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
                variant="outline"
                className="rounded-full"
                onClick={() => setEditTarget(stageReference)}
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
              generation={focusedQueueGeneration ?? lastGeneration}
              isLatestResult
              onUseAsReference={handleUseAsReference}
              onRemix={handleRemix}
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
              />
            )}
            {lastGeneration?.outputType === 'AUDIO' && (
              <StudioAudioFeedback
                generationId={lastGeneration.id}
                onFeedback={handleFeedback}
                onRetry={handleAudioFeedbackRetry}
                isRetrying={isGenerating}
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
    </div>
  )
})
