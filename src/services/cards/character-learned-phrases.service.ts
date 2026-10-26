import 'server-only'

import { z } from 'zod'

import { CHARACTER_PERSONA_LIMITS } from '@/constants/cards/character-card'
import { CHAT_LEARN_PHRASES } from '@/constants/chat-voice'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { AssistantRoute } from '@/services/kernel/assistant-route.service'
import { llmTextCompletion } from '@/services/llm-text.service'
import { CharacterPersonaSchema } from '@/types'

/**
 * **学说法**（10-26「更像真人」F，学麦麦的表达学习）：聊天里你每说几句，她从你最近的话里挑几个
 * 口头禅 / 网络用语记到角色卡「学到的说法」上，之后聊天偶尔用一个。
 *
 * ⭐ 只认你**真说过**的：模型挑出来的词必须原样出现在你的话里，⛔ 编出来的不收。
 * ⭐ 满了挤掉最旧的；卡上能删（删了下次可能又学回来——你还在这么说）。
 * ⚠ 不碰卡的 `updatedAt`：角色列表按最近改过排序，聊天学到一个词不该把她顶到最前面。
 * ⚠ 锦上添花：哪一步失败都只记日志，⛔ 影响聊天。
 */

const LearnedSchema = z.object({
  phrases: z.array(z.string().trim()).max(20),
})

const LEARN_SYSTEM_PROMPT = `You read short chat messages written by one person and pick out the expressions that make their way of talking recognisable: slang, internet speak, pet words, catchphrases, playful spellings.
Rules:
- Copy each expression exactly as it appears in the messages; never translate, fix or invent one.
- Skip ordinary words anyone would use, names of people or things, and anything private (contacts, places, health, money).
- Each expression at most ${CHARACTER_PERSONA_LIMITS.learnedPhraseChars} characters. At most ${CHAT_LEARN_PHRASES.maxNewPerRun}. None is a fine answer.
- Output ONLY JSON: {"phrases": ["..."]}`

function parsePhrases(raw: string): string[] {
  const cleaned = raw.replace(/```(?:json)?/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  try {
    const parsed = LearnedSchema.safeParse(
      JSON.parse(cleaned.slice(start, end + 1)),
    )
    return parsed.success ? parsed.data.phrases : []
  } catch {
    return []
  }
}

/** 新学到的并进旧的：去重、只收你真说过的、满了挤掉最旧的。 */
export function mergeLearnedPhrases(
  kept: readonly string[],
  found: readonly string[],
  said: string,
  catchphrases: readonly string[] = [],
): string[] {
  const own = new Set(catchphrases.map((phrase) => phrase.trim()))
  const fresh = [
    ...new Set(
      found
        .map((phrase) => phrase.trim())
        .filter(
          (phrase) =>
            phrase &&
            phrase.length <= CHARACTER_PERSONA_LIMITS.learnedPhraseChars &&
            said.includes(phrase) &&
            !own.has(phrase),
        ),
    ),
  ].slice(0, CHAT_LEARN_PHRASES.maxNewPerRun)
  return [...kept.filter((phrase) => !fresh.includes(phrase)), ...fresh].slice(
    -CHARACTER_PERSONA_LIMITS.learnedPhrases,
  )
}

/** 这一轮该不该学：你在这间说的第 N 句（含刚说的这句）正好是间隔的倍数。 */
export function shouldLearnPhrases(userLineCount: number): boolean {
  return (
    userLineCount > 0 && userLineCount % CHAT_LEARN_PHRASES.everyUserLines === 0
  )
}

/**
 * `said` = 你最近说的几句，旧的在前（调用方各自从自己那份记录里取：聊天房间的台词 / 对话的消息），
 * 只看最后 `readUserLines` 句。
 */
export async function learnCreatorPhrases(input: {
  userId: string
  cardId: string
  said: readonly string[]
  assistant: Pick<AssistantRoute, 'route' | 'modelId'>
}): Promise<string[] | null> {
  try {
    const said = input.said
      .slice(-CHAT_LEARN_PHRASES.readUserLines)
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')
    if (!said) return null
    const card = await db.characterCard.findFirst({
      where: { id: input.cardId, userId: input.userId, isDeleted: false },
      select: { id: true, persona: true, updatedAt: true },
    })
    if (!card) return null
    const persona = CharacterPersonaSchema.safeParse(card.persona ?? {})
    if (!persona.success) return null

    const raw = await llmTextCompletion({
      systemPrompt: LEARN_SYSTEM_PROMPT,
      userPrompt: said,
      promptGuardMaxLength:
        CHAT_LEARN_PHRASES.lineMaxChars * CHAT_LEARN_PHRASES.readUserLines,
      adapterType: input.assistant.route.adapterType,
      apiKey: input.assistant.route.apiKey,
      providerConfig: input.assistant.route.providerConfig,
      modelId: input.assistant.modelId,
    })
    const kept = persona.data.learnedPhrases
    const merged = mergeLearnedPhrases(
      kept,
      parsePhrases(raw),
      said,
      persona.data.catchphrases,
    )
    if (
      merged.length === kept.length &&
      merged.every((phrase, index) => phrase === kept[index])
    )
      return merged
    await db.characterCard.update({
      where: { id: card.id },
      data: {
        persona: { ...persona.data, learnedPhrases: merged },
        updatedAt: card.updatedAt,
      },
    })
    return merged
  } catch (error) {
    logger.warn('Learning creator phrases failed', {
      cardId: input.cardId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
