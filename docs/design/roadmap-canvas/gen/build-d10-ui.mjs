// D10 · ④ UI 画板：标签台整页 + 角色构图 / 多选交集 / 两台切换 / 手机
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const FG = 'oklch(14.5% 0 0)', MUTED = '#737373', BORDER = 'oklch(92.2% 0 0)', MUTEDBG = 'oklch(97% 0 0)', SUNKEN = '#ebebeb', WORKBENCH = '#f4f4f1', AMBER = '#a04f00'
const SH_CARD = '0 1px 2px rgb(0 0 0 / 0.04), 0 12px 32px -16px rgb(0 0 0 / 0.24)'

const STYLE = `
  body { margin:0; background:#fff; color:${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing:antialiased; }
  h1 { margin:8px 0 0; font-size:26px; font-weight:600; letter-spacing:-.01em; line-height:1.2 }
  .eyebrow { ${MONO} font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:${MUTED} }
  .sub { margin:8px 0 0; font-size:14px; line-height:1.6; color:#525252; max-width:1000px }
  .sec { margin-top:30px; display:flex; align-items:baseline; gap:12px } .sec b { font-size:16px; font-weight:600 } .sec span { font-size:12px; color:${MUTED} }
  .tok { ${MONO} font-size:10.5px; color:#525252 }
  .cap { margin-top:10px; font-size:12px; line-height:1.55; color:#525252; max-width:620px }
  svg.ic { stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; display:block; flex:none }
`
const I = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  chev: '<path d="m6 9 6 6 6-6"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', plus: '<path d="M5 12h14M12 5v14"/>',
  img: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
}
const ic = (k, color = 'currentColor', s = 14) => `<svg class="ic" viewBox="0 0 24 24" style="color:${color};width:${s}px;height:${s}px">${I[k]}</svg>`
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><script src="./support.js"></script></head>
<body><x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;display=swap"><style>${STYLE}</style></helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">${body}</div></x-dc></body></html>
`
const header = (eyebrow, title, sub) => `<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>`
const sec = (t, s = '') => `<div class="sec"><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ''}</div>`
const cap = (t) => `<div class="cap">${t}</div>`
const frame = (inner, bg = WORKBENCH, pad = 20) => `<div style="background:${bg};border-radius:16px;padding:${pad}px;display:inline-block;vertical-align:top">${inner}</div>`
const state = (title, inner, note = '', w = 340) => `<div style="display:inline-block;vertical-align:top;margin:0 24px 24px 0;max-width:${w}px"><div style="font-size:13px;font-weight:600;margin-bottom:8px">${esc(title)}</div>${inner}${note ? `<div class="cap" style="max-width:${w}px">${note}</div>` : ''}</div>`

// ── 零件 ──
const tag = (t, { neg = false, w = null } = {}) => `<span style="display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px;border-radius:6px;background:#fff;border:1px solid ${BORDER};font-size:11.5px;white-space:nowrap">${esc(t)}${w ? `<span class="tok" style="font-size:9.5px;color:${MUTED}">${esc(w)}</span>` : ''}<span style="color:#c4c4c0">${ic('x', '#c4c4c0', 10)}</span></span>`
const tagField = (label, tags, hint) => `<div style="display:flex;flex-direction:column;gap:6px">
  <div style="display:flex;align-items:baseline;justify-content:space-between"><span style="font-size:11.5px;font-weight:600">${esc(label)}</span><span class="tok" style="font-size:9.5px;color:${MUTED}">${esc(hint)}</span></div>
  <div style="min-height:72px;border:1px solid ${BORDER};border-radius:10px;background:#fff;padding:8px;display:flex;flex-wrap:wrap;gap:5px;align-content:flex-start">${tags}<span style="font-size:11.5px;color:#c4c4c0;padding:4px 2px">输入标签，逗号分隔…</span></div></div>`
const chipRow = (label, opts, active = 0) => `<div style="display:flex;flex-direction:column;gap:5px"><span style="font-size:11px;color:${MUTED}">${esc(label)}</span><div style="display:flex;flex-wrap:wrap;gap:4px">${opts.map((o, i) => `<span style="padding:4px 9px;border-radius:999px;font-size:11px;border:1px solid ${i === active ? FG : BORDER};background:#fff">${esc(o)}</span>`).join('')}</div></div>`
const ctrl = (label, body, { dim = false, note = '' } = {}) => `<div style="display:flex;flex-direction:column;gap:6px;padding:10px;border:1px solid ${BORDER};border-radius:10px;background:#fff;${dim ? 'opacity:.45;' : ''}">
  <div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:11.5px;font-weight:600">${esc(label)}</span>${note ? `<span class="tok" style="font-size:9px;color:${AMBER}">${esc(note)}</span>` : ''}</div>${body}</div>`

const charGrid = (mode) => mode === 'v5'
  ? `<div style="position:relative;width:100%;aspect-ratio:16/10;border:1px dashed ${BORDER};border-radius:8px;background:${MUTEDBG}">${[[22, 55], [50, 40], [74, 62]].map((p, i) => `<span style="position:absolute;left:${p[0]}%;top:${p[1]}%;transform:translate(-50%,-50%);width:26px;height:26px;border-radius:50%;background:#fff;border:1px solid ${FG};display:flex;align-items:center;justify-content:center;${MONO}font-size:9px">${i + 1}</span>`).join('')}</div>`
  : `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:2px;width:100%;aspect-ratio:1">${Array.from({ length: 25 }).map((_, i) => `<span style="border:1px solid ${BORDER};border-radius:3px;background:${[6, 12, 18].includes(i) ? FG : '#fff'};display:flex;align-items:center;justify-content:center;${MONO}font-size:8px;color:#fff">${[6, 12, 18].indexOf(i) >= 0 ? [6, 12, 18].indexOf(i) + 1 : ''}</span>`).join('')}</div>`

const rightCol = ({ dimSpecials = false, mode = 'v5' } = {}) => `<div style="width:272px;flex:none;display:flex;flex-direction:column;gap:8px">
  ${ctrl('角色构图', `<div style="display:flex;flex-direction:column;gap:6px">${charGrid(mode)}<div style="display:flex;gap:4px">${['① 少女', '② 男友', '+ 加人'].map((t, i) => `<span style="padding:3px 8px;border-radius:6px;font-size:10.5px;border:1px ${i === 2 ? 'dashed' : 'solid'} ${BORDER};background:#fff;color:${i === 2 ? MUTED : FG}">${t}</span>`).join('')}</div><span class="tok" style="font-size:9px;color:${MUTED}">${mode === 'v5' ? 'V5 · 自由定位 · 至多 22 人' : 'V4.5 · 5×5 网格 · 至多 6 人'}</span></div>`, { dim: dimSpecials, note: dimSpecials ? '只对 NAI V5 生效' : '' })}
  ${ctrl('质量标签', chipRow('', ['关', 'Light', 'Standard'], 2), { dim: dimSpecials, note: dimSpecials ? '只对 NAI 生效' : '' })}
  ${ctrl('采样器 · 步数', `<div style="display:flex;gap:6px"><span style="flex:1;padding:5px 8px;border:1px solid ${BORDER};border-radius:6px;font-size:11px;display:flex;justify-content:space-between">k_euler_a${ic('chev', MUTED, 12)}</span><span style="width:54px;padding:5px 8px;border:1px solid ${BORDER};border-radius:6px;font-size:11px;text-align:center">28</span></div>`)}
  ${ctrl('分辩率 · 额度', `<div style="display:flex;align-items:center;justify-content:space-between;font-size:11px"><span>1024×1024</span><span class="tok" style="font-size:10px">约 28 Anlas</span></div>`, { dim: dimSpecials, note: dimSpecials ? '只对 NAI 生效' : '' })}
  ${ctrl('参考图用法', `<div style="display:flex;gap:4px">${['普通参考', 'Vibe', '精确参考'].map((t, i) => `<span style="padding:4px 8px;border-radius:999px;font-size:10.5px;border:1px solid ${i === 0 ? FG : BORDER};background:#fff;${i === 2 ? 'opacity:.45;' : ''}">${t}</span>`).join('')}</div><span class="tok" style="font-size:9px;color:${MUTED}">精确参考只有 V4.5 有</span>`)}
</div>`

const shell = (main, { w = 1180, h = 640 } = {}) => `<div style="width:${w}px;height:${h}px;background:${SUNKEN};border-radius:14px;display:flex;overflow:hidden;box-shadow:${SH_CARD}">
  <div style="width:44px;flex:none;background:#fff;border-right:1px solid ${BORDER};padding:10px 0;display:flex;flex-direction:column;align-items:center;gap:12px">${Array.from({ length: 6 }).map((_, i) => `<span style="width:18px;height:18px;border-radius:5px;background:${i === 1 ? FG : '#e4e4e0'}"></span>`).join('')}</div>
  ${main}</div>`

const segmented = (active) => `<div style="display:inline-flex;padding:2px;border-radius:999px;background:${MUTEDBG};border:1px solid ${BORDER}">${['自然语言', '标签'].map((t, i) => `<span style="padding:4px 14px;border-radius:999px;font-size:11.5px;${i === active ? `background:#fff;font-weight:600;box-shadow:0 1px 2px rgb(0 0 0 / .08)` : `color:${MUTED}`}">${t}</span>`).join('')}</div>`

const modelChip = (t, extra = '') => `<span style="display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;border:1px solid ${BORDER};background:#fff;font-size:11.5px">${ic('img', MUTED, 12)}${esc(t)}${extra}</span>`

const editorCol = ({ multi = false } = {}) => `<div style="width:420px;flex:none;display:flex;flex-direction:column;gap:10px">
  <div style="display:flex;align-items:center;gap:8px">${segmented(1)}<span style="flex:1"></span>${multi ? modelChip('NAI V5 Full · PixAI Tsubaki.2', `<span class="tok" style="font-size:9.5px;color:${MUTED}">2</span>`) : modelChip('NovelAI Diffusion V5 Full')}</div>
  ${tagField('正向标签', [tag('1girl'), tag('masterpiece'), tag('rain', { w: '×1.2' }), tag('neon city'), tag('backlit'), tag('school uniform')].join(''), '18 个 · 逗号分隔')}
  ${tagField('负向 · UC', [tag('bad hands'), tag('blurry')].join(''), 'NAI 叫 UC')}
  ${chipRow('UC 预设', ['无', 'Light', 'Heavy', 'Furry', 'Human'], 1)}
  <div style="display:flex;flex-direction:column;gap:5px"><span style="font-size:11px;color:${MUTED}">Text: 文字渲染</span><div style="border:1px solid ${BORDER};border-radius:8px;background:#fff;padding:6px 9px;font-size:11.5px;color:#c4c4c0">写在画面里的字…<span class="tok" style="float:right;font-size:9.5px">0 / 750</span></div></div>
  <div style="display:flex;gap:6px;align-items:center;margin-top:2px"><span style="flex:1;height:34px;border-radius:999px;background:${FG};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:500">出图</span></div>
</div>`

const resultCol = (note = '') => `<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px">
  ${note ? `<div style="display:flex;align-items:center;gap:7px;padding:7px 10px;border-radius:8px;background:#fff;border:1px solid ${BORDER};font-size:11px;color:#525252">${ic('info', MUTED, 12)}${esc(note)}</div>` : ''}
  <div style="flex:1;border-radius:10px;background:#fff;border:1px solid ${BORDER};display:flex;align-items:center;justify-content:center;color:#c4c4c0;font-size:12px">结果区 · 与自然语言台同一块</div></div>`

const body = (inner) => `<div style="flex:1;padding:14px;display:flex;gap:12px;min-width:0">${inner}</div>`

const PAGE = shell(body(`${editorCol()}${rightCol()}${resultCol()}`))
const MULTI = shell(body(`${editorCol({ multi: true })}${rightCol({ dimSpecials: true })}${resultCol('PixAI 不收参考图，挂着的 3 张只发给 NAI')}`), { h: 640 })

const BOARD1 = header('PixelVault · D10 · ④ UI 画板 · 2026-09-20', '标签台 image/tags · 整页', '② 已定：按提示词方言分两台，标签台以标签编辑器为中心。壳 · 结果区 · 参考轨 · 助手与自然语言台共用，只有中间这两列是标签台自己的。')
  + sec('默认态', '1180 × 640 · 编辑器 420 + 控件列 272 + 结果区')
  + frame(PAGE)
  + cap('顶部一对分段切换（自然语言 · 标签）是两台之间唯一的门；右边模型 chip 只列标签方言的型号。编辑器主区从上到下：正向标签 → 负向 / UC → UC 预设一排 → Text: 文字渲染 → 出图。权重在 chip 上显示成统一的 <b>×1.2</b>，落 payload 时按 provider 翻成 <b>{tag}</b> 或 <b>(tag:1.2)</b>。右列控件仍从 capabilities 派生（11），只是排版从 chip 行换成常驻卡片；助手的 set_capability 自动覆盖它们。')

const BOARD2 = header('PixelVault · D10 · ④ UI 画板 · 2026-09-20', '角色构图 · 多选交集 · 两台跳转 · 手机', '')
  + sec('角色构图两种形态', '按模型能力切，⛔ 不给用户选')
  + state('V5 · 自由定位（≤22 人）', frame(`<div style="width:272px">${ctrl('角色构图', `<div style="display:flex;flex-direction:column;gap:6px">${charGrid('v5')}<div style="display:flex;gap:4px">${['① 少女', '② 男友', '③ 路人', '+ 加人'].map((t, i) => `<span style="padding:3px 8px;border-radius:6px;font-size:10.5px;border:1px ${i === 3 ? 'dashed' : 'solid'} ${BORDER};background:#fff;color:${i === 3 ? MUTED : FG}">${t}</span>`).join('')}</div></div>`)}</div>`), '拖圆点定位，每个角色有自己的正负标签。选中某个角色时，编辑器主区切到那个角色的标签。')
  + state('V4.5 · 5×5 网格（≤6 人）', frame(`<div style="width:272px">${ctrl('角色构图', `<div style="display:flex;flex-direction:column;gap:6px">${charGrid('v45')}<div style="display:flex;gap:4px">${['① 少女', '② 男友', '+ 加人'].map((t, i) => `<span style="padding:3px 8px;border-radius:6px;font-size:10.5px;border:1px ${i === 2 ? 'dashed' : 'solid'} ${BORDER};background:#fff;color:${i === 2 ? MUTED : FG}">${t}</span>`).join('')}</div></div>`)}</div>`), '同一块控件换一种落位方式，⛔ 不做两个组件。')
  + sec('台内多选 · 取交集', '不跨方言，所以这里只会是标签模型之间')
  + frame(MULTI)
  + cap('选了 NAI V5 + PixAI Tsubaki.2：两家都支持的（标签 · 负向 · 采样器）留着可改；只有一家支持的灰掉并标「只对 NAI 生效」，<b>仍然可改</b>，出图时按各自能力裁剪 payload。参考图那条横幅说清楚它只会发给谁，⛔ 不禁用参考轨。')
  + sec('两台跳转 · 手机', '')
  + state('在自然语言台选到标签模型', frame(`<div style="width:420px;background:#fff;border:1px solid ${BORDER};border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px">${segmented(0)}<div style="border:1px solid ${BORDER};border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:5px;font-size:11.5px"><span class="tok" style="font-size:9.5px;color:${MUTED}">NOVELAI</span><span style="padding:5px 7px;border-radius:6px;background:${MUTEDBG}">Diffusion V5 Full</span></div><div style="display:flex;align-items:center;gap:7px;padding:7px 9px;border-radius:8px;background:${MUTEDBG};font-size:11px;color:#525252">${ic('info', MUTED, 12)}这是标签模型，带你去标签台 →</div></div>`), '两台的选择器各只列自己方言的模型；真要在这台搜到对面的型号，给一行「带你过去」，点了连同已填的提示词一起带走（标签台会把整句放进正向栏第一行，⛔ 不自动切成标签）。')
  + state('手机 375', frame(`<div style="width:375px;height:520px;background:#fff;border:1px solid ${BORDER};border-radius:24px;overflow:hidden;display:flex;flex-direction:column"><div style="height:36px"></div><div style="padding:0 14px 10px;display:flex;align-items:center;gap:8px">${segmented(1)}</div><div style="height:1px;background:${BORDER}"></div><div style="flex:1;padding:12px 14px;display:flex;flex-direction:column;gap:10px">${tagField('正向标签', [tag('1girl'), tag('rain', { w: '×1.2' }), tag('neon city')].join(''), '12 个')}${chipRow('UC 预设', ['无', 'Light', 'Heavy'], 1)}<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 10px;border:1px solid ${BORDER};border-radius:10px;font-size:11.5px"><span>角色构图 · 2 人</span>${ic('chev', MUTED, 14)}</div><div style="display:flex;align-items:center;justify-content:space-between;padding:9px 10px;border:1px solid ${BORDER};border-radius:10px;font-size:11.5px"><span>采样器 · 分辩率</span>${ic('chev', MUTED, 14)}</div></div><div style="padding:10px 14px 16px"><span style="display:flex;height:40px;border-radius:999px;background:${FG};color:#fff;align-items:center;justify-content:center;font-size:13px;font-weight:500">出图</span></div></div>`, WORKBENCH, 14), '手机上右列折成两行可展开的条目，编辑器与 UC 预设常驻 —— 那两样是每次都要动的。角色构图展开是整屏，网格才点得准。')

for (const [name, html] of [['DesignD10Page.dc.html', page('D10 ④ 标签台整页', BOARD1)], ['DesignD10States.dc.html', page('D10 ④ 状态', BOARD2)]]) {
  writeFileSync(join(OUT, name), html)
  console.log('wrote', name)
}
