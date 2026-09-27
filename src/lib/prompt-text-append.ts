/**
 * 逗号续接去重（LoRA 助手结果卡的「追加到正文」按钮），以及 LoRA 触发词在正文里的
 * 增 / 删 / 在不在（触发词写在正文里，owner 2026-09-28）。纯函数，无依赖，可单测。
 *
 * 不复用 `prompt-tag-compiler.ts` 的 `uniqueFragments`——那个函数是模块内私有
 * 实现，且语义是"编译一组 PromptTagSelection"，这里只是两段自由文本按逗号
 * 分片去重拼接，职责更小、不值得为此导出/耦合编译管线。
 */

function splitFragments(value: string): string[] {
  return value
    .split(',')
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0)
}

/**
 * 把 `addition`（逗号分隔的若干片段）追加到 `existing` 末尾，跳过
 * `existing` 中已出现的片段（大小写不敏感）。`existing`/`addition` 内部各自
 * 的重复片段也会被去掉，只保留每个片段第一次出现的顺序位置。
 */
export function appendPromptFragments(
  existing: string,
  addition: string,
): string {
  const existingFragments = splitFragments(existing)
  const additionFragments = splitFragments(addition)

  const seen = new Set(existingFragments.map((f) => f.toLowerCase()))
  const merged = [...existingFragments]

  for (const fragment of additionFragments) {
    const key = fragment.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(fragment)
  }

  return merged.join(', ')
}

/**
 * 触发词那几段的比对键：大小写、空白、`(词:1.2)` 权重外壳、`\(` 转义、下划线都
 * 不算区别 —— 来源配方里常写成 `aemeath \(wuwa\)` / `aemeath_(wuwa)`，与库里的
 * `Aemeath (WuWa)` 是同一个词，认不出来就会在正文里再写一遍。
 */
function triggerFragmentKey(fragment: string): string {
  return fragment
    .trim()
    .replace(/^\((.*):[\d.]+\)$/, '$1')
    .replace(/\\([()])/g, '$1')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function triggerFragmentKeys(value: string): Set<string> {
  return new Set(value.split(',').map(triggerFragmentKey).filter(Boolean))
}

/** `phrases`（逗号分隔，通常是一把 LoRA 的触发词）是不是每一段都已经在正文里。 */
export function promptHasFragments(prompt: string, phrases: string): boolean {
  const keys = triggerFragmentKeys(prompt)
  const wanted = [...triggerFragmentKeys(phrases)]
  return wanted.length > 0 && wanted.every((key) => keys.has(key))
}

/** 把 `phrases` 里正文还没有的那几段写到开头（触发词的位置），已有的不再写。 */
export function prependPromptFragments(
  prompt: string,
  phrases: string,
): string {
  const keys = triggerFragmentKeys(prompt)
  const missing: string[] = []
  for (const raw of phrases.split(',')) {
    const text = raw.trim()
    const key = triggerFragmentKey(text)
    if (!key || keys.has(key)) continue
    keys.add(key)
    missing.push(text)
  }
  if (missing.length === 0) return prompt
  const rest = prompt.replace(/^[\s,]+/, '')
  return rest ? `${missing.join(', ')}, ${rest}` : missing.join(', ')
}

/** 从正文里拿掉 `phrases` 的每一段；别的字（连同换行）一个不动。 */
export function removePromptFragments(prompt: string, phrases: string): string {
  const drop = triggerFragmentKeys(phrases)
  if (drop.size === 0) return prompt
  const parts = prompt.split(',')
  const kept = parts.filter((part) => !drop.has(triggerFragmentKey(part)))
  if (kept.length === parts.length) return prompt
  return kept.join(',').replace(/^[\s,]+/, '')
}
