import 'server-only'

import { z } from 'zod'

import { db } from '@/lib/db'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { ensureUser } from '@/services/user.service'
import { CharacterPersonaSchema } from '@/types'

/**
 * **试读**（卡片页「设定」一行，owner 09-26）：让助手用这个角色的口吻说两句，
 * 用户一眼判断设定写得像不像——和外观的「试镜」对称，但不花出图的钱。
 *
 * ⚠ 只读卡、不写卡；台词不落库。语言跟着设定原文走（设定是中文就说中文）。
 */

const SAMPLE_LINE_COUNT = 2
const SAMPLE_LINE_MAX_LENGTH = 120

const SampleLinesSchema = z.object({
  lines: z
    .array(z.string().trim().min(1).max(SAMPLE_LINE_MAX_LENGTH))
    .min(1)
    .max(SAMPLE_LINE_COUNT),
})

const SYSTEM_PROMPT = `You write short lines of dialogue spoken by a fictional character, to let the author check whether the character profile reads right.
Rules:
- Write exactly ${SAMPLE_LINE_COUNT} different lines the character would say to the user in everyday situations.
- Follow the profile's way of speaking, catchphrases and forms of address exactly; show personality through what they say, not by describing it.
- Use the same language as the profile.
- Each line at most ${SAMPLE_LINE_MAX_LENGTH} characters, no narration, no quotes around it.
- Output ONLY JSON: {"lines": ["...", "..."]}`

function parseLines(raw: string): string[] | null {
  const cleaned = raw.replace(/```(?:json)?/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = SampleLinesSchema.safeParse(
      JSON.parse(cleaned.slice(start, end + 1)),
    )
    return parsed.success ? parsed.data.lines : null
  } catch {
    return null
  }
}

export async function sampleCharacterLines(
  clerkId: string,
  cardId: string,
): Promise<{ lines: string[] } | null> {
  const dbUser = await ensureUser(clerkId)
  const card = await db.characterCard.findFirst({
    where: { id: cardId, userId: dbUser.id, isDeleted: false },
    select: { name: true, persona: true },
  })
  if (!card) return null

  const persona = CharacterPersonaSchema.nullable().safeParse(card.persona)
  const profile = persona.success ? persona.data : null
  const userPrompt = [
    `Name: ${card.name}`,
    profile?.identity ? `Identity: ${profile.identity}` : null,
    profile?.behavior ? `Personality (behaviour): ${profile.behavior}` : null,
    profile?.speech ? `Way of speaking: ${profile.speech}` : null,
    profile?.catchphrases.length
      ? `Catchphrases: ${profile.catchphrases.join(' / ')}`
      : null,
    profile?.backstory ? `Backstory: ${profile.backstory}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const route = await resolveLlmTextRoute(dbUser.id)
  const raw = await llmTextCompletion({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    adapterType: route.adapterType,
    apiKey: route.apiKey,
    providerConfig: route.providerConfig,
  })
  const lines = parseLines(raw)
  if (!lines) throw new Error('The assistant did not return usable lines.')
  return { lines }
}
