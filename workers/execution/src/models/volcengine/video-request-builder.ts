/**
 * VolcEngine (火山方舟) Seedance video request builder — execution worker side.
 *
 * Mirrors `buildVolcEngineVideoQueueBody` in
 * `src/services/providers/volcengine.adapter.ts`. The duplication is the house
 * convention: the worker is a separate bundle and cannot import from `src/`.
 * Keep the two in sync.
 *
 * Wire shape (https://www.volcengine.com/docs/82379/1520757):
 *   POST {base}/contents/generations/tasks      → { id }
 *   GET  {base}/contents/generations/tasks/{id} → { status, content:{ video_url } }
 */

export const VOLCENGINE_PROVIDER_ID = 'volcengine'
export const BYTEPLUS_PROVIDER_ID = 'byteplus'

/** Ark, cn-beijing. Overridden by `providerInput.providerBaseUrl` when present. */
export const VOLCENGINE_DEFAULT_BASE_URL =
  'https://ark.cn-beijing.volces.com/api/v3'

export function isVolcEngineProviderId(providerId: string): boolean {
  return (
    providerId === VOLCENGINE_PROVIDER_ID || providerId === BYTEPLUS_PROVIDER_ID
  )
}

const MAX_SEED = 2_147_483_647

/**
 * Seedance 2.0 series duration window, per 火山's model list (时长: 4~15 秒).
 * ⚠ Not 2~12 — that was the 1.0-pro window, and clamping to it silently
 * truncated a 15s request to 12s.
 */
const MIN_DURATION = 4
const MAX_DURATION = 15
const DEFAULT_DURATION = 5

/** Multimodal caps: ≤9 reference images, ≤3 videos, ≤3 audio clips. */
/**
 * 走**参考端点**（多模态参考）的内部 modelId。
 *
 * ⚠ 必须用内部 id：火山的参考端点与普通端点共用同一个 `externalModelId`，那边分不出。
 * ⚠ 接 BytePlus 时要把它的参考端点 id 一并加进来。
 */
const REFERENCE_ENDPOINT_MODEL_IDS = new Set<string>([
  'seedance-2.0-reference-volcengine',
  'seedance-2.0-fast-reference-volcengine',
  'seedance-2.5-reference-volcengine',
  'seedance-2.0-reference-byteplus',
  'seedance-2.0-fast-reference-byteplus',
  'seedance-2.5-reference-byteplus',
])

const SEEDANCE_25_MODEL_IDS = new Set<string>([
  'seedance-2.5-volcengine',
  'seedance-2.5-reference-volcengine',
  'seedance-2.5-byteplus',
  'seedance-2.5-reference-byteplus',
])

/**
 * The fast tier tops out at 720p; asking for 1080p there is a 400.
 *
 * ⚠ 这里键的是 **externalModelId**（`resolveResolution` 的入参就是它），与 src 侧
 * 那份镜像键的维度不同 —— src 侧键内部 id。两边都对，但**别把值互相抄过去**。
 * 普通 fast 与 fast-reference 共用同一个外部 id，一条就够。
 */
const FAST_MODEL_IDS = new Set([
  'doubao-seedance-2-0-fast-260128',
  'dreamina-seedance-2-0-fast-260128',
])

const ADAPTIVE_RATIO = 'adaptive'

/**
 * 只有 2.5 的**关键帧档**吃这条：首帧 / 首尾帧场景 `ratio` 必须是 `adaptive`。
 * 键的是**内部** modelId —— 2.5 的参考端点与关键帧端点共用同一个 externalModelId，
 * 拿外部 id 分不开这两个场景。
 */
const ADAPTIVE_RATIO_MODEL_IDS = new Set<string>([
  'seedance-2.5-volcengine',
  'seedance-2.5-byteplus',
])

export interface VolcEngineVideoBuilderInput {
  prompt: string
  modelId: string
  externalModelId: string
  aspectRatio?: string
  duration?: number | 'auto'
  referenceImage?: string
  referenceImages?: string[]
  videoUrls?: string[]
  audioUrls?: string[]
  resolution?: string
  videoDefaults?: Record<string, unknown>
  generateAudio?: boolean
  seed?: number
}

function readVideoDefault(
  videoDefaults: Record<string, unknown> | undefined,
  key: string,
): unknown {
  return videoDefaults ? videoDefaults[key] : undefined
}

function resolveResolution(
  externalModelId: string,
  requested: string | undefined,
): string | undefined {
  if (FAST_MODEL_IDS.has(externalModelId) && requested === '1080p') {
    return '720p'
  }
  return requested
}

export function buildVolcEngineVideoRequest(
  input: VolcEngineVideoBuilderInput,
): Record<string, unknown> {
  const isSeedance25 = SEEDANCE_25_MODEL_IDS.has(input.modelId)
  const maxReferenceImages = isSeedance25 ? 30 : 9
  const maxReferenceVideos = isSeedance25 ? 10 : 3
  const maxReferenceAudio = isSeedance25 ? 10 : 3
  const content: Record<string, unknown>[] = [
    { type: 'text', text: input.prompt },
  ]

  const referenceImageUrls =
    input.referenceImages && input.referenceImages.length > 0
      ? input.referenceImages
      : input.referenceImage
        ? [input.referenceImage]
        : []
  const referenceVideoUrls = (input.videoUrls ?? []).slice(
    0,
    maxReferenceVideos,
  )
  const referenceAudioUrls = (input.audioUrls ?? []).slice(0, maxReferenceAudio)

  // ark 的三个场景互斥：first-frame i2v / first+last frame / multimodal reference。
  //
  // ⚠ 判据从「数输入个数」改成「**看端点**」。旧判据是「图 >1 张 或 有视频/音频」——
  // 于是两张关键帧（首帧 + 尾帧）会被判成多模态参考，全部按 `reference_image` 发出，
  // 视频不会以第二张结尾。首尾帧从未生效，第 ⑤ 层就卡在这一句上（cleanup §1）。
  //
  // 端点由**节点上的模式**选定（关键帧 / 多图参考 / 全能参考），所以场景本来就已经
  // 定了，不该在这里再从输入反推一次。
  //
  // ⚠ 火山的参考端点与普通端点共用同一个 `externalModelId`（都是
  // `doubao-seedance-2-0-260128`），靠 content 里的 role 区分场景 —— 所以只能用我们
  // **内部**的 modelId 判，不能用 externalModelId。
  //
  // ⚠ 保留「有视频/音频就升级成参考模式」这一路兜底：发送链路按模式过滤还没做
  // （切片 6 待办），关键帧档的节点仍可能采集到视频/音频。直接砍掉这一条会把它们
  // 静默丢掉 —— 那正是这一轮一路在治的那类缺陷。
  const isReferenceEndpoint = REFERENCE_ENDPOINT_MODEL_IDS.has(input.modelId)
  const useReferenceMode =
    isReferenceEndpoint ||
    referenceVideoUrls.length > 0 ||
    referenceAudioUrls.length > 0

  if (useReferenceMode) {
    for (const url of referenceImageUrls.slice(0, maxReferenceImages)) {
      content.push({
        type: 'image_url',
        image_url: { url },
        role: 'reference_image',
      })
    }
    for (const url of referenceVideoUrls) {
      content.push({
        type: 'video_url',
        video_url: { url },
        role: 'reference_video',
      })
    }
    // Seedance 2.0 requires a visual reference alongside audio; 2.5 permits
    // audio-only reference on the native Ark line.
    if (
      isSeedance25 ||
      referenceImageUrls.length > 0 ||
      referenceVideoUrls.length > 0
    ) {
      for (const url of referenceAudioUrls) {
        content.push({
          type: 'audio_url',
          audio_url: { url },
          role: 'reference_audio',
        })
      }
    }
  } else if (referenceImageUrls.length >= 2) {
    // 首尾帧：两条 image_url 并列，role 分别是 first_frame / last_frame（官方示例
    // 就是这个形状）。顺序由采集端保证 —— `orderKeyframes` 按 imageCategory 把首帧
    // 排在尾帧前面，这里只按位置取。
    content.push({
      type: 'image_url',
      image_url: { url: referenceImageUrls[0] },
      role: 'first_frame',
    })
    content.push({
      type: 'image_url',
      image_url: { url: referenceImageUrls[1] },
      role: 'last_frame',
    })
  } else if (referenceImageUrls.length === 1) {
    content.push({
      type: 'image_url',
      image_url: { url: referenceImageUrls[0] },
      role: 'first_frame',
    })
  }

  const body: Record<string, unknown> = {
    model: input.externalModelId,
    content,
  }

  // 2.5 的关键帧档带图时 `ratio` 只收 `adaptive`，传具体宽高比会 400（火山「视频生成
  // 教程」使用限制段）。参考端点不在这条约束里。
  //
  // ⚠ src 侧的同一条规则住在发送契约里（`constants/video-model-send-plan.ts` 的
  // `imageAspectRatioLock`）—— worker 进不到那份代码，这里是**手抄的镜像**，改一边
  // 要手动同步另一边（vitest 也测不到 worker 这份）。
  // ⚠ 判据是这次请求里**到底有没有图**，不是模型 id —— 同一个模型纯文生视频不受限。
  const hasImageContent = content.some((item) => item.type === 'image_url')
  if (hasImageContent && ADAPTIVE_RATIO_MODEL_IDS.has(input.modelId)) {
    body.ratio = ADAPTIVE_RATIO
  } else if (input.aspectRatio) {
    body.ratio = input.aspectRatio
  }

  // ark has no 'auto' literal — coerce it to the default.
  const maxDuration = isSeedance25 ? 30 : MAX_DURATION
  body.duration =
    typeof input.duration === 'number'
      ? Math.min(
          maxDuration,
          Math.max(MIN_DURATION, Math.round(input.duration)),
        )
      : DEFAULT_DURATION

  const requestedResolution =
    input.resolution ??
    (readVideoDefault(input.videoDefaults, 'resolution') as string | undefined)
  const effectiveResolution = resolveResolution(
    input.externalModelId,
    requestedResolution,
  )
  if (effectiveResolution) {
    body.resolution = effectiveResolution
  }

  const generateAudio =
    input.generateAudio ??
    (readVideoDefault(input.videoDefaults, 'generateAudio') as
      boolean | undefined)
  if (generateAudio != null) {
    body.generate_audio = generateAudio
  }

  if (typeof input.seed === 'number' && input.seed >= 0) {
    body.seed = Math.min(input.seed, MAX_SEED)
  }

  body.return_last_frame = true
  body.watermark = false

  return body
}

/** ark task status → the worker's unified queue status. */
export function mapVolcEngineStatus(
  raw: string,
): 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' {
  switch (raw) {
    case 'succeeded':
      return 'COMPLETED'
    case 'running':
      return 'IN_PROGRESS'
    case 'failed':
    case 'expired':
      return 'FAILED'
    default:
      // 'queued' and anything undocumented — keep polling rather than abandon a
      // task the provider may still be working on.
      return 'IN_QUEUE'
  }
}
