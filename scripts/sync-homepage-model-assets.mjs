import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

const OUTPUT_DIRS = {
  image: 'public/homepage/production/models/image',
  video: 'public/homepage/production/models/video',
  audio: 'public/homepage/production/models/audio',
  model3d: 'public/homepage/production/models/model3d',
}

/**
 * Prefer owner-published model art. Provider variants of the same underlying
 * model intentionally share its official art. Runner entries use the preview
 * attached to the exact checkpoint version installed by PixelVault.
 */
const SOURCES = {
  image: {
    'gemini-3-pro-image-preview':
      'https://ai.google.dev/static/site-assets/images/image-generation.png',
    'flux-2-pro': 'https://fal.ai/api/models/thumbnail/fal-ai/flux-2-pro',
    'seedream-5.0-pro':
      'https://fal.ai/api/models/thumbnail/bytedance/seedream/v5/pro/text-to-image',
    'seedream-5.0-lite':
      'https://fal.ai/api/models/thumbnail/fal-ai/bytedance/seedream/v5/lite/text-to-image',
    'seedream-5.0-volcengine':
      'https://fal.ai/api/models/thumbnail/bytedance/seedream/v5/pro/text-to-image',
    'recraft-v4-pro':
      'https://fal.ai/api/models/thumbnail/fal-ai/recraft/v4.1/pro/text-to-image',
    'illustrious-xl':
      'https://og-api.replicateassets.com/api/models/delta-lock/noobai-xl',
    'flux-lora': 'https://fal.ai/api/models/thumbnail/fal-ai/flux-lora',
    'flux-2-flash': 'https://fal.ai/api/models/thumbnail/fal-ai/flux-2/flash',
    'gemini-3.1-flash-image-preview':
      'https://ai.google.dev/static/site-assets/images/share-gemini-api-2026-07.png',
    'gemini-3.1-flash-lite-image':
      'https://ai.google.dev/static/site-assets/images/share-gemini-api-2026-07.png',
    'flux-kontext-max':
      'https://fal.ai/api/models/thumbnail/fal-ai/flux-pro/kontext/max/multi',
    'illustrious-recipe-clone':
      'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/9ca594fc-9f53-4fab-8f3f-62e73d6ff604/original=true/97626518.jpeg',
    'anima-pencil-xl-runner':
      'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/48499ad8-33bb-4a2c-aac8-af6c6edcc280/original=true/17129585.jpeg',
    'pony-diffusion-v6':
      'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/4790674c-e16d-4dc7-b384-af4381fcfa3f/original=true/5706937.jpeg',
    'sdxl-10-runner':
      'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/8f9573d7-5616-4260-a967-53343afd5e33/original=true/1777436.jpeg',
    'anima-dit-runner':
      'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/bb377487-c631-4a5d-a37d-eb3b8cb086ce/original=true/130697922.jpeg',
  },
  video: {
    'seedance-2.0-fast':
      'https://fal.ai/api/models/thumbnail/bytedance/seedance-2.0/fast/text-to-video',
    'seedance-2.0':
      'https://fal.ai/api/models/thumbnail/bytedance/seedance-2.0/text-to-video',
    'happyhorse-1.0':
      'https://fal.ai/api/models/thumbnail/alibaba/happy-horse/v1.1/text-to-video',
    'gemini-omni-flash':
      'https://ai.google.dev/static/site-assets/images/share-gemini-api-2026-07.png',
    'kling-v3-pro':
      'https://fal.ai/api/models/thumbnail/fal-ai/kling-video/v3/pro/text-to-video',
    'seedance-2.0-fast-reference':
      'https://fal.ai/api/models/thumbnail/bytedance/seedance-2.0/fast/reference-to-video',
    'seedance-2.0-reference':
      'https://fal.ai/api/models/thumbnail/bytedance/seedance-2.0/reference-to-video',
    'seedance-2.0-fast-volcengine':
      'https://fal.ai/api/models/thumbnail/bytedance/seedance-2.0/fast/text-to-video',
    'seedance-2.0-volcengine':
      'https://fal.ai/api/models/thumbnail/bytedance/seedance-2.0/text-to-video',
    'seedance-2.0-fast-reference-volcengine':
      'https://fal.ai/api/models/thumbnail/bytedance/seedance-2.0/fast/reference-to-video',
    'seedance-2.0-reference-volcengine':
      'https://fal.ai/api/models/thumbnail/bytedance/seedance-2.0/reference-to-video',
  },
  audio: {
    'fish-audio-s2-pro':
      'https://hanabiaiinc.mintlify.app/mintlify-assets/_next/image?url=%2F_mintlify%2Fapi%2Fog%3Fdivision%3DTTS%2B%2526%2BASR%2B%2528v1%2529%26title%3DText%2Bto%2BSpeech%26description%3DConvert%2Btext%2Bto%2Bspeech%26logoLight%3Dhttps%253A%252F%252Fmintcdn.com%252Fhanabiaiinc%252FamYp9Dj31LtlHliX%252Flogo%252Flight.png%253Ffit%253Dmax%2526auto%253Dformat%2526n%253DamYp9Dj31LtlHliX%2526q%253D85%2526s%253D305973cd6a8d11dbf36d1ec682ee845e%26logoDark%3Dhttps%253A%252F%252Fmintcdn.com%252Fhanabiaiinc%252FamYp9Dj31LtlHliX%252Flogo%252Fdark.png%253Ffit%253Dmax%2526auto%253Dformat%2526n%253DamYp9Dj31LtlHliX%2526q%253D85%2526s%253Db79bd889db9ac1aae939834596e8a22f%26primaryColor%3D%25230e0e0e%26lightColor%3D%25239b90e8%26backgroundLight%3D%2523ffffff%26backgroundDark%3D%25230c0c0f&w=1200&q=100',
    'eleven-sfx-v2': 'https://elevenlabs.io/cover.png',
  },
  model3d: {
    'rodin-gen-2.5':
      'https://developer.hyper3d.ai/~gitbook/image?url=https%3A%2F%2F1764544196-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Forganizations%252FEaXBzJQic091iYv3YBMA%252Fsites%252Fsite_du3Ht%252Fsocialpreview%252FP8U9NFq7317I1iqQOZS4%252F1719587968751.jpeg%3Falt%3Dmedia%26token%3D3cd078af-142f-4524-b1bb-b492a3c40bb2&width=1200&height=630&sign=674b3712&sv=2',
    'hunyuan3d-v3.1-pro':
      'https://static.www.tencent.com/uploads/2025/11/26/f126e13e424fb6903c0891c383ecb495.jpg!article.cover',
    'hunyuan3d-v3':
      'https://fal.ai/api/models/thumbnail/fal-ai/hunyuan3d-v3/image-to-3d',
    'trellis-2':
      'https://raw.githubusercontent.com/microsoft/TRELLIS.2/main/assets/teaser.webp',
    triposr: 'https://fal.ai/api/models/thumbnail/fal-ai/triposr',
  },
}

const entries = Object.entries(SOURCES).flatMap(([group, models]) =>
  Object.entries(models).map(([id, source]) => ({ group, id, source })),
)

for (const dir of Object.values(OUTPUT_DIRS)) {
  await mkdir(dir, { recursive: true })
}

for (const { group, id, source } of entries) {
  const response = await fetch(source, {
    redirect: 'follow',
    headers: { 'user-agent': 'PixelVault homepage asset sync' },
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw new Error(`${id}: ${response.status} ${response.statusText}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) {
    throw new Error(`${id}: expected an image, got ${contentType || 'unknown'}`)
  }

  const input = Buffer.from(await response.arrayBuffer())
  const output = await sharp(input)
    .rotate()
    .resize(640, 640, { fit: 'cover', position: 'attention' })
    .webp({ quality: 88, effort: 5 })
    .toBuffer()
  const filename = path.join(OUTPUT_DIRS[group], `${id}.webp`)
  await writeFile(filename, output)
  console.log(`${id}\t${output.length}\t${filename}`)
}
