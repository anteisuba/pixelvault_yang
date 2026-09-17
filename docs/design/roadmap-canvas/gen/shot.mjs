import { chromium } from '../../../../node_modules/playwright/index.mjs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const DIR = dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
for (const f of process.argv.slice(2)) { await page.goto('file://' + join(DIR, f + '.dc.html')); await page.waitForTimeout(700); await page.screenshot({ path: join(DIR, f + '.png'), fullPage: true }) }
await browser.close()
