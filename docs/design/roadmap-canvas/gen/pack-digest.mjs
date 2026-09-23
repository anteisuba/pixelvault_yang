// 把 digest/*.dc.html 与 canvas-live.json 装进一份已发布的画布页面，产出可直接发布的 HTML。
// 用法：node pack-digest.mjs <线上页面.html> <输出.html>
//   <线上页面.html> = Artifact read 存下的最新版本（编辑器外壳与评论都从它来，只换内容）。
// 画布内容住在 <script type="application/json" id="appifact-doc"> 里：
//   { title, content: { files: { '<画板>.dc.html': html, 'canvas.json': 布局 } }, comments }
// 序列化规则与线上一致：紧凑 JSON、非 ASCII 原样、'<' 写成 \u003c、前后各一个换行。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const [basePath, outPath] = process.argv.slice(2)
if (!basePath || !outPath) {
  console.error('usage: node pack-digest.mjs <live.html> <out.html>')
  process.exit(1)
}

const base = readFileSync(basePath, 'utf8')
const OPEN = '<script type="application/json" id="appifact-doc">'
const start = base.indexOf(OPEN)
const end = base.indexOf('</script>', start)
if (start < 0 || end < 0 || base.indexOf(OPEN, start + 1) >= 0) {
  throw new Error('appifact-doc block not found exactly once')
}
const doc = JSON.parse(base.slice(start + OPEN.length, end))

const canvasText = readFileSync(join(HERE, 'canvas-live.json'), 'utf8').replace(
  /\n$/,
  '',
)
const canvas = JSON.parse(canvasText)
const files = { 'canvas.json': canvasText }
for (const board of canvas.artboards) {
  files[board.file] = readFileSync(join(HERE, 'digest', board.file), 'utf8')
}
doc.content = { ...doc.content, files }

const serialized = `\n${JSON.stringify(doc).replace(/</g, '\\u003c')}\n`
writeFileSync(
  outPath,
  base.slice(0, start + OPEN.length) + serialized + base.slice(end),
)
console.log(
  `packed ${canvas.artboards.length} boards on ${canvas.pages.length} pages · comments kept: ${doc.comments?.length ?? 0}`,
)
