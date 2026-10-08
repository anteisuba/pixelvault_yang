const IMAGE_MENTION = /(?<![\w.%+-])@Image([1-9]\d*)(?![\w])/g
const WRITTEN_IMAGE_REFERENCE =
  /(?<![\w@/.:?%+-])(?:@?Image\s*([1-9]\d*)|reference\s+image\s*([1-9]\d*)|参考图\s*([1-9]\d*)|图\s*([1-9]\d*)|画像\s*([1-9]\d*))(?![\w])/gi

export function normalizeReferenceMentions(
  prompt: string,
  namedReferences: readonly {
    name: string
    referenceImageIndex?: number
  }[] = [],
): string {
  if (namedReferences.length) {
    const names = [
      ...new Set(namedReferences.map((item) => item.name).filter(Boolean)),
    ].sort((a, b) => b.length - a.length)
    if (names.length) {
      const pattern = new RegExp(
        `(${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![0-9])`,
        'g',
      )
      return prompt
        .split(pattern)
        .map((part) => {
          const matches = namedReferences.filter((item) => item.name === part)
          if (!matches.length) return normalizeReferenceMentions(part)
          const indices = new Set(
            matches.map((item) => item.referenceImageIndex),
          )
          const index = matches[0].referenceImageIndex
          return indices.size === 1 && index !== undefined
            ? `@Image${index + 1}`
            : part
        })
        .join('')
    }
  }
  return prompt.replace(
    WRITTEN_IMAGE_REFERENCE,
    (_token, english, reference, chinese, short, japanese) =>
      `@Image${english ?? reference ?? chinese ?? short ?? japanese}`,
  )
}

export function getReferenceImageAttachmentId(url: string): string {
  let hash = BigInt('14695981039346656037')
  for (const byte of new TextEncoder().encode(url)) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * BigInt('1099511628211'))
  }
  return `reference-${hash.toString(16)}`
}

export function getReferenceMentionIndices(prompt: string): number[] {
  return [
    ...new Set(
      Array.from(
        prompt.matchAll(IMAGE_MENTION),
        (match) => Number(match[1]) - 1,
      ),
    ),
  ]
}

export function removeReferenceMentions(
  prompt: string,
  removedIndex?: number,
): string {
  return prompt.replace(IMAGE_MENTION, (token, number: string) => {
    const index = Number(number) - 1
    if (removedIndex === undefined || index === removedIndex) return ''
    return index > removedIndex ? `@Image${index}` : token
  })
}

export function compileReferenceMentions(prompt: string, offset = 0): string {
  return prompt.replace(
    IMAGE_MENTION,
    (_token, number: string) => `reference image ${Number(number) + offset}`,
  )
}

/** 一张参考图在这次出图里**管什么**（核过的参考简报那一份，`ReferenceBriefSchema`）。 */
export interface ReferenceRoleAssignment {
  readonly url: string
  readonly roles: readonly ('identity' | 'pose' | 'style' | 'content')[]
  readonly preserve: readonly string[]
  readonly exclude: readonly string[]
}

const REFERENCE_ROLE_LEGEND_HEADER = 'Reference roles:'
const REFERENCE_ROLE_TEXT: Record<
  ReferenceRoleAssignment['roles'][number],
  string
> = {
  identity: 'identity — keep this character exactly as shown',
  pose: 'pose and body position only',
  style: 'rendering style only',
  content: 'content',
}
/** 每张图最多带几条保留 / 排除说明，每条多长 —— 图例是提醒，不是第二段提示词。 */
const REFERENCE_ROLE_LEGEND_LIMITS = { notesPerList: 3, noteChars: 80 }

const EXISTING_LEGEND = new RegExp(
  `\\n*${REFERENCE_ROLE_LEGEND_HEADER}\\n(?:@Image\\d+[^\\n]*(?:\\n|$))+\\s*$`,
)

function legendNotes(notes: readonly string[]): string {
  return notes
    .slice(0, REFERENCE_ROLE_LEGEND_LIMITS.notesPerList)
    .map((note) =>
      note.length > REFERENCE_ROLE_LEGEND_LIMITS.noteChars
        ? `${note.slice(0, REFERENCE_ROLE_LEGEND_LIMITS.noteChars - 1)}…`
        : note,
    )
    .join('; ')
}

/**
 * 在提示词末尾写一段**每张参考图管什么**的图例（`@Image1 — identity …`）。
 *
 * ⭐ 生图模型只读得到提示词：图号只写在句子里时，GPT Image 不一定严格照着那张图画
 * （与卡片总线那段「Keep … identical to Image N」同一条教训）。图例由核过的参考简报
 * 逐张生成，⛔ 不靠写提示词的模型每次记得写全。
 * ⚠ 已经有一段图例（上一次写进去的）就**整段换掉**，⛔ 不叠第二段。
 * ⚠ 只列此刻挂着的图，按 `CURRENT REFERENCE ORDER` 编号。
 */
export function withReferenceRoleLegend(
  prompt: string,
  assignments: readonly ReferenceRoleAssignment[],
  referenceUrls: readonly (string | null)[],
): string {
  const base = prompt.replace(EXISTING_LEGEND, '').trimEnd()
  const lines = assignments
    .map((assignment) => ({
      assignment,
      index: referenceUrls.indexOf(assignment.url),
    }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map(({ assignment, index }) => {
      const keep = legendNotes(assignment.preserve)
      const skip = legendNotes(assignment.exclude)
      return `@Image${index + 1} — ${assignment.roles
        .map((role) => REFERENCE_ROLE_TEXT[role])
        .join(', ')}${keep ? `; keep: ${keep}` : ''}${
        skip ? `; do not copy: ${skip}` : ''
      }`
    })
  if (lines.length === 0) return base
  return `${base}\n\n${REFERENCE_ROLE_LEGEND_HEADER}\n${lines.join('\n')}`
}

/** 去掉提示词末尾那段图例（给写词的模型看：图例由 app 维护，它不该照着改）。 */
export function withoutReferenceRoleLegend(prompt: string): string {
  return prompt.replace(EXISTING_LEGEND, '').trimEnd()
}

/** 提示词末尾那段图例列了几张图；没有图例是 `null`。 */
export function referenceRoleLegendCount(prompt: string): number | null {
  const legend = prompt.match(EXISTING_LEGEND)?.[0]
  if (!legend) return null
  return legend.split('\n').filter((line) => /^@Image\d+/.test(line)).length
}

export interface NamedImageReference {
  readonly url: string
  readonly name: string
  readonly aliases: readonly string[]
}

export function buildMessageImageReferences(
  entries: readonly {
    id: string
    kind: string
    attachments?: readonly { kind: string; url: string; label: string }[]
  }[],
  current: readonly { url: string; name?: string }[],
): Map<string, readonly NamedImageReference[]> {
  const names = new Map(
    current.filter((item) => item.name).map((item) => [item.url, item.name!]),
  )
  const bindings = new Map<string, string>()
  const result = new Map<string, readonly NamedImageReference[]>()
  for (const entry of entries) {
    for (const attachment of entry.attachments ?? []) {
      if (attachment.kind !== 'image') continue
      bindings.set(attachment.label, attachment.url)
    }
    const references = current.flatMap((item) =>
      item.name
        ? [{ url: item.url, name: item.name, aliases: [item.name] }]
        : [],
    )
    for (const [alias, url] of bindings) {
      const name = names.get(url) ?? alias
      references.push({ url, name, aliases: [alias, name] })
    }
    const urlsByAlias = new Map<string, Set<string>>()
    for (const reference of references) {
      for (const alias of reference.aliases) {
        const urls = urlsByAlias.get(alias) ?? new Set<string>()
        urls.add(reference.url)
        urlsByAlias.set(alias, urls)
      }
    }
    result.set(
      entry.id,
      references.map((reference) => ({
        ...reference,
        aliases: reference.aliases.filter(
          (alias) => urlsByAlias.get(alias)?.size === 1,
        ),
      })),
    )
  }
  return result
}
