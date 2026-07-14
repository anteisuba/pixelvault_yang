import 'server-only'

import { createHash } from 'node:crypto'

import { HUGGINGFACE_LORA_ALLOWED_EXTENSION } from '@/constants/lora'
import { logger } from '@/lib/logger'
import { getSystemCivitaiToken } from '@/lib/platform-keys'
import {
  createPresignedR2GetUrl,
  r2ObjectExists,
  uploadBufferedHttpToR2,
} from '@/services/storage/r2'
import type { RunnerLoraSpec } from '@/types'

// v2 ①a（docs/plans/comfy-runner-v2-runtime-lora.md）：把任意 Civitai/Hugging Face
// LoRA 缓存进 R2 权威仓库，供 fork worker 每次从 R2 拉。R2 前缀 + 确定性文件名——**文件名派生规则
// 必须与 fork worker（②a）侧一致**（契约见设计包 §3）。
const RUNNER_LORA_R2_PREFIX = 'runner-loras/'
const CIVITAI_DOWNLOAD_VERSION_PATTERN =
  /civitai\.com\/api\/download\/models\/(\d+)/

/**
 * Hard cap for a single LoRA weight cached into R2 for the Runner path.
 * Real LoRAs are typically tens–hundreds of MB; multi-GB files are almost
 * always base checkpoints mis-attached as LoRAs (which used to hang the
 * Vercel request and leave GenerationJob stuck RUNNING forever).
 */
export const RUNNER_LORA_MAX_BYTES = 512 * 1024 * 1024

export interface EnsuredRunnerLora {
  /** ComfyUI 挂载用文件名（fork worker 下到 models/loras/ 后按此名挂）。 */
  filename: string
  /** R2 object key（Cloudflare Worker 据此生成预签名 GET 发给 fork worker）。 */
  r2Key: string
  /** true = 本次实拉了 Civitai；false = R2 缓存命中，跳过下载。 */
  downloaded: boolean
}

export class RunnerLoraR2Error extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_LORA_URL' | 'DOWNLOAD_FAILED' | 'TOO_LARGE',
  ) {
    super(message)
    this.name = 'RunnerLoraR2Error'
  }
}

function toRunnerLoraTooLargeError(sizeBytes: number): RunnerLoraR2Error {
  const sizeMb = Math.round(sizeBytes / (1024 * 1024))
  const maxMb = Math.round(RUNNER_LORA_MAX_BYTES / (1024 * 1024))
  return new RunnerLoraR2Error(
    `Runner LoRA is ${sizeMb} MB, over the ${maxMb} MB limit. Base checkpoints belong in the checkpoint path, not as LoRA attachments.`,
    'TOO_LARGE',
  )
}

function isRemoteFileTooLargeError(error: unknown): error is Error {
  return (
    error instanceof Error && error.message.includes('exceeds maximum size of')
  )
}

export interface HuggingFaceLoraReference {
  repoId: string
  revision: string
  filename: string
}

/** `civitai-<modelVersionId>.safetensors` —— 与 fork worker 侧同规则。 */
export function deriveRunnerLoraFilename(versionId: number): string {
  return `civitai-${versionId}.safetensors`
}

export function extractCivitaiModelVersionId(url: string): number | null {
  const match = url.match(CIVITAI_DOWNLOAD_VERSION_PATTERN)
  if (!match) return null
  const id = Number(match[1])
  return Number.isFinite(id) ? id : null
}

/**
 * Parse the canonical HF model-file URL emitted by the LoRA browser. `blob`
 * URLs are accepted as an import convenience and resolve to the same file;
 * arbitrary HF repo pages are intentionally rejected because they do not
 * identify a concrete weight file.
 */
export function parseHuggingFaceLoraReference(
  input: string,
): HuggingFaceLoraReference | null {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== 'huggingface.co'
  ) {
    return null
  }

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length < 5) return null

  const markerIndex =
    segments.indexOf('resolve') >= 0
      ? segments.indexOf('resolve')
      : segments.indexOf('blob')
  if (markerIndex !== 2) return null

  const repoId = `${segments[0]}/${segments[1]}`
  const revision = decodeURIComponent(segments[markerIndex + 1] ?? '')
  const filename = segments
    .slice(markerIndex + 2)
    .map((segment) => decodeURIComponent(segment))
    .join('/')

  if (
    !revision ||
    !filename ||
    filename
      .split('/')
      .some((segment) => segment === '.' || segment === '..') ||
    !filename.toLowerCase().endsWith(HUGGINGFACE_LORA_ALLOWED_EXTENSION)
  ) {
    return null
  }

  return { repoId, revision, filename }
}

function deriveHuggingFaceLoraFilename(
  reference: HuggingFaceLoraReference,
): string {
  const basename = reference.filename.split('/').at(-1) ?? 'lora.safetensors'
  const safeBasename = basename.replace(/[^a-zA-Z0-9._-]/g, '-')
  const sourceKey = `${reference.repoId}\0${reference.revision}\0${reference.filename}`
  const digest = createHash('sha256')
    .update(sourceKey)
    .digest('hex')
    .slice(0, 16)
  return `hf-${digest}-${safeBasename}`
}

export function deriveRunnerHuggingFaceLoraFilename(
  reference: HuggingFaceLoraReference,
): string {
  return deriveHuggingFaceLoraFilename(reference)
}

/**
 * 确保某把 Civitai LoRA 已在 R2（权威缓存）。R2 命中 → 跳过下载；否则用平台 Civitai
 * token 从 Civitai 拉到 R2（去重键 = modelVersionId）。返回文件名 + R2 key，供
 * Cloudflare Worker 组「LoRA 下载规格」发给 fork worker（②a）。
 */
export async function ensureCivitaiLoraInR2(
  loraDownloadUrl: string,
): Promise<EnsuredRunnerLora> {
  const versionId = extractCivitaiModelVersionId(loraDownloadUrl)
  if (versionId == null) {
    throw new RunnerLoraR2Error(
      `Not a Civitai model-download URL: ${loraDownloadUrl}`,
      'INVALID_LORA_URL',
    )
  }

  const filename = deriveRunnerLoraFilename(versionId)
  const r2Key = `${RUNNER_LORA_R2_PREFIX}${filename}`

  // 去重：R2 里已有就直接复用（一次下载、永久缓存、全站/全 worker 共享）。
  if (await r2ObjectExists(r2Key)) {
    return { filename, r2Key, downloaded: false }
  }

  const token = getSystemCivitaiToken()
  const fetchHeaders = token ? { Authorization: `Bearer ${token}` } : undefined

  try {
    await uploadBufferedHttpToR2({
      sourceUrl: loraDownloadUrl,
      key: r2Key,
      mimeType: 'application/octet-stream',
      fetchHeaders,
      maxBytes: RUNNER_LORA_MAX_BYTES,
    })
  } catch (error) {
    logger.warn('Failed to cache Civitai LoRA to R2', {
      versionId,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    if (isRemoteFileTooLargeError(error)) {
      const match = error.message.match(/declared (\d+)|got (\d+)/)
      const size = Number(match?.[1] ?? match?.[2] ?? RUNNER_LORA_MAX_BYTES + 1)
      throw toRunnerLoraTooLargeError(size)
    }
    throw new RunnerLoraR2Error(
      `Failed to download Civitai LoRA ${versionId} to R2`,
      'DOWNLOAD_FAILED',
    )
  }

  logger.info('Cached Civitai LoRA to R2', { versionId, r2Key })
  return { filename, r2Key, downloaded: true }
}

/** Ensure a public Hugging Face SafeTensors LoRA is cached in R2. */
export async function ensureHuggingFaceLoraInR2(
  loraDownloadUrl: string,
): Promise<EnsuredRunnerLora> {
  const reference = parseHuggingFaceLoraReference(loraDownloadUrl)
  if (!reference) {
    throw new RunnerLoraR2Error(
      `Not a supported Hugging Face LoRA file URL: ${loraDownloadUrl}`,
      'INVALID_LORA_URL',
    )
  }

  const filename = deriveHuggingFaceLoraFilename(reference)
  const r2Key = `${RUNNER_LORA_R2_PREFIX}${filename}`

  if (await r2ObjectExists(r2Key)) {
    return { filename, r2Key, downloaded: false }
  }

  try {
    // Public HF model files do not need a token. Keeping the worker contract
    // R2-only also prevents user-supplied URLs from becoming a worker SSRF
    // surface and makes cache reuse independent of HF availability.
    await uploadBufferedHttpToR2({
      sourceUrl: loraDownloadUrl,
      key: r2Key,
      mimeType: 'application/octet-stream',
      maxBytes: RUNNER_LORA_MAX_BYTES,
    })
  } catch (error) {
    logger.warn('Failed to cache Hugging Face LoRA to R2', {
      repoId: reference.repoId,
      revision: reference.revision,
      filename: reference.filename,
      error: error instanceof Error ? error.message : 'Unknown',
    })
    if (isRemoteFileTooLargeError(error)) {
      const match =
        error instanceof Error
          ? error.message.match(/declared (\d+)|got (\d+)/)
          : null
      const size = Number(match?.[1] ?? match?.[2] ?? RUNNER_LORA_MAX_BYTES + 1)
      throw toRunnerLoraTooLargeError(size)
    }
    throw new RunnerLoraR2Error(
      `Failed to download Hugging Face LoRA ${reference.repoId}/${reference.filename} to R2`,
      'DOWNLOAD_FAILED',
    )
  }

  logger.info('Cached Hugging Face LoRA to R2', {
    repoId: reference.repoId,
    r2Key,
  })
  return { filename, r2Key, downloaded: true }
}

/** Resolve either a Civitai or Hugging Face source into the shared R2 cache. */
export async function ensureRunnerLoraInR2(
  loraDownloadUrl: string,
): Promise<EnsuredRunnerLora> {
  if (extractCivitaiModelVersionId(loraDownloadUrl) !== null) {
    return ensureCivitaiLoraInR2(loraDownloadUrl)
  }
  if (parseHuggingFaceLoraReference(loraDownloadUrl)) {
    return ensureHuggingFaceLoraInR2(loraDownloadUrl)
  }
  throw new RunnerLoraR2Error(
    `Unsupported Runner LoRA source URL: ${loraDownloadUrl}`,
    'INVALID_LORA_URL',
  )
}

// R2 预签名 GET 时效：要覆盖冷启动 + 逐个 LoRA 下载窗口（设计包 §5）。
const RUNNER_LORA_PRESIGN_TTL_SECONDS = 900

/**
 * v2 ①a 收口：把一组 LoRA（主 + 挂载）逐个确保进 R2，并各生成 R2 预签名 GET，
 * 组成 `RunnerLoraSpec[]` 交给 Cloudflare Worker → RunPod fork。顺序保留（配方叠挂
 * 顺序有意义）。任一把失败即抛（RunnerLoraR2Error），上层归类成友好错误。
 */
export async function prepareRunnerLoras(
  loras: readonly { url: string; scale?: number | null }[],
): Promise<RunnerLoraSpec[]> {
  const specs: RunnerLoraSpec[] = []
  for (const lora of loras) {
    const { filename, r2Key } = await ensureRunnerLoraInR2(lora.url)
    const downloadUrl = await createPresignedR2GetUrl({
      key: r2Key,
      expiresInSeconds: RUNNER_LORA_PRESIGN_TTL_SECONDS,
    })
    specs.push({ filename, downloadUrl, scale: lora.scale ?? 1 })
  }
  return specs
}
