// D3 ④ · UI 画板：/settings 四分区 + 手机两级 · key 行三态 / 展开 / 面 1 底行 · 入口（侧栏头像 · 最底「设置」· 首页浮岛 · 手机抽屉）
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const FG = 'oklch(14.5% 0 0)', MUTED = '#737373', BORDER = 'oklch(92.2% 0 0)', MUTEDBG = 'oklch(97% 0 0)', WORKBENCH = '#f4f4f1', SUNKEN = '#ebebeb', AMBER = '#a04f00', GREEN = '#16794c', RED = '#b3261e'
const SIDEBAR = '#f7f7f5', SIDEBAR_LINE = '#e8e8e4'
const SH_OVERLAY = '0 1px 2px rgb(0 0 0 / 0.06), 0 18px 44px -18px rgb(0 0 0 / 0.38)'
const SH_FLOAT = '0 1px 2px rgb(0 0 0 / 0.05), 0 8px 28px -12px rgb(0 0 0 / 0.32)'
const SH_CARD = '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.18)'

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
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  caret: '<path d="m6 9 6 6 6-6"/>', chev: '<path d="m9 18 6-6-6-6"/>', plus: '<path d="M5 12h14M12 5v14"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', key: '<circle cx="8" cy="15" r="4"/><path d="m10.9 12.1 9.1-9.1M15 6l3 3"/>',
  images: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>', doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M9 13h6M9 17h6"/>', box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>', id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M14 10h4M14 14h4M6 17c0-2 6-2 6 0"/>', book: '<path d="M4 4h7v16H4zM13 4h7v16h-7z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', check: '<path d="M20 6 9 17l-5-5"/>', logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>', back: '<path d="m15 18-6-6 6-6"/>',
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
const state = (title, inner, note = '') => `<div style="display:inline-block;vertical-align:top;margin:0 24px 24px 0;max-width:1300px"><div style="font-size:13px;font-weight:600;margin-bottom:8px">${esc(title)}</div>${inner}${note ? cap(note) : ''}</div>`
const dot = (c, s = 8) => `<span style="display:inline-block;width:${s}px;height:${s}px;border-radius:50%;background:${c};flex:none"></span>`
const avatar = (s = 28) => `<span style="display:inline-block;width:${s}px;height:${s}px;border-radius:50%;background:linear-gradient(135deg,#c9c9c4,#8a8a86);flex:none"></span>`
const btn = (t, { primary = false, small = false, icon = '' } = {}) => `<span style="display:inline-flex;align-items:center;gap:6px;height:${small ? 28 : 34}px;padding:0 ${small ? 10 : 14}px;border-radius:999px;font-size:${small ? 12.5 : 13}px;font-weight:500;${primary ? `background:${FG};color:#fff` : `background:#fff;color:${FG};border:1px solid ${BORDER}`}">${icon}${esc(t)}</span>`

// ═══════════ 共用：/settings 骨架 ═══════════
const SECTIONS = [['keys', 'API key'], ['usage', '用量'], ['preferences', '偏好'], ['assistant', '助手']]
const settingsShell = (active, content, { w = 1000, h = 620 } = {}) => `<div style="width:${w}px;height:${h}px;background:#fff;border:1px solid ${BORDER};border-radius:14px;display:flex;overflow:hidden;box-shadow:${SH_CARD}">
  <div style="width:200px;border-right:1px solid ${BORDER};padding:22px 14px;display:flex;flex-direction:column;gap:2px">
    <div style="font-size:18px;font-weight:600;padding:0 10px 14px">设置</div>
    ${SECTIONS.map(([k, t]) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px;font-size:13.5px;${k === active ? `background:${MUTEDBG};font-weight:500` : `color:#525252`}">${esc(t)}</div>`).join('')}
    <div style="flex:1"></div>
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;font-size:13px;color:${MUTED}">${ic('logout', MUTED, 15)}退出登录</div>
  </div>
  <div style="flex:1;padding:26px 32px;overflow:hidden">${content}</div>
</div>`
const h2 = (t, right = '') => `<div style="display:flex;align-items:baseline;justify-content:space-between"><div style="font-size:20px;font-weight:600">${esc(t)}</div>${right}</div>`

// ── keys 分区 ──
const PROVIDERS = [
  ['OpenAI', RED, '5 模型', '401 · key 失效 · 2 小时前', '$25.10', 'invalid'],
  ['fal.ai', GREEN, '31 模型', '健康 · 刚校验', '$61.10', 'ok'],
  ['Fish Audio', GREEN, '2 模型', '健康 · 昨天', '$3.20', 'ok'],
  ['火山 Ark', '#c4c4c4', '9 模型', '未配置', '', 'none'],
  ['NovelAI', '#c4c4c4', '4 模型', '未配置', '', 'none'],
  ['ElevenLabs', '#c4c4c4', '2 模型', '未配置', '', 'none'],
]
const keyRow = ([name, c, models, status, spend, kind], { expanded = false, hover = false } = {}) => `<div style="border:1px solid ${hover ? '#a3a3a3' : BORDER};border-radius:10px;background:#fff;overflow:hidden">
  <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;font-size:13.5px">${dot(c)}<span style="font-weight:500;min-width:110px">${esc(name)}</span><span class="tok" style="min-width:70px">${esc(models)}</span><span style="flex:1;font-size:12.5px;color:${kind === 'invalid' ? RED : MUTED}">${esc(status)}</span>${spend ? `<span class="tok" style="color:${MUTED}">${esc(spend)} 本月</span>` : ''}${kind === 'none' ? btn('配置', { small: true }) : kind === 'invalid' ? btn('换一把', { small: true }) : `<span style="color:${MUTED};transform:rotate(${expanded ? 90 : 0}deg);display:inline-flex">${ic('chev', MUTED, 16)}</span>`}</div>
  ${expanded ? `<div style="border-top:1px dashed ${BORDER};padding:10px 14px 12px 36px;display:flex;flex-direction:column;gap:8px;background:${MUTEDBG}">
    ${[['个人', 'fal_••••a3f9', '刚校验', GREEN], ['工作', 'fal_••••c201', '3 天前', GREEN]].map(([l, k, v, cc]) => `<div style="display:flex;align-items:center;gap:12px;font-size:12.5px">${dot(cc, 7)}<span style="min-width:60px;font-weight:500">${l}</span><span class="tok">${k}</span><span style="flex:1;color:${MUTED};font-size:12px">上次校验 ${v}</span><span class="tok" style="color:${MUTED}">重新校验</span>${ic('trash', MUTED, 14)}</div>`).join('')}
    <div style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:${MUTED};margin-top:2px">${ic('plus', MUTED, 14)}加一把（打开面 1）</div>
  </div>` : ''}
</div>`
const keysContent = (opts = {}) => h2('API key', `<span style="font-size:12.5px;color:${MUTED}">全部用你自己的 key · 只有 Gemini 文本走平台</span>`) +
  `<div style="margin-top:18px;display:flex;flex-direction:column;gap:8px">${PROVIDERS.map((p, i) => keyRow(p, { expanded: opts.expanded && i === 1 })).join('')}</div>`

// ── usage 分区 ──
const usageContent = () => h2('用量', `<span class="tok" style="color:${MUTED}">2026-09 · 估算，以各 provider 账单为准</span>`) +
  `<div style="margin-top:18px;border:1px solid ${BORDER};border-radius:10px;overflow:hidden;font-size:13px">
    <div style="display:grid;grid-template-columns:1fr 120px 120px;padding:9px 14px;background:${MUTEDBG};color:${MUTED};font-size:11.5px"><span>provider</span><span style="text-align:right">本月次数</span><span style="text-align:right">估算花费</span></div>
    ${[['fal.ai', '128', '$61.10'], ['OpenAI', '40', '$25.10'], ['Fish Audio', '16', '$3.20'], ['Runner · 自托管', '42 / 300', '¥0 · 10-01 重置']].map(([p, n, c]) => `<div style="display:grid;grid-template-columns:1fr 120px 120px;padding:11px 14px;border-top:1px solid ${BORDER}"><span>${p}</span><span class="tok" style="text-align:right;font-size:12px">${n}</span><span class="tok" style="text-align:right;font-size:12px">${c}</span></div>`).join('')}
    <div style="display:grid;grid-template-columns:1fr 120px 120px;padding:11px 14px;border-top:1px solid ${BORDER};font-weight:500"><span>合计</span><span class="tok" style="text-align:right;font-size:12px">226</span><span class="tok" style="text-align:right;font-size:12px">$89.40</span></div>
  </div>
  <div class="cap" style="max-width:100%">只显数字（Q3 = A）：次数来自现有 usage summary，花费 = 次数 × 该渠道单价累计；没有单价的模型只显次数。不画环、不设预算。</div>`

// ── preferences 分区 ──
const prefRow = (t, v, kind = 'select') => `<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-top:1px solid ${BORDER};font-size:13.5px"><span>${esc(t)}</span>${kind === 'toggle' ? `<span style="width:36px;height:22px;border-radius:11px;background:${v ? FG : '#d4d4d4'};position:relative;display:inline-block"><span style="position:absolute;top:2px;${v ? 'right:2px' : 'left:2px'};width:18px;height:18px;border-radius:50%;background:#fff"></span></span>` : `<span style="display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border:1px solid ${BORDER};border-radius:8px;font-size:12.5px">${esc(v)}${ic('caret', MUTED, 14)}</span>`}</div>`
const prefContent = () => h2('偏好') + `<div style="margin-top:14px;display:flex;flex-direction:column">${prefRow('语言', '简体中文')}${prefRow('显示名', 'fulina')}${prefRow('默认打开', '图片工作台')}${prefRow('生成完成时通知', true, 'toggle')}${prefRow('减少动效', false, 'toggle')}</div>`

// ── assistant 分区 ──
const asstContent = () => h2('助手') +
  `<div style="margin-top:16px"><div class="lab">人设</div><div style="display:flex;gap:6px;margin-top:8px">${['简洁', '标准', '详尽'].map((t, i) => `<span style="display:inline-flex;align-items:center;height:30px;padding:0 12px;border-radius:999px;font-size:12.5px;${i === 1 ? `background:${FG};color:#fff` : `border:1px solid ${BORDER}`}">${t}</span>`).join('')}</div></div>
  <div style="margin-top:22px;display:flex;align-items:baseline;justify-content:space-between"><div class="lab">记忆 · 12 条</div><span style="font-size:12px;color:${MUTED}">隐身模式 <span style="display:inline-block;width:28px;height:16px;border-radius:8px;background:#d4d4d4;vertical-align:middle;position:relative"><span style="position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff"></span></span></span></div>
  <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">${[['喜欢暗色霓虹街景、雨夜', '来自 3 次图片生成'], ['视频常用 Seedance 2.5 · 火山', '来自 5 次选择'], ['角色「小黑」：黑发红雨衣', '来自角色卡']].map(([t, src]) => `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid ${BORDER};border-radius:8px;font-size:13px"><span style="flex:1">${t}</span><span class="tok" style="color:${MUTED}">${src}</span><span style="color:${MUTED};font-size:12px">编辑</span>${ic('trash', MUTED, 14)}</div>`).join('')}</div>
  <div style="margin-top:16px"><div class="lab">不记的类目</div><div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${['地址', '支付信息', '联系方式', '+ 添加'].map((t, i) => `<span style="display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;font-size:12px;${i === 3 ? `color:${MUTED};border:1px dashed ${BORDER}` : `background:${MUTEDBG}`}">${t}</span>`).join('')}</div></div>
  <div class="cap" style="max-width:100%;border:1px dashed ${AMBER}99;border-radius:8px;padding:8px 10px;color:${AMBER}">记忆数据形状依赖 56；本轮先出 UI 与空态「还没有记忆 · 用助手聊几次就会出现」。</div>`

// ── 手机 ──
const phone = (inner, { h = 560 } = {}) => `<div style="width:390px;height:${h}px;border-radius:32px;background:#fff;position:relative;overflow:hidden;border:1px solid ${BORDER};box-shadow:${SH_CARD}">${inner}</div>`
const mobileList = phone(`<div style="padding:18px 16px"><div style="display:flex;align-items:center;gap:10px;font-size:20px;font-weight:600">${ic('back', FG, 20)}设置</div>
  <div style="margin-top:18px;border:1px solid ${BORDER};border-radius:12px;overflow:hidden">${SECTIONS.map(([k, t], i) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 14px;font-size:15px;${i ? `border-top:1px solid ${BORDER}` : ''}"><span>${t}</span><span style="display:flex;align-items:center;gap:8px;color:${MUTED};font-size:12.5px">${k === 'keys' ? `<span style="display:inline-flex;align-items:center;gap:5px">${dot(RED, 7)}1 把失效</span>` : ''}${ic('chev', MUTED, 16)}</span></div>`).join('')}</div>
  <div style="margin-top:22px;display:flex;align-items:center;gap:8px;font-size:14px;color:${MUTED};padding:0 4px">${ic('logout', MUTED, 16)}退出登录</div></div>`, { h: 420 })
const mobileKeys = phone(`<div style="padding:18px 16px"><div style="display:flex;align-items:center;gap:10px;font-size:20px;font-weight:600">${ic('back', FG, 20)}API key</div>
  <div style="margin-top:14px;display:flex;flex-direction:column;gap:8px">${PROVIDERS.slice(0, 4).map(([name, c, models, status, spend, kind]) => `<div style="display:flex;align-items:center;gap:10px;padding:12px 12px;border:1px solid ${BORDER};border-radius:10px;font-size:14px">${dot(c)}<div style="flex:1;min-width:0"><div style="font-weight:500">${name}</div><div style="font-size:12px;color:${kind === 'invalid' ? RED : MUTED};margin-top:2px">${models} · ${status}</div></div>${kind === 'none' ? btn('配置', { small: true }) : ic('chev', MUTED, 16)}</div>`).join('')}</div></div>`, { h: 420 })

const SETTINGS = header('PixelVault · D3 ④ · /settings · 2026-09-18', '/settings 整页 · 四分区各一版 + 手机两级', 'Q1 = A：左 200px 分区导航 + 右内容；/settings 重定向 /settings/keys；退出登录在导航最底。手机：一级列表 → 二级页，返回键回列表。所有 key 相关文字只在这一页出现「失效」——入口处不挂红点（Q6）。') +
  sec('keys · API key（默认落点）', 'Q2 = A 按 provider 一行') + `<div style="margin-top:10px">${frame(settingsShell('keys', keysContent()))}</div>` +
  cap('行 = 健康点 · provider · 解锁 N 模型 · 状态一句 · 本月花费 · 动作。排序：失效 → 已配 → 未配置。失效行动作「换一把」= 面 1；未配置行「配置」= 面 1；已配行点开管多把 key（见 key 行画板）。') +
  sec('usage · 用量', 'Q3 = A 只显数字') + `<div style="margin-top:10px">${frame(settingsShell('usage', usageContent()))}</div>` +
  sec('preferences · 偏好', '从头像菜单搬来') + `<div style="margin-top:10px">${frame(settingsShell('preferences', prefContent()))}</div>` +
  sec('assistant · 助手', 'Q4 = A 人设 · 记忆 · 隐身 · 不记的类目') + `<div style="margin-top:10px">${frame(settingsShell('assistant', asstContent(), { h: 660 }))}</div>` +
  sec('手机', '一级列表 → 二级页') + `<div style="margin-top:10px;display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">${mobileList}${mobileKeys}<div class="cap" style="max-width:380px">一级列表每行右侧只给一句摘要（key 行「1 把失效」是唯一会出现「失效」二字的地方，仍然不是红点）；二级页与桌面同一组件，行内动作同桌面。</div></div>`

// ═══════════ key 行 · 三态 / 展开 / 面 1 底行 ═══════════
const KEYS = header('PixelVault · D3 ④ · key 行 · 2026-09-18', 'key 行三态 · hover · 展开态 · 面 1 底部「管理全部 key →」', '同一条行组件在 /settings/keys 与手机二级页复用。健康点沿用选择器渠道面板的语义：绿 = 可用，红 = 失效（401 / 403），灰 = 未配置。黄点（缺 key）只在选择器里出现，这里没有「缺」只有「未配置」。') +
  sec('三态 + hover') + `<div style="margin-top:10px;display:flex;flex-direction:column;gap:10px;max-width:860px">
    ${keyRow(PROVIDERS[1])}${keyRow(PROVIDERS[0])}${keyRow(PROVIDERS[3])}${keyRow(PROVIDERS[2], { hover: true })}
  </div>` + cap('健康 · 失效 · 未配置 · hover（1px 深描边，不换底）。失效行的状态句用 --destructive 文字，其它都是 muted；花费只在有单价的 provider 上出现。') +
  sec('展开态 · 一家多把 key') + `<div style="margin-top:10px;max-width:860px">${keyRow(PROVIDERS[1], { expanded: true })}</div>` + cap('点已配置行的 › 展开：每把 key 一行（标签 · 末四位 · 上次校验 · 重新校验 · 删除）+「加一把」= 面 1。删除最后一把时该 provider 回到未配置。') +
  sec('面 1 · 底部新增一行', 'QuickSetupDialog 唯一改动') + `<div style="margin-top:10px">${frame(`<div style="width:400px;background:#fff;border:1px solid ${BORDER};border-radius:14px;box-shadow:${SH_OVERLAY};padding:18px 20px;font-size:12.5px;line-height:1.5"><div style="font-size:15px;font-weight:600">设置 fal.ai</div><div style="color:${MUTED};margin-top:3px">2 分钟获取 API key，解锁该模型。</div><div style="margin-top:14px;border:1px solid ${BORDER};border-radius:10px;background:${MUTEDBG};padding:10px 12px"><div style="font-weight:500">1. 获取 API key</div><div style="margin-top:4px;display:flex;align-items:center;gap:5px;color:#2563eb">fal.ai ${ic('external', '#2563eb', 13)}</div></div><div style="margin-top:12px;font-weight:500">2. 粘贴到这里</div><div style="margin-top:6px;height:36px;border:1px solid ${BORDER};border-radius:8px;display:flex;align-items:center;padding:0 12px;color:#b0b0b0">粘贴你的 API key...</div><div style="margin-top:12px;font-weight:500">3. 自定义名称</div><div style="margin-top:6px;height:36px;border:1px solid ${BORDER};border-radius:8px;display:flex;align-items:center;padding:0 12px">Kling O3 Pro · fal</div><div style="margin-top:14px;height:38px;border-radius:10px;background:${MUTEDBG};color:${MUTED};display:flex;align-items:center;justify-content:center;font-weight:500">验证并激活</div><div style="margin-top:12px;padding-top:10px;border-top:1px dashed ${BORDER};display:flex;justify-content:center;font-size:12.5px;color:${MUTED}">管理全部 key →</div></div>`, WORKBENCH, 22)}</div>` +
  cap('弹层内容原样，只在底部加一行灰字链接跳 /settings/keys。从选择器渠道面板黄点、生成键「缺 key」、空态引导卡（52）三处打开的都是这同一个弹层。')

// ═══════════ 入口 ═══════════
const NAV_GO = [['images', '画廊'], ['doc', '提示词'], ['box', '素材'], ['id', '卡片管理'], ['book', '故事']]
const sidebar = ({ collapsed = false, h = 520 } = {}) => `<div style="width:${collapsed ? 56 : 160}px;height:${h}px;background:${SIDEBAR};border-right:1px solid ${SIDEBAR_LINE};border-radius:12px 0 0 12px;display:flex;flex-direction:column;padding:12px ${collapsed ? 10 : 12}px;box-sizing:border-box">
  <div style="display:flex;align-items:center;justify-content:${collapsed ? 'center' : 'space-between'};gap:8px;height:36px">${collapsed ? '' : `<span style="font-weight:700;font-size:15px;letter-spacing:-.02em">PV</span>`}${avatar(28)}</div>
  ${collapsed ? '' : `<div class="lab" style="margin:16px 8px 6px">前往</div>`}
  ${NAV_GO.map(([k, t], i) => `<div style="display:flex;align-items:center;gap:10px;height:32px;padding:0 8px;border-radius:8px;font-size:13px;color:#404040;${i === 0 ? 'background:#e9e9e5;color:' + FG : ''};justify-content:${collapsed ? 'center' : 'flex-start'}">${ic(k, 'currentColor', 16)}${collapsed ? '' : t}</div>`).join('')}
  ${collapsed ? '' : `<div class="lab" style="margin:14px 8px 6px">工具</div>`}
  ${['图片', '视频', '画布'].map((t) => `<div style="display:flex;align-items:center;gap:10px;height:32px;padding:0 8px;border-radius:8px;font-size:13px;color:#404040;justify-content:${collapsed ? 'center' : 'flex-start'}">${ic('images', 'currentColor', 16)}${collapsed ? '' : t}</div>`).join('')}
  <div style="flex:1"></div>
  <div style="display:flex;align-items:center;gap:10px;height:36px;padding:0 8px;border-radius:8px;font-size:13px;color:#404040;justify-content:${collapsed ? 'center' : 'flex-start'};border-top:1px solid ${SIDEBAR_LINE};border-radius:0;padding-top:8px;margin:0 -4px;padding-left:12px">${ic('gear', 'currentColor', 16)}${collapsed ? '' : '设置'}</div>
</div>`
const shell = (side, w = 560) => `<div style="display:flex;width:${w}px;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;background:#fff">${side}<div style="flex:1;background:#fff"></div></div>`
const island = (signedIn = true) => `<div style="display:inline-flex;align-items:center;gap:10px;height:44px;padding:0 8px 0 16px;border-radius:999px;background:color-mix(in oklab,#fff 78%,transparent);backdrop-filter:blur(14px);border:1px solid rgba(0,0,0,.08);box-shadow:${SH_FLOAT};font-size:13px"><span style="font-weight:700">PV</span><span style="width:1px;height:18px;background:${BORDER}"></span><span style="color:#525252">画廊</span><span style="color:#525252">工作台</span><span style="width:1px;height:18px;background:${BORDER}"></span>${signedIn ? `${ic('gear', MUTED, 16)}${avatar(28)}` : `<span style="display:inline-flex;align-items:center;height:30px;padding:0 12px;border-radius:999px;background:${FG};color:#fff;font-size:12.5px">登录</span>`}</div>`
const mobileTop = `<div style="width:390px;height:120px;border-radius:24px 24px 0 0;background:${SUNKEN};position:relative;overflow:hidden"><div style="position:absolute;left:8px;right:8px;top:10px;height:36px;border-radius:18px;background:#e2e2de;display:flex;align-items:center;padding:0 4px;gap:6px"><span style="width:36px;height:36px;display:flex;align-items:center;justify-content:center">${ic('menu', FG, 18)}</span><span style="flex:1;text-align:center;font-size:14px;font-weight:600">画廊 ${ic('caret', MUTED, 12).replace('display:block', 'display:inline-block;vertical-align:-2px')}</span>${avatar(30)}</div></div>`
const mobileDrawer = `<div style="width:390px;height:420px;border-radius:0 0 24px 24px;background:${SUNKEN};position:relative;overflow:hidden"><div style="position:absolute;inset:0;background:rgba(0,0,0,.18)"></div><div style="position:absolute;left:0;top:0;bottom:0;width:280px;background:#fff;padding:16px 14px;display:flex;flex-direction:column;box-shadow:${SH_OVERLAY}"><div style="display:flex;align-items:center;gap:10px">${avatar(32)}<div><div style="font-size:14px;font-weight:600">fulina</div><div style="font-size:11.5px;color:${MUTED}">查看主页 →</div></div></div><div class="lab" style="margin:16px 6px 6px">前往</div>${NAV_GO.map(([k, t]) => `<div style="display:flex;align-items:center;gap:10px;height:40px;padding:0 8px;font-size:15px">${ic(k, 'currentColor', 18)}${t}</div>`).join('')}<div style="flex:1"></div><div style="display:flex;align-items:center;gap:10px;height:44px;padding:0 8px;font-size:15px;border-top:1px solid ${BORDER}">${ic('gear', 'currentColor', 18)}设置</div></div></div>`

const ENTRY = header('PixelVault · D3 ④ · 入口 · 2026-09-18', '侧栏顶端头像 · 最底「设置」· 首页浮岛 · 手机', 'Q5 = A3 + Q6 定案：头像 → 个人主页，「设置」→ /settings，都不弹菜单，任何地方不挂红点。原侧栏底部「积分读数 + 头像菜单」整行删；右上角整条让给助手。') +
  sec('桌面侧栏', '展开 160px · 折叠 56px') + `<div style="margin-top:10px;display:flex;gap:28px;flex-wrap:wrap;align-items:flex-start">
    ${state('展开', shell(sidebar()), '顶端一行：PV 字标 + 头像 28px（点击 → /u/用户名）。导航分组不变。最底一行「设置」独占，上有 1px 分隔线，与导航项同高同字号，hover 同导航项。')}
    ${state('折叠', shell(sidebar({ collapsed: true }), 380), '折叠成图标列：顶端只剩头像；底部只剩齿轮；tooltip 分别写「主页」「设置」。')}
  </div>` +
  sec('首页浮岛胶囊', '14 的两态') + `<div style="margin-top:10px;display:flex;gap:28px;flex-wrap:wrap;align-items:flex-start">
    ${state('已登录', frame(island(true), SUNKEN, 26), '胶囊右端：齿轮（→ /settings）+ 头像（→ 主页）。不显额度、不显 key 数。')}
    ${state('未登录', frame(island(false), SUNKEN, 26), '右端只有「登录」。')}
  </div>` +
  sec('手机', 'MobileShell 顶栏胶囊 + 抽屉') + `<div style="margin-top:10px;display:flex;gap:28px;flex-wrap:wrap;align-items:flex-start">
    ${state('顶栏胶囊', mobileTop, '右端头像 → 主页；左端菜单开抽屉。')}
    ${state('抽屉', mobileDrawer, '抽屉顶部是「我」（头像 · 显示名 · 查看主页）；最底一行「设置」→ /settings；抽屉里没有 key 数、没有红点。')}
  </div>` +
  sec('删掉的') + cap(`<span style="color:${RED}">●</span> 侧栏底部账户行（SidebarFooterCreditBadge + SidebarFooterUserMenu）· ApiKeyDrawerTrigger 抽屉 · ShellApiKeys 第二入口 · StudioApiRoutesSection · 头像菜单（查看主页 / API 密钥 / 退出登录）。⌘K「配置 key」动作改为跳 /settings/keys。`)

for (const [name, html] of [
  ['DesignD3Settings.dc.html', page('D3 ④ /settings', SETTINGS)],
  ['DesignD3Keys.dc.html', page('D3 ④ key 行', KEYS)],
  ['DesignD3Entry.dc.html', page('D3 ④ 入口', ENTRY)],
]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
