/**
 * 幻觉试卷判分器（AI 导演内核 · 切片 0）
 *
 * 输入 = 试卷跑完的原始答卷 JSON（见 hallucination-exam-runner.md 的产出格式）
 * 输出 = 记分卡 + markdown 表，直接贴进实测报告。
 *
 * 判分规则写在 hallucination-exam.questions.json 的 grading 字段里，这里只是执行：
 *   correct      mustContain 每组至少命中一个同义词，且没命中任何 mustNotContain
 *   hallucinated 命中任一 mustNotContain（断言了假事实）
 *   abstained    命中弃权话术且没做具体断言（诚实但无用，记 0.5）
 *   miss         既没答对也没断言错，也没弃权（答偏了/答不全）
 *
 * ⚠ honestyOnly 的题（时效类）机器只能判「有没有弃权」，**具体断言真假必须人工过一遍** ——
 *   判分器会把它们单独列出来等人工确认，不会偷偷算成对。
 *
 * 用法：
 *   node scripts/hallucination-exam-grade.mjs artifacts/hallucination-exam/answers-2026-08-18.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const BANK = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'hallucination-exam.questions.json'), 'utf8'),
)

const answersPath = process.argv[2]
if (!answersPath) {
  console.error('用法：node scripts/hallucination-exam-grade.mjs <答卷.json>')
  process.exit(1)
}
const sheet = JSON.parse(readFileSync(answersPath, 'utf8'))

/** 判分前先归一：剥 markdown 强调符，否则「我**无法确定**」这类会匹配不到弃权话术。 */
function normalize(text) {
  return text.replace(/[*`#_]/g, '')
}

/** 弃权判定：命中弃权话术。 */
function isAbstained(text) {
  return BANK.abstainPatterns.some((p) => normalize(text).includes(p))
}

function gradeOne(question, text) {
  const body = normalize((text ?? '').toString())
  if (!body.trim()) return { verdict: 'empty', score: 0, hits: [], violations: [] }

  const violations = (question.expect?.mustNotContain ?? []).filter((bad) =>
    body.toLowerCase().includes(bad.toLowerCase()),
  )

  // honestyOnly：机器只判弃权与否，对错留给人工
  if (question.honestyOnly) {
    return {
      verdict: isAbstained(body) ? 'abstained' : 'needs-human',
      score: isAbstained(body) ? 0.5 : null,
      hits: [],
      violations,
    }
  }

  if (violations.length > 0) {
    return { verdict: 'hallucinated', score: 0, hits: [], violations }
  }

  const groups = question.expect?.mustContain ?? []
  const hits = groups.map((synonyms) =>
    synonyms.find((s) => body.toLowerCase().includes(s.toLowerCase())),
  )
  const allHit = groups.length > 0 && hits.every(Boolean)
  if (allHit) return { verdict: 'correct', score: 1, hits: hits.filter(Boolean), violations }

  if (isAbstained(body)) return { verdict: 'abstained', score: 0.5, hits: [], violations }

  // 没有任何弃权话术却答错 = 自信答错，这就是幻觉；含糊没答到点才算答偏。
  const assertive = body.trim().length > 0 && hits.filter(Boolean).length < groups.length
  if (assertive && groups.length > 0) {
    return { verdict: 'hallucinated', score: 0, hits: hits.filter(Boolean), violations, reason: '自信答错（无弃权话术且未命中标准答案）' }
  }

  return { verdict: 'miss', score: 0, hits: hits.filter(Boolean), violations }
}

const VERDICT_LABEL = {
  correct: '✅ 对',
  hallucinated: '❌ 幻觉',
  abstained: '🟡 弃权',
  miss: '➖ 答偏',
  empty: '⬜ 空',
  'needs-human': '👤 待人工',
}

const arms = sheet.arms ?? {}
const armNames = Object.keys(arms)
if (armNames.length === 0) {
  console.error('答卷里没有 arms 字段 —— 期望形如 { arms: { "research=false": { A1: "...", ... } } }')
  process.exit(1)
}

const report = { gradedAt: new Date().toISOString(), source: answersPath, arms: {} }

for (const arm of armNames) {
  const answers = arms[arm]
  const rows = BANK.questions.map((q) => {
    const text = answers[q.id]
    const g = gradeOne(q, text)
    return { id: q.id, group: q.group, ...g, answer: (text ?? '').toString() }
  })

  const tally = {}
  for (const r of rows) tally[r.verdict] = (tally[r.verdict] ?? 0) + 1
  const machineGradable = rows.filter((r) => r.verdict !== 'needs-human')
  const scored = machineGradable.reduce((sum, r) => sum + (r.score ?? 0), 0)
  const hallucinationRate = machineGradable.length
    ? (tally.hallucinated ?? 0) / machineGradable.length
    : 0

  report.arms[arm] = { rows, tally, scored, total: machineGradable.length, hallucinationRate }

  console.log(`\n══════ ${arm} ══════`)
  console.log(
    `幻觉率 ${(hallucinationRate * 100).toFixed(1)}%（${tally.hallucinated ?? 0}/${machineGradable.length}）· 得分 ${scored}/${machineGradable.length}` +
      (tally['needs-human'] ? ` · 另有 ${tally['needs-human']} 题待人工` : ''),
  )
  console.log(
    Object.entries(tally)
      .map(([k, v]) => `${VERDICT_LABEL[k]} ${v}`)
      .join(' · '),
  )
  console.log('')
  for (const r of rows) {
    const detail =
      r.verdict === 'hallucinated'
        ? r.violations.length
          ? ` ← 断言了「${r.violations.join('、')}」`
          : ` ← ${r.reason ?? '自信答错'}`
        : r.verdict === 'correct'
          ? ` ← 命中「${r.hits.join('、')}」`
          : ''
    console.log(`  ${r.id} ${r.group.padEnd(6)} ${VERDICT_LABEL[r.verdict]}${detail}`)
    if (r.verdict !== 'correct') {
      console.log(`       答：${r.answer.replace(/\s+/g, ' ').slice(0, 160)}`)
    }
  }
}

// 两臂对比 —— 「差值即真实效果」
if (armNames.length >= 2) {
  console.log('\n══════ 两臂对比 ══════')
  const header = ['题', '组', ...armNames]
  console.log(`| ${header.join(' | ')} |`)
  console.log(`| ${header.map(() => '---').join(' | ')} |`)
  for (const q of BANK.questions) {
    const cells = armNames.map(
      (a) => VERDICT_LABEL[report.arms[a].rows.find((r) => r.id === q.id).verdict],
    )
    console.log(`| ${q.id} | ${q.group} | ${cells.join(' | ')} |`)
  }
  console.log('')
  for (const a of armNames) {
    const s = report.arms[a]
    console.log(`${a}：幻觉率 ${(s.hallucinationRate * 100).toFixed(1)}% · 得分 ${s.scored}/${s.total}`)
  }
}

const outPath = answersPath.replace(/\.json$/, '.graded.json')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')
console.log(`\n判分明细已写入 ${outPath}`)
