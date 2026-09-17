import { chromium } from '../../../../node_modules/playwright/index.mjs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const DIR = dirname(fileURLToPath(import.meta.url))
const files = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 500 } })
const out = {}
for (const f of files) {
  await page.goto('file://' + join(DIR, f + '.dc.html')); await page.waitForTimeout(700)
  out[f] = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }))
}
console.log(JSON.stringify(out)); await browser.close()
