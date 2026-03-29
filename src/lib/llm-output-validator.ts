/**
 * LLM output validation and post-processing.
 *
 * Validates that LLM-generated content (prompt enhancement, recipe fusion)
 * meets quality and safety standards before being used downstream.
 *
 * Usage:
 *   import { validateLlmPromptOutput, validateRecipeFusion } from '@/lib/llm-output-validator'
 *
 *   const enhanced = await llmTextCompletion(...)
 *   const validated = validateLlmPromptOutput(enhanced, originalPrompt)
 *   if (!validated.usable) useOriginal(originalPrompt)
 */

import { logger } from '@/lib/logger'
import { MAX_COMPILED_PROMPT_LENGTH } from '@/lib/prompt-guard'

// ─── Types ──────────────────────────────────────────────────────

export interface LlmValidationResult {
  /** Whether the LLM output is safe and usable */
  usable: boolean
  /** Cleaned output text (if usable) */
  output: string
  /** Reason for rejection (if not usable) */
  reason?: string
  /** Warning messages (non-blocking) */
  warnings: string[]
}

// ─── Patterns to Detect LLM Artifacts ───────────────────────────

/** Patterns that indicate the LLM returned meta-commentary instead of a prompt */
const META_PATTERNS = [
  /^(here|here's|here is|sure|certainly|of course|i('ll| will))/i,
  /^(the enhanced|the improved|the modified|the updated|an enhanced)/i,
  /\b(as requested|as you asked|hope this helps|let me know)\b/i,
  /^(note:|disclaimer:|warning:|important:)/i,
  /\*\*enhanced prompt:?\*\*/i,
]

/** Patterns that indicate the LLM leaked its system prompt */
const SYSTEM_LEAK_PATTERNS = [
  /you are an? (expert|ai|assistant|prompt engineer)/i,
  /return only the enhanced prompt/i,
  /no explanation/i,
  /i('m| am) an ai/i,
]

// ─── Prompt Enhancement Validation ──────────────────────────────

/**
 * Validate LLM output from prompt enhancement.
 * Ensures the enhanced prompt is usable and hasn't deviated from original intent.
 */
export function validateLlmPromptOutput(
  llmOutput: string,
  originalPrompt: string,
): LlmValidationResult {
  const warnings: string[] = []

  // Basic checks
  if (!llmOutput || llmOutput.trim().length === 0) {
    return {
      usable: false,
      output: '',
      reason: 'LLM returned empty output',
      warnings,
    }
  }

  let cleaned = cleanLlmOutput(llmOutput)

  // Length check
  if (cleaned.length > MAX_COMPILED_PROMPT_LENGTH) {
    cleaned = cleaned.slice(0, MAX_COMPILED_PROMPT_LENGTH)
    warnings.push('LLM output truncated to max length')
  }

  // Meta-commentary check
  for (const pattern of META_PATTERNS) {
    if (pattern.test(cleaned)) {
      // Try to extract the actual prompt from the meta-commentary
      const extracted = extractPromptFromMeta(cleaned)
      if (extracted) {
        cleaned = extracted
        warnings.push('Stripped meta-commentary from LLM output')
        break
      }
      return {
        usable: false,
        output: '',
        reason: 'LLM returned meta-commentary instead of a prompt',
        warnings,
      }
    }
  }

  // System prompt leakage check
  for (const pattern of SYSTEM_LEAK_PATTERNS) {
    if (pattern.test(cleaned)) {
      logger.warn('LLM output contains system prompt leakage', {
        pattern: pattern.source,
        preview: cleaned.slice(0, 100),
      })
      return {
        usable: false,
        output: '',
        reason: 'LLM output leaked system prompt content',
        warnings,
      }
    }
  }

  // Minimal content check — enhanced prompt should be at least as long as original
  if (cleaned.length < originalPrompt.length * 0.5) {
    warnings.push('Enhanced prompt is significantly shorter than original')
  }

  return { usable: true, output: cleaned, warnings }
}

// ─── Recipe Fusion Validation ───────────────────────────────────

/**
 * Validate LLM output from recipe card fusion.
 * Checks that character name/traits are preserved in the fused prompt.
 */
export function validateRecipeFusion(
  llmOutput: string,
  parts: {
    characterPrompt?: string
    backgroundPrompt?: string
    stylePrompt?: string
    freePrompt?: string
  },
): LlmValidationResult {
  const warnings: string[] = []

  if (!llmOutput || llmOutput.trim().length === 0) {
    return {
      usable: false,
      output: '',
      reason: 'Recipe fusion returned empty',
      warnings,
    }
  }

  let cleaned = cleanLlmOutput(llmOutput)

  // Length check
  if (cleaned.length > MAX_COMPILED_PROMPT_LENGTH) {
    cleaned = cleaned.slice(0, MAX_COMPILED_PROMPT_LENGTH)
    warnings.push('Fused prompt truncated to max length')
  }

  // Character preservation check — if a character card is provided,
  // key terms should appear in the output
  if (parts.characterPrompt) {
    const charKeywords = extractSignificantTerms(parts.characterPrompt, 3)
    const fusedLower = cleaned.toLowerCase()
    const presentCount = charKeywords.filter((kw) =>
      fusedLower.includes(kw),
    ).length

    if (charKeywords.length > 0) {
      const retention = presentCount / charKeywords.length
      if (retention < 0.2) {
        logger.warn('Recipe fusion lost character identity', {
          charKeywords,
          retention,
          fusedPreview: cleaned.slice(0, 100),
        })
        return {
          usable: false,
          output: '',
          reason: `Character identity lost in fusion (${Math.round(retention * 100)}% keyword retention)`,
          warnings,
        }
      }
      if (retention < 0.5) {
        warnings.push(
          `Low character keyword retention: ${Math.round(retention * 100)}%`,
        )
      }
    }
  }

  // System leak check
  for (const pattern of SYSTEM_LEAK_PATTERNS) {
    if (pattern.test(cleaned)) {
      return {
        usable: false,
        output: '',
        reason: 'Fusion output leaked system prompt',
        warnings,
      }
    }
  }

  return { usable: true, output: cleaned, warnings }
}

// ─── Helpers ────────────────────────────────────────────────────

/** Clean common LLM output artifacts. */
function cleanLlmOutput(text: string): string {
  let cleaned = text.trim()

  // Remove markdown code fences
  cleaned = cleaned.replace(/^```(?:json|text|prompt)?\n?/gm, '')
  cleaned = cleaned.replace(/\n?```$/gm, '')

  // Remove leading/trailing quotes
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1)
  }

  // Collapse excessive newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

  return cleaned.trim()
}

/** Try to extract the actual prompt from LLM meta-commentary. */
function extractPromptFromMeta(text: string): string | null {
  // Common patterns: "Here's the enhanced prompt:\n\nActual prompt here"
  const patterns = [
    /(?:here(?:'s| is) the (?:enhanced|improved|updated) prompt:?\s*\n+)([\s\S]+)/i,
    /(?:enhanced prompt:?\s*\n+)([\s\S]+)/i,
    /(?:")([\s\S]+)(?:")\s*$/,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]?.trim()) {
      return match[1].trim()
    }
  }

  return null
}

/** Extract significant terms from text for comparison. */
function extractSignificantTerms(
  text: string,
  minLength: number = 3,
): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= minLength)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 20) // cap to prevent excessive checking
}
