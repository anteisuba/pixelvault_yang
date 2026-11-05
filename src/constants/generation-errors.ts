export const GENERATION_ERROR_CODES = {
  PROVIDER_TIMEOUT: 'provider_timeout',
  PROVIDER_RATE_LIMIT: 'provider_rate_limit',
  PROVIDER_OVERLOADED: 'provider_overloaded',
  INVALID_API_KEY: 'invalid_api_key',
  CONTENT_FILTERED: 'content_filtered',
  MODEL_UNAVAILABLE: 'model_unavailable',
  PROVIDER_NO_OUTPUT: 'provider_no_output',
  CALLBACK_TIMEOUT: 'callback_timeout',
  STORAGE_UPLOAD_FAILED: 'storage_upload_failed',
  PROVIDER_INSUFFICIENT_BALANCE: 'provider_insufficient_balance',
  INSUFFICIENT_CREDITS: 'insufficient_credits',
  UNSUPPORTED_REFERENCE_IMAGE_FORMAT: 'unsupported_reference_image_format',
  REFERENCE_IMAGE_TOO_LARGE: 'reference_image_too_large',
  REFERENCE_IMAGE_UNREACHABLE: 'reference_image_unreachable',
  REFERENCE_IMAGE_LIMIT_EXCEEDED: 'reference_image_limit_exceeded',
  INVALID_REFERENCE_IMAGE_DIMENSIONS: 'invalid_reference_image_dimensions',
  /**
   * A hosted provider's LoRA loader rejected a community LoRA outright
   * (Replicate delta-lock's `layer ... not supported` / "not in the list of
   * present adapters") — the LoRA itself is fine, the hosted backend just
   * can't load its layer format. Distinct from generic MODEL_UNAVAILABLE so
   * the UI can point the user at a runner-backed model instead of "try
   * again". See docs/references/domains/runner.md.
   */
  LORA_INCOMPATIBLE_HOSTED: 'lora_incompatible_hosted',
  /**
   * Civitai 的作者把这把 LoRA 的下载关了（version 详情的
   * `usageControl` 是 `Generation` / `InternalGeneration` 而不是 `Download`），
   * 权重只能在 Civitai 站内生成时用。`/api/download/models/:id` 对**任何**
   * token 都返 401 `The creator of this asset has disabled downloads on this
   * file` —— 有没有 Civitai token、token 有没有过期，跟这件事完全无关。
   *
   * 单列一个码，是因为它此前被 ERROR_PATTERNS 的通用 `\b401\b` 规则说成
   * INVALID_API_KEY（2026-08-29 owner 真机撞上：Runner 线报「你的 API Key
   * 无效或已过期」，云端 API 线报 `Replicate image generation failed: URL
   * responded with status code: 401` 同样落到 invalid_api_key）。那句话把人
   * 送去查一把根本没坏的 key，而**唯一的出路是换一把 LoRA**。
   */
  LORA_DOWNLOAD_DISABLED: 'lora_download_disabled',
  /** RUNNER's monthly generation budget cap (RUNNER_MONTHLY_LIMIT) was hit. */
  RUNNER_MONTHLY_LIMIT_EXCEEDED: 'runner_monthly_limit_exceeded',
  /** A requested LoRA isn't pre-baked on the runner's Network Volume yet. */
  RUNNER_LORA_UNAVAILABLE: 'runner_lora_unavailable',
  /**
   * 只为显示历史记录保留：RunPod 时期 Worker 判定端点僵死时写入的码。
   * Runner 迁到 Modal（2026-10）后不再产生，⛔ 别给它加新的写入方。
   */
  RUNNER_QUEUE_STUCK: 'runner_queue_stuck',
  /**
   * 下载到的模型文件（LoRA / 底模 / 配件）和来源公布的 SHA-256 对不上，这次不出图。
   * app 存 R2 时与 fork 落盘时抛的都带 `SHA-256 mismatch`。重试会重新下载。
   */
  RUNNER_DOWNLOAD_MISMATCH: 'runner_download_mismatch',
  /** Runner Volume 清完可清的缓存仍放不下这次要下的模型（fork `insufficient free space`）。 */
  RUNNER_STORAGE_FULL: 'runner_storage_full',
  /**
   * 派发不到执行 worker（本地没起 `npm --prefix workers/execution run dev`，
   * 或生产端点不可达）。**跟 provider 无关，也跟参考图无关** —— 请求根本没
   * 离开我们自己的机器。单列一个码，是因为它此前一直被参考图那条规则吃掉。
   */
  EXECUTION_WORKER_UNAVAILABLE: 'execution_worker_unavailable',
  /**
   * 执行 worker **收到了**请求但拒收（HTTP 4xx：参数不合法、工作流不认识等）。
   * 和 EXECUTION_WORKER_UNAVAILABLE 是两回事：那个是没连上、可以等会儿再试；
   * 这个是连上了被拒，重试一模一样会再被拒，界面要把 worker 的原话说出来。
   * 此前两者共用一条 `/execution worker/` 规则，Runner 400 被说成「连不上」。
   */
  EXECUTION_REQUEST_REJECTED: 'execution_request_rejected',
  /**
   * Provider 侧**账号自己设的**用量闸被触到，模型服务已被暂停（火山方舟
   * `SetLimitExceeded`：「Your account [...] has reached the set inference
   * limit for the [...] model, and the model service has been paused」）。
   *
   * 单列一个码而不是复用 PROVIDER_RATE_LIMIT，理由和 RUNNER_QUEUE_STUCK 一样：
   * 两者给用户的指示完全相反。限流值得等一会儿再试，**这个等多久都没用** ——
   * 得去 provider 控制台把限额调高或关掉。它走 HTTP 429，不单列就会被通用的
   * 429 规则说成「请求过于频繁，稍后重试」，把人钉在一个永远不会好的重试循环里。
   */
  PROVIDER_ACCOUNT_LIMIT_REACHED: 'provider_account_limit_reached',
  /**
   * Provider 账号**还没开通**这个模型（火山方舟：「Your account [...] has not
   * activated the model doubao-seedance-2-0-...」，code `ModelNotOpen`）。
   * 与限额同一类：重试无效，得去控制台开通。视频实跑 09-24 撞上时它落进了
   * UNKNOWN，界面只说「暂时无法确定原因」。
   */
  PROVIDER_MODEL_NOT_ACTIVATED: 'provider_model_not_activated',
  /**
   * 服务商自己的服务器出错（HTTP 500 / Internal Server Error）。不是用户的设置问题，
   * 通常是对方临时故障。09-24 NovelAI 返回 500 时落进 UNKNOWN，界面只说「暂时
   * 无法确定原因」，原话压在「查看详情」里。
   */
  PROVIDER_SERVER_ERROR: 'provider_server_error',
  /**
   * 火山 Ark / BytePlus Seedream 5.0 Pro 的 `background: "transparent"` 前置
   * 条件没满足：文档写死「仅支持图生图场景，且只支持输入 1 张带透明通道的
   * 图片」。0 张或 ≥2 张都不成立。
   *
   * 单列一个码而不是复用 REFERENCE_IMAGE_LIMIT_EXCEEDED：后者说的是「这个模型
   * 最多收 N 张」，而这里模型收 10 张好好的，**是透明底这一档只收 1 张**。
   * 把它说成参考图上限会让人去删参考图而不是去关透明底。
   * https://www.volcengine.com/docs/82379/1541523
   */
  TRANSPARENT_BACKGROUND_REQUIRES_SINGLE_REFERENCE:
    'transparent_background_requires_single_reference',
  /**
   * 火山 Ark / BytePlus Seedream 5.0 Pro 的 `layer_decomposition: true` 前置
   * 没满足：文档写死「仅支持输入单张待拆分图，传入多张报错」，而且这时 `image`
   * 是必选参数 —— 0 张和 ≥2 张同样不成立。
   */
  LAYER_DECOMPOSITION_REQUIRES_SINGLE_REFERENCE:
    'layer_decomposition_requires_single_reference',
  /**
   * 发给模型的提示词超过了**那一型号声明的厂商上限**（`maxPromptChars`）——
   * 生成服务按型号拦下来的（owner 2026-09-27：提示词只认厂商上限）。
   * 单列一个码：卡片模式融合后的整串、画布与视频链路没有前端拦截，此前这句校验原话
   * 以英文直接摆给用户。
   */
  PROMPT_TOO_LONG: 'prompt_too_long',
  /**
   * 我们的服务器根本没连上服务商：Node fetch 的裸 `fetch failed`、`write EPIPE`、
   * `socket hang up`、`ECONNRESET` 这类（11-03 线上样本：Fish Audio / Gemini /
   * Replicate / OpenAI / Rodin 共 31 次）。此前被参考图规则的 `fetch.*failed` 吃掉，
   * 说成「服务商无法下载这张参考图」——Fish Audio 配音根本没有参考图也照报。
   */
  PROVIDER_UNREACHABLE: 'provider_unreachable',
  /**
   * 服务商 / Runner 下载不到这次用的 **LoRA 文件**（链接过期、被删、作者关了下载、
   * 401/403）。11-03 线上样本共 40 余次，此前分别被说成「参考图下载不到」
   * （`not accessible` / `failed to download`）、「API Key 无效」（Replicate 的
   * `URL responded with status code: 401`）、「模型不可用」（Replicate 502 包着的
   * `URL responded with status code: 403`）。出路都是换 / 重新导入这把 LoRA。
   */
  LORA_UNREACHABLE: 'lora_unreachable',
  UNKNOWN: 'unknown',
} as const

export type GenerationErrorCode =
  (typeof GENERATION_ERROR_CODES)[keyof typeof GENERATION_ERROR_CODES]

export const REFERENCE_IMAGE_ERROR_PATTERNS = {
  UNSUPPORTED_FORMAT:
    /unsupported_file_mimetype|unsupported\s+(?:mime|mimetype|file|image|format)|unsupported.*image\/|invalid\s+(?:mime|mimetype|file type|image format)|supported file formats|only.*(?:jpeg|jpg|png|webp|gif|heic|heif)|image\/avif|\.avif/i,
  TOO_LARGE:
    /(?:file|image|payload).*?(?:too large|exceeds?|exceeded|maximum|max)|less than \d+\s?mb|no more than \d+\s?mb|size.*limit/i,
  // ⚠ 11-03 去掉了裸 `fetch.*failed` / `could not fetch`：线上那 31 次「fetch failed」
  //   全是我们连不上服务商（见 PROVIDER_UNREACHABLE），一张参考图都没有的也照报。
  UNREACHABLE:
    /failed to download|could not download|unable to download|download.*failed|not accessible|direct download|directly viewable|invalid.*url|url.*invalid|could not fetch (?:the )?(?:reference |input |source )?image/i,
  LIMIT_EXCEEDED:
    /too many (?:images|files)|up to \d+ images|only supports \d+ reference images?|maximum.*(?:images|files)|must not exceed \d+|input.*output.*(?:exceed|limit)/i,
  INVALID_DIMENSIONS:
    /dimension|width|height|aspect ratio|resolution|pixels|same dimensions|match.*resolution|must match/i,
} as const

const PROVIDER_REFERENCE_FORMAT_GUIDANCE: Array<{
  providerPattern: RegExp
  i18nKey: string
  fallbackMessage: string
}> = [
  {
    providerPattern: /openai/i,
    i18nKey: 'errors.provider.unsupportedOpenAiReferenceImage',
    fallbackMessage:
      'OpenAI accepts JPEG, PNG, or WebP reference images. Convert the image and try again.',
  },
  {
    providerPattern: /gemini|google/i,
    i18nKey: 'errors.provider.unsupportedGeminiReferenceImage',
    fallbackMessage:
      'Gemini accepts PNG, JPEG, WebP, HEIC, or HEIF reference images. Convert the image and try again.',
  },
  {
    providerPattern: /fal/i,
    i18nKey: 'errors.provider.unsupportedFalReferenceImage',
    fallbackMessage:
      'fal.ai could not read this reference image. Use PNG, JPEG, WebP, or GIF, and make sure the image URL is directly accessible.',
  },
  {
    providerPattern: /volcengine|seedream|doubao|bytedance|byteplus/i,
    i18nKey: 'errors.provider.unsupportedVolcengineReferenceImage',
    fallbackMessage:
      'Seedream could not read this reference image. Use a common format such as JPEG, PNG, or WebP, and make sure the URL is directly accessible.',
  },
]

// Order matters — first match wins. Capacity / 503 phrases must beat the
// generic "api key" word so a message like "This is not an API key error"
// doesn't get classified as INVALID_API_KEY. Likewise, the api-key regex
// requires an "invalid/expired/missing" qualifier so casual mentions of
// the term don't trigger.
/**
 * `requiresReferenceImage: true` marks patterns that only mean what they say
 * when the request actually carried a reference image. These regexes match
 * on generic English words (image/size/exceeds/maximum/resolution/pixels…)
 * that providers also use to complain about the OUTPUT image or unrelated
 * request fields — see the EXECUTION_WORKER_UNAVAILABLE comment below for a
 * previously-patched instance of the same failure mode. `parseGenerationErrorCode`
 * skips these entries when the caller knows (`hasReferenceImage: false`) that
 * no reference image was part of the request, instead of asserting "your
 * reference image is broken" about a request that never had one.
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp
  code: GenerationErrorCode
  requiresReferenceImage?: boolean
}> = [
  // Must beat the generic MODEL_UNAVAILABLE ("not found") pattern below —
  // Replicate's delta-lock/noobai-xl throws these exact phrases when a
  // community LoRA's layer format doesn't match its loader.
  {
    pattern:
      /layer\s+\S*\s*not\s+supported|not in the list of present adapters|Unsupported or incompatible LoRA checkpoint|isn't supported for LoRA/i,
    code: GENERATION_ERROR_CODES.LORA_INCOMPATIBLE_HOSTED,
  },
  // ─── 11-03 按线上样本收窄（GenerationJob 失败记录 223 种原话，见 errors.md §7）───
  // 下面几条都排在参考图 / 401 / 502 / timeout 这些宽规则之前：先认出「到底是谁的事」。
  //
  // 我们自己的程序 / 平台限制，不是服务商的原因：明确落 UNKNOWN（显示原话），
  // ⛔ 不让 TOO_LARGE 把 Workflow 步骤输出超限说成「参考图过大」、timeout 把
  // Prisma 事务超时说成「服务商超时」、INVALID_DIMENSIONS 把输出尺寸参数说成参考图尺寸。
  {
    pattern:
      /Step \S+ output is too large|Transaction API error|expired transaction|The parameter `size` specified in the request|hires dimensions exceed/i,
    code: GENERATION_ERROR_CODES.UNKNOWN,
  },
  {
    // LoRA 文件取不到。⚠ 必须在参考图 UNREACHABLE、`\b401\b`、`\b502\b` 之前。
    // Replicate 的 `URL responded with status code: 4xx` / `URL not downloadable`
    // 线上全是 LoRA 权重链接（参考图走 R2 公开地址，不会 401）。
    pattern:
      /LoRA file URL is not accessible|Failed to download Civitai LoRA|LoRA model file could not be loaded|LoRA download failed|Failed to upload LoRA|"loc":\s*\[\s*"body",\s*"loras"|URL responded with status code: 4\d\d|URL not downloadable/i,
    code: GENERATION_ERROR_CODES.LORA_UNREACHABLE,
  },
  {
    // 整句只有一个网络层错误：我们的服务器没连上服务商。
    pattern:
      /^(?:\w*Error:\s*)?(?:fetch failed|terminated|socket hang up|write EPIPE|read ECONNRESET|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN)\.?\s*$/i,
    code: GENERATION_ERROR_CODES.PROVIDER_UNREACHABLE,
  },
  {
    // fal `content_policy_violation`（肖像 / 输出音视频敏感）、BytePlus
    // `PolicyViolation`（版权）、Gemini `PROHIBITED_CONTENT`：线上 10 次此前落 UNKNOWN。
    pattern:
      /content_policy_violation|PolicyViolation|PROHIBITED_CONTENT|has sensitive content|related to copyright restrictions/i,
    code: GENERATION_ERROR_CODES.CONTENT_FILTERED,
  },
  // ⚠ 必须排在所有参考图规则**之前**：本地/生产的执行 worker 派发失败原文是
  // `Execution worker dispatch failed: fetch failed`，尾部的 `fetch failed` 会被
  // UNREACHABLE 的 `fetch.*failed` 吃掉，于是「worker 没起」被显示成「服务商无法
  // 下载这张参考图」—— 一张参考图都没有的时候也照报，把人往完全错误的方向带
  // （owner 2026-08-14 真机撞上；此前已在 memory 里记过一次「文案是假线索」）。
  // `requiresReferenceImage` below generalizes this same fix to the other
  // four reference-image patterns instead of relying solely on ordering.
  // ⚠ 拒收（4xx）必须排在下面「连不上」之前：两条原文都以
  // `Execution worker dispatch failed` 开头，只差状态码（execution-worker.service）。
  {
    pattern: /execution worker dispatch failed \(4\d\d\)/i,
    code: GENERATION_ERROR_CODES.EXECUTION_REQUEST_REJECTED,
  },
  {
    pattern: /execution worker|worker dispatch/i,
    code: GENERATION_ERROR_CODES.EXECUTION_WORKER_UNAVAILABLE,
  },
  // Runner 下载护栏（09-28 · 45）：fork / app 自己抛的固定英文，认字面即可。
  {
    pattern: /SHA-256 mismatch/i,
    code: GENERATION_ERROR_CODES.RUNNER_DOWNLOAD_MISMATCH,
  },
  // ⚠ 必须排在下面「quota…exceeded → 服务商余额不足」之前：2026-09-27 生产上 Runner 卷配额
  // 写满，fork 原话 `[Errno 122] Disk quota exceeded` 被那条规则说成「Agent Key 余额不足」。
  {
    pattern:
      /Runner volume has insufficient free space|Disk quota exceeded|Errno 122\b|No space left on device/i,
    code: GENERATION_ERROR_CODES.RUNNER_STORAGE_FULL,
  },
  // ⚠ 也必须排在参考图规则**之前**：火山的原文是
  // `...(429): {"error":{"code":"SetLimitExceeded","message":"Your account
  // [...] has reached the set inference limit for the [...] model..."}}`，
  // 里面同时有 "image"（来自我们自己的 `VolcEngine image generation failed`
  // 前缀）和 "Exceeded"，正好被 TOO_LARGE 的 `image.*?exceeded` 吃掉，于是
  // 账号限额被显示成「参考图文件过大」——一张参考图都没有的时候也照报
  // （owner 2026-08-27 真机撞上，DB 里 errorMessage 原文可查）。
  // ⚠ 这条正则刻意只认 provider 的具体标识（`SetLimitExceeded` / 那句
  // 固定英文），**不是**「含 limit/exceeded 就算」的兜底——那种兜底正是
  // 下面注释里记着的、2026-08-24 被删掉的那条祸根。
  {
    // ⚠ BytePlus 的原话是「set usage limit」而不是火山的「set inference limit」
    // （视频实跑 09-24），两种都认；「model service has been paused」是两家共有的尾巴。
    pattern:
      /SetLimitExceeded|reached the set (?:inference|usage) limit|model service has been paused/i,
    code: GENERATION_ERROR_CODES.PROVIDER_ACCOUNT_LIMIT_REACHED,
  },
  {
    pattern:
      /ModelNotOpen|has not activated the model|activate the model service/i,
    code: GENERATION_ERROR_CODES.PROVIDER_MODEL_NOT_ACTIVATED,
  },
  // ⚠ 同样排在参考图规则**之前**：这句话里有 "reference image"，而下面五条
  // 参考图规则谁先咬到就归谁。它是我们自己校验层抛的固定英文，认字面即可。
  {
    pattern: /transparent background requires exactly one reference image/i,
    code: GENERATION_ERROR_CODES.TRANSPARENT_BACKGROUND_REQUIRES_SINGLE_REFERENCE,
  },
  {
    pattern: /layer decomposition requires exactly one reference image/i,
    code: GENERATION_ERROR_CODES.LAYER_DECOMPOSITION_REQUIRES_SINGLE_REFERENCE,
  },
  // `prompt-guard` 的固定原话（生成服务按型号 `maxPromptChars` 拦时抛的）。
  {
    pattern: /prompt exceeds maximum length of \d+ characters/i,
    code: GENERATION_ERROR_CODES.PROMPT_TOO_LONG,
  },
  {
    pattern: REFERENCE_IMAGE_ERROR_PATTERNS.UNSUPPORTED_FORMAT,
    code: GENERATION_ERROR_CODES.UNSUPPORTED_REFERENCE_IMAGE_FORMAT,
    requiresReferenceImage: true,
  },
  {
    pattern: REFERENCE_IMAGE_ERROR_PATTERNS.TOO_LARGE,
    code: GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE,
    requiresReferenceImage: true,
  },
  {
    pattern: REFERENCE_IMAGE_ERROR_PATTERNS.UNREACHABLE,
    code: GENERATION_ERROR_CODES.REFERENCE_IMAGE_UNREACHABLE,
    requiresReferenceImage: true,
  },
  {
    pattern: REFERENCE_IMAGE_ERROR_PATTERNS.LIMIT_EXCEEDED,
    code: GENERATION_ERROR_CODES.REFERENCE_IMAGE_LIMIT_EXCEEDED,
    requiresReferenceImage: true,
  },
  {
    pattern: REFERENCE_IMAGE_ERROR_PATTERNS.INVALID_DIMENSIONS,
    code: GENERATION_ERROR_CODES.INVALID_REFERENCE_IMAGE_DIMENSIONS,
    requiresReferenceImage: true,
  },
  {
    pattern: /timeout|timed?\s*out/i,
    code: GENERATION_ERROR_CODES.PROVIDER_TIMEOUT,
  },
  {
    pattern:
      /high demand|spike(?:s)?\s+in\s+demand|at capacity|overloaded|UNAVAILABLE|\b503\b/i,
    code: GENERATION_ERROR_CODES.PROVIDER_OVERLOADED,
  },
  {
    pattern:
      /rate\s*limit|too many requests|concurrent generation is locked|\b429\b/i,
    code: GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT,
  },
  {
    pattern: /quota.*(?:exhausted|exceeded)|insufficient.*quota/i,
    code: GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE,
  },
  {
    pattern:
      /exhausted\s+balance|top\s+up.*balance|billing|payment|insufficient.*(?:balance|credits?)|used all (?:available )?credits|spending limit|not\s+enough\s+anlas|余额不足|余额已耗尽|充值/i,
    code: GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE,
  },
  {
    pattern:
      /(?:invalid|expired|missing|not\s+set|incorrect).*api[\s-]?(?:key|token)|api[\s-]?(?:key|token)\s+(?:is\s+)?(?:invalid|expired|incorrect)|\binvalid\s+token\b|unauthorized|\b401\b/i,
    code: GENERATION_ERROR_CODES.INVALID_API_KEY,
  },
  {
    pattern: /content.*filter|safety|nsfw|blocked|moderation/i,
    code: GENERATION_ERROR_CODES.CONTENT_FILTERED,
  },
  {
    pattern:
      /no_media_generated|no media|no output|no image|did not include.*(?:url|image|audio|video)|completed but no result/i,
    code: GENERATION_ERROR_CODES.PROVIDER_NO_OUTPUT,
  },
  {
    pattern:
      /Internal Server Error|"statusCode"\s*:\s*500\b|failed \(500\)|\bHTTP\s*500\b|status(?:\s*code)?\s*500\b/i,
    code: GENERATION_ERROR_CODES.PROVIDER_SERVER_ERROR,
  },
  {
    // ⚠ 11-03 收窄：去掉裸 `not found` 与 `\b502\b`。线上 502 全是 Replicate 包着的
    //   LoRA 下载失败（已归 LORA_UNREACHABLE），裸 404「Not Found」/「Path … not found」
    //   是我们自己的路由或别的资源，说成「模型不可用」都不对。只认「模型 / 应用 / 节点」找不到。
    pattern:
      /model.*unavailable|\bmodels?\b[^\n]{0,160}?\bnot\s*found|Application '[^']+' not found|Node '[^']+' not found/i,
    code: GENERATION_ERROR_CODES.MODEL_UNAVAILABLE,
  },
  // ⚠ 这里曾有一条 `/credit|limit\s*reached|quota|exceeded/i` 兜底，把任何含
  // 「exceeded」的消息判成 INSUFFICIENT_CREDITS →「今日免费生成次数已用完」。
  // 2026-08-24 生产上，Runner 的 `exceeded max body size of 10MiB` 和
  // `Worker exceeded memory limit.` 都被它说成了「你没额度了」——而当天全站的免费
  // 额度一次都没用过，Runner 路径根本不经过免费额度闸。别再加回来：
  //   - 真正的免费额度耗尽走的是 backend code `FREE_LIMIT_EXCEEDED`（见下方
  //     BACKEND_ERROR_CODE_MAP），从不依赖消息文本；
  //   - Runner 月度额度用完同理走 `RUNNER_MONTHLY_LIMIT_EXCEEDED`；
  //   - 「exceeded」是英文错误消息里最常见的词之一，用它兜底等于随机说谎。
  // 认不出来就落到 UNKNOWN、显示 provider 原文——难看，但不指向错误的方向。
]

export interface ParseGenerationErrorCodeOptions {
  /**
   * Whether the request that produced this error actually carried a
   * reference image. `false` skips the five reference-image-specific
   * patterns so a generic provider complaint (about the output image, a
   * size/resolution param, or anything else containing those same English
   * words) can't be mislabeled as "your reference image is broken" for a
   * request that never had one. Omit when unknown — the patterns still
   * apply, matching prior behavior.
   */
  hasReferenceImage?: boolean
}

export function parseGenerationErrorCode(
  errorMessage: string,
  options?: ParseGenerationErrorCodeOptions,
): GenerationErrorCode {
  for (const { pattern, code, requiresReferenceImage } of ERROR_PATTERNS) {
    if (requiresReferenceImage && options?.hasReferenceImage === false) {
      continue
    }
    if (pattern.test(errorMessage)) {
      return code
    }
  }
  return GENERATION_ERROR_CODES.UNKNOWN
}

// Server-side `GenerationError` subclasses and legacy service errors use
// SCREAMING_SNAKE codes (PROVIDER_TIMEOUT, RATE_LIMIT_EXCEEDED…); the client
// classification dictionary uses the lower-case GENERATION_ERROR_CODES. This
// bridges the two so the UI can resolve a friendly reason from the payload's
// errorCode without re-parsing the message string.
const BACKEND_ERROR_CODE_MAP: Record<string, GenerationErrorCode> = {
  PROVIDER_TIMEOUT: GENERATION_ERROR_CODES.PROVIDER_TIMEOUT,
  RATE_LIMIT_EXCEEDED: GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT,
  SAFETY_FILTER_BLOCKED: GENERATION_ERROR_CODES.CONTENT_FILTERED,
  FREE_LIMIT_EXCEEDED: GENERATION_ERROR_CODES.INSUFFICIENT_CREDITS,
  INVALID_API_KEY: GENERATION_ERROR_CODES.INVALID_API_KEY,
  MISSING_API_KEY: GENERATION_ERROR_CODES.INVALID_API_KEY,
  UNSUPPORTED_MODEL: GENERATION_ERROR_CODES.MODEL_UNAVAILABLE,
  CALLBACK_TIMEOUT: GENERATION_ERROR_CODES.CALLBACK_TIMEOUT,
  STORAGE_UPLOAD_FAILED: GENERATION_ERROR_CODES.STORAGE_UPLOAD_FAILED,
  PROVIDER_NO_OUTPUT: GENERATION_ERROR_CODES.PROVIDER_NO_OUTPUT,
  RUNNER_MONTHLY_LIMIT_EXCEEDED:
    GENERATION_ERROR_CODES.RUNNER_MONTHLY_LIMIT_EXCEEDED,
  RUNNER_LORA_UNAVAILABLE: GENERATION_ERROR_CODES.RUNNER_LORA_UNAVAILABLE,
  LORA_DOWNLOAD_DISABLED: GENERATION_ERROR_CODES.LORA_DOWNLOAD_DISABLED,
  // Provider 原样的错误码（worker 把火山 / BytePlus 的 `error.code` 直接存进
  // errorCode）—— 原话里不一定带着这个词，只看 message 会漏。
  SetLimitExceeded: GENERATION_ERROR_CODES.PROVIDER_ACCOUNT_LIMIT_REACHED,
  ModelNotOpen: GENERATION_ERROR_CODES.PROVIDER_MODEL_NOT_ACTIVATED,
}

const GENERATION_ERROR_CODE_VALUES = new Set<string>(
  Object.values(GENERATION_ERROR_CODES),
)

/**
 * Normalize an error code from any source into a client `GenerationErrorCode`.
 *
 * Returns `null` for codes that carry no specific classification (e.g. the
 * generic `PROVIDER_ERROR`, `VALIDATION_ERROR`) so the caller can fall back to
 * `parseGenerationErrorCode(message)` and recover a finer reason from the
 * provider's raw error text.
 */
export function normalizeErrorCode(
  code?: string | null,
): GenerationErrorCode | null {
  // ⚠ `unknown` 也算「没归类」：worker 认不出时就存这个字面值，而原话里常常写着
  //   具体原因（火山「has not activated the model」，视频实跑 09-24）—— 回 null 让
  //   调用方接着按原话认。
  if (!code || code === GENERATION_ERROR_CODES.UNKNOWN) {
    return null
  }
  if (GENERATION_ERROR_CODE_VALUES.has(code)) {
    return code as GenerationErrorCode
  }
  // BytePlus 把 `OutputVideoSensitiveContentDetected.PolicyViolation` 这类原样存进
  // errorCode（线上 5 次落 UNKNOWN）。
  if (/PolicyViolation|SensitiveContent/i.test(code)) {
    return GENERATION_ERROR_CODES.CONTENT_FILTERED
  }
  return BACKEND_ERROR_CODE_MAP[code] ?? null
}

/**
 * 重试也不会变的失败：账户余额 / key / 用量上限 / 模型开通 / 作者关下载 / 月度额度
 * 这类要用户去别处处理的事。舞台上不给「重试」——点了只会再失败一次。
 */
const RETRY_FUTILE_ERROR_CODES: ReadonlySet<GenerationErrorCode> = new Set([
  GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE,
  GENERATION_ERROR_CODES.INVALID_API_KEY,
  GENERATION_ERROR_CODES.PROVIDER_ACCOUNT_LIMIT_REACHED,
  GENERATION_ERROR_CODES.PROVIDER_MODEL_NOT_ACTIVATED,
  GENERATION_ERROR_CODES.LORA_DOWNLOAD_DISABLED,
  GENERATION_ERROR_CODES.RUNNER_MONTHLY_LIMIT_EXCEEDED,
  GENERATION_ERROR_CODES.EXECUTION_REQUEST_REJECTED,
])

export function isGenerationRetryFutile(
  code: GenerationErrorCode | null | undefined,
): boolean {
  return code != null && RETRY_FUTILE_ERROR_CODES.has(code)
}

function getUnsupportedReferenceImageI18nKey(errorMessage: string): string {
  const providerGuidance = PROVIDER_REFERENCE_FORMAT_GUIDANCE.find((guidance) =>
    guidance.providerPattern.test(errorMessage),
  )

  return (
    providerGuidance?.i18nKey ?? 'errors.provider.unsupportedReferenceImage'
  )
}

/**
 * Maps an already-resolved error code to its i18n key. Split out of
 * `getGenerationErrorI18nKey` so a caller that already has a trustworthy
 * `errorCode` (e.g. one computed with `parseGenerationErrorCode` plus
 * `hasReferenceImage` context) can resolve the matching i18n key without
 * re-parsing the raw message a second time through the context-blind
 * default patterns.
 */
/**
 * OpenAI `moderation_details.moderation_stage`：拦在出图前（`input` = 提示词 /
 * 参考图）还是出图后（`output` = 成品）。认两种来源：
 * - 生成路径：`execution-callback.service` 的 `moderationNote()` 落库前写成
 *   `[moderation: output · harassment]` 前缀；
 * - 改图路径：原样的 OpenAI 错误体 `"moderation_stage":"input"`。
 * `unknown` / 没有 = null（用户看到原来那句泛化文案）。官方建议主文案保持泛化，
 * 阶段只用来给一句轻提示——所以这里⛔ 不把 categories 透给用户。
 */
export function moderationStageOf(text: string): 'input' | 'output' | null {
  const stage =
    /\[moderation:\s*(input|output)\b/.exec(text)?.[1] ??
    /"moderation_stage"\s*:\s*"(input|output)"/.exec(text)?.[1]
  return stage === 'input' || stage === 'output' ? stage : null
}

export const MODERATION_STAGE_I18N_KEYS = {
  input: 'errors.provider.moderationBlockedInput',
  output: 'errors.provider.moderationBlockedOutput',
} as const

export function getGenerationErrorI18nKeyForCode(
  errorCode: GenerationErrorCode,
  errorMessage: string,
): string | null {
  if (errorCode === GENERATION_ERROR_CODES.CONTENT_FILTERED) {
    const stage = moderationStageOf(errorMessage)
    return stage ? MODERATION_STAGE_I18N_KEYS[stage] : null
  }
  if (errorCode === GENERATION_ERROR_CODES.UNSUPPORTED_REFERENCE_IMAGE_FORMAT) {
    return getUnsupportedReferenceImageI18nKey(errorMessage)
  }
  if (errorCode === GENERATION_ERROR_CODES.REFERENCE_IMAGE_TOO_LARGE) {
    return 'errors.provider.referenceImageTooLarge'
  }
  if (errorCode === GENERATION_ERROR_CODES.REFERENCE_IMAGE_UNREACHABLE) {
    return 'errors.provider.referenceImageUnreachable'
  }
  if (errorCode === GENERATION_ERROR_CODES.REFERENCE_IMAGE_LIMIT_EXCEEDED) {
    return 'errors.provider.referenceImageLimitExceeded'
  }
  if (
    errorCode ===
    GENERATION_ERROR_CODES.TRANSPARENT_BACKGROUND_REQUIRES_SINGLE_REFERENCE
  ) {
    return 'errors.provider.transparentBackgroundRequiresSingleReference'
  }
  if (
    errorCode ===
    GENERATION_ERROR_CODES.LAYER_DECOMPOSITION_REQUIRES_SINGLE_REFERENCE
  ) {
    return 'errors.provider.layerDecompositionRequiresSingleReference'
  }
  if (errorCode === GENERATION_ERROR_CODES.PROMPT_TOO_LONG) {
    return 'errors.provider.promptTooLong'
  }
  if (errorCode === GENERATION_ERROR_CODES.INVALID_REFERENCE_IMAGE_DIMENSIONS) {
    return 'errors.provider.invalidReferenceImageDimensions'
  }
  if (errorCode === GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE) {
    return 'errors.provider.insufficientBalance'
  }
  if (errorCode === GENERATION_ERROR_CODES.PROVIDER_ACCOUNT_LIMIT_REACHED) {
    return 'errors.provider.accountLimitReached'
  }
  if (errorCode === GENERATION_ERROR_CODES.LORA_INCOMPATIBLE_HOSTED) {
    return 'errors.provider.loraIncompatibleHosted'
  }
  if (errorCode === GENERATION_ERROR_CODES.LORA_DOWNLOAD_DISABLED) {
    return 'errors.provider.loraDownloadDisabled'
  }
  if (errorCode === GENERATION_ERROR_CODES.RUNNER_MONTHLY_LIMIT_EXCEEDED) {
    return 'errors.provider.runnerMonthlyLimitExceeded'
  }
  if (errorCode === GENERATION_ERROR_CODES.RUNNER_LORA_UNAVAILABLE) {
    return 'errors.provider.runnerLoraUnavailable'
  }
  if (errorCode === GENERATION_ERROR_CODES.PROVIDER_NO_OUTPUT) {
    return 'errors.provider.noOutput'
  }
  if (errorCode === GENERATION_ERROR_CODES.CALLBACK_TIMEOUT) {
    return 'errors.provider.callbackTimeout'
  }
  if (errorCode === GENERATION_ERROR_CODES.STORAGE_UPLOAD_FAILED) {
    return 'errors.provider.storageUploadFailed'
  }

  return null
}

export function getGenerationErrorI18nKey(
  errorMessage: string,
  options?: ParseGenerationErrorCodeOptions,
): string | null {
  const errorCode = parseGenerationErrorCode(errorMessage, options)
  return getGenerationErrorI18nKeyForCode(errorCode, errorMessage)
}

export function getUnsupportedReferenceImageMessage(provider: string): string {
  const providerGuidance = PROVIDER_REFERENCE_FORMAT_GUIDANCE.find((guidance) =>
    guidance.providerPattern.test(provider),
  )

  return (
    providerGuidance?.fallbackMessage ??
    'This model could not read the reference image format. Use JPEG, PNG, or WebP, then try again.'
  )
}
