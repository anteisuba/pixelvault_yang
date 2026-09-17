import { chromium } from '/Users/fulina/Code/pixelvault_yang/node_modules/playwright/index.mjs'
import { readFileSync } from 'node:fs'
const c = JSON.parse(readFileSync('live4/canvas.json','utf8'))
const boards = c.artboards
const notes = c.annotations.filter(n => Number(n.id.slice(5)) >= 21)
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 800 } })
const cache = {}
for (const n of notes) {
  const page = n.page || 'page-1'
  // find board containing or nearest
  let best=null, bd=1e9
  for (const ab of boards) { if ((ab.page||'page-1')!==page) continue
    const dx = Math.max(ab.x - n.x, 0, n.x - (ab.x+ab.w)); const dy = Math.max(ab.y - n.y, 0, n.y - (ab.y+ab.h)); const d=Math.hypot(dx,dy); if (d<bd){bd=d;best=ab} }
  const lx = n.x - best.x, ly = n.y - best.y
  if (!cache[best.file]) { await p.goto('file://'+process.cwd()+'/'+best.file); await p.waitForTimeout(500)
    cache[best.file] = await p.evaluate(() => { const out=[]; for (const el of document.querySelectorAll('div,td,h1')) { const t=(el.innerText||'').trim(); if(!t) continue; const r=el.getBoundingClientRect(); if (r.width<80||r.height<14||r.height>60) continue; const s=getComputedStyle(el); if (s.fontWeight>=600 && t.length<70 && parseFloat(s.fontSize)<=16) out.push({t:t.split('\n')[0].slice(0,50),x:r.left,y:r.top,w:r.width,h:r.height}) } return out }) }
  // nearest heading to note top-left (note anchors near card)
  const els = cache[best.file]; let bh=null, bdd=1e9
  for (const e of els) { const d = Math.hypot((e.x+e.w/2)-(lx+120), (e.y)-(ly)); if (d<bdd){bdd=d;bh=e} }
  console.log(`[${n.id}] ${best.title||best.file} @(${lx},${ly}) ≈ 「${bh?.t}」 :: ${n.text.replace(/\n/g,' / ').slice(0,80)}`)
}
await b.close()
