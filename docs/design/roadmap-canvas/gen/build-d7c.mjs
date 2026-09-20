// D7c · ④ 助手壳：头部 · 历史下拉 · 空态 · 输入区 · 动效表
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const FG = 'oklch(14.5% 0 0)', MUTED = '#737373', FAINT = '#a3a3a3', BORDER = 'oklch(92.2% 0 0)', MUTEDBG = 'oklch(97% 0 0)', PAGE = '#f4f4f1', AMBER = '#a04f00', RISK = '#b3261e'
const SH_MENU = '0 1px 2px rgb(0 0 0 / 0.04), 0 16px 40px -18px rgb(0 0 0 / 0.28)'
const SH_PANEL = '0 1px 2px rgb(0 0 0 / 0.04), 0 12px 32px -16px rgb(0 0 0 / 0.20)'

const STYLE = `
  body { margin:0; background:#fff; color:${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing:antialiased; }
  h1 { margin:8px 0 0; font-size:26px; font-weight:600; letter-spacing:-.01em; line-height:1.2 }
  .eyebrow { ${MONO} font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:${MUTED} }
  .sub { margin:8px 0 0; font-size:14px; line-height:1.6; color:#525252; max-width:1000px }
  .sec { margin-top:30px; display:flex; align-items:baseline; gap:12px } .sec b { font-size:16px; font-weight:600 } .sec span { font-size:12px; color:${MUTED} }
  .cap { margin-top:10px; font-size:12px; line-height:1.55; color:#525252 }
  svg.ic { stroke:currentColor; fill:none; stroke-width:1.9; stroke-linecap:round; stroke-linejoin:round; display:block; flex:none }
  table { border-collapse:collapse; font-size:12px }
  th,td { border-bottom:1px solid ${BORDER}; padding:7px 14px 7px 0; text-align:left; vertical-align:top }
  th { font-size:11px; color:${MUTED}; font-weight:500; text-transform:uppercase; letter-spacing:.05em }
`
const I = {
  chev: '<path d="m6 9 6 6 6-6"/>', dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  pen: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/>', trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  img: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.4"/><path d="M21 16l-5-5-8 8"/>',
  plus: '<path d="M5 12h14M12 5v14"/>', clip: '<path d="M20 11 11 20a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>', spark: '<path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/>',
}
const ic = (k, color = 'currentColor', s = 14) => `<svg class="ic" viewBox="0 0 24 24" style="color:${color};width:${s}px;height:${s}px">${I[k]}</svg>`
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><script src="./support.js"></script></head>
<body><x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;display=swap"><style>${STYLE}</style></helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">${body}</div></x-dc></body></html>
`
const header = (eyebrow, title, sub) => `<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>`
const sec = (t, s = '') => `<div class="sec"><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ''}</div>`
const frame = (inner, bg = PAGE, pad = 18) => `<div style="background:${bg};border-radius:14px;padding:${pad}px;display:inline-block;vertical-align:top">${inner}</div>`
const state = (title, inner, note = '', w = 360) => `<div style="display:inline-block;vertical-align:top;margin:0 22px 22px 0;max-width:${w}px"><div style="font-size:13px;font-weight:600;margin-bottom:8px">${esc(title)}</div>${inner}${note ? `<div class="cap" style="max-width:${w}px">${note}</div>` : ''}</div>`
const avatar = (s = 28) => `<span style="width:${s}px;height:${s}px;border-radius:50%;flex:none;background:radial-gradient(120% 120% at 30% 20%, #cfc3e6 0%, #a898cc 45%, #e6dcc9 100%);display:block"></span>`

// ── 头部 ──
const headerBar = ({ before = false } = {}) => `<div style="width:520px;background:#fff;border:1px solid ${BORDER};border-radius:12px 12px 0 0;padding:8px 10px;display:flex;align-items:center;gap:8px;height:44px;box-sizing:border-box">
  ${avatar(28)}
  ${before ? `<span style="display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;border-radius:999px;background:${MUTEDBG};font-size:12px;color:#525252">${ic('img', MUTED, 13)}未选模型 · 1:1 · 1 张</span>` : ''}
  <span style="display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 8px 0 10px;border-radius:8px;background:${before ? MUTEDBG : 'transparent'};font-size:13.5px;font-weight:500">新对话${ic('chev', MUTED, 14)}</span>
  <span style="flex:1"></span>
  <span style="display:grid;place-items:center;width:28px;height:28px;border-radius:8px;color:${MUTED}">${ic('dots', MUTED, 16)}</span>
</div>`

// ── 历史下拉 ──
const menuShell = (inner, h = null) => `<div style="width:300px;${h ? `height:${h}px;` : ''}background:#fff;border:1px solid ${BORDER};border-radius:12px;box-shadow:${SH_MENU};padding:5px;box-sizing:border-box">${inner}</div>`
const menuLabel = (t) => `<div style="padding:6px 9px 4px;font-size:11px;color:${FAINT}">${esc(t)}</div>`
const rowIcons = (shown, { confirm = false } = {}) => shown ? `<span style="display:flex;align-items:center;gap:2px;flex:none">
  <span style="display:grid;place-items:center;width:24px;height:24px;border-radius:6px;color:${MUTED}">${ic('pen', MUTED, 13)}</span>
  ${confirm ? `<span style="display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:6px;background:${RISK};color:#fff;font-size:11px">${ic('trash', '#fff', 12)}确认</span>` : `<span style="display:grid;place-items:center;width:24px;height:24px;border-radius:6px;color:${MUTED}">${ic('trash', MUTED, 13)}</span>`}
</span>` : ''
const sessionRow = (title, meta, { hover = false, icons = false, confirm = false, active = false } = {}) => `<div style="display:flex;align-items:center;gap:8px;height:44px;padding:0 6px 0 9px;border-radius:8px;background:${hover || confirm ? MUTEDBG : 'transparent'}">
  <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:1px">
    <span style="font-size:13px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${active ? 'font-weight:500' : ''}">${esc(title)}</span>
    <span style="font-size:11px;color:${FAINT};line-height:1.3">${esc(meta)}</span>
  </span>
  ${rowIcons(icons, { confirm })}
</div>`
const renameRow = () => `<div style="display:flex;align-items:center;gap:8px;height:44px;padding:0 6px 0 7px;border-radius:8px;background:${MUTEDBG}">
  <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
    <span style="display:block;height:24px;border:1px solid ${FG};border-radius:6px;background:#fff;padding:0 7px;font-size:13px;line-height:24px">分析这个图片的画风<span style="display:inline-block;width:1px;height:13px;background:${FG};vertical-align:-2px;margin-left:1px"></span></span>
    <span style="font-size:10.5px;color:${FAINT};padding-left:2px">Enter 保存 · Esc 取消</span>
  </span>
</div>`
const skelRow = (w) => `<div style="display:flex;align-items:center;height:44px;padding:0 9px"><span style="flex:1;display:flex;flex-direction:column;gap:5px"><span style="display:block;height:9px;width:${w}%;border-radius:4px;background:${MUTEDBG}"></span><span style="display:block;height:7px;width:38%;border-radius:4px;background:${MUTEDBG}"></span></span></div>`
const menuFoot = () => `<div style="border-top:1px solid ${BORDER};margin:4px -5px 0;padding:5px 5px 0"><div style="display:flex;align-items:center;gap:8px;height:34px;padding:0 9px;border-radius:8px;font-size:13px">${ic('edit', FG, 14)}新对话</div></div>`

const MENU_REST = menuShell(menuLabel('以前的会话') + sessionRow('分析这个图片的画风', '图片工作台 · 09/10') + sessionRow('赛博朋克街景四连', '图片工作台 · 09/08') + sessionRow('给这张图换个光', '画布 · 09/03') + menuFoot())
const MENU_HOVER = menuShell(menuLabel('以前的会话') + sessionRow('分析这个图片的画风', '图片工作台 · 09/10', { hover: true, icons: true }) + sessionRow('赛博朋克街景四连', '图片工作台 · 09/08') + sessionRow('给这张图换个光', '画布 · 09/03') + menuFoot())
const MENU_RENAME = menuShell(menuLabel('以前的会话') + renameRow() + sessionRow('赛博朋克街景四连', '图片工作台 · 09/08') + sessionRow('给这张图换个光', '画布 · 09/03') + menuFoot())
const MENU_DELETE = menuShell(menuLabel('以前的会话') + sessionRow('分析这个图片的画风', '图片工作台 · 09/10', { hover: true, icons: true, confirm: true }) + sessionRow('赛博朋克街景四连', '图片工作台 · 09/08') + sessionRow('给这张图换个光', '画布 · 09/03') + menuFoot())
const MENU_LOADING = menuShell(menuLabel('以前的会话') + skelRow(62) + skelRow(48) + skelRow(70) + menuFoot())
const MENU_EMPTY = menuShell(menuLabel('以前的会话') + `<div style="padding:14px 9px 16px;font-size:12px;color:${FAINT}">还没有别的会话</div>` + menuFoot())

// ── 空态 · 输入区 ──
const suggestChips = () => `<div style="display:flex;flex-wrap:wrap;gap:6px">${['把这句写成提示词', '换个模型看差别', '照这张参考图来', '出 4 张对比'].map((t) => `<span style="display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 10px;border-radius:999px;border:1px solid ${BORDER};background:#fff;font-size:12px;color:#404040">${ic('spark', FAINT, 12)}${esc(t)}</span>`).join('')}</div>`
const specLine = () => `<div style="display:flex;align-items:center;gap:6px;height:22px;font-size:11.5px;color:${MUTED}">${ic('img', FAINT, 13)}<span>未选模型 · 1:1 · 1 张</span>${ic('chev', FAINT, 12)}</div>`
const sq = (k) => `<span style="display:grid;place-items:center;width:32px;height:32px;border-radius:8px;border:1px solid ${BORDER};background:#fff;color:${MUTED}">${ic(k, MUTED, 15)}</span>`
const composer = ({ chips = false } = {}) => `<div style="display:flex;flex-direction:column;gap:7px">
  ${chips ? suggestChips() : ''}
  ${specLine()}
  <div style="border:1px solid ${BORDER};border-radius:12px;background:#fff;padding:10px 11px 8px;display:flex;flex-direction:column;gap:9px">
    <span style="font-size:13px;color:#bdbdbd">描述画面，或把参考图挂进来…</span>
    <div style="display:flex;align-items:center;gap:6px">
      ${sq('plus')}${sq('clip')}${sq('img')}
      <span style="display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 10px;border-radius:8px;border:1px solid ${BORDER};background:#fff;font-size:12px">OpenAI GPT-5.6 Luna${ic('chev', MUTED, 13)}</span>
      <span style="flex:1"></span>
      <span style="display:grid;place-items:center;width:32px;height:32px;border-radius:8px;background:${FG};color:#fff">${ic('up', '#fff', 15)}</span>
    </div>
  </div>
</div>`

const EMPTY = `<div style="width:520px;background:#fff;border:1px solid ${BORDER};border-top:0;border-radius:0 0 12px 12px;padding:0 12px 12px;box-sizing:border-box;display:flex;flex-direction:column;box-shadow:${SH_PANEL}">
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:52px 0 44px">
    ${avatar(40)}
    <span style="font-size:13.5px;color:#525252;text-align:center">说你想要的画面，我来写提示词、挑模型、配参考。</span>
  </div>
  ${composer({ chips: true })}
</div>`

const STREAMING = `<div style="width:520px;background:#fff;border:1px solid ${BORDER};border-radius:12px;padding:12px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;box-shadow:${SH_PANEL}">
  <div style="display:flex;gap:9px"><span style="flex:1"></span><span style="max-width:72%;padding:8px 11px;border-radius:12px 12px 4px 12px;background:${MUTEDBG};font-size:13px">照这张参考图，出 4 张赛博朋克街景</span></div>
  <div style="display:flex;gap:9px">${avatar(24)}<span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:7px">
    <span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:${MUTED}"><span style="width:6px;height:6px;border-radius:50%;background:${FG};display:block"></span>正在查 3 个来源…</span>
    <span style="font-size:13px;line-height:1.65;color:#262626">先把你这句拆成画面要素：赛博朋克 · 街景 · 夜 · 霓虹反射<span style="display:inline-block;width:7px;height:14px;background:${FG};vertical-align:-2px;margin-left:2px;border-radius:1px"></span></span>
  </span></div>
</div>`

const MOTION = `<table><tr><th>动作</th><th>时长 · 曲线</th><th>动什么</th><th>⛔</th></tr>
${[
  ['历史下拉 开', '120ms · ease-out', 'opacity 0→1，translateY 4px→0，transform-origin 贴触发器', '不缩放整张菜单'],
  ['历史下拉 关', '90ms · ease-in', '只淡出，不位移', '不等 animationend 卸载'],
  ['行 hover 图标', '150ms · ease-standard', 'opacity 0→1（图标常驻改按需）', '不做位移，行不能抖'],
  ['改名进入', '即时', 'input 直接就位并全选', '不淡入 —— 打字要等的动画是坏动画'],
  ['删除两段', '150ms · ease-standard', '垃圾桶宽度撑成「确认」药丸，3 秒后缩回', '不弹对话框'],
  ['头像 morph', '开 240ms / 关 200ms · ease-standard', '只动 transform，两个锚点一个元素', '不用 AnimatePresence，不听 animationend'],
  ['建议 chip', '入场 180ms 错开 30ms', 'opacity + translateY 6px', '空态之外不再出现'],
  ['逐字输出', '按 token 追加', '光标块常亮，不闪烁', '不做假的打字机延时'],
].map((r) => `<tr><td style="font-weight:500">${esc(r[0])}</td><td class="tok" style="${MONO}font-size:11px">${esc(r[1])}</td><td>${esc(r[2])}</td><td style="color:${AMBER}">${esc(r[3])}</td></tr>`).join('')}
<tr><td colspan="4" style="padding-top:9px;color:${MUTED};border-bottom:0">全部包在 <b>motion-reduce:transition-none</b> 里；<b>duration-(--duration-fast)</b> 与 <b>ease-standard</b> 走既有 token，⛔ 不新开时长档。</td></tr></table>`

const BOARD1 = header('PixelVault · D7c · ④ UI 画板 · 2026-09-20', '助手壳 · 头部与历史下拉', '56a 的历史 / 改名 / 删除和 D7b 的头部上下文此前直接从口述落到代码，跳过了 ④。这张补回来，owner 09-20 三答：上下文移到输入框上方 · 历史对标 Claude · 整个壳一起补。')
  + sec('头部', '44px 一行 · 改前 → 改后')
  + state('改前 · 现在线上', frame(headerBar({ before: true })), '头像和标题之间塞着一句工作台的规格。它随参数栏变，参数栏里已经有一颗完整的规格 chip —— 头部被迫回答了一个不属于它的问题，标题被挤到第三位。', 540)
  + state('改后', frame(headerBar()), '头部只回答「这是哪个会话」：头像 · 会话标题▾ · ⋯。标题回到头像右边，是这一行里唯一有分量的东西。那句规格下沉到输入框上方（见第二张）。', 540)
  + sec('历史下拉', '300px 宽 · 行高 44 · 锚在标题药丸')
  + state('静息', frame(MENU_REST), '一行两层：标题 13px 单行截断，下面 11px「工作台 · 日期」用 · 连起来，⛔ 不再是隔着半格的两段。图标不在这一态出现。', 340)
  + state('hover / 键盘聚焦', frame(MENU_HOVER), '底色亮起，右侧淡入改名与删除。行宽不变、图标不推挤标题 —— 标题的截断点在两态之间必须一致。', 340)
  + state('改名中', frame(MENU_RENAME), '原位变输入框，进来就全选。Enter 存、Esc 还原、点外面也存。第二行换成这一句操作提示，⛔ 不弹对话框。', 340)
  + state('删除确认', frame(MENU_DELETE), '垃圾桶就地撑成一颗「确认」。同一列表同时只有一行能进这态，3 秒 / 移开 / 失焦都会缩回去。', 340)
  + state('加载中', frame(MENU_LOADING), '三条骨架占住行位。⚠ 真机上现在是「读取中…」那行字和已经载出来的会话<b>同时挂着</b> —— 骨架必须<b>替掉</b>列表，⛔ 不叠在上面。', 340)
  + state('一条都没有', frame(MENU_EMPTY), '一句灰字，底下「新对话」照常在。⛔ 不画插图空态 —— 这是个下拉菜单，不是一页。', 340)

const BOARD2 = header('PixelVault · D7c · ④ UI 画板 · 2026-09-20', '助手壳 · 空态 · 输入区 · 动效', '')
  + sec('空态', '头像 40 · 建议压成一排 chip')
  + state('改后', frame(EMPTY), '头像从 72 缩到 40，和那句话合成一组，垂直居中偏上。四条满宽建议条变成输入框正上方一排 28px 的 chip：它们是诱饵，不该比助手说的那句话还重。窄了就换行。', 560)
  + state('输入区拆解', frame(`<div style="width:496px">${composer()}</div>`), '从上到下：那句规格（点开是规格弹层，和参数栏那颗同一个真值）→ 输入框 → 一排 32px 控件 + 发送。规格贴着输入框，因为它说的是「这一句发出去会产出什么」。四颗方控件与发送同尺寸同圆角，⛔ 不许发送自己圆一档。', 560)
  + sec('跑起来', '逐字输出 · 状态词')
  + state('流式中', frame(STREAMING), '状态词（正在查 3 个来源…）是唯一的进度表示，⛔ 不要进度条。正文按 token 追加，光标块常亮不闪 —— 闪烁的光标在长回答里会变成噪音。', 560)
  + sec('动效表', '这张是验收单')
  + `<div style="max-width:900px">${MOTION}</div>`

for (const [name, html] of [['DesignD7cShell.dc.html', page('D7c ④ 头部与历史', BOARD1)], ['DesignD7cFlow.dc.html', page('D7c ④ 空态与动效', BOARD2)]]) {
  writeFileSync(join(OUT, name), html)
  console.log('wrote', name)
}
