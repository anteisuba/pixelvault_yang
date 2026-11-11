/**
 * 「我的想法」一句的读法（助手思考过程 C，owner 11-11）：模型把决定的那几个词用 `**…**` 包着，
 * 用到的记忆 / 规矩挂在句尾 `〔记忆·…〕`。这里拆成「几段字（哪段要加深）+ 句尾那个来源」。
 * ⚠ 认不出的写法照样留字：⛔ 吞字、⛔ 把半个 `**` 画出来（落单的那几个记号直接去掉）；
 *   来源被加粗包着（`**…〔记忆·…〕**`，11-11 实跑）照样认。
 */

export interface StudioOperatorThoughtPart {
  readonly text: string
  /** 决定的那几个词（加深）。 */
  readonly key: boolean
}

export interface StudioOperatorThoughtLine {
  readonly parts: readonly StudioOperatorThoughtPart[]
  /** 句尾挂的来源（「记忆·偏好冷色调」）；没有 = `null`。 */
  readonly source: string | null
}

const SOURCE_AT_END = /\s*(\*\*)?\s*〔([^〔〕]{1,60})〕\s*(\*\*)?\s*$/

export function parseStudioOperatorThought(
  line: string,
): StudioOperatorThoughtLine {
  const sourceMatch = SOURCE_AT_END.exec(line)
  // 来源外面那一圈加粗收尾记号（`…**〔…〕` 或 `…〔…〕**`）还给正文，配对才对得上。
  const body = sourceMatch
    ? `${line.slice(0, sourceMatch.index)}${sourceMatch[1] || sourceMatch[3] ? '**' : ''}`
    : line
  const source = sourceMatch?.[2]?.trim() || null
  const segments = body.split('**')
  // 双星号成对才算加深；不成对就整句不加深、记号去掉。
  const paired = segments.length % 2 === 1
  const parts = segments.flatMap((text, index) =>
    text ? [{ text, key: paired && index % 2 === 1 }] : [],
  )
  return { parts: mergePlain(parts), source }
}

/** 相邻两段都不加深就并成一段（去掉落单记号之后会出现）。 */
function mergePlain(
  parts: readonly StudioOperatorThoughtPart[],
): StudioOperatorThoughtPart[] {
  const merged: StudioOperatorThoughtPart[] = []
  for (const part of parts) {
    const last = merged.at(-1)
    if (last && !last.key && !part.key)
      merged[merged.length - 1] = {
        text: `${last.text}${part.text}`,
        key: false,
      }
    else merged.push(part)
  }
  return merged
}
