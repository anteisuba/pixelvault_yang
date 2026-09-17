// D1 ④ · 视觉语言总板（VisualLanguage.dc.html）+ 三个真实场景套用（VisualScenes.dc.html）
// 全部取自 src/app/globals.css 现有 token；新增只有 --modality-text 与四档阴影收口提案。
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const FG = 'oklch(14.5% 0 0)', MUTED = '#737373', BORDER = 'oklch(92.2% 0 0)', MUTEDBG = 'oklch(97% 0 0)', SUNKEN = '#ebebeb', WORKBENCH = '#f4f4f1'
// 现有 token
const MOD = { image: 'oklch(46% 0.08 292)', video: 'oklch(46% 0.09 255)', audio: 'oklch(46% 0.09 10)', text: 'oklch(46% 0.07 160)' /* 新增提案 */ }
const MODL = { image: 'oklch(94% 0.03 292)', video: 'oklch(94% 0.03 255)', audio: 'oklch(94% 0.03 10)', text: 'oklch(94% 0.03 160)' }
const ST = { applied: ['#16794c', '#f0f7f2'], warning: ['#a04f00', '#fbf3ea'], risk: ['#b3261e', '#fbeeed'] }
// 四档阴影收口提案（从现有 11 个里挑代表值）
const SH = {
  card: '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.18)', // = node-card
  float: '0 1px 2px rgb(0 0 0 / 0.05), 0 8px 28px -12px rgb(0 0 0 / 0.32)', // = node-chrome
  overlay: '0 1px 2px rgb(0 0 0 / 0.06), 0 18px 44px -18px rgb(0 0 0 / 0.38)', // = node-menu / assistant-overlay
  pressed: '0 1px 2px rgb(0 0 0 / 0.04)', // = assistant-card
}
const GLASS = 'background:color-mix(in oklab, #fff 70%, transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);'

const STYLE = `
  body { margin:0; background:#fff; color:${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing:antialiased; }
  h1 { margin:8px 0 0; font-size:26px; font-weight:600; letter-spacing:-.01em; line-height:1.2 }
  .eyebrow { ${MONO} font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:${MUTED} }
  .sub { margin:8px 0 0; font-size:14px; line-height:1.6; color:#525252; max-width:1000px }
  .sec { margin-top:30px; display:flex; align-items:baseline; gap:12px } .sec b { font-size:16px; font-weight:600 } .sec span { font-size:12px; color:${MUTED} }
  .lab { ${MONO} font-size:10.5px; letter-spacing:.05em; color:${MUTED}; margin-top:6px }
  .tok { ${MONO} font-size:10.5px; color:#525252 }
  svg.ic { width:24px; height:24px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; display:block }
  svg.ic.s16 { width:16px; height:16px } svg.ic.s20 { width:20px; height:20px }
`
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><script src="./support.js"></script></head>
<body><x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;family=Fraunces:wght@500;600&amp;family=Noto+Sans+SC:wght@400;500;600&amp;display=swap"><style>${STYLE}</style></helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">${body}</div></x-dc></body></html>
`
const header = (eyebrow, title, sub) => `<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>`
const note = (n, q, a) => `<div style="margin-top:14px;display:grid;grid-template-columns:200px 1fr;border:1px solid oklch(0.85 0.08 85);border-radius:10px;overflow:hidden;background:#fff"><div style="padding:12px 14px;background:oklch(0.97 0.04 85);border-right:1px solid oklch(0.85 0.08 85)"><div style="${MONO}font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:oklch(0.45 0.1 85)">owner 批注 ${n}</div><div style="margin-top:6px;font-size:13px;line-height:1.5;color:#404040">${esc(q)}</div></div><div style="padding:12px 14px;font-size:12.5px;line-height:1.6">${a.map((x) => `<div style="display:flex;gap:8px"><span style="color:#737373">·</span><span>${esc(x)}</span></div>`).join('')}</div></div>`
const sec = (t, s = '') => `<div class="sec"><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ''}</div>`

// ─── 自绘业务图标（24 网格 · 线宽 2 · round）───
const I = {
  // 节点四类
  nodeText: '<path d="M5 6h14M5 12h10M5 18h7"/><path d="M19 15v6M16 18h6"/>',
  nodeImage: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
  nodeAudio: '<path d="M4 12v1M8 8v8M12 5v14M16 9v6M20 11v2"/>',
  nodeVideo: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10l5-3v10l-5-3"/>',
  // 卡片四锚 + 状态
  anchorText: '<path d="M7 5h10M12 5v14M9 19h6"/>',
  anchorImage: '<circle cx="12" cy="9" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  anchorVoice: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/>',
  anchorStyle: '<path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-2.7L7 19l1-6-4-4 5.5-.5z"/>',
  cardDraft: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 7l3 3"/>',
  cardStable: '<circle cx="12" cy="12" r="8"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  // 任务五态
  taskQueued: '<circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/>',
  taskCold: '<path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18"/>',
  taskGenerating: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v4h-4"/>',
  taskArchived: '<rect x="3" y="5" width="18" height="5" rx="1.5"/><path d="M5 10v9h14v-9M10 14h4"/>',
  taskFailed: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/>',
  // 渠道 / key
  chAuto: '<path d="M4 17l4-10 4 10M6 14h4"/><path d="M14 7h6M17 7v10"/>',
  chOwnKey: '<circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M16 4l3 3M13 7l3 3"/>',
  chPlatform: '<path d="M4 8h16M4 12h16M4 16h16"/><circle cx="18" cy="6" r="2" fill="currentColor" stroke="none"/>',
  chInvalid: '<circle cx="8" cy="14" r="4"/><path d="M11 11l9-9"/><path d="M15 3l6 6" stroke-dasharray="2 2"/>',
}
const ic = (k, size = 24, color = 'currentColor') => `<svg class="ic ${size === 16 ? 's16' : size === 20 ? 's20' : ''}" viewBox="0 0 24 24" style="color:${color}">${I[k]}</svg>`
// lucide 对照（手抄两枚，看混排）
const L = {
  plus: '<path d="M5 12h14M12 5v14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
}
const lic = (k, size = 24, color = 'currentColor') => `<svg class="ic ${size === 16 ? 's16' : size === 20 ? 's20' : ''}" viewBox="0 0 24 24" style="color:${color}">${L[k]}</svg>`

// ─── 1 · 四层材质叠放 ───
const layers = `<div style="display:grid;grid-template-columns:1.3fr 1fr;gap:24px;margin-top:12px;align-items:start">
  <div style="background:${SUNKEN};border-radius:16px;padding:22px;position:relative;min-height:340px">
    <div class="lab" style="margin:0 0 10px">① 底 · --surface-sunken #ebebeb（壳底）/ --surface-workbench #f4f4f1（工作台）</div>
    <div style="background:#fff;border:1px solid ${BORDER};border-radius:16px;padding:18px;box-shadow:${SH.card};min-height:250px;position:relative">
      <div class="lab" style="margin:0">② 卡 · 白 + --border + shadow-card</div>
      <div style="position:absolute;left:18px;bottom:18px;display:flex;gap:6px;align-items:center;padding:6px 8px;border-radius:12px;${GLASS}box-shadow:${SH.float};border:1px solid rgba(0,0,0,.06)">
        ${lic('plus', 16)}${ic('nodeImage', 16)}${ic('nodeVideo', 16)}<span style="width:1px;height:14px;background:${BORDER}"></span>${lic('search', 16)}
        <span class="lab" style="margin:0 0 0 6px">③ 浮层 · 磨砂 + shadow-float</span>
      </div>
      <div style="position:absolute;right:18px;top:52px;width:220px;background:#fff;border:1px solid ${BORDER};border-radius:12px;box-shadow:${SH.overlay};padding:6px">
        <div class="lab" style="margin:2px 6px 6px">④ 弹层 · 实底 + shadow-overlay</div>
        ${['再来一张', '进画布', '存为配方', '下载'].map((t, i) => `<div style="padding:7px 10px;border-radius:8px;font-size:13px;background:${i === 1 ? MUTEDBG : 'transparent'}">${t}</div>`).join('')}
      </div>
    </div>
  </div>
  <div>
    <table style="border-collapse:collapse;width:100%;font-size:12.5px;line-height:1.5">
      <tr><th style="text-align:left;padding:6px 8px;border-bottom:1px solid #d4d4d4;font-size:11px;color:${MUTED};font-weight:500;letter-spacing:.06em">层</th><th style="text-align:left;padding:6px 8px;border-bottom:1px solid #d4d4d4;font-size:11px;color:${MUTED};font-weight:500;letter-spacing:.06em">面</th><th style="text-align:left;padding:6px 8px;border-bottom:1px solid #d4d4d4;font-size:11px;color:${MUTED};font-weight:500;letter-spacing:.06em">影（收口后 4 个 token）</th></tr>
      ${[
        ['① 底', '--surface-sunken / --surface-workbench · 无边无影', '—'],
        ['② 卡', '--background + --border', '--shadow-card ← node-card / shell-card / assistant-card'],
        ['③ 浮层', '--surface-glass（70% 白 + blur 14）', '--shadow-float ← node-chrome / sidebar-chip'],
        ['④ 弹层', '--popover 实底 + --border', '--shadow-overlay ← node-menu / assistant-overlay / assistant-panel'],
        ['按下 / 贴边', '任意面', '--shadow-pressed ← assistant-card / node-trim-window'],
      ].map((r) => `<tr>${r.map((c, i) => `<td style="padding:7px 8px;border-bottom:1px solid #ececec;${i === 0 ? 'font-weight:500;white-space:nowrap' : ''}${i === 2 ? MONO + 'font-size:11px' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}
    </table>
    <div style="margin-top:12px;font-size:12px;line-height:1.6;color:#525252">规则：层级靠<b>面的明度 + 描边</b>分，影只表达「浮起多少」；同一屏最多两层带影；弹层不用磨砂（可读性）。这就是现在助手面板 §12.1 与画布节点卡已经在用的规则，只是把 11 个 token 收成 4 个名字。</div>
  </div>
</div>`

// ─── 2 · 四色 × 两版 + 三档状态 ───
const sw = (bg, fg, label, tok) => `<div style="flex:1;min-width:120px"><div style="height:56px;border-radius:10px;background:${bg};display:flex;align-items:center;justify-content:center;color:${fg};font-size:13px;font-weight:500">${esc(label)}</div><div class="tok" style="margin-top:6px">${esc(tok)}</div></div>`
const colors = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:12px">
  <div>
    <div class="lab" style="margin:0 0 8px">模态色 · 深版（文字 / 图标 / 端口）· 淡版（底 / 标签）</div>
    <div style="display:flex;gap:10px">${sw(MOD.image, '#fff', '图 image', '--modality-image · 292')}${sw(MOD.video, '#fff', '视 video', '--modality-video · 255')}${sw(MOD.audio, '#fff', '声 audio', '--modality-audio · 10')}${sw(MOD.text, '#fff', '文 text', '--modality-text · 160 · 新增')}</div>
    <div style="display:flex;gap:10px;margin-top:10px">${sw(MODL.image, MOD.image, '图', '-surface')}${sw(MODL.video, MOD.video, '视', '-surface')}${sw(MODL.audio, MOD.audio, '声', '-surface')}${sw(MODL.text, MOD.text, '文', '-surface')}</div>
    <div style="margin-top:10px;font-size:12px;line-height:1.6;color:${ST.risk[0]};text-decoration:line-through">只出现在五处：节点端口与连线 · 卡片四锚 · 模态丸 · 首页功能卡角标 · 素材瓦片左上类型角。</div>
    <div style="margin-top:6px;font-size:12px;line-height:1.6;color:#525252"><b>已按批注 26 改为 C：不按颜色区分模态。</b>模态只靠图标 + 文字表达；现有 --modality-* 三个 token 保留给画布端口连线（技术上区分线的归属，不作为视觉语言），其他地方全部中性灰。上面四块色板仅作废弃前记录。</div>
  </div>
  <div>
    <div class="lab" style="margin:0 0 8px">状态色 · 三档 × 两版（文字 5:1 以上；描边不承重，语义靠 图标 + 文字 + 填色）</div>
    <div style="display:flex;gap:10px">${sw(ST.applied[0], '#fff', '已应用 / 成功', '--status-applied')}${sw(ST.warning[0], '#fff', '风险 / 等待', '--status-warning')}${sw(ST.risk[0], '#fff', '失败', '--status-risk')}</div>
    <div style="display:flex;gap:10px;margin-top:10px">${sw(ST.applied[1], ST.applied[0], '已应用', '-surface')}${sw(ST.warning[1], ST.warning[0], '风险', '-surface · 新增')}${sw(ST.risk[1], ST.risk[0], '失败', '-surface · 新增（批注 53）')}</div>
    <div style="margin-top:10px;font-size:12px;line-height:1.6;color:#525252">现在只有 applied 有 -surface；risk / warning 补淡版，失败态才有「面」可用。中性：--foreground 14.5% · --muted 97% · --border 92.2% · --primary 纯黑。</div>
  </div>
</div>`

// ─── 3 · 圆角与字 ───
const radii = [['sm', 6], ['md', 8], ['lg · 基准', 10], ['xl', 14], ['2xl', 18], ['3xl', 22], ['4xl', 26]]
const radius = `<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:28px;margin-top:12px">
  <div><div class="lab" style="margin:0 0 8px">圆角七档（--radius 0.625rem 派生）· 现状不改；域档只做映射</div>
    <div style="display:flex;gap:12px;align-items:flex-end">${radii.map(([n, r]) => `<div style="text-align:center"><div style="width:64px;height:64px;border:1.5px solid ${FG};border-radius:${r}px"></div><div class="tok" style="margin-top:6px">${n}<br>${r}px</div></div>`).join('')}</div>
    <div style="margin-top:10px;font-size:12px;line-height:1.6;color:#525252">映射：节点卡 --radius-node 18px = 2xl · 壳卡 --radius-shell-card 16px ≈ xl（改 14 或保留 16，二选一，建议保留 16 并把 xl 改 16）· 缩略图 12px 介于 lg / xl（归 lg 10 或 xl）· chip 999。</div>
  </div>
  <div><div class="lab" style="margin:0 0 8px">字 · 三槽不变；字号档收成一张表</div>
    <div style="border:1px solid ${BORDER};border-radius:12px;padding:14px 16px">
      <div style="font-family:Fraunces,'Noto Serif SC',serif;font-size:26px;font-weight:500;letter-spacing:-.01em">展示槽 · 只用于空态大标题</div>
      <div style="font-size:16px;font-weight:600;margin-top:10px">标题 16 / 600</div>
      <div style="font-size:14px;margin-top:4px">正文 14 / 400 · 行高 1.5</div>
      <div style="font-size:13px;margin-top:4px">次级 13 · 卡内正文</div>
      <div style="font-size:12px;color:${MUTED};margin-top:4px">说明 12 · --muted-foreground</div>
      <div class="tok" style="margin-top:6px">等宽 11 · 只给数值 / 型号 / 快捷键 / 计数</div>
    </div>
    <div style="margin-top:10px;font-size:12px;line-height:1.6;color:#525252">删掉：11px 大写标签（首页）、font-serif 假槽残留；等宽字从 chip / 标签 / 模型名上撤下（批注 38）。</div>
  </div>
</div>`

// ─── 4 · 图标一览 ───
const groups = [
  ['节点四类', ['nodeText', 'nodeImage', 'nodeAudio', 'nodeVideo'], ['文', '图', '声', '视']],
  ['卡片四锚 + 状态', ['anchorText', 'anchorImage', 'anchorVoice', 'anchorStyle', 'cardDraft', 'cardStable'], ['文字', '图片', '声音', '风格', 'DRAFT', 'STABLE']],
  ['任务五态', ['taskQueued', 'taskCold', 'taskGenerating', 'taskArchived', 'taskFailed'], ['排队', '冷启动', '生成中', '已归档', '失败']],
  ['渠道 / key（无平台额度档，owner 2026-09-17）', ['chAuto', 'chOwnKey', 'chInvalid'], ['自动', '自己的 key', 'key 失效']],
]
const iconRow = (bg, fg) => `<div style="background:${bg};color:${fg};border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:14px">
  ${groups.map(([g, keys, labels]) => `<div><div class="lab" style="margin:0 0 8px;color:${fg === '#fff' ? '#a3a3a3' : MUTED}">${esc(g)}</div><div style="display:flex;gap:18px;flex-wrap:wrap">${keys.map((k, i) => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:64px"><div style="display:flex;gap:8px;align-items:center">${ic(k, 24)}${ic(k, 16)}</div><div style="font-size:11px;opacity:.8">${esc(labels[i])}</div></div>`).join('')}</div></div>`).join('')}
  <div><div class="lab" style="margin:0 0 8px;color:${fg === '#fff' ? '#a3a3a3' : MUTED}">与 lucide 混排（左 lucide · 右自绘）</div><div style="display:flex;gap:14px;align-items:center">${lic('plus')}${lic('search')}${lic('chevronDown')}${lic('x')}<span style="width:1px;height:20px;background:${fg};opacity:.2"></span>${ic('nodeImage')}${ic('taskGenerating')}${ic('chOwnKey')}${ic('anchorStyle')}</div></div>
</div>`
const icons = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px">${iconRow('#fff', FG).replace('border-radius:12px', `border-radius:12px;border:1px solid ${BORDER}`)}${iconRow('oklch(20% 0 0)', '#fff')}</div>
<div style="margin-top:10px;font-size:12px;line-height:1.6;color:#525252">规格：viewBox 24 · stroke 2 · round cap / join · currentColor · 16 / 20 / 24 三档。收口：Image → ImageIcon 留一 · Alert 三枚留 AlertTriangle · Loader2 全换 Spinner。</div>` +
  note(29, '这边设计感觉有点普通，我认为需要单独设计，或者使用开源的组件。以及上面这个 P 也很丑需要设计。我不希望这部分你直接做出来，而是和我讨论怎么设计。', [
    '收到，上面 19 枚只算「占位草图」，不进代码。图标与品牌标（下面这个 P）单独开一步 D1b，用 ① 反问 → ② 图 走，问题在回复里。',
    '开源候选先摆三家给你比：Phosphor（六种粗细，与 lucide 同网格，业务对象覆盖最广）· Tabler（4900+，线性，风格最接近现状）· Hugeicons / Iconoir（更圆润、有双色版）。自绘只补开源没有的业务对象。',
    '品牌标 P：现在是浅色底 + 橙棕字母，与站内中性灰 + 黑丸的语言不一致。方向要你选：字母标（重画 P 的字形与圆角）· 符号标（延续 brand-mark 四点错位的几何）· 字母 + 符号合一。',
  ]) +
  `<div style="margin-top:10px;display:flex;align-items:center;gap:12px"><img src="data:image/webp;base64,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" style="height:50px;border:1px solid ${BORDER};border-radius:8px" alt="当前浏览器标签里的 P"><span style="font-size:12px;color:${MUTED}">owner 贴的：当前标签页里的 P（favicon / 品牌标）</span></div>`

// ─── 5 · 空态模板 ───
const empty = (title, line, cta, icon) => `<div style="flex:1;min-width:260px;border:1px dashed ${BORDER};border-radius:16px;padding:36px 24px;text-align:center;background:${WORKBENCH}">
  <div style="display:inline-flex;width:40px;height:40px;border-radius:12px;background:#fff;border:1px solid ${BORDER};align-items:center;justify-content:center;color:${MUTED}">${icon}</div>
  <div style="font-family:Fraunces,'Noto Serif SC',serif;font-size:22px;font-weight:500;margin-top:14px;letter-spacing:-.01em">${esc(title)}</div>
  <div style="font-size:13px;color:#525252;margin-top:6px;line-height:1.5">${esc(line)}</div>
  <div style="display:inline-flex;margin-top:16px;padding:8px 14px;border-radius:999px;background:${FG};color:#fff;font-size:13px;font-weight:500">${esc(cta)}</div>
</div>`
const empties = `<div style="display:flex;gap:14px;margin-top:12px;flex-wrap:wrap">
  ${empty('先配一把 key', '选好模型后，这里会出第一张图。缺 key 的模型点了就能就地配置。', '配置 key 并生成', ic('chOwnKey'))}
  ${empty('这个项目还是空的', '双击画布加一张卡，或者把图片、视频直接拖进来。', '＋ 添加第一张卡', ic('nodeImage'))}
  ${empty('文件夹里还没有素材', '从素材库拖进来，或在这里上传。', '上传', lic('plus'))}
</div>
<div style="margin-top:10px;font-size:12px;line-height:1.6;color:#525252">结构固定：图标位（24，中性灰）→ 展示槽标题（22 / Fraunces，全站唯一应用内用法）→ 一句话（13）→ 一枚主动作（黑丸）→ 可选次动作链接。不放插画（C），LoRA training/EmptyState 的 SVG 删除。</div>`

const VISUAL = header('PixelVault · D1 ④ · 视觉语言总板 · 2026-09-17', '视觉语言 · 一张板定全站', '按 D1 决策树落成实际尺寸：四层材质与四档阴影、四色 × 两版 + 三档状态、圆角七档与字号表、19 枚自绘图标（浅 / 深底、16 / 24、与 lucide 混排）、空态模板。全部值取自 globals.css 现有 token，新增只有 --modality-text、两枚 -surface 和四个阴影别名。右侧「场景板」把它套到三个真实组件上。') +
  sec('1 · 材质四层与阴影收口', '11 个 token → 4 个') + layers +
  note(24, '没问题', ['四层材质与四档阴影收口 · 通过。']) +
  sec('2 · 色', '状态三档 × 两版 · 模态色废弃（批注 26）') + colors + note(27, '这三个没问题', ['状态三档 · 通过。']) +
  sec('3 · 圆角与字') + radius + note(28, '确认，没问题', ['圆角与字号表 · 通过。']) +
  sec('4 · 图标一览', '19 枚自绘 · 与 lucide 同网格') + icons +
  sec('5 · 空态模板 C') + empties + note(31, '这边没问题', ['空态模板 C · 通过。'])

// ═══ 场景板 ═══
const chip = (t, opts = {}) => `<span style="display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:999px;border:1px solid ${BORDER};background:${opts.bg || '#fff'};font-size:12.5px;color:${opts.color || FG}">${opts.icon || ''}${esc(t)}${opts.caret ? lic('chevronDown', 16, MUTED) : ''}</span>`
const scenePicker = `<div style="width:380px;background:#fff;border:1px solid ${BORDER};border-radius:12px;box-shadow:${SH.overlay};padding:6px">
  <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:${MUTEDBG};color:${MUTED};font-size:12.5px">${lic('search', 16)}搜型号…</div>
  <div class="lab" style="margin:10px 8px 4px">最近</div>
  ${[
    ['GPT Image', '2.5 Flare', '$0.04 / 张', true],
    ['Seedream', '5.0 Pro', '$0.03 / 张', false],
    ['Kling', 'O3 Pro', '缺 key', false],
  ].map(([m, v, p, sel]) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;background:${sel ? MUTEDBG : 'transparent'}"><div style="flex:1;min-width:0;display:flex;align-items:baseline;gap:8px"><span style="font-size:13px;font-weight:500">${esc(m)}</span><span style="font-size:13px;color:#525252">${esc(v)}</span></div><span class="tok" style="color:${p === '缺 key' ? ST.warning[0] : MUTED}">${esc(p)}</span>${sel ? `<span style="color:${FG}">${'<svg class="ic s16" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'}</span>` : ''}</div>`).join('')}
</div>`
const sceneNode = `<div style="width:340px;background:#fff;border:1px solid ${BORDER};border-radius:18px;box-shadow:${SH.card};overflow:hidden">
  <div style="display:flex;align-items:center;gap:8px;padding:10px 12px"><div style="width:22px;height:22px;border-radius:7px;background:${MODL.video};display:flex;align-items:center;justify-content:center">${ic('nodeVideo', 16, MOD.video)}</div><div style="font-size:13px;font-weight:600;letter-spacing:-.012em;flex:1">镜头 03 · 雨夜街角</div><span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:${ST.warning[0]};background:${ST.warning[1]};padding:2px 7px;border-radius:999px">${ic('taskGenerating', 16, ST.warning[0])}生成中 · 42s</span></div>
  <div style="margin:0 12px;aspect-ratio:16/9;border-radius:12px;background:linear-gradient(135deg,#d9d9d6,#bfbfbb);position:relative;overflow:hidden"><div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent 0,rgba(255,255,255,.35) 50%,transparent 100%);width:40%;left:30%"></div><div style="position:absolute;left:0;right:0;bottom:0;height:3px;background:${BORDER}"><div style="width:62%;height:100%;background:${FG}"></div></div></div>
  <div style="height:12px"></div>
</div>`
const sceneTile = `<div style="width:220px"><div style="position:relative;aspect-ratio:1;border-radius:12px;background:linear-gradient(160deg,#e6e2f2,#cfc7e6);overflow:hidden;border:1px solid ${BORDER}">
  <div style="position:absolute;left:8px;top:8px;width:22px;height:22px;border-radius:7px;${GLASS}display:flex;align-items:center;justify-content:center">${ic('nodeImage', 16, MOD.image)}</div>
  <div style="position:absolute;right:8px;top:8px;width:22px;height:22px;border-radius:7px;${GLASS}display:flex;align-items:center;justify-content:center;color:${MUTED}"><svg class="ic s16" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="18" r="1.2" fill="currentColor"/></svg></div>
  <div style="position:absolute;left:8px;bottom:8px;display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;${GLASS}font-size:11px;color:${ST.applied[0]}">${ic('cardStable', 16, ST.applied[0])}来自卡 · 小雅</div>
</div><div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px;color:#525252"><span>雨夜 · 定妆 02</span><span class="tok">1024²</span></div></div>`
const SCENES = header('PixelVault · D1 ④ · 场景套用 · 2026-09-17', '同一套语言套到三个真实组件', '目的只有一个：看自绘图标与 lucide 混排、四层阴影、模态色与状态色在真实密度下是否成立。这三块也是 D2 / D6 / D5 的起点，不是终稿。') +
  sec('模型选择器一行（D2 起点）', '弹层 = ④ 实底 + shadow-overlay；渠道 / key 态用自绘图标；缺 key 行用 warning 色不用红') +
  `<div style="display:flex;gap:28px;margin-top:12px;align-items:flex-start;background:${WORKBENCH};padding:22px;border-radius:16px">${scenePicker}<div style="font-size:12.5px;line-height:1.7;color:#525252;max-width:420px">· 已按批注 32 精简：一行只有 模型 · 型号 · 价格 三件；缺 key 的价格位写「缺 key」。<br>· 渠道 / key 态、专属能力从行里拿掉，放去哪（hover？行右侧小图标？弹层底部？）留到 D2 ① 反问。<br>· 选中态只用 --muted 底 + 对勾。</div></div>` + note(32, '信息太多，跟之前讨论的不一样。只需要模型、模型型号、价格。', ['已改成三件；第二行整体删除。', '渠道段那一行也拿掉了，D2 反问里问它去哪。']) +
  sec('画布视频节点卡（D7 / 节点视觉基线）', '卡 = ② shadow-card · 圆角 18 = 2xl · 任务态徽章用 warning 两版 · 三颗 chip 变两颗（12 规格合一）') +
  `<div style="display:flex;gap:28px;margin-top:12px;align-items:flex-start;background:${SUNKEN};padding:22px;border-radius:16px">${sceneNode}<div style="font-size:12.5px;line-height:1.7;color:#525252;max-width:440px">· 已按批注 33 减到 视频 + 名字（+ 生成中徽章作任务态最小形态）。<br>· chip 行与参考行全部拿掉；参数、参考、模型都在展开态或右键里，收起态只看画面。<br>· 标题行图标暂用占位，随 D1b 图标结论替换。</div></div>` + note(33, '差不多了，不用改太多，只需要保留视频和名字。', ['已改。']) +
  sec('素材瓦片（D5 起点）· 按批注 34 先不设计，等画布阶段', '下面保留作占位') +
  `<div style="display:flex;gap:28px;margin-top:12px;align-items:flex-start;background:#fff;border:1px solid ${BORDER};padding:22px;border-radius:16px">${sceneTile}<div style="font-size:12.5px;line-height:1.7;color:#525252;max-width:440px">批注 34：先不设计，等到画布（D7）时一起。此块不作为 D5 输入。</div></div>` + note(34, '这边先不设计。等到画布的时候再去设计。', ['收到，从 D5 拿掉，挂到 D7。'])

for (const [name, html] of [
  ['VisualLanguage.dc.html', page('视觉语言总板', VISUAL)],
  ['VisualScenes.dc.html', page('场景套用', SCENES)],
]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
