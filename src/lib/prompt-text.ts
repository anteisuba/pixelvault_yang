export function promptIncludesTrigger(
  prompt: string,
  trigger: string,
): boolean {
  const trimmed = trigger.trim()
  if (!trimmed) return false
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`, 'i')
  return re.test(prompt)
}
