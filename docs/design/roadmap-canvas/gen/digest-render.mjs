// 浓缩版画布的渲染层：同一份内容 → .dc.html 画板 + Markdown 镜像。
// 内容在 build-digest.mjs；这里只管长相。

export const FG = '#0a0a0a'
export const MUTED = '#737373'
export const GREEN = '#16794c'
export const AMBER = '#a04f00'
export const RED = '#b3261e'
export const PURPLE = '#6d28d9'
export const LINE = '#e5e5e5'
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// 状态词表：进度表与业务板共用。solid = 实心胶囊。
export const STATUS = {
  已落: { c: GREEN, solid: true, d: '代码已提交并上线；真机 / 付费验收看备注' },
  部分: { c: AMBER, solid: true, d: '主体已落，仍有写明的缺口' },
  进行中: { c: FG, solid: true, d: '当前正在做 / 正在讨论' },
  可开工: { c: GREEN, d: '设计与拍板都齐，可直接派活' },
  待设计: { c: PURPLE, d: '要走 ① 反问 → ④ 画板，通过前不动代码' },
  '待 spec': { c: AMBER, d: '先写契约 / 迁移方案，无新画面' },
  待验: { c: AMBER, d: '代码在，缺真机或付费验收' },
  '待 owner': { c: RED, d: '差 owner 一句拍板' },
  等依赖: { c: MUTED, d: '被前一层挡住，见依赖列' },
  后置: { c: MUTED, d: 'owner 定的后置' },
  远期: { c: MUTED, d: '方向成立，不排期' },
}

export function pill(text) {
  const key = Object.keys(STATUS).find((k) => text === k || text.startsWith(`${k} · `))
  const m = STATUS[key] ?? { c: MUTED }
  const long = text.length > 14
  return `<span style="display:${long ? 'inline-block;max-width:220px' : 'inline-flex;white-space:nowrap'};${MONO}font-size:10.5px;line-height:1.5;padding:2px 8px;border-radius:${long ? '8px' : '999px'};border:1px solid ${m.c};color:${m.solid ? '#fff' : m.c};background:${m.solid ? m.c : 'transparent'}">${esc(text)}</span>`
}

const STYLE = `
    body { margin: 0; background: #fff; color: ${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid #ececec; font-size: 12.5px; line-height: 1.55; }
    th { font-size: 11px; letter-spacing: .06em; color: ${MUTED}; font-weight: 500; border-bottom: 1px solid #d4d4d4; }
    tr:last-child td { border-bottom: 0; }
    ul { margin: 8px 0 0; padding-left: 18px; }
    li { font-size: 13px; line-height: 1.65; margin: 3px 0; }
    b { font-weight: 600; }
`

// 行内：**粗体** 与 `代码`
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, `<code style="${MONO}font-size:.92em;background:#f4f4f4;padding:0 4px;border-radius:4px">$1</code>`)

function blockHtml(b) {
  switch (b.t) {
    case 'h':
      return `<div style="margin-top:28px;display:flex;align-items:baseline;gap:12px"><div style="font-size:16px;font-weight:600">${esc(b.text)}</div>${b.sub ? `<div style="font-size:12px;color:${MUTED}">${esc(b.sub)}</div>` : ''}</div>`
    case 'p':
      return `<p style="margin:8px 0 0;font-size:13px;line-height:1.7;color:#404040;max-width:1180px">${inline(b.text)}</p>`
    case 'ul':
      return `<ul style="max-width:1200px">${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`
    case 'table': {
      const statusCol = b.cols.indexOf('状态')
      const colgroup = b.widths ? `<colgroup>${b.widths.map((w) => `<col${w ? ` style="width:${w}"` : ''}>`).join('')}</colgroup>` : ''
      return `<div style="overflow:hidden;border:1px solid ${LINE};border-radius:10px;margin-top:10px"><table>${colgroup}<thead><tr>${b.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.rows
        .map(
          (r) =>
            `<tr>${r
              .map((c, i) =>
                i === statusCol
                  ? `<td style="width:1%;white-space:nowrap">${pill(c)}</td>`
                  : `<td${i === 0 && b.firstStrong !== false ? ' style="font-weight:500"' : ''}>${inline(c)}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('')}</tbody></table></div>`
    }
    case 'layers':
      return `<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">${b.layers
        .map(
          (l, i) =>
            `${i ? `<div style="text-align:center;color:${MUTED};font-size:12px;line-height:1">↓ ${esc(l.why ?? '')}</div>` : ''}<div style="display:grid;grid-template-columns:150px 1fr;gap:12px;align-items:stretch"><div style="border-radius:10px;background:#f4f4f1;padding:12px 14px"><div style="${MONO}font-size:10.5px;letter-spacing:.06em;color:${MUTED}">${esc(l.tag)}</div><div style="margin-top:4px;font-size:14px;font-weight:600">${esc(l.name)}</div></div><div style="display:flex;flex-wrap:wrap;gap:8px">${l.items
              .map(
                (it) =>
                  `<div style="flex:1 1 200px;border:1px solid ${LINE};border-radius:10px;padding:10px 12px;background:#fff"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span style="font-size:13.5px;font-weight:600">${esc(it.name)}</span>${it.status ? pill(it.status) : ''}</div><div style="margin-top:4px;font-size:12px;line-height:1.55;color:#525252">${inline(it.note)}</div></div>`,
              )
              .join('')}</div></div>`,
        )
        .join('')}</div>`
    case 'legend':
      return `<div style="display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:10px">${Object.entries(STATUS)
        .map(([k, v]) => `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:${MUTED}">${pill(k)} ${esc(v.d)}</span>`)
        .join('')}</div>`
    case 'note':
      return `<div style="margin-top:12px;padding:12px 14px;border:1px dashed ${b.tone === 'warn' ? AMBER : '#c4c4c4'};border-radius:10px;font-size:12.5px;line-height:1.65;color:#404040;max-width:1200px">${inline(b.text)}</div>`
    default:
      throw new Error(`unknown block ${b.t}`)
  }
}

export function boardHtml(board) {
  const body = `<div style="margin-bottom:8px;max-width:1180px">
    <div style="${MONO}font-size:11px;letter-spacing:.08em;color:${MUTED}">${esc(board.eyebrow)}</div>
    <h1 style="margin:8px 0 0;font-size:26px;font-weight:600;letter-spacing:-.01em;line-height:1.25">${esc(board.heading)}</h1>
    ${board.sub ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.65;color:#525252">${inline(board.sub)}</p>` : ''}
  </div>
${board.blocks.map(blockHtml).join('\n')}`
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(board.title)}</title>
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

// ── Markdown 镜像 ──
const mdCell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
function blockMd(b) {
  switch (b.t) {
    case 'h':
      return `### ${b.text}${b.sub ? `\n\n_${b.sub}_` : ''}`
    case 'p':
      return b.text
    case 'note':
      return `> ${b.text}`
    case 'ul':
      return b.items.map((i) => `- ${i}`).join('\n')
    case 'table':
      return [
        `| ${b.cols.map(mdCell).join(' | ')} |`,
        `| ${b.cols.map(() => '---').join(' | ')} |`,
        ...b.rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`),
      ].join('\n')
    case 'layers':
      return b.layers
        .map(
          (l) =>
            `**${l.tag} · ${l.name}**${l.why ? `（${l.why}）` : ''}\n\n${l.items
              .map((it) => `- **${it.name}**${it.status ? ` \`${it.status}\`` : ''}：${it.note}`)
              .join('\n')}`,
        )
        .join('\n\n')
    case 'legend':
      return Object.entries(STATUS)
        .map(([k, v]) => `- \`${k}\`：${v.d}`)
        .join('\n')
    default:
      throw new Error(`unknown block ${b.t}`)
  }
}

export function boardMd(board) {
  return [
    `## ${board.heading}`,
    `_${board.eyebrow}_`,
    board.sub,
    ...board.blocks.map(blockMd),
  ]
    .filter(Boolean)
    .join('\n\n')
}
