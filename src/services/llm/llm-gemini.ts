import 'server-only'

/** Gemini：文本 / 多模态（含视频上传）缓冲补全。（o-llm 拆分，2026-11-01；见 docs/design/llm.md） */

import { z } from 'zod'
import {
  VIDEO_ANALYSIS,
  VIDEO_ANALYSIS_MIN_OUTPUT_TOKENS,
} from '@/constants/video-analysis'
import { ASSISTANT_MEDIA_LIMITS } from '@/constants/assistant'
import { AI_PROVIDER_ENDPOINTS, LLM_TEXT_TIMEOUTS_MS } from '@/constants/config'
import { classifyVideoLink, buildYoutubeWatchUrl } from '@/lib/video-link'
import { VIDEO_LINK_KINDS } from '@/constants/video-link'
import { fetchAsBuffer } from '@/services/storage/r2'
import { logger } from '@/lib/logger'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { LLM_STRUCTURED_OUTPUT_MODELS } from '@/constants/llm-capability'
import { ApiRequestError } from '@/lib/errors'
import {
  LLM_TEXT_MODELS,
  type LlmTextInput,
  type LlmTextUsage,
  type VideoAnalysisWindow,
  compactUsage,
  fetchLlmTextBuffered,
  getLlmImages,
  mediaRequestSignal,
  prepareInlineImages,
  readLlmErrorBody,
  reportUsage,
  serializeLlmRequest,
  toLlmTextProviderError,
  withImageLabels,
} from '@/services/llm/llm-core'

// ─── Response Schemas ────────────────────────────────────────────

const GeminiTextResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(
                z.object({
                  text: z.string().optional(),
                  /** 思考摘要（流式请求带 `includeThoughts`），不是回答正文。 */
                  thought: z.boolean().optional(),
                }),
              )
              .optional(),
          })
          .optional(),
        /**
         * ⚠ 这两个字段**必须留着**：Gemini 会用 HTTP 200 + 空 parts 表达「被安全策略
         * 拦了」「输出被截断了」，真正的原因只在这里。以前 schema 把它们丢掉，错误
         * 就只剩一句「No text response from Gemini」——生产上撞到时无法归因
         * （2026-08-19 真实事故）。**大声报错 ≠ 可归因。**
         */
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
})

const GeminiFileUploadResponseSchema = z.object({
  file: z.object({
    name: z.string(),
    uri: z.string(),
    mimeType: z.string().optional(),
    state: z.string().optional(),
  }),
})

const GeminiFileStatusSchema = z.object({
  name: z.string(),
  uri: z.string().optional(),
  mimeType: z.string().optional(),
  state: z.string().optional(),
})

const GeminiUsageSchema = z.object({
  usageMetadata: z.object({
    promptTokenCount: z.number().nullish(),
    candidatesTokenCount: z.number().nullish(),
    thoughtsTokenCount: z.number().nullish(),
    cachedContentTokenCount: z.number().nullish(),
  }),
})

function readGeminiUsage(value: unknown): LlmTextUsage | null {
  const parsed = GeminiUsageSchema.safeParse(value)
  if (!parsed.success) return null
  const usage = parsed.data.usageMetadata
  return compactUsage({
    inputTokens: usage.promptTokenCount,
    outputTokens: usage.candidatesTokenCount,
    reasoningTokens: usage.thoughtsTokenCount,
    cachedInputTokens: usage.cachedContentTokenCount,
    cacheWriteTokens: null,
  })
}

interface GeminiVideoPartResult {
  part: Record<string, unknown>
  /**
   * 这一部分是**指向外部链接**的 fileUri（YouTube 直传），不是我们上传的文件。
   * 403 的语义因此完全不同 —— 见 `toLlmTextProviderError` 的视频分支。
   */
  linkedVideo?: boolean
}

/**
 * `videoMetadata` 的线上形状：偏移量是 Duration 字符串（`"60s"`），fps 是数字。
 * 全省 = 不发这个字段（全片 + provider 默认帧率）。
 */
function toGeminiVideoMetadata(
  analysisWindow: VideoAnalysisWindow | undefined,
): Record<string, unknown> | null {
  const fps = analysisWindow?.fps ?? VIDEO_ANALYSIS.defaultFps
  const startOffset =
    analysisWindow?.startOffset ?? VIDEO_ANALYSIS.defaultStartOffsetSeconds
  const endOffset =
    analysisWindow?.endOffset ?? VIDEO_ANALYSIS.defaultEndOffsetSeconds

  const metadata = {
    ...(typeof fps === 'number' ? { fps } : {}),
    ...(typeof startOffset === 'number'
      ? { startOffset: `${startOffset}s` }
      : {}),
    ...(typeof endOffset === 'number' ? { endOffset: `${endOffset}s` } : {}),
  }
  return Object.keys(metadata).length > 0 ? metadata : null
}

function waitForGeminiFilePoll(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, ASSISTANT_MEDIA_LIMITS.geminiFilePollIntervalMs)
    signal?.addEventListener('abort', abort, { once: true })
  })
}

async function uploadGeminiVideoFile(
  buffer: Buffer,
  mimeType: string,
  apiKey: string,
  signal: AbortSignal | undefined,
  onUploaded: (name: string) => void,
): Promise<{ name: string; uri: string; mimeType: string }> {
  signal = mediaRequestSignal(signal)
  signal.throwIfAborted()
  const startResponse = await fetch(AI_PROVIDER_ENDPOINTS.GEMINI_FILES_UPLOAD, {
    signal,
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(buffer.byteLength),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'assistant-reference' } }),
  })
  if (!startResponse.ok) {
    const detail = await readLlmErrorBody(startResponse, signal)
    throw new Error(
      `Gemini video upload could not start (${startResponse.status}): ${detail.slice(0, 200)}`,
    )
  }

  const uploadUrl = startResponse.headers.get('x-goog-upload-url')
  if (!uploadUrl) {
    throw new Error('Gemini video upload did not return an upload URL.')
  }

  const uploadBody = new Uint8Array(buffer.byteLength)
  uploadBody.set(buffer)
  const uploadResponse = await fetch(uploadUrl, {
    signal,
    method: 'POST',
    headers: {
      'Content-Length': String(buffer.byteLength),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: uploadBody,
  })
  if (!uploadResponse.ok) {
    const detail = await readLlmErrorBody(uploadResponse, signal)
    throw new Error(
      `Gemini video upload failed (${uploadResponse.status}): ${detail.slice(0, 200)}`,
    )
  }

  const payload: unknown = await uploadResponse.json()
  const uploadedName = z
    .object({
      file: GeminiFileUploadResponseSchema.shape.file.pick({ name: true }),
    })
    .safeParse(payload)
  if (uploadedName.success) onUploaded(uploadedName.data.file.name)
  const uploaded = GeminiFileUploadResponseSchema.parse(payload).file
  const deadline = Date.now() + ASSISTANT_MEDIA_LIMITS.geminiFilePollTimeoutMs
  let current: z.infer<typeof GeminiFileStatusSchema> = uploaded

  while (current.state === 'PROCESSING') {
    if (Date.now() >= deadline) {
      throw new Error('Gemini video processing timed out.')
    }
    await waitForGeminiFilePoll(signal)
    const fileId = current.name.replace(/^files\//, '')
    const statusResponse = await fetch(
      `${AI_PROVIDER_ENDPOINTS.GEMINI_FILES}/${fileId}`,
      { headers: { 'x-goog-api-key': apiKey }, signal },
    )
    if (!statusResponse.ok) {
      throw new Error(
        `Gemini video processing status failed (${statusResponse.status}).`,
      )
    }
    current = GeminiFileStatusSchema.parse(await statusResponse.json())
  }

  if (current.state === 'FAILED' || !current.uri) {
    throw new Error('Gemini could not process the attached video.')
  }

  return {
    name: current.name,
    uri: current.uri,
    mimeType: current.mimeType ?? mimeType,
  }
}

async function toGeminiVideoPart(
  videoUrl: string,
  apiKey: string,
  videoAnalysis: VideoAnalysisWindow | undefined,
  signal: AbortSignal | undefined,
  onUploaded: (name: string) => void,
): Promise<GeminiVideoPartResult> {
  signal?.throwIfAborted()
  const videoMetadata = toGeminiVideoMetadata(videoAnalysis)
  const withMetadata = (part: Record<string, unknown>) =>
    videoMetadata ? { ...part, videoMetadata } : part

  // ⚠ **YouTube 分支必须在 fetch 之前**（§4.2 点名的实现陷阱）：YouTube 页面是
  // `text/html`，先抓再验 content-type 的话下面那道 `video/` 校验会把它拒掉，
  // 而 Gemini 根本不需要我们去抓 —— `fileData.fileUri` 直接吃页面 URL
  // （🔬 切片 0 实测：18m41s 直传 HTTP 200；1 小时 326k token 也没撞上限）。
  // 免下载、零存储、不占我们 50MB 的帽。
  const classification = classifyVideoLink(videoUrl)
  if (classification.kind === VIDEO_LINK_KINDS.youtube) {
    return {
      part: withMetadata({
        fileData: { fileUri: buildYoutubeWatchUrl(classification.videoId) },
      }),
      linkedVideo: true,
    }
  }

  const { buffer, mimeType } = await fetchAsBuffer(videoUrl, {
    maxBytes: ASSISTANT_MEDIA_LIMITS.maxVideoBytes,
    signal: mediaRequestSignal(signal),
  })
  if (!mimeType.startsWith('video/')) {
    throw new Error('Assistant video reference did not resolve to a video.')
  }

  if (buffer.byteLength < ASSISTANT_MEDIA_LIMITS.geminiInlineMaxBytes) {
    return {
      part: withMetadata({
        inlineData: { mimeType, data: buffer.toString('base64') },
      }),
    }
  }

  const uploaded = await uploadGeminiVideoFile(
    buffer,
    mimeType,
    apiKey,
    signal,
    onUploaded,
  )
  return {
    part: withMetadata({
      fileData: {
        mimeType: uploaded.mimeType,
        fileUri: uploaded.uri,
      },
    }),
  }
}

async function deleteGeminiUploadedFile(
  name: string,
  apiKey: string,
): Promise<void> {
  const fileId = name.replace(/^files\//, '')
  const response = await fetch(
    `${AI_PROVIDER_ENDPOINTS.GEMINI_FILES}/${fileId}`,
    {
      method: 'DELETE',
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(LLM_TEXT_TIMEOUTS_MS.COMPLETION),
    },
  )
  if (!response.ok) {
    logger.warn('Gemini assistant video cleanup failed', {
      fileId,
      status: response.status,
    })
  }
}

/**
 * ⚠ **坑 1（§4.3.2）**：thinking token 从 `maxOutputTokens` 里扣，给 800 实测只
 * 剩 31 字正文 + `finishReason=MAX_TOKENS`。带视频的一轮**只抬不降**到
 * `VIDEO_ANALYSIS_MIN_OUTPUT_TOKENS`。
 *
 * `providerManagedOutput` 那条路本来就不发这个字段（模型自身上限远高于 3000），
 * 助手线走的正是它 —— 这道闸是给**显式指定预算**的调用方兜底的。
 */
function resolveGeminiMaxOutputTokens(
  input: LlmTextInput,
  hasVideoPart: boolean,
): number | null {
  if (input.providerManagedOutput || !input.maxTokens) return null
  return hasVideoPart
    ? Math.max(input.maxTokens, VIDEO_ANALYSIS_MIN_OUTPUT_TOKENS)
    : input.maxTokens
}

/**
 * Uploaded video files are returned rather than deleted here — the caller
 * deletes them once the response body has been read.
 */
async function buildGeminiRequest(input: LlmTextInput): Promise<{
  modelId: string
  baseUrl: string
  body: string
  uploadedVideoNames: string[]
  /** 请求里带了指向外部链接的视频（YouTube 直传）—— 403 的翻译要换一套。 */
  hasLinkedVideo: boolean
}> {
  const modelId = input.modelId ?? LLM_TEXT_MODELS[AI_ADAPTER_TYPES.GEMINI]
  const baseUrl = input.providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.GEMINI

  const uploadedVideoNames: string[] = []
  try {
    const parts: Array<Record<string, unknown>> = []

    if (input.imageData) {
      const imageParts = await prepareInlineImages(
        getLlmImages(input),
        AI_ADAPTER_TYPES.GEMINI,
        input.signal,
      )
      parts.push(
        ...withImageLabels<Record<string, unknown>>(
          input,
          imageParts.map((inlineData) => ({ inlineData })),
          (text) => ({ text }),
        ),
      )
    }

    let hasVideoPart = false
    let hasLinkedVideo = false
    if (input.videoData) {
      const videos = Array.isArray(input.videoData)
        ? input.videoData
        : [input.videoData]
      const videoResults = await Promise.allSettled(
        videos.map((video) =>
          toGeminiVideoPart(
            video,
            input.apiKey,
            input.videoAnalysis,
            input.signal,
            (name) => uploadedVideoNames.push(name),
          ),
        ),
      )
      const videoParts = videoResults.map((result) => {
        if (result.status === 'rejected') throw result.reason
        return result.value
      })
      parts.push(...videoParts.map((entry) => entry.part))
      hasVideoPart = videoParts.length > 0
      hasLinkedVideo = videoParts.some((entry) => entry.linkedVideo === true)
    }

    if (input.audioData?.length) {
      const audioResults = await Promise.allSettled(
        input.audioData.map(async (url) => {
          const { buffer, mimeType } = await fetchAsBuffer(url, {
            maxBytes: ASSISTANT_MEDIA_LIMITS.geminiInlineMaxBytes,
            signal: mediaRequestSignal(input.signal),
          })
          if (!mimeType.startsWith('audio/')) {
            throw new Error(
              'Assistant audio reference did not resolve to audio.',
            )
          }
          return { inlineData: { mimeType, data: buffer.toString('base64') } }
        }),
      )
      const audioParts = audioResults.map((result) => {
        if (result.status === 'rejected') throw result.reason
        return result.value
      })
      parts.push(...audioParts)
    }

    parts.push({ text: input.userPrompt })

    const maxOutputTokens = resolveGeminiMaxOutputTokens(input, hasVideoPart)

    return {
      modelId,
      baseUrl,
      uploadedVideoNames,
      hasLinkedVideo,
      body: serializeLlmRequest(input, {
        systemInstruction: {
          parts: [{ text: input.systemPrompt }],
        },
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['TEXT'],
          ...(maxOutputTokens ? { maxOutputTokens } : {}),
          ...(input.reasoningEffort
            ? { thinkingConfig: { thinkingLevel: input.reasoningEffort } }
            : {}),
          ...(input.responseFormat === 'json_object'
            ? {
                responseMimeType: 'application/json',
                ...(input.jsonSchema &&
                LLM_STRUCTURED_OUTPUT_MODELS[AI_ADAPTER_TYPES.GEMINI]?.includes(
                  modelId,
                )
                  ? { responseJsonSchema: input.jsonSchema }
                  : {}),
              }
            : {}),
        },
      }),
    }
  } catch (error) {
    await Promise.allSettled(
      uploadedVideoNames.map((name) =>
        deleteGeminiUploadedFile(name, input.apiKey),
      ),
    )
    throw error
  }
}

/**
 * Gemini 用 **HTTP 200 + 空 parts** 表达好几种失败，真因只在 `finishReason` /
 * `promptFeedback.blockReason` 里。把它们翻成可归因的错误，别再丢。
 *
 * 2026-08-19 生产事故：这里原本抛裸 `Error('No text response from Gemini')`，
 * 被 `api-route-factory` 兜成 500 INTERNAL_ERROR，用户只看到「发生了意外错误」，
 * 排查时完全分不清是内容被拦、输出被截断，还是真的挂了。
 */
function buildGeminiNoTextError(
  data: z.infer<typeof GeminiTextResponseSchema>,
  modelId: string,
): ApiRequestError {
  const blockReason = data.promptFeedback?.blockReason
  const finishReason = data.candidates?.[0]?.finishReason

  if (blockReason) {
    return new ApiRequestError(
      'ASSISTANT_CONTENT_BLOCKED',
      422,
      'errors.assistant.contentBlocked',
      `Gemini blocked the request (blockReason=${blockReason}, model=${modelId}).`,
    )
  }
  if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
    return new ApiRequestError(
      'ASSISTANT_CONTENT_BLOCKED',
      422,
      'errors.assistant.contentBlocked',
      `Gemini stopped on safety (finishReason=${finishReason}, model=${modelId}).`,
    )
  }
  if (finishReason === 'MAX_TOKENS') {
    // thinking token 也从输出预算里扣 —— 预算紧时会出现「思考完了没剩下正文」。
    return new ApiRequestError(
      'ASSISTANT_OUTPUT_TRUNCATED',
      502,
      'errors.assistant.outputTruncated',
      `Gemini hit the output cap before emitting text (model=${modelId}).`,
    )
  }
  return new ApiRequestError(
    'ASSISTANT_NO_TEXT_RESPONSE',
    502,
    'errors.assistant.noTextResponse',
    `Gemini returned no text (finishReason=${finishReason ?? 'unknown'}, model=${modelId}).`,
  )
}

export async function geminiTextCompletion(
  input: LlmTextInput,
): Promise<string> {
  const { modelId, baseUrl, body, uploadedVideoNames, hasLinkedVideo } =
    await buildGeminiRequest(input)
  const endpoint = `${baseUrl}/${modelId}:generateContent`

  try {
    const response = await fetchLlmTextBuffered(
      endpoint,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': input.apiKey,
          'Content-Type': 'application/json',
        },
        body,
      },
      { adapterType: AI_ADAPTER_TYPES.GEMINI, modelId },
      input.signal,
    )
    if (!response.ok) {
      const errorBody = await readLlmErrorBody(response, input.signal)
      throw toLlmTextProviderError(response.status, errorBody, {
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        modelId,
        hasLinkedVideo,
      })
    }

    const json: unknown = await response.json()
    reportUsage(input, readGeminiUsage(json))
    const parsed = GeminiTextResponseSchema.safeParse(json)
    if (!parsed.success) throw parsed.error
    const data = parsed.data
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('')

    if (
      !text.trim() ||
      data.promptFeedback?.blockReason ||
      (data.candidates?.[0]?.finishReason &&
        data.candidates[0].finishReason !== 'STOP')
    ) {
      throw buildGeminiNoTextError(data, modelId)
    }

    return text.trim()
  } finally {
    await Promise.allSettled(
      uploadedVideoNames.map((name) =>
        deleteGeminiUploadedFile(name, input.apiKey),
      ),
    )
  }
}
