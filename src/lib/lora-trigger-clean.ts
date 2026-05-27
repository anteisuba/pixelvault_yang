/**
 * Civitai `trainedWords` 字段里塞的是 SD 训练数据集的原始 caption，常带
 * 一些只有 SD WebUI 才识别的元字符。把这些 token 直接写进 PixelVault 的
 * 通用 prompt 会被某些 provider 拒绝或转义两次，因此先洗一遍。
 *
 * 这一层只做「字符串清洗」，**不**做语义判断（不知道哪个 token 是触发
 * 词，不知道是 subject 还是 style）。语义抽取在 `lora-trigger-extract.ts`。
 */

// SD WebUI 的 LoRA 激活语法：`<lora:name:weight>`。出现在 trainedWords
// 里通常是因为作者把自己的「完整 prompt 示例」粘了进来 — 我们不应该把
// 它当 trigger 透传，否则 prompt 里会出现一个不可解析的尖括号块。
const LORA_SYNTAX_RE = /<lora:[^>]+>/g

// SD prompt 的转义括号：`\(text\)` 表示字面括号。Civitai trainedWords
// 直接给 `'\\(...\\)'` —— JSON 解码后是 `\(...\)`，写进 PixelVault prompt
// 会被某些 provider 二次转义。统一去掉反斜杠保留括号本身。
const ESCAPED_PAREN_RE = /\\([()])/g

/**
 * 清洗单个 trainedWord token（comma 切片之前的整段）。
 *
 * - 删 `<lora:...>` 语法
 * - 反斜杠转义括号去掉反斜杠
 * - 合并多余空白
 * - 去首尾标点（`,` `.` 半角全角空格）
 */
export function cleanTriggerToken(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(LORA_SYNTAX_RE, '')
    .replace(ESCAPED_PAREN_RE, '$1')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.　]+|[\s,.　]+$/g, '')
    .trim()
}

/**
 * 把一整段 trainedWord（可能是 comma-separated 多 token）切成清洗后的
 * 单 token 数组，去重去空。
 *
 * 输入：`'sigrika \\(wuthering waves\\), 1girl, orange hair, hair ornament'`
 * 输出：`['sigrika (wuthering waves)', '1girl', 'orange hair', 'hair ornament']`
 */
export function splitAndCleanTrainedWord(raw: string): string[] {
  if (!raw) return []
  const segments = raw
    .replace(LORA_SYNTAX_RE, '')
    .split(',')
    .map((token) => cleanTriggerToken(token))
    .filter((token) => token.length > 0)
  // 去重，保留首次出现顺序
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of segments) {
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

/**
 * 清洗一整段「作者推荐 prompt」（保留 comma 分隔结构，不拆开）。给
 * `buildLoraPromptTemplate` 在「优先用作者推荐」路径上使用。
 *
 * 与 splitAndCleanTrainedWord 的区别：保留 comma 作为 token 边界，仅
 * 做字符清洗，不拆元素。
 */
export function cleanRecommendedPrompt(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(LORA_SYNTAX_RE, '')
    .replace(ESCAPED_PAREN_RE, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim()
}
