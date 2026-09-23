// 量每张画板的实际高度 → 写 canvas-live.json（页 · 位置 · 尺寸）。
// 先跑 build-digest.mjs 生成 digest/*.dc.html，再跑本脚本。
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '../../../../node_modules/playwright/index.mjs'

import { PAGES } from './build-digest.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const WIDTH = 1400
const GAP_X = 100
const GAP_Y = 100
// 每页一行放几张：总览 / 进度表单张，业务设计两列，UI 与厂商三列。
const COLS = {
  'page-1': 1,
  'page-2': 2,
  'page-3': 3,
  'page-4': 1,
  'page-5': 3,
  'page-6': 1,
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: WIDTH, height: 500 } })
const heights = {}
for (const pg of PAGES) {
  for (const board of pg.boards) {
    await page.goto(`file://${join(HERE, 'digest', board.file)}`)
    await page.waitForTimeout(300)
    heights[board.file] = await page.evaluate(
      () => document.documentElement.scrollHeight,
    )
  }
}
await browser.close()

const artboards = []
for (const pg of PAGES) {
  const cols = COLS[pg.id] ?? 2
  let y = 0
  for (let i = 0; i < pg.boards.length; i += cols) {
    const row = pg.boards.slice(i, i + cols)
    const rowH = Math.max(...row.map((b) => heights[b.file] + 20))
    row.forEach((b, j) =>
      artboards.push({
        file: b.file,
        x: j * (WIDTH + GAP_X),
        y,
        w: WIDTH,
        h: heights[b.file] + 20,
        title: b.title,
        page: pg.id,
      }),
    )
    y += rowH + GAP_Y
  }
}

const canvas = {
  artboards,
  annotations: [],
  launch: { view: 'canvas', page: 'page-1' },
  pages: PAGES.map((pg) => ({ id: pg.id, name: pg.name })),
}
writeFileSync(
  join(HERE, 'canvas-live.json'),
  `${JSON.stringify(canvas, null, 2)}\n`,
)
console.log(`${artboards.length} boards laid out on ${PAGES.length} pages`)
