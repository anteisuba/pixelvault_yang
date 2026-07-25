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

/**
 * 逗号分段后的规范化片段集合，用来判断「这个词是不是已经在正文里了」。
 *
 * 顺带剥掉 `(tag:1.2)` 这种权重外壳，好让正文里带权重写法的同一个词也能被认出来。
 * 自然语言正文按逗号切开后不会凑巧等于某个标签（除非它本来就是独立的一段），
 * 所以这个判据对散文式 prompt 也是安全的。
 */
function toFragmentKeySet(value: string | undefined): Set<string> {
  const keys = new Set<string>()
  if (!value) return keys
  for (const raw of value.split(',')) {
    const normalized = normalizePromptFragment(raw)
    if (!normalized) continue
    const unwrapped = normalized.replace(/^\((.*):[\d.]+\)$/, '$1').trim()
    if (unwrapped) keys.add(unwrapped.toLowerCase())
  }
  return keys
}

function compileSelections(
  selections: readonly PromptTagSelection[],
  polarity: 'positive' | 'negative',
  /** 已经出现在自由正文里的片段——命中的标签不再重复注入。 */
  existingFragmentKeys: ReadonlySet<string>,
): string {
  const seenPromptText = new Set<string>()
  const compiled: string[] = []

  for (const selection of selections
    .filter((item) => item.enabled && item.polarity === polarity)
    .sort((a, b) => a.orderIndex - b.orderIndex)) {
    const key = normalizePromptFragment(selection.promptText).toLowerCase()
    if (!key || seenPromptText.has(key)) continue
    // 正文里已经写了这个词就跳过：过去两边各出一份，编译结果里同一个词出现
    // 两次（真机实测 `sks_flasso, sks_flasso, ...`），在扩散模型里等于被悄悄
    // 加权。正文优先——它是用户在编辑器里看得见、也是内联高亮标出来的那份。
    // ⚠ 代价：被跳过的标签若带权重，那个权重会丢。仍好过同一个概念送两遍；
    // 需要加权时直接在正文里写 `(词:1.2)`，上面的 key 也能认出来。
    if (existingFragmentKeys.has(key)) continue
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
  // 正/负各自只跟自己那一侧的现有正文比对——正文里的词不该压住负向标签，反之亦然。
  const positiveTagText = compileSelections(
    selectedTags,
    'positive',
    toFragmentKeySet(freePrompt),
  )
  const negativeTagText = compileSelections(
    selectedTags,
    'negative',
    toFragmentKeySet(existingNegativePrompt),
  )
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
