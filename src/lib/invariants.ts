/**
 * Runtime assertion utilities for enforcing invariants.
 * Use these instead of comments to document and enforce constraints.
 *
 * @example
 * invariant(userId, 'userId is required for generation')
 * assertPromptLength(prompt, 4000)
 */

/** Throws if condition is falsy. Use for programmer errors, not user input. */
export function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`Invariant violation: ${message}`)
  }
}

/** Throws if value is null or undefined. Returns narrowed type. */
export function assertDefined<T>(value: T | null | undefined, name: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Invariant violation: ${name} must be defined`)
  }
  return value
}

/** Asserts prompt length is within bounds. */
export function assertPromptLength(prompt: string, maxLength: number): void {
  invariant(
    prompt.length <= maxLength,
    `Prompt exceeds maximum length of ${maxLength} (got ${prompt.length})`,
  )
}

/** Asserts a value is one of the allowed enum values. */
export function assertOneOf<T>(
  value: T,
  allowed: readonly T[],
  name: string,
): void {
  invariant(
    allowed.includes(value),
    `${name} must be one of [${allowed.join(', ')}], got: ${String(value)}`,
  )
}
