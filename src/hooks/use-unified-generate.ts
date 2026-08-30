'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  AUDIO_GENERATION,
  IMAGE_GENERATION,
  PLATFORM_GENERATION_GUARD,
  VIDEO_GENERATION,
} from '@/constants/config'
import type { AudioFormat, AudioLatency } from '@/constants/audio-options'
import { isAudioExpressiveness } from '@/constants/audio-options'
import {
  AUDIO_EMOTIONS,
  AUDIO_PAUSE_MARKERS,
  AUDIO_PACES,
  type AudioEmotion,
  type AudioPace,
} from '@/constants/voice-cards'
import { VARIANT_MAX_SEED } from '@/constants/studio'
import {
  GENERATION_ERROR_CODES,
  type GenerationErrorCode,
  normalizeErrorCode,
  parseGenerationErrorCode,
} from '@/constants/generation-errors'
import { getGenerationErrorMessage } from '@/lib/api-error-message'
import { requestStudioResultDetail } from '@/lib/studio-result-detail'
import type {
  ActiveRun,
  GenerateAudioRequest,
  GenerateAudioResponseData,
  GenerationRecord,
  RunItem,
  StudioGenerateRequest,
  StudioGenerateResponseData,
  GenerateVideoRequest,
} from '@/types'
import {
  checkAudioStatusAPI,
  checkImageGenerationStatusAPI,
  studioGenerateAPI,
  studioSelectWinnerAPI,
  submitVideoAPI,
  checkVideoStatusAPI,
  generateAudioAPI,
} from '@/lib/api-client'

// ─── Types ───────────────────────────────────────────────────────

export type GenerationStage =
  | 'idle'
  | 'generating'
  | 'queued'
  | 'processing'
  | 'uploading'

export type GenerationMode = 'image' | 'video' | 'audio'

export interface AudioGenerateInput {
  modelId: string
  apiKeyId?: string
  freePrompt?: string
  voiceId?: string
  /** Audio cover image (by reference) → the generation's previewUrl, so the
   *  clip carries the voice's avatar into 素材库. No R2 copy. */
  coverImageUrl?: string
  referenceAudioUrl?: string
  referenceText?: string
  emotion?: string
  expressiveness?: string
  durationSeconds?: number
  loop?: boolean
  promptInfluence?: number
  /** >1 issues N independent generations shown as an A/B variant grid. */
  variantCount?: number
  pace?: string
  pauseMarkers?: string[]
  pronunciationDictionary?: Record<string, string>
  speed?: number
  volume?: number
  normalizeLoudness?: boolean
  normalizeText?: boolean
  withTimestamps?: boolean
  format?: AudioFormat
  sampleRate?: number
  mp3Bitrate?: number
  opusBitrate?: number
  latency?: AudioLatency
  temperature?: number
  topP?: number
  chunkLength?: number
  repetitionPenalty?: number
  speakerVoiceIds?: string[]
}

export interface CompareModelSelection {
  modelId: string
  apiKeyId?: string
}

export interface UnifiedGenerateInput {
  mode: GenerationMode
  image?: StudioGenerateRequest
  video?: GenerateVideoRequest
  audio?: AudioGenerateInput
  /**
   * B5: >1 issues N independent generations (one random seed each) shown as a
   * variant grid — same shape as `audio.variantCount`. There is no
   * "N images per request" path at any provider we call, so N images is
   * always N requests.
   */
  variantCount?: number
  /** B4: Models to compare — non-empty routes the run to compare mode. */
  compareModels?: CompareModelSelection[]
}

export interface UseUnifiedGenerateReturn {
  isGenerating: boolean
  stage: GenerationStage
  elapsedSeconds: number
  error: string | null
  errorCode: GenerationErrorCode | null
  lastGeneration: GenerationRecord | null
  generate: (input: UnifiedGenerateInput) => Promise<GenerationRecord | null>
  retry: () => Promise<GenerationRecord | null>
  reset: () => void
  /** B0: Active generation run with per-item tracking */
  activeRun: ActiveRun | null
  /** B5: Select a variant as winner */
  selectWinner: (generationId: string) => Promise<void>
  /** 视频队列里还在跑的条数（只数当前批次且 outputType 为 VIDEO 的）。 */
  activeVideoJobCount: number
  /** 还能不能再排一条视频 —— 上限取平台并发闸的 4，判据见实现处注释。 */
  canQueueMoreVideo: boolean
  /** 用某一条自己的参数重放它；原地把失败那条换成新排的一条。 */
  retryVideoQueueItem: (itemId: string) => Promise<void>
}

function isAudioEmotion(value: string | undefined): value is AudioEmotion {
  return AUDIO_EMOTIONS.includes(value as AudioEmotion)
}

function isAudioPace(value: string | undefined): value is AudioPace {
  return AUDIO_PACES.includes(value as AudioPace)
}

function isAudioPauseMarker(
  value: string,
): value is (typeof AUDIO_PAUSE_MARKERS)[number] {
  return AUDIO_PAUSE_MARKERS.includes(
    value as (typeof AUDIO_PAUSE_MARKERS)[number],
  )
}

function hasJobId(
  data: GenerateAudioResponseData | StudioGenerateResponseData | undefined,
): data is Extract<
  GenerateAudioResponseData | StudioGenerateResponseData,
  { jobId: string }
> {
  return typeof data?.jobId === 'string' && data.jobId.length > 0
}

function waitForPollInterval(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** Compile an audio-mode input into the API request (shared by single + variants). */
function buildAudioRequestPayload(
  input: AudioGenerateInput,
): GenerateAudioRequest {
  return {
    prompt: input.freePrompt ?? '',
    modelId: input.modelId,
    apiKeyId: input.apiKeyId,
    voiceId: input.voiceId,
    coverImageUrl: input.coverImageUrl,
    referenceAudioUrl: input.referenceAudioUrl,
    referenceText: input.referenceText,
    emotion: isAudioEmotion(input.emotion) ? input.emotion : undefined,
    durationSeconds: input.durationSeconds,
    loop: input.loop,
    promptInfluence: input.promptInfluence,
    expressiveness:
      input.expressiveness && isAudioExpressiveness(input.expressiveness)
        ? input.expressiveness
        : undefined,
    pace: isAudioPace(input.pace) ? input.pace : undefined,
    pauseMarkers: input.pauseMarkers?.filter(isAudioPauseMarker),
    pronunciationDictionary: input.pronunciationDictionary,
    speed: input.speed,
    volume: input.volume,
    normalizeLoudness: input.normalizeLoudness,
    normalizeText: input.normalizeText,
    withTimestamps: input.withTimestamps,
    format: input.format,
    sampleRate: input.sampleRate,
    mp3Bitrate: input.mp3Bitrate,
    opusBitrate: input.opusBitrate,
    latency: input.latency,
    temperature: input.temperature,
    topP: input.topP,
    chunkLength: input.chunkLength,
    repetitionPenalty: input.repetitionPenalty,
    speakerVoiceIds: input.speakerVoiceIds,
  }
}

function toCompletedRunItem<T extends RunItem>(
  item: T,
  generation: GenerationRecord,
) {
  return {
    ...item,
    status: 'completed' as const,
    generation,
    error: null,
  }
}

function toFailedRunItem<T extends RunItem>(item: T, error: string) {
  return {
    ...item,
    status: 'failed' as const,
    generation: null,
    error,
  }
}

// Outcome of polling an async image job. `pending` means the poll window ran
// out while the worker was still producing the image — that is NOT a failure
// (the image lands in the gallery via callback), so it must never be surfaced
// as one. Only `failed` (the server reported FAILED) is a real failure.
type ImageJobPollOutcome =
  | { status: 'completed'; generation: GenerationRecord }
  | { status: 'failed'; message: string; code: GenerationErrorCode }
  | { status: 'pending' }

// ─── Hook ────────────────────────────────────────────────────────

export function useUnifiedGenerate(): UseUnifiedGenerateReturn {
  const [isGenerating, setIsGenerating] = useState(false)
  const [stage, setStage] = useState<GenerationStage>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<GenerationErrorCode | null>(null)
  const [lastGeneration, setLastGeneration] = useState<GenerationRecord | null>(
    null,
  )
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null)

  const lastRequestRef = useRef<UnifiedGenerateInput | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)
  const singleImageInFlightRef = useRef(false)
  /**
   * 队列里每一条自己的请求参数。
   *
   * ⚠ 不能靠 `lastRequestRef` 重试：它只存最后一次提交。队列里排了三条、想重试
   * 第 1 条时，拿到的会是第 3 条的参数 —— 重试出来的东西跟失败的那条无关。
   */
  const videoJobParamsRef = useRef(new Map<string, GenerateVideoRequest>())

  const tStudio = useTranslations('StudioV2')
  const tVideo = useTranslations('VideoGenerate')
  const tErrors = useTranslations('Errors')

  // 审查 D1：完成提示必须给"去向"——附"查看作品"直达动作，用户不再
  // 以为结果丢了。以 generation.id 作 toast id，变体/对比多次完成时去重。
  //
  // ⚠ 台账 L（owner 2026-08-29 真机）：这颗按钮原先是
  // `router.push(galleryGenerationPath(id))`，两处都错 ——
  //   ① **必然 404**：`/gallery/[id]` 只服务 `isPublic: true` 的行，而生成默认
  //      私有（schema `@default(false)`），所以它对每一张刚生成的图都注定
  //      notFound，不是偶发；
  //   ② **它是一次真导航**：工作台的全部编辑状态当场清空（参考图 / 提示词 /
  //      模型与规格），返回也回不来。owner 一次丢了 5 张参考 + 约 500 字提示词。
  // 改成在工作台内开详情浮层（`GenerationPreview` 早就持有那个
  // `ImageDetailModal`，点预览图就是开它），工作区一个字都不动。
  const notifySaved = useCallback(
    (generation: GenerationRecord | null | undefined, message: string) => {
      if (generation?.id) {
        toast.success(message, {
          id: `generation-saved-${generation.id}`,
          action: {
            label: tStudio('viewInGallery'),
            onClick: () => requestStudioResultDetail(generation.id),
          },
        })
      } else {
        toast.success(message)
      }
    },
    [tStudio],
  )

  // ── Timer/polling lifecycle ────────────────────────────────────

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    pollCountRef.current = 0
  }, [])

  const startTimer = useCallback(() => {
    stopTimer()
    setElapsedSeconds(0)
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
  }, [stopTimer])

  const finish = useCallback(
    (err?: string, code?: GenerationErrorCode | null) => {
      stopPolling()
      stopTimer()
      setIsGenerating(false)
      setStage('idle')
      if (err) {
        setError(err)
        setErrorCode(code ?? null)
        toast.error(err)
      }
    },
    [stopPolling, stopTimer],
  )

  useEffect(() => {
    return () => {
      stopTimer()
      stopPolling()
    }
  }, [stopTimer, stopPolling])

  const updateActiveRunItem = useCallback(
    (itemId: string, updater: (item: RunItem) => RunItem) => {
      setActiveRun((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item) =>
                item.id === itemId ? updater(item) : item,
              ),
            }
          : null,
      )
    },
    [],
  )

  const markActiveRunItemCompleted = useCallback(
    (itemId: string, generation: GenerationRecord) => {
      updateActiveRunItem(itemId, (item) =>
        toCompletedRunItem(item, generation),
      )
    },
    [updateActiveRunItem],
  )

  const markActiveRunItemFailed = useCallback(
    (itemId: string, errorMessage: string) => {
      updateActiveRunItem(itemId, (item) => toFailedRunItem(item, errorMessage))
    },
    [updateActiveRunItem],
  )

  // Resolve an API error payload into both a localized message (for display)
  // and a classification code (for the error dialog to pick its reason).
  const resolveGenerationError = useCallback(
    (
      payload: {
        error?: string
        errorCode?: string
        i18nKey?: string
        hasReferenceImage?: boolean
      },
      fallback: string,
    ): { message: string; code: GenerationErrorCode } => ({
      message: getGenerationErrorMessage(tErrors, payload, fallback),
      code:
        normalizeErrorCode(payload.errorCode) ??
        parseGenerationErrorCode(payload.error ?? '', {
          hasReferenceImage: payload.hasReferenceImage,
        }),
    }),
    [tErrors],
  )

  // Authoritative resolution of a finished image job from its server status.
  // Used when the poll window is exhausted: the worker (not the poll loop) is
  // the source of truth, so a generated image — already COMPLETED and in the
  // gallery — is never reported as a failure just because the UI stopped
  // polling. A still-RUNNING job resolves to `pending`, not a failure.
  const resolveImageJobFromStatus = useCallback(
    async (jobId: string, itemId: string): Promise<ImageJobPollOutcome> => {
      try {
        const statusResponse = await checkImageGenerationStatusAPI(jobId)
        if (statusResponse.success && statusResponse.data) {
          if (statusResponse.data.status === 'COMPLETED') {
            const generation = statusResponse.data.generation
            markActiveRunItemCompleted(itemId, generation)
            return { status: 'completed', generation }
          }
          if (statusResponse.data.status === 'FAILED') {
            const failure = resolveGenerationError(
              statusResponse.data,
              tStudio('generateFailed'),
            )
            markActiveRunItemFailed(itemId, failure.message)
            return { status: 'failed', ...failure }
          }
        }
      } catch {
        // Unknown — treat as still-pending, never a confirmed failure.
      }
      return { status: 'pending' }
    },
    [
      tStudio,
      markActiveRunItemCompleted,
      markActiveRunItemFailed,
      resolveGenerationError,
    ],
  )

  // ── Image generation (worker submit + poll) ───────────────────

  const generateImage = useCallback(
    async (input: StudioGenerateRequest): Promise<GenerationRecord | null> => {
      if (singleImageInFlightRef.current) return null
      singleImageInFlightRef.current = true

      setIsGenerating(true)
      setStage('generating')
      setError(null)
      setErrorCode(null)
      startTimer()

      // B0: Create ActiveRun with single item
      const itemId = crypto.randomUUID()
      setActiveRun({
        id: crypto.randomUUID(),
        mode: 'single',
        items: [
          {
            id: itemId,
            modelId: input.modelId ?? 'unknown',
            status: 'generating',
            generation: null,
            error: null,
          },
        ],
        selectedItemId: itemId,
        prompt: input.freePrompt ?? '',
        startedAt: Date.now(),
        outputType: 'IMAGE',
      })

      try {
        const result = await studioGenerateAPI(input)

        if (result.success && hasJobId(result.data)) {
          const { jobId } = result.data
          setStage('processing')
          pollCountRef.current = 0

          return await new Promise<GenerationRecord | null>((resolve) => {
            pollRef.current = setInterval(async () => {
              pollCountRef.current += 1

              if (pollCountRef.current > IMAGE_GENERATION.MAX_POLL_ATTEMPTS) {
                // Poll window exhausted. Don't blind-fail: check the job's
                // authoritative status once more. A generated image (COMPLETED,
                // already in the gallery) must never be reported as a failure
                // just because we stopped polling.
                const outcome = await resolveImageJobFromStatus(jobId, itemId)
                if (outcome.status === 'completed') {
                  setLastGeneration(outcome.generation)
                  finish()
                  notifySaved(outcome.generation, tStudio('generateSuccess'))
                  resolve(outcome.generation)
                } else if (outcome.status === 'failed') {
                  finish(outcome.message, outcome.code)
                  resolve(null)
                } else {
                  // Still running on the worker — it will finish and land in
                  // the gallery via callback. Say so, don't claim failure.
                  finish()
                  toast.info(tStudio('stillProcessingHint'))
                  resolve(null)
                }
                return
              }

              try {
                const statusResponse =
                  await checkImageGenerationStatusAPI(jobId)

                // Transient status-API error — skip this tick and keep polling
                // rather than fail a run the worker may still be completing.
                if (!statusResponse.success || !statusResponse.data) return

                const statusData = statusResponse.data

                if (statusData.status === 'COMPLETED') {
                  const generation = statusData.generation
                  setLastGeneration(generation)
                  markActiveRunItemCompleted(itemId, generation)
                  finish()
                  notifySaved(generation, tStudio('generateSuccess'))
                  resolve(generation)
                  return
                }

                if (statusData.status === 'FAILED') {
                  const { message, code } = resolveGenerationError(
                    statusData,
                    tStudio('generateFailed'),
                  )
                  markActiveRunItemFailed(itemId, message)
                  finish(message, code)
                  resolve(null)
                  return
                }

                if (statusData.status === 'IN_QUEUE') {
                  setStage('queued')
                  return
                }

                if (statusData.status === 'IN_PROGRESS') {
                  setStage('processing')
                }
              } catch {
                // Transient network blip — skip this tick, keep polling.
              }
            }, IMAGE_GENERATION.POLL_INTERVAL_MS)
          })
        }

        const { message, code } = resolveGenerationError(
          result,
          tStudio('generateFailed'),
        )
        setError(message)
        setErrorCode(code)
        markActiveRunItemFailed(itemId, message)
        return null
      } finally {
        singleImageInFlightRef.current = false
        stopTimer()
        setIsGenerating(false)
        setStage('idle')
      }
    },
    [
      tStudio,
      notifySaved,
      startTimer,
      stopTimer,
      finish,
      markActiveRunItemCompleted,
      markActiveRunItemFailed,
      resolveGenerationError,
      resolveImageJobFromStatus,
    ],
  )

  const pollImageJobForRunItem = useCallback(
    async (jobId: string, itemId: string): Promise<ImageJobPollOutcome> => {
      for (
        let attempt = 1;
        attempt <= IMAGE_GENERATION.MAX_POLL_ATTEMPTS;
        attempt += 1
      ) {
        await waitForPollInterval(IMAGE_GENERATION.POLL_INTERVAL_MS)

        try {
          const statusResponse = await checkImageGenerationStatusAPI(jobId)

          // Transient status-API error — skip this tick rather than fail a run
          // the worker may still be completing.
          if (!statusResponse.success || !statusResponse.data) continue

          const statusData = statusResponse.data

          if (statusData.status === 'COMPLETED') {
            const generation = statusData.generation
            markActiveRunItemCompleted(itemId, generation)
            return { status: 'completed', generation }
          }

          if (statusData.status === 'FAILED') {
            const failure = resolveGenerationError(
              statusData,
              tStudio('generateFailed'),
            )
            markActiveRunItemFailed(itemId, failure.message)
            return { status: 'failed', ...failure }
          }
        } catch {
          // Transient network blip — skip this tick, keep polling.
          continue
        }
      }

      // Poll window exhausted: trust the authoritative job status instead of
      // assuming failure — the worker may have produced the image already.
      return resolveImageJobFromStatus(jobId, itemId)
    },
    [
      tStudio,
      markActiveRunItemCompleted,
      markActiveRunItemFailed,
      resolveImageJobFromStatus,
      resolveGenerationError,
    ],
  )

  // ── Video generation (queue + per-item polling) ───────────────

  /**
   * 一条视频任务的轮询循环 —— **每条自己一份**，照 `pollImageJobForRunItem` 的
   * 形状写。
   *
   * ⚠ 这里以前是 `pollRef.current = setInterval(...)`，而 `pollRef` 是整个 hook
   * **共用的一个 ref**：排第二条时第一条的 interval 会被原样覆盖掉 —— 要么泄漏
   * 一个永不停的定时器，要么被下一次 `stopPolling()` 一起清掉，第一条从此再也
   * 不更新。视频能排队的前提就是先拆掉这个共享槽。
   */
  const pollVideoJobForRunItem = useCallback(
    async (jobId: string, itemId: string): Promise<GenerationRecord | null> => {
      for (
        let attempt = 1;
        attempt <= VIDEO_GENERATION.MAX_POLL_ATTEMPTS;
        attempt += 1
      ) {
        await waitForPollInterval(VIDEO_GENERATION.POLL_INTERVAL_MS)

        try {
          const statusResponse = await checkVideoStatusAPI(jobId)

          if (!statusResponse.success || !statusResponse.data) {
            // 提交后头几拍拿不到状态是正常的（job 还没落库）；超过容忍窗口才判失败。
            if (attempt <= VIDEO_GENERATION.EARLY_POLL_TOLERANCE) continue
            const { message } = resolveGenerationError(
              statusResponse,
              tVideo('errorFallback'),
            )
            markActiveRunItemFailed(itemId, message)
            return null
          }

          const statusData = statusResponse.data

          if (statusData.status === 'COMPLETED') {
            const generation = statusData.generation
            markActiveRunItemCompleted(itemId, generation)
            setLastGeneration(generation)
            notifySaved(generation, tVideo('toastSuccess'))
            return generation
          }

          if (statusData.status === 'FAILED') {
            const { message } = resolveGenerationError(
              statusData,
              tVideo('errorFallback'),
            )
            markActiveRunItemFailed(itemId, message)
            return null
          }
        } catch {
          // 网络抖一下：跳过这一拍继续轮询，不把整条判死。
          continue
        }
      }

      markActiveRunItemFailed(itemId, tVideo('errorTimeout'))
      return null
    },
    [
      tVideo,
      notifySaved,
      resolveGenerationError,
      markActiveRunItemCompleted,
      markActiveRunItemFailed,
    ],
  )

  /**
   * 提交一条视频任务并**立刻返回** —— 轮询在后台跑，结果落到它自己那个 item 上。
   *
   * ## 为什么不再 await 到完成
   *
   * 视频 1–5 分钟。旧版把整段等待做成一次 `await`，期间 `isGenerating` 恒为
   * true，于是参数栏所有控件禁用、生成按钮禁用 —— 用户除了盯着屏幕什么也做不了。
   * 现在 `isGenerating` 只覆盖**提交**那几百毫秒；「有几条在跑」由 run items 自己
   * 表达，队列条渲染它们。
   *
   * ## 失败只标这一条，不调 `finish(err)`
   *
   * ⚠ `finish(err)` 会 `setError` 并弹全局错误对话框、同时 `setIsGenerating(false)`
   * ＋停表。队列里第 1 条失败时调它，等于替还在跑的第 2、3 条宣布整轮结束。
   * 所以这里只 `markActiveRunItemFailed`，错误长在那一格上，可单条重试。
   */
  const generateVideo = useCallback(
    async (params: GenerateVideoRequest): Promise<GenerationRecord | null> => {
      setError(null)
      setErrorCode(null)

      const itemId = crypto.randomUUID()
      const startedAt = Date.now()
      const newItem: RunItem = {
        id: itemId,
        modelId: params.modelId,
        status: 'generating',
        generation: null,
        error: null,
        startedAt,
      }

      // 同一批就接在现有队列后面；上一批是别的模态（或还没有批次）就新起一批。
      setActiveRun((prev) =>
        prev && prev.outputType === 'VIDEO'
          ? { ...prev, items: [...prev.items, newItem], prompt: params.prompt }
          : {
              id: crypto.randomUUID(),
              mode: 'single',
              items: [newItem],
              selectedItemId: null,
              prompt: params.prompt,
              startedAt,
              outputType: 'VIDEO',
            },
      )
      videoJobParamsRef.current.set(itemId, params)

      setIsGenerating(true)
      setStage('queued')
      try {
        const submitResponse = await submitVideoAPI(params)
        if (!submitResponse.success || !submitResponse.data) {
          const { message, code } = resolveGenerationError(
            submitResponse,
            tVideo('errorFallback'),
          )
          markActiveRunItemFailed(itemId, message)
          // 提交就失败是**这一次动作**的失败（配额、鉴权、参数不合法），用户正等着
          // 按钮的回应，该报出来；轮询期间的失败才只标格子。
          setError(message)
          setErrorCode(code ?? null)
          toast.error(message)
          return null
        }

        setStage('processing')
        // 不 await：让按钮立刻可用，轮询自己把结果写回那一格。
        void pollVideoJobForRunItem(submitResponse.data.jobId, itemId)
        return null
      } catch (err) {
        const message =
          err instanceof Error ? err.message : tVideo('errorUnexpected')
        markActiveRunItemFailed(itemId, message)
        setError(message)
        toast.error(message)
        return null
      } finally {
        setIsGenerating(false)
        setStage('idle')
      }
    },
    [
      tVideo,
      resolveGenerationError,
      markActiveRunItemFailed,
      pollVideoJobForRunItem,
    ],
  )

  // ── B5: Variant generation (parallel seeds) ───────────────────

  const generateVariants = useCallback(
    async (
      input: StudioGenerateRequest,
      count: number,
    ): Promise<GenerationRecord | null> => {
      setIsGenerating(true)
      setStage('generating')
      setError(null)
      setErrorCode(null)
      startTimer()

      const runGroupId = crypto.randomUUID()
      const seeds = Array.from({ length: count }, () =>
        Math.floor(Math.random() * VARIANT_MAX_SEED),
      )
      const items = seeds.map((seed, idx) => ({
        id: crypto.randomUUID(),
        modelId: input.modelId ?? 'unknown',
        status: 'generating' as const,
        generation: null,
        error: null,
        seed,
        index: idx,
      }))

      setActiveRun({
        id: runGroupId,
        mode: 'variant',
        items,
        selectedItemId: null,
        prompt: input.freePrompt ?? '',
        startedAt: Date.now(),
        outputType: 'IMAGE',
      })

      try {
        // Each item resolves to its own UI update as soon as the API
        // returns, instead of blocking on the slowest seed before any
        // result lands. `firstSuccess` is whichever variant finishes
        // first — the natural "show me the fastest preview" behaviour.
        let firstSuccess: GenerationRecord | null = null
        let anyFailed = false
        const firstFailure = {
          current: null as {
            message: string
            code: GenerationErrorCode
          } | null,
        }

        const tasks = items.map(async (item) => {
          try {
            const result = await studioGenerateAPI({
              ...input,
              seed: item.seed,
              runGroupId,
              runGroupType: 'variant',
              runGroupIndex: item.index,
            })
            if (result.success && hasJobId(result.data)) {
              setStage('processing')
              const outcome = await pollImageJobForRunItem(
                result.data.jobId,
                item.id,
              )
              if (outcome.status === 'completed') {
                if (!firstSuccess) firstSuccess = outcome.generation
              } else if (outcome.status === 'failed') {
                anyFailed = true
                firstFailure.current ??= {
                  message: outcome.message,
                  code: outcome.code,
                }
              }
            } else {
              const failure = resolveGenerationError(
                result,
                tStudio('generateFailed'),
              )
              markActiveRunItemFailed(item.id, failure.message)
              anyFailed = true
              firstFailure.current ??= failure
            }
          } catch (error) {
            const failure = resolveGenerationError(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : tStudio('generateFailed'),
              },
              tStudio('generateFailed'),
            )
            markActiveRunItemFailed(item.id, failure.message)
            anyFailed = true
            firstFailure.current ??= failure
          }
        })

        await Promise.allSettled(tasks)

        if (firstSuccess) {
          setLastGeneration(firstSuccess)
          notifySaved(firstSuccess, tStudio('variantSuccess'))
        } else if (anyFailed) {
          setError(firstFailure.current?.message ?? tStudio('generateFailed'))
          setErrorCode(firstFailure.current?.code ?? null)
        } else {
          // Every variant is still generating on the worker — not a failure.
          toast.info(tStudio('stillProcessingHint'))
        }

        return firstSuccess
      } finally {
        stopTimer()
        setIsGenerating(false)
        setStage('idle')
      }
    },
    [
      tStudio,
      notifySaved,
      startTimer,
      stopTimer,
      pollImageJobForRunItem,
      markActiveRunItemFailed,
      resolveGenerationError,
    ],
  )

  // ── B5: Select variant winner ─────────────────────────────────

  const selectWinner = useCallback(
    async (generationId: string): Promise<void> => {
      const runGroupId = activeRun?.id
      if (
        !runGroupId ||
        (activeRun?.mode !== 'variant' && activeRun?.mode !== 'compare')
      )
        return

      // Optimistic update
      setActiveRun((prev) =>
        prev ? { ...prev, selectedItemId: generationId } : null,
      )

      const selectedGen = activeRun.items.find(
        (item) => item.generation?.id === generationId,
      )?.generation
      if (selectedGen) {
        setLastGeneration(selectedGen)
      }

      const result = await studioSelectWinnerAPI({
        runGroupId,
        generationId,
      })
      if (!result.success) {
        toast.error(result.error ?? tStudio('generateFailed'))
      }
    },
    [activeRun, tStudio],
  )

  // ── B4: Compare generation (parallel models) ──────────────────

  const generateCompare = useCallback(
    async (
      input: StudioGenerateRequest,
      models: CompareModelSelection[],
      perModelCount = 1,
    ): Promise<GenerationRecord | null> => {
      setIsGenerating(true)
      setStage('generating')
      setError(null)
      setErrorCode(null)
      startTimer()

      const runGroupId = crypto.randomUUID()
      // 矩阵：模型 × 每模型张数。两个轴同时展开，而不是二选一 ——
      // 「一次多张」和「多模型各一张」本来就是同一个控件的两个轴，
      // 分成两条路径就永远表达不了「4 个模型各 2 张」。
      // 同模型的多张各配一个随机 seed（张数=1 时不发 seed，保持与
      // 单模型单张的请求逐字节一致）。
      const items = models.flatMap((model, modelIdx) =>
        Array.from({ length: perModelCount }, (_, takeIdx) => ({
          id: crypto.randomUUID(),
          modelId: model.modelId,
          status: 'generating' as const,
          generation: null,
          error: null,
          apiKeyId: model.apiKeyId,
          index: modelIdx * perModelCount + takeIdx,
          seed:
            perModelCount > 1
              ? Math.floor(Math.random() * VARIANT_MAX_SEED)
              : undefined,
        })),
      )

      setActiveRun({
        id: runGroupId,
        // 两种 mode 都渲染同一片图墙（CompareGrid）；mode 只用来区分
        // 「这一轮是不是矩阵」，与渲染选择无关。
        mode: models.length > 1 ? 'compare' : 'variant',
        items,
        selectedItemId: null,
        prompt: input.freePrompt ?? '',
        startedAt: Date.now(),
        outputType: 'IMAGE',
      })

      try {
        // Each model in the compare set updates its own tile as soon as
        // its API call returns — fast providers no longer wait for the
        // slowest one before becoming visible.
        let firstSuccess: GenerationRecord | null = null
        let anyFailed = false
        const firstFailure = {
          current: null as {
            message: string
            code: GenerationErrorCode
          } | null,
        }

        const tasks = items.map(async (item) => {
          try {
            const result = await studioGenerateAPI({
              ...input,
              modelId: item.modelId,
              apiKeyId: item.apiKeyId,
              ...(item.seed === undefined ? {} : { seed: item.seed }),
              runGroupId,
              runGroupType: 'compare',
              runGroupIndex: item.index,
            })
            if (result.success && hasJobId(result.data)) {
              setStage('processing')
              const outcome = await pollImageJobForRunItem(
                result.data.jobId,
                item.id,
              )
              if (outcome.status === 'completed') {
                if (!firstSuccess) firstSuccess = outcome.generation
              } else if (outcome.status === 'failed') {
                anyFailed = true
                firstFailure.current ??= {
                  message: outcome.message,
                  code: outcome.code,
                }
              }
            } else {
              const failure = resolveGenerationError(
                result,
                tStudio('generateFailed'),
              )
              markActiveRunItemFailed(item.id, failure.message)
              anyFailed = true
              firstFailure.current ??= failure
            }
          } catch (error) {
            const failure = resolveGenerationError(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : tStudio('generateFailed'),
              },
              tStudio('generateFailed'),
            )
            markActiveRunItemFailed(item.id, failure.message)
            anyFailed = true
            firstFailure.current ??= failure
          }
        })

        await Promise.allSettled(tasks)

        if (firstSuccess) {
          setLastGeneration(firstSuccess)
          notifySaved(firstSuccess, tStudio('compareSuccess'))
        } else if (anyFailed) {
          setError(firstFailure.current?.message ?? tStudio('generateFailed'))
          setErrorCode(firstFailure.current?.code ?? null)
        } else {
          // Every model is still generating on the worker — not a failure.
          toast.info(tStudio('stillProcessingHint'))
        }

        return firstSuccess
      } finally {
        stopTimer()
        setIsGenerating(false)
        setStage('idle')
      }
    },
    [
      tStudio,
      notifySaved,
      startTimer,
      stopTimer,
      pollImageJobForRunItem,
      markActiveRunItemFailed,
      resolveGenerationError,
    ],
  )

  // ── Audio generation (worker submit + polling) ────────────────

  const generateAudio = useCallback(
    async (input: AudioGenerateInput): Promise<GenerationRecord | null> => {
      setIsGenerating(true)
      setStage('generating')
      setError(null)
      setErrorCode(null)
      startTimer()

      const itemId = crypto.randomUUID()
      setActiveRun({
        id: crypto.randomUUID(),
        mode: 'single',
        items: [
          {
            id: itemId,
            modelId: input.modelId,
            status: 'generating',
            generation: null,
            error: null,
          },
        ],
        selectedItemId: itemId,
        prompt: input.freePrompt ?? '',
        startedAt: Date.now(),
        outputType: 'AUDIO',
      })

      try {
        const result = await generateAudioAPI(buildAudioRequestPayload(input))

        if (result.success && hasJobId(result.data)) {
          const { jobId } = result.data
          setStage('queued')
          pollCountRef.current = 0

          return await new Promise<GenerationRecord | null>((resolve) => {
            pollRef.current = setInterval(async () => {
              pollCountRef.current += 1

              if (pollCountRef.current > AUDIO_GENERATION.MAX_POLL_ATTEMPTS) {
                const msg = tErrors('generation.provider_timeout')
                markActiveRunItemFailed(itemId, msg)
                finish(msg, GENERATION_ERROR_CODES.PROVIDER_TIMEOUT)
                resolve(null)
                return
              }

              try {
                const statusResponse = await checkAudioStatusAPI(jobId)

                if (!statusResponse.success || !statusResponse.data) {
                  const { message, code } = resolveGenerationError(
                    statusResponse,
                    tStudio('generateFailed'),
                  )
                  markActiveRunItemFailed(itemId, message)
                  finish(message, code)
                  resolve(null)
                  return
                }

                const statusData = statusResponse.data

                if (statusData.status === 'COMPLETED') {
                  const generation = statusData.generation
                  setLastGeneration(generation)
                  markActiveRunItemCompleted(itemId, generation)
                  finish()
                  notifySaved(generation, tStudio('generateSuccess'))
                  resolve(generation)
                  return
                }

                if (statusData.status === 'FAILED') {
                  const { message, code } = resolveGenerationError(
                    statusData,
                    tStudio('generateFailed'),
                  )
                  markActiveRunItemFailed(itemId, message)
                  finish(message, code)
                  resolve(null)
                  return
                }

                if (statusData.status === 'IN_QUEUE') {
                  setStage('queued')
                  return
                }

                if (statusData.status === 'IN_PROGRESS') {
                  setStage('processing')
                }
              } catch {
                const msg = tStudio('generateFailed')
                markActiveRunItemFailed(itemId, msg)
                finish(msg)
                resolve(null)
              }
            }, AUDIO_GENERATION.POLL_INTERVAL_MS)
          })
        }

        const { message, code } = resolveGenerationError(
          result,
          tStudio('generateFailed'),
        )
        setError(message)
        setErrorCode(code)
        markActiveRunItemFailed(itemId, message)
        return null
      } finally {
        stopTimer()
        setIsGenerating(false)
        setStage('idle')
      }
    },
    [
      tErrors,
      tStudio,
      notifySaved,
      startTimer,
      stopTimer,
      finish,
      markActiveRunItemCompleted,
      markActiveRunItemFailed,
      resolveGenerationError,
    ],
  )

  // ── Audio variants (N independent clips, A/B compare) ─────────

  const generateAudioVariants = useCallback(
    async (
      input: AudioGenerateInput,
      count: number,
    ): Promise<GenerationRecord | null> => {
      setIsGenerating(true)
      setStage('generating')
      setError(null)
      setErrorCode(null)
      startTimer()

      const runGroupId = crypto.randomUUID()
      const items = Array.from({ length: count }, (_, index) => ({
        id: crypto.randomUUID(),
        modelId: input.modelId,
        status: 'generating' as const,
        generation: null,
        error: null,
        index,
      }))
      setActiveRun({
        id: runGroupId,
        mode: 'variant',
        items,
        selectedItemId: null,
        prompt: input.freePrompt ?? '',
        startedAt: Date.now(),
        outputType: 'AUDIO',
      })

      const payload = buildAudioRequestPayload(input)
      let firstSuccess: GenerationRecord | null = null
      const firstFailure = {
        current: null as { message: string; code: GenerationErrorCode } | null,
      }
      const timeoutFailure = () => ({
        message: tErrors('generation.provider_timeout'),
        code: GENERATION_ERROR_CODES.PROVIDER_TIMEOUT,
      })

      // Each variant submits + polls on its own loop (the shared pollRef only
      // tracks one job), resolving its tile as soon as it finishes.
      const runOne = async (itemId: string): Promise<void> => {
        const submit = await generateAudioAPI(payload)
        if (!(submit.success && hasJobId(submit.data))) {
          const failure = resolveGenerationError(
            submit,
            tStudio('generateFailed'),
          )
          markActiveRunItemFailed(itemId, failure.message)
          firstFailure.current ??= failure
          return
        }
        const { jobId } = submit.data
        for (
          let attempt = 0;
          attempt < AUDIO_GENERATION.MAX_POLL_ATTEMPTS;
          attempt += 1
        ) {
          await waitForPollInterval(AUDIO_GENERATION.POLL_INTERVAL_MS)
          let statusResponse
          try {
            statusResponse = await checkAudioStatusAPI(jobId)
          } catch {
            markActiveRunItemFailed(itemId, tStudio('generateFailed'))
            firstFailure.current ??= {
              message: tStudio('generateFailed'),
              code: GENERATION_ERROR_CODES.UNKNOWN,
            }
            return
          }
          if (!statusResponse.success || !statusResponse.data) {
            const failure = resolveGenerationError(
              statusResponse,
              tStudio('generateFailed'),
            )
            markActiveRunItemFailed(itemId, failure.message)
            firstFailure.current ??= failure
            return
          }
          const statusData = statusResponse.data
          if (statusData.status === 'COMPLETED') {
            markActiveRunItemCompleted(itemId, statusData.generation)
            if (!firstSuccess) {
              firstSuccess = statusData.generation
              setLastGeneration(statusData.generation)
            }
            return
          }
          if (statusData.status === 'FAILED') {
            const failure = resolveGenerationError(
              statusData,
              tStudio('generateFailed'),
            )
            markActiveRunItemFailed(itemId, failure.message)
            firstFailure.current ??= failure
            return
          }
        }
        markActiveRunItemFailed(itemId, timeoutFailure().message)
        firstFailure.current ??= timeoutFailure()
      }

      try {
        await Promise.all(items.map((item) => runOne(item.id)))

        if (firstSuccess) {
          notifySaved(firstSuccess, tStudio('generateSuccess'))
          finish()
          return firstSuccess
        }
        const failure = firstFailure.current ?? {
          message: tStudio('generateFailed'),
          code: GENERATION_ERROR_CODES.UNKNOWN,
        }
        finish(failure.message, failure.code)
        return null
      } finally {
        stopTimer()
        setIsGenerating(false)
        setStage('idle')
      }
    },
    [
      tErrors,
      tStudio,
      notifySaved,
      startTimer,
      stopTimer,
      finish,
      markActiveRunItemCompleted,
      markActiveRunItemFailed,
      resolveGenerationError,
    ],
  )

  // ── Unified entry point ───────────────────────────────────────

  const generate = useCallback(
    async (input: UnifiedGenerateInput): Promise<GenerationRecord | null> => {
      lastRequestRef.current = input
      if (input.mode === 'image' && input.image) {
        // Image Studio no longer consumes LoRA — the LoRA domain owns its own
        // generation surface and injects loras there (see lora-domain-split).
        const image = input.image

        const count = input.variantCount ?? 1
        // 有额外模型 → 走矩阵（模型 × 张数）。单模型多张仍走 generateVariants，
        // 两者的 item 形状一致，图墙那一片会把它们合成同一个渲染。
        if (input.compareModels?.length) {
          return generateCompare(image, input.compareModels, count)
        }
        if (count > 1) {
          return generateVariants(image, count)
        }
        return generateImage(image)
      }
      if (input.mode === 'video' && input.video) {
        return generateVideo(input.video)
      }
      if (input.mode === 'audio' && input.audio) {
        const count = input.audio.variantCount ?? 1
        if (count > 1) {
          return generateAudioVariants(input.audio, count)
        }
        return generateAudio(input.audio)
      }
      return null
    },
    [
      generateImage,
      generateVariants,
      generateCompare,
      generateVideo,
      generateAudio,
      generateAudioVariants,
    ],
  )

  const retry = useCallback(async (): Promise<GenerationRecord | null> => {
    if (isGenerating || !lastRequestRef.current) {
      return null
    }

    return generate(lastRequestRef.current)
  }, [generate, isGenerating])

  /**
   * 队列里还在跑的条数 —— 队列闸与「再排一条」的按钮态都读它。
   *
   * ⚠ 只数**当前批次且是视频**的：三个模态共用一个 `activeRun` 槽，不加模态守卫
   * 会把上一批图片也数进来。
   */
  const activeVideoJobCount =
    activeRun?.outputType === 'VIDEO'
      ? activeRun.items.filter((item) => item.status === 'generating').length
      : 0

  /**
   * 还能不能再排一条。
   *
   * ⚠ 判据取 `MAX_ACTIVE_JOBS_PER_USER`（4）—— 它服务端只管**平台出资**的请求，
   * BYOK 不受限，所以前端这道闸对自带 key 的用户偏严。宁可偏严：多拦一条比让
   * 第 5 条吃 429、在队列里显示成一个没人看得懂的失败要好。真要放开，得先让
   * 前端拿得到出资方（`isPlatformFunded` 今天只在服务端读）。
   */
  const canQueueMoreVideo =
    activeVideoJobCount < PLATFORM_GENERATION_GUARD.MAX_ACTIVE_JOBS_PER_USER

  /**
   * 重试队列里的某一条 —— 用**它自己**当初的参数重放，原地换成新的一条。
   */
  const retryVideoQueueItem = useCallback(
    async (itemId: string): Promise<void> => {
      const params = videoJobParamsRef.current.get(itemId)
      if (!params) return
      // 先把失败那条摘掉，再排一条新的：留着旧的会让队列里出现两条同义项，
      // 而它们的 jobId 不同、状态各自演进，读起来像「重试了两次」。
      setActiveRun((prev) =>
        prev
          ? { ...prev, items: prev.items.filter((item) => item.id !== itemId) }
          : null,
      )
      videoJobParamsRef.current.delete(itemId)
      await generateVideo(params)
    },
    [generateVideo],
  )

  const reset = useCallback(() => {
    setError(null)
    setErrorCode(null)
    setLastGeneration(null)
    setStage('idle')
    setElapsedSeconds(0)
    setActiveRun(null)
    lastRequestRef.current = null
    stopTimer()
    stopPolling()
  }, [stopTimer, stopPolling])

  return {
    isGenerating,
    stage,
    elapsedSeconds,
    error,
    errorCode,
    lastGeneration,
    generate,
    retry,
    reset,
    activeRun,
    selectWinner,
    activeVideoJobCount,
    canQueueMoreVideo,
    retryVideoQueueItem,
  }
}
