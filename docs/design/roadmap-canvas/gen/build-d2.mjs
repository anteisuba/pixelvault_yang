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
  ['GPT Image', '2.5 Flare', '$0.04 / 张', 'key', FG, true],
  ['GPT Image', '2.5 Sunburst', '$0.08 / 张', 'key', FG, false],
  ['Seedream', '5.0 Pro', '$0.03 / 张', 'auto', FG, false],
  ['Seedream', '5.0 Lite', '$0.02 / 张', 'auto', FG, false],
  ['Kling', 'O3 Pro', '缺 key', 'missing', AMBER, false],
]
const groupHead = (t) => `<div class="lab" style="margin:10px 10px 4px">${esc(t)}</div>`
const row = ([m, v, p, k, c, sel], opts = {}) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;background:${sel ? MUTEDBG : 'transparent'};position:relative">
  <div style="flex:1;min-width:0;display:flex;align-items:baseline;gap:8px"><span style="font-size:13px;font-weight:500">${esc(m)}</span><span style="font-size:13px;color:#525252">${esc(v)}</span></div>
  <span class="tok" style="color:${c === FG ? MUTED : c}">${esc(p)}</span>
  ${opts.rowIcon ? `<span style="width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:${c === FG ? MUTED : c};background:${opts.hoverOn && sel ? MUTEDBG : 'transparent'}">${ic(k, c === FG ? MUTED : c)}</span>` : ''}
  ${sel ? `<span style="color:${FG}">${ic('check')}</span>` : ''}
  ${opts.hoverOn && sel ? `<div style="position:absolute;right:-232px;top:-6px;width:216px;background:#fff;border:1px solid ${BORDER};border-radius:10px;box-shadow:${SH_FLOAT};padding:8px;font-size:12px;z-index:2">
     <div class="lab" style="margin:2px 6px 6px">渠道 · 这条模型</div>
     ${[['key', '自己的 key', 'OpenAI · 健康', true], ['platform', '平台额度', '剩 12 张', false], ['auto', '自动', 'userKey › 额度 › 最便宜', false]].map(([kk, t, s, on]) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 6px;border-radius:6px;background:${on ? MUTEDBG : 'transparent'}">${ic(kk, MUTED)}<span style="flex:1">${esc(t)}</span><span class="tok" style="color:${MUTED}">${esc(s)}</span>${on ? ic('check') : ''}</div>`).join('')}
     <div style="height:1px;background:${BORDER};margin:6px"></div>
     <div style="padding:4px 6px;font-size:11.5px;color:${MUTED}">hover 行末图标出现 · 点击固定 · 按型号记住</div>
   </div>` : ''}
</div>`
const picker = (body, footer = '') => `<div style="width:380px;background:#fff;border:1px solid ${BORDER};border-radius:12px;box-shadow:${SH_OVERLAY};padding:6px;position:relative">
  <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:${MUTEDBG};color:${MUTED};font-size:12.5px">${ic('search')}搜型号…</div>
  ${body}${footer}</div>`
const bodyRows = (opts) => groupHead('最近') + row(rows[0], opts) + row(rows[2], opts) + groupHead('GPT Image') + row(rows[1], opts) + groupHead('Seedream') + row(rows[3], opts) + groupHead('Kling') + row(rows[4], opts)

const optA = picker(bodyRows({ rowIcon: true, hoverOn: true }))
const optB = picker(bodyRows({ rowIcon: false }), `<div style="height:1px;background:${BORDER};margin:6px 8px"></div>
  <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:${MUTEDBG}">${ic('key', MUTED)}<span style="font-size:12.5px;flex:1">渠道 · <b>自己的 key</b> <span style="color:${MUTED}">· OpenAI · 健康</span></span>${ic('caret', MUTED)}</div>
  <div style="position:absolute;left:6px;right:6px;bottom:-124px;background:#fff;border:1px solid ${BORDER};border-radius:10px;box-shadow:${SH_FLOAT};padding:6px;font-size:12px;z-index:2">
     ${[['key', '自己的 key', 'OpenAI · 健康', true], ['platform', '平台额度', '剩 12 张', false], ['auto', '自动', 'userKey › 额度 › 最便宜', false]].map(([kk, t, s, on]) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;background:${on ? MUTEDBG : 'transparent'}">${ic(kk, MUTED)}<span style="flex:1">${esc(t)}</span><span class="tok" style="color:${MUTED}">${esc(s)}</span>${on ? ic('check') : ''}</div>`).join('')}
     <div style="padding:4px 8px;font-size:11.5px;color:${MUTED}">点底栏展开 · 跟随当前高亮的型号</div>
  </div>`)

const cmp = (title, mock, pros, cons, extraH = 0) => `<div style="flex:1;min-width:560px">
  <div style="font-size:14px;font-weight:600;margin-bottom:8px">${esc(title)}</div>
  <div style="background:${WORKBENCH};border-radius:16px;padding:22px 22px ${22 + extraH}px;display:flex;justify-content:flex-start">${mock}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;font-size:12px;line-height:1.55">
    <div><div style="color:${GREEN};font-weight:600;margin-bottom:4px">好在</div>${pros.map((x) => `<div>· ${esc(x)}</div>`).join('')}</div>
    <div><div style="color:${RED};font-weight:600;margin-bottom:4px">代价</div>${cons.map((x) => `<div>· ${esc(x)}</div>`).join('')}</div>
  </div></div>`

const Q1 = header('PixelVault · D2 · ① 反问 Q1 对照 · 2026-09-17', '渠道 / key 态放哪：A 行末图标 + hover · B 弹层底栏常驻', '行本身按批注 32 只有 模型 · 型号 · 价格。两图都是「当前高亮 GPT Image 2.5 Flare，用自己的 key」这一刻。C（只在生成按钮文案体现）已按你的意见排除。') +
  `<div style="display:flex;gap:28px;margin-top:14px;flex-wrap:wrap">
    ${cmp('A · 行末一枚小图标，hover 出渠道浮层', optA, ['每行各自带态：一眼看出哪条缺 key、哪条走自动，不用逐个高亮', '不占弹层高度；渠道浮层只在需要时出现', '缺 key 那行图标直接就是入口，点了弹面 1 配置'], ['图标是第四个信息（模型 · 型号 · 价格 · 态），行变密；批注 32 要的「只三件」被轻微破坏', '手机没有 hover，要改成点图标；浮层靠右溢出要处理', '每行一枚同形图标，列表看起来会有一列小钥匙'])}
    ${cmp('B · 弹层底部一行常驻「渠道」，点开切换', optB, ['行严格只剩三件，列表最干净', '渠道是「这次生成」的全局设置，放底栏符合语义；也是方案 ① 的原始形态', '手机同构：底栏就是 Sheet 的最后一行'], ['只能看到当前高亮型号的态，其他型号缺不缺 key 要挨个选才知道（缺 key 行的价格位写「缺 key」可补一半）', '弹层多一行 40px', '渠道与型号分两处，新手可能不知道它们是一对'], 130)}
  </div>` +
  note('我的建议', 'B 为主，借 A 的一点：', ['列表用 B（干净 + 手机同构）；缺 key 的行价格位写「缺 key」（已在图里），这样 A 最重要的那个信息也在。', '底栏只显示当前高亮型号的渠道；切型号时底栏跟着变，这就是「它们是一对」的提示。', '你如果更看重「一眼看全局哪些缺 key」，选 A，那就把行末图标只在 缺 key / 平台额度 两种非默认态出现，默认态不画，行仍是三件。'])

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
      { k: 'leaf', s: 'open', t: 'Q1 渠道 / key 态：A 行末图标 vs B 底栏常驻 —— 见左侧对照图，等你选' },
    ] },
    { k: 'cat', t: '选择器（10）', c: [
      { k: 'sub', t: '行', c: [ { k: 'leaf', t: '模型 · 型号 · 价格 三件（批注 32）；价格位在缺 key 时写「缺 key」并用 warning 色；选中态 --muted 底 + 对勾' } ] },
      { k: 'sub', t: '结构', c: [ { k: 'leaf', t: '搜索框 → 最近 ≤3 → 按厂商分组（GPT Image · Gemini · FLUX · Seedream · NAI · Runner）；画布多一层「本项目常用」可选' }, { k: 'leaf', t: '渠道：Q1 定；健康度失效时渠道区提示「上次选的 X 已不可用，已回到自动」（方案 ①）' } ] },
      { k: 'sub', t: '宿主', c: [ { k: 'leaf', t: '工作台参数栏触发器 · 画布 NodeModelChip · 助手模型 chip · 配音间模型 chip · LoRA 底模弹窗 → 全走同一 Popover / Sheet；只换触发器外观' } ] },
      { k: 'sub', t: '删', c: [ { k: 'leaf', s: 'gap', t: 'BaseModelPickerPanel（三层钻取）· business/ModelSelector（零消费者）· StudioMobileModelSheet 独立实现 → 合进同一个 ResponsivePopover' } ] },
    ] },
    { k: 'cat', t: '能力驱动表单（11）', c: [
      { k: 'sub', t: '两区', c: [ { k: 'leaf', t: '通用区固定顺序：提示词 · 参考轨 · 规格 chip · 张数；任何模型都在同一位置' }, { k: 'leaf', t: '专属区 = 第二行 chip：GPT（透明底 · 输入保真）· Gemini（对话式改图）· FLUX（多参考）· Seedream（组图 · 图层）· NAI（质量标签 · UC · 多人）；没有专属的模型不出现这一行' } ] },
      { k: 'sub', t: '切模型', c: [ { k: 'leaf', t: '通用区值保留；专属区整组换；不兼容的值回默认并出一行提示「已切到 X · 负面词不再生效」，0.2s 后可撤销' }, { k: 'leaf', t: '参考轨按模型上限裁剪（NAI 1 · Seedream 10 · FLUX 多）：多出的灰显不删' } ] },
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
      { k: 'leaf', t: '表单：图片工作台 × 五家模型的专属行各一版 + 切模型过渡帧' },
      { k: 'leaf', t: '规格：chip 三态 + 弹层（图片 / 视频两版）+ 手机 Sheet' },
    ] },
  ],
}
const MAP = header('PixelVault · D2 · ② 思维导图 · 2026-09-17', 'D2 决策树 · Q2–Q5 已定，Q1 待选', '① 反问五题你答了四题，Q1 要看图。这棵树按你的答案画好，Q1 那条叶子留黄色虚线；你选完我补上就进 ④。') + tree(D2, 255)

for (const [name, html] of [
  ['DesignD2Q1.dc.html', page('D2 Q1 对照', Q1)],
  ['DesignD2Map.dc.html', page('D2 思维导图', MAP)],
]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
