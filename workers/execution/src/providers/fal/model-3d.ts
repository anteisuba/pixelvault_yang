import type {
  ExecutionEnv,
  FalQueueSubmitResult,
  WorkerModel3DRunContext,
} from '../../index'
import { reportProviderJobId } from '../../lib/app-bridge'
import { isRecord, readStringField } from '../../lib/fields'
import { JSON_CONTENT_TYPE } from '../../lib/http'
import {
  createProviderPayloadError,
  createProviderResponseError,
} from '../../lib/provider-error'

// ─── fal.ai model-3D (Hunyuan3D) ─────────────────────────────────────────────

export function buildFalModel3DQueueRequest(context: WorkerModel3DRunContext): {
  endpointModelId: string
  input: Record<string, unknown>
} {
  const { providerInput } = context
  const input: Record<string, unknown> = {
    image_url: providerInput.imageUrl,
  }

  if (providerInput.seed != null) input.seed = providerInput.seed
  if (providerInput.removeBackground != null)
    input.remove_background = providerInput.removeBackground
  if (providerInput.enablePbr != null)
    input.enable_pbr = providerInput.enablePbr
  if (providerInput.faceCount != null)
    input.face_count = providerInput.faceCount
  if (providerInput.octreeResolution != null)
    input.octree_resolution = providerInput.octreeResolution
  if (providerInput.generateType != null)
    input.generate_type = providerInput.generateType
  if (providerInput.polygonType != null)
    input.polygon_type = providerInput.polygonType

  return { endpointModelId: providerInput.externalModelId, input }
}

/**
 * Hunyuan3D's fal queue submit. Extracted from `Hunyuan3DWorkflow` so the
 * providerJobId report below is reachable from tests — the workflow step body
 * itself isn't.
 */
export async function submitFalModel3DQueue(
  context: WorkerModel3DRunContext,
  apiKey: string,
  env: ExecutionEnv,
): Promise<FalQueueSubmitResult> {
  const queueBody = buildFalModel3DQueueRequest(context)
  const endpoint = `https://queue.fal.run/${queueBody.endpointModelId}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(queueBody.input),
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'fal',
      phase: 'model_3d_queue_submit',
      fallbackMessage: `fal.ai 3D queue submit failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const submitFailure = createProviderPayloadError(data, {
    provider: 'fal',
    phase: 'model_3d_queue_submit',
    fallbackMessage: 'fal.ai 3D queue submit reported failure.',
  })
  if (submitFailure) throw submitFailure

  const requestId = readStringField(data, 'request_id')
  const statusUrl = readStringField(data, 'status_url')
  const responseUrl = readStringField(data, 'response_url')

  if (!requestId || !statusUrl || !responseUrl) {
    throw new Error('fal.ai 3D queue submit returned invalid response.')
  }

  // Same `{model_id}/requests/{request_id}` shape cancelProviderJob's fal
  // branch expects — a bare request id would 404 there.
  await reportProviderJobId(
    env,
    context,
    `${queueBody.endpointModelId}/requests/${requestId}`,
  )

  return { requestId, statusUrl, responseUrl }
}

export function readFalModel3DResult(resultData: Record<string, unknown>): {
  artifactUrl: string | null
  mimeType: string
} {
  // 混元 3D v3 / v3.1、Trellis 2 回 { model_glb: { url } }（11-03 契约测试按官方
  // OpenAPI 查出来的；以前只认 model_mesh，这三个出完会被判「没有产物」）。
  // 混元 v2 / TripoSR 回 { model_mesh: { url, content_type } }。
  const mesh = isRecord(resultData.model_glb)
    ? resultData.model_glb
    : isRecord(resultData.model_mesh)
      ? resultData.model_mesh
      : null
  if (mesh) {
    return {
      artifactUrl: readStringField(mesh, 'url'),
      mimeType: readStringField(mesh, 'content_type') ?? 'model/gltf-binary',
    }
  }
  // Fallback: some endpoints return { glb: { url } }
  const glb = isRecord(resultData.glb) ? resultData.glb : null
  if (glb) {
    return {
      artifactUrl: readStringField(glb, 'url'),
      mimeType: 'model/gltf-binary',
    }
  }
  return { artifactUrl: null, mimeType: 'model/gltf-binary' }
}
