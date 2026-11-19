/**
 * 模型选单的搜索判据（11-19 真机走查：搜「nai」出来五条 GPT Image）。
 *
 * 🔬 根因（第二轮复验才抓到）：选单行的显示名去掉了系列前缀（「GPT Image 2.6 Flare」），
 *   但用来搜的是**完整译名**「OpenAI GPT Image 2.6 Flare」（`messages/models`），
 *   名字字段做子串匹配 →「nai」撞进 Open**AI**。第一轮只把厂商字段改成词首、名字字段
 *   仍是子串，所以真机没变。
 *
 * - 名字 / 型号 id / 厂商 / 渠道：一律按**词首**命中（「flash」「banana」「open」找得到，
 *   「nai」不会撞进 OpenAI）。
 * - 查询里带数字或分隔符（「2.6」「image-2」「image 2」）时名字按子串命中 —— 那是在
 *   拼型号的一截，不会误撞单词内部。
 * - 名字命中排在只靠厂商命中的前面。
 */
export type ModelSearchRank = 'name' | 'vendor' | null

export interface ModelSearchFields {
  /** 显示名、型号 id 等「叫这个名字」的文字。 */
  name: readonly string[]
  /** 厂商、系列、渠道名。 */
  vendor: readonly string[]
}

const WORD_SPLIT = /[\s\-_/.·:()（）]+/
const SPANS_WORDS = /[\d\s\-_/.·:]/

function wordPrefixHit(text: string, query: string): boolean {
  const lower = text.toLowerCase()
  if (lower.startsWith(query)) return true
  return lower.split(WORD_SPLIT).some((word) => word && word.startsWith(query))
}

function nameHit(text: string, query: string): boolean {
  if (wordPrefixHit(text, query)) return true
  return SPANS_WORDS.test(query) && text.toLowerCase().includes(query)
}

export function rankModelSearch(
  rawQuery: string,
  fields: ModelSearchFields,
): ModelSearchRank {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return 'name'
  if (fields.name.some((text) => nameHit(text, query))) return 'name'
  if (fields.vendor.some((text) => wordPrefixHit(text, query))) return 'vendor'
  return null
}

/** 过滤 + 名字命中在前（同档保持原顺序）。 */
export function filterModelSearch<T>(
  rows: readonly T[],
  rawQuery: string,
  fieldsOf: (row: T) => ModelSearchFields,
): T[] {
  if (!rawQuery.trim()) return [...rows]
  const byName: T[] = []
  const byVendor: T[] = []
  for (const row of rows) {
    const rank = rankModelSearch(rawQuery, fieldsOf(row))
    if (rank === 'name') byName.push(row)
    else if (rank === 'vendor') byVendor.push(row)
  }
  return [...byName, ...byVendor]
}
