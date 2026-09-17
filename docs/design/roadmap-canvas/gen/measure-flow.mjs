// Measure pass-1 Flow.dc.html card rects (relative to the #flow container) → flow-layout.json
import { chromium } from '../../../../node_modules/playwright/index.mjs'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 3200, height: 800 } })
await page.goto('file://' + join(DIR, 'Flow.dc.html'))
await page.waitForTimeout(1200) // let Google Fonts land
const layout = await page.evaluate(() => {
  const flow = document.getElementById('flow')
  const base = flow.getBoundingClientRect()
  const cards = {}
  for (const el of flow.querySelectorAll('[data-page]')) {
    const r = el.getBoundingClientRect()
    cards[el.dataset.page] = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }
  }
  const cols = {}
  for (const el of flow.querySelectorAll('[data-col]')) {
    const head = el.getBoundingClientRect()
    cols[el.dataset.col] = { x: head.left - base.left, y: head.top - base.top, w: head.width }
  }
  return { cards, cols, W: Math.ceil(base.width), H: Math.ceil(base.height) }
})
writeFileSync(join(DIR, 'flow-layout.json'), JSON.stringify(layout, null, 2))
console.log('cards', Object.keys(layout.cards).length, 'W', layout.W, 'H', layout.H)
await browser.close()
