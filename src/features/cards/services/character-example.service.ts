import 'server-only'

import { CHARACTER_PERSONA_LIMITS } from '@/constants/cards/character-card'
import { CharacterPersonaSchema, type CharacterExampleAdd } from '@/types'
import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { ensureUser } from '@/services/user.service'

/**
 * 聊天里「改写」她那句（⑪ B，owner 10-31「可以加」）：你改成的样子就是她该那样说——
 * 连同你那句存成一段对话示例，放最后（最新），卡上只留最近 10 段（最早的先丢）。
 * ⭐ 是你亲手改的：钉住的「对话示例」也照样加（钉住只拦她自己改）。
 * 不是本人的卡 = `null`。
 */
export async function addCharacterExample(
  clerkId: string,
  cardId: string,
  example: CharacterExampleAdd,
): Promise<{ examples: number } | null> {
  const dbUser = await ensureUser(clerkId)
  const card = await db.characterCard.findFirst({
    where: { id: cardId, userId: dbUser.id, isDeleted: false },
    select: { id: true, persona: true },
  })
  if (!card) return null
  const persona = CharacterPersonaSchema.parse(card.persona ?? {})
  const examples = [...persona.examples, example].slice(
    -CHARACTER_PERSONA_LIMITS.examples,
  )
  await db.characterCard.update({
    where: { id: card.id },
    data: {
      persona: { ...persona, examples } as Prisma.InputJsonObject,
    },
  })
  return { examples: examples.length }
}
