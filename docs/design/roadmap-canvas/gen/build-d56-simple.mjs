// D56a · ④ 最简版（09-20）：一块画板 —— 平铺列表 · 就地改 · 空态 · 回执一行 · 隐身
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const FG = 'oklch(14.5% 0 0)', MUTED = '#737373', BORDER = 'oklch(92.2% 0 0)', MUTEDBG = 'oklch(97% 0 0)', WORKBENCH = '#f4f4f1'
const SH_CARD = '0 1px 2px rgb(0 0 0 / 0.04), 0 12px 32px -16px rgb(0 0 0 / 0.24)'
const SH_FLOAT = '0 1px 2px rgb(0 0 0 / 0.05), 0 8px 28px -12px rgb(0 0 0 / 0.32)'

const STYLE = `
  body { margin:0; background:#fff; color:${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing:antialiased; }
  h1 { margin:8px 0 0; font-size:26px; font-weight:600; letter-spacing:-.01em; line-height:1.2 }
  .eyebrow { ${MONO} font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:${MUTED} }
  .sub { margin:8px 0 0; font-size:14px; line-height:1.6; color:#525252; max-width:1000px }
  .sec { margin-top:30px; display:flex; align-items:baseline; gap:12px } .sec b { font-size:16px; font-weight:600 } .sec span { font-size:12px; color:${MUTED} }
  .tok { ${MONO} font-size:10.5px; color:#525252 }
  .cap { margin-top:10px; font-size:12px; line-height:1.55; color:#525252; max-width:560px }
  svg.ic { width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; display:block; flex:none }
`
const I = {
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.4 5.2A9.8 9.8 0 0 1 12 5c5 0 9 4.5 9 7a11 11 0 0 1-2.2 3.3M6.3 6.5A11.6 11.6 0 0 0 3 12c0 2.5 4 7 9 7a9.7 9.7 0 0 0 3.7-.7"/>',
  clip: '<path d="M4 6h16M4 12h16M4 18h10"/>', dots: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>', chev: '<path d="m9 18 6-6-6-6"/>',
}
const ic = (k, color = 'currentColor', s = 16) => `<svg class="ic" viewBox="0 0 24 24" style="color:${color};width:${s}px;height:${s}px">${I[k]}</svg>`
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><script src="./support.js"></script></head>
<body><x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;display=swap"><style>${STYLE}</style></helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">${body}</div></x-dc></body></html>
`
const header = (eyebrow, title, sub) => `<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>`
const sec = (t, s = '') => `<div class="sec"><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ''}</div>`
const cap = (t) => `<div class="cap">${t}</div>`
const frame = (inner, bg = WORKBENCH, pad = 22) => `<div style="background:${bg};border-radius:16px;padding:${pad}px;position:relative;display:inline-block;vertical-align:top">${inner}</div>`
const state = (title, inner, note = '') => `<div style="display:inline-block;vertical-align:top;margin:0 24px 24px 0"><div style="font-size:13px;font-weight:600;margin-bottom:8px">${esc(title)}</div>${inner}${note ? cap(note) : ''}</div>`
const btn = (t, { small = true, icon = '' } = {}) => `<span style="display:inline-flex;align-items:center;gap:6px;height:${small ? 28 : 34}px;padding:0 ${small ? 10 : 14}px;border-radius:999px;font-size:${small ? 12.5 : 13}px;font-weight:500;background:#fff;color:${FG};border:1px solid ${BORDER}">${icon}${esc(t)}</span>`

const SECTIONS = [['keys', 'API key'], ['usage', '用量'], ['preferences', '偏好'], ['assistant', '助手']]
const settingsShell = (content, h = 620) => `<div style="width:1000px;height:${h}px;background:#fff;border:1px solid ${BORDER};border-radius:14px;display:flex;overflow:hidden;box-shadow:${SH_CARD}">
  <div style="width:200px;border-right:1px solid ${BORDER};padding:22px 14px;display:flex;flex-direction:column;gap:2px;flex:none">
    <div style="font-size:18px;font-weight:600;padding:0 10px 14px">设置</div>
    ${SECTIONS.map(([k, t]) => `<div style="padding:8px 10px;border-radius:8px;font-size:13.5px;${k === 'assistant' ? `background:${MUTEDBG};font-weight:500` : 'color:#525252'}">${esc(t)}</div>`).join('')}
    <div style="flex:1"></div>
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;font-size:13px;color:${MUTED}">${ic('logout', MUTED, 15)}退出登录</div>
  </div>
  <div style="flex:1;padding:26px 32px;overflow:hidden">${content}</div>
</div>`
const persona = `<div style="opacity:.45"><div style="font-size:13px;font-weight:500;margin-bottom:7px">助手人设</div><div style="display:flex;gap:6px">${['简洁', '标准', '详细'].map((t, i) => `<div style="padding:5px 12px;border-radius:999px;font-size:12px;border:1px solid ${i === 1 ? FG : BORDER};background:#fff">${t}</div>`).join('')}</div></div>`
const chips = (active = 0) => `<div style="display:flex;gap:6px">${['全部', '图片', '视频', '画布', 'LoRA'].map((t, i) => `<span style="padding:4px 11px;border-radius:999px;font-size:11.5px;border:1px solid ${i === active ? FG : BORDER};background:#fff">${t}</span>`).join('')}</div>`
const row = (text, time, { hover = false, editing = false } = {}) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;${hover || editing ? `background:${MUTEDBG};` : ''}font-size:13px">
  ${editing ? `<span style="flex:1;line-height:1.45;border-bottom:1.5px solid ${FG};padding-bottom:1px">${esc(text)}<span style="display:inline-block;width:2px;height:13px;background:${FG};vertical-align:-2px;margin-left:1px"></span></span>` : `<span style="flex:1;line-height:1.45">${esc(text)}</span>`}
  ${hover ? `<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;border:1px solid ${BORDER};background:#fff">${ic('trash', MUTED, 14)}</span>` : editing ? `<span class="tok" style="font-size:10px;color:${MUTED}">回车保存 · Esc 取消</span>` : `<span class="tok" style="font-size:10px;color:${MUTED}">${esc(time)}</span>`}
</div>`
const section = (rows, { active = 0, empty = false } = {}) => `<div style="display:flex;flex-direction:column;gap:14px;height:100%">
  <div style="font-size:20px;font-weight:600">助手</div>${persona}
  <div style="height:1px;background:${BORDER}"></div>
  <div style="display:flex;align-items:center;justify-content:space-between"><div style="font-size:13px;font-weight:500">记忆 <span class="tok" style="font-size:11px;color:${MUTED};font-weight:400">${empty ? 0 : 38}</span></div><span style="font-size:11.5px;color:${FG};text-decoration:underline">全部清空</span></div>
  ${chips(active)}
  <div style="flex:1;overflow:hidden;border:1px solid ${BORDER};border-radius:10px;padding:4px 2px">${rows}</div>
</div>`

const ROWS = [
  row('偏好横构图 16:9，除非我明说要竖的', '今天 14:20'),
  row('不喜欢过曝的打光，宁可欠曝一点', '今天 14:06', { hover: true }),
  row('角色「伞下少女」是黑长直 + 校服，别加眼镜', '昨天'),
  row('分镜习惯先写大纲再投影，不要直接铺镜头', '昨天'),
  row('人像优先用 Seedream 5.0 Pro 的 fal.ai 渠道', '9/17'),
  row('训练集偏好 40 张以内，宁缺毋滥', '9/12'),
  row('回答用中文，术语保留英文', '9/10'),
].join('')
const ROWS_EDIT = [
  row('偏好横构图 16:9，除非我明说要竖的', '今天 14:20'),
  row('不喜欢过曝的打光，宁可欠曝一点，尤其人像', '', { editing: true }),
  row('角色「伞下少女」是黑长直 + 校服，别加眼镜', '昨天'),
].join('')
const EMPTY = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;text-align:center;padding:0 40px"><div style="font-size:13.5px;font-weight:500">还没有记忆</div><div style="font-size:12.5px;color:${MUTED};line-height:1.6;max-width:340px">助手会在每轮结束时记下你的偏好和事实。这里随时能改、能删。</div>${btn('这一轮不记（隐身）', { icon: ic('eyeOff', FG, 14) })}</div>`

// 面板里的两态
const dock = (footer, ghost = false) => `<div style="width:420px;height:230px;background:#fff;border:1px solid ${BORDER};border-radius:16px;box-shadow:${SH_FLOAT};overflow:hidden;display:flex;flex-direction:column">
  <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid ${BORDER};font-size:12.5px"><span style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#c9c9c4,#8a8a86)"></span><span style="font-weight:600">达妮娅</span>${ghost ? `<span style="display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:999px;background:${MUTEDBG};font-size:11px;color:#525252">${ic('eyeOff', '#525252', 13)}隐身</span>` : ''}<span style="flex:1"></span>${ic('dots', MUTED, 16)}</div>
  <div style="flex:1;padding:12px 14px;font-size:12.5px;line-height:1.6;color:#404040">九宫格已按 reference image 1 的画风重排，男朋友只作为镜头后的拍摄者。</div>
  ${footer}
</div>`
const RECEIPT = dock(`<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid ${BORDER};font-size:12px;color:#525252">${ic('clip', MUTED, 14)}<span style="flex:1">本轮记住 6 件事</span>${ic('chev', MUTED, 14)}</div>`)
const GHOST = dock(`<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid ${BORDER};font-size:12px;color:${MUTED}">${ic('eyeOff', MUTED, 14)}<span style="flex:1">这一轮没有记</span></div>`, true)

const BOARD = header('PixelVault · D56a · ④ 最简版 · 2026-09-20', '记忆 · 一张列表，一个删', 'owner 09-19 打回第一版：「太复杂，Claude 不会这么设计。」对标 GPT「管理记忆」：平铺列表、每行只能删、点文字就地改、总开关一个、隐身一个。⛔ 分组 · 时间线 · 容量表 · 负规则 · 存为卡 · 回执逐条编辑 全部撤。')
  + sec('总览列表', '/settings/assistant 的记忆区 · 内容区 720')
  + frame(settingsShell(section(ROWS)))
  + cap('按时间倒序一张表，每条一行字 + 时间。顶部筛选 chip 按域收窄，默认全部。hover 行尾出现唯一的动作「删」，真删不进回收站。上限 200 静默淘汰，⛔ 不画任何容量提示。')
  + sec('就地改 · 空态', '')
  + state('点文字就地改', frame(settingsShell(section(ROWS_EDIT), 380)), '文字变成可编辑，回车保存、Esc 取消。⛔ 不弹层。')
  + state('空态', frame(settingsShell(section(EMPTY, { empty: true }), 380)), '一句话说清会记什么、能改能删，加隐身入口。')
  + sec('面板里的两行', '与 D7b 的 ⋯ 菜单接上')
  + state('回执一行', frame(RECEIPT), '「本轮记住 6 件事」保持一行，点它跳到设置里这张列表。⛔ 不逐条展开。')
  + state('隐身开着', frame(GHOST), '⋯ 菜单里的隐身开关（D7b 已留位）打开后：头部一枚文字胶囊，结账行改说「这一轮没有记」。敏感类目服务端静默跳过，⛔ 不提示。')

writeFileSync(join(OUT, 'DesignD56Simple.dc.html'), page('D56a ④ 最简版', BOARD))
console.log('wrote DesignD56Simple.dc.html')
