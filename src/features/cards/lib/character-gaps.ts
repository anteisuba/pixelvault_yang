import type { CharacterCardRecord } from '@/types'

/**
 * 她缺什么（角色大项目第 ⑩ 步，owner 10-30「缺什么出什么」）：角色库开着她时，助手的起手药丸
 * 只出缺的那几样，头像上亮一个小点。
 * - `tidyImport`：酒馆卡导入的、身份和说话方式都空着（整段描述被塞进了经历）→ 拆回各格；
 * - `fillProfile`：设定四格（身份 / 性格 / 说话方式 / 经历）有空的；与上一条只出一个；
 * - `findImages`：卡上一张图都没有（哪套造型都没有）；
 * - `interests`：她在意的东西一条都没有。
 */
export const CHARACTER_GAP_IDS = [
  'tidyImport',
  'fillProfile',
  'findImages',
  'interests',
] as const

export type CharacterGapId = (typeof CHARACTER_GAP_IDS)[number]

export function characterGaps(card: CharacterCardRecord): CharacterGapId[] {
  const persona = card.persona
  const empty = (text: string | undefined) => !text?.trim()
  const gaps: CharacterGapId[] = []
  if (card.tavern && empty(persona?.identity) && empty(persona?.speech))
    gaps.push('tidyImport')
  else if (
    [
      persona?.identity,
      persona?.behavior,
      persona?.speech,
      persona?.backstory,
    ].some(empty)
  )
    gaps.push('fillProfile')
  if (card.looks.every((look) => look.referenceSlots.length === 0))
    gaps.push('findImages')
  if (!persona?.interests?.length) gaps.push('interests')
  return gaps
}
