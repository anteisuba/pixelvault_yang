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
import { useIsMobile } from '@/hooks/use-mobile'
import { promptCreatePath } from '@/constants/routes'
import { usePathname, useRouter } from '@/i18n/navigation'
import { fetchGenerationByIdAPI } from '@/lib/api-client'
import { buildStudioRemixPreset } from '@/lib/studio-remix'
import { evaluateGenerationAPI } from '@/lib/api-client/generation'
import { focusStudioPrompt } from '@/lib/focus-studio-prompt'
import { resolveReferenceRailSlot } from '@/lib/studio/reference-rail-slot'
import { cn } from '@/lib/utils'
import {
  applyAudioFeedbackTags,
  type AudioFeedbackTag,
} from '@/lib/studio/audio-feedback-mapping'
import type { GenerationRecord } from '@/types'

import { CompareGrid } from '@/components/business/image/CompareGrid'
import { StudioReferenceRail } from '@/components/business/studio-shared/chrome/StudioReferenceRail'
import { StudioVideoQueueStrip } from '@/components/business/studio-shared/chrome/StudioVideoQueueStrip'
import { GenerationPreview } from '@/components/business/studio/GenerationPreview'
import { StudioAudioFeedback } from '@/components/business/studio/StudioAudioFeedback'
import { StudioGenerationErrorDialog } from '@/components/business/image/StudioGenerationErrorDialog'
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
export const StudioCanvas = memo(function StudioCanvas() {
  const { state, dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const {
    lastGeneration: rawLastGeneration,
    error,
    errorCode,
    retry,
    activeRun: rawActiveRun,
    selectWinner,
    lastEvaluation,
    setLastEvaluation,
    isGenerating,
    elapsedSeconds,
    retryVideoQueueItem,
    cancelRunItem,
    cancelAllRunItems,
  } = useStudioGen()
  const tAudioFeedback = useTranslations('audioFeedback')
  const tEdit = useTranslations('StudioImageEdit')
  const tVideo = useTranslations('VideoGenerate')
  const tImageChip = useTranslations('ImageChip')
  const [errorDismissed, setErrorDismissed] = useState<string | null>(null)
  /**
   * 编辑态的目标图。非空 = 结果区整片切成编辑态（施工基准
   * `references/pages/studio-image-edit.md` §2 方向 A：舞台接管）。
   */
  const [editTarget, setEditTarget] = useState<StudioImageEditTarget | null>(
    null,
  )
  const errorDialogOpen = !!error && error !== errorDismissed
  const { modelOptions } = useImageModelOptions()

  // Only show the latest generation if it matches the current output type.
  // Prevents Canvas from displaying an image result after user switches to
  // video/audio mode (and vice versa).
  const expectedOutputType =
    state.outputType === 'video'
      ? 'VIDEO'
      : state.outputType === 'audio'
        ? 'AUDIO'
        : 'IMAGE'
  const lastGeneration =
    rawLastGeneration && rawLastGeneration.outputType === expectedOutputType
      ? rawLastGeneration
      : null
  /**
   * ⚠ **批次槽要走同一道守卫。** 上面那道只护住了 `lastGeneration`，`activeRun`
   * 漏了整整一版 —— 而它的分支排在更前面、优先级更高。后果是跨模态串台：跑完
   * 一批图片再进语音工作台，那几张图被 `AudioVariantGrid` 画成音频卡片（描述
   * 文字是图片的提示词，`<audio src>` 指着图片 URL）；进视频工作台则被
   * `CompareGrid` 原样画成图片，连「模型：GPT Image 2」都照抄。
   *
   * 三个模态共用一个 `StudioProvider`（挂在 `(workspace)/layout.tsx`，切路由不
   * remount），所以上一模态的 run 会原封不动活到下一模态 —— 清不清空是另一回事，
   * 但**渲染前按模态过滤是这里必须做的**。
   */
  const activeRun =
    rawActiveRun && rawActiveRun.outputType === expectedOutputType
      ? rawActiveRun
      : null
  const lastGenerationRef = useRef<GenerationRecord | null>(null)

  useLayoutEffect(() => {
    lastGenerationRef.current = lastGeneration
  }, [lastGeneration])

  const handleSwitchModel = useCallback(() => {
    dispatch({ type: 'OPEN_PANEL', payload: 'modelSelector' })
  }, [dispatch])

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
   * 这条轨叫什么 —— 槽位语义由 `resolveReferenceRailSlot` 判（那里有判据与单测），
   * 这里只负责把三种槽位映到文案。穷举 Record 无兜底：新增一种槽位时 tsc 先红。
   */
  const referenceRailLabel = {
    'first-frame': tVideo('railLabelKeyframe'),
    'content-reference': tVideo('railLabelReference'),
    'image-reference': tImageChip('referenceLabel'),
  }[resolveReferenceRailSlot(state.outputType, state.videoMode)]

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
        editTarget && 'flex min-h-0 flex-1 flex-col',
        isDragOver && 'ring-2 ring-primary/40 bg-primary/5 rounded-xl',
      )}
    >
      {/* 参考轨 —— 与结果并存，不再被结果挤掉。编辑态下不画：编辑舞台自带
          返回条与「正在编辑 · 参考图 N / M」，两条一起出现就是一屏两遍。 */}
      {!editTarget && stageReference && (
        <StudioReferenceRail
          label={referenceRailLabel}
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
          editTarget ? 'flex min-h-0 flex-1 flex-col' : 'mx-auto',
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
            />
          )
        ) : !lastGeneration && stageReference ? (
          /* 还没有结果时，当前参考图占住舞台。位置与编辑入口都归参考轨管，
             这里只负责把那一张放大 —— 计数与「编辑这张」不再重复一遍。 */
          <div className="m-auto flex flex-col items-center gap-3">
            <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stageReference.url}
                alt={tEdit('sourceAlt')}
                className="studio-reference-stage-image object-contain"
              />
            </div>
          </div>
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

      {error && (
        <StudioGenerationErrorDialog
          open={errorDialogOpen}
          onOpenChange={(open) => {
            if (!open) setErrorDismissed(error)
          }}
          error={{ message: error, code: errorCode ?? undefined }}
          onRetry={() => {
            setErrorDismissed(null)
            retry()
          }}
          onSwitchModel={handleSwitchModel}
        />
      )}
    </div>
  )
})
