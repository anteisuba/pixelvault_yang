import 'server-only'

import {
  CHUB_LIBRARY,
  CHUB_LIBRARY_ERRORS,
} from '@/constants/cards/chub-library'
import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import type { CharacterCardRecord } from '@/types'
import type { ImportChubCardRequest } from '@/types/chub-library'
import { isChubImageUrl, realChubTopics } from '@/lib/chub-library'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import {
  isPng,
  mapTavernCard,
  parseTavernCard,
  stripPngTextChunks,
} from '@/lib/tavern-card'
import { createImportedCharacterCard } from '@/services/cards/character-card.service'

/**
 * **酒馆卡库**（角色页「卡库」页签）：把浏览器从 chub 取来的一张卡建成我们的角色卡。
 *
 * ⛔ 这里不问 api.chub.ai（它拒机房 IP，见 `CHUB_LIBRARY` 头注）：搜索和取定义都在
 * 浏览器，递上来的 `node` 当拖进来的卡文件看（路由层已按 `ImportChubCardSchema` 校验
 * 形状与大小）。落格与酒馆 `downloadChubCharacter` 同一套字段落点，交给文件导入那一条
 * （`mapTavernCard` → `createImportedCharacterCard`）—— 世界书、卡自带系统提示词照样
 * 只存不注入。卡图只从 chub 图床取（机房能取），取不到不拦建卡。
 */

function chubNotFound(): ApiRequestError {
  const error = CHUB_LIBRARY_ERRORS.notFound
  return new ApiRequestError(
    error.code,
    error.httpStatus,
    error.i18nKey,
    error.message,
  )
}

/** 卡图：拿不到、太大、不是图都只是「没有图」，⛔ 不因此拒整张卡。 */
async function fetchCardImage(
  url: string | null | undefined,
): Promise<{ data: Buffer; mimeType: string } | null> {
  if (!isChubImageUrl(url)) return null
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(CHUB_LIBRARY.TIMEOUT_MS),
      cache: 'no-store',
    })
    const mimeType = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    if (
      !response.ok ||
      !(CHUB_LIBRARY.IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)
    ) {
      return null
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > CHUB_LIBRARY.IMAGE_MAX_BYTES) return null
    // PNG 卡图常把整张卡塞在文本块里：去掉再存（与文件导入同一条）。
    const data = isPng(bytes) ? stripPngTextChunks(bytes) : bytes
    return { data: Buffer.from(data), mimeType }
  } catch (error) {
    logger.warn('chub card image fetch failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export async function importChubCard(
  clerkId: string,
  input: ImportChubCardRequest,
): Promise<CharacterCardRecord> {
  const { node } = input
  const { definition } = node
  const [creator] = input.fullPath.split('/')

  // chub 的定义 → 酒馆 V2 卡（字段落点照酒馆 `downloadChubCharacter`：chub 的
  // `personality` 才是酒馆的 description，`description` 是作者写给读者的简介）。
  const card = parseTavernCard({
    spec: TAVERN_CARD.SPEC_V2,
    spec_version: '2.0',
    data: {
      name: definition.name.trim() || node.name,
      description: definition.personality,
      personality: definition.tavern_personality,
      scenario: definition.scenario,
      first_mes: definition.first_message,
      mes_example: definition.example_dialogs,
      creator_notes: definition.description,
      system_prompt: definition.system_prompt,
      post_history_instructions: definition.post_history_instructions,
      alternate_greetings: definition.alternate_greetings,
      tags: realChubTopics(node.topics),
      creator,
      character_version: '',
      character_book: definition.embedded_lorebook ?? undefined,
    },
  })
  if (!card) throw chubNotFound()

  const imported = mapTavernCard(card)
  const stCard = imported.extensions[TAVERN_CARD.EXTENSION_KEY]
  const withSource = {
    ...imported,
    extensions: {
      [TAVERN_CARD.EXTENSION_KEY]: {
        ...(stCard && typeof stCard === 'object' ? stCard : {}),
        source: 'chub',
        fullPath: input.fullPath,
      },
    },
  }

  return createImportedCharacterCard(
    clerkId,
    withSource,
    await fetchCardImage(node.max_res_url),
  )
}
