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
