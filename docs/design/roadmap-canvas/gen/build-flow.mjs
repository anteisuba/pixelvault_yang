// Build the screen-flow artboard (Flow.dc.html) in two passes:
//   pass 1 (no flow-layout.json): shell bar + columns flow naturally → measured by measure-flow.mjs
//   pass 2 (flow-layout.json present): everything absolutely positioned + SVG edges baked from the measurement.
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PAGES, EDGES, COLUMNS, SHELL_EDGES } from './flow-data.mjs'

const OUT = dirname(fileURLToPath(import.meta.url))
const FG = '#0a0a0a'
const MUTED = '#737373'
const RED = '#b3261e'
const AMBER = '#a04f00'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const accent = (h, l = 0.45, c = 0.11) => `oklch(${l} ${c} ${h})`
const NAV = '#b4b4b4'
const FLOW = accent(292, 0.55, 0.13)
const DEEP = accent(160, 0.5, 0.11)

const COL_STYLE = {
  entry: { bg: FG, fg: '#fff', border: FG },
  shell: { bg: '#f5f5f5', fg: FG, border: '#e5e5e5' },
  tools: { bg: 'oklch(0.965 0.022 292)', fg: 'oklch(0.38 0.11 292)', border: 'oklch(0.88 0.05 292)' },
  go: { bg: 'oklch(0.965 0.022 160)', fg: 'oklch(0.38 0.11 160)', border: 'oklch(0.88 0.05 160)' },
  hidden: { bg: '#fff', fg: MUTED, border: '#d4d4d4' },
}

const chip = (t) => `<span style="font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;line-height:1.3;padding:2px 7px;border-radius:999px;background:#fff;border:1px solid #e5e5e5;color:${FG};white-space:nowrap">${esc(t)}</span>`

function card(p, pos) {
  const st = COL_STYLE[p.col]
  const posStyle = pos
    ? `position:absolute;left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px;`
    : `width:${p.w ?? 300}px;`
  const status = p.status === 'gated'
    ? `<span style="font-size:11px;color:${AMBER};font-weight:500">敬请期待 / gated</span>`
    : p.status === 'legacy'
      ? `<span style="font-size:11px;color:${RED};font-weight:500">遗留 · 307 垫片</span>`
      : p.status === 'dead'
        ? `<span style="font-size:11px;color:${MUTED};font-weight:500">无页面</span>`
        : ''
  const comps = p.comps?.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:10px">${p.comps.map(chip).join('')}</div>`
    : ''
  const feats = p.feats?.length
    ? `<ul style="margin:10px 0 0;padding:0 0 0 14px;font-size:12px;line-height:1.55;color:${FG};display:flex;flex-direction:column;gap:2px">${p.feats.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
    : ''
  const body = p.col === 'shell'
    ? `<div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));column-gap:28px"><div>${comps}</div><div>${feats}</div></div>`
    : `${comps}${feats}`
  return `<div data-page="${p.id}" style="${posStyle}box-sizing:border-box;display:flex;flex-direction:column;background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:12px 14px;box-shadow:0 1px 2px rgba(0,0,0,.04)">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div style="display:inline-flex;align-items:center;gap:8px;background:${st.bg};color:${st.fg};border:1px solid ${st.border};font-size:13px;font-weight:600;padding:4px 10px;border-radius:6px;white-space:nowrap">${esc(p.title)}</div>
      ${status}
    </div>
    <div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;color:${MUTED};margin-top:8px">${esc(p.route)}</div>
    <div style="font-size:12.5px;line-height:1.5;color:#404040;margin-top:6px">${esc(p.role)}</div>
    ${body}
  </div>`
}

const colHead = (c, pos) => `<div data-col="${c.id}" style="${pos ? `position:absolute;left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;` : ''}font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};padding-bottom:8px;border-bottom:1px solid #e5e5e5">${esc(c.label)}</div>`

function pass1Html() {
  const shell = PAGES.find((p) => p.col === 'shell')
  const entry = COLUMNS[0]
  const cols = COLUMNS.map((c) => `
    <div style="display:flex;flex-direction:column;gap:28px;width:${c.w}px;flex:none;margin-right:${c.gapAfter ?? 0}px">
      ${colHead(c)}
      ${PAGES.filter((p) => p.col === c.id).map((p) => card(p)).join('')}
    </div>`).join('')
  return `<div id="flow" style="display:flex;flex-direction:column;gap:64px;align-items:flex-start">
    <div style="margin-left:${entry.w + (entry.gapAfter ?? 0)}px">${card(shell)}</div>
    <div style="display:flex;align-items:flex-start">${cols}</div>
  </div>`
}

// ── edge routing ──
const STEP = 16
const R = 10
const colOf = (id) => PAGES.find((p) => p.id === id)?.col
const colIndex = (col) => COLUMNS.findIndex((c) => c.id === col)

/** Orthogonal path: out of (x1,y1) horizontally to lane, vertical to y2, horizontally into (x2,y2). Rounded corners. */
function ortho(x1, y1, lane, x2, y2) {
  const sx = lane > x1 ? 1 : -1
  const sy = y2 > y1 ? 1 : -1
  const ex = x2 > lane ? 1 : -1
  const r = Math.min(R, Math.abs(y2 - y1) / 2)
  return `M${x1},${y1} H${lane - sx * r} Q${lane},${y1} ${lane},${y1 + sy * r} V${y2 - sy * r} Q${lane},${y2} ${lane + ex * r},${y2} H${x2}`
}

function bezier(x1, y1, x2, y2) {
  const dx = Math.max(48, Math.abs(x2 - x1) * 0.45)
  const c1x = x1 + (x2 > x1 ? dx : -dx), c2x = x2 - (x2 > x1 ? dx : -dx)
  return { d: `M${x1},${y1} C${c1x},${y1} ${c2x},${y2} ${x2},${y2}`, mx: (x1 + 3 * c1x + 3 * c2x + x2) / 8, my: (y1 + 3 * y1 + 3 * y2 + y2) / 8 }
}

function routeEdges(cards) {
  const items = EDGES.map((e) => {
    const a = cards[e.from], b = cards[e.to]
    if (!a || !b) return null
    const ca = colIndex(colOf(e.from)), cb = colIndex(colOf(e.to))
    const kind = cb === ca + 1 ? 'fwd' : cb < ca ? 'back' : cb === ca ? 'same' : 'fwdskip'
    return { e, a, b, ca, cb, kind }
  }).filter(Boolean)

  const cnt = {}
  const slot = (key) => { cnt[key] = (cnt[key] ?? 0); return cnt[key]++ }

  // lanes per gap g (between column g and g+1)
  const gapEdges = {}
  const toolsIdx = colIndex('tools')
  for (const it of items) {
    if (it.kind === 'back') (gapEdges[it.ca - 1] ??= []).push(it)
    else if (it.kind === 'same') (gapEdges[it.ca === toolsIdx ? it.ca - 1 : it.ca] ??= []).push(it)
  }
  const colRect = (i) => {
    const xs = PAGES.filter((p) => p.col === COLUMNS[i].id && cards[p.id]).map((p) => cards[p.id])
    return { x: Math.min(...xs.map((r) => r.x)), right: Math.max(...xs.map((r) => r.x + r.w)) }
  }
  for (const [g, list] of Object.entries(gapEdges)) {
    const gi = Number(g)
    const left = colRect(gi).right, right = colRect(gi + 1).x
    list.sort((p, q) => Math.abs(p.a.y - p.b.y) - Math.abs(q.a.y - q.b.y))
    const n = list.length
    list.forEach((it, i) => { it.lane = left + Math.round((right - left) * (i + 1) / (n + 1)) })
  }

  const out = []
  for (const it of items) {
    const { e, a, b, kind } = it
    const color = e.kind === 'nav' ? NAV : e.kind === 'flow' ? FLOW : DEEP
    let d, lx, ly, anchor = 'middle'
    if (kind === 'fwd' || kind === 'fwdskip') {
      const y1 = a.y + 22 + slot(`oR:${e.from}`) * STEP
      const y2 = b.y + 22 + slot(`iL:${e.to}`) * STEP
      const bz = bezier(a.x + a.w, y1, b.x, y2)
      d = bz.d; lx = bz.mx; ly = bz.my - 5
    } else if (kind === 'back') {
      const y1 = a.y + a.h - 22 - slot(`oL:${e.from}`) * STEP
      const y2 = b.y + b.h - 22 - slot(`iR:${e.to}`) * STEP
      d = ortho(a.x, y1, it.lane, b.x + b.w, y2)
      lx = a.x - 8; ly = y1 - 5; anchor = 'end'
    } else {
      const leftSide = it.ca === toolsIdx
      const down = b.y > a.y
      const side = leftSide ? 'L' : 'R'
      const y1 = down ? a.y + a.h - 22 - slot(`s${side}o:${e.from}`) * STEP : a.y + 22 + slot(`s${side}o:${e.from}`) * STEP
      const y2 = down ? b.y + 22 + slot(`s${side}i:${e.to}`) * STEP : b.y + b.h - 22 - slot(`s${side}i:${e.to}`) * STEP
      const x1 = leftSide ? a.x : a.x + a.w
      const x2 = leftSide ? b.x : b.x + b.w
      d = ortho(x1, y1, it.lane, x2, y2)
      lx = leftSide ? x1 - 8 : x1 + 8; ly = y1 - 5; anchor = leftSide ? 'end' : 'start'
    }
    out.push({ d, color, kind: e.kind, label: e.label, lx, ly, anchor })
  }
  return out
}

function shellEdges(layout) {
  const shell = layout.cards.shell
  return SHELL_EDGES.map((se) => {
    const head = layout.cols[se.col]
    const x = Math.min(Math.max(head.x + 24, shell.x + 24), shell.x + shell.w - 24)
    const y1 = shell.y + shell.h, y2 = head.y - 4
    return { d: `M${x},${y1} V${y2}`, color: NAV, kind: 'nav', label: se.label, lx: x + 8, ly: (y1 + y2) / 2 + 4, anchor: 'start' }
  })
}

function edgesSvg(layout, W, H) {
  const all = [...routeEdges(layout.cards), ...shellEdges(layout)]
  const marker = (id, color) => `<marker id="arr-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" fill="none" stroke="${color}" stroke-width="1.5"/></marker>`
  const paths = all.map((x) => `<path d="${x.d}" fill="none" stroke="${x.color}" stroke-width="${x.kind === 'nav' ? 1.25 : 1.5}"${x.kind === 'nav' ? ' stroke-dasharray="3 4"' : ''} marker-end="url(#arr-${x.kind})"/>`)
  const labels = all.filter((x) => x.label).map((x) => `<text x="${x.lx.toFixed(1)}" y="${x.ly.toFixed(1)}" text-anchor="${x.anchor}" font-size="10.5" font-weight="500" fill="${x.kind === 'nav' ? '#8a8a8a' : x.color}" stroke="#fff" stroke-width="3" paint-order="stroke" font-family="Geist, 'Noto Sans SC', system-ui, sans-serif">${esc(x.label)}</text>`)
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0;pointer-events:none;overflow:visible">
    <defs>${marker('nav', NAV)}${marker('flow', FLOW)}${marker('deep', DEEP)}</defs>
    ${paths.join('\n')}
    ${labels.join('\n')}
  </svg>`
}

const legend = `<div style="display:flex;gap:18px;font-size:12px;color:${MUTED};align-items:center;flex-wrap:wrap">
  <span style="display:inline-flex;align-items:center;gap:6px"><svg width="34" height="10"><line x1="0" y1="5" x2="34" y2="5" stroke="${NAV}" stroke-width="1.25" stroke-dasharray="3 4"/></svg>导航（侧栏分组 / 首页入口）</span>
  <span style="display:inline-flex;align-items:center;gap:6px"><svg width="34" height="10"><line x1="0" y1="5" x2="34" y2="5" stroke="${FLOW}" stroke-width="1.5"/></svg>创作主流程（生成 → 去向）</span>
  <span style="display:inline-flex;align-items:center;gap:6px"><svg width="34" height="10"><line x1="0" y1="5" x2="34" y2="5" stroke="${DEEP}" stroke-width="1.5"/></svg>深链 / 带参回流</span>
</div>`

function header(sub) {
  return `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:32px;margin-bottom:28px">
  <div style="max-width:820px">
    <div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">PixelVault · 画面地图 · 2026-09-14</div>
    <h1 style="margin:8px 0 0;font-size:26px;font-weight:600;letter-spacing:-.01em;line-height:1.2;color:${FG}">整站画面与跳转</h1>
    <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#525252">${esc(sub)}</p>
  </div>
  ${legend}
</div>`
}

const STYLE = `
    body { margin: 0; background: #fff; color: ${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: ${FG}; } a:hover { color: ${MUTED}; }
    li::marker { color: #a3a3a3; }
`

function page(body) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>PixelVault 画面地图</title>
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;family=Noto+Sans+SC:wght@400;500;600&amp;display=swap">
  <style>${STYLE}</style>
</helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">
${body}
</div>
</x-dc>
</body>
</html>
`
}

const SUB = '首页进应用壳；侧栏的三个分组就是下面三列：工具 6 · 去处 5 · 遗留 / 边缘（「敬请期待」组已于 2026-09-17 删除）。每张卡列出页面上的主要组件与能做的事。虚线是导航入口，紫线是创作主流程，绿线是带参数的深链回流。卡片可拖、可改字；连线按当前位置画好。'

const layoutPath = join(OUT, 'flow-layout.json')
let body
if (existsSync(layoutPath)) {
  const layout = JSON.parse(readFileSync(layoutPath, 'utf8'))
  const cards = PAGES.map((p) => {
    const r = layout.cards[p.id]
    if (!r) throw new Error('no layout for ' + p.id)
    return card(p, { x: r.x, y: r.y, w: r.w, h: Math.ceil(r.h + 8) })
  }).join('')
  const heads = COLUMNS.map((c) => colHead(c, layout.cols[c.id])).join('')
  body = header(SUB) + `<div style="position:relative;width:${layout.W}px;height:${layout.H}px">${edgesSvg(layout, layout.W, layout.H)}${heads}${cards}</div>`
} else {
  body = header(SUB) + pass1Html()
}
writeFileSync(join(OUT, 'Flow.dc.html'), page(body))
console.log('wrote Flow.dc.html', existsSync(layoutPath) ? '(pass 2, absolute)' : '(pass 1, flow)')
