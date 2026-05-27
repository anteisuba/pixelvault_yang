/**
 * Prompt placeholder extraction + substitution.
 *
 * Many curated prompts ship with `[OBJECT]`, `[BRAND]`, `[CHARACTER]`-style
 * fill-in-the-blank slots. The Studio surfaces these to the user so they
 * can substitute concrete values before the prompt reaches the model.
 *
 * Convention (deliberately strict to avoid false positives in JSON-shaped
 * prompts that contain unrelated brackets):
 *   - Square brackets: `[NAME]`
 *   - Name must start with an uppercase letter, then [A-Z0-9_]
 *   - Length 2+ characters total (so `[A]` does NOT match, but `[X1]` does)
 */

const PLACEHOLDER_PATTERN = /\[([A-Z][A-Z0-9_]+)\]/g

/**
 * Extract the unique placeholder names from a prompt, preserving the
 * order of first appearance.
 *
 * @example
 *   extractPlaceholders('paint [OBJECT] near [BRAND] with [OBJECT]')
 *   // → ['OBJECT', 'BRAND']
 */
export function extractPlaceholders(prompt: string): string[] {
  if (!prompt) return []
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const match of prompt.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1]
    if (!name) continue
    if (seen.has(name)) continue
    seen.add(name)
    ordered.push(name)
  }
  return ordered
}

/**
 * Substitute placeholders with user-supplied values.
 *
 * Missing keys are kept as-is so the user still sees `[OBJECT]` in the
 * Studio textarea and can fix it manually. Empty/whitespace-only values
 * are treated as missing.
 */
export function applyPlaceholders(
  prompt: string,
  values: Record<string, string>,
): string {
  if (!prompt) return prompt
  return prompt.replace(PLACEHOLDER_PATTERN, (match, name: string) => {
    const value = values[name]
    if (value == null) return match
    const trimmed = value.trim()
    if (!trimmed) return match
    return trimmed
  })
}

/** True when the prompt contains at least one fill-in placeholder. */
export function hasPlaceholders(prompt: string): boolean {
  if (!prompt) return false
  PLACEHOLDER_PATTERN.lastIndex = 0
  return PLACEHOLDER_PATTERN.test(prompt)
}
