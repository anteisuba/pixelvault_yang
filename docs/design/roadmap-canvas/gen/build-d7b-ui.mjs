// D7b · ④ UI 画板：四张脸（同壳不同底）+ 头像开关（收起 → 过渡 → 展开）
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const FG = 'oklch(14.5% 0 0)', MUTED = '#737373', BORDER = 'oklch(92.2% 0 0)', MUTEDBG = 'oklch(97% 0 0)', SUNKEN = '#ebebeb', WORKBENCH = '#f4f4f1', RED = '#b3261e'
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
  dots: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>',
  lora: '<path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="17" r="2"/>',
  canvas: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7.5 10.5 16M16 7.5 13.5 16M8.5 6h7"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.4 5.2A9.8 9.8 0 0 1 12 5c5 0 9 4.5 9 7a11 11 0 0 1-2.2 3.3M6.3 6.5A11.6 11.6 0 0 0 3 12c0 2.5 4 7 9 7a9.7 9.7 0 0 0 3.7-.7"/>',
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
const avatar = (s = 22, badge = 0) => `<span style="position:relative;display:inline-block;width:${s}px;height:${s}px;flex:none"><span style="display:block;width:${s}px;height:${s}px;border-radius:50%;background:linear-gradient(135deg,#c9c9c4,#8a8a86)"></span>${badge ? `<span style="position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:${FG};color:#fff;${MONO}font-size:9.5px;display:flex;align-items:center;justify-content:center;border:2px solid #fff">${badge}</span>` : ''}</span>`
const pill = (t) => `<span style="display:inline-flex;align-items:center;height:30px;padding:0 12px;border-radius:999px;border:1px solid ${BORDER};background:#fff;font-size:12px;white-space:nowrap">${esc(t)}</span>`

// ── 同一个壳 ──
const domainMark = (icon, ctx) => `<span style="display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:999px;background:${MUTEDBG};font-size:11px;color:#525252">${ic(icon, '#525252', 12)}<span class="tok" style="font-size:10px">${esc(ctx)}</span></span>`
const dockHead = (icon, ctx) => `<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid ${BORDER};font-size:12.5px">${avatar(22)}<span style="font-weight:600">达妮娅</span>${domainMark(icon, ctx)}<span style="flex:1"></span>${ic('dots', MUTED, 16)}</div>`
const composer = (placeholder) => `<div style="border-top:1px solid ${BORDER};padding:8px 10px;display:flex;align-items:center;gap:6px"><div style="flex:1;height:32px;border:1px solid ${BORDER};border-radius:10px;padding:0 10px;display:flex;align-items:center;font-size:12px;color:${MUTED}">${esc(placeholder)}</div><span style="width:32px;height:32px;border-radius:50%;background:${FG};display:flex;align-items:center;justify-content:center">${ic('up', '#fff', 15)}</span></div>`
const face = ({ icon, ctx, empty, pills, placeholder }) => `<div style="width:420px;height:400px;background:#fff;border:1px solid ${BORDER};border-radius:16px;box-shadow:${SH_FLOAT};overflow:hidden;display:flex;flex-direction:column">
  ${dockHead(icon, ctx)}
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px 24px;text-align:center">
    <div style="font-size:13px;line-height:1.6;color:#404040;max-width:300px">${esc(empty)}</div>
    <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:6px">${pills.map(pill).join('')}</div>
  </div>
  ${composer(placeholder)}
</div>`

const FACES = [
  ['图片工作台 · 如何生成图片', face({ icon: 'image', ctx: 'Seedream 5.0 Pro · 1:1 · 4 张', empty: '说你想要的画面，我来写提示词、挑模型、配参考。', pills: ['把这句写成好提示词', '换个模型看差别', '照这张参考图来', '出 4 张对比'], placeholder: '描述画面，或把参考图挂进来…' })],
  ['视频工作台 · 如何生成视频', face({ icon: 'video', ctx: 'Kling 2.5 · 16:9 · 5s', empty: '给我一张图或一句话，我来让它动起来。', pills: ['从这张图动起来', '首尾帧怎么接', '时长和节奏', '镜头运动怎么写'], placeholder: '描述镜头，或挂一张首帧…' })],
  ['LoRA 装配台 · 用 LoRA 出对图', face({ icon: 'lora', ctx: 'WAI-Illustrious v15 · 挂了 3 个', empty: '告诉我想出什么图，我来帮你挑 LoRA、写触发词、调权重。', pills: ['这个题材该挂哪些 LoRA', '帮我写这张的提示词', '权重这样对不对', '试一张看看'], placeholder: '想出什么图？' })],
  ['画布 · 全能导演', face({ icon: 'canvas', ctx: '借伞分镜 · 选中 2 个节点', empty: '从剧本、参考图或一句话开始，我把它排成分镜、连成片。', pills: ['把这段剧本排成分镜', '从参考图做角色资产', '用资产排分镜', '分镜出视频', '帮我连线'], placeholder: '继续说，或把素材挂进来…' })],
]

const FACES_BOARD = header('PixelVault · D7b · ④ UI 画板 · 2026-09-20', '四张脸 · 同一个壳只换三样', '壳一样：头像 + 人设名 + ⋯ 的头部、空态排版、药丸形状、输入区。换的只有：头部域标记（图标 + 一句当前上下文，⛔ 不上色）、空态那句话、起手药丸。四帧并排看一眼就该知道各自是谁。')
  + `<div style="display:grid;grid-template-columns:repeat(2,max-content);gap:24px 40px;margin-top:26px">${FACES.map(([t, f]) => `<div><div style="font-size:13px;font-weight:600;margin-bottom:8px">${esc(t)}</div>${frame(f)}</div>`).join('')}</div>`
  + cap('域标记是一颗灰底小胶囊，读的是宿主当下的状态（模型 / 比例 / 张数、底模 / 挂了几个、项目 / 选中几个节点），随宿主变化实时刷。空态那句话说「我能干什么」，⛔ 不再重复人设名字。药丸最多 5 颗，两行以内；点了就是发一句话，不是打开菜单。四处输入框占位词各写各的，只有这一处文案差异在输入区。')

// ── 头像开关 ──
const chromeBar = (right) => `<div style="width:640px;height:64px;position:relative;background:${SUNKEN};border-radius:12px 12px 0 0"><div style="position:absolute;right:14px;top:14px;display:flex;align-items:center;gap:8px">${right}</div></div>`
const pillBtn = (icon, t) => `<span style="display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:999px;background:#fff;border:1px solid ${BORDER};font-size:12.5px">${ic(icon, FG, 14)}${esc(t)}</span>`
const avatarBtn = (badge = 0, pressed = false) => `<span style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#fff;border:1px solid ${pressed ? FG : BORDER};box-shadow:${SH_FLOAT}">${avatar(26, badge)}</span>`
const stage = (h, inner) => `<div style="width:640px;height:${h}px;position:relative;background:${SUNKEN};border-radius:0 0 12px 12px;overflow:hidden">${inner}</div>`

const COLLAPSED = `${chromeBar(pillBtn('scissors', '剪辑台') + avatarBtn(2))}${stage(300, `<div style="position:absolute;inset:16px;border-radius:10px;border:1px dashed #d4d4d4"></div>`)}`
const MID = `${chromeBar(pillBtn('scissors', '剪辑台') + `<span style="width:36px;height:36px"></span>`)}${stage(300, `
  <div style="position:absolute;right:14px;top:6px;width:220px;height:170px;background:#fff;border:1px solid ${BORDER};border-radius:16px;box-shadow:${SH_FLOAT};opacity:.55;transform-origin:top right"></div>
  <span style="position:absolute;right:${14 + 220 - 12 - 22}px;top:15px">${avatar(22)}</span>
  <div style="position:absolute;left:16px;bottom:14px;font-size:11px;color:${MUTED}">240ms · 头像从顶栏滑进面板头部，面板从右上角长出来</div>`)}`
const OPEN = `${chromeBar(pillBtn('scissors', '剪辑台') + `<span style="width:36px;height:36px"></span>`)}${stage(300, `
  <div style="position:absolute;right:14px;top:6px;width:420px;height:280px;background:#fff;border:1px solid ${BORDER};border-radius:16px;box-shadow:${SH_FLOAT};overflow:hidden;display:flex;flex-direction:column">
    ${dockHead('canvas', '借伞分镜 · 选中 2 个节点')}
    <div style="flex:1;padding:12px 14px;font-size:12px;color:${MUTED}">…对话…</div>
    ${composer('继续说，或把素材挂进来…')}
  </div>`)}`
const MENU = `${chromeBar(pillBtn('scissors', '剪辑台') + `<span style="width:36px;height:36px"></span>`)}${stage(300, `
  <div style="position:absolute;right:14px;top:6px;width:420px;height:280px;background:#fff;border:1px solid ${BORDER};border-radius:16px;box-shadow:${SH_FLOAT};overflow:hidden;display:flex;flex-direction:column">
    ${dockHead('canvas', '借伞分镜 · 选中 2 个节点')}
    <div style="flex:1;padding:12px 14px;font-size:12px;color:${MUTED};opacity:.5">…对话…</div>
    ${composer('继续说，或把素材挂进来…')}
  </div>
  <div style="position:absolute;right:26px;top:46px;width:190px;background:#fff;border:1px solid ${BORDER};border-radius:12px;box-shadow:${SH_FLOAT};padding:5px;font-size:12.5px">
    ${[['clock', '历史会话'], ['gear', '设置']].map(([k, t]) => `<div style="display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:7px;color:#404040">${ic(k, '#404040', 14)}${t}</div>`).join('')}
    <div style="height:1px;background:${BORDER};margin:4px 0"></div>
    <div style="display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:7px">${ic('eyeOff', FG, 14)}<span style="flex:1">隐身 · 这一轮不记</span><span style="width:26px;height:15px;border-radius:999px;background:#d4d4d4;position:relative;flex:none"><span style="position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;background:#fff"></span></span></div>
  </div>`)}`

// LoRA / 工作台：右上角
const pageTopRight = (label, before) => `<div style="width:420px;height:200px;position:relative;background:${SUNKEN};border-radius:12px;overflow:hidden">
  <div style="position:absolute;left:14px;top:14px;right:70px;bottom:14px;background:#fff;border:1px solid ${BORDER};border-radius:10px"></div>
  <span style="position:absolute;right:14px;top:14px">${avatarBtn(before ? 0 : 1)}</span>
  ${before ? `<span style="position:absolute;right:14px;bottom:14px;opacity:.35">${avatarBtn(1)}</span><div style="position:absolute;right:58px;bottom:22px;font-size:10.5px;color:${MUTED}">现状 · 右下 →</div>` : ''}
  <div style="position:absolute;left:24px;top:24px;font-size:11px;color:${MUTED}">${esc(label)}</div></div>`

const TOGGLE_BOARD = header('PixelVault · D7b · ④ UI 画板 · 2026-09-20', '头像开关 · 收起 → 过渡 → 展开', '四处收起态都是人设头像，右上角。头像就是唯一开关，点开滑进面板头部；点头部头像或 Esc 收回去。面板头部的「收起」按钮退场，右侧只剩一颗 ⋯。')
  + sec('画布', '顶栏「助手」胶囊退场，位置换成头像，排在「剪辑台」右侧')
  + state('收起：头像 + 角标', frame(COLLAPSED, '#fff', 0), '36px 圆，白底细边，与「剪辑台」胶囊同高。角标 = 等你的事（确认 / 结果），⛔ 不是红点。')
  + state('过渡 240ms', frame(MID, '#fff', 0), '同一颗头像：位置从顶栏滑到面板头部左上，面板从右上角按 transform-origin 长出。motion-reduce 直切。')
  + state('展开：面板在顶栏下方', frame(OPEN, '#fff', 0), '面板顶边 = 顶栏底 + 6px，右缘对齐顶栏右缘，⛔ 不再压顶栏。头部头像可点 = 收起。')
  + state('⋯ 菜单', frame(MENU, '#fff', 0), '历史会话 · 设置 · 隐身。原来并排的三颗图标全部收进来。')
  + sec('工作台 / LoRA', '没有顶栏胶囊，头像固定右上')
  + state('LoRA：从右下挪到右上', frame(pageTopRight('LoRA 装配台', true), '#fff', 0), '现状那颗右下头像退场，位置统一到右上，与画布同一颗。')
  + state('图片 / 视频工作台', frame(pageTopRight('图片工作台', false), '#fff', 0), '同一颗，同一处。展开后面板同样从右上角长出，顶边对齐页面顶部留白。')
  + cap('展开与收起的过渡是唯一的动效；展开态没有进场以外的动画。手机保持 D7 已定的半屏 Sheet，收起态头像挂在右上角而不是右下角，与桌面一致。')

for (const [name, html] of [['DesignD7bFaces.dc.html', page('D7b ④ 四张脸', FACES_BOARD)], ['DesignD7bToggle.dc.html', page('D7b ④ 头像开关', TOGGLE_BOARD)]]) {
  writeFileSync(join(OUT, name), html)
  console.log('wrote', name)
}
