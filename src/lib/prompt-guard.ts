/**
 * Prompt validation and sanitization guard.
 *
 * Prevents:
 * - Prompt injection attacks (system instruction leakage)
 * - Excessively long prompts that waste tokens or cause truncation
 * - Malformed prompts that confuse AI models
 *
 * Usage:
 *   import { validatePrompt, sanitizePrompt } from '@/lib/prompt-guard'
 *
 *   const result = validatePrompt(userPrompt)
 *   if (!result.valid) throw new Error(result.reason)
 *   const safe = sanitizePrompt(userPrompt)
 */

import { logger } from '@/lib/logger'

// ─── Constants ──────────────────────────────────────────────────

/** Maximum prompt length in characters (covers most model limits) */
export const MAX_PROMPT_LENGTH = 4000

/** Maximum enhanced/compiled prompt length */
export const MAX_COMPILED_PROMPT_LENGTH = 8000

/** Patterns that indicate prompt injection attempts */
const INJECTION_PATTERNS = [
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<\|system\|>/i,
  /<\|user\|>/i,
  /<\|assistant\|>/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /<<SYS>>/i,
  /<\/SYS>/i,
  /\bsystem\s*:\s*you\s+are/i,
  /ignore\s+(previous|all|above)\s+(instructions|prompts)/i,
  /forget\s+(everything|all|your)\s+(previous|instructions)/i,
  /\bdo\s+not\s+follow\s+(your|the)\s+(instructions|rules)/i,
]

// ─── Validation ─────────────────────────────────────────────────

export interface PromptValidationResult {
  valid: boolean
  reason?: string
  warnings: string[]
}

/** Validate a user-provided prompt. Returns structured result. */
export function validatePrompt(
  prompt: string,
  maxLength: number = MAX_PROMPT_LENGTH,
): PromptValidationResult {
  const warnings: string[] = []

  // Empty check
  if (!prompt || prompt.trim().length === 0) {
    return { valid: false, reason: 'Prompt is empty', warnings }
  }

  // Length check
  if (prompt.length > maxLength) {
    return {
      valid: false,
      reason: `Prompt exceeds maximum length of ${maxLength} characters (got ${prompt.length})`,
      warnings,
    }
  }

  // Injection detection
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(prompt)) {
      logger.warn('Prompt injection pattern detected', {
        pattern: pattern.source,
        promptPreview: prompt.slice(0, 100),
      })
      return {
        valid: false,
        reason: 'Prompt contains disallowed control sequences',
        warnings,
      }
    }
  }

  // Warnings (non-blocking)
  if (prompt.length > maxLength * 0.8) {
    warnings.push(
      `Prompt is ${Math.round((prompt.length / maxLength) * 100)}% of max length`,
    )
  }

  const repeatedCharMatch = prompt.match(/(.)\1{20,}/)
  if (repeatedCharMatch) {
    warnings.push('Prompt contains long repeated character sequences')
  }

  return { valid: true, warnings }
}

// ─── Sanitization ───────────────────────────────────────────────

/** Sanitize prompt by removing known injection patterns and trimming. */
export function sanitizePrompt(prompt: string): string {
  let cleaned = prompt.trim()

  // Remove injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(new RegExp(pattern.source, 'gi'), '')
  }

  // Collapse excessive whitespace
  cleaned = cleaned.replace(/\s{3,}/g, '  ')

  // Remove null bytes and other control characters (keep newlines)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  return cleaned
}

// ─── Compiled Prompt Validation ─────────────────────────────────

/**
 * Validate a compiled/enhanced prompt (after LLM processing).
 * Checks that original intent keywords are preserved.
 */
export function validateCompiledPrompt(
  original: string,
  compiled: string,
  options: { minKeywordRetention?: number } = {},
): { valid: boolean; reason?: string; retentionRate: number } {
  const { minKeywordRetention = 0.3 } = options

  // Length check
  if (compiled.length > MAX_COMPILED_PROMPT_LENGTH) {
    return {
      valid: false,
      reason: `Compiled prompt too long (${compiled.length} > ${MAX_COMPILED_PROMPT_LENGTH})`,
      retentionRate: 0,
    }
  }

  // Empty check
  if (compiled.trim().length === 0) {
    return {
      valid: false,
      reason: 'Compiled prompt is empty',
      retentionRate: 0,
    }
  }

  // Keyword retention: extract significant words from original, check presence in compiled
  const keywords = extractKeywords(original)
  if (keywords.length === 0) {
    return { valid: true, retentionRate: 1 }
  }

  const compiledLower = compiled.toLowerCase()
  const retained = keywords.filter((kw) => compiledLower.includes(kw))
  const retentionRate = retained.length / keywords.length

  if (retentionRate < minKeywordRetention) {
    logger.warn('Low keyword retention in compiled prompt', {
      original: original.slice(0, 100),
      retentionRate,
      missingKeywords: keywords.filter((kw) => !compiledLower.includes(kw)),
    })
    return {
      valid: false,
      reason: `Compiled prompt lost too many original keywords (retention: ${Math.round(retentionRate * 100)}%)`,
      retentionRate,
    }
  }

  return { valid: true, retentionRate }
}

/** Extract significant keywords from a prompt (>3 chars, no stopwords). */
function extractKeywords(text: string): string[] {
  const STOPWORDS = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'shall',
    'can',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
    'they',
    'them',
    'their',
    'very',
    'just',
    'about',
    'into',
    'over',
    'after',
    'before',
    'between',
    'under',
    'above',
  ])

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w))
    .filter((v, i, a) => a.indexOf(v) === i) // deduplicate
}
