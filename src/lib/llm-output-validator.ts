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

import type { z } from 'zod'

import { logger } from '@/lib/logger'
import { MAX_COMPILED_PROMPT_LENGTH } from '@/services/kernel/prompt-guard'

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

export interface LlmStructuredValidationResult<TData> {
  usable: boolean
  data?: TData
  reason?: string
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
        outputLength: cleaned.length,
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
          characterKeywordCount: charKeywords.length,
          outputLength: cleaned.length,
          retention,
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

// ─── Citation Validation (检索管线 §3.4 第 2 闸) ──────────────────

/** 只认纯数字方括号。markdown 链接 `[text](url)` 天然不匹配。 */
const CITATION_PATTERN = /\[(\d{1,3})\]/g

/**
 * 校验回答里的 `[n]` 引用是否都指向证据包内**真实存在**的条目。
 *
 * 🔬 **这条闸不是理论担忧，是实测**（切片 0）：开检索后问「这个 YouTube 视频多长」，
 * 模型拿到 Serper 摘要里的**标题**，就自信报出「19 分 13 秒」（真值 18 分 40 秒）——
 * 摘要里根本没有时长，是补出来的。无检索时同一题它诚实答「我访问不了这个链接」。
 * 加检索而不加这道闸，等于把「诚实弃权」换成「自信编造」。
 *
 * 幻引用 = 输出不可用 → 调用方按既有结构化重试模式（maxAttempts:2）打回重试。
 *
 * @param evidenceCount 证据包条数。0 表示这轮没有证据 —— 此时出现任何 `[n]` 都是编的。
 */
export function validateEvidenceCitations(
  llmOutput: string,
  evidenceCount: number,
): LlmValidationResult {
  const warnings: string[] = []
  const cited = new Set<number>()

  for (const match of llmOutput.matchAll(CITATION_PATTERN)) {
    const value = Number.parseInt(match[1] ?? '', 10)
    if (Number.isFinite(value)) cited.add(value)
  }

  const phantom = [...cited].filter(
    (index) => index < 1 || index > evidenceCount,
  )

  if (phantom.length > 0) {
    logger.warn('LLM output cited evidence that does not exist', {
      phantom,
      evidenceCount,
      outputLength: llmOutput.length,
    })
    return {
      usable: false,
      output: '',
      reason:
        evidenceCount === 0
          ? `Output cited [${phantom.join('], [')}] but no evidence was retrieved`
          : `Output cited [${phantom.join('], [')}] but only [1]-[${evidenceCount}] exist`,
      warnings,
    }
  }

  if (evidenceCount > 0 && cited.size === 0) {
    // 不打回：有些轮次（打招呼、纯创作）本来就不需要引用。但要留痕 ——
    // 「拿到了证据却一条都没引」是回答质量下降的早期信号。
    warnings.push('Evidence was available but the answer cited none of it')
  }

  return { usable: true, output: llmOutput, warnings }
}

// ─── Structured Output Validation ───────────────────────────────

export function validateLlmStructuredOutput<TSchema extends z.ZodType>(
  value: unknown,
  schema: TSchema,
): LlmStructuredValidationResult<z.infer<TSchema>> {
  const parsed = schema.safeParse(value)

  if (!parsed.success) {
    return {
      usable: false,
      reason: parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; '),
      warnings: [],
    }
  }

  return {
    usable: true,
    data: parsed.data,
    warnings: [],
  }
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
