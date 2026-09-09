const IMAGE_MENTION = /(?<![\w.%+-])@Image([1-9]\d*)(?![\w])/g
const WRITTEN_IMAGE_REFERENCE =
  /(?<![\w@/.:?%+-])(?:@?Image\s*([1-9]\d*)|reference\s+image\s*([1-9]\d*)|参考图\s*([1-9]\d*)|图\s*([1-9]\d*))(?![\w])/gi

export function normalizeReferenceMentions(prompt: string): string {
  return prompt.replace(
    WRITTEN_IMAGE_REFERENCE,
    (_token, english, reference, chinese, short) =>
      `@Image${english ?? reference ?? chinese ?? short}`,
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
