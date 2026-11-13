// 首页 v6「她」离线烘焙：原图 → 底 / 五官层 / 静态图 + 三种取样色。
// 换了 public/homepage/v6/her.webp 或改了 her-bake.ts / her-rig.ts 的画法后重跑：
//   node scripts/bake-home-her.mjs
// 静态图用真渲染器在无头 Chrome 里画一帧静止的她（不带 SVG 叠层，叠层由页面自己画）。
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from 'playwright'
import sharp from 'sharp'
import ts from 'typescript'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIB = path.join(ROOT, 'src/lib/home-v6')
const OUT = path.join(ROOT, 'public/homepage/v6')
const STILL_PX = 1200

/** 把几个 TS 模块转成可直接 import 的 ESM（相对导入补上 .js）。 */
async function transpile(dir, names) {
  for (const name of names) {
    const src = await readFile(path.join(LIB, `${name}.ts`), 'utf8')
    const js = ts
      .transpileModule(src, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      })
      .outputText.replace(/from '(\.\/[^']+)'/g, "from '$1.js'")
    await writeFile(path.join(dir, `${name}.js`), js)
  }
}

const tmp = await mkdtemp(path.join(os.tmpdir(), 'bake-her-'))
try {
  /* 1. 底和五官层 */
  const { data, info } = await sharp(path.join(OUT, 'her.webp'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.width !== 2000 || info.height !== 2000)
    throw new Error(
      `her.webp 应是 2000×2000，实际 ${info.width}×${info.height}`,
    )
  await transpile(tmp, ['her-geometry', 'her-bake'])
  const { bakeHer } = await import(pathToFileURL(path.join(tmp, 'her-bake.js')))
  const baked = bakeHer(new Uint8ClampedArray(data))
  const raw = { raw: { width: 2000, height: 2000, channels: 4 } }
  await sharp(Buffer.from(baked.base.buffer), raw)
    .webp({ quality: 90, alphaQuality: 100, smartSubsample: true })
    .toFile(path.join(OUT, 'her-base.webp'))
  await sharp(Buffer.from(baked.parts.buffer), raw)
    .webp({ lossless: true })
    .toFile(path.join(OUT, 'her-parts.webp'))

  const fmt = (c) => `[${c.map((v) => +v.toFixed(5)).join(', ')}]`
  await writeFile(
    path.join(LIB, 'her-colors.ts'),
    `// 由 scripts/bake-home-her.mjs 生成，别手改。\nexport const HER_COLORS: Record<'skin' | 'lash' | 'hair', number[]> = {\n  skin: ${fmt(baked.skin)},\n  lash: ${fmt(baked.lash)},\n  hair: ${fmt(baked.hair)},\n}\n`,
  )

  /* 2. 静态图：真渲染器、减少动态效果（停在 idle 不眨眼）、只截画布 */
  await transpile(tmp, ['her-geometry', 'her-colors', 'her-rig'])
  const css = await readFile(path.join(ROOT, 'src/app/home-v6.css'), 'utf8')
  const html = `<!doctype html><style>${css}
    html, body, .home-v6 { margin: 0; background: transparent; }
    .home-v6 .her-wrap svg { display: none !important; }
  </style>
  <div class="home-v6"><div id="h" style="position:relative;width:${STILL_PX}px;height:${STILL_PX}px"></div></div>
  <script type="module">
    import { mountHer } from './her-rig.js'
    mountHer(document.getElementById('h'), { base: './her-base.webp', parts: './her-parts.webp', transparent: true })
  </script>`
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({
    viewport: { width: STILL_PX, height: STILL_PX },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  await page.route('http://bake.local/**', async (route) => {
    const name = new URL(route.request().url()).pathname.slice(1)
    if (!name) return route.fulfill({ contentType: 'text/html', body: html })
    if (name.endsWith('.js'))
      return route.fulfill({
        contentType: 'text/javascript',
        body: await readFile(path.join(tmp, name)),
      })
    return route.fulfill({
      contentType: 'image/webp',
      body: await readFile(path.join(OUT, name)),
    })
  })
  await page.goto('http://bake.local/')
  await page.waitForFunction(() => document.querySelector('canvas')?.width > 0)
  await page.waitForTimeout(600)
  const png = await page.locator('#h').screenshot({ omitBackground: true })
  await browser.close()
  await sharp(png)
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(path.join(OUT, 'her-still.webp'))

  for (const f of ['her-base.webp', 'her-parts.webp', 'her-still.webp']) {
    const kb = ((await readFile(path.join(OUT, f))).length / 1024).toFixed(0)
    console.log(`${f}  ${kb} KB`)
  }
} finally {
  await rm(tmp, { recursive: true, force: true })
}
