import 'server-only'

import { IMAGE_TAGGER } from '@/constants/image-tagger'
import type { AssistantV3PictureRef } from '@/types/assistant-v3'
import type { ImageTaggerResult } from '@/types/image-tagger'
import { tagPicture } from '@/services/image-tagger.service'

/**
 * look 的「认图」（`tagger: true`）：把眼前这几张交给 PixAI Tagger，读回 Danbooru 标签。
 * 反推画风 / 画师 / 角色时，LLM 自己看图只能猜；这里给的是一个专门认 Danbooru 图的模型的读数。
 */

const RATING_WORDS: Record<string, string> = {
  'rating:g': 'general',
  'rating:s': 'sensitive',
  'rating:q': 'questionable',
  'rating:e': 'explicit',
}

function scored(entries: readonly (readonly [string, number])[], max: number) {
  return entries
    .slice(0, max)
    .map(([tag, score]) => `${tag} ${score.toFixed(2)}`)
    .join(', ')
}

export function renderTaggerReading(
  label: string,
  result: ImageTaggerResult,
): string {
  const { SHOWN } = IMAGE_TAGGER
  const lines = [`${label} — tagger reading:`]
  lines.push(
    `artist / style: ${scored(result.style, SHOWN.style) || 'none recognised'}`,
  )
  lines.push(
    `character: ${scored(result.character, SHOWN.character) || 'none recognised'}`,
  )
  if (result.copyright.length)
    lines.push(`work: ${scored(result.copyright, SHOWN.copyright)}`)
  if (result.general.length)
    lines.push(
      `content: ${result.general
        .slice(0, SHOWN.general)
        .map(([tag]) => tag)
        .join(', ')}`,
    )
  if (result.meta.length)
    lines.push(`medium: ${scored(result.meta, SHOWN.meta)}`)
  const rating = result.rating[0]?.[0]
  if (rating) lines.push(`rating: ${RATING_WORDS[rating] ?? rating}`)
  return lines.join('\n')
}

const TAGGER_NOTE =
  'TAGGER (PixAI Tagger v1.0: Danbooru tags with confidence 0–1; "artist / style" tags are almost all artist names). Above about 0.5 is a confident match; 0.15–0.4 means "looks like their style", say so. It only knows artists and characters on Danbooru up to May 2026, so "none recognised" means not one it knows, not that nobody drew it. Content tags are already in Danbooru form.'

/** 认这几张（去重、最多 `MAX_PICTURES_PER_LOOK` 张），认不成的那张说一句。 */
export async function readTaggerFor(
  userId: string,
  pictures: readonly AssistantV3PictureRef[],
): Promise<string> {
  const seen = new Set<string>()
  const targets = pictures.filter((picture) => {
    if (seen.has(picture.url)) return false
    seen.add(picture.url)
    return true
  })
  if (targets.length === 0)
    return 'TAGGER: no picture to read — name the pictures to tag in names (a number, ref-N, result-N, or an attached picture).'
  const shown = targets.slice(0, IMAGE_TAGGER.MAX_PICTURES_PER_LOOK)
  const readings = await Promise.allSettled(
    shown.map((picture) => tagPicture(userId, picture.url)),
  )
  const parts = readings.map((reading, index) =>
    reading.status === 'fulfilled'
      ? renderTaggerReading(shown[index]!.label, reading.value)
      : `${shown[index]!.label} — the tagger could not read it this time (${reading.reason instanceof Error ? reading.reason.message.slice(0, 120) : 'unknown error'}). Judge it from the picture itself.`,
  )
  const skipped = targets.length - shown.length
  if (skipped > 0)
    parts.push(
      `${skipped} more not read (at most ${IMAGE_TAGGER.MAX_PICTURES_PER_LOOK} per look).`,
    )
  return [TAGGER_NOTE, ...parts].join('\n\n')
}
