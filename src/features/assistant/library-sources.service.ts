import 'server-only'

import { db } from '@/lib/db'
import type { DanbooruCatalogKind } from '@/types/danbooru-catalog'
import { listCivitaiLoras } from '@/services/civitai-lora-library.service'
import { listDanbooruFavorites } from '@/services/research/danbooru-favorite.service'
import {
  fetchDanbooruCatalog,
  searchDanbooruTags,
} from '@/services/research/danbooru.connector'
import {
  ASSISTANT_NEXT_FIND_LIMITS as LIMITS,
  ASSISTANT_NEXT_HANDLE_PREFIXES as PREFIX,
} from '@/features/assistant/constants'
import { ranked } from '@/features/assistant/rank'

/**
 * 助手查库的另外几个接头（10-25 打通，方案 /mnt/project-files/assistant-style-reverse/library-access-plan.md）：
 * Danbooru 标签（与标签库 / 查资料同一条接口，含她的标签收藏）、Civitai LoRA 大库（与 LoRA 库页同一条索引）、
 * 音色库（她存的音色卡）。每个接头只回答两件事：按词找 → 一段编号行；按编号打开 → 详情 + 样图。
 * 拼段、出错兜底在 `findInWorkspace` / `openWorkspaceHandle`，这里不管。
 */

interface LibraryRead {
  readonly text: string
  readonly pictures: readonly { url: string; label: string }[]
}

// ---------------------------------------------------------------- Danbooru 标签

/** 画风页（画师 + 画法）先：问标签十有八九是问画风。 */
const TAG_PAGES: readonly DanbooruCatalogKind[] = [
  'artist',
  'general',
  'character',
  'copyright',
]

/** Danbooru 的类别号 → 一个词（画法是 meta 类里认得出的那几十个，归在画风页）。 */
const TAG_CATEGORY_LABELS: Readonly<Record<number, string>> = {
  0: 'general',
  1: 'artist',
  3: 'copyright',
  4: 'character',
  5: 'medium/meta',
}

function tagLine(tag: {
  name: string
  count: number | null
  category?: number
  kind?: string
  zh?: string | null
  ja?: string | null
}): string {
  const label =
    tag.kind ??
    (tag.category === undefined
      ? null
      : (TAG_CATEGORY_LABELS[tag.category] ?? null))
  const local = [tag.zh, tag.ja].filter(Boolean).join(' / ')
  return [
    `${PREFIX.tag}${tag.name}`,
    label,
    tag.count === null ? null : `${tag.count} posts`,
    local || null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function tagPhrases(query: string): string[] {
  return [
    ...new Set(
      query
        .split(/[,，、;；\n]+/)
        .map((phrase) => phrase.trim())
        .filter((phrase) => phrase.length >= 2),
    ),
  ].slice(0, LIMITS.maxTagPhrases)
}

/** 她的标签收藏（库页左栏「收藏」）：空查词 = 全部（最新在前），否则按名字 / 中日文名筛。 */
async function favoriteTagLines(
  clerkId: string,
  phrases: readonly string[],
): Promise<string[]> {
  const favorites = await listDanbooruFavorites(clerkId)
  const words = phrases.map((phrase) =>
    phrase.toLowerCase().replace(/\s+/g, '_'),
  )
  return favorites
    .filter(
      (favorite) =>
        words.length === 0 ||
        words.some((word) =>
          [favorite.name, favorite.zh, favorite.ja].some((field) =>
            field?.toLowerCase().includes(word),
          ),
        ),
    )
    .slice(0, LIMITS.perKind)
    .map((favorite) => tagLine({ ...favorite, kind: favorite.kind }))
}

/** find tags：先她收藏的，再 Danbooru（每段查词一次联网，四页一起）。 */
export async function findTags(
  clerkId: string,
  query: string,
): Promise<string> {
  const phrases = tagPhrases(query)
  const [favorites, ...found] = await Promise.all([
    favoriteTagLines(clerkId, phrases),
    ...phrases.map((phrase) => searchDanbooruTags(phrase, TAG_PAGES)),
  ])
  const seen = new Set<string>()
  const lines = found
    .flat()
    .filter((tag) => !seen.has(tag.name) && Boolean(seen.add(tag.name)))
    .slice(0, LIMITS.perKind * 2)
    .map(tagLine)
  const parts: string[] = []
  if (favorites.length)
    parts.push(`TAGS — their favourites\n${favorites.join('\n')}`)
  if (phrases.length)
    parts.push(
      lines.length
        ? `TAGS — Danbooru\n${lines.join('\n')}`
        : 'TAGS — Danbooru: none found (search one idea at a time, in English or Chinese / Japanese; separate ideas with commas)',
    )
  return (
    parts.join('\n\n') ||
    'TAGS: no favourites yet; give words to search Danbooru.'
  )
}

/** look 标签·xxx：帖子数、简介、常一起出现的标签、全年龄样图（拿来和她的图比画风）。 */
export async function readTag(name: string): Promise<LibraryRead | null> {
  const tag = name.trim().replace(/\s+/g, '_').toLowerCase()
  if (!tag) return null
  const { detail } = await fetchDanbooruCatalog({ tag })
  if (!detail) return null
  return {
    text: [
      tagLine({
        name: detail.tag,
        count: detail.count,
        kind: detail.kind,
        zh: detail.zh,
        ja: detail.ja,
      }),
      detail.work ? `From: ${detail.work}` : '',
      detail.aliases.length
        ? `Other names: ${detail.aliases.slice(0, 8).join(', ')}`
        : '',
      detail.zhNote ? `Note: ${detail.zhNote}` : '',
      detail.wiki ? `Wiki: ${detail.wiki}` : '',
      detail.traits.length
        ? `Often together (of ${detail.sampleSize} safe posts): ${detail.traits
            .map((trait) => `${trait.tag} ×${trait.count}`)
            .join(', ')}`
        : '',
      'As a prompt tag, write it with spaces instead of underscores.',
    ]
      .filter(Boolean)
      .join('\n'),
    pictures: detail.images.slice(0, LIMITS.pictures).map((image, index) => ({
      // 大图是 850px 的样张（动图 / 视频的大图是 mp4，看不了，退回缩略图）。
      url:
        image.large && /\.(jpe?g|png|webp)$/i.test(image.large)
          ? image.large
          : image.url,
      label: `${detail.tag} sample ${index + 1}`,
    })),
  }
}

// ---------------------------------------------------------------- Civitai LoRA 大库

/** find lora_library：与 LoRA 库页同一条索引；挂上去照旧 `add_lora`（按名字）。 */
export async function findLibraryLoras(query: string): Promise<string> {
  const { items } = await listCivitaiLoras({
    search: query.trim(),
    pageSize: LIMITS.perKind,
  })
  return items.length
    ? `LORA LIBRARY (Civitai — not saved yet unless also listed under LORAS)\n${items
        .map(
          (item) =>
            `${PREFIX.lora}${item.name} · ${item.type} · base ${item.baseModelFamily ?? '?'}${item.triggerWord ? ` · trigger ${item.triggerWord}` : ''} · ${item.downloadCount} downloads`,
        )
        .join('\n')}`
    : 'LORA LIBRARY: none found'
}

/** look LoRA·xxx 在她的库里没有时：去大库按名字找那一把。 */
export async function readLibraryLora(
  name: string,
): Promise<LibraryRead | null> {
  const wanted = name.trim().toLowerCase()
  if (!wanted) return null
  const { items } = await listCivitaiLoras({
    search: name.trim(),
    pageSize: LIMITS.perKind,
  })
  const item =
    items.find((entry) => entry.name.toLowerCase() === wanted) ??
    items.find((entry) => entry.name.toLowerCase().includes(wanted))
  if (!item) return null
  return {
    text: [
      `${PREFIX.lora}${item.name} · ${item.type} · base ${item.baseModelFamily ?? 'unknown'} · Civitai library (not in their library; add_lora mounts it by name)`,
      item.triggerWord ? `Trigger: ${item.triggerWord}` : 'Trigger: none',
      `Recommended weight: ${item.defaultScale ?? 1}`,
      item.tags.length ? `Tags: ${item.tags.slice(0, 12).join(', ')}` : '',
      item.recommendedPrompt
        ? `Author's example prompt: ${item.recommendedPrompt.replace(/\s+/g, ' ').slice(0, 1_200)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    pictures: [item.coverImageUrl, ...(item.previewImageUrls ?? [])]
      .filter((url): url is string => Boolean(url))
      .slice(0, LIMITS.pictures)
      .map((url, index) => ({
        url,
        label: `${item.name} sample ${index + 1}`,
      })),
  }
}

// ---------------------------------------------------------------- 音色

interface VoiceRow {
  id: string
  name: string
  provider: string
  gender: string | null
  age: string | null
  tone: unknown
  pace: string
  pitch: string | null
  sampleText: string | null
  referenceAudioUrl: string | null
  characterCards: { name: string }[]
}

async function listVoices(userId: string): Promise<VoiceRow[]> {
  return db.voiceCard.findMany({
    where: { userId, isDeleted: false },
    orderBy: { createdAt: 'desc' },
    take: LIMITS.listScan,
    select: {
      id: true,
      name: true,
      provider: true,
      gender: true,
      age: true,
      tone: true,
      pace: true,
      pitch: true,
      sampleText: true,
      referenceAudioUrl: true,
      characterCards: { select: { name: true } },
    },
  })
}

function toneOf(voice: VoiceRow): string[] {
  return Array.isArray(voice.tone)
    ? voice.tone.filter((item): item is string => typeof item === 'string')
    : []
}

function voiceLine(voice: VoiceRow): string {
  return [
    `${PREFIX.voice}${voice.name}`,
    voice.referenceAudioUrl ? 'cloned' : 'saved',
    [voice.gender, voice.age].filter(Boolean).join(' ') || null,
    toneOf(voice).join(', ') || null,
    voice.characterCards.length
      ? `voice of ${voice.characterCards.map((card) => `${PREFIX.character}${card.name}`).join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** find voices：名字、性别年龄、音色词、谁在用。 */
export async function findVoices(
  userId: string,
  query: string,
): Promise<string> {
  const voices = ranked(await listVoices(userId), query, (voice) => [
    voice.name,
    voice.gender,
    voice.age,
    toneOf(voice).join(' '),
    voice.sampleText,
    ...voice.characterCards.map((card) => card.name),
  ])
  return voices.length
    ? `VOICES\n${voices.map(voiceLine).join('\n')}`
    : 'VOICES: none found'
}

export async function readVoice(
  userId: string,
  name: string,
): Promise<LibraryRead | null> {
  const wanted = name.trim().toLowerCase()
  const voices = await listVoices(userId)
  const voice =
    voices.find((item) => item.name.toLowerCase() === wanted) ??
    voices.find((item) => item.name.toLowerCase().includes(wanted))
  if (!voice) return null
  return {
    text: [
      voiceLine(voice),
      `Provider: ${voice.provider} · pace ${voice.pace}${voice.pitch ? ` · pitch ${voice.pitch}` : ''}`,
      voice.sampleText ? `Sample line: ${voice.sampleText}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    pictures: [],
  }
}
