import { CHARACTER_CARD } from '@/constants/cards'
import type { CharacterLoraGroup } from '@/types'

type CharacterLora = CharacterLoraGroup['loras'][number]

/**
 * 「从角色选」点了她的一个 LoRA → 这一次一起挂上哪几个（11-17）：
 * 点的那个在前，然后是**同一套造型**下她收的其余几个，再是她的通用 LoRA（`lookId` 空）。
 *
 * - 只挂与点的那个**同一底模家族**的（混家族服务端会拒，挂上去只会让出图失败）。
 * - 按 id 去重；与你手挂的去重交给 `stack.push`（`isSameLora`：id / 地址任一相同即同一个）。
 * - 触发词不在这里补：挂上去后 LoRA 台照常自动把触发词带进正文（与手挂同一条）。
 * - 每个都是栈里独立的一枚胶囊，可以逐个拿掉。
 */
export function characterLorasToMount(
  group: Pick<CharacterLoraGroup, 'loras'>,
  picked: CharacterLora,
): CharacterLora[] {
  const sameFamily = (lora: CharacterLora) =>
    lora.baseModelFamily === picked.baseModelFamily
  const ordered = [
    picked,
    ...(picked.lookId
      ? group.loras.filter((lora) => lora.lookId === picked.lookId)
      : []),
    ...group.loras.filter((lora) => lora.lookId === null),
  ].filter(sameFamily)
  const seen = new Set<string>()
  return ordered.filter((lora) =>
    seen.has(lora.id) ? false : (seen.add(lora.id), true),
  )
}

/**
 * LoRA 台出图记到哪几位角色名下（11-17：以前「从角色选」挂上了也不记，她页「用她出的」
 * 里看不到）。挂着的 LoRA 里**只属于一位角色**的那个，就记她；被好几位共收的认不出是谁，不记。
 *
 * ⚠ 只做归属（服务端 `characterAttributionIds`），⛔ 不把她的卡编进 runner 的正文 / 参考图。
 */
export function characterAttributionIds(
  groups: readonly Pick<CharacterLoraGroup, 'characterCardId' | 'loras'>[],
  mounted: readonly { id: string; loraUrl: string }[],
): string[] {
  /** 同一个 LoRA 认 id 或地址（与 `isSameLora` 同口径）。 */
  const ownersOf = (asset: { id: string; loraUrl: string }) => {
    const set = new Set<string>()
    for (const group of groups) {
      if (
        group.loras.some(
          (lora) => lora.id === asset.id || lora.loraUrl === asset.loraUrl,
        )
      )
        set.add(group.characterCardId)
    }
    return set
  }
  const out: string[] = []
  for (const asset of mounted) {
    const set = ownersOf(asset)
    if (set.size !== 1) continue
    const [cardId] = [...set]
    if (cardId && !out.includes(cardId)) out.push(cardId)
  }
  return out.slice(0, CHARACTER_CARD.MAX_ACTIVE_CARDS)
}
