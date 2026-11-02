/** 从未定型的记录里读字段：只认类型对的值，别的一律当没填。 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readStringField(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const fieldValue = value[key]
  return typeof fieldValue === 'string' && fieldValue.trim() ? fieldValue : null
}

export function readPositiveNumberField(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const fieldValue = value[key]
  return typeof fieldValue === 'number' && fieldValue > 0 ? fieldValue : null
}

export function readNumberField(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const fieldValue = value[key]
  return typeof fieldValue === 'number' && Number.isFinite(fieldValue)
    ? fieldValue
    : null
}

export function readBooleanField(
  value: Record<string, unknown>,
  key: string,
): boolean | null {
  const fieldValue = value[key]
  return typeof fieldValue === 'boolean' ? fieldValue : null
}

export function readStringArrayField(
  value: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const fieldValue = value[key]
  if (!Array.isArray(fieldValue)) return undefined

  const strings = fieldValue.filter(
    (item): item is string =>
      typeof item === 'string' && item.trim().length > 0,
  )
  return strings.length > 0 ? strings : undefined
}
