import type { ExecutionEnv, WorkerModel3DRunContext } from '../../index'
import { readStringField } from '../../lib/fields'
import { R2_OBJECT_CACHE_CONTROL } from '../../lib/image-io'
import {
  createProviderPayloadError,
  createProviderResponseError,
} from '../../lib/provider-error'

export const HYPER3D_BASE_URL = 'https://api.hyper3d.com'

export interface RodinSubmitResult {
  jobUuid: string
  subscriptionKey?: string
  statusUrl: string
  downloadUrl: string
}

export interface RodinPollResult {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  error?: string
  errorCode?: string
  providerMetadata?: Record<string, unknown>
}

// ─── Hyper3D Rodin API ────────────────────────────────────────────────────────

export async function submitRodinJob(
  context: WorkerModel3DRunContext,
  apiKey: string,
): Promise<RodinSubmitResult> {
  const { providerInput } = context
  const form = new FormData()

  // Rodin requires binary image upload — fetch and attach as files
  async function appendImageAsFile(url: string, index: number): Promise<void> {
    const imgRes = await fetch(url)
    if (!imgRes.ok)
      throw new Error(
        `Failed to fetch source image (${imgRes.status}): ${url.slice(0, 80)}`,
      )
    const buffer = await imgRes.arrayBuffer()
    const mime = imgRes.headers.get('content-type') ?? 'image/png'
    const ext = mime.includes('jpeg')
      ? 'jpg'
      : mime.includes('webp')
        ? 'webp'
        : 'png'
    form.append(
      'images',
      new Blob([buffer], { type: mime }),
      `image_${index}.${ext}`,
    )
  }

  if (providerInput.imageUrl) {
    await appendImageAsFile(providerInput.imageUrl, 0)
  }
  if (providerInput.additionalImageUrls?.length) {
    for (let i = 0; i < providerInput.additionalImageUrls.length; i++) {
      await appendImageAsFile(providerInput.additionalImageUrls[i], i + 1)
    }
  }
  // Field names per official Rodin Gen-2.5 docs:
  // https://developer.hyper3d.ai/api-specification/rodin-gen2.5
  if (providerInput.tier) form.append('tier', providerInput.tier)
  if (providerInput.material) form.append('material', providerInput.material)
  // mesh_mode: 'Raw' (triangle) or 'Quad'. Schema already restricts values.
  if (providerInput.meshMode) {
    form.append('mesh_mode', providerInput.meshMode)
  }
  // quality: extra-low / low / medium / high — controls polygon budget.
  if (providerInput.quality) {
    form.append('quality', providerInput.quality)
  }
  // texture_mode: legacy / extreme-low / low / medium / high.
  if (providerInput.textureMode) {
    form.append('texture_mode', providerInput.textureMode)
  }
  // geometry_instruct_mode: faithful (default) or creative.
  if (providerInput.geometryInstructMode) {
    form.append('geometry_instruct_mode', providerInput.geometryInstructMode)
  }
  // geometry_file_format: glb / usdz / fbx / obj / stl. Defaults to glb so
  // the rest of the pipeline (R2 ingest, ModelViewer) keeps working.
  if (providerInput.geometryFileFormat) {
    form.append('geometry_file_format', providerInput.geometryFileFormat)
  }
  // addons: array of strings sent as repeated multipart fields (not a JSON
  // string). Only 'HighPack' is supported per docs — official curl uses
  // `-F "addons=HighPack"`. JSON.stringify here yields the literal `["HighPack"]`
  // which fails Rodin's per-element validation.
  if (providerInput.highPack) {
    form.append('addons', 'HighPack')
  }
  if (providerInput.taPose != null) {
    form.append('TAPose', String(providerInput.taPose))
  }
  if (providerInput.hdTexture != null) {
    form.append('hd_texture', String(providerInput.hdTexture))
  }
  // texture_delight: boolean — removes lighting info from textures
  if (providerInput.textureDelight != null) {
    form.append('texture_delight', String(providerInput.textureDelight))
  }
  if (providerInput.useOriginalAlpha != null) {
    form.append('use_original_alpha', String(providerInput.useOriginalAlpha))
  }
  if (providerInput.previewRender != null) {
    form.append('preview_render', String(providerInput.previewRender))
  }
  // is_micro: only takes effect on Gen-2.5-Extreme-High tier per docs.
  if (providerInput.isMicro != null) {
    form.append('is_micro', String(providerInput.isMicro))
  }
  if (providerInput.prompt) {
    form.append('prompt', providerInput.prompt)
  }
  if (providerInput.qualityOverride != null) {
    form.append('quality_override', String(providerInput.qualityOverride))
  }
  if (providerInput.seed != null && providerInput.seed >= 0) {
    form.append('seed', String(providerInput.seed))
  }
  // bbox_condition: array of 3 integers [Width(Y), Height(Z), Length(X)]
  if (providerInput.bboxCondition) {
    form.append('bbox_condition', JSON.stringify(providerInput.bboxCondition))
  }

  const response = await fetch(`${HYPER3D_BASE_URL}/api/v2/rodin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'hyper3d_rodin',
      phase: 'submit',
      fallbackMessage: `Hyper3D Rodin submit failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const submitFailure = createProviderPayloadError(data, {
    provider: 'hyper3d_rodin',
    phase: 'submit',
    fallbackMessage: 'Hyper3D Rodin submit reported failure.',
  })
  if (submitFailure) throw submitFailure

  // Response shape: { uuid, jobs: { uuids: [...], subscription_key: <JWT> } }
  const jobUuid = readStringField(data, 'uuid')
  const jobsMeta =
    data.jobs != null && typeof data.jobs === 'object'
      ? (data.jobs as Record<string, unknown>)
      : {}
  const subscriptionKey = readStringField(jobsMeta, 'subscription_key')

  if (!jobUuid) {
    throw new Error(
      `Hyper3D Rodin submit returned no job UUID. Response: ${JSON.stringify(data).slice(0, 300)}`,
    )
  }

  return {
    jobUuid,
    subscriptionKey: subscriptionKey ?? undefined,
    statusUrl: `${HYPER3D_BASE_URL}/api/v2/status`,
    downloadUrl: `${HYPER3D_BASE_URL}/api/v2/download`,
  }
}

/**
 * Texture-only continuation: re-textures an existing mesh GLB without
 * regenerating geometry. Posts to /api/v2/rodin_texture_only with the source
 * mesh + reference image. Returns the same submit shape as submitRodinJob so
 * polling + download can reuse the regular Rodin flow.
 *
 * https://developer.hyper3d.ai/api-specification/generate-texture
 */
export async function submitRodinTextureOnlyJob(
  context: WorkerModel3DRunContext,
  apiKey: string,
): Promise<RodinSubmitResult> {
  const { providerInput } = context
  if (!providerInput.parentMeshUrl) {
    throw new Error(
      'rodin_texture_only requires providerInput.parentMeshUrl (GLB to texture).',
    )
  }
  if (!providerInput.imageUrl) {
    throw new Error(
      'rodin_texture_only requires providerInput.imageUrl (reference image).',
    )
  }

  const form = new FormData()

  async function appendBinaryFile(
    fieldName: string,
    url: string,
    fallbackMime: string,
  ): Promise<void> {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(
        `Failed to fetch ${fieldName} (${res.status}): ${url.slice(0, 80)}`,
      )
    }
    const buffer = await res.arrayBuffer()
    const mime = res.headers.get('content-type') ?? fallbackMime
    const ext = mime.includes('jpeg')
      ? 'jpg'
      : mime.includes('webp')
        ? 'webp'
        : mime.includes('png')
          ? 'png'
          : mime.includes('gltf')
            ? 'glb'
            : 'bin'
    form.append(
      fieldName,
      new Blob([buffer], { type: mime }),
      `${fieldName}.${ext}`,
    )
  }

  await appendBinaryFile('image', providerInput.imageUrl, 'image/png')
  await appendBinaryFile(
    'model',
    providerInput.parentMeshUrl,
    'model/gltf-binary',
  )

  // Per docs: optional prompt / seed / reference_scale / geometry_file_format /
  // material / resolution. We forward everything the user set in the Inspector
  // so the textured output matches their material/format choice.
  if (providerInput.material) form.append('material', providerInput.material)
  if (providerInput.geometryFileFormat) {
    form.append('geometry_file_format', providerInput.geometryFileFormat)
  }
  if (providerInput.prompt) form.append('prompt', providerInput.prompt)
  if (providerInput.seed != null && providerInput.seed >= 0) {
    form.append('seed', String(providerInput.seed))
  }

  const response = await fetch(
    `${HYPER3D_BASE_URL}/api/v2/rodin_texture_only`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    },
  )

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'hyper3d_rodin',
      phase: 'texture_only_submit',
      fallbackMessage: `Hyper3D Rodin texture-only submit failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const submitFailure = createProviderPayloadError(data, {
    provider: 'hyper3d_rodin',
    phase: 'texture_only_submit',
    fallbackMessage: 'Hyper3D Rodin texture-only submit reported failure.',
  })
  if (submitFailure) throw submitFailure

  const jobUuid = readStringField(data, 'uuid')
  const jobsMeta =
    data.jobs != null && typeof data.jobs === 'object'
      ? (data.jobs as Record<string, unknown>)
      : {}
  const subscriptionKey = readStringField(jobsMeta, 'subscription_key')

  if (!jobUuid) {
    throw new Error(
      `Hyper3D Rodin texture-only submit returned no job UUID. Response: ${JSON.stringify(data).slice(0, 300)}`,
    )
  }

  return {
    jobUuid,
    subscriptionKey: subscriptionKey ?? undefined,
    statusUrl: `${HYPER3D_BASE_URL}/api/v2/status`,
    downloadUrl: `${HYPER3D_BASE_URL}/api/v2/download`,
  }
}

export function mapRodinStatus(
  raw: string,
): 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' {
  // Official status values from /api/v2/status: Waiting, Generating, Done, Failed
  // https://developer.hyper3d.ai/api-specification/check-status
  const s = raw.toLowerCase()
  if (s === 'done' || s === 'succeeded' || s === 'completed') return 'COMPLETED'
  if (s === 'failed' || s === 'error') return 'FAILED'
  if (s === 'generating' || s === 'running' || s === 'processing')
    return 'IN_PROGRESS'
  return 'IN_QUEUE'
}

export async function pollRodinJob(
  rodin: RodinSubmitResult,
  apiKey: string,
): Promise<RodinPollResult> {
  // Per official docs: POST application/json with { subscription_key }
  // https://developer.hyper3d.ai/api-specification/check-status
  const response = await fetch(rodin.statusUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subscription_key: rodin.subscriptionKey,
    }),
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'hyper3d_rodin',
      phase: 'status_poll',
      fallbackMessage: `Hyper3D Rodin status poll failed with status ${response.status}`,
      requestId: rodin.jobUuid,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const pollFailure = createProviderPayloadError(data, {
    provider: 'hyper3d_rodin',
    phase: 'status_poll',
    fallbackMessage: 'Hyper3D Rodin status response reported failure.',
    requestId: rodin.jobUuid,
  })
  if (pollFailure) {
    return {
      status: 'FAILED',
      error: pollFailure.message,
      errorCode: pollFailure.errorCode,
      providerMetadata: pollFailure.providerMetadata,
    }
  }

  console.log('[Rodin] poll response:', JSON.stringify(data).slice(0, 400))
  const jobs = Array.isArray(data.jobs) ? data.jobs : []
  const messages = Array.isArray(data.status_messages)
    ? data.status_messages
    : jobs

  if (messages.length === 0) return { status: 'IN_PROGRESS' }

  const statuses = (messages as Array<Record<string, unknown>>)
    .map((m) => readStringField(m, 'status') ?? '')
    .map(mapRodinStatus)

  if (statuses.some((s) => s === 'FAILED')) {
    const failedJob = (messages as Array<Record<string, unknown>>).find(
      (m) => mapRodinStatus(readStringField(m, 'status') ?? '') === 'FAILED',
    )
    const failMsg =
      readStringField(failedJob ?? {}, 'message') ??
      readStringField(failedJob ?? {}, 'error') ??
      JSON.stringify(failedJob)
    console.error(
      '[Rodin] Job FAILED:',
      failMsg,
      'full response:',
      JSON.stringify(data).slice(0, 500),
    )
    return {
      status: 'FAILED',
      error: failMsg,
      providerMetadata: {
        provider: 'hyper3d_rodin',
        phase: 'status_poll',
        jobUuid: rodin.jobUuid,
      },
    }
  }
  if (statuses.every((s) => s === 'COMPLETED')) return { status: 'COMPLETED' }
  if (statuses.some((s) => s === 'IN_PROGRESS'))
    return { status: 'IN_PROGRESS' }
  return { status: 'IN_QUEUE' }
}

export async function downloadAndUploadRodinGlb(
  env: ExecutionEnv,
  context: WorkerModel3DRunContext,
  rodin: RodinSubmitResult,
  apiKey: string,
): Promise<{ artifactUrl: string; glbR2Key: string }> {
  // Step 1: Ask Rodin for the file list (returns JSON with download URLs)
  // Per official docs: POST application/json with { task_uuid }
  // https://developer.hyper3d.ai/api-specification/download-results
  const listResponse = await fetch(rodin.downloadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ task_uuid: rodin.jobUuid }),
  })

  if (!listResponse.ok) {
    const errBody = await listResponse.text().catch(() => '')
    throw new Error(
      `Hyper3D Rodin download list failed (${listResponse.status}): ${errBody.slice(0, 200)}`,
    )
  }

  const listData = (await listResponse.json()) as Record<string, unknown>
  console.log('[Rodin] download list:', JSON.stringify(listData).slice(0, 400))

  const list = Array.isArray(listData.list) ? listData.list : []
  const glbFile = (list as Array<Record<string, unknown>>).find((f) => {
    const name = readStringField(f, 'name') ?? ''
    return name.toLowerCase().endsWith('.glb')
  })

  if (!glbFile) {
    throw new Error(
      `Hyper3D Rodin download list has no GLB file. Response: ${JSON.stringify(listData).slice(0, 300)}`,
    )
  }

  const glbUrl = readStringField(glbFile, 'url')
  if (!glbUrl) {
    throw new Error('Hyper3D Rodin GLB entry has no url.')
  }

  // Step 2: Fetch the GLB binary
  const glbResponse = await fetch(glbUrl)
  if (!glbResponse.ok) {
    throw new Error(
      `Hyper3D Rodin GLB binary download failed with status ${glbResponse.status}`,
    )
  }

  const glbBuffer = await glbResponse.arrayBuffer()
  const glbR2Key = `3d/${context.runId}/${rodin.jobUuid}.glb`

  await env.GENERATION_BUCKET.put(glbR2Key, glbBuffer, {
    httpMetadata: {
      contentType: 'model/gltf-binary',
      cacheControl: R2_OBJECT_CACHE_CONTROL,
    },
  })

  return { artifactUrl: `${env.R2_PUBLIC_URL}/${glbR2Key}`, glbR2Key }
}
