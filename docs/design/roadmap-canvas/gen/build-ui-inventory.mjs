// Page 10: UI 全清单 — render research/ui-inventory.md into one board per H2 section.
import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const OUT = dirname(fileURLToPath(import.meta.url))
const FG = '#0a0a0a', MUTED = '#737373', LINE = '#e5e5e5'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code style="font-family:\'Geist Mono\',ui-monospace,monospace;font-size:11.5px;background:#f5f5f5;padding:1px 5px;border-radius:4px">$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
const STYLE = `body{margin:0;background:#fff;color:${FG};font-family:Geist,'Noto Sans SC',system-ui,'PingFang SC',sans-serif;-webkit-font-smoothing:antialiased}
table{border-collapse:collapse;width:100%}th,td{text-align:left;vertical-align:top;padding:7px 10px;border-bottom:1px solid #ececec;font-size:12px;line-height:1.5}th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};font-weight:500;border-bottom:1px solid #d4d4d4}
h2{font-size:26px;font-weight:600;letter-spacing:-.01em;margin:8px 0 0}h3{font-size:16px;font-weight:600;margin:26px 0 8px}p{font-size:12.5px;line-height:1.6;color:#404040;margin:8px 0;max-width:1100px}ul,ol{font-size:12.5px;line-height:1.6;color:#404040;padding-left:22px;margin:6px 0}li{margin:3px 0}blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid #d4d4d4;color:${MUTED};font-size:12px;line-height:1.55}`
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><script src="./support.js"></script></head>
<body><x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;family=Noto+Sans+SC:wght@400;500;600&amp;display=swap"><style>${STYLE}</style></helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">
<div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">PixelVault · UI 全清单 · 2026-09-17 · 只读盘点</div>
${body}</div></x-dc></body></html>
`
function render(md) {
  const lines = md.split('\n'); let html = '', i = 0, list = null
  const closeList = () => { if (list) { html += `</${list}>`; list = null } }
  while (i < lines.length) {
    const l = lines[i]
    if (/^\|/.test(l)) { closeList(); const rows = []; while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++ }
      const cells = (r) => r.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim())
      const head = cells(rows[0]); const body = rows.slice(2).map(cells)
      html += `<div style="overflow:hidden;border:1px solid ${LINE};border-radius:10px;margin:10px 0"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c, k) => `<td${k === 0 ? ' style="font-weight:500"' : ''}>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; continue }
    if (/^### /.test(l)) { closeList(); html += `<h3>${inline(l.slice(4))}</h3>` }
    else if (/^## /.test(l)) { closeList(); html += `<h2>${inline(l.slice(3))}</h2>` }
    else if (/^# /.test(l)) { closeList() }
    else if (/^> /.test(l) || /^&gt; /.test(l)) { closeList(); html += `<blockquote>${inline(l.replace(/^(> |&gt; )/, ''))}</blockquote>` }
    else if (/^[-*] /.test(l)) { if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul' } html += `<li>${inline(l.slice(2))}</li>` }
    else if (/^\d+\. /.test(l)) { if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol' } html += `<li>${inline(l.replace(/^\d+\. /, ''))}</li>` }
    else if (l.trim() === '' || l.trim() === '---') { closeList() }
    else { closeList(); html += `<p>${inline(l)}</p>` }
    i++
  }
  closeList(); return html
}
const md = readFileSync(join(OUT, '../research/ui-inventory.md'), 'utf8').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
const sections = md.split(/\n(?=## )/)
const names = { A: 'UiInvPages', B: 'UiInvPrimitives', C: 'UiInvBusiness', D: 'UiInvPatterns', E: 'UiInvVisual', F: 'UiInvIssues' }
for (const sec of sections) {
  const m = sec.match(/^## ([A-F])\. /); if (!m) continue
  const key = m[1]; const title = sec.split('\n')[0].replace(/^## /, '')
  writeFileSync(join(OUT, names[key] + '.dc.html'), page(title, render(sec))); console.log('wrote', names[key])
}
