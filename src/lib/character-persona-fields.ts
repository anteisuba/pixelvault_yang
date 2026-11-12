import type { ASSISTANT_V3_CHARACTER_EDIT_PARTS } from '@/constants/assistant-v3'
import { CHARACTER_PERSONA_LIMITS } from '@/constants/cards/character-card'
import type { CharacterPersona } from '@/types'
import { parseTavernExamples } from '@/lib/tavern-card'

/** 设定里一格（「look」不在设定里，住在默认造型上）。 */
export type PersonaTextPart = Exclude<
  (typeof ASSISTANT_V3_CHARACTER_EDIT_PARTS)[number],
  'look'
>

/**
 * 设定写了没有：身份 / 行为 / 口吻 / 口头禅 / 背景 / 边界任一格有字。和角色聊天演不演得出来就看它
 * （全空 = 服务端照工作口吻答，助手头上说出原因）。
 */
export function hasPersonaProfile(
  persona: Partial<CharacterPersona> | null | undefined,
): boolean {
  if (!persona) return false
  return (
    [
      persona.identity,
      persona.behavior,
      persona.speech,
      persona.backstory,
      persona.boundaries,
    ].some((text) => Boolean(text?.trim())) ||
    (persona.catchphrases ?? []).some((phrase) => Boolean(phrase.trim()))
  )
}

/** 一行一项：去空行、截长、限条数。 */
function lines(text: string, chars: number, max: number): string[] {
  return text
    .split('\n')
    .map((line) => line.trim().slice(0, chars))
    .filter(Boolean)
    .slice(0, max)
}

/**
 * 一格文字落进设定：口头禅一行一句（也认「、」「/」分隔），她在意的东西一行一个，
 * 对话示例按酒馆写法切块（整组替换），其余原样。
 * ⭐ 助手直接改（`writeCharacterProfile`）与角色页提议卡点「收下」（`applyProfile`）共用这一份：
 *   两处落法不一样，同一句话收进去就成了两个样子。
 */
export function applyPersonaField(
  persona: Partial<CharacterPersona>,
  field: PersonaTextPart,
  text: string,
  name: string,
): void {
  if (field === 'catchphrases') {
    persona.catchphrases = text
      .split(/\n|、|\s\/\s/)
      .map((phrase) => phrase.trim().replace(/^[「『"]|[」』"]$/g, ''))
      .filter(Boolean)
    return
  }
  if (field === 'interests') {
    persona.interests = lines(
      text.replace(/、/g, '\n'),
      CHARACTER_PERSONA_LIMITS.interestChars,
      CHARACTER_PERSONA_LIMITS.interests,
    )
    return
  }
  if (field === 'examples') {
    persona.examples = parseTavernExamples(text, name)
    return
  }
  persona[field] = text
}
