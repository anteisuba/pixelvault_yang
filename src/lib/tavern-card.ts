import {
  CHARACTER_CARD,
  CHARACTER_PERSONA_LIMITS,
} from '@/constants/cards/character-card'
import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import { ASSISTANT_PERSONA_LIMITS } from '@/constants/assistant-persona'
import type { CardExtensions, CharacterPersona } from '@/types'
import type { AssistantPromptWorldEntry } from '@/types/assistant-persona'
import {
  TavernCardEnvelopeSchema,
  TavernCardFieldsSchema,
  TavernCardKeptSchema,
  TavernWorldBookSchema,
  TavernWorldEntrySchema,
  type TavernCardFields,
} from '@/types/tavern-card'
import { readPngTextChunks } from '@/lib/png-text-chunks'

/**
 * **酒馆卡 → 我们的角色卡**（2026-10-14，附录J ⑥）。纯函数：PNG 字节 / JSON 进来，
 * 一份建卡用的字段出去；读库、传图、建卡在 `tavern-card-import.service`。
 *
 * 字段落点（附录J 第四节）：
 *   description → 经历（酒馆这一格什么都写，经历是我们最宽的一格）
 *   personality → 性格 · scenario → 情境 · first_mes → 开场白
 *   mes_example → 示例对白（按 `<START>` 切块）· creator_notes → 简介 · tags → 标签
 *   其余（世界书、卡自带系统提示词、历史之后的指令、备选开场白）→ `st.card` 原样存，⛔ 不注入
 * ⚠ `{{char}}` / `{{user}}` 宏**原样存**：进提示词那一跳再换成名字（称呼会改）。
 */

const utf8 = new TextDecoder('utf-8')

function decodeBase64Utf8(text: string): string | null {
  try {
    const binary = atob(text.trim())
    return utf8.decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
  } catch {
    return null
  }
}

/** PNG 卡里那段 JSON 文本（`ccv3` 优先，`chara` 回落）；不是卡是 `null`。 */
export function extractTavernCardJson(bytes: Uint8Array): string | null {
  const texts = new Map<string, string>()
  for (const { keyword, text } of readPngTextChunks(bytes)) {
    texts.set(keyword.toLowerCase(), text)
  }
  for (const keyword of TAVERN_CARD.PNG_KEYWORDS) {
    const payload = texts.get(keyword)
    const json = payload ? decodeBase64Utf8(payload) : null
    if (json) return json
  }
  return null
}

/** JSON → 卡上的字段（V2 / V3 拆 `data`，否则按 V1 平铺）。没有名字就不是卡：`null`。 */
export function parseTavernCard(
  json: unknown,
): { spec: string; fields: TavernCardFields } | null {
  if (!json || typeof json !== 'object') return null
  const envelope = TavernCardEnvelopeSchema.safeParse(json)
  const fields = TavernCardFieldsSchema.parse(
    envelope.success ? envelope.data.data : json,
  )
  if (!fields.name.trim()) return null
  return {
    spec: envelope.success ? envelope.data.spec : 'chara_card_v1',
    fields,
  }
}

function clip(text: string, max: number): string {
  const trimmed = text.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

const SPEAKER_LINE = /^\s*(\{\{user\}\}|<USER>|\{\{char\}\}|<BOT>)\s*:\s*/i

/**
 * `mes_example` → 示例对白。按 `<START>` 切块；块里 `{{user}}:` 起一句问、
 * `{{char}}:` 起一句答（`<USER>` / `<BOT>` 老写法也认，角色名开头的行算答），
 * 不以说话人开头的行接在上一句后面。一块里一问一答成一组；只有答没有问时问留空。
 */
export function parseTavernExamples(
  text: string,
  charName: string,
): CharacterPersona['examples'] {
  const examples: CharacterPersona['examples'] = []
  const charPrefix = new RegExp(
    `^\\s*${charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*`,
  )
  for (const block of text.split(/<START>/i)) {
    let user = ''
    let reply = ''
    let speaker: 'user' | 'char' | null = null
    const flush = () => {
      if (reply.trim()) {
        examples.push({
          user: clip(user, CHARACTER_PERSONA_LIMITS.exampleUserChars),
          reply: clip(reply, CHARACTER_PERSONA_LIMITS.exampleReplyChars),
        })
      }
      user = ''
      reply = ''
    }
    for (const line of block.split('\n')) {
      const marked = SPEAKER_LINE.exec(line)
      const byName = marked ? null : charPrefix.exec(line)
      if (marked || byName) {
        const isUser = marked ? /user/i.test(marked[1]) : false
        const rest = line.slice((marked ?? byName)![0].length)
        if (isUser) {
          if (reply.trim()) flush()
          user = user ? `${user}\n${rest}` : rest
          speaker = 'user'
        } else {
          reply = reply ? `${reply}\n${rest}` : rest
          speaker = 'char'
        }
      } else if (speaker === 'user') {
        user = `${user}\n${line}`
      } else if (speaker === 'char') {
        reply = `${reply}\n${line}`
      }
    }
    flush()
    if (examples.length >= CHARACTER_PERSONA_LIMITS.examples) break
  }
  return examples.slice(0, CHARACTER_PERSONA_LIMITS.examples)
}

/** 建卡用的那一份（`createImportedCharacterCard` 的入参，图另给）。 */
export interface TavernCardImport {
  name: string
  summary: string | null
  tags: string[]
  persona: CharacterPersona
  extensions: CardExtensions
}

/** 卡上的字段 → 我们的格子（落点见文件头注）。 */
export function mapTavernCard(card: {
  spec: string
  fields: TavernCardFields
}): TavernCardImport {
  const { fields } = card
  const name = clip(fields.name, CHARACTER_CARD.NAME_MAX_LENGTH)
  const tags = [
    ...new Set(
      fields.tags
        .map((tag) => clip(tag, CHARACTER_CARD.TAG_MAX_LENGTH))
        .filter(Boolean),
    ),
  ].slice(0, CHARACTER_CARD.MAX_TAGS)
  const kept = {
    spec: card.spec,
    ...(fields.creator ? { creator: fields.creator } : {}),
    ...(fields.character_version
      ? { characterVersion: fields.character_version }
      : {}),
    ...(fields.system_prompt ? { systemPrompt: fields.system_prompt } : {}),
    ...(fields.post_history_instructions
      ? { postHistoryInstructions: fields.post_history_instructions }
      : {}),
    ...(fields.alternate_greetings.length
      ? {
          alternateGreetings: fields.alternate_greetings.slice(
            0,
            TAVERN_CARD.MAX_ALTERNATE_GREETINGS,
          ),
        }
      : {}),
    ...(fields.character_book !== undefined
      ? { characterBook: fields.character_book }
      : {}),
    // 经历一格装不下的那截：全文留在这里，⛔ 不静默丢。
    ...(fields.description.trim().length > CHARACTER_PERSONA_LIMITS.backstory
      ? { description: fields.description }
      : {}),
  }
  return {
    name,
    summary:
      clip(fields.creator_notes, CHARACTER_CARD.SUMMARY_MAX_LENGTH) || null,
    tags,
    persona: {
      identity: '',
      behavior: clip(fields.personality, CHARACTER_PERSONA_LIMITS.behavior),
      speech: '',
      boundaries: '',
      catchphrases: [],
      moods: [],
      learnedPhrases: [],
      relationship: '',
      interests: [],
      scenario: clip(fields.scenario, CHARACTER_PERSONA_LIMITS.scenario),
      opening: clip(fields.first_mes, CHARACTER_PERSONA_LIMITS.opening),
      examples: parseTavernExamples(fields.mes_example, fields.name.trim()),
      backstory: clip(fields.description, CHARACTER_PERSONA_LIMITS.backstory),
    },
    extensions: { [TAVERN_CARD.EXTENSION_KEY]: kept },
  }
}

/**
 * 这个文件按什么交上去（浏览器那一侧先挑一遍）：PNG 卡 / JSON 卡，别的 `null`。
 * ⚠ 不只看 `type`：.json 在不少系统上 `type` 是空串。
 */
export function tavernCardMime(file: {
  name: string
  type: string
}): 'image/png' | 'application/json' | null {
  const name = file.name.toLowerCase()
  if (file.type === 'image/png' || name.endsWith('.png')) return 'image/png'
  if (file.type === 'application/json' || name.endsWith('.json')) {
    return 'application/json'
  }
  return null
}

/**
 * 卡作者写给 AI 的那两句（酒馆 `system_prompt` / `post_history_instructions`，角色大项目第 ② 步）：
 * 只在和她聊天时用（owner 10-29 ⛔ 进工作台）。酒馆的 `{{original}}`（「接上默认提示」）这里没有默认提示可接，去掉。
 */
export function readTavernAuthorNotes(extensions: unknown): {
  system: string
  postHistory: string
} {
  const kept =
    extensions && typeof extensions === 'object'
      ? (extensions as Record<string, unknown>)[TAVERN_CARD.EXTENSION_KEY]
      : undefined
  const parsed = TavernCardKeptSchema.safeParse(kept ?? {})
  const clean = (text: string | undefined) =>
    (text ?? '').replace(/\{\{original\}\}/gi, '').trim()
  return parsed.success
    ? {
        system: clean(parsed.data.systemPrompt),
        postHistory: clean(parsed.data.postHistoryInstructions),
      }
    : { system: '', postHistory: '' }
}

/**
 * 卡上原样存着的世界书（`extensions['st.card'].characterBook`）→ 聊天时能用的几条（附录L 第二片 C）。
 * 关了的、没正文的、既没关键词又不常驻的丢掉；按酒馆的插入顺序排；最多 `maxWorldEntries` 条。
 * ⚠ 只取「关键词 → 正文」与常驻：酒馆的次关键词 / 概率 / 递归 / 插入位置这些 ⛔ 不照搬 ——
 *   正文交给模型当资料自己判断，代码只做「对白里提到了没有」。
 */
export function readTavernWorldBook(
  extensions: unknown,
): AssistantPromptWorldEntry[] {
  const kept =
    extensions && typeof extensions === 'object'
      ? (extensions as Record<string, unknown>)[TAVERN_CARD.EXTENSION_KEY]
      : undefined
  const keptParsed = TavernCardKeptSchema.safeParse(kept ?? {})
  if (!keptParsed.success) return []
  const book = TavernWorldBookSchema.safeParse(keptParsed.data.characterBook)
  if (!book.success) return []
  const raw = Array.isArray(book.data.entries)
    ? book.data.entries
    : Object.values(book.data.entries)
  return raw
    .map((value, index) => {
      const entry = TavernWorldEntrySchema.safeParse(value)
      if (!entry.success) return null
      const { data } = entry
      if (data.enabled === false || data.disable === true) return null
      const content = data.content.trim()
      const keys = [...(data.keys ?? []), ...(data.key ?? [])]
        .map((key) => key.trim())
        .filter(Boolean)
        .slice(0, ASSISTANT_PERSONA_LIMITS.maxWorldKeys)
      const constant = data.constant === true
      if (!content || (!constant && keys.length === 0)) return null
      return {
        entry: { keys, content, constant },
        order: data.insertion_order ?? data.order ?? 0,
        index,
      }
    })
    .filter((item) => item !== null)
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .slice(0, ASSISTANT_PERSONA_LIMITS.maxWorldEntries)
    .map((item) => item.entry)
}
