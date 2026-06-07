import type {
  PromptTagCompileResult,
  PromptTagSelection,
} from '@/types/prompt-tags'

interface CompilePromptTagsInput {
  freePrompt?: string
  selectedTags: readonly PromptTagSelection[]
  existingNegativePrompt?: string
}

function normalizePromptFragment(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function formatWeightedPromptText(selection: PromptTagSelection): string {
  const text = normalizePromptFragment(selection.promptText)
  if (!text) return ''
  if (selection.weight === undefined || selection.weight === 1) return text
  return `(${text}:${Number(selection.weight.toFixed(2))})`
}

function uniqueFragments(fragments: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  for (const fragment of fragments) {
    const normalized = normalizePromptFragment(fragment)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }

  return out
}

function compileSelections(
  selections: readonly PromptTagSelection[],
  polarity: 'positive' | 'negative',
): string {
  const seenPromptText = new Set<string>()
  const compiled: string[] = []

  for (const selection of selections
    .filter((item) => item.enabled && item.polarity === polarity)
    .sort((a, b) => a.orderIndex - b.orderIndex)) {
    const key = normalizePromptFragment(selection.promptText).toLowerCase()
    if (!key || seenPromptText.has(key)) continue
    seenPromptText.add(key)
    compiled.push(formatWeightedPromptText(selection))
  }

  return uniqueFragments(compiled).join(', ')
}

export function compilePromptTags({
  freePrompt,
  selectedTags,
  existingNegativePrompt,
}: CompilePromptTagsInput): PromptTagCompileResult {
  const positiveTagText = compileSelections(selectedTags, 'positive')
  const negativeTagText = compileSelections(selectedTags, 'negative')
  const promptParts = uniqueFragments([
    positiveTagText,
    freePrompt ? freePrompt.trim() : '',
  ])
  const negativeParts = uniqueFragments([
    existingNegativePrompt ? existingNegativePrompt.trim() : '',
    negativeTagText,
  ])

  return {
    freePrompt: promptParts.length > 0 ? promptParts.join(', ') : undefined,
    negativePrompt:
      negativeParts.length > 0 ? negativeParts.join(', ') : undefined,
    positiveTagText,
    negativeTagText,
  }
}
