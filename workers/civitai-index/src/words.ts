/**
 * 打错字纠错（owner 2026-10-22 定：只提示和给结果，⛔ 悄悄换掉用户的词）。
 *
 * 词表 lora_word 从 lora_term 的 `w:` 整词汇总（迁移 0008），每轮同步后按首字分段
 * 重建；查的时候先用三字组找字形相近的候选，再按编辑距离挑最近、同样近的挑用得多的。
 * 只在字面一个都没搜到时才查（见 search.ts）。
 */

/** 收进词表的最短词长与最少出现在几个模型里：太短、太罕见的不当纠错目标。 */
const MIN_WORD_CHARS = 4
const MIN_WORD_DF = 3
/** 三字组候选取多少个再算编辑距离。 */
const CANDIDATE_LIMIT = 200

/** 按首字分段重建：每段一条 INSERT … GROUP BY，单条不碰 D1 的单查询时限。 */
export const WORD_SEGMENTS = [...'0123456789abcdefghijklmnopqrstuvwxyz']

export async function resetWordDictionary(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM lora_word').run()
}

/** 汇总一个首字的词，返回写了几个。 */
export async function buildWordSegment(
  db: D1Database,
  first: string,
): Promise<number> {
  const next = String.fromCharCode(first.charCodeAt(0) + 1)
  const result = await db
    .prepare(
      `INSERT OR REPLACE INTO lora_word (word, df)
       SELECT substr(term, 3), count(*) FROM lora_term
       WHERE term >= ?1 AND term < ?2 AND length(term) >= ?3
       GROUP BY term HAVING count(*) >= ?4`,
    )
    .bind(`w:${first}`, `w:${next}`, MIN_WORD_CHARS + 2, MIN_WORD_DF)
    .run()
  return result.meta.changes ?? 0
}

/** 词表写完后重建三字组索引（外部内容表，整张重来）。 */
export async function finishWordDictionary(db: D1Database): Promise<number> {
  await db
    .prepare("INSERT INTO lora_word_fts (lora_word_fts) VALUES ('rebuild')")
    .run()
  const row = await db
    .prepare('SELECT count(*) AS count FROM lora_word')
    .first<{ count: number }>()
  return row?.count ?? 0
}

/** 相邻两字对调算一步（endfeild → endfield）。 */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + cost,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1)
      }
    }
  }
  return d[a.length]![b.length]!
}

/** 4–5 个字的词只容一处错，更长的容两处。 */
function allowedDistance(word: string): number {
  return word.length <= 5 ? 1 : 2
}

const CORRECTABLE = /^[a-z0-9]+$/

/** 一个词的纠正：词表里本来就有、或找不到够近的，回 null。 */
async function correctWord(
  db: D1Database,
  word: string,
): Promise<string | null> {
  if (word.length < MIN_WORD_CHARS || !CORRECTABLE.test(word)) return null
  const known = await db
    .prepare('SELECT 1 AS hit FROM lora_word WHERE word = ?1')
    .bind(word)
    .first()
  if (known) return null
  const grams = new Set<string>()
  for (let index = 0; index + 3 <= word.length; index += 1) {
    grams.add(word.slice(index, index + 3))
  }
  const match = [...grams].map((gram) => `"${gram}"`).join(' OR ')
  const { results } = await db
    .prepare(
      `SELECT lora_word.word AS word, lora_word.df AS df
       FROM lora_word_fts JOIN lora_word ON lora_word.rowid = lora_word_fts.rowid
       WHERE lora_word_fts MATCH ?1
         AND length(lora_word.word) BETWEEN ?2 AND ?3
       ORDER BY rank LIMIT ?4`,
    )
    .bind(
      match,
      word.length - allowedDistance(word),
      word.length + allowedDistance(word),
      CANDIDATE_LIMIT,
    )
    .all<{ word: string; df: number }>()
  let best: { word: string; df: number; distance: number } | null = null
  for (const candidate of results) {
    const distance = editDistance(word, candidate.word)
    if (distance > allowedDistance(word)) continue
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && candidate.df > best.df)
    ) {
      best = { ...candidate, distance }
    }
  }
  return best?.word ?? null
}

/**
 * 整句的纠正（词已规整过，见 search.ts 的 normalizeQuery）：至少改了一个词才回
 * 新句子，否则 null。
 */
export async function correctQuery(
  db: D1Database,
  query: string,
): Promise<string | null> {
  const words = query.split(' ').filter(Boolean)
  const corrected = await Promise.all(
    words.map(async (word) => (await correctWord(db, word)) ?? word),
  )
  const next = corrected.join(' ')
  return next === words.join(' ') ? null : next
}
