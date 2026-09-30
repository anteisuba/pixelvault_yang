// 从 mock.html 截出每个状态的参考图（1440 × 900 视口，只截画布窗口），给施工对照用。
// 用法（仓库根目录）：node docs/design/node-polish-2/shoot.mjs <输出目录>
// 需要本机 Chrome（channel: 'chrome'）；每个状态出「-after.png」（设计真值）和「-now.png」（现状）两张。
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(process.argv[2] ?? 'node-polish-2-shots')
mkdirSync(out, { recursive: true })

const STATES = [
  [
    '01-prompt-safe-area',
    (M) => {
      M.S.vp = { x: -316, y: 300, z: 0.9 }
      M.applyVP()
      M.select('vid1')
    },
  ],
  [
    '02-plus-menu',
    (M) => {
      M.S.vp = { x: 360, y: 180, z: 0.9 }
      M.applyVP()
      M.select('img1')
    },
    (M) => M.openAddMenu(),
  ],
  [
    '03-chip-popover',
    (M) => {
      M.S.vp = { x: 360, y: 180, z: 0.9 }
      M.applyVP()
      M.select('img1')
    },
    (M) => M.openFramePop(),
  ],
  [
    '04-model-popover',
    (M) => {
      M.S.vp = { x: 60, y: 200, z: 0.85 }
      M.applyVP()
      M.select('vid1')
    },
    (M) => M.openModelPop(),
  ],
  [
    '05-locate',
    (M) => {
      M.S.vp = { x: 531, y: 230, z: 0.9 }
      M.applyVP()
      M.setPanel(true)
      M.locate('img2')
    },
  ],
  [
    '06-far-30',
    (M) => {
      M.S.vp = { x: 691 - 160 * 0.3, y: 423 - 330 * 0.3, z: 0.3 }
      M.applyVP()
    },
  ],
  [
    '07-card-faces',
    (M) => {
      M.setLoaded(false)
      M.S.vp = { x: 531, y: -40, z: 1 }
      M.applyVP()
    },
  ],
  [
    '08-empty-selected',
    (M) => {
      M.S.vp = { x: 60, y: 200, z: 0.85 }
      M.applyVP()
      M.select('vid3')
    },
  ],
  [
    '09-open-image',
    (M) => {
      M.S.vp = { x: 531, y: 230, z: 0.9 }
      M.applyVP()
      M.select('img1')
      M.openNode('img1')
    },
  ],
  [
    '10-open-video',
    (M) => {
      M.S.vp = { x: 531, y: 230, z: 0.9 }
      M.applyVP()
      M.select('vid1')
      M.openNode('vid1')
    },
  ],
  [
    '11-open-doc',
    (M) => {
      M.S.vp = { x: 531, y: 230, z: 0.9 }
      M.applyVP()
      M.select('txt1')
      M.openNode('txt1')
    },
  ],
  [
    '12-assistant',
    (M) => {
      M.S.vp = { x: 360, y: 200, z: 0.85 }
      M.applyVP()
      M.openAsst()
    },
  ],
]

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('file://' + join(here, 'mock.html'))
await page.waitForTimeout(1200)

for (const mode of ['after', 'now']) {
  for (const [name, setup, then] of STATES) {
    await page.evaluate((m) => {
      const M = window.__mock
      M.closeOpen()
      M.closeAsst()
      M.setPanel(false)
      M.select(null)
      M.setMode(m)
      M.setLoaded(true)
    }, mode)
    await page.waitForTimeout(500)
    await page.evaluate(`(${setup.toString()})(window.__mock)`)
    await page.waitForTimeout(900)
    if (then) {
      await page.evaluate(`(${then.toString()})(window.__mock)`)
      await page.waitForTimeout(700)
    }
    await page
      .locator('#win')
      .screenshot({ path: join(out, `${name}-${mode}.png`) })
  }
}
// 打开项目的落点：点原型控制条上的「模拟打开项目」
for (const mode of ['after', 'now']) {
  await page.evaluate((m) => {
    const M = window.__mock
    M.closeOpen()
    M.closeAsst()
    M.select(null)
    M.setMode(m)
  }, mode)
  await page.click('#bOpenProj')
  await page.waitForTimeout(900)
  await page
    .locator('#win')
    .screenshot({ path: join(out, `13-project-open-${mode}.png`) })
}
await browser.close()
console.log(
  `wrote ${STATES.length * 2 + 2} shots to ${out}`,
  errors.length ? `errors: ${errors.join(' | ')}` : '',
)
