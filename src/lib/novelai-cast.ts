import type { NovelAiInteraction } from '../types/novelai'

/**
 * NovelAI 角色名单的**结构性改动**（删人、换顺序、发送前剔人）。
 *
 * 互动用下标指向对方，所以名单一动，每一条互动的 `target` 都要跟着改：
 * 指向被删那位的互动一起删，其余重新编号。⚠ 改名单只走这里 —— 界面、发送前
 * 裁剪、助手写名单三处共用，⛔ 各写一遍必然漂。
 *
 * ⚠ 相对路径导入：execution worker 也会打包这份（它不认 `@/`）。
 */

interface WithInteractions {
  interactions?: NovelAiInteraction[]
}

/** 只留 `keep` 判真的那些人；被删的人身上和指向他们的互动一起删。 */
export function keepNovelAiCharacters<C extends WithInteractions>(
  characters: readonly C[],
  keep: (character: C, index: number) => boolean,
): C[] {
  const nextIndex = new Map<number, number>()
  characters.forEach((character, index) => {
    if (keep(character, index)) nextIndex.set(index, nextIndex.size)
  })
  return characters
    .filter((_, index) => nextIndex.has(index))
    .map((character) => remapInteractions(character, nextIndex))
}

/** 删掉第 `index` 位。 */
export function removeNovelAiCharacter<C extends WithInteractions>(
  characters: readonly C[],
  index: number,
): C[] {
  return keepNovelAiCharacters(characters, (_, i) => i !== index)
}

/** 把第 `from` 位挪到第 `to` 位（拖分页换顺序）。 */
export function moveNovelAiCharacter<C extends WithInteractions>(
  characters: readonly C[],
  from: number,
  to: number,
): C[] {
  if (from === to || !characters[from] || to < 0 || to >= characters.length) {
    return [...characters]
  }
  const order = characters.map((_, index) => index)
  order.splice(to, 0, ...order.splice(from, 1))
  const nextIndex = new Map(
    order.map((oldIndex, newIndex) => [oldIndex, newIndex]),
  )
  return order.map((oldIndex) =>
    remapInteractions(characters[oldIndex] as C, nextIndex),
  )
}

function remapInteractions<C extends WithInteractions>(
  character: C,
  nextIndex: ReadonlyMap<number, number>,
): C {
  if (!character.interactions) return character
  const interactions = character.interactions.flatMap((interaction) => {
    const target = nextIndex.get(interaction.target)
    return target === undefined ? [] : [{ ...interaction, target }]
  })
  const next = { ...character }
  if (interactions.length) next.interactions = interactions
  else delete next.interactions
  return next
}

export interface IncomingNovelAiInteraction {
  from: number
  tag: string
  mutual: boolean
}

/** 谁对第 `index` 位做了什么（对方页那一行「被 角色 1 摸头」）。 */
export function incomingNovelAiInteractions(
  characters: readonly WithInteractions[],
  index: number,
): IncomingNovelAiInteraction[] {
  return characters.flatMap((character, from) =>
    from === index
      ? []
      : (character.interactions ?? [])
          .filter((interaction) => interaction.target === index)
          .map((interaction) => ({
            from,
            tag: interaction.tag,
            mutual: interaction.mutual === true,
          })),
  )
}
