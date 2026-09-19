// D56a · ④ UI 画板：记忆总览 / 回执 / 隐身
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const FG = 'oklch(14.5% 0 0)', MUTED = '#737373', BORDER = 'oklch(92.2% 0 0)', MUTEDBG = 'oklch(97% 0 0)', WORKBENCH = '#f4f4f1', RED = '#b3261e', AMBER = '#a04f00', GREEN = '#16794c'
const SH_CARD = '0 1px 2px rgb(0 0 0 / 0.04), 0 12px 32px -16px rgb(0 0 0 / 0.24)'
const SH_FLOAT = '0 1px 2px rgb(0 0 0 / 0.05), 0 8px 28px -12px rgb(0 0 0 / 0.32)'

const STYLE = `
  body { margin:0; background:#fff; color:${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing:antialiased; }
  h1 { margin:8px 0 0; font-size:26px; font-weight:600; letter-spacing:-.01em; line-height:1.2 }
  .eyebrow { ${MONO} font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:${MUTED} }
  .sub { margin:8px 0 0; font-size:14px; line-height:1.6; color:#525252; max-width:1000px }
  .sec { margin-top:30px; display:flex; align-items:baseline; gap:12px } .sec b { font-size:16px; font-weight:600 } .sec span { font-size:12px; color:${MUTED} }
  .lab { ${MONO} font-size:10.5px; letter-spacing:.05em; color:${MUTED} }
  .tok { ${MONO} font-size:10.5px; color:#525252 }
  .cap { margin-top:10px; font-size:12px; line-height:1.55; color:#525252; max-width:560px }
  svg.ic { width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; display:block; flex:none }
`
const I = {
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  back: '<path d="m15 18-6-6 6-6"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  pencil: '<path d="M4 20h4L20 8l-4-4L4 16z"/>', card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  dots: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.4 5.2A9.8 9.8 0 0 1 12 5c5 0 9 4.5 9 7a11 11 0 0 1-2.2 3.3M6.3 6.5A11.6 11.6 0 0 0 3 12c0 2.5 4 7 9 7a9.7 9.7 0 0 0 3.7-.7"/>',
  clip: '<path d="M4 6h16M4 12h16M4 18h10"/>', undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', plus: '<path d="M5 12h14M12 5v14"/>',
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
const dot = (c, s = 8) => `<span style="display:inline-block;width:${s}px;height:${s}px;border-radius:50%;background:${c};flex:none"></span>`
const btn = (t, { primary = false, small = false, icon = '' } = {}) => `<span style="display:inline-flex;align-items:center;gap:6px;height:${small ? 28 : 34}px;padding:0 ${small ? 10 : 14}px;border-radius:999px;font-size:${small ? 12.5 : 13}px;font-weight:500;${primary ? `background:${FG};color:#fff` : `background:#fff;color:${FG};border:1px solid ${BORDER}`}">${icon}${esc(t)}</span>`

// ═══════ /settings 骨架（13 已落地：左 200px 导航 + 右 720px 内容）═══════
const SECTIONS = [['keys', 'API key'], ['usage', '用量'], ['preferences', '偏好'], ['assistant', '助手']]
const settingsShell = (content, { h = 640 } = {}) => `<div style="width:1000px;height:${h}px;background:#fff;border:1px solid ${BORDER};border-radius:14px;display:flex;overflow:hidden;box-shadow:${SH_CARD}">
  <div style="width:200px;border-right:1px solid ${BORDER};padding:22px 14px;display:flex;flex-direction:column;gap:2px;flex:none">
    <div style="font-size:18px;font-weight:600;padding:0 10px 14px">设置</div>
    ${SECTIONS.map(([k, t]) => `<div style="display:flex;align-items:center;padding:8px 10px;border-radius:8px;font-size:13.5px;${k === 'assistant' ? `background:${MUTEDBG};font-weight:500` : 'color:#525252'}">${esc(t)}</div>`).join('')}
    <div style="flex:1"></div>
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;font-size:13px;color:${MUTED}">${ic('logout', MUTED, 15)}退出登录</div>
  </div>
  <div style="flex:1;padding:26px 32px;overflow:hidden">${content}</div>
</div>`

// ── 记忆区内部件 ──
const personaBlock = `<div style="opacity:.45"><div style="font-size:13px;font-weight:500;margin-bottom:7px">助手人设</div><div style="display:flex;gap:6px">${['简洁', '标准', '详细'].map((t, i) => `<div style="padding:5px 12px;border-radius:999px;font-size:12px;border:1px solid ${i === 1 ? FG : BORDER};background:#fff">${t}</div>`).join('')}</div></div>`
const memRow = (text, src, time, { hover = false, dim = false } = {}) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;${hover ? `background:${MUTEDBG}` : ''};${dim ? 'opacity:.5;' : ''}font-size:13px">
  <span style="flex:1;line-height:1.45">${esc(text)}</span>
  ${hover
    ? `<span style="display:flex;gap:4px;flex:none">${[['pencil', '改'], ['card', '存为卡'], ['trash', '删']].map(([k, t]) => `<span title="${t}" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;border:1px solid ${BORDER};background:#fff;color:${MUTED}">${ic(k, MUTED, 14)}</span>`).join('')}</span>`
    : `<span style="display:flex;align-items:center;gap:8px;flex:none"><span class="tok" style="font-size:10px">${esc(src)}</span><span class="tok" style="font-size:10px;color:${MUTED}">${esc(time)}</span></span>`}
</div>`
const dayLabel = (t) => `<div class="lab" style="margin:10px 0 2px;padding-left:10px">${esc(t)}</div>`
const groupHead = (name, n, extra = '') => `<div style="display:flex;align-items:baseline;justify-content:space-between;padding:0 10px;margin-top:16px">
  <div style="font-size:13.5px;font-weight:600">${esc(name)} <span class="tok" style="font-size:11px;font-weight:400;color:${MUTED}">${n}</span></div>
  <div style="font-size:11.5px;color:${MUTED}">${extra || '清空这一组'}</div></div>`

const memorySection = (rows) => `<div style="display:flex;flex-direction:column;gap:14px;height:100%">
  <div style="font-size:20px;font-weight:600">助手</div>
  ${personaBlock}
  <div style="height:1px;background:${BORDER}"></div>
  <div style="display:flex;align-items:baseline;justify-content:space-between">
    <div style="font-size:13px;font-weight:500">记忆</div>
    <div style="display:flex;align-items:center;gap:10px;font-size:11.5px;color:${MUTED}"><span>助手在每轮结束时记下的偏好与事实</span><span style="color:${FG};text-decoration:underline">全部清空</span></div>
  </div>
  <div style="flex:1;overflow:hidden;border:1px solid ${BORDER};border-radius:10px;padding:4px 2px 10px">${rows}</div>
</div>`

const FULL_ROWS = [
  groupHead('图片工作台', 24),
  dayLabel('今天'),
  memRow('偏好横构图 16:9，除非我明说要竖的', '图片 · 借伞', '14:20'),
  memRow('不喜欢过曝的打光，宁可欠曝一点', '图片 · 借伞', '14:06', { hover: true }),
  dayLabel('9 月 17 日'),
  memRow('人像优先用 Seedream 5.0 Pro 的 fal.ai 渠道', '图片 · 头像批次', '9/17'),
  groupHead('画布', 11),
  dayLabel('昨天'),
  memRow('角色「伞下少女」是黑长直 + 校服，别加眼镜', '画布 · 借伞分镜', '昨天 22:31'),
  memRow('分镜习惯先写大纲再投影，不要直接铺镜头', '画布 · 借伞分镜', '昨天 21:58'),
  groupHead('LoRA 装配台', 3),
  dayLabel('9 月 12 日'),
  memRow('训练集偏好 40 张以内，宁缺毋滥', 'LoRA · eva 训练', '9/12'),
  groupHead('全局', 6),
  dayLabel('9 月 10 日'),
  memRow('回答用中文，术语保留英文', '图片 · 首次对话', '9/10'),
].join('')

const NEAR_LIMIT_ROWS = [
  `<div style="margin:8px 10px 0;padding:8px 10px;border:1px dashed ${AMBER}88;border-radius:8px;font-size:12px;line-height:1.5;color:${AMBER}">图片工作台快满了（193 / 200）。再记新的会把最久没用到的挤掉 —— 想留住哪几条，给它们点一下置顶。</div>`,
  groupHead('图片工作台', '193 / 200'),
  dayLabel('今天'),
  memRow('偏好横构图 16:9，除非我明说要竖的', '图片 · 借伞', '14:20'),
  memRow('不喜欢过曝的打光，宁可欠曝一点', '图片 · 借伞', '14:06'),
  dayLabel('7 月 3 日 · 最久没用到'),
  memRow('那次试过的水彩风格不太合适', '图片 · 早期试验', '7/3', { dim: true }),
].join('')

const EMPTY = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;text-align:center;padding:0 40px">
  <div style="font-size:13.5px;font-weight:500">还没有记忆</div>
  <div style="font-size:12.5px;color:${MUTED};line-height:1.6;max-width:360px">助手会在每一轮结束时，把你说过的偏好和事实记一行下来。你随时可以在这里改、删，或者存成上下文卡。</div>
  <div style="margin-top:4px">${btn('这一轮不记（隐身）', { small: true, icon: ic('eyeOff', FG, 14) })}</div>
</div>`

const phone = (inner) => `<div style="width:375px;height:600px;background:#fff;border:1px solid ${BORDER};border-radius:26px;overflow:hidden;box-shadow:${SH_CARD};display:flex;flex-direction:column">
  <div style="height:38px;flex:none"></div>
  <div style="display:flex;align-items:center;gap:8px;padding:0 16px 12px;font-size:15px;font-weight:600">${ic('back', FG, 18)}助手</div>
  <div style="height:1px;background:${BORDER}"></div>
  <div style="flex:1;padding:14px 12px;overflow:hidden">${inner}</div>
</div>`
const PHONE_ROWS = [
  groupHead('图片工作台', 24),
  dayLabel('今天'),
  memRow('偏好横构图 16:9，除非我明说要竖的', '图片', '14:20'),
  memRow('不喜欢过曝的打光', '图片', '14:06'),
  groupHead('画布', 11),
  dayLabel('昨天'),
  memRow('角色「伞下少女」黑长直 + 校服', '画布', '22:31'),
].join('')

// ═══════ 板 1 · 总览页 ═══════
const OVERVIEW = header('PixelVault · D56a · ④ UI 画板 · 2026-09-19', '记忆总览 · /settings/assistant 的记忆区', '按域分组 + 时间线（Q3 A）。记忆区是「助手」分区里人设下面的一块，⛔ 不是第五个分区 —— 13 已落地的四分区次序不动。每域上限 200 条，超了按最久没用到的淘汰（owner 09-19 定）。')
  + sec('默认态', '1000 × 820 · 内容区 720')
  + frame(settingsShell(memorySection(FULL_ROWS), { h: 820 }))
  + cap('五组固定次序：图片工作台 · 视频工作台 · 画布 · LoRA 装配台 · 全局；<b>没有记忆的组整组不画</b>，⛔ 不摆空组占位。组内按最近更新倒序，按天分段（今天 / 昨天 / 具体日期）。行尾平时是「来源 · 时间」，<b>hover 才换成三个动作</b>（改 · 存为卡 · 删）—— 来源与动作抢同一段位置，⛔ 不并排挤。')
  + sec('一条记忆的两态', '行尾：静置 vs hover')
  + state('静置：来源 + 时间', frame(`<div style="width:660px;background:#fff;border:1px solid ${BORDER};border-radius:10px;padding:4px 2px">${memRow('不喜欢过曝的打光，宁可欠曝一点', '图片 · 借伞', '14:06')}</div>`), '来源是可点的：跳回那一轮对话，⛔ 不是纯文字标签。')
  + state('hover：改 · 存为卡 · 删', frame(`<div style="width:660px;background:#fff;border:1px solid ${BORDER};border-radius:10px;padding:4px 2px">${memRow('不喜欢过曝的打光，宁可欠曝一点', '图片 · 借伞', '14:06', { hover: true })}</div>`), '「改」就地变输入框（不是弹层）；「删」直接删、<b>不进回收站</b>（真删，v2 §隐私）；「存为卡」打开现有的上下文卡弹层并预填。')
  + sec('快满了', '193 / 200')
  + frame(settingsShell(memorySection(NEAR_LIMIT_ROWS), { h: 480 }))
  + cap('接近上限才出这条提示，⛔ 平时不占位。淘汰按「最久没用到」（lastUsedAt），不是按建立时间 —— 一条三个月前记下、昨天还在用的偏好不该被挤掉。将被挤掉的那条在列表里<b>先变灰</b>，给你一次置顶的机会。')
  + sec('空态 · 手机', '')
  + state('空态', frame(settingsShell(memorySection(EMPTY), { h: 420 })), '空态直接给隐身入口 —— 第一次来这页的人，关心的往往正是「它会不会偷偷记」。')
  + state('手机 375', frame(phone(`<div style="border:1px solid ${BORDER};border-radius:10px;padding:4px 2px">${PHONE_ROWS}</div>`), WORKBENCH, 16), '手机没有导航列，二级页顶部一行「← 助手」（13 已定的形态）。行尾动作在手机上<b>左滑</b>露出，⛔ 不做常驻三颗图标。')

// ═══════ 板 2 · 回执 ═══════
const receiptRow = (text, { removed = false } = {}) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:7px;font-size:12.5px;${removed ? 'opacity:.4;text-decoration:line-through;' : ''}">
  <span style="flex:1;line-height:1.45">${esc(text)}</span>
  <span style="display:flex;gap:4px;flex:none">${[['pencil', '改'], ['trash', '删']].map(([k, t]) => `<span title="${t}" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;border:1px solid ${BORDER};background:#fff">${ic(k, MUTED, 13)}</span>`).join('')}<span style="display:inline-flex;align-items:center;height:24px;padding:0 8px;border-radius:6px;border:1px solid ${BORDER};background:#fff;font-size:11px;color:${MUTED}">不要记这类</span></span>
</div>`
const panelFrame = (inner, h = 300) => `<div style="width:420px;height:${h}px;background:#fff;border:1px solid ${BORDER};border-radius:16px;box-shadow:${SH_FLOAT};padding:14px;display:flex;flex-direction:column;gap:10px;overflow:hidden">${inner}</div>`
const msgBlock = `<div style="display:flex;gap:9px"><span style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#c9c9c4,#8a8a86);flex:none"></span><div style="flex:1"><div style="font-size:12.5px;font-weight:600;margin-bottom:4px">达妮娅</div><div style="font-size:12.5px;line-height:1.6;color:#404040">九宫格已按 reference image 1 的画风重排，男朋友只作为镜头后的拍摄者。<br>下一步：把画布设为横向 16:9、2K。</div></div></div>`

const COLLAPSED = panelFrame(`${msgBlock}<div style="flex:1"></div>
  <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-top:1px solid ${BORDER};font-size:12px;color:#525252">${ic('clip', MUTED, 14)}<span style="flex:1">本轮记住 6 件事</span><span style="color:${FG}">改</span></div>`, 260)

const EXPANDED = panelFrame(`<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#525252;padding-bottom:6px;border-bottom:1px solid ${BORDER}">${ic('clip', MUTED, 14)}<span style="flex:1;font-weight:600;color:${FG}">本轮记住 6 件事</span><span style="color:${MUTED}">收起</span></div>
  <div style="display:flex;flex-direction:column;gap:1px;overflow:hidden">
    ${receiptRow('偏好横构图 16:9')}
    ${receiptRow('不喜欢过曝的打光')}
    ${receiptRow('角色「伞下少女」黑长直 + 校服')}
    ${receiptRow('男朋友只作为拍摄者，不同框')}
    ${receiptRow('画风跟随 reference image 1')}
    ${receiptRow('回答用中文，术语保留英文')}
  </div>
  <div style="flex:1"></div>
  <div style="font-size:11px;color:${MUTED};line-height:1.5">改这里只改记忆，⛔ 不重跑这一轮</div>`, 340)

const AFTER_RULE = panelFrame(`<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#525252;padding-bottom:6px;border-bottom:1px solid ${BORDER}">${ic('clip', MUTED, 14)}<span style="flex:1;font-weight:600;color:${FG}">本轮记住 5 件事</span><span style="color:${MUTED}">收起</span></div>
  <div style="display:flex;flex-direction:column;gap:1px">
    ${receiptRow('偏好横构图 16:9')}
    ${receiptRow('画风跟随 reference image 1', { removed: true })}
  </div>
  <div style="margin-top:4px;padding:8px 10px;border:1px solid ${BORDER};border-radius:8px;background:${MUTEDBG};font-size:11.5px;line-height:1.55;display:flex;align-items:center;gap:8px">
    <span style="flex:1">以后不再记「画风参考」这一类</span><span style="display:inline-flex;align-items:center;gap:4px;color:${FG}">${ic('undo', FG, 13)}撤销</span></div>`, 300)

const TO_CARD = `<div style="display:flex;gap:16px;align-items:flex-start">
  <div style="width:340px;background:#fff;border:1px solid ${BORDER};border-radius:10px;padding:4px 2px">${memRow('角色「伞下少女」是黑长直 + 校服，别加眼镜', '画布 · 借伞分镜', '昨天', { hover: true })}</div>
  <div style="padding-top:14px;font-size:20px;color:${MUTED}">→</div>
  <div style="width:340px;background:#fff;border:1px solid ${BORDER};border-radius:14px;box-shadow:${SH_FLOAT};padding:14px;display:flex;flex-direction:column;gap:9px">
    <div style="font-size:13.5px;font-weight:600">新建上下文卡</div>
    ${[['卡名', '伞下少女'], ['一句话摘要', '黑长直 + 校服，别加眼镜']].map(([l, v]) => `<div><div class="lab" style="margin-bottom:3px">${l}</div><div style="padding:6px 9px;border:1px solid ${BORDER};border-radius:7px;font-size:12px">${esc(v)}</div></div>`).join('')}
    <div><div class="lab" style="margin-bottom:3px">类型</div><div style="display:flex;gap:5px">${['角色', '风格规则', '世界观'].map((t, i) => `<span style="padding:4px 10px;border-radius:999px;font-size:11.5px;border:1px solid ${i === 0 ? FG : BORDER};background:#fff">${t}</span>`).join('')}</div></div>
    <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:2px">${btn('取消', { small: true })}${btn('建卡', { primary: true, small: true })}</div>
  </div></div>`

const RECEIPT = header('PixelVault · D56a · ④ UI 画板 · 2026-09-19', '回执 · 本轮记住 N 件事 + 存为上下文卡', '写入时机是每轮结账，与这行回执同一时刻（② 已定）。⛔ 不在每条消息后写 —— 半句话里的偏好不算数。')
  + sec('折叠 → 展开', '面板底部那一行')
  + state('折叠：一行', frame(COLLAPSED), '这行是<b>现状保持</b>（22 已落地），本轮只给它加一个可展开。')
  + state('展开：逐条', frame(EXPANDED), '每条三个动作。「改」就地编辑；「删」只删这一条；「不要记这类」落一条负规则。')
  + state('点了「不要记这类」之后', frame(AFTER_RULE), '那条划掉 + 底部一行说明「以后不再记这一类」，<b>可撤销</b>。⛔ 不弹确认框 —— 免费可逆的事不值得打断。')
  + sec('记忆 → 上下文卡', '两者之间唯一的桥')
  + frame(TO_CARD, WORKBENCH, 20)
  + cap('点「存为卡」打开的是<b>现有的</b>上下文卡弹层，卡名与摘要按记忆预填，类型默认猜一个但可改。⛔ 不新造一个「记忆转卡」的专用界面。建卡后那条记忆标记为已升格（列表里行尾多一枚卡图标），<b>但不删</b> —— 记忆还在被注入，卡负责被 @ 点名。')

// ═══════ 板 3 · 隐身 ═══════
const dockHeader = (ghost) => `<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid ${BORDER};font-size:12.5px">
  <span style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#c9c9c4,#8a8a86);flex:none"></span>
  <span style="font-weight:600">达妮娅</span>
  ${ghost ? `<span style="display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:999px;background:${MUTEDBG};border:1px solid ${BORDER};font-size:11px;color:#525252">${ic('eyeOff', '#525252', 13)}隐身</span>` : ''}
  <span style="flex:1"></span>${ic('dots', MUTED, 16)}</div>`
const dockMenu = `<div style="position:absolute;right:12px;top:42px;width:200px;background:#fff;border:1px solid ${BORDER};border-radius:12px;box-shadow:${SH_FLOAT};padding:5px;font-size:12.5px;z-index:2">
  ${['人设', '记忆总览', '历史会话'].map((t) => `<div style="padding:7px 9px;border-radius:7px;color:#404040">${t}</div>`).join('')}
  <div style="height:1px;background:${BORDER};margin:4px 0"></div>
  <div style="display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:7px;background:${MUTEDBG}">${ic('eyeOff', FG, 14)}<span style="flex:1">隐身 · 这一轮不记</span><span style="width:26px;height:15px;border-radius:999px;background:${FG};position:relative;flex:none"><span style="position:absolute;top:2px;right:2px;width:11px;height:11px;border-radius:50%;background:#fff"></span></span></div></div>`
const dockShell = (inner, { h = 300, menu = false } = {}) => `<div style="width:420px;height:${h}px;background:#fff;border:1px solid ${BORDER};border-radius:16px;box-shadow:${SH_FLOAT};position:relative;overflow:hidden;display:flex;flex-direction:column">${inner}${menu ? dockMenu : ''}</div>`

const GHOST_OFF = dockShell(`${dockHeader(false)}<div style="flex:1;padding:12px">${msgBlock}</div>
  <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid ${BORDER};font-size:12px;color:#525252">${ic('clip', MUTED, 14)}<span style="flex:1">本轮记住 6 件事</span><span style="color:${FG}">改</span></div>`, { h: 280 })
const GHOST_MENU = dockShell(`${dockHeader(false)}<div style="flex:1;padding:12px;opacity:.5">${msgBlock}</div>`, { h: 280, menu: true })
const GHOST_ON = dockShell(`${dockHeader(true)}<div style="flex:1;padding:12px">${msgBlock}</div>
  <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid ${BORDER};font-size:12px;color:${MUTED}">${ic('eyeOff', MUTED, 14)}<span style="flex:1">这一轮没有记任何事</span></div>`, { h: 280 })
const SENSITIVE = dockShell(`${dockHeader(false)}<div style="flex:1;padding:12px">${msgBlock}</div>
  <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid ${BORDER};font-size:12px;color:#525252">${ic('clip', MUTED, 14)}<span style="flex:1">本轮记住 4 件事</span><span style="color:${FG}">改</span></div>`, { h: 280 })

const GHOST = header('PixelVault · D56a · ④ UI 画板 · 2026-09-19', '隐私 · 自动跳过 + 手动隐身', 'Q4 A：两条互不依赖 —— 自动判断失效时隐身仍兜底，隐身忘了开时类目清单仍兜底。')
  + sec('隐身开关', '⋯ 菜单里一行')
  + state('平时：没有隐身标记', frame(GHOST_OFF))
  + state('⋯ 菜单', frame(GHOST_MENU), '开关和「人设 / 记忆总览 / 历史会话」同一张菜单，分隔线以下单独一档 —— 它改的是<b>行为</b>，不是跳转。')
  + state('开着：头部一枚标记', frame(GHOST_ON), '标记是<b>文字 + 图标的胶囊</b>，⛔ 不用红点（D3 已定：全站不挂红点）。结账那行改说「这一轮没有记任何事」，位置不变。')
  + sec('自动跳过敏感类目', '命中时什么都不说')
  + state('这一轮里有一句敏感的', frame(SENSITIVE), '假设这一轮本来可记 5 条，其中一条命中类目清单 → 回执只说「记住 4 件事」，展开也只有 4 条。<b>⛔ 不写「有 1 条被跳过」</b> —— 那句话本身就指认了你刚说的哪句敏感，是二次泄露。')
  + cap('不记的类目（服务端判断）：身份证件 · 账号密码 / API key · 健康与医疗 · 私密关系 · 财务账户 · 未成年人信息。<b>清单住常量层</b>，⛔ 不散在 prompt 里。命中与否不写进任何日志的明文字段。')
  + sec('④ 之后', '⑤ 代码要落的')
  + cap('1 · 新表 AssistantMemory（text · kind · scope · 溯源三件 · lastUsedAt · pinned）与每域 200 条淘汰。2 · 结账时一次性写 + 去重（规范化字面，<b>本轮不做向量</b>）。3 · 注入：当前域 + 全局的前 N 条，与上下文卡共用预算、卡优先。4 · /settings/assistant 记忆区接真数据（13 只落了空态）。5 · 隐身开关 + 类目清单。<b>⛔ 导出记忆不做</b>（owner 09-19）。')

for (const [name, html] of [
  ['DesignD56Overview.dc.html', page('D56a ④ 记忆总览', OVERVIEW)],
  ['DesignD56Receipt.dc.html', page('D56a ④ 回执', RECEIPT)],
  ['DesignD56Ghost.dc.html', page('D56a ④ 隐身', GHOST)],
]) {
  writeFileSync(join(OUT, name), html)
  console.log('wrote', name)
}
