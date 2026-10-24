/**
 * Danbooru 标签的中文名 / 日文名导进 `DanbooruTagName`（第 9f 步 9f-2c 标签库）。
 *
 * 来源（均 MIT，owner 2026-10-24 选定）：
 * - 中文：amenorira/danbooru-tags-data-zh 的 `tags/*.csv`（tag,category,aliases,zh,count,notes）
 * - 日文：PYU224/tagdb-updater 的 `dist/danbooru-ja.csv`（tag,category,count,aliases,ja；tag 用空格）
 *
 * Usage:
 *   git clone --depth 1 https://github.com/amenorira/danbooru-tags-data-zh /tmp/zh
 *   git clone --depth 1 https://github.com/PYU224/tagdb-updater /tmp/ja
 *   npx tsx --tsconfig tsconfig.json scripts/import-danbooru-tag-names.ts /tmp/zh/tags /tmp/ja/dist/danbooru-ja.csv
 *     # 默认只出报告，不写库
 *   … --apply   # ⚠ 整表覆盖写入 DATABASE_URL 那个库（= 生产库），每次都要 owner 当次授权
 *
 * 整表覆盖：先清空再分批写。重跑安全（同一份来源得到同一张表）；中间那几秒查不到中日文名，
 * 标签库照常按英文名工作。
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

const WRITE_BATCH = 2000

export interface TagNameRow {
  tag: string
  category: number
  count: number
  zh: string | null
  zhNote: string | null
  ja: string | null
  searchText: string
}

/** RFC 4180 风格的 CSV：引号里的逗号 / 换行 / 双引号都认。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const body = text.replace(/^﻿/, '')
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (quoted) {
      if (char === '"' && body[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') quoted = false
      else cell += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && body[index + 1] === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((value) => value.trim()))
}

const clean = (value: string | undefined) => value?.trim() || null

/** 两份合成一张：同一个 tag 中文那份给中文名 / 别名 / 注释，日文那份给日文名。 */
export function mergeTagNames(
  zhRows: readonly string[][],
  jaRows: readonly string[][],
): TagNameRow[] {
  const merged = new Map<
    string,
    Omit<TagNameRow, 'searchText'> & { aliases: string[] }
  >()
  for (const [tag, category, aliases, zh, count, notes] of zhRows) {
    if (!tag || tag === 'tag') continue
    merged.set(tag, {
      tag,
      category: Number(category) || 0,
      count: Number(count) || 0,
      zh: clean(zh),
      zhNote: clean(notes),
      ja: null,
      aliases: (aliases ?? '').split('|').map((alias) => alias.trim()),
    })
  }
  for (const [raw, category, count, , ja] of jaRows) {
    const name = clean(ja)
    if (!raw || !name || raw === 'tag') continue
    const tag = raw.trim().replace(/\s+/g, '_')
    const before = merged.get(tag)
    if (before) {
      before.ja = name
      before.count = Math.max(before.count, Number(count) || 0)
    } else
      merged.set(tag, {
        tag,
        category: Number(category) || 0,
        count: Number(count) || 0,
        zh: null,
        zhNote: null,
        ja: name,
        aliases: [],
      })
  }
  return [...merged.values()]
    .filter((row) => row.zh || row.ja)
    .map(({ aliases, ...row }) => ({
      ...row,
      searchText: [
        ...new Set(
          [row.zh, ...aliases, row.ja]
            .filter((value): value is string => Boolean(value))
            .map((value) => value.toLowerCase()),
        ),
      ].join('\n'),
    }))
}

async function main() {
  const [zhDir, jaFile] = process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith('--'))
  const apply = process.argv.includes('--apply')
  if (!zhDir || !jaFile)
    throw new Error(
      'Usage: npx tsx --tsconfig tsconfig.json scripts/import-danbooru-tag-names.ts <zh tags dir> <danbooru-ja.csv> [--apply]',
    )
  const zhFiles = (await readdir(zhDir)).filter((file) => file.endsWith('.csv'))
  const zhRows = (
    await Promise.all(
      zhFiles.map(async (file) =>
        parseCsv(await readFile(join(zhDir, file), 'utf8')),
      ),
    )
  ).flat()
  const jaRows = parseCsv(await readFile(jaFile, 'utf8'))
  const rows = mergeTagNames(zhRows, jaRows)
  const withZh = rows.filter((row) => row.zh).length
  const withJa = rows.filter((row) => row.ja).length
  console.log(
    `tags ${rows.length} · 中文 ${withZh} · 日文 ${withJa}${apply ? '' : ' · 没写库（加 --apply 才写）'}`,
  )
  if (!apply) return

  const { db } = await import('../src/lib/db')
  await db.danbooruTagName.deleteMany({})
  for (let start = 0; start < rows.length; start += WRITE_BATCH) {
    await db.danbooruTagName.createMany({
      data: rows.slice(start, start + WRITE_BATCH),
      skipDuplicates: true,
    })
    process.stdout.write(
      `\r写入 ${Math.min(start + WRITE_BATCH, rows.length)} / ${rows.length}`,
    )
  }
  console.log(`\n完成，表里 ${await db.danbooruTagName.count()} 行`)
  await db.$disconnect()
}

if (process.argv[1]?.endsWith('import-danbooru-tag-names.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
