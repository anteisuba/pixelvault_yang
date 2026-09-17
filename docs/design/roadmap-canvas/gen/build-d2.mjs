// D2 · 模型选择器 + 能力驱动表单 + 规格 chip：① 反问对照图（Q1 A vs B）+ ② 思维导图
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const FG = 'oklch(14.5% 0 0)', MUTED = '#737373', BORDER = 'oklch(92.2% 0 0)', MUTEDBG = 'oklch(97% 0 0)', WORKBENCH = '#f4f4f1', RED = '#b3261e', AMBER = '#a04f00', GREEN = '#16794c'
const SH_OVERLAY = '0 1px 2px rgb(0 0 0 / 0.06), 0 18px 44px -18px rgb(0 0 0 / 0.38)'
const SH_FLOAT = '0 1px 2px rgb(0 0 0 / 0.05), 0 8px 28px -12px rgb(0 0 0 / 0.32)'

const STYLE = `
  body { margin:0; background:#fff; color:${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing:antialiased; }
  h1 { margin:8px 0 0; font-size:26px; font-weight:600; letter-spacing:-.01em; line-height:1.2 }
  .eyebrow { ${MONO} font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:${MUTED} }
  .sub { margin:8px 0 0; font-size:14px; line-height:1.6; color:#525252; max-width:1000px }
  .sec { margin-top:30px; display:flex; align-items:baseline; gap:12px } .sec b { font-size:16px; font-weight:600 } .sec span { font-size:12px; color:${MUTED} }
  .lab { ${MONO} font-size:10.5px; letter-spacing:.05em; color:${MUTED} }
  .tok { ${MONO} font-size:10.5px; color:#525252 }
  svg.ic { width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; display:block; flex:none }
  .tree { display:flex; align-items:center }
  .kids { display:flex; flex-direction:column; gap:10px; position:relative; padding-left:32px }
  .kids::before { content:''; position:absolute; left:0; top:0; bottom:0; border-left:1.5px solid #d4d4d4 }
  .br { display:flex; align-items:center; position:relative }
  .br::before { content:''; position:absolute; left:-33px; top:50%; width:33px; border-top:1.5px solid #d4d4d4; z-index:1 }
  .br:first-child::after, .br:last-child::after { content:''; position:absolute; left:-34px; width:5px; background:#fff; z-index:0 }
  .br:first-child::after { top:0; height:50% } .br:last-child::after { top:50%; height:50% } .br:only-child::after { top:0; height:100% }
  .tree > .br::before, .tree > .br::after { display:none }
`
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><script src="./support.js"></script></head>
<body><x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;family=Noto+Sans+SC:wght@400;500;600&amp;display=swap"><style>${STYLE}</style></helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">${body}</div></x-dc></body></html>
`
const header = (eyebrow, title, sub) => `<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>`
const sec = (t, s = '') => `<div class="sec"><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ''}</div>`
const note = (n, q, a) => `<div style="margin-top:14px;display:grid;grid-template-columns:200px 1fr;border:1px solid oklch(0.85 0.08 85);border-radius:10px;overflow:hidden;background:#fff"><div style="padding:12px 14px;background:oklch(0.97 0.04 85);border-right:1px solid oklch(0.85 0.08 85)"><div style="${MONO}font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:oklch(0.45 0.1 85)">${esc(n)}</div><div style="margin-top:6px;font-size:13px;line-height:1.5;color:#404040">${esc(q)}</div></div><div style="padding:12px 14px;font-size:12.5px;line-height:1.6">${a.map((x) => `<div style="display:flex;gap:8px"><span style="color:#737373">·</span><span>${esc(x)}</span></div>`).join('')}</div></div>`

// icons (Phosphor-like simplified paths on 24 grid)
const I = {
  key: '<circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M16 4l3 3M13 7l3 3"/>',
  auto: '<path d="M4 17l4-10 4 10M6 14h4"/><path d="M14 7h6M17 7v10"/>',
  missing: '<circle cx="8" cy="14" r="4"/><path d="M11 11l9-9"/><path d="M15 3l6 6" stroke-dasharray="2 2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  caret: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  platform: '<path d="M4 8h16M4 12h16M4 16h16"/><circle cx="18" cy="6" r="2" fill="currentColor" stroke="none"/>',
}
const ic = (k, color = 'currentColor') => `<svg class="ic" viewBox="0 0 24 24" style="color:${color}">${I[k]}</svg>`

// ─── picker skeleton ───
const rows = [
  ['Seedance', '2.5', '$0.213 / s', 'auto', FG, true],
  ['Seedance', '2.0 Fast', '$0.11 / s', 'auto', FG, false],
  ['Kling', 'O3 Pro', '$0.168 / s', 'key', FG, false],
  ['Wan', '3.0 Prime', '$0.20 / s', 'key', FG, false],
  ['Veo', '3.1', '缺 key', 'missing', AMBER, false],
]
const CH = [['key', 'fal', '$0.473 / s · 有 key', false], ['key', '火山（国内）', '$0.213 / s · 有 key', false], ['missing', 'BytePlus（国际）', '$0.231 / s · 缺 key', false]]
const CH2 = [['fal', '$0.473 / s', GREEN, false], ['火山（国内）', '$0.213 / s', GREEN, true], ['BytePlus（国际）', '$0.231 / s', AMBER, false]]
const dotc = (c) => `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${c};flex:none"></span>`
const groupHead = (t) => `<div class="lab" style="margin:10px 10px 4px">${esc(t)}</div>`
const row = ([m, v, p, k, c, sel], opts = {}) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;background:${sel ? MUTEDBG : 'transparent'};position:relative">
  <div style="flex:1;min-width:0;display:flex;align-items:baseline;gap:8px"><span style="font-size:13px;font-weight:500">${esc(m)}</span><span style="font-size:13px;color:#525252">${esc(v)}</span></div>
  <span class="tok" style="color:${c === FG ? MUTED : c}">${esc(p)}</span>
  ${opts.rowIcon ? `<span style="width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:${c === FG ? MUTED : c};background:${opts.hoverOn && sel ? MUTEDBG : 'transparent'}">${ic(k, c === FG ? MUTED : c)}</span>` : ''}
  ${sel ? `<span style="color:${FG}">${ic('check')}</span>` : ''}
  ${opts.hoverOn && sel ? `<div style="position:absolute;right:-232px;top:-6px;width:216px;background:#fff;border:1px solid ${BORDER};border-radius:10px;box-shadow:${SH_FLOAT};padding:8px;font-size:12px;z-index:2">
     <div class="lab" style="margin:2px 6px 6px">渠道 · Seedance 2.5 有三条</div>
     ${CH.map(([kk, t, s, on]) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 6px;border-radius:6px;background:${on ? MUTEDBG : 'transparent'}">${ic(kk, kk === 'missing' ? AMBER : MUTED)}<span style="flex:1">${esc(t)}</span><span class="tok" style="color:${kk === 'missing' ? AMBER : MUTED}">${esc(s)}</span>${on ? ic('check') : ''}</div>`).join('')}
     <div style="height:1px;background:${BORDER};margin:6px"></div>
     <div style="padding:4px 6px;font-size:11.5px;color:${MUTED}">只有多渠道的型号行末才有图标；单渠道型号不画 · 点击固定 · 按型号记住</div>
   </div>` : ''}
</div>`
const picker = (body, footer = '') => `<div style="width:380px;background:#fff;border:1px solid ${BORDER};border-radius:12px;box-shadow:${SH_OVERLAY};padding:6px;position:relative">
  <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:${MUTEDBG};color:${MUTED};font-size:12.5px">${ic('search')}搜型号…</div>
  ${body}${footer}</div>`
const bodyRows = (opts) => groupHead('最近') + row(rows[0], opts) + row(rows[2], opts) + groupHead('Seedance') + row(rows[1], opts) + groupHead('Wan') + row(rows[3], opts) + groupHead('Veo') + row(rows[4], opts)

const optA = picker(bodyRows({ rowIcon: true, hoverOn: true }))
const optB = picker(bodyRows({ rowIcon: false }), `<div style="height:1px;background:${BORDER};margin:6px 8px"></div>
  <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:${MUTEDBG}">${ic('auto', MUTED)}<span style="font-size:12.5px;flex:1">渠道 · <b>自动 → 火山（国内）</b> <span style="color:${MUTED}">· $0.213 / s · fal / BytePlus 可切</span></span>${ic('caret', MUTED)}</div>
  <div style="position:absolute;left:6px;right:6px;bottom:-124px;background:#fff;border:1px solid ${BORDER};border-radius:10px;box-shadow:${SH_FLOAT};padding:6px;font-size:12px;z-index:2">
     ${CH.map(([kk, t, s, on]) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;background:${on ? MUTEDBG : 'transparent'}">${ic(kk, kk === 'missing' ? AMBER : MUTED)}<span style="flex:1">${esc(t)}</span><span class="tok" style="color:${kk === 'missing' ? AMBER : MUTED}">${esc(s)}</span>${on ? ic('check') : ''}</div>`).join('')}
     <div style="padding:4px 8px;font-size:11.5px;color:${MUTED}">点底栏展开 · 跟随当前高亮的型号；单渠道型号底栏只显「渠道 · fal」不可展开</div>
  </div>`)

// ─── 定案：A 无「自动」· 未选为空 · 记住上次 · 绿 / 黄点 ───
// owner 2026-09-17 亲手改的版本：行里不画点；渠道面板是弹层右侧独立一块，选中渠道 = --muted 底、无对勾
const rowF = ([m, v], { price = '', sel = false }) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;background:${sel ? MUTEDBG : 'transparent'}">
  <div style="flex:1;min-width:0;display:flex;align-items:baseline;gap:8px"><span style="font-size:13px;font-weight:500">${esc(m)}</span><span style="font-size:13px;color:#525252">${esc(v)}</span></div>
  <span class="tok" style="color:${price ? MUTED : '#c4c4c4'}">${esc(price || '—')}</span>
  ${sel ? `<span style="color:${FG}">${ic('check')}</span>` : ''}
</div>`
const channelPanel = (top = 82) => `<div style="position:absolute;top:${top}px;left:422px;width:190px;background:#fff;border:1px solid ${BORDER};border-radius:10px;box-shadow:${SH_FLOAT};padding:6px;font-size:12.5px;z-index:2">
     ${CH2.map(([t, p, c, on]) => `<div style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;background:${on ? MUTEDBG : 'transparent'}">${dotc(c)}<span style="flex:1">${esc(t)}</span><span class="tok" style="color:${MUTED}">${esc(p)}</span></div>`).join('')}
   </div>`
const pickerF = `<div style="width:380px;background:#fff;border:1px solid ${BORDER};border-radius:12px;box-shadow:${SH_OVERLAY};padding:6px;position:relative">
  <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:${MUTEDBG};color:${MUTED};font-size:12.5px">${ic('search')}搜型号…</div>
  ${groupHead('最近')}
  ${rowF(['Seedance', '2.5'], { price: '$0.213 / s', sel: true })}
  ${rowF(['Kling', 'O3 Pro'], { price: '$0.168 / s' })}
  ${groupHead('Seedance')}
  ${rowF(['Seedance', '2.0 Fast'], { price: '' })}
  ${groupHead('Wan')}
  ${rowF(['Wan', '3.0 Prime'], { price: '$0.20 / s' })}
  ${groupHead('Veo')}
  ${rowF(['Veo', '3.1'], { price: '' })}
</div>`
const FINAL = header('PixelVault · D2 · Q1 定案（owner 调整版）· 2026-09-17', '渠道 = A · 无「自动」· 未选为空 · 记住上次 · 绿 / 黄点只在渠道面板', 'owner 拍板并亲手调整：行只有 模型 · 型号 · 价格；渠道面板独立浮在弹层右侧、与当前行对齐；面板里每条渠道一颗绿 / 黄点 + 名 + 价，选中用底色不用对勾；没选过就是空价；选过按型号记住。这版是 ④ 的输入。') +
  `<div style="display:flex;gap:28px;margin-top:14px;align-items:flex-start">
    <div style="background:${WORKBENCH};border-radius:16px;padding:22px 240px 22px 22px;position:relative">${pickerF}${channelPanel(82)}</div>
    <div style="font-size:12.5px;line-height:1.75;color:#525252;max-width:420px">
      <div style="font-weight:600;color:${FG};margin-bottom:4px">行</div>
      · 模型 · 型号 · 价格，三件（owner 亲手改：行里不画点）。价格 = 已选渠道的单价；没选过就是「—」。<br>
      · Seedance 2.0 Fast 与 Veo 3.1 是「没选过」的样子：价格空。<br>
      <div style="font-weight:600;color:${FG};margin:12px 0 4px">hover / 点行末</div>
      · 渠道面板在弹层右侧独立一块，与当前行对齐：${dotc(GREEN)} 有 key · ${dotc(AMBER)} 无 key，名 · 价，没有「自动」，没有对勾——选中的那条用 --muted 底表示。<br>
      · 选一条 → 该型号记住（按型号存，跨会话），行价格位立刻换成这条的价。<br>
      · 黄点渠道可点，点了弹面 1 配 key；配好变绿并自动成为该型号的选择。<br>
      <div style="font-weight:600;color:${FG};margin:12px 0 4px">代价（要你知道）</div>
      · 没选渠道的多渠道型号不能生成：生成按钮文案变「先选渠道」，点了打开这行的渠道列表。<br>
      · 方案 ① 的「自动 = 最便宜」与「上次选的 X 已不可用，已回到自动」两条随「自动」一起删；key 失效时该渠道点变黄、价格位清空，回到「没选」。<br>
      · 手机：行末点区可点，渠道列表从底部 Sheet 出。
    </div>
  </div>`

const cmp = (title, mock, pros, cons, extraH = 0) => `<div style="flex:1;min-width:560px">
  <div style="font-size:14px;font-weight:600;margin-bottom:8px">${esc(title)}</div>
  <div style="background:${WORKBENCH};border-radius:16px;padding:22px 22px ${22 + extraH}px;display:flex;justify-content:flex-start">${mock}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;font-size:12px;line-height:1.55">
    <div><div style="color:${GREEN};font-weight:600;margin-bottom:4px">好在</div>${pros.map((x) => `<div>· ${esc(x)}</div>`).join('')}</div>
    <div><div style="color:${RED};font-weight:600;margin-bottom:4px">代价</div>${cons.map((x) => `<div>· ${esc(x)}</div>`).join('')}</div>
  </div></div>`

const Q1 = header('PixelVault · D2 · ① 反问 Q1 对照（重画）· 2026-09-17', '渠道放哪：A 行末图标 + hover · B 弹层底栏常驻', '按你 2026-09-17 的更正重画：没有「平台额度」这一档，全部用自己的 key（只有 Gemini 走平台 key，自动配置，不在这个选择器里出现）。「渠道」= 同一型号的多条供应路径，例子是 Seedance 2.5 的 fal / 火山（国内）/ BytePlus（国际）；自动 = 你有 key 的渠道里最便宜的一条。行仍只有 模型 · 型号 · 价格，价格显示的是自动选中渠道的单价。') +
  `<div style="display:flex;gap:28px;margin-top:14px;flex-wrap:wrap">
    ${cmp('A · 多渠道型号行末一枚小图标，hover 出三条渠道', optA, ['一眼看出哪些型号有多条渠道（只有它们才有图标）', '不占弹层高度；单渠道型号的行仍是干净三件', '缺 key 的渠道在浮层里直接是入口，点了弹面 1 配置'], ['多渠道行是四件、单渠道行是三件，两种密度混排', '手机没有 hover，要改成点图标；浮层靠右溢出要处理', '渠道价格差（fal $0.473 vs 火山 $0.213）藏在 hover 里，不 hover 看不到'])}
    ${cmp('B · 弹层底部一行常驻「渠道」，点开切换', optB, ['行严格只剩三件，所有型号同一密度', '渠道跟随当前高亮型号：高亮 Seedance 2.5 就显它的三条，高亮 Kling 就显「fal」不可展开', '手机同构：底栏就是 Sheet 的最后一行'], ['要高亮到那一行才知道它有几条渠道', '弹层多一行 40px', '渠道与型号分两处，新手可能不知道它们是一对'], 130)}
  </div>` +
  note('我的建议', 'B 为主，借 A 的一点：', ['多渠道的型号在目录里只有 Seedance 2.5 / 2.0 与 Seedream 5.0 这几条，其余全是单渠道；为少数几行加一列图标（A）不划算，B 的底栏对单渠道型号退化成一行只读文字，两种情况同一形态。', '底栏跟随高亮型号变，就是「渠道属于这条型号」的提示；价格位显示自动选中渠道的单价，切渠道价格位跟着变。', '缺 key：某条渠道缺 key 在底栏展开里标 warning 色并可点去配置；全部渠道都缺 key 的型号，行的价格位写「缺 key」。', '「平台额度」档从所有画板与代码里删（见进度表新增条目）。'])

// ─── D2 mind map ───
const accent = (h, l = 0.45, c = 0.11) => `oklch(${l} ${c} ${h})`
const tint = (h) => `oklch(0.965 0.022 ${h})`, tintBorder = (h) => `oklch(0.88 0.05 ${h})`, tintText = (h) => `oklch(0.38 0.11 ${h})`
const dot = (c) => `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${c};margin-right:8px;flex:none;vertical-align:1px"></span>`
function node(n, hue) {
  if (n.k === 'root') return `<div style="background:${accent(hue)};color:#fff;font-size:22px;font-weight:600;padding:14px 22px;border-radius:12px;white-space:nowrap;flex:none">${esc(n.t)}</div>`
  if (n.k === 'cat') return `<div style="background:${tint(hue)};color:${tintText(hue)};border:1px solid ${tintBorder(hue)};font-size:14px;font-weight:600;padding:8px 14px;border-radius:8px;white-space:nowrap;flex:none">${esc(n.t)}</div>`
  if (n.k === 'sub') return `<div style="background:#fff;border:1px solid ${BORDER};font-size:13px;font-weight:500;line-height:1.45;padding:7px 12px;border-radius:8px;max-width:240px;flex:none">${esc(n.t)}</div>`
  const pre = n.s === 'gap' ? dot(RED) : n.s === 'open' ? dot(AMBER) : ''
  const border = n.s === 'open' ? `border:1px dashed ${AMBER}99;background:#fff;` : `background:#f5f5f5;`
  return `<div style="display:flex;align-items:baseline;${border}font-size:13px;line-height:1.5;padding:6px 10px;border-radius:6px;max-width:${n.w ?? 520}px;flex:none">${pre}<span>${esc(n.t)}</span></div>`
}
const branch = (n, hue) => `<div class="br">${node(n, hue)}${n.c?.length ? `<div class="kids">${n.c.map((c) => branch(c, hue)).join('')}</div>` : ''}</div>`
const tree = (root, hue) => `<div class="tree" style="margin-top:20px">${branch(root, hue)}</div>`

const D2 = {
  k: 'root', t: 'D2 · 选模型 → 填参数 → 定规格',
  c: [
    { k: 'cat', t: '目标', c: [
      { k: 'leaf', t: '工作台与画布共用同一个选择器、同一套表单规则、同一颗规格 chip；8 套选择器 → 1，4 份规格弹层 → 1' },
      { k: 'leaf', t: '用户在选之前就知道：这条模型多少钱、能不能用（key）；选之后表单自己变，不用翻文档' },
    ] },
    { k: 'cat', t: '决策（① 已答）', c: [
      { k: 'leaf', t: 'Q2 = A 专属能力不进选择器；选中后表单第二行直接出现专属 chip 行' },
      { k: 'leaf', t: 'Q3 = A 按厂商分组 + 顶部「最近 3」+ 搜索（方向 A 原样）' },
      { k: 'leaf', t: 'Q4 = A 规格 chip 全量摘要「1:1 · 2K · 5s」，点开一颗弹层三段 + 更多折叠' },
      { k: 'leaf', t: 'Q5 = A 手机：选择器与规格都用底部 Sheet（现状形态），内容与桌面同构' },
      { k: 'leaf', t: 'Q1 = A（owner 调整版）：行只三件不画点；hover / 点行 → 弹层右侧独立渠道面板（绿 / 黄点 + 名 + 价，选中用底色）；删「自动」；未选为空、不可生成（按钮「先选渠道」）；按型号记住上次' },
      { k: 'leaf', t: 'owner 更正：没有「平台额度」档；全部自己的 key，只有 Gemini 走平台 key 自动配置且不进选择器。resolveModelChannel 的 userKey › freeQuota › cheapest 收成 userKey › cheapest（进度表新增 60）' },
    ] },
    { k: 'cat', t: '选择器（10）', c: [
      { k: 'sub', t: '行', c: [ { k: 'leaf', t: '模型 · 型号 · 价格 三件（批注 32）；价格位在缺 key 时写「缺 key」并用 warning 色；选中态 --muted 底 + 对勾' } ] },
      { k: 'sub', t: '结构', c: [ { k: 'leaf', t: '搜索框 → 最近 ≤3 → 按厂商分组（GPT Image · Gemini · FLUX · Seedream · NAI · Runner）；画布多一层「本项目常用」可选' }, { k: 'leaf', t: '渠道：面板在弹层右侧，每条渠道一颗绿 / 黄点 + 价；多渠道型号必须选一条才能生成，选择按型号记住；key 失效 → 点变黄、价格清空、回到未选；没有「自动」；单渠道型号面板只有一行' } ] },
      { k: 'sub', t: '宿主', c: [ { k: 'leaf', t: '工作台参数栏触发器 · 画布 NodeModelChip · 助手模型 chip · 配音间模型 chip · LoRA 底模弹窗 → 全走同一 Popover / Sheet；只换触发器外观' } ] },
      { k: 'sub', t: '删', c: [ { k: 'leaf', s: 'gap', t: 'BaseModelPickerPanel（三层钻取）· business/ModelSelector（零消费者）· StudioMobileModelSheet 独立实现 → 合进同一个 ResponsivePopover' } ] },
    ] },
    { k: 'cat', t: '能力驱动表单（11）', c: [
      { k: 'sub', t: '两区', c: [ { k: 'leaf', t: '通用区固定顺序：提示词 · 参考轨 · 规格 chip · 张数；任何模型都在同一位置' }, { k: 'leaf', t: '专属区 = 第二行 chip：GPT（透明底 · 输入保真）· Gemini（对话式改图）· FLUX（多参考）· Seedream（组图 · 图层）· NAI（质量标签 · UC · 多人）；没有专属的模型不出现这一行' } ] },
      { k: 'sub', t: '切模型', c: [ { k: 'leaf', t: '通用区值保留；专属区整组换；不兼容的值静默回默认，不提示不撤销（批注 36）' }, { k: 'leaf', t: '参考轨按模型上限裁剪（Seedream 10 · FLUX 多；NAI 另设计）：多出的灰显不删' } ] },
      { k: 'sub', t: '来源', c: [ { k: 'leaf', t: '全部从 provider-capabilities 派生，UI 不写死任何模型名；虚标已在 02 / 02b 清干净，所以能派生出来的都真发' } ] },
    ] },
    { k: 'cat', t: '规格 chip（12）', c: [
      { k: 'leaf', t: '一颗 chip 显「比例 · 清晰度 · 时长（视频）」摘要；点开弹层三段 + 「更多」折叠（声音 · seed · 张数 · 格式 · 采样率）' },
      { k: 'leaf', t: '档位从 capabilities 派生；模型换了档跟着换；非法组合回默认并在 chip 上闪一次' },
      { k: 'leaf', t: '灰显档 hover 看原因；档旁显单价差（有核实价才显）；chip 上不显价' },
      { k: 'leaf', t: '画布提示词栏因此只剩 模型 chip + 规格 chip（+ 参考轨），§5「chip ≤3」改为 ≤2' },
    ] },
    { k: 'cat', t: '④ UI 画板要出的', c: [
      { k: 'leaf', t: '选择器：桌面 Popover 三态（默认 / hover / 缺 key）+ 手机 Sheet + 可点原型（切型号看底栏 / 图标变）' },
      { k: 'leaf', t: '表单：图片工作台 × 四家模型的专属行各一版 + 切模型帧；NAI 单独设计（批注 37）· Runner 归 LoRA（批注 38）' },
      { k: 'leaf', t: '规格：chip 三态 + 弹层（图片 / 视频两版）+ 手机 Sheet' },
    ] },
  ],
}
const MAP = header('PixelVault · D2 · ② 思维导图 · 2026-09-17', 'D2 决策树 · Q1–Q5 全部已定', '① 五题全答完：Q1 = A 无自动 · 绿黄点 · 记住上次；Q2–Q5 = A。这棵树就是 ③ 要你确认的东西：没有红点或批注，我就进 ④ 出实际尺寸画板（选择器三态 + 手机 Sheet + 可点原型 · 五家专属行 · 规格 chip 与弹层）。') + tree(D2, 255)

for (const [name, html] of [
  ['DesignD2Q1.dc.html', page('D2 Q1 对照', Q1)],
  ['DesignD2Q1Final.dc.html', page('D2 Q1 定案', FINAL)],
  ['DesignD2Map.dc.html', page('D2 思维导图', MAP)],
]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
