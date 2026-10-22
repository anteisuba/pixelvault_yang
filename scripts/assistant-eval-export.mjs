#!/usr/bin/env node
/**
 * 助手评测集：从过程记录（`AssistantTurnRecord`）导出真实回合，挑一份分层样本当考题。
 *
 *   ASSISTANT_EVAL_DIR=/path/outside/repo node scripts/assistant-eval-export.mjs [--per-category 8]
 *
 * ⛔ 题目是创作者的真实对话与作品地址，**不进仓库**（仓库公开）：只写到 `ASSISTANT_EVAL_DIR`。
 * ⭐ 只读：一条 SELECT，走 Neon 的 SQL over HTTP（云环境连不上 5432）。
 * ⭐ 每轮取开轮那一行（快照就是开轮时的板子），按创作者那句话分类，每类最多取 N 题。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.env.ASSISTANT_EVAL_DIR
if (!dir)
  throw new Error('ASSISTANT_EVAL_DIR is required (keep it outside the repo).')
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.')

const perCategoryArg = process.argv.indexOf('--per-category')
const perCategory =
  perCategoryArg > 0 ? Number(process.argv[perCategoryArg + 1]) : 8

const host = new URL(process.env.DATABASE_URL).host
const query = `select row_to_json(t) as row from "AssistantTurnRecord" t where snapshot is not null order by "createdAt"`
const response = await fetch(`https://${host}/sql`, {
  method: 'POST',
  headers: { 'Neon-Connection-String': process.env.DATABASE_URL },
  body: JSON.stringify({ query, params: [] }),
})
if (!response.ok) throw new Error(`Neon query failed: ${response.status}`)
const { rows } = await response.json()

/** 创作者这一句（最后一条 user，去掉附件 / @ 的说明行）。 */
function lastUserText(row) {
  const users = (row.input?.messages ?? []).filter((m) => m.role === 'user')
  const content = users.at(-1)?.content ?? ''
  return String(content).split('[attached')[0].split('[mentioned')[0].trim()
}

/** 粗分类：只用来分层抽样，判分不看它。顺序即优先级。 */
const CATEGORIES = [
  ['auto_review', (row) => row.input?.autoReview === true],
  ['answer_card', (_, text) => /^(已选择|回答「)/.test(text)],
  ['reference_back', (_, text) => /图_\d+|为准|复刻|反推|那张|之前/.test(text)],
  ['style', (_, text) => /画风|画师|风格/.test(text)],
  [
    'research',
    (_, text) => /调查|查一下|搜索|找一下|找几个|联网|danbooru|D站/i.test(text),
  ],
  ['options', (_, text) => /选项|让我选|几个|多种|设计/.test(text)],
  ['question', (_, text) => /[?？]|为什么|怎么|是什么|能不能|吗$/.test(text)],
  ['precise_edit', (_, text) => /换成|改成|去掉|加上|删掉|替换|把/.test(text)],
  ['other', () => true],
]

const seen = new Set()
const turns = []
for (const { row } of rows) {
  if (seen.has(row.turnId)) continue
  seen.add(row.turnId)
  const text = lastUserText(row)
  const category = CATEGORIES.find(([, test]) => test(row, text))[0]
  turns.push({ row, text, category })
}

mkdirSync(join(dir, 'turns'), { recursive: true })
for (const { row } of turns)
  writeFileSync(join(dir, 'turns', `${row.id}.json`), JSON.stringify(row))

// 分层：每类按时间均匀取，最多 perCategory 题。
const byCategory = new Map()
for (const turn of turns) {
  const list = byCategory.get(turn.category) ?? []
  list.push(turn)
  byCategory.set(turn.category, list)
}
const cases = []
for (const [category, list] of byCategory) {
  const take = Math.min(perCategory, list.length)
  for (let i = 0; i < take; i += 1) {
    const turn = list[Math.floor((i * list.length) / take)]
    cases.push({
      id: turn.row.id,
      category,
      domain: turn.row.domain,
      text: turn.text.slice(0, 120),
    })
  }
}
writeFileSync(join(dir, 'cases.json'), JSON.stringify(cases, null, 2))

const summary = [...byCategory].map(
  ([category, list]) =>
    `${category}: ${list.length} turns, ${Math.min(perCategory, list.length)} picked`,
)
console.log(`${turns.length} turns exported, ${cases.length} cases picked`)
console.log(summary.join('\n'))
