import type {
  ExecutionEnv,
  WorkerAudioRunContext,
  WorkerModel3DRunContext,
  WorkerVideoRunContext,
} from '../index'
import { buildR2PublicUrl, R2_OBJECT_CACHE_CONTROL } from './image-io'

export async function downloadAndUploadModel3DArtifact(
  env: ExecutionEnv,
  context: WorkerModel3DRunContext,
  artifactUrl: string,
  mimeType: string,
): Promise<{ artifactUrl: string; glbR2Key: string }> {
  const response = await fetch(artifactUrl)
  if (!response.ok) {
    throw new Error(
      `3D artifact download failed with status ${response.status}`,
    )
  }

  const buffer = await response.arrayBuffer()
  const glbR2Key = `3d/${context.runId}/model.glb`

  await env.GENERATION_BUCKET.put(glbR2Key, buffer, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: R2_OBJECT_CACHE_CONTROL,
    },
  })

  return {
    artifactUrl: `${env.R2_PUBLIC_URL}/${glbR2Key}`,
    glbR2Key,
  }
}

export async function downloadAndUploadAudioArtifact(
  env: ExecutionEnv,
  context: WorkerAudioRunContext,
  artifactUrl: string,
  mimeType: string,
): Promise<{ artifactUrl: string; audioR2Key: string }> {
  const response = await fetch(artifactUrl)
  if (!response.ok) {
    throw new Error(
      `Audio artifact download failed with status ${response.status}`,
    )
  }

  const audioBytes = await response.arrayBuffer()
  const outputFormat = context.providerInput.format ?? 'wav'
  const audioR2Key =
    context.providerInput.outputStorageKey ??
    `generations/worker/audio/${context.runId}/output.${outputFormat}`

  await env.GENERATION_BUCKET.put(audioR2Key, audioBytes, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: R2_OBJECT_CACHE_CONTROL,
    },
  })

  return {
    artifactUrl: buildR2PublicUrl(env, audioR2Key),
    audioR2Key,
  }
}

export async function downloadAndUploadVideoArtifact(
  env: ExecutionEnv,
  context: WorkerVideoRunContext,
  artifactUrl: string,
  mimeType: string,
  fetchHeaders?: Record<string, string>,
): Promise<{ artifactUrl: string; videoR2Key: string }> {
  return downloadAndUploadVideoArtifactToKey(
    env,
    artifactUrl,
    mimeType,
    context.providerInput.outputStorageKey ??
      `generations/worker/video/${context.runId}/output.mp4`,
    fetchHeaders,
  )
}

export async function downloadAndUploadVideoArtifactToKey(
  env: ExecutionEnv,
  artifactUrl: string,
  mimeType: string,
  videoR2Key: string,
  fetchHeaders?: Record<string, string>,
): Promise<{ artifactUrl: string; videoR2Key: string }> {
  let response = await fetch(artifactUrl, {
    headers: fetchHeaders,
    ...(fetchHeaders ? { redirect: 'manual' as const } : {}),
  })
  if (fetchHeaders && response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (!location) throw new Error('Video download redirect has no location.')
    const target = new URL(location, artifactUrl)
    if (target.protocol !== 'https:') {
      throw new Error('Video download redirect requires HTTPS.')
    }
    await response.body?.cancel()
    // Google may redirect to a signed media URL. It needs no API key; custom
    // x-goog-api-key headers are otherwise forwarded by fetch across origins.
    response = await fetch(target.toString())
  }
  if (!response.ok) {
    throw new Error(
      `Video artifact download failed with status ${response.status}`,
    )
  }

  const videoBytes = await response.arrayBuffer()

  await env.GENERATION_BUCKET.put(videoR2Key, videoBytes, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: R2_OBJECT_CACHE_CONTROL,
    },
  })

  return {
    artifactUrl: buildR2PublicUrl(env, videoR2Key),
    videoR2Key,
  }
}
