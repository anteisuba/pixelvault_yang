/**
 * 逗号续接去重（LoRA 助手结果卡「追加到正文」§1.2，
 * docs/plans/lora-assistant-nl2tag-2026-07.md F2）。纯函数，无依赖，可单测。
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
